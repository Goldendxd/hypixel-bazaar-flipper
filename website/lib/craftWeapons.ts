export interface PricePoint {
  time: string
  avg: number
  min: number
  max: number
  volume: number
}

export interface CraftIngredient {
  id: string
  name: string
  qty: number
  unitPrice: number
  totalCost: number
  source: 'AH' | 'BZ'
  iconUrl: string
  priceHistory: PricePoint[]
  volatility: number // % stddev over last 24h
}

export interface ScrollAddon {
  id: string
  name: string
  unitPrice: number
  source: 'AH' | 'BZ'
  iconUrl: string
}

export interface WeaponFlip {
  id: string
  name: string
  iconUrl: string
  lbin: number
  sellOrderPrice: number
  craftCost: number // without scrolls
  craftCostWithScrolls: number
  profitNoScrolls: number
  profitWithScrolls: number
  marginNoScrolls: number
  marginWithScrolls: number
  ahTax: number
  ingredients: CraftIngredient[]
  scrollAddons: ScrollAddon[]
  priceHistory: PricePoint[]
  lastUpdated: string
  manipulationRisk: 'LOW' | 'MEDIUM' | 'HIGH'
  manipulationReason: string | null
  estimatedSellDays: number
  weeklyVolume: number
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
