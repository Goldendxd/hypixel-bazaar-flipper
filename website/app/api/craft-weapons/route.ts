import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COFL       = 'https://sky.coflnet.com/api/item/price'
const BZ_API     = 'https://api.hypixel.net/v2/skyblock/bazaar'
const GEMINI_KEY = 'AIzaSyDtzLvCVeHYFLsp0DR3ftPyCwA7b_Evr50'
const AH_TAX     = 0.02
const CACHE_TTL  = 3 * 60 * 1000

let cache: { data: object; ts: number } | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Bazaar snapshot
//
// Hypixel Bazaar semantics (confirmed live):
//   sell_summary  = active sell offers (people selling TO you)
//   buy_summary   = active buy orders  (people buying FROM you / insta-sell)
//
//   instaBuy  = sell_summary[0].pricePerUnit
//               The cheapest you can buy RIGHT NOW by clicking "Buy Instantly"
//               → you pay MORE, no waiting
//
//   buyOrder  = quick_status.sellPrice  (weighted avg of sell offers)
//               Real traders place buy orders just below sell_summary[0].
//               sellPrice ≈ the price a patient buy order would fill at.
//               → you pay LESS, but must WAIT for a seller to fill you
//
// Note: buy_summary[0] is the highest BID (insta-sell price for sellers),
//       which is often HIGHER than sell_summary due to manipulation bots.
//       We intentionally DO NOT use buy_summary for buyer cost calculations.
// ─────────────────────────────────────────────────────────────────────────────

interface BzProduct {
  instaBuy:  number  // sell_summary[0] — you pay this to buy instantly
  buyOrder:  number  // quick_status.sellPrice — you pay this with a patient buy order
  sellVol:   number
  buyVol:    number
  sellOrders: number
  buyOrders:  number
}

