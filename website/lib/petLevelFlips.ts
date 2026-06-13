export interface PetLevelRow {
  tag: string
  name: string
  rarity: string
  iconUrl: string
  lvl1Price: number
  lvl100Price: number
  lvl1Count: number
  lvl100Count: number
  grossSpread: number
  ahFees: number
  xpNeeded: number
  valuePerMilXp: number
  fannCost: number
  netViaFann: number
  verdict: 'STRONG' | 'OK' | 'GRIND' | 'SKIP'
}

export async function fetchPetLevelFlips(): Promise<{ rows: PetLevelRow[]; checked: number }> {
  const res = await fetch('/api/pet-level-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Pet-level API error ${res.status}`)
  return res.json()
}
