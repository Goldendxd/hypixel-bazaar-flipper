// Real Fusion Flips: buy 2 attribute shards from bazaar, fuse via Kysha in Galatea,
// sell the output shard on bazaar for profit.
// Recipe data sourced from SkyShards (Campionnn/SkyShards on GitHub).

export interface FusionFlipRow {
  id: string
  name: string
  rarity: string
  iconUrl: string
  sellPrice: number
  inputCost: number
  profitPerFusion: number
  margin: number
  totalProfit: number
  outputQty: number
  fusesIn10M: number
  weeklyVolume: number
  fillScore: number
  input1: { id: string; name: string; rarity: string; qty: number; unitPrice: number; iconUrl: string }
  input2: { id: string; name: string; rarity: string; qty: number; unitPrice: number; iconUrl: string }
}

export async function fetchFusionFlips(): Promise<{ rows: FusionFlipRow[]; totalShards: number }> {
  const res = await fetch('/api/fusion-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Fusion-flips API error ${res.status}`)
  return res.json()
}
