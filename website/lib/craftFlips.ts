// Craft Flips: buy bazaar ingredients, craft, sell on bazaar for profit.
// Heavy lifting (NEU recipe fetch) is done server-side via /api/craft-flips.

export interface CraftFlipRow {
  id: string
  name: string
  iconUrl: string
  ingredientCost: number
  sellPrice: number
  profitPerCraft: number
  margin: number
  weeklyVolume: number
  fillScore: number
  craftCount: number
  totalProfit: number
  outputCount: number
  recipe: { id: string; name: string; count: number; unitPrice: number }[]
}

function formatName(id: string): string {
  return id.split(/[_:]/).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

export async function fetchCraftFlips(): Promise<{ rows: CraftFlipRow[]; totalProducts: number }> {
  const res = await fetch('/api/craft-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Craft-flips API error ${res.status}`)

  type RawRow = Omit<CraftFlipRow, 'name' | 'iconUrl' | 'recipe'> & {
    id: string
    recipe: { id: string; count: number; unitPrice: number }[]
  }
  const data: { rows: RawRow[]; totalProducts: number } = await res.json()

  const rows: CraftFlipRow[] = data.rows.map((r: RawRow) => ({
    ...r,
    name: formatName(r.id),
    iconUrl: `https://sky.shiiyu.moe/api/item/${r.id}`,
    recipe: r.recipe.map(ing => ({
      ...ing,
      name: formatName(ing.id),
    })),
  }))

  return { rows, totalProducts: data.totalProducts }
}
