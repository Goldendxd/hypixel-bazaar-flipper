export interface PricePoint {
  time: string
  avg: number
  min: number
  max: number
  volume: number
}

// Full dual-price data for any ingredient
export interface IngredientPricing {
  instaBuy:   number  // what you pay right now (BZ: min ask / AH: LBIN)
  buyOrder:   number  // what you'd pay with patience (BZ: max bid / AH: N/A → same as instaBuy)
  spread:     number  // % difference: (instaBuy - buyOrder) / instaBuy * 100
  source:     'AH' | 'BZ'
  liquidity:  'HIGH' | 'MEDIUM' | 'LOW'  // based on order depth / sell volume
  fillTimeEst: string  // e.g. "instant", "< 1h", "1–6h", "6–24h"
}

export interface CraftIngredient {
  id: string
  name: string
  qty: number
  pricing: IngredientPricing
  // convenience (instaBuy * qty)
  unitPrice: number
  totalCost: number
  source: 'AH' | 'BZ'
  iconUrl: string
  priceHistory: PricePoint[]
  volatility: number
}

export interface ScrollAddon {
  id: string
  name: string
  pricing: IngredientPricing
  unitPrice: number
  source: 'AH' | 'BZ'
  iconUrl: string
}

// A specific scrolled variant of a weapon
export interface WeaponVariant {
  label: string          // "Clean", "Fully Scrolled", "1-Scroll", etc.
  scrollCount: number    // 0, 1, 2, 3
  scrollIds: string[]
  // AH LBIN price for this variant (estimated = clean LBIN + scroll market values)
  estimatedLbin: number
  // How estimate is derived
  note: string
}

export interface WeaponFlip {
  id: string
  name: string
  iconUrl: string

  // Raw market prices for the base item
  cleanLbin: number
  sellOrderPrice: number
  priceHistory: PricePoint[]

  // Variants (clean, 1-scroll, 2-scroll, fully scrolled)
  variants: WeaponVariant[]

  // Base ingredients (no scrolls)
  ingredients: CraftIngredient[]
  scrollAddons: ScrollAddon[]

  // Pre-computed costs (insta-buy mode, no scrolls)
  craftCost: number
  craftCostWithScrolls: number

  // Pre-computed profits (insta-buy sell at LBIN, 2% AH tax)
  profitNoScrolls: number
  profitWithScrolls: number
  marginNoScrolls: number
  marginWithScrolls: number

  ahTax: number
  lastUpdated: string

  manipulationRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  manipulationReason: string | null
  estimatedSellDays: number
  weeklyVolume: number
}

export interface ExecutionSummary {
  // How much extra profit from using buy orders on all BZ items
  buyOrderSavings: number
  buyOrderMarginGain: number
  // Recommended strategy
  strategy: 'INSTA_BUY' | 'BUY_ORDERS' | 'MIXED'
  strategyReason: string
  // Per-item recommendation
  itemRecs: Array<{
    id: string
    name: string
    rec: 'INSTA_BUY' | 'BUY_ORDER'
    saving: number
    reason: string
  }>
}

export interface CraftWeaponsResponse {
  hyperion: WeaponFlip
  terminator: WeaponFlip
  aiSummary: string | null
  fetchedAt: string
}

export async function fetchCraftWeapons(): Promise<CraftWeaponsResponse> {
  const res = await fetch('/api/craft-weapons', { cache: 'no-store' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}
