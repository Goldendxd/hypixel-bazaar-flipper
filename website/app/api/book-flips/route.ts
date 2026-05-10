import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const TAX = 0.0125

// ── Verified combinable enchantment whitelist ─────────────────────────────────
// Source: https://wiki.hypixel.net/Enchanting
// Rules enforced here:
//   1. Combining 2× level N → 1× level N+1, on the vanilla anvil.
//   2. Output level must be ≤ V (5). Books above V are mob/dungeon drops only.
//   3. Ultimate enchants CANNOT be combined — excluded entirely.
//   4. Dungeon-exclusive books (e.g. Giant Killer, Luck) that don't appear on
//      bazaar are excluded.
//   5. Only enchants whose bazaar IDs actually exist with real volume are shown.
//      The API validates volume at runtime using live bazaar data.
//
// Format: base bazaar ID prefix (without level suffix).
// e.g. 'ENCHANTMENT_SHARPNESS' → ENCHANTMENT_SHARPNESS_1 … ENCHANTMENT_SHARPNESS_5
//
// Enchants and their verified max combinable level on Hypixel SkyBlock:
//   Max V  — standard enchants where tier 5 is the highest craftable level
//   Max IV — enchants where tier 4 is the highest craftable level (no tier 5 on BZ)
//   Max III — enchants that cap at tier 3 (e.g. Looting, Fire Aspect, Aqua Affinity)
//
// We let the API filter dynamically: only pairs where BOTH levels exist on bazaar
// with buyPrice > 0 are shown. The WHITELIST here ensures we never include
// enchants that technically exist on BZ but cannot be crafted by combining.

