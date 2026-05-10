export type FlipStrategy = 'KAT_UPGRADE' | 'TIER_BOOST'

export interface KatFlipRow {
  tag: string
  name: string
  strategy: FlipStrategy
  buyRarity: string
  sellRarity: string
  iconUrl: string
  buyPrice: number
  katCoins: number
  itemCost: number
  tierBoostCost: number
  totalCost: number
  sellPrice: number
  profit: number
  roi: number
  buyVolume: number
  sellVolume: number
  katIngredients: Array<{ id: string; name: string; qty: number; unitPrice: number }>
}

export async function fetchKatFlips(): Promise<{ rows: KatFlipRow[]; tierBoostCost: number }> {
  const res = await fetch('/api/pets-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Kat-flips API error ${res.status}`)
  return res.json()
}
