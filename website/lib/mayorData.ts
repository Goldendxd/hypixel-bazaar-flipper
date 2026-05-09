export interface MayorPerk {
  name: string
  description: string
  minister?: boolean
}

export interface MayorFlipItem {
  id: string
  name: string
  iconUrl: string
  perkName: string
  perkReason: string
  action: 'BUY' | 'SELL' | 'HOLD' | 'WARN'
  actionReason: string
  price: number
  sellPrice: number
  weeklyBuyVol: number
  weeklySellVol: number
  isPotentiallyManipulated: boolean
}

export interface MayorData {
  mayorName: string
  mayorKey: string
  perks: MayorPerk[]
  isDerpy: boolean
  currentYear: number
  nextElectionYear: number
  msUntilElection: number
  votingCandidates: Array<{ key: string; name: string; perks: MayorPerk[]; votes: number }>
  items: MayorFlipItem[]
}

export async function fetchMayorData(): Promise<MayorData> {
  const res = await fetch('/api/mayor-data', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Mayor-data API error ${res.status}`)
  return res.json()
}
