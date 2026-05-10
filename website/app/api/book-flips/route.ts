import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const TAX = 0.0125

// ── Combining math ────────────────────────────────────────────────────────────
// 2× Tier N → 1× Tier N+1 on the anvil.
// Tier 5 from Tier 1 requires: 2^4 = 16× Tier 1.
const T1_QTY = 16

// ── Display name helpers ──────────────────────────────────────────────────────
function enchantDisplayName(base: string, level: number): string {
  const name = base
    .replace(/^ENCHANTMENT_/, '')
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
  const roman = ['', 'I', 'II', 'III', 'IV', 'V'][level] ?? String(level)
  return `${name} ${roman}`
}

function enchantBaseName(base: string): string {
  return base
    .replace(/^ENCHANTMENT_/, '')
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

export interface BookFlipRow {
  outputId: string
  outputName: string
  enchantName: string
  inputId: string
  inputQty: number        // 16 (= 2^4 to reach tier 5 from tier 1)
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

async function compute(): Promise<{ rows: BookFlipRow[]; totalCandidates: number }> {
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

  const rows: BookFlipRow[] = []
  let totalCandidates = 0

  for (const id of Object.keys(products)) {
    if (!id.startsWith('ENCHANTMENT_')) continue
    if (!id.endsWith('_1')) continue

    const base = id.slice(0, -2) // strip "_1" suffix
    const t1Id = `${base}_1`
    const t5Id = `${base}_5`

    // Both tier 1 and tier 5 must exist on the bazaar
    const t1 = products[t1Id]
    const t5 = products[t5Id]
    if (!t1 || !t5) continue

    totalCandidates++

    const t1Buy     = t1.quick_status.buyPrice
    const t5Sell    = t5.quick_status.sellPrice
    const t5SellVol = t5.quick_status.sellMovingWeek
    const t5BuyVol  = t5.quick_status.buyMovingWeek

    // Tier 1 must be actually purchasable at a non-zero price
    if (t1Buy <= 0) continue

    // Tier 5 must have meaningful sell volume
    if (t5SellVol < 100) continue

    const inputTotalCost = Math.round(t1Buy * T1_QTY * 100) / 100
    const sellOrder      = Math.round((t5Sell - 0.1) * 100) / 100
    const revenue        = Math.round(sellOrder * (1 - TAX) * 100) / 100
    const profit         = Math.round((revenue - inputTotalCost) * 100) / 100
    if (profit <= 0) continue

    const margin = Math.round((profit / inputTotalCost) * 10000) / 100

    rows.push({
      outputId:        t5Id,
      outputName:      enchantDisplayName(base, 5),
      enchantName:     enchantBaseName(base),
      inputId:         t1Id,
      inputQty:        T1_QTY,
      inputUnitPrice:  Math.round(t1Buy * 100) / 100,
      inputTotalCost,
      outputSellPrice: sellOrder,
      revenue,
      profit,
      margin,
      sellVolume:  t5SellVol,
      buyVolume:   t5BuyVol,
      iconUrl: `https://sky.shiiyu.moe/item/${t5Id}`,
    })
  }

  rows.sort((a, b) => b.profit - a.profit)
  return { rows, totalCandidates }
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
