export interface PetFlipRow {
  tag: string
  name: string
  rarity: string
  iconUrl: string
  lvl1Price: number
  lvl100Price: number
  levelingCost: number
  totalCost: number
  sellPrice: number
  profit: number
  roi: number
  lvl1Volume: number
  lvl100Volume: number
}

export async function fetchPetsFlips(): Promise<{ rows: PetFlipRow[]; expBottlePrice: number }> {
  const res = await fetch('/api/pets-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Pets-flips API error ${res.status}`)
  return res.json()
}
