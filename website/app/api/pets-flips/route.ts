import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const AH_TAX = 0.02
const COFLNET = 'https://sky.coflnet.com/api'
const TIER_BOOST_ID = 'PET_ITEM_TIER_BOOST'

// ── Kat upgrade costs ────────────────────────────────────────────────────────
// Source: https://hypixel-skyblock.fandom.com/wiki/Kat
// Cost structure: { coins, [bazaar_item_id]: qty }
// Coins are paid to Kat directly. Items are sourced from bazaar (insta-buy).
// Each entry = cost to upgrade FROM that rarity to the next rarity up.
// Rarity order: COMMON → UNCOMMON → RARE → EPIC → LEGENDARY

// Accurate Kat upgrade costs from the wiki per rarity tier.
// Items sourced from bazaar at insta-buy price.
// Format: fromRarity → { coins, items: [{id, qty}] }
// Source: https://hypixel-skyblock.fandom.com/wiki/Kat
const KAT_UPGRADE: Record<string, { coins: number; items: Array<{ id: string; qty: number }> }> = {
  COMMON: {
    coins: 300,
    items: [],                // no item cost at Common→Uncommon
  },
  UNCOMMON: {
    coins: 1_500,
    items: [],                // no item cost at Uncommon→Rare
  },
  RARE: {
    coins: 3_000,
    items: [{ id: 'REFINED_AMBER', qty: 4 }],  // Rare→Epic needs Refined Amber
  },
  EPIC: {
    coins: 6_000,
    items: [{ id: 'KATANA_SHARD', qty: 1 }],   // Epic→Legendary needs Katana Shard
  },
}

// Tier Boost: bazaar item, instantly upgrades pet rarity by 1 tier
// Works on COMMON → UNCOMMON → RARE → EPIC → LEGENDARY → MYTHIC

const NEXT_RARITY: Record<string, string> = {
  COMMON:    'UNCOMMON',
  UNCOMMON:  'RARE',
  RARE:      'EPIC',
  EPIC:      'LEGENDARY',
  LEGENDARY: 'MYTHIC',
}

const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']

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
  'PET_TARANTULA','PET_BLACK_CAT','PET_RAT','PET_TURTLE',
  'PET_HEDGEHOG','PET_AMMONITE','PET_SNAIL','PET_SPINOSAURUS',
]

export type FlipStrategy = 'KAT_UPGRADE' | 'TIER_BOOST'

export interface KatFlipRow {
  tag: string
  name: string
  strategy: FlipStrategy
  buyRarity: string
  sellRarity: string
  iconUrl: string
  buyPrice: number          // lowest BIN at buyRarity
  katCoins: number          // Kat NPC coin cost (0 for Tier Boost)
  itemCost: number          // bazaar cost of Kat ingredient items (0 for Tier Boost)
  tierBoostCost: number     // cost of Tier Boost item (0 for Kat upgrade)
  totalCost: number         // buyPrice + katCoins + itemCost + tierBoostCost
  sellPrice: number         // median BIN at sellRarity after 2% AH tax
  profit: number
  roi: number
  buyVolume: number
  sellVolume: number
  katIngredients: Array<{ id: string; name: string; qty: number; unitPrice: number }>
}

