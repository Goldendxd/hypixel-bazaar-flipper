export interface IngredientDetail {
  id: string
  name: string
  qty: number
  unitPrice: number
  totalPrice: number
  iconUrl: string
  isForged: boolean
  forgeTime?: number
  subIngredients?: IngredientDetail[]
}

export interface ForgeFlipRow {
  id: string
  name: string
  iconUrl: string
  duration: number
  totalDuration: number
  isShort: boolean
  chainDepth: number
  requiresHotM?: string
  sellPrice: number
  ingredientCost: number
  profitPerForge: number
  margin: number
  totalProfit: number
  forgesIn10M: number
  weeklyVolume: number
  sellMovingWeek: number
  isChained: boolean
  ingredients: IngredientDetail[]
}

export async function fetchForgeFlips(): Promise<{ rows: ForgeFlipRow[]; totalForgeItems: number; aiSummary: string | null }> {
  const res = await fetch('/api/forge-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Forge-flips API error ${res.status}`)
  return res.json()
}
