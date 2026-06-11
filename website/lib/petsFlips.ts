export interface KatFlipRow {
  tag: string
  name: string
  buyRarity: string
  sellRarity: string
  iconUrl: string
  buyPrice: number
  upgradeCost: number
  materialCost: number
  totalCost: number
  sellPrice: number
  grossSell: number
  profit: number
  roi: number
  upgradeHours: number
  profitPerHour: number
  weeklySales: number
  materials: Array<{ id: string; name: string; qty: number }>
  risk: 'LOW' | 'MEDIUM' | 'HIGH'
  riskReason: string | null
  aiTip: string | null
}

export async function fetchKatFlips(): Promise<{ rows: KatFlipRow[]; fetched: number; aiSummary: string | null }> {
  const res = await fetch('/api/pets-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Kat-flips API error ${res.status}`)
  return res.json()
}
