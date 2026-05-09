import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000 // 1 min — AH prices shift fast

const AH_TAX = 0.02 // 2% AH tax
const COFLNET = 'https://sky.coflnet.com/api'

// XP needed to reach level 100 per rarity (from Hypixel SkyBlock wiki)
const XP_TO_MAX: Record<string, number> = {
  COMMON:    5_625_325,
  UNCOMMON:  10_624_800,
  RARE:      25_624_785,
  EPIC:      60_624_700,
  LEGENDARY: 210_255_385,
}

// Pet max levels per rarity
const MAX_LEVEL: Record<string, number> = {
  COMMON: 100, UNCOMMON: 100, RARE: 100, EPIC: 100, LEGENDARY: 100,
}

// All known pet tags (actual pets, not skins/items)
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

const RARITIES = ['LEGENDARY', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON']

export interface PetFlipRow {
  tag: string
  name: string
  rarity: string
  iconUrl: string
  lvl1Price: number      // median BIN price for lvl 1
  lvl100Price: number    // median BIN price for lvl 100
  levelingCost: number   // cost of EXP_BOTTLEs to level 1→100
  totalCost: number      // lvl1 + leveling
  sellPrice: number      // lvl100 after 2% AH tax
  profit: number
  roi: number            // profit / totalCost * 100
  lvl1Volume: number     // # recent lvl1 sales
  lvl100Volume: number
}

function petName(tag: string): string {
  return tag.replace(/^PET_/, '').replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

async function fetchSold(tag: string): Promise<Array<{ itemName: string; tier: string; highestBidAmount: number; bin: boolean }>> {
  try {
    const r = await fetch(`${COFLNET}/auctions/tag/${tag}/sold?limit=200`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

async function computeFlips(expBottlePrice: number): Promise<PetFlipRow[]> {
  const BATCH = 8
  const rows: PetFlipRow[] = []

  for (let i = 0; i < PET_TAGS.length; i += BATCH) {
    const batch = PET_TAGS.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (tag) => {
        const sold = await fetchSold(tag)
        if (!sold.length) return null

        const rows: PetFlipRow[] = []

        for (const rarity of RARITIES) {
          const bins = sold.filter(x => x.bin && x.tier === rarity)
          if (bins.length < 3) continue

          const lvl1sales = bins.filter(x => x.itemName.includes('[Lvl 1]'))
          const lvl100sales = bins.filter(x => x.itemName.includes('[Lvl 100]'))

          if (lvl1sales.length < 2 || lvl100sales.length < 1) continue

          const lvl1Price = median(lvl1sales.map(x => x.highestBidAmount))
          const lvl100Price = median(lvl100sales.map(x => x.highestBidAmount))
          if (lvl1Price <= 0 || lvl100Price <= 0) continue

          const xp = XP_TO_MAX[rarity] ?? XP_TO_MAX.LEGENDARY
          // Use EXP_BOTTLE (cheapest per XP): 160 XP each
          const bottlesNeeded = Math.ceil(xp / 160)
          const levelingCost = Math.round(bottlesNeeded * expBottlePrice)
          const totalCost = lvl1Price + levelingCost
          const sellPrice = Math.round(lvl100Price * (1 - AH_TAX))
          const profit = sellPrice - totalCost
          if (profit <= 0) continue

          const roi = Math.round((profit / totalCost) * 10000) / 100

          rows.push({
            tag,
            name: petName(tag),
            rarity,
            iconUrl: `https://sky.coflnet.com/static/icon/${tag}`,
            lvl1Price,
            lvl100Price,
            levelingCost,
            totalCost,
            sellPrice,
            profit,
            roi,
            lvl1Volume: lvl1sales.length,
            lvl100Volume: lvl100sales.length,
          })
        }

        return rows
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) rows.push(...r.value)
    }
  }

  rows.sort((a, b) => b.profit - a.profit)
  return rows
}

async function compute(): Promise<{ rows: PetFlipRow[]; expBottlePrice: number }> {
  const bazRes = await fetch('https://api.hypixel.net/skyblock/bazaar', {
    signal: AbortSignal.timeout(15000),
  })
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  const baz = await bazRes.json()
  const expBottlePrice: number = baz.products?.EXP_BOTTLE?.quick_status?.buyPrice ?? 76

  const rows = await computeFlips(expBottlePrice)
  return { rows, expBottlePrice }
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
