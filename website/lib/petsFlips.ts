export type FlipStrategy = 'KAT_UPGRADE' | 'TIER_BOOST'

export interface KatFlipRow {
  tag: string
  name: string
  strategy: FlipStrategy
  buyRarity: string
  sellRarity: string
  iconUrl: string
  buyPrice: number
  upgradeCost: number       // coins paid to Kat NPC
  materialCost: number      // bazaar items cost
  tierBoostCost: number     // 0 for Kat upgrade strategy
  totalCost: number
  sellPrice: number         // after 2% AH tax
  profit: number
  roi: number
  upgradeHours: number
  materials: Array<{ name: string; qty: number; cost: number }>
  aiTip: string | null
}

export async function fetchKatFlips(): Promise<{ rows: KatFlipRow[]; fetched: number; aiSummary: string | null }> {
  const res = await fetch('/api/pets-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Kat-flips API error ${res.status}`)
  return res.json()
}
