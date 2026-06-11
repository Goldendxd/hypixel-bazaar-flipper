import { NextResponse } from 'next/server'
import { BAZAAR_TAX, bazaarNet } from '@/lib/economy'

export const dynamic = 'force-dynamic'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? ''

// ── Enchantment combining model ──────────────────────────────────────────────
// Anvil combining is a strict binary tree: 2× Tier N → 1× Tier N+1.
// Reaching tier T from base tier B therefore costs 2^(T−B) base books and
// 2^(T−B) − 1 anvil combines (exponential compounding, not linear).
//
// HOUSE RULES:
//  • Output is capped at Tier V (e.g. Ultimate Wise V). Classic T6/T7 books
//    are drop-only and their bids are routinely phantom.
//  • Stacking enchants (Expertise, Compact, …) level through gameplay, not
//    anvil combining — they are excluded entirely.
const MAX_OUTPUT_TIER = 5

const NON_COMBINABLE = new Set([
  'ENCHANTMENT_EXPERTISE',
  'ENCHANTMENT_COMPACT',
  'ENCHANTMENT_CULTIVATING',
  'ENCHANTMENT_CHAMPION',
  'ENCHANTMENT_HECATOMB',
  'ENCHANTMENT_TOXOPHILITE',
  'ENCHANTMENT_LAPIDARY',
])

// Liquidity gates
const MIN_EXIT_INSTABUYS_WEEK = 25   // insta-buys consuming your sell offer
const MIN_INPUT_FILL_RATIO    = 8    // input insta-sells must cover your order 8×

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

export interface BookFlipRow {
  outputId: string
  outputName: string
  enchantName: string
  inputId: string
  inputTier: number          // entry tier you actually buy
  outputTier: number
  inputQty: number           // books bought at entry tier
  baseTier: number           // lowest tier listed on the bazaar for this enchant
  t1Equivalent: number       // how many base-tier books this route represents
  combineSteps: number       // anvil operations required (2^k − 1)

  // Acquisition — both execution styles
  inputBuyOrder: number      // per book, patient buy order
  inputTotalCost: number     // buy-order route total (primary)
  inputInstaCost: number     // instant-buy route total

  // Exit — both execution styles
  outputSellOffer: number    // patient sell offer (ask − 0.1)
  outputInstaSell: number    // instant sell into the top bid

  // Tax-aware results (buy-order in → sell-offer out is the primary route)
  grossRevenue: number
  bazaarTax: number
  revenue: number            // net of tax
  profit: number             // NET profit, primary metric
  margin: number             // ROI %
  instaExitProfit: number    // net if you must insta-sell instead

  exitWeeklyInstabuys: number
  inputWeeklyInstasells: number
  iconUrl: string
  warning: string | null
}

async function askGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_KEY) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(12000),
      }
    )
    if (!res.ok) return null
    const j = await res.json()
    return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
  } catch { return null }
}

