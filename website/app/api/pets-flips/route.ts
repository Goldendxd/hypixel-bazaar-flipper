import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const AH_TAX = 0.02

// Coflnet API for AH sold data
const COFLNET = 'https://sky.coflnet.com/api'

// Tier Boost item bazaar ID — applies to pets only, upgrades rarity by 1 tier
const TIER_BOOST_ID = 'PET_ITEM_TIER_BOOST'

// All known pet tags
const PET_TAGS = [
  'PET_WOLF','PET_TIGER','PET_LION','PET_CHEETAH','PET_LYNX',
  'PET_ELEPHANT','PET_GIRAFFE','PET_HORSE','PET_DONKEY','PET_MULE',
  'PET_BEE','PET_BUTTERFLY','PET_PARROT','PET_PENGUIN','PET_PHOENIX',
  'PET_EAGLE','PET_BABY_YETI','PET_BLUE_WHALE','PET_DOLPHIN','PET_SQUID',
  'PET_FLYING_FISH','PET_MEGALODON','PET_JELLYFISH','PET_OCELOT',
  'PET_RABBIT','PET_SHEEP','PET_PIG','PET_CHICKEN','PET_COW',
  'PET_MOOSHROOM_COW','PET_SILVERFISH','PET_SPIDER','PET_BAT',
  'PET_BLAZE','PET_ENDERMAN','PET_ENDERMITE','PET_GHAST','PET_GOLEM',
  'PET_GUARDIAN','PET_HOUND','PET_MAGMA_CUBE','PET_SKELETON','PET_SKELETON_HORSE',
  'PET_SLIME','PET_SNOWMAN','PET_SPIRIT','PET_WITHER_SKELETON','PET_ZOMBIE',
  'PET_ZOMBIE_KNIGHT','PET_GRIFFIN','PET_WITHER','PET_ENDER_DRAGON',
  'PET_SCATHA','PET_ROCK','PET_ARMADILLO','PET_SLUG','PET_STORMY',
  'PET_TARANTULA','PET_BLACK_CAT','PET_RAT','PET_GRINCH','PET_TURTLE',
  'PET_HEDGEHOG','PET_AMMONITE','PET_SNAIL','PET_SPINOSAURUS',
]

// Rarity order — Tier Boost upgrades to the next tier
const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC']
const NEXT_RARITY: Record<string, string> = {
  COMMON:    'UNCOMMON',
  UNCOMMON:  'RARE',
  RARE:      'EPIC',
  EPIC:      'LEGENDARY',
  LEGENDARY: 'MYTHIC',
}

export type FlipType = 'TIER_BOOST' | 'RARITY_ARBITRAGE'

export interface PetFlipRow {
  tag: string
  name: string
  flipType: FlipType
  buyRarity: string       // rarity of the pet you buy
  sellRarity: string      // rarity of the pet you sell
  iconUrl: string
  buyPrice: number        // lowest BIN at buyRarity
  tierBoostCost: number   // 0 if rarity arbitrage, else bazaar insta-buy price
  totalCost: number       // buyPrice + tierBoostCost
  sellPrice: number       // median BIN at sellRarity after 2% tax
  profit: number
  roi: number
  buyVolume: number       // recent sales at buyRarity
  sellVolume: number      // recent sales at sellRarity
}