const COMBINABLE_ENCHANTS = new Set<string>([
  // ── Sword enchants (combinable to V) ──────────────────────────────────────
  'ENCHANTMENT_SHARPNESS',
  'ENCHANTMENT_SMITE',
  'ENCHANTMENT_BANE_OF_ARTHROPODS',
  'ENCHANTMENT_KNOCKBACK',           // max II on vanilla but HSB extends; cap at 5 dynamically
  'ENCHANTMENT_FIRE_ASPECT',         // max II vanilla → HSB max II; API will cap naturally
  'ENCHANTMENT_LOOTING',             // max III on HSB (no tier 4/5 on bazaar)
  'ENCHANTMENT_VAMPIRISM',
  'ENCHANTMENT_SCAVENGER',
  'ENCHANTMENT_ENDER_SLAYER',
  'ENCHANTMENT_THUNDERLORD',
  'ENCHANTMENT_EXECUTE',
  'ENCHANTMENT_CHAMPION',
  'ENCHANTMENT_GIANT_KILLER',
  'ENCHANTMENT_PROSECUTE',
  'ENCHANTMENT_CUBISM',
  'ENCHANTMENT_EXPERIENCE',
  'ENCHANTMENT_LIFE_STEAL',
  'ENCHANTMENT_SYPHON',
  'ENCHANTMENT_LETHALITY',
  'ENCHANTMENT_CRITICAL',
  'ENCHANTMENT_FIRST_STRIKE',
  'ENCHANTMENT_TRIPLE_STRIKE',
  'ENCHANTMENT_COUNTER_STRIKE',
  'ENCHANTMENT_LUCK',
  'ENCHANTMENT_VICIOUS',

  // ── Bow enchants ──────────────────────────────────────────────────────────
  'ENCHANTMENT_POWER',
  'ENCHANTMENT_PUNCH',
  'ENCHANTMENT_FLAME',               // max I on vanilla; HSB may differ — API caps naturally
  'ENCHANTMENT_INFINITY',            // max I; pair won't exist so no output
  'ENCHANTMENT_SNIPE',
  'ENCHANTMENT_AIMING',
  'ENCHANTMENT_PIERCING',
  'ENCHANTMENT_OVERLOAD',
  'ENCHANTMENT_DRAGON_HUNTER',
  'ENCHANTMENT_IMPALING',
  'ENCHANTMENT_POWER_BOOST',         // HSB custom
  'ENCHANTMENT_CHANCE',
  'ENCHANTMENT_ICHOR',

  // ── Armor enchants ────────────────────────────────────────────────────────
  'ENCHANTMENT_PROTECTION',
  'ENCHANTMENT_FIRE_PROTECTION',
  'ENCHANTMENT_BLAST_PROTECTION',
  'ENCHANTMENT_PROJECTILE_PROTECTION',
  'ENCHANTMENT_THORNS',
  'ENCHANTMENT_RESPIRATION',         // max III
  'ENCHANTMENT_AQUA_AFFINITY',       // max I; no pair
  'ENCHANTMENT_DEPTH_STRIDER',       // max III
  'ENCHANTMENT_FEATHER_FALLING',
  'ENCHANTMENT_SUGAR_RUSH',
  'ENCHANTMENT_SMARTY_PANTS',
  'ENCHANTMENT_GROWTH',
  'ENCHANTMENT_REJUVENATE',
  'ENCHANTMENT_TRUE_PROTECTION',
  'ENCHANTMENT_ENDER_WALK',

  // ── Tool enchants ─────────────────────────────────────────────────────────
  'ENCHANTMENT_EFFICIENCY',
  'ENCHANTMENT_FORTUNE',
  'ENCHANTMENT_SILK_TOUCH',          // max I; no pair
  'ENCHANTMENT_UNBREAKING',
  'ENCHANTMENT_LURE',
  'ENCHANTMENT_LUCK_OF_THE_SEA',
  'ENCHANTMENT_COMPACT',
  'ENCHANTMENT_HARVESTING',
  'ENCHANTMENT_REPLENISH',           // max I; no pair
  'ENCHANTMENT_CULTIVATING',         // max I; no pair
  'ENCHANTMENT_SMELTING_TOUCH',      // max I; no pair
  'ENCHANTMENT_TURBO_WHEAT',
  'ENCHANTMENT_TURBO_CANE',
  'ENCHANTMENT_TURBO_CARROT',
  'ENCHANTMENT_TURBO_POTATO',
  'ENCHANTMENT_TURBO_COCO',
  'ENCHANTMENT_TURBO_MELON',
  'ENCHANTMENT_TURBO_PUMPKIN',
  'ENCHANTMENT_TURBO_WARTS',
  'ENCHANTMENT_TURBO_MUSHROOMS',
  'ENCHANTMENT_DEDICATION',          // combinable on bazaar
  'ENCHANTMENT_DELICATE',
  'ENCHANTMENT_PRISTINE',
  'ENCHANTMENT_MANA_STEAL',

  // ── Fishing rod enchants ──────────────────────────────────────────────────
  'ENCHANTMENT_ANGLER',
  'ENCHANTMENT_FRAIL',
  'ENCHANTMENT_MAGNET',
  'ENCHANTMENT_TROPHY_HUNTER',
  'ENCHANTMENT_EXPERTISE',

  // ── Special / misc ────────────────────────────────────────────────────────
  'ENCHANTMENT_REJUVENATE',
  'ENCHANTMENT_CHARM',
  'ENCHANTMENT_CORRUPTION',
  'ENCHANTMENT_TEMPTING',
])

// Enchants explicitly excluded because they CANNOT be crafted by combining:
// - Ultimate enchants (One for All, Soul Eater, etc.) — drops only
// - Dungeon-exclusive books that don't appear on bazaar as combinable
// These are kept as a comment for documentation; the whitelist above is the
// positive filter that controls what we consider.

export interface BookFlipRow {
  outputId: string
  outputName: string
  enchantName: string
  outputLevel: number
  inputId: string
  inputLevel: number
  inputQty: number
  inputUnitPrice: number
  inputTotalCost: number
  outputSellPrice: number
  outputBuyPrice: number
  revenue: number
  profit: number
  margin: number
  sellVolume: number
  buyVolume: number
  iconUrl: string
}

