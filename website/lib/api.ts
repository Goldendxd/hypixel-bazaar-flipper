// Types matching the Hypixel Bazaar API response shape
export interface BazaarProduct {
  product_id: string
  quick_status: {
    productId: string
    sellPrice: number  // lowest instant-sell ask
    sellVolume: number
    sellMovingWeek: number
    sellOrders: number
    buyPrice: number   // highest instant-buy bid
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

// Computed flip opportunity sent to the table component
export interface FlipRow {
  id: string
  name: string
  iconUrl: string
  // Instant flip: buy at lowest ask, sell back immediately at highest bid
  instantBuyPrice: number  // what you pay (sellPrice in API = lowest ask)
  instantSellPrice: number // what you get (buyPrice in API = highest bid)
  instantProfit: number    // after 1.25% tax on the sell side
  instantMargin: number    // %
  // Order flip: place a buy order, then sell order
  buyOrder: number         // your buy order price
  sellOrder: number        // your sell order price
  orderMargin: number      // %
  orderProfit: number
  weeklyVolume: number     // buyMovingWeek — used as activity proxy
  flipType: 'instant' | 'order'
}

const BAZAAR_URL = 'https://api.hypixel.net/skyblock/bazaar'
const TAX = 0.0125 // 1.25% transaction tax on filled sell orders

// Prettify item IDs like INK_SACK:3 → Ink Sack 3
export function formatName(id: string): string {
  return id
    .split(/[_:]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function iconUrl(id: string): string {
  // sky.shiiyu.moe serves item head textures by item ID
  return `https://sky.shiiyu.moe/item/${id}`
}

function fmt(n: number): number {
  return Math.round(n * 100) / 100
}

export async function fetchBazaarFlips(): Promise<FlipRow[]> {
  const res = await fetch(BAZAAR_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Hypixel API error: ${res.status}`)
  const data: BazaarResponse = await res.json()

  const rows: FlipRow[] = []

  for (const product of Object.values(data.products)) {
    const { quick_status: q } = product
    const id = product.product_id

    // Skip items with no market activity
    if (!q.buyPrice || !q.sellPrice || q.weeklyVolume === 0) continue

    // --- Instant flip ---
    // You buy at the lowest ask (sellPrice) and resell at the highest bid (buyPrice)
    // Profit = buyPrice * (1 - TAX) - sellPrice
    const instantProfit = fmt(q.buyPrice * (1 - TAX) - q.sellPrice)
    const instantMargin = fmt((instantProfit / q.sellPrice) * 100)

    // --- Order flip ---
    // Place a buy order slightly above the highest bid, sell order at the lowest ask
    // Margin = (sellPrice - buyPrice) / buyPrice * 100
    const orderMargin = fmt(((q.sellPrice - q.buyPrice) / q.buyPrice) * 100)
    const orderProfit = fmt(q.sellPrice * (1 - TAX) - q.buyPrice)

    const weeklyVolume = q.buyMovingWeek

    rows.push({
      id,
      name: formatName(id),
      iconUrl: iconUrl(id),
      instantBuyPrice: q.sellPrice,
      instantSellPrice: q.buyPrice,
      instantProfit,
      instantMargin,
      buyOrder: q.buyPrice,
      sellOrder: q.sellPrice,
      orderMargin,
      orderProfit,
      weeklyVolume,
      flipType: 'instant',
    })
  }

  return rows
}