async function fetchBazaarSnapshot(): Promise<Map<string, BzProduct>> {
  const map = new Map<string, BzProduct>()
  try {
    const res = await fetch(BZ_API, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return map
    const j = await res.json()
    const products: Record<string, {
      sell_summary: Array<{ pricePerUnit: number }>
      buy_summary:  Array<{ pricePerUnit: number }>
      quick_status: {
        sellPrice:  number
        buyPrice:   number
        sellVolume: number
        buyVolume:  number
        sellOrders: number
        buyOrders:  number
      }
    }> = j?.products ?? {}

    for (const [id, p] of Object.entries(products)) {
      const instaBuy = p.sell_summary?.[0]?.pricePerUnit ?? 0
      // Patient buy order: use quick_status.sellPrice (weighted avg sell offers)
      // This is always <= instaBuy, giving the real buy-order discount
      const buyOrder = p.quick_status?.sellPrice ?? instaBuy
      map.set(id, {
        instaBuy,
        buyOrder,
        sellVol:    p.quick_status?.sellVolume ?? 0,
        buyVol:     p.quick_status?.buyVolume  ?? 0,
        sellOrders: p.quick_status?.sellOrders ?? 0,
        buyOrders:  p.quick_status?.buyOrders  ?? 0,
      })
    }
  } catch { /* return empty map */ }
  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// AH pricing via Coflnet
// ─────────────────────────────────────────────────────────────────────────────

interface AhPrice {
  lbin:       number
  secondLbin: number
  sellOrder:  number
}

async function fetchAhPrice(tag: string): Promise<AhPrice> {
  try {
    const [binRes, curRes] = await Promise.allSettled([
      fetch(`${COFL}/${tag}/bin`,     { signal: AbortSignal.timeout(8000) }),
      fetch(`${COFL}/${tag}/current`, { signal: AbortSignal.timeout(8000) }),
    ])
    let lbin = 0, secondLbin = 0, sellOrder = 0
    if (binRes.status === 'fulfilled' && binRes.value.ok) {
      const j = await binRes.value.json()
      lbin       = j?.lowest       ?? j?.min ?? 0
      secondLbin = j?.secondLowest ?? lbin
    }
    if (curRes.status === 'fulfilled' && curRes.value.ok) {
      const j = await curRes.value.json()
      sellOrder = j?.sell ?? lbin
      if (lbin === 0) lbin = j?.sell ?? 0
    }
    return { lbin, secondLbin, sellOrder }
  } catch {
    return { lbin: 0, secondLbin: 0, sellOrder: 0 }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Price history
// ─────────────────────────────────────────────────────────────────────────────

async function fetchHistory(tag: string): Promise<Array<{ time: string; avg: number; min: number; max: number; volume: number }>> {
  try {
    const res = await fetch(`${COFL}/${tag}/history/day`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const j = await res.json()
    if (!Array.isArray(j)) return []
    return j.map((p: { time?: string; avg?: number; min?: number; max?: number; volume?: number }) => ({
      time: p.time ?? '', avg: p.avg ?? 0, min: p.min ?? 0, max: p.max ?? 0, volume: p.volume ?? 0,
    }))
  } catch { return [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function volatility(history: Array<{ avg: number }>): number {
  const prices = history.map(h => h.avg).filter(p => p > 0)
  if (prices.length < 2) return 0
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length
  if (mean === 0) return 0
  const variance = prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length
  return (Math.sqrt(variance) / mean) * 100
}

function manipulationRisk(vol: number, history: Array<{ avg: number; volume: number }>): {
  risk: 'LOW' | 'MEDIUM' | 'HIGH'; reason: string | null
} {
  if (vol > 30) return { risk: 'HIGH', reason: `Price swung ${vol.toFixed(1)}% in 24h` }
  if (history.length >= 4) {
    const recent = history.slice(-2), older = history.slice(0, -2)
    const oldVol = older.reduce((a, b) => a + b.volume, 0) / (older.length || 1)
    const newVol = recent.reduce((a, b) => a + b.volume, 0) / (recent.length || 1)
    if (oldVol > 0 && newVol / oldVol > 5)
      return { risk: 'MEDIUM', reason: 'Unusual volume spike' }
  }
  if (vol > 15) return { risk: 'MEDIUM', reason: `Elevated volatility (${vol.toFixed(1)}%)` }
  return { risk: 'LOW', reason: null }
}

function bzLiquidity(p: BzProduct): { liquidity: 'HIGH' | 'MEDIUM' | 'LOW'; fillTimeEst: string } {
  // spread between insta-buy and buy-order price
  const spread = p.instaBuy > 0 ? ((p.instaBuy - p.buyOrder) / p.instaBuy) * 100 : 0
  if (spread < 0.5 && p.sellVol > 100_000) return { liquidity: 'HIGH',   fillTimeEst: '< 10 min' }
  if (spread < 2   && p.sellVol > 10_000)  return { liquidity: 'HIGH',   fillTimeEst: '< 1h'     }
  if (spread < 5   && p.sellVol > 1_000)   return { liquidity: 'MEDIUM', fillTimeEst: '1–6h'     }
  if (spread < 10)                          return { liquidity: 'MEDIUM', fillTimeEst: '6–24h'    }
  return { liquidity: 'LOW', fillTimeEst: '1–3 days' }
}

function ahPricing(lbin: number): import('@/lib/craftWeapons').IngredientPricing {
  return { instaBuy: lbin, buyOrder: lbin, spread: 0, source: 'AH', liquidity: 'MEDIUM', fillTimeEst: 'instant' }
}

function bzPricing(p: BzProduct): import('@/lib/craftWeapons').IngredientPricing {
  const spread = p.instaBuy > 0 ? ((p.instaBuy - p.buyOrder) / p.instaBuy) * 100 : 0
  const { liquidity, fillTimeEst } = bzLiquidity(p)
  return {
    instaBuy: p.instaBuy,
    buyOrder: p.buyOrder,
    spread:   parseFloat(spread.toFixed(2)),
    source: 'BZ', liquidity, fillTimeEst,
  }
}

function iconUrl(id: string) { return `https://sky.shiiyu.moe/item/${id}` }

// ─────────────────────────────────────────────────────────────────────────────
// Ingredient definitions
// ─────────────────────────────────────────────────────────────────────────────

const HYPERION_INGREDIENTS = [
  { id: 'NECRON_HANDLE',        name: 'Necron Handle',          qty: 1,   src: 'AH' as const },
  { id: 'WITHER_CATALYST',      name: 'Wither Catalyst',        qty: 24,  src: 'BZ' as const },
  { id: 'GIANT_FRAGMENT_LASER', name: 'Giant Fragment (Laser)', qty: 8,   src: 'BZ' as const },
]

const HYPERION_SCROLLS = [
  { id: 'IMPLOSION_SCROLL',     name: 'Implosion Scroll',     src: 'AH' as const },
  { id: 'SHADOW_WARP_SCROLL',   name: 'Shadow Warp Scroll',   src: 'AH' as const },
  { id: 'WITHER_SHIELD_SCROLL', name: 'Wither Shield Scroll', src: 'AH' as const },
]

const TERMINATOR_INGREDIENTS = [
  { id: 'JUDGEMENT_CORE',          name: 'Judgement Core',          qty: 1,   src: 'AH' as const },
  { id: 'NULL_BLADE',              name: 'Null Blade',              qty: 3,   src: 'BZ' as const },
  { id: 'TESSELLATED_ENDER_PEARL', name: 'Tessellated Ender Pearl', qty: 8,   src: 'BZ' as const },
  { id: 'TARANTULA_SILK',          name: 'Tarantula Silk',          qty: 128, src: 'BZ' as const },
  { id: 'BRAIDED_GRIFFIN_FEATHER', name: 'Braided Griffin Feather', qty: 4,   src: 'AH' as const },
]

// ─────────────────────────────────────────────────────────────────────────────
// Hyperion variant builder
// ─────────────────────────────────────────────────────────────────────────────

function buildHyperionVariants(
  cleanLbin: number,
  scrollPrices: number[],
): import('@/lib/craftWeapons').WeaponVariant[] {
  const [imp, sw, ws] = scrollPrices
  return [
    { label: 'Clean',                  scrollCount: 0, scrollIds: [],                                                                  estimatedLbin: cleanLbin,                note: 'Coflnet /bin — live AH LBIN' },
    { label: '1-Scroll (Implosion)',   scrollCount: 1, scrollIds: ['IMPLOSION_SCROLL'],                                                estimatedLbin: cleanLbin + imp,          note: 'Clean LBIN + Implosion price' },
    { label: '2-Scroll (Imp + SW)',    scrollCount: 2, scrollIds: ['IMPLOSION_SCROLL', 'SHADOW_WARP_SCROLL'],                          estimatedLbin: cleanLbin + imp + sw,     note: 'Clean + Implosion + Shadow Warp' },
    { label: 'Fully Scrolled',         scrollCount: 3, scrollIds: ['IMPLOSION_SCROLL', 'SHADOW_WARP_SCROLL', 'WITHER_SHIELD_SCROLL'], estimatedLbin: cleanLbin + imp + sw + ws, note: 'Clean + all 3 scrolls' },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// Weapon builder
// ─────────────────────────────────────────────────────────────────────────────

async function buildWeapon(
  id: string,
  name: string,
  ingredientDefs: Array<{ id: string; name: string; qty: number; src: 'AH' | 'BZ' }>,
  scrollDefs:     Array<{ id: string; name: string; src: 'AH' | 'BZ' }>,
  bzSnapshot:     Map<string, BzProduct>,
): Promise<import('@/lib/craftWeapons').WeaponFlip> {

  const ahIngredients = ingredientDefs.filter(x => x.src === 'AH')
  const ahScrolls     = scrollDefs.filter(x => x.src === 'AH')

  const [ahIngPrices, ahScrollPrices, outputAhPrice, outputHistory, ingHistories] = await Promise.all([
    Promise.all(ahIngredients.map(x => fetchAhPrice(x.id))),
    Promise.all(ahScrolls.map(x => fetchAhPrice(x.id))),
    fetchAhPrice(id),
    fetchHistory(id),
    Promise.all(ingredientDefs.map(x => fetchHistory(x.id))),
  ])

  const ahIngMap    = new Map(ahIngredients.map((x, i) => [x.id, ahIngPrices[i]]))
  const ahScrollMap = new Map(ahScrolls.map((x, i) => [x.id, ahScrollPrices[i]]))

  const ingredients: import('@/lib/craftWeapons').CraftIngredient[] = ingredientDefs.map((def, i) => {
    const history = ingHistories[i]
    const vol = parseFloat(volatility(history).toFixed(2))
    let pricing: import('@/lib/craftWeapons').IngredientPricing
    if (def.src === 'BZ') {
      const bz = bzSnapshot.get(def.id)
      pricing = bz ? bzPricing(bz) : { instaBuy: 0, buyOrder: 0, spread: 0, source: 'BZ', liquidity: 'LOW', fillTimeEst: 'unknown' }
    } else {
      pricing = ahPricing(ahIngMap.get(def.id)?.lbin ?? 0)
    }
    return {
      id: def.id, name: def.name, qty: def.qty,
      pricing,
      unitPrice: pricing.instaBuy,
      totalCost: pricing.instaBuy * def.qty,
      source: def.src,
      iconUrl: iconUrl(def.id),
      priceHistory: history,
      volatility: vol,
    }
  })

  const scrollAddons: import('@/lib/craftWeapons').ScrollAddon[] = scrollDefs.map(def => {
    let pricing: import('@/lib/craftWeapons').IngredientPricing
    if (def.src === 'BZ') {
      const bz = bzSnapshot.get(def.id)
      pricing = bz ? bzPricing(bz) : { instaBuy: 0, buyOrder: 0, spread: 0, source: 'BZ', liquidity: 'LOW', fillTimeEst: 'unknown' }
    } else {
      pricing = ahPricing(ahScrollMap.get(def.id)?.lbin ?? 0)
    }
    return { id: def.id, name: def.name, pricing, unitPrice: pricing.instaBuy, source: def.src, iconUrl: iconUrl(def.id) }
  })

  const craftCost            = ingredients.reduce((a, x) => a + x.totalCost, 0)
  const scrollCost           = scrollAddons.reduce((a, x) => a + x.unitPrice, 0)
  const craftCostWithScrolls = craftCost + scrollCost
  const cleanLbin            = outputAhPrice.lbin
  const sellOrderPrice       = outputAhPrice.sellOrder

  const variants = scrollDefs.length > 0
    ? buildHyperionVariants(cleanLbin, scrollAddons.map(s => s.unitPrice))
    : [{ label: 'Standard', scrollCount: 0, scrollIds: [], estimatedLbin: cleanLbin, note: 'Live AH LBIN via Coflnet' }]

  const netRevenue         = cleanLbin * (1 - AH_TAX)
  const netRevenueScrolled = (cleanLbin + scrollCost) * (1 - AH_TAX)
  const profitNoScrolls    = netRevenue - craftCost
  const profitWithScrolls  = netRevenueScrolled - craftCostWithScrolls
  const marginNoScrolls    = craftCost > 0 ? (profitNoScrolls / craftCost) * 100 : 0
  const marginWithScrolls  = craftCostWithScrolls > 0 ? (profitWithScrolls / craftCostWithScrolls) * 100 : 0

  const outVol            = volatility(outputHistory)
  const { risk, reason }  = manipulationRisk(outVol, outputHistory)
  const weeklyVolume      = outputHistory.reduce((a, b) => a + b.volume, 0) * 7
  const estimatedSellDays = weeklyVolume > 0 ? parseFloat((7 / weeklyVolume).toFixed(2)) : 99

  return {
    id, name, iconUrl: iconUrl(id),
    cleanLbin, sellOrderPrice,
    priceHistory: outputHistory,
    variants, ingredients, scrollAddons,
    craftCost:            parseFloat(craftCost.toFixed(0)),
    craftCostWithScrolls: parseFloat(craftCostWithScrolls.toFixed(0)),
    profitNoScrolls:      parseFloat(profitNoScrolls.toFixed(0)),
    profitWithScrolls:    parseFloat(profitWithScrolls.toFixed(0)),
    marginNoScrolls:      parseFloat(marginNoScrolls.toFixed(2)),
    marginWithScrolls:    parseFloat(marginWithScrolls.toFixed(2)),
    ahTax: AH_TAX,
    lastUpdated: new Date().toISOString(),
    manipulationRisk:   risk,
    manipulationReason: reason,
    estimatedSellDays,
    weeklyVolume: parseFloat(weeklyVolume.toFixed(0)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini
// ─────────────────────────────────────────────────────────────────────────────

async function askGemini(prompt: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(14000),
      }
    )
    if (!res.ok) return null
    const j = await res.json()
    return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data)
  }

  const bzSnapshot = await fetchBazaarSnapshot()
  const [hyperion, terminator] = await Promise.all([
    buildWeapon('HYPERION',   'Hyperion',   HYPERION_INGREDIENTS,   HYPERION_SCROLLS, bzSnapshot),
    buildWeapon('TERMINATOR', 'Terminator', TERMINATOR_INGREDIENTS, [],               bzSnapshot),
  ])

  // Buy-order savings (instaBuy - buyOrder) per item × qty
  const hBoSavings = hyperion.ingredients.filter(x => x.source === 'BZ')
    .reduce((a, x) => a + (x.pricing.instaBuy - x.pricing.buyOrder) * x.qty, 0)
  const tBoSavings = terminator.ingredients.filter(x => x.source === 'BZ')
    .reduce((a, x) => a + (x.pricing.instaBuy - x.pricing.buyOrder) * x.qty, 0)

  const geminiPrompt = `You are a Hypixel SkyBlock economy expert. Give sharp, actionable advice in 3-4 sentences.

HYPERION: craft cost ${(hyperion.craftCost/1e6).toFixed(1)}M | LBIN ${(hyperion.cleanLbin/1e6).toFixed(1)}M | profit ${(hyperion.profitNoScrolls/1e6).toFixed(1)}M (${hyperion.marginNoScrolls.toFixed(1)}%) | buy-order saves ${(hBoSavings/1e6).toFixed(1)}M | risk ${hyperion.manipulationRisk}
TERMINATOR: craft cost ${(terminator.craftCost/1e6).toFixed(1)}M | LBIN ${(terminator.cleanLbin/1e6).toFixed(1)}M | profit ${(terminator.profitNoScrolls/1e6).toFixed(1)}M (${terminator.marginNoScrolls.toFixed(1)}%) | buy-order saves ${(tBoSavings/1e6).toFixed(1)}M | risk ${terminator.manipulationRisk}

Pricing note: instaBuy = sell_summary[0] (lowest ask), buyOrder = sellPrice weighted avg (patient order, always cheaper). Which weapon, which execution method? Be specific and direct.`

  const aiSummary = await askGemini(geminiPrompt)
  const result = { hyperion, terminator, aiSummary, fetchedAt: new Date().toISOString() }
  cache = { data: result, ts: Date.now() }
  return NextResponse.json(result)
}
