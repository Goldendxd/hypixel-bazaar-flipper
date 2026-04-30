export interface BazaarProduct {
  product_id: string
  quick_status: {
    productId: string
    sellPrice: number   // lowest ask  (sellers want this much)
    sellVolume: number
    sellMovingWeek: number
    sellOrders: number
    buyPrice: number    // highest bid (buyers offer this much)
    buyVolume: number
    buyMovingWeek: number
    buyOrders: number
  }
}

export interface BazaarResponse {
  success: boolean
  lastUpdated: number
  products: Record<string, BazaarProduct>
}

export interface FlipRow {
  id: string
  name: string
  iconUrl: string

  // ── Order flip (the main money-maker) ─────────────────────────────────────
  // Post buy order just above top bid → you fill before the queue
  // Post sell order just below lowest ask → you fill before the queue
  // Profit = spread minus 1.25% sell tax
  buyOrder: number
  sellOrder: number
  orderProfit: number   // per item, after tax
  orderMargin: number   // %

  // ── Instant flip (buy ask, sell bid immediately) ───────────────────────────
  instantBuyPrice: number   // = sellPrice (lowest ask) — what you pay
  instantSellPrice: number  // = buyPrice  (highest bid) — what you get back
  instantProfit: number     // usually negative — buying spread, not closing it
  instantMargin: number     // %

  // ── Liquidity signals ─────────────────────────────────────────────────────
  weeklyVolume: number      // buyMovingWeek
  sellMovingWeek: number    // sellMovingWeek
  buyOrders: number         // current open buy orders
  sellOrders: number        // current open sell orders
  fillScore: number         // 0–100; high = fast fills

  flipType: 'instant' | 'order'
}

const BAZAAR_URL = '/api/bazaar'
const TAX = 0.0125

export function formatName(id: string): string {
  return id
    .split(/[_:]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function iconUrl(id: string): string {
  return `https://sky.shiiyu.moe/item/${id}`
}

function fmt(n: number): number {
  return Math.round(n * 100) / 100
}

function norm(val: number, max: number): number {
  return Math.min(100, (val / max) * 100)
}

export async function fetchBazaarFlips(): Promise<FlipRow[]> {
  const res = await fetch(BAZAAR_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Hypixel API ${res.status}`)
  const data: BazaarResponse = await res.json()

  const products = Object.values(data.products)
  const maxVol = Math.max(...products.map((p) => p.quick_status.buyMovingWeek))

  const rows: FlipRow[] = []

  for (const product of products) {
    const { quick_status: q } = product
    const id = product.product_id

    if (!q.buyPrice || !q.sellPrice || q.buyMovingWeek === 0) continue

    // buyPrice = highest bid, sellPrice = lowest ask
    // In a healthy Bazaar market, buyPrice should be below sellPrice.
    // If the spread is inverted or flat, there is no order-flip opportunity.
    const spread = q.buyPrice - q.sellPrice
    if (spread <= 0) continue

    // ── Order flip ──────────────────────────────────────────────────────────
    // Undercut queue by 0.1 on both sides
    const buyOrder = fmt(q.buyPrice + 0.1)
    const sellOrder = fmt(q.sellPrice - 0.1)
    const orderProfit = fmt(sellOrder * (1 - TAX) - buyOrder)
    const orderMargin = fmt((orderProfit / buyOrder) * 100)

    // ── Instant flip ────────────────────────────────────────────────────────
    // Pay the ask, get the bid back — almost always a loss on tightly priced items
    const instantProfit = fmt(q.buyPrice * (1 - TAX) - q.sellPrice)
    const instantMargin = fmt((instantProfit / q.sellPrice) * 100)

    // ── Fill score ──────────────────────────────────────────────────────────
    const volScore = norm(q.buyMovingWeek, maxVol)
    const depthPenalty = Math.min(100, ((q.buyOrders + q.sellOrders) / 200) * 100)
    const fillScore = Math.round(volScore * 0.7 + (100 - depthPenalty) * 0.3)

    rows.push({
      id,
      name: formatName(id),
      iconUrl: iconUrl(id),
      buyOrder,
      sellOrder,
      orderProfit,
      orderMargin,
      instantBuyPrice: q.sellPrice,
      instantSellPrice: q.buyPrice,
      instantProfit,
      instantMargin,
      weeklyVolume: q.buyMovingWeek,
      sellMovingWeek: q.sellMovingWeek,
      buyOrders: q.buyOrders,
      sellOrders: q.sellOrders,
      fillScore,
      flipType: 'instant',
    })
  }

  return rows
}
