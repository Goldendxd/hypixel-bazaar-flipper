// Hypixel Bazaar API field semantics (verified against live data):
//   buy_summary  = the side YOU can buy from → buy_summary[0]  = LOWEST ASK
//   sell_summary = the side YOU can sell to  → sell_summary[0] = HIGHEST BID
//   (named from the player's action, not the order type)
//   quick_status.buyPrice/sellPrice are weighted averages of the top 2% of
//   each side — they drift from the real top-of-book, sometimes by hundreds
//   of thousands of coins. Order placement must use the summaries;
//   quick_status is only good for volume statistics.

export interface BazaarProduct {
  product_id: string
  buy_summary: Array<{ amount: number; pricePerUnit: number; orders: number }>   // asks (low → high)
  sell_summary: Array<{ amount: number; pricePerUnit: number; orders: number }>  // bids (high → low)
  quick_status: {
    productId: string
    buyPrice: number        // weighted avg ask — stats only
    buyVolume: number
    buyMovingWeek: number
    buyOrders: number
    sellPrice: number       // weighted avg bid — stats only
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

  // Fast flip: pay ask, get bid immediately
  instantBuyPrice: number   // = buyPrice  (lowest ask)
  instantSellPrice: number  // = sellPrice (highest bid)
  instantProfit: number
  instantMargin: number

  // Hybrid arbitrage: patient buy order in, instant-sell out (quick exit)
  hybridProfit: number
  hybridMargin: number

  weeklyVolume: number      // buyMovingWeek
  sellMovingWeek: number
  buyOrders: number
  sellOrders: number

  // ── Execution intelligence ──
  fillScore: number         // 0–100 composite (legacy, kept for UI compat)
  liquidityScore: number    // 0–100 — how fast this item actually moves
  fillProbability: number   // 0–100 — chance both your orders fill in reasonable time
  stabilityScore: number    // 0–100 — higher = calmer market (from spread sanity)
  manipulationFlag: boolean // margin too good to be true on thin volume
  manipulationReason: string | null
  hourlyThroughput: number  // items/hour the market actually trades

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
  return `https://sky.shiiyu.moe/api/item/${id}`
}

// Ordered fallback chain for item icons
export const iconFallbacks = (id: string): string[] => [
  `https://sky.shiiyu.moe/api/item/${id}`,
  `https://sky.lea.moe/api/item/${id}`,
]

function fmt(n: number): number {
  return Math.round(n * 100) / 100
}

export interface BazaarFlipsResult {
  rows: FlipRow[]
  totalProducts: number
}

export async function fetchBazaarFlips(): Promise<BazaarFlipsResult> {
  const res = await fetch('/api/bazaar', { cache: 'no-store' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data: BazaarResponse = await res.json()

  const products = Object.values(data.products)
  const totalProducts = products.length

  const rows: FlipRow[] = []

  for (const product of products) {
    const { quick_status: q } = product
    const id = product.product_id

    // Real top-of-book prices; quick_status only as a last-resort fallback
    const ask = product.buy_summary?.[0]?.pricePerUnit ?? q.buyPrice   // insta-buy cost
    const bid = product.sell_summary?.[0]?.pricePerUnit ?? q.sellPrice  // insta-sell receive
    if (!ask || !bid || ask <= 0 || bid <= 0) continue
    const spread = ask - bid
    if (spread <= 0) continue

    // Order flip: outbid the top bid and undercut the lowest ask by 0.1
    const buyOrder = fmt(bid + 0.1)
    const sellOrder = fmt(ask - 0.1)
    const orderProfit = fmt(sellOrder * (1 - TAX) - buyOrder)
    const orderMargin = fmt((orderProfit / buyOrder) * 100)
    if (orderProfit <= 0) continue

    // Fast flip: pay ask, receive bid immediately (almost always negative — shown for reference)
    const instantProfit = fmt(bid * (1 - TAX) - ask)
    const instantMargin = fmt((instantProfit / ask) * 100)

    // Hybrid: patient buy order in, instant-sell out — fast liquidation exit
    const hybridProfit = fmt(bid * (1 - TAX) - buyOrder)
    const hybridMargin = fmt((hybridProfit / buyOrder) * 100)

    // ── Liquidity: log-scaled on the THINNER side of the market ──
    // You must both buy AND sell — the slower side bounds your real throughput.
    const minWeek = Math.min(q.buyMovingWeek, q.sellMovingWeek)
    const liquidityScore = Math.min(100, Math.round(Math.log10(Math.max(1, minWeek)) * 18))
    const hourlyThroughput = fmt(minWeek / 168)

    // ── Fill probability: throughput vs order book competition ──
    // More open orders on the book = more people waiting in line ahead of you.
    const competition = Math.max(1, q.buyOrders + q.sellOrders)
    const fillProbability = Math.min(100, Math.round(
      (hourlyThroughput / (hourlyThroughput + competition * 8)) * 130 + liquidityScore * 0.35
    ))

    // ── Stability: tight spread relative to price = stable two-sided market ──
    const spreadPct = (spread / ask) * 100
    const stabilityScore = Math.max(0, Math.min(100, Math.round(100 - spreadPct * 3)))

    // ── Manipulation detection ──
    let manipulationReason: string | null = null
    if (orderMargin > 100) {
      manipulationReason = 'Margin >100% — almost certainly a pumped or dead market'
    } else if (orderMargin > 25 && minWeek < 5_000) {
      manipulationReason = 'Huge margin on thin volume — classic manipulation signature'
    } else if (q.sellOrders < 3 && q.buyOrders < 3 && orderMargin > 15) {
      manipulationReason = 'Nearly empty order book — price discovery unreliable'
    } else if (bid < ask * 0.2 && ask > 10_000) {
      manipulationReason = 'Bid collapsed far below ask — one-sided market'
    }
    const manipulationFlag = manipulationReason !== null

    // Legacy composite fill score (kept for existing UI)
    const fillScore = Math.round(liquidityScore * 0.5 + fillProbability * 0.3 + stabilityScore * 0.2)

    rows.push({
      id,
      name: formatName(id),
      iconUrl: iconUrl(id),
      buyOrder,
      sellOrder,
      orderProfit,
      orderMargin,
      instantBuyPrice: fmt(ask),
      instantSellPrice: fmt(bid),
      instantProfit,
      instantMargin,
      hybridProfit,
      hybridMargin,
      weeklyVolume: q.buyMovingWeek,
      sellMovingWeek: q.sellMovingWeek,
      buyOrders: q.buyOrders,
      sellOrders: q.sellOrders,
      fillScore,
      liquidityScore,
      fillProbability,
      stabilityScore,
      manipulationFlag,
      manipulationReason,
      hourlyThroughput,
      flipType: 'order',
    })
  }

  return { rows, totalProducts }
}