function petName(tag: string): string {
  return tag.replace(/^PET_/, '').replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function petIconUrl(tag: string, rarity: string): string {
  // sky.shiiyu.moe returns the actual Hypixel Skyblock pet texture
  const rarityParam = rarity.toLowerCase()
  return `https://sky.shiiyu.moe/item/${tag}?rarity=${rarityParam}`
}

async function fetchSold(tag: string): Promise<Array<{
  itemName: string
  tier: string
  highestBidAmount: number
  bin: boolean
}>> {
  try {
    const r = await fetch(`${COFLNET}/auctions/tag/${tag}/sold?limit=200`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

async function compute(): Promise<{ rows: PetFlipRow[]; tierBoostCost: number }> {
  // Fetch bazaar for Tier Boost price
  const bazRes = await fetch('https://api.hypixel.net/skyblock/bazaar', {
    signal: AbortSignal.timeout(15000),
  })
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  const baz = await bazRes.json()

  const tierBoostProduct = baz.products?.[TIER_BOOST_ID]
  // Use insta-buy price (buyPrice = lowest sell order you can fill immediately)
  const tierBoostCost: number = tierBoostProduct?.quick_status?.buyPrice ?? 0

  const rows: PetFlipRow[] = []
  const BATCH = 8

  for (let i = 0; i < PET_TAGS.length; i += BATCH) {
    const batch = PET_TAGS.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (tag): Promise<PetFlipRow[]> => {
        const sold = await fetchSold(tag)
        if (!sold.length) return []

        // Group BIN sales by rarity, split into lvl 1 vs lvl 100
        const byRarity: Record<string, { lvl1: number[]; lvlMax: number[] }> = {}
        for (const sale of sold) {
          if (!sale.bin) continue
          const tier = sale.tier
          if (!RARITIES.includes(tier)) continue
          if (!byRarity[tier]) byRarity[tier] = { lvl1: [], lvlMax: [] }
          if (sale.itemName.includes('[Lvl 1]')) {
            byRarity[tier].lvl1.push(sale.highestBidAmount)
          } else if (sale.itemName.match(/\[Lvl 10[0-9]\]/)) {
            byRarity[tier].lvlMax.push(sale.highestBidAmount)
          }
        }

        const petRows: PetFlipRow[] = []

        // Build price map: rarity → {buy: lowest lvl1 BIN, sell: median lvlMax BIN, vols}
        const priceMap: Record<string, { buy: number; sell: number; buyVol: number; sellVol: number }> = {}
        for (const [tier, data] of Object.entries(byRarity)) {
          if (data.lvl1.length < 2) continue
          const buy = Math.min(...data.lvl1)
          const sell = median(data.lvlMax)
          priceMap[tier] = {
            buy,
            sell: sell > 0 ? sell * (1 - AH_TAX) : 0,
            buyVol: data.lvl1.length,
            sellVol: data.lvlMax.length,
          }
        }

        // Strategy 1: TIER BOOST FLIP
        // Buy pet at rarity R, apply Tier Boost → sells as rarity R+1
        // The boosted pet sells at the price of a natural R+1 pet
        if (tierBoostCost > 0) {
          for (const rarity of RARITIES) {
            const nextRarity = NEXT_RARITY[rarity]
            if (!nextRarity) continue
            const buyData = priceMap[rarity]
            const sellData = priceMap[nextRarity]
            if (!buyData || !sellData || buyData.buy <= 0 || sellData.sell <= 0) continue
            if (sellData.sellVol < 1) continue

            const totalCost = buyData.buy + tierBoostCost
            const profit = sellData.sell - totalCost
            if (profit <= 0) continue

            const roi = Math.round((profit / totalCost) * 10000) / 100

            petRows.push({
              tag,
              name: petName(tag),
              flipType: 'TIER_BOOST',
              buyRarity: rarity,
              sellRarity: nextRarity,
              iconUrl: petIconUrl(tag, rarity),
              buyPrice: Math.round(buyData.buy),
              tierBoostCost: Math.round(tierBoostCost),
              totalCost: Math.round(totalCost),
              sellPrice: Math.round(sellData.sell),
              profit: Math.round(profit),
              roi,
              buyVolume: buyData.buyVol,
              sellVolume: sellData.sellVol,
            })
          }
        }

        // Strategy 2: RARITY ARBITRAGE
        // If the gap between rarity prices is large enough to profit without Tier Boost
        // This catches cases where e.g. a RARE pet's lvl 1 BIN is far cheaper than
        // buying a natural RARE and immediately selling at EPIC price is not the play —
        // instead this is for pets where there's a lvl 1 → lvl max price gap within
        // the SAME rarity that is profitable just by buying cheap and relisting.
        // True rarity arbitrage: same rarity, different levels
        for (const rarity of RARITIES) {
          const data = priceMap[rarity]
          if (!data || data.buy <= 0 || data.sell <= 0) continue
          if (data.sellVol < 1) continue

          const profit = data.sell - data.buy
          if (profit <= 0) continue

          // Only show as arbitrage if NOT already covered by tier boost for same rarity pair
          // and profit margin is at least 5%
          const roi = Math.round((profit / data.buy) * 10000) / 100
          if (roi < 5) continue

          petRows.push({
            tag,
            name: petName(tag),
            flipType: 'RARITY_ARBITRAGE',
            buyRarity: rarity,
            sellRarity: rarity,
            iconUrl: petIconUrl(tag, rarity),
            buyPrice: Math.round(data.buy),
            tierBoostCost: 0,
            totalCost: Math.round(data.buy),
            sellPrice: Math.round(data.sell),
            profit: Math.round(profit),
            roi,
            buyVolume: data.buyVol,
            sellVolume: data.sellVol,
          })
        }

        return petRows
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled') rows.push(...r.value)
    }
  }

  rows.sort((a, b) => b.profit - a.profit)
  return { rows, tierBoostCost }
}

export async function GET() {
  const now = Date.now()
  if (cachedResult && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedResult, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'HIT' },
    })
  }
  try {
    const result = await compute()
    cachedResult = result
    cacheTime = Date.now()
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'MISS' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
