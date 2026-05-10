import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const TAX = 0.0125
const GEMINI_KEY = 'AIzaSyDtzLvCVeHYFLsp0DR3ftPyCwA7b_Evr50'

// Enchantment book combining on the anvil: 2× Tier N → 1× Tier N+1
// All routes checked: TN→TM where M > N, cost = 2^(M-N) × price(TN)
// We check every (inputTier, outputTier) pair where both exist on bazaar.

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

export interface BookFlipRow {
  outputId: string
  outputName: string
  enchantName: string
  inputId: string
  inputTier: number
  outputTier: number
  inputQty: number           // 2^(outputTier - inputTier)
  inputUnitPrice: number
  inputTotalCost: number
  outputSellPrice: number
  revenue: number
  profit: number
  margin: number
  sellVolume: number
  buyVolume: number
  iconUrl: string
}

async function askGemini(prompt: string): Promise<string | null> {
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

function enchantDisplayName(base: string, level: number): string {
  const name = base
    .replace(/^ENCHANTMENT_/, '')
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
  return `${name} ${ROMAN[level] ?? String(level)}`
}

function enchantBaseName(base: string): string {
  return base
    .replace(/^ENCHANTMENT_/, '')
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

async function compute(): Promise<{ rows: BookFlipRow[]; totalCandidates: number; aiSummary: string | null }> {
  const bazRes = await fetch('https://api.hypixel.net/v2/skyblock/bazaar', {
    signal: AbortSignal.timeout(15000),
  })
  if (!bazRes.ok) throw new Error(`Bazaar fetch failed: ${bazRes.status}`)
  const baz = await bazRes.json()

  const products = baz.products as Record<string, {
    quick_status: {
      buyPrice: number
      sellPrice: number
      buyMovingWeek: number
      sellMovingWeek: number
    }
  }>

  // Group enchants by base name → map of tier → quick_status
  const enchants: Record<string, Record<number, typeof products[string]['quick_status']>> = {}

  for (const id of Object.keys(products)) {
    if (!id.startsWith('ENCHANTMENT_')) continue
    const match = id.match(/^(.*?)_(\d+)$/)
    if (!match) continue
    const base = match[1]
    const tier = parseInt(match[2], 10)
    if (tier < 1 || tier > 7) continue
    if (!enchants[base]) enchants[base] = {}
    enchants[base][tier] = products[id].quick_status
  }

  const rows: BookFlipRow[] = []
  let totalCandidates = 0

  for (const [base, tiers] of Object.entries(enchants)) {
    const tierNums = Object.keys(tiers).map(Number).sort((a, b) => a - b)
    if (tierNums.length < 2) continue

    // Check every (inputTier → outputTier) pair where output > input
    for (let inIdx = 0; inIdx < tierNums.length - 1; inIdx++) {
      for (let outIdx = inIdx + 1; outIdx < tierNums.length; outIdx++) {
        const inputTier  = tierNums[inIdx]
        const outputTier = tierNums[outIdx]
        const steps      = outputTier - inputTier
        const inputQty   = Math.pow(2, steps)  // 2^steps books needed

        const inStatus  = tiers[inputTier]
        const outStatus = tiers[outputTier]

        const inBuy      = inStatus.buyPrice
        const outSell    = outStatus.sellPrice
        const outSellVol = outStatus.sellMovingWeek
        const outBuyVol  = outStatus.buyMovingWeek

        if (inBuy <= 0) continue      // not buyable at this tier
        if (outSellVol < 50) continue // no real exit liquidity

        totalCandidates++

        const inputTotalCost = Math.round(inBuy * inputQty * 100) / 100
        const sellOrder      = Math.round((outSell - 0.1) * 100) / 100
        const revenue        = Math.round(sellOrder * (1 - TAX) * 100) / 100
        const profit         = Math.round((revenue - inputTotalCost) * 100) / 100
        if (profit <= 0) continue

        const margin = Math.round((profit / inputTotalCost) * 10000) / 100

        const inputId  = `${base}_${inputTier}`
        const outputId = `${base}_${outputTier}`

        rows.push({
          outputId,
          outputName:     enchantDisplayName(base, outputTier),
          enchantName:    enchantBaseName(base),
          inputId,
          inputTier,
          outputTier,
          inputQty,
          inputUnitPrice:  Math.round(inBuy * 100) / 100,
          inputTotalCost,
          outputSellPrice: sellOrder,
          revenue,
          profit,
          margin,
          sellVolume:  outSellVol,
          buyVolume:   outBuyVol,
          iconUrl: `https://sky.shiiyu.moe/item/${outputId}`,
        })
      }
    }
  }

  // Deduplicate: for same (enchantBase, outputTier), keep only the best-profit input route
  const bestByOutput = new Map<string, BookFlipRow>()
  for (const row of rows) {
    const key = `${row.enchantName}__${row.outputTier}`
    const existing = bestByOutput.get(key)
    if (!existing || row.profit > existing.profit) {
      bestByOutput.set(key, row)
    }
  }

  const deduped = Array.from(bestByOutput.values())
  deduped.sort((a, b) => b.profit - a.profit)

  // Gemini analysis of top flips
  let aiSummary: string | null = null
  const top5 = deduped.slice(0, 5)
  if (top5.length > 0) {
    const prompt = `You are a Hypixel SkyBlock bazaar expert. Here are the top 5 enchantment book combine flips right now:

${top5.map((r, i) =>
  `${i + 1}. Buy ${r.inputQty}× ${r.enchantName} ${ROMAN[r.inputTier]} at ${r.inputUnitPrice.toLocaleString()} each (total ${r.inputTotalCost.toLocaleString()}), combine to ${r.enchantName} ${ROMAN[r.outputTier]}, sell ~${r.outputSellPrice.toLocaleString()} → profit ${r.profit.toLocaleString()} coins (${r.margin.toFixed(1)}% margin). Weekly sell vol: ${r.sellVolume.toLocaleString()}`
).join('\n')}

For each, give ONE short tip (max 15 words): is the volume real, is the price likely manipulated, or is it genuinely good? Format: numbered list 1-5 only.`

    aiSummary = await askGemini(prompt)
  }

  return { rows: deduped, totalCandidates, aiSummary }
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
