import { NextResponse } from 'next/server'

const COFL = 'https://sky.coflnet.com/api/item/price'
const GEMINI_KEY = 'AIzaSyDtzLvCVeHYFLsp0DR3ftPyCwA7b_Evr50'
const AH_TAX = 0.02
const CACHE_TTL = 3 * 60 * 1000

let cache: { data: object; ts: number } | null = null

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function iconUrl(id: string) {
  return `https://sky.shiiyu.moe/item/${id}`
}

async function coflCurrent(tag: string): Promise<{ price: number; source: 'AH' | 'BZ' }> {
  try {
    const [curRes, binRes] = await Promise.allSettled([
      fetch(`${COFL}/${tag}/current`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${COFL}/${tag}/bin`,     { signal: AbortSignal.timeout(8000) }),
    ])

    let ahPrice: number | null = null
    let bzPrice: number | null = null

    if (binRes.status === 'fulfilled' && binRes.value.ok) {
      const j = await binRes.value.json()
      const lowest = j?.lowest ?? j?.min ?? 0
      if (lowest > 0) ahPrice = lowest
    }
    if (curRes.status === 'fulfilled' && curRes.value.ok) {
      const j = await curRes.value.json()
      const sellInstant = j?.buy ?? 0  // buy from BZ = insta-buy for buyer = sell order price
      const sellOrder   = j?.sell ?? 0
      if (sellOrder > 0) bzPrice = sellOrder
      else if (sellInstant > 0) bzPrice = sellInstant
    }

    // Prefer AH lbin if exists, else BZ
    if (ahPrice && ahPrice > 0) return { price: ahPrice, source: 'AH' }
    if (bzPrice && bzPrice > 0) return { price: bzPrice, source: 'BZ' }
    return { price: 0, source: 'AH' }
  } catch {
    return { price: 0, source: 'AH' }
  }
}

async function coflHistory(tag: string): Promise<Array<{ time: string; avg: number; min: number; max: number; volume: number }>> {
  try {
    const res = await fetch(`${COFL}/${tag}/history/day`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const j = await res.json()
    if (!Array.isArray(j)) return []
    return j.map((p: { time?: string; avg?: number; min?: number; max?: number; volume?: number }) => ({
      time:   p.time   ?? '',
      avg:    p.avg    ?? 0,
      min:    p.min    ?? 0,
      max:    p.max    ?? 0,
      volume: p.volume ?? 0,
    }))
  } catch {
    return []
  }
}

function volatility(history: Array<{ avg: number }>): number {
  if (history.length < 2) return 0
  const prices = history.map(h => h.avg).filter(p => p > 0)
  if (prices.length < 2) return 0
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length
  if (mean === 0) return 0
  const variance = prices.reduce((a, b) => a + (b - mean) ** 2, 0) / prices.length
  return (Math.sqrt(variance) / mean) * 100
}

function manipulationRisk(vol: number, history: Array<{ avg: number; volume: number }>): { risk: 'LOW' | 'MEDIUM' | 'HIGH'; reason: string | null } {
  if (vol > 30) return { risk: 'HIGH', reason: `Price swung ${vol.toFixed(1)}% in 24h — possible manipulation` }
  // Check for sudden volume spike with price spike
  if (history.length >= 4) {
    const recent = history.slice(-2)
    const older  = history.slice(0, -2)
    const oldAvgVol = older.reduce((a, b) => a + b.volume, 0) / (older.length || 1)
    const newAvgVol = recent.reduce((a, b) => a + b.volume, 0) / (recent.length || 1)
    if (oldAvgVol > 0 && newAvgVol / oldAvgVol > 5) {
      return { risk: 'MEDIUM', reason: 'Volume spike detected — verify price is real' }
    }
  }
  if (vol > 15) return { risk: 'MEDIUM', reason: `Moderate volatility (${vol.toFixed(1)}%)` }
  return { risk: 'LOW', reason: null }
}

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

// ────────────────────────────────────────────────────────────────────────────
// Ingredient lists
// ────────────────────────────────────────────────────────────────────────────

const HYPERION_INGREDIENTS = [
  { id: 'NECRON_HANDLE',      name: 'Necron Handle',         qty: 1 },
  { id: 'WITHER_CATALYST',    name: 'Wither Catalyst',       qty: 24 },
  { id: 'GIANT_FRAGMENT_LASER', name: 'Giant Fragment (Laser)', qty: 8 },
]

const HYPERION_SCROLLS = [
  { id: 'IMPLOSION_SCROLL',     name: 'Implosion Scroll'     },
  { id: 'SHADOW_WARP_SCROLL',   name: 'Shadow Warp Scroll'   },
  { id: 'WITHER_SHIELD_SCROLL', name: 'Wither Shield Scroll' },
]

const TERMINATOR_INGREDIENTS = [
  { id: 'JUDGEMENT_CORE',          name: 'Judgement Core',          qty: 1 },
  { id: 'NULL_BLADE',              name: 'Null Blade',              qty: 3 },
  { id: 'TESSELLATED_ENDER_PEARL', name: 'Tessellated Ender Pearl', qty: 8 },
  { id: 'TARANTULA_SILK',          name: 'Tarantula Silk',          qty: 128 },
  { id: 'BRAIDED_GRIFFIN_FEATHER', name: 'Braided Griffin Feather', qty: 4 },
]

// ────────────────────────────────────────────────────────────────────────────
// Build weapon data
// ────────────────────────────────────────────────────────────────────────────

async function buildWeapon(
  id: string,
  name: string,
  ingredientDefs: Array<{ id: string; name: string; qty: number }>,
  scrollDefs:     Array<{ id: string; name: string }>,
) {
  // Fetch all prices concurrently
  const ingredientPriceJobs = ingredientDefs.map(ing =>
    Promise.all([coflCurrent(ing.id), coflHistory(ing.id)])
  )
  const scrollPriceJobs = scrollDefs.map(s => coflCurrent(s.id))
  const outputCurrentJob = coflCurrent(id)
  const outputHistoryJob = coflHistory(id)
  // Also fetch sell order (BZ sell field = what buyers pay = fill sell order)
  const outputBzJob = fetch(`${COFL}/${id}/current`, { signal: AbortSignal.timeout(8000) })
    .then(r => r.ok ? r.json() : null).catch(() => null)

  const [ingredientResults, scrollResults, outputCurrent, outputHistory, outputBz] = await Promise.all([
    Promise.all(ingredientPriceJobs),
    Promise.all(scrollPriceJobs),
    outputCurrentJob,
    outputHistoryJob,
    outputBzJob,
  ])

  const ingredients = ingredientDefs.map((ing, i) => {
    const [{ price, source }, history] = ingredientResults[i]
    const vol = volatility(history)
    return {
      id:       ing.id,
      name:     ing.name,
      qty:      ing.qty,
      unitPrice: price,
      totalCost: price * ing.qty,
      source,
      iconUrl:  iconUrl(ing.id),
      priceHistory: history,
      volatility: parseFloat(vol.toFixed(2)),
    }
  })

  const scrollAddons = scrollDefs.map((s, i) => ({
    id:        s.id,
    name:      s.name,
    unitPrice: scrollResults[i].price,
    source:    scrollResults[i].source,
    iconUrl:   iconUrl(s.id),
  }))

  const craftCost = ingredients.reduce((a, b) => a + b.totalCost, 0)
  const scrollCost = scrollAddons.reduce((a, b) => a + b.unitPrice, 0)
  const craftCostWithScrolls = craftCost + scrollCost

  // Output pricing: lbin from /bin, sell order from current.sell
  const lbin = outputCurrent.price
  const sellOrderPrice: number = (() => {
    const s = outputBz?.sell ?? 0
    return s > 0 ? s : lbin
  })()

  const netLbin       = lbin        * (1 - AH_TAX)
  const netSellOrder  = sellOrderPrice * (1 - AH_TAX)

  const profitNoScrolls    = netLbin      - craftCost
  const profitWithScrolls  = netSellOrder - craftCostWithScrolls

  const marginNoScrolls   = craftCost > 0 ? (profitNoScrolls   / craftCost)            * 100 : 0
  const marginWithScrolls = craftCostWithScrolls > 0 ? (profitWithScrolls / craftCostWithScrolls) * 100 : 0

  const outputVol  = volatility(outputHistory)
  const { risk, reason } = manipulationRisk(outputVol, outputHistory)

  const weeklyVolume = outputHistory.reduce((a, b) => a + b.volume, 0) * 7
  const estimatedSellDays = weeklyVolume > 0 ? parseFloat((7 / weeklyVolume).toFixed(2)) : 99

  return {
    id,
    name,
    iconUrl: iconUrl(id),
    lbin,
    sellOrderPrice,
    craftCost:            parseFloat(craftCost.toFixed(0)),
    craftCostWithScrolls: parseFloat(craftCostWithScrolls.toFixed(0)),
    profitNoScrolls:      parseFloat(profitNoScrolls.toFixed(0)),
    profitWithScrolls:    parseFloat(profitWithScrolls.toFixed(0)),
    marginNoScrolls:      parseFloat(marginNoScrolls.toFixed(2)),
    marginWithScrolls:    parseFloat(marginWithScrolls.toFixed(2)),
    ahTax: AH_TAX,
    ingredients,
    scrollAddons,
    priceHistory: outputHistory,
    lastUpdated:  new Date().toISOString(),
    manipulationRisk:   risk,
    manipulationReason: reason,
    estimatedSellDays,
    weeklyVolume: parseFloat(weeklyVolume.toFixed(0)),
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Route handler
// ────────────────────────────────────────────────────────────────────────────

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return NextResponse.json(cache.data)
  }

  const [hyperion, terminator] = await Promise.all([
    buildWeapon('HYPERION', 'Hyperion', HYPERION_INGREDIENTS, HYPERION_SCROLLS),
    buildWeapon('TERMINATOR', 'Terminator', TERMINATOR_INGREDIENTS, []),
  ])

  const geminiPrompt = `You are a Hypixel SkyBlock economy expert. Analyze these two weapon crafting flips and give sharp, actionable advice in 3-4 sentences. Be direct and specific — mention which is better to craft right now and why.

Hyperion:
- Craft cost (no scrolls): ${(hyperion.craftCost / 1e6).toFixed(1)}M
- LBIN: ${(hyperion.lbin / 1e6).toFixed(1)}M
- Profit (no scrolls): ${(hyperion.profitNoScrolls / 1e6).toFixed(1)}M
- Margin: ${hyperion.marginNoScrolls.toFixed(1)}%
- Price volatility risk: ${hyperion.manipulationRisk}
- Estimated sell time: ${hyperion.estimatedSellDays} days

Terminator:
- Craft cost: ${(terminator.craftCost / 1e6).toFixed(1)}M
- LBIN: ${(terminator.lbin / 1e6).toFixed(1)}M
- Profit: ${(terminator.profitNoScrolls / 1e6).toFixed(1)}M
- Margin: ${terminator.marginNoScrolls.toFixed(1)}%
- Price volatility risk: ${terminator.manipulationRisk}
- Estimated sell time: ${terminator.estimatedSellDays} days

Which should be crafted, what's the main risk, and any timing advice?`

  const aiSummary = await askGemini(geminiPrompt)

  const result = {
    hyperion,
    terminator,
    aiSummary,
    fetchedAt: new Date().toISOString(),
  }

  cache = { data: result, ts: Date.now() }
  return NextResponse.json(result)
}