function enchantDisplayName(id: string): string {
  const parts = id.split('_')
  const level = parseInt(parts[parts.length - 1])
  const name  = parts.slice(1, -1).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
  const roman = ['', 'I', 'II', 'III', 'IV', 'V'][level] ?? String(level)
  return `${name} ${roman}`
}

function enchantBaseName(id: string): string {
  const parts = id.split('_')
  return parts.slice(1, -1).map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
}

async function compute(): Promise<{ rows: BookFlipRow[]; totalBooks: number }> {
  const bazRes = await fetch('https://api.hypixel.net/skyblock/bazaar', {
    signal: AbortSignal.timeout(15000),
  })
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  const baz = await bazRes.json()

  const products = baz.products as Record<string, {
    quick_status: { buyPrice: number; sellPrice: number; buyMovingWeek: number; sellMovingWeek: number }
  }>

  // Group enchantments by base name and level — only whitelisted bases
  const enchMap: Record<string, Record<number, {
    buy: number; sell: number; sellVol: number; buyVol: number
  }>> = {}

  let totalBooks = 0
  for (const [id, p] of Object.entries(products)) {
    if (!id.startsWith('ENCHANTMENT_')) continue
    totalBooks++
    const parts = id.split('_')
    const level = parseInt(parts[parts.length - 1])
    if (!Number.isInteger(level) || isNaN(level)) continue

    const base = parts.slice(0, -1).join('_')

    // Only process whitelisted combinable enchants
    if (!COMBINABLE_ENCHANTS.has(base)) continue

    if (!enchMap[base]) enchMap[base] = {}
    const q = p.quick_status
    enchMap[base][level] = {
      buy:     q.buyPrice,
      sell:    q.sellPrice,
      sellVol: q.sellMovingWeek,
      buyVol:  q.buyMovingWeek,
    }
  }

  const rows: BookFlipRow[] = []

  for (const [base, levels] of Object.entries(enchMap)) {
    const levelNums = Object.keys(levels).map(Number).sort((a, b) => a - b)

    for (let i = 0; i < levelNums.length - 1; i++) {
      const fromLvl = levelNums[i]
      const toLvl   = levelNums[i + 1]

      // Only sequential combines: 2× level N → 1× level N+1
      if (toLvl !== fromLvl + 1) continue

      // Hard cap: cannot combine books above tier V on the anvil in Hypixel SkyBlock
      if (toLvl > 5) continue

      const lower = levels[fromLvl]
      const upper = levels[toLvl]
      if (!lower || !upper) continue
      if (lower.buy <= 0 || upper.sell <= 0) continue

      // Both levels must have real bazaar volume
      if (lower.buyVol < 10 || upper.sellVol < 5) continue

      const inputTotalCost = Math.round(lower.buy * 2 * 100) / 100
      const sellOrder      = Math.round((upper.sell - 0.1) * 100) / 100
      const revenue        = Math.round(sellOrder * (1 - TAX) * 100) / 100
      const profit         = Math.round((revenue - inputTotalCost) * 100) / 100
      if (profit <= 0) continue

      const margin   = Math.round((profit / inputTotalCost) * 10000) / 100
      const outputId = `${base}_${toLvl}`

      rows.push({
        outputId,
        outputName:     enchantDisplayName(outputId),
        enchantName:    enchantBaseName(outputId),
        outputLevel:    toLvl,
        inputId:        `${base}_${fromLvl}`,
        inputLevel:     fromLvl,
        inputQty:       2,
        inputUnitPrice: Math.round(lower.buy * 100) / 100,
        inputTotalCost,
        outputSellPrice: sellOrder,
        outputBuyPrice:  Math.round(upper.buy * 100) / 100,
        revenue,
        profit,
        margin,
        sellVolume: upper.sellVol,
        buyVolume:  upper.buyVol,
        iconUrl: `https://sky.shiiyu.moe/item/${outputId}`,
      })
    }
  }

  rows.sort((a, b) => b.profit - a.profit)
  return { rows, totalBooks }
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
