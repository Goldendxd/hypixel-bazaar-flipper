export interface ForgeIngredient {
  id: string
  name: string
  qty: number
  unitPrice: number
  totalPrice: number
  source: 'BZ' | 'AH' | 'FORGE' | 'COIN'
  iconUrl: string
  subForgeTime?: number
}

export interface ForgeFlipRow {
  id: string
  name: string
  iconUrl: string
  duration: number
  totalDuration: number
  hotm: number | null
  outputCount: number
  sellSource: 'BZ' | 'AH'
  sellPrice: number
  revenue: number
  ingredientCost: number
  profit: number
  margin: number
  coinsPerHour: number
  weeklyVolume: number
  ingredients: ForgeIngredient[]
  warning: string | null
}

export async function fetchForgeFlips(): Promise<{ rows: ForgeFlipRow[]; totalForgeItems: number; aiSummary: string | null }> {
  const res = await fetch('/api/forge-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Forge-flips API error ${res.status}`)
  return res.json()
}