function petName(tag: string): string {
  return tag.replace(/^PET_/, '').replace(/_/g, ' ')
    .split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function petIconUrl(tag: string, rarity: string): string {
  return `https://sky.shiiyu.moe/item/${tag}?rarity=${rarity.toLowerCase()}`
}

function itemName(id: string): string {
  return id.replace(/_/g, ' ').split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
}

async function fetchSold(tag: string): Promise<Array<{
  itemName: string; tier: string; highestBidAmount: number; bin: boolean
}>> {
  try {
    const r = await fetch(`${COFLNET}/auctions/tag/${tag}/sold?limit=200`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

async function compute(): Promise<{ rows: KatFlipRow[]; tierBoostCost: number }> {
  // Fetch bazaar for Tier Boost + Kat ingredient prices
  const bazRes = await fetch('https://api.hypixel.net/skyblock/bazaar', {
    signal: AbortSignal.timeout(15000),
  })
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  const baz = await bazRes.json()
  const products = baz.products as Record<string, { quick_status: { buyPrice: number; sellPrice: number } }>

  const tierBoostCost: number = products[TIER_BOOST_ID]?.quick_status?.buyPrice ?? 0

  // Pre-compute Kat ingredient bazaar prices
  const katItemPrices: Record<string, number> = {}
  for (const fromRarity of RARITIES) {
    const upgrade = KAT_UPGRADE[fromRarity]
    if (!upgrade) continue
    for (const item of upgrade.items) {
      if (item.qty > 0 && !katItemPrices[item.id]) {
        katItemPrices[item.id] = products[item.id]?.quick_status?.buyPrice ?? 0
      }
    }
  }

  const rows: KatFlipRow[] = []
  const BATCH = 8

  for (let i = 0; i < PET_TAGS.length; i += BATCH) {
    const batch = PET_TAGS.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (tag): Promise<KatFlipRow[]> => {
        const sold = await fetchSold(tag)
        if (!sold.length) return []

        // Build price map: rarity → { buy: lowest lvl1 BIN, sell: median lvlMax BIN, vols }
        const byRarity: Record<string, { lvl1: number[]; lvlMax: number[] }> = {}
        for (const sale of sold) {
          if (!sale.bin) continue
          const tier = sale.tier
          if (!RARITIES.includes(tier) && tier !== 'MYTHIC') continue
          if (!byRarity[tier]) byRarity[tier] = { lvl1: [], lvlMax: [] }
          if (sale.itemName.match(/\[Lvl 1\]/))              byRarity[tier].lvl1.push(sale.highestBidAmount)
          else if (sale.itemName.match(/\[Lvl 10[0-9]\]/))  byRarity[tier].lvlMax.push(sale.highestBidAmount)
        }

        const priceMap: Record<string, { buy: number; sell: number; buyVol: number; sellVol: number }> = {}
        for (const [tier, data] of Object.entries(byRarity)) {
          if (data.lvl1.length < 2) continue
          const buy  = Math.min(...data.lvl1)
          const sell = data.lvlMax.length > 0 ? median(data.lvlMax) * (1 - AH_TAX) : 0
          priceMap[tier] = { buy, sell, buyVol: data.lvl1.length, sellVol: data.lvlMax.length }
        }

        const petRows: KatFlipRow[] = []

        for (const fromRarity of RARITIES) {
          const toRarity = NEXT_RARITY[fromRarity]
          if (!toRarity) continue
          const buyData  = priceMap[fromRarity]
          const sellData = priceMap[toRarity]
          if (!buyData || !sellData || buyData.buy <= 0 || sellData.sell <= 0) continue
          if (sellData.sellVol < 1) continue

          // ── Strategy A: Kat upgrade ────────────────────────────────────────
          const upgrade = KAT_UPGRADE[fromRarity]
          if (upgrade) {
            let itemCost = 0
            const katIngredients: KatFlipRow['katIngredients'] = []
            for (const item of upgrade.items) {
              if (item.qty <= 0) continue
              const unitPrice = katItemPrices[item.id] ?? 0
              if (unitPrice <= 0) continue
              const totalItemCost = unitPrice * item.qty
              itemCost += totalItemCost
              katIngredients.push({ id: item.id, name: itemName(item.id), qty: item.qty, unitPrice })
            }
            const totalCost = buyData.buy + upgrade.coins + itemCost
            const profit    = sellData.sell - totalCost
            if (profit > 0) {
              petRows.push({
                tag, name: petName(tag), strategy: 'KAT_UPGRADE',
                buyRarity: fromRarity, sellRarity: toRarity,
                iconUrl: petIconUrl(tag, fromRarity),
                buyPrice: Math.round(buyData.buy),
                katCoins: upgrade.coins,
                itemCost: Math.round(itemCost),
                tierBoostCost: 0,
                totalCost: Math.round(totalCost),
                sellPrice: Math.round(sellData.sell),
                profit: Math.round(profit),
                roi: Math.round((profit / totalCost) * 10000) / 100,
                buyVolume: buyData.buyVol,
                sellVolume: sellData.sellVol,
                katIngredients,
              })
            }
          }

          // ── Strategy B: Tier Boost ─────────────────────────────────────────
          if (tierBoostCost > 0) {
            const totalCost = buyData.buy + tierBoostCost
            const profit    = sellData.sell - totalCost
            if (profit > 0) {
              petRows.push({
                tag, name: petName(tag), strategy: 'TIER_BOOST',
                buyRarity: fromRarity, sellRarity: toRarity,
                iconUrl: petIconUrl(tag, fromRarity),
                buyPrice: Math.round(buyData.buy),
                katCoins: 0,
                itemCost: 0,
                tierBoostCost: Math.round(tierBoostCost),
                totalCost: Math.round(buyData.buy + tierBoostCost),
                sellPrice: Math.round(sellData.sell),
                profit: Math.round(profit),
                roi: Math.round((profit / (buyData.buy + tierBoostCost)) * 10000) / 100,
                buyVolume: buyData.buyVol,
                sellVolume: sellData.sellVol,
                katIngredients: [],
              })
            }
          }
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
    return NextResponse.json(cachedResult, { headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'HIT' } })
  }
  try {
    const result = await compute()
    cachedResult = result
    cacheTime = Date.now()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'MISS' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
