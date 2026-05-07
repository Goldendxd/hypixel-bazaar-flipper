// Fusion Flips: multi-step compound crafts where you craft intermediate items
// to reduce total ingredient cost. Server-side computation via /api/fusion-flips.

export interface FusionFlipRow {
  id: string
  name: string
  iconUrl: string
  rawCost: number
  fusionCost: number
  sellPrice: number
  profitPerFusion: number
  margin: number
  craftCount: number
  totalProfit: number
  weeklyVolume: number
  fillScore: number
  steps: number
  chain: string[]
}

function formatName(id: string): string {
  return id.split(/[_:]/).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export async function fetchFusionFlips(): Promise<{ rows: FusionFlipRow[]; totalProducts: number }> {
  const res = await fetch('/api/fusion-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Fusion-flips API error ${res.status}`)

  const data: {
    rows: Omit<FusionFlipRow, 'name' | 'iconUrl'>[]
    totalProducts: number
  } = await res.json()

  const rows: FusionFlipRow[] = data.rows.map(r => ({
    ...r,
    name: formatName(r.id),
    iconUrl: `https://sky.shiiyu.moe/api/item/${r.id}`,
  }))

  return { rows, totalProducts: data.totalProducts }
}
