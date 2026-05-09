import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const TAX = 0.0125

export interface BookFlipRow {
  outputId: string
  outputName: string    // e.g. "Sharpness VII"
  enchantName: string   // e.g. "Sharpness"
  outputLevel: number
  inputId: string
  inputLevel: number
  inputQty: number      // always 2
  inputUnitPrice: number
  inputTotalCost: number
  outputSellPrice: number   // sell order (sellBid - 0.1)
  outputBuyPrice: number    // buyPrice (used for revenue calc)
  revenue: number
  profit: number
  margin: number
  sellVolume: number        // output weekly sell volume
  buyVolume: number         // output weekly buy volume
  iconUrl: string
}

function enchantDisplayName(id: string): string {
  // ENCHANTMENT_SHARPNESS_7 -> "Sharpness VII"
  const parts = id.split('_')
  const level = parseInt(parts[parts.length - 1])
  const name = parts.slice(1, -1)
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
  const roman = ['', 'I','II','III','IV','V','VI','VII','VIII','IX','X'][level] ?? String(level)
  return `${name} ${roman}`
}

function enchantBaseName(id: string): string {
  const parts = id.split('_')
  return parts.slice(1, -1)
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
}

async function compute(): Promise<{ rows: BookFlipRow[]; totalBooks: number }> {
  const bazRes = await fetch('https://api.hypixel.net/skyblock/bazaar', {
    signal: AbortSignal.timeout(15000),
  })
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  const baz = await bazRes.json()

  const products = baz.products as Record<string, {
    quick_status: {
      buyPrice: number; sellPrice: number
      buyMovingWeek: number; sellMovingWeek: number
    }
  }>

  // Group enchantments by base name and level
  const enchMap: Record<string, Record<number, {
    buy: number; sell: number; sellVol: number; buyVol: number
  }>> = {}

  let totalBooks = 0
  for (const [id, p] of Object.entries(products)) {
    if (!id.startsWith('ENCHANTMENT_')) continue
    totalBooks++
    const parts = id.split('_')
    const level = parseInt(parts[parts.length - 1])
    if (!Number.isInteger(level)) continue
    const base = parts.slice(0, -1).join('_')
    if (!enchMap[base]) enchMap[base] = {}
    const q = p.quick_status
    enchMap[base][level] = {
      buy: q.buyPrice,
      sell: q.sellPrice,
      sellVol: q.sellMovingWeek,
      buyVol: q.buyMovingWeek,
    }
  }

  const rows: BookFlipRow[] = []

  for (const [base, levels] of Object.entries(enchMap)) {
    const levelNums = Object.keys(levels).map(Number).sort((a, b) => a - b)
    for (let i = 0; i < levelNums.length - 1; i++) {
      const fromLvl = levelNums[i]
      const toLvl = levelNums[i + 1]
      if (toLvl !== fromLvl + 1) continue  // only sequential combines

      const lower = levels[fromLvl]
      const upper = levels[toLvl]
      if (!lower || !upper || lower.buy <= 0 || upper.sell <= 0) continue

      const inputTotalCost = Math.round(lower.buy * 2 * 100) / 100
      const sellOrder = Math.round((upper.sell - 0.1) * 100) / 100
      const revenue = Math.round(sellOrder * (1 - TAX) * 100) / 100
      const profit = Math.round((revenue - inputTotalCost) * 100) / 100
      if (profit <= 0) continue

      const margin = Math.round((profit / inputTotalCost) * 10000) / 100
      if (upper.sellVol < 5) continue  // must have some volume

      const outputId = `${base}_${toLvl}`
      rows.push({
        outputId,
        outputName: enchantDisplayName(outputId),
        enchantName: enchantBaseName(outputId),
        outputLevel: toLvl,
        inputId: `${base}_${fromLvl}`,
        inputLevel: fromLvl,
        inputQty: 2,
        inputUnitPrice: Math.round(lower.buy * 100) / 100,
        inputTotalCost,
        outputSellPrice: sellOrder,
        outputBuyPrice: Math.round(upper.buy * 100) / 100,
        revenue,
        profit,
        margin,
        sellVolume: upper.sellVol,
        buyVolume: upper.buyVol,
        iconUrl: `https://sky.coflnet.com/static/icon/${outputId}`,
      })
    }
  }

  rows.sort((a, b) => b.profit - a.profit)
  return { rows, totalBooks }
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
