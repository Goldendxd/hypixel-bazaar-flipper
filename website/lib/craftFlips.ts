export interface CraftIngredientRow {
  id: string
  name: string
  qty: number
  instaCost: number
  orderCost: number
  isCrafted: boolean
  iconUrl: string
}

export interface CraftFlipRow {
  id: string
  name: string
  iconUrl: string
  sellPrice: number
  median: number
  ahListingFee: number
  ahClaimingTax: number
  craftCostInsta: number
  craftCostOrder: number
  profitInsta: number
  profitOrder: number
  marginInsta: number
  marginOrder: number
  volume: number
  reqCollection: { name: string; level: number } | null
  reqSlayer: { name: string; level: number } | null
  manipulated: boolean
  manipulationReason: string | null
  ingredients: CraftIngredientRow[]
}

export async function fetchCraftFlips(): Promise<{ rows: CraftFlipRow[]; totalCandidates: number }> {
  const res = await fetch('/api/craft-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Craft-flips API error ${res.status}`)
  return res.json()
}
