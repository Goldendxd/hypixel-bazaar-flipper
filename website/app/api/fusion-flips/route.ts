import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000 // 1 minute — shard prices move fast

const TAX = 0.0125

interface ShardEntry {
  name: string
  family: string
  type: string
  rarity: string
  fuse_amount: number
  internal_id: string
}

interface FusionData {
  shards: Record<string, ShardEntry>
  recipes: Record<string, Record<string, [string, string][]>>
}

export interface FusionFlipRow {
  id: string
  name: string
  rarity: string
  iconUrl: string
  sellPrice: number
  inputCost: number
  profitPerFusion: number
  margin: number
  totalProfit: number
  outputQty: number      // shards produced per fusion
  fusesIn10M: number
  weeklyVolume: number
  fillScore: number
  input1: { id: string; name: string; rarity: string; qty: number; unitPrice: number; iconUrl: string }
  input2: { id: string; name: string; rarity: string; qty: number; unitPrice: number; iconUrl: string }
}

// Build reverse map: internal_id -> shortId for skyshards.com icon CDN
// skyshards.com/shardIcons/{shortId}.png is the only working icon source for Galatea shards
function buildReverseShardMap(shards: Record<string, ShardEntry>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [shortId, shard] of Object.entries(shards)) {
    map[shard.internal_id] = shortId
  }
  return map
}

function shardIconUrl(internalId: string, reverseMap: Record<string, string>): string {
  const shortId = reverseMap[internalId]
  if (shortId) return `https://skyshards.com/shardIcons/${shortId}.png`
  return `https://sky.shiiyu.moe/api/item/${internalId}`
}

async function computeFlips(): Promise<{ rows: FusionFlipRow[]; totalShards: number }> {
  const [fusionRes, bazRes] = await Promise.all([
    fetch('https://raw.githubusercontent.com/Campionnn/SkyShards/master/public/fusion-data.json', {
      signal: AbortSignal.timeout(15000),
    }),
    fetch('https://api.hypixel.net/skyblock/bazaar', {
      signal: AbortSignal.timeout(15000),
    }),
  ])

  if (!fusionRes.ok) throw new Error('Fusion data fetch failed')
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')

  const fusionData: FusionData = await fusionRes.json()
  const bazData = await bazRes.json()

  const products = bazData.products as Record<string, { quick_status: { buyPrice: number; sellPrice: number; buyMovingWeek: number; sellMovingWeek: number; buyOrders: number; sellOrders: number } }>

  const buyPrices: Record<string, number> = {}
  const sellBids: Record<string, number> = {}
  const weeklyVols: Record<string, number> = {}
  const buyOrders: Record<string, number> = {}
  const sellOrders: Record<string, number> = {}

  for (const [id, p] of Object.entries(products)) {
    const q = p.quick_status
    buyPrices[id] = q.buyPrice
    sellBids[id] = q.sellPrice
    weeklyVols[id] = q.buyMovingWeek
    buyOrders[id] = q.buyOrders
    sellOrders[id] = q.sellOrders
  }

  const maxVol = Math.max(...Object.values(weeklyVols), 1)

  const { shards, recipes } = fusionData

  // Build reverse map for correct shard icon URLs
  const reverseShardMap = buildReverseShardMap(shards)

  // Build short_id -> shard info + prices map
  const shardMap: Record<string, ShardEntry & { buy: number; sell: number }> = {}
  for (const [shortId, shard] of Object.entries(shards)) {
    const iid = shard.internal_id
    shardMap[shortId] = {
      ...shard,
      buy: buyPrices[iid] ?? 0,
      sell: sellBids[iid] ?? 0,
    }
  }

  const rows: FusionFlipRow[] = []
  const seen = new Set<string>() // track best combo per output

  for (const [outputShortId, recipeSlots] of Object.entries(recipes)) {
    const out = shardMap[outputShortId]
    if (!out || out.sell <= 0) continue

    const sellOrder = Math.round((out.sell - 0.1) * 100) / 100

    // Try every combo in every slot, pick the one with best profit
    let bestFlip: FusionFlipRow | null = null

    for (const [slotKey, combos] of Object.entries(recipeSlots)) {
      const outputQty = parseInt(slotKey, 10) || 1 // slot key = how many output shards produced
      for (const combo of combos) {
        if (combo.length !== 2) continue
        const [in1Id, in2Id] = combo
        const in1 = shardMap[in1Id]
        const in2 = shardMap[in2Id]
        if (!in1 || !in2 || in1.buy <= 0 || in2.buy <= 0) continue

        // fuse_amount on each input shard = qty of that shard needed per fusion
        const in1Qty = in1.fuse_amount
        const in2Qty = in2.fuse_amount
        const inputCost = Math.round((in1.buy * in1Qty + in2.buy * in2Qty) * 100) / 100
        // revenue = sell all outputQty shards after tax
        const revenue = Math.round(sellOrder * outputQty * (1 - TAX) * 100) / 100
        const profitPerFusion = Math.round((revenue - inputCost) * 100) / 100
        if (profitPerFusion <= 0) continue

        const margin = Math.round((profitPerFusion / inputCost) * 10000) / 100

        const wVol = weeklyVols[out.internal_id] ?? 0
        const volScore = Math.min(100, (wVol / maxVol) * 100)
        const depth = (buyOrders[out.internal_id] ?? 0) + (sellOrders[out.internal_id] ?? 0)
        const depthPenalty = Math.min(100, (depth / 200) * 100)
        const fillScore = Math.round(volScore * 0.7 + (100 - depthPenalty) * 0.3)

        const fusesIn10M = Math.max(1, Math.floor(10_000_000 / inputCost))
        const totalProfit = Math.round(profitPerFusion * fusesIn10M * 100) / 100

        const candidate: FusionFlipRow = {
          id: out.internal_id,
          name: out.name,
          rarity: out.rarity,
          iconUrl: shardIconUrl(out.internal_id, reverseShardMap),
          sellPrice: sellOrder,
          inputCost,
          profitPerFusion,
          margin,
          totalProfit,
          outputQty,
          fusesIn10M,
          weeklyVolume: wVol,
          fillScore,
          input1: {
            id: in1.internal_id,
            name: in1.name,
            rarity: in1.rarity,
            qty: in1Qty,
            unitPrice: Math.round(in1.buy * 100) / 100,
            iconUrl: shardIconUrl(in1.internal_id, reverseShardMap),
          },
          input2: {
            id: in2.internal_id,
            name: in2.name,
            rarity: in2.rarity,
            qty: in2Qty,
            unitPrice: Math.round(in2.buy * 100) / 100,
            iconUrl: shardIconUrl(in2.internal_id, reverseShardMap),
          },
        }

        if (!bestFlip || candidate.totalProfit > bestFlip.totalProfit) {
          bestFlip = candidate
        }
      }
    }

    if (bestFlip && !seen.has(bestFlip.id)) {
      seen.add(bestFlip.id)
      rows.push(bestFlip)
    }
  }

  rows.sort((a, b) => b.totalProfit - a.totalProfit)
  return { rows, totalShards: Object.keys(shards).length }
}

export async function GET() {
  const now = Date.now()
  if (cachedResult && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedResult, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'HIT' },
    })
  }

  try {
    const result = await computeFlips()
    cachedResult = result
    cacheTime = Date.now()
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'MISS' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
