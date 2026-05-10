export type FlipType = 'TIER_BOOST' | 'RARITY_ARBITRAGE'

export interface PetFlipRow {
  tag: string
  name: string
  flipType: FlipType
  buyRarity: string
  sellRarity: string
  iconUrl: string
  buyPrice: number
  tierBoostCost: number
  totalCost: number
  sellPrice: number
  profit: number
  roi: number
  buyVolume: number
  sellVolume: number
}

export async function fetchPetsFlips(): Promise<{ rows: PetFlipRow[]; tierBoostCost: number }> {
  const res = await fetch('/api/pets-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Pets-flips API error ${res.status}`)
  return res.json()
}
