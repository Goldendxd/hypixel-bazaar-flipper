import type { WeaponCategory } from '@/lib/weaponCatalog'

export interface WeaponRow {
  id: string
  name: string
  category: WeaponCategory
  tier: 'EARLY' | 'MID' | 'LATE' | 'END'
  iconUrl: string
  marketPrice: number
  median: number
  volume: number
  demand: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
  craftable: boolean
  craftCostInsta: number
  craftCostOrder: number
  grossSale: number
  ahListingFee: number
  ahClaimingTax: number
  netProfit: number
  netProfitInsta: number
  roi: number
  manipulated: boolean
  ingredients: Array<{ id: string; name: string; qty: number; orderCost: number; instaCost: number }>
}

export async function fetchWeaponFlips(): Promise<{ rows: WeaponRow[]; totalCatalog: number }> {
  const res = await fetch('/api/weapon-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Weapon-flips API error ${res.status}`)
  return res.json()
}

export interface PricePoint { time: string; avg: number; min: number; max: number; volume: number }

// Day price history for the interactive chart in the expand panel
export async function fetchWeaponHistory(tag: string): Promise<PricePoint[]> {
  const res = await fetch(`https://sky.coflnet.com/api/item/price/${tag}/history/day`, { cache: 'no-store' })
  if (!res.ok) return []
  const j = await res.json()
  if (!Array.isArray(j)) return []
  return j.map((p: Partial<PricePoint>) => ({
    time: p.time ?? '', avg: p.avg ?? 0, min: p.min ?? 0, max: p.max ?? 0, volume: p.volume ?? 0,
  }))
}
