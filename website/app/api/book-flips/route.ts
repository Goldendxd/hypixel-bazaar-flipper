import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const TAX = 0.0125
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? ''

// ── Enchantment book combining ───────────────────────────────────────────────
// 2× Tier N combine into 1× Tier N+1 on the anvil, so reaching tier T from
// tier i costs 2^(T−i) input books.
//
// HOUSE RULE: we only surface flips whose OUTPUT is Tier 5 or below
// (e.g. craft up to Ultimate Wise V). Tier 6/7 classic books are drop-only
// or phantom-bid traps and are deliberately excluded.
const MAX_OUTPUT_TIER = 5

// Liquidity gates
const MIN_EXIT_INSTABUYS_WEEK = 25   // people insta-buying the output (fills your sell offer)
const MIN_INPUT_FILL_RATIO    = 8    // input weekly insta-sells must be ≥ 8× the books you need

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

export interface BookFlipRow {
  outputId: string
  outputName: string
  enchantName: string
  inputId: string
  inputTier: number
  outputTier: number
  inputQty: number

  // Acquisition: place a buy order just above the top bid
  inputBuyOrder: number       // per book
  inputTotalCost: number      // buy order × qty
  inputInstaCost: number      // insta-buy total (impatient route)

  // Exit: place a sell offer just under the lowest ask
  outputSellOffer: number
  revenue: number             // sell offer × (1 − tax)
  profit: number              // patient route profit
  margin: number

  // Safety: what if you have to insta-sell into the top bid instead?
  instaExitProfit: number

  exitWeeklyInstabuys: number // how fast your sell offer fills
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
    const tier = parseInt(match[2], 10)
    if (tier < 1 || tier > 7) continue
    ;(enchants[match[1]] ??= {})[tier] = products[id].quick_status
  }

  const rows: BookFlipRow[] = []
  let totalCandidates = 0

  for (const [base, tiers] of Object.entries(enchants)) {
    const tierNums = Object.keys(tiers).map(Number).sort((a, b) => a - b)

    for (const outputTier of tierNums) {
      if (outputTier < 2 || outputTier > MAX_OUTPUT_TIER) continue
      const out = tiers[outputTier]

      // Exit liquidity: your sell offer is consumed by insta-buyers
      const exitVol = out.buyMovingWeek
      if (out.buyPrice <= 0 || exitVol < MIN_EXIT_INSTABUYS_WEEK) continue

      const outputSellOffer = Math.round((out.buyPrice - 0.1) * 100) / 100
      const revenue = Math.round(outputSellOffer * (1 - TAX) * 100) / 100
      const instaExitRevenue = Math.round(out.sellPrice * (1 - TAX) * 100) / 100

      let best: BookFlipRow | null = null

      for (const inputTier of tierNums) {
        if (inputTier >= outputTier) break
        const inp = tiers[inputTier]
        const qty = Math.pow(2, outputTier - inputTier)
        if (qty > 64) continue  // 6+ combine steps is not a realistic session

        // Acquisition: buy order at top bid + 0.1; needs insta-sellers to fill
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
          inputBuyOrder, inputTotalCost, inputInstaCost,
          outputSellOffer, revenue, profit, margin,
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

  // Clean flips first (by profit), flagged ones after
  rows.sort((a, b) => {
    if (!!a.warning !== !!b.warning) return a.warning ? 1 : -1
    return b.profit - a.profit
  })

  let aiSummary: string | null = null
  const top5 = rows.slice(0, 5)
  if (top5.length > 0) {
    aiSummary = await askGemini(
      `You are a Hypixel SkyBlock bazaar expert. Top 5 enchanted book combine flips right now (all outputs are Tier 5 or lower, crafted by combining lower-tier books):

${top5.map((r, i) =>
  `${i + 1}. Buy-order ${r.inputQty}× ${r.enchantName} ${ROMAN[r.inputTier]} @ ${r.inputBuyOrder.toLocaleString()} (total ${r.inputTotalCost.toLocaleString()}), combine to ${r.outputName}, sell-offer ${r.outputSellOffer.toLocaleString()} → profit ${r.profit.toLocaleString()} (${r.margin.toFixed(0)}%). Output insta-buys/wk: ${r.exitWeeklyInstabuys.toLocaleString()}`
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
