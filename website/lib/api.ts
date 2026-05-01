// Hypixel Bazaar API field semantics (confirmed from live data):
//   quick_status.buyPrice  = lowest ask  (you pay this to buy instantly)
//   quick_status.sellPrice = highest bid (you get this when selling instantly)
//   buyPrice > sellPrice is normal — the spread is your flip opportunity

export interface BazaarProduct {
  product_id: string
  quick_status: {
    productId: string
    buyPrice: number        // lowest ask — what you pay to buy instantly
    buyVolume: number
    buyMovingWeek: number
    buyOrders: number
    sellPrice: number       // highest bid — what you get selling instantly
    sellVolume: number
    sellMovingWeek: number
    sellOrders: number
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

  // Order flip: post buy order just above top bid, sell order just below lowest ask
  buyOrder: number        // bid price + 0.1  (you post this buy order)
  sellOrder: number       // ask price - 0.1  (you post this sell order)
  orderProfit: number     // per item after 1.25% sell tax
  orderMargin: number     // %

  // Instant flip: pay ask, get bid immediately
  instantBuyPrice: number   // = buyPrice  (lowest ask)
  instantSellPrice: number  // = sellPrice (highest bid)
  instantProfit: number
  instantMargin: number

  weeklyVolume: number      // buyMovingWeek
  sellMovingWeek: number
  buyOrders: number
  sellOrders: number
  fillScore: number         // 0–100
  flipType: 'instant' | 'order'
}

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

export async function fetchBazaarFlips(): Promise<FlipRow[]> {
  const res = await fetch('/api/bazaar', { cache: 'no-store' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data: BazaarResponse = await res.json()

  const products = Object.values(data.products)
  const maxVol = Math.max(...products.map((p) => p.quick_status.buyMovingWeek))

  const rows: FlipRow[] = []

  for (const product of products) {
    const { quick_status: q } = product
    const id = product.product_id

    // Need real prices and activity
    if (!q.buyPrice || !q.sellPrice || q.buyMovingWeek === 0) continue

    // buyPrice = ask, sellPrice = bid. Normal: ask > bid.
    const spread = q.buyPrice - q.sellPrice
    if (spread <= 0) continue

    // Order flip: undercut both sides by 0.1 to jump the queue
    // Buy order at (sellPrice + 0.1) — just above the top bid
    // Sell order at (buyPrice - 0.1) — just below the lowest ask
    const buyOrder = fmt(q.sellPrice + 0.1)
    const sellOrder = fmt(q.buyPrice - 0.1)
    const orderProfit = fmt(sellOrder * (1 - TAX) - buyOrder)
    const orderMargin = fmt((orderProfit / buyOrder) * 100)

    // Instant flip: pay ask, receive bid immediately
    const instantProfit = fmt(q.sellPrice * (1 - TAX) - q.buyPrice)
    const instantMargin = fmt((instantProfit / q.buyPrice) * 100)

    const volScore = Math.min(100, (q.buyMovingWeek / maxVol) * 100)
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
      instantBuyPrice: q.buyPrice,
      instantSellPrice: q.sellPrice,
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
