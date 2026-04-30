export interface BazaarProduct {
  product_id: string
  quick_status: {
    productId: string
    sellPrice: number   // lowest instant-sell ask  (what sellers ask)
    sellVolume: number
    sellMovingWeek: number
    sellOrders: number
    buyPrice: number    // highest instant-buy bid   (what buyers offer)
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

  // ── Instant flip (no waiting) ──────────────────────────────────────────────
  // Buy at lowest ask (sellPrice), immediately resell at highest bid (buyPrice)
  instantBuyPrice: number
  instantSellPrice: number
  instantProfit: number   // per item, after tax
  instantMargin: number   // %

  // ── Order flip (place orders, wait for fills) ──────────────────────────────
  // Post buy order 1 coin above highest bid → fills before queue
  // Post sell order 1 coin below lowest ask → fills before queue
  buyOrder: number        // price you post your buy order at
  sellOrder: number       // price you post your sell order at
  orderProfit: number     // per item gross, after tax
  orderMargin: number     // %

  // ── Liquidity / fill-speed signals ────────────────────────────────────────
  weeklyVolume: number    // buyMovingWeek
  buyOrders: number       // # of open buy orders (competition for your buy)
  sellOrders: number      // # of open sell orders (competition for your sell)
  fillScore: number       // 0–100 composite: high vol + few orders = fast fill

  flipType: 'instant' | 'order'
}

const BAZAAR_URL = 'https://api.hypixel.net/skyblock/bazaar'
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

// Normalise a value in [0, max] to [0, 100]
function norm(val: number, max: number): number {
  return Math.min(100, (val / max) * 100)
}

export async function fetchBazaarFlips(): Promise<FlipRow[]> {
  const res = await fetch(BAZAAR_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Hypixel API error: ${res.status}`)
  const data: BazaarResponse = await res.json()

  const products = Object.values(data.products)

  // Pre-compute max weekly volume for normalisation
  const maxVol = Math.max(...products.map((p) => p.quick_status.buyMovingWeek))

  const rows: FlipRow[] = []

  for (const product of products) {
    const { quick_status: q } = product
    const id = product.product_id

    // Must have real prices and real market activity
    if (!q.buyPrice || !q.sellPrice || q.buyMovingWeek < 1000) continue
    // Skip items with negative spread (market is crossed / stale)
    if (q.sellPrice <= q.buyPrice) continue

    // ── Instant flip ────────────────────────────────────────────────────────
    // You pay the lowest ask (sellPrice), get the highest bid (buyPrice) back
    const instantProfit = fmt(q.buyPrice * (1 - TAX) - q.sellPrice)
    const instantMargin = fmt((instantProfit / q.sellPrice) * 100)

    // ── Order flip ──────────────────────────────────────────────────────────
    // Post buy order at (buyPrice + 0.1) — 1 tick above top bid → fills first
    // Post sell order at (sellPrice - 0.1) — 1 tick below lowest ask → fills first
    // The spread between ask and bid is your gross profit
    const buyOrder = fmt(q.buyPrice + 0.1)
    const sellOrder = fmt(q.sellPrice - 0.1)
    const orderProfit = fmt(sellOrder * (1 - TAX) - buyOrder)
    const orderMargin = fmt((orderProfit / buyOrder) * 100)

    // ── Fill score ──────────────────────────────────────────────────────────
    // Higher volume = faster fills. More open orders = more competition = slower.
    // Score = 70% volume signal + 30% order-depth signal
    const volScore = norm(q.buyMovingWeek, maxVol) // 0–100, high = good
    const depthPenalty = Math.min(100, ((q.buyOrders + q.sellOrders) / 200) * 100)
    const fillScore = Math.round(volScore * 0.7 + (100 - depthPenalty) * 0.3)

    rows.push({
      id,
      name: formatName(id),
      iconUrl: iconUrl(id),
      instantBuyPrice: q.sellPrice,
      instantSellPrice: q.buyPrice,
      instantProfit,
      instantMargin,
      buyOrder,
      sellOrder,
      orderProfit,
      orderMargin,
      weeklyVolume: q.buyMovingWeek,
      buyOrders: q.buyOrders,
      sellOrders: q.sellOrders,
      fillScore,
      flipType: 'instant',
    })
  }

  return rows
}
