import { BazaarResponse, formatName, iconUrl } from '@/lib/api'

export type FlipStrategy = 'craft' | 'fusion'

export interface StrategyRow {
  id: string
  name: string
  iconUrl: string
  buyOrder: number
  sellOrder: number
  totalCost: number
  profitPerItem: number
  margin: number
  qty: number
  weeklyVolume: number
  sellMovingWeek: number
  buyOrders: number
  sellOrders: number
  fillScore: number
  score: number
  note: string
}

const TAX = 0.0125
const BUDGET = 10_000_000
const MAX_QTY = 71_680

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildRows(data: BazaarResponse, strategy: FlipStrategy): StrategyRow[] {
  const products = Object.values(data.products)
  const maxVol = Math.max(...products.map((product) => product.quick_status.buyMovingWeek), 1)

  const rows: StrategyRow[] = []

  for (const product of products) {
    const q = product.quick_status
    if (!q.buyPrice || !q.sellPrice || q.buyPrice <= q.sellPrice || q.buyMovingWeek <= 0) continue

    const buyOrder = round2(q.sellPrice + 0.1)
    const sellOrder = round2(q.buyPrice - 0.1)
    const profitPerItem = round2(sellOrder * (1 - TAX) - buyOrder)
    const margin = buyOrder > 0 ? round2((profitPerItem / buyOrder) * 100) : 0
    if (profitPerItem <= 0) continue

    const qty = Math.max(1, Math.min(Math.floor(BUDGET / buyOrder), MAX_QTY))
    const totalCost = round2(buyOrder * qty)
    const weeklyVolume = q.buyMovingWeek
    const fillScore = Math.round(
      Math.min(100, (weeklyVolume / maxVol) * 100) * 0.7 +
      (100 - Math.min(100, ((q.buyOrders + q.sellOrders) / 200) * 100)) * 0.3
    )

    const liquidity = weeklyVolume / maxVol
    const depth = 1 - Math.min(1, (q.buyOrders + q.sellOrders) / 200)
    const liquidityBoost = 1 + liquidity * (strategy === 'craft' ? 0.7 : 0.35)
    const depthBoost = 1 + depth * (strategy === 'craft' ? 0.25 : 0.15)
    const marginBoost = 1 + (margin / (strategy === 'craft' ? 240 : 70))
    const fillBoost = 1 + (fillScore / (strategy === 'craft' ? 120 : 180))
    const bankrollPenalty = strategy === 'craft'
      ? 1
      : 1 - Math.min(0.25, totalCost / 40_000_000)

    const score = round2(profitPerItem * qty * liquidityBoost * depthBoost * marginBoost * fillBoost * bankrollPenalty)

    const note = strategy === 'craft'
      ? 'Craft-style: high liquidity, good fill score, and stable spread.'
      : 'Fusion-style: higher margin and capital efficiency with solid liquidity.'

    if (strategy === 'craft') {
      if (weeklyVolume < 25_000 || fillScore < 50 || margin < 6) continue
    } else {
      if (margin < 9 || fillScore < 35) continue
    }

    rows.push({
      id: product.product_id,
      name: formatName(product.product_id),
      iconUrl: iconUrl(product.product_id),
      buyOrder,
      sellOrder,
      totalCost,
      profitPerItem,
      margin,
      qty,
      weeklyVolume,
      sellMovingWeek: q.sellMovingWeek,
      buyOrders: q.buyOrders,
      sellOrders: q.sellOrders,
      fillScore,
      score,
      note,
    })
  }

  return rows.sort((a, b) => b.score - a.score)
}

export async function fetchStrategyRows(strategy: FlipStrategy): Promise<StrategyRow[]> {
  const res = await fetch('/api/bazaar', { cache: 'no-store' })
  if (!res.ok) throw new Error(`API error ${res.status}`)

  const data: BazaarResponse = await res.json()
  return buildRows(data, strategy)
}