function baseName(base: string): string {
  return base
    .replace(/^ENCHANTMENT_/, '')
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

type QS = { buyPrice: number; sellPrice: number; buyMovingWeek: number; sellMovingWeek: number }

async function compute(): Promise<{ rows: BookFlipRow[]; totalCandidates: number; aiSummary: string | null }> {
  const bazRes = await fetch('https://api.hypixel.net/v2/skyblock/bazaar', { signal: AbortSignal.timeout(15000) })
  if (!bazRes.ok) throw new Error(`Bazaar fetch failed: ${bazRes.status}`)
  const baz = await bazRes.json()
  const products = baz.products as Record<string, { quick_status: QS }>

  // Group enchant products by base name → tier → quick_status
  const enchants: Record<string, Record<number, QS>> = {}
  for (const id of Object.keys(products)) {
    if (!id.startsWith('ENCHANTMENT_')) continue
    const match = id.match(/^(.*?)_(\d+)$/)
    if (!match) continue
    if (NON_COMBINABLE.has(match[1])) continue
    const tier = parseInt(match[2], 10)
    if (tier < 1 || tier > 7) continue
    ;(enchants[match[1]] ??= {})[tier] = products[id].quick_status
  }

  const rows: BookFlipRow[] = []
  let totalCandidates = 0

  for (const [base, tiers] of Object.entries(enchants)) {
    const tierNums = Object.keys(tiers).map(Number).sort((a, b) => a - b)
    if (tierNums.length < 2) continue       // stacking/single-tier books can't be combined upward
    const baseTier = tierNums[0]

    for (const outputTier of tierNums) {
      if (outputTier <= baseTier || outputTier > MAX_OUTPUT_TIER) continue
      const out = tiers[outputTier]

      // Exit liquidity: your sell offer is consumed by insta-buyers
      const exitVol = out.buyMovingWeek
      if (out.buyPrice <= 0 || exitVol < MIN_EXIT_INSTABUYS_WEEK) continue

      const outputSellOffer = Math.round((out.buyPrice - 0.1) * 100) / 100
      const outputInstaSell = Math.round(out.sellPrice * 100) / 100
      const revenue = Math.round(bazaarNet(outputSellOffer) * 100) / 100
      const instaExitRevenue = Math.round(bazaarNet(outputInstaSell) * 100) / 100

      // Default entry is the base tier (the spec model: buy T1s, compound up).
      // A higher listed tier is allowed as entry only when it is strictly
      // cheaper per base-equivalent — buying pre-combined books is still
      // "crafting upward", just with fewer anvil steps.
      let best: BookFlipRow | null = null

      for (const inputTier of tierNums) {
        if (inputTier >= outputTier) break
        const inp = tiers[inputTier]
        const qty = Math.pow(2, outputTier - inputTier)
        if (qty > 64) continue   // > 6 combine levels isn't a realistic session

        if (inp.sellPrice <= 0 && inp.buyPrice <= 0) continue
        const unitOrder = inp.sellPrice > 0 ? inp.sellPrice + 0.1 : inp.buyPrice
        if (inp.sellMovingWeek < qty * MIN_INPUT_FILL_RATIO) continue

        totalCandidates++

        const inputBuyOrder = Math.round(unitOrder * 100) / 100
        const inputTotalCost = Math.round(unitOrder * qty * 100) / 100
        const inputInstaCost = Math.round(inp.buyPrice * qty * 100) / 100

        const profit = Math.round((revenue - inputTotalCost) * 100) / 100
        if (profit <= 0) continue
        const margin = Math.round((profit / inputTotalCost) * 10000) / 100
        const instaExitProfit = Math.round((instaExitRevenue - inputTotalCost) * 100) / 100

        let warning: string | null = null
        if (margin > 200) {
          warning = 'Margin >200% — the ask is probably a bait listing; your offer may sit for days'
        } else if (instaExitProfit < 0 && profit > 0) {
          warning = 'Profit depends entirely on a patient sell offer — insta-sell exit is a loss'
        } else if (exitVol < 80) {
          warning = `Only ${exitVol} insta-buys/week on the output — slow exit`
        }

        const candidate: BookFlipRow = {
          outputId: `${base}_${outputTier}`,
          outputName: `${baseName(base)} ${ROMAN[outputTier]}`,
          enchantName: baseName(base),
          inputId: `${base}_${inputTier}`,
          inputTier, outputTier, inputQty: qty,
          baseTier,
          t1Equivalent: Math.pow(2, outputTier - baseTier),
          combineSteps: qty - 1,
          inputBuyOrder, inputTotalCost, inputInstaCost,
          outputSellOffer, outputInstaSell,
          grossRevenue: outputSellOffer,
          bazaarTax: Math.round(outputSellOffer * BAZAAR_TAX * 100) / 100,
          revenue, profit, margin,
          instaExitProfit,
          exitWeeklyInstabuys: exitVol,
          inputWeeklyInstasells: inp.sellMovingWeek,
          iconUrl: `https://sky.shiiyu.moe/item/ENCHANTED_BOOK`,
          warning,
        }
        if (!best || candidate.profit > best.profit) best = candidate
      }

      if (best) rows.push(best)
    }
  }

  // Clean flips first (by net profit), flagged ones after
  rows.sort((a, b) => {
    if (!!a.warning !== !!b.warning) return a.warning ? 1 : -1
    return b.profit - a.profit
  })

  let aiSummary: string | null = null
  const top5 = rows.slice(0, 5)
  if (top5.length > 0) {
    aiSummary = await askGemini(
      `You are a Hypixel SkyBlock bazaar expert. Top 5 enchanted book combine flips right now (all Tier 5 or lower, crafted by anvil-combining lower tiers — 2^k compounding):

${top5.map((r, i) =>
  `${i + 1}. Buy-order ${r.inputQty}× ${r.enchantName} ${ROMAN[r.inputTier]} @ ${r.inputBuyOrder.toLocaleString()} (total ${r.inputTotalCost.toLocaleString()}), ${r.combineSteps} combines to ${r.outputName}, sell-offer ${r.outputSellOffer.toLocaleString()} → NET profit ${r.profit.toLocaleString()} (${r.margin.toFixed(0)}% ROI). Output insta-buys/wk: ${r.exitWeeklyInstabuys.toLocaleString()}`
).join('\n')}

For each give ONE short tip (max 15 words): real volume, manipulation risk, or genuinely good? Numbered list 1-5 only.`
    )
  }

  return { rows, totalCandidates, aiSummary }
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
