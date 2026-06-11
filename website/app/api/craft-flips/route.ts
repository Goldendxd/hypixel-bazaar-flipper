import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 2 * 60 * 1000

// Sell-side fee. Most craft-flip outputs exit via AH BIN (~2% with claiming
// tax) — bazaar exits are cheaper (1.25%), so 2% is the conservative bound.
const SELL_FEE = 0.02
const MIN_VOLUME = 3          // recent sales of the crafted item
const MAX_ROWS = 80

export interface CraftIngredientRow {
  id: string
  name: string
  qty: number
  instaCost: number       // buy instantly
  orderCost: number       // patient buy order
  isCrafted: boolean      // cheaper to sub-craft than to buy
  iconUrl: string
}

export interface CraftFlipRow {
  id: string
  name: string
  iconUrl: string
  sellPrice: number          // live sell price (lbin / bazaar ask)
  median: number             // median of recent sales — the sanity anchor
  craftCostInsta: number
  craftCostOrder: number
  profitInsta: number        // sell × (1−fee) − insta cost
  profitOrder: number        // sell × (1−fee) − order cost
  marginInsta: number
  marginOrder: number
  volume: number             // recent sales count
  reqCollection: { name: string; level: number } | null
  reqSlayer: { name: string; level: number } | null
  manipulated: boolean
  manipulationReason: string | null
  ingredients: CraftIngredientRow[]
}

interface CoflnetCraft {
  itemId: string
  itemName: string | null
  sellPrice: number
  craftCost: number
  buyOrderCraftCost: number
  ingredients: Array<{
    itemId: string
    count: number
    cost: number
    buyOrderCost: number | null
    craftCost?: number | null
    type: string | null
  }>
  reqCollection: { name: string; level: number } | null
  reqSlayer: { name: string; level: number } | null
  volume: number
  median: number
}

function stripCodes(s: string): string {
  return s.replace(/§[0-9a-fklmnor]/gi, '').trim()
}

function titleCase(id: string): string {
  return id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

async function compute(): Promise<{ rows: CraftFlipRow[]; totalCandidates: number }> {
  const res = await fetch('https://sky.coflnet.com/api/craft/profit', { signal: AbortSignal.timeout(20000) })
  if (!res.ok) throw new Error(`Coflnet craft API failed: ${res.status}`)
  const crafts: CoflnetCraft[] = await res.json()

  const rows: CraftFlipRow[] = []

  for (const c of crafts) {
    if (!c.itemId || c.sellPrice <= 0 || c.craftCost <= 0) continue
    if ((c.volume ?? 0) < MIN_VOLUME) continue

    const revenue = c.sellPrice * (1 - SELL_FEE)
    const craftCostInsta = c.craftCost
    const craftCostOrder = c.buyOrderCraftCost > 0 ? c.buyOrderCraftCost : c.craftCost

    const profitInsta = revenue - craftCostInsta
    const profitOrder = revenue - craftCostOrder
    if (profitOrder <= 0) continue

    // Manipulation: live sell price far above what items actually sell for
    let manipulated = false
    let manipulationReason: string | null = null
    if (c.median > 0 && c.sellPrice > c.median * 2.5) {
      manipulated = true
      manipulationReason = `Listed at ${Math.round(c.sellPrice / c.median * 10) / 10}× the median sale price — the "profit" likely never fills`
    } else if (c.median > 0 && c.sellPrice > c.median * 1.6 && (c.volume ?? 0) < 10) {
      manipulated = true
      manipulationReason = 'Price well above median on thin volume — verify in-game first'
    }

    const ingredients: CraftIngredientRow[] = (c.ingredients ?? []).map(ing => ({
      id: ing.itemId,
      name: titleCase(ing.itemId),
      qty: ing.count,
      instaCost: Math.round(ing.cost),
      orderCost: Math.round(ing.buyOrderCost ?? ing.cost),
      isCrafted: ing.type === 'craft',
      iconUrl: `https://sky.shiiyu.moe/item/${ing.itemId}`,
    }))

    rows.push({
      id: c.itemId,
      name: c.itemName ? stripCodes(c.itemName) : titleCase(c.itemId),
      iconUrl: `https://sky.shiiyu.moe/item/${c.itemId}`,
      sellPrice: Math.round(c.sellPrice),
      median: Math.round(c.median ?? 0),
      craftCostInsta: Math.round(craftCostInsta),
      craftCostOrder: Math.round(craftCostOrder),
      profitInsta: Math.round(profitInsta),
      profitOrder: Math.round(profitOrder),
      marginInsta: Math.round((profitInsta / craftCostInsta) * 1000) / 10,
      marginOrder: Math.round((profitOrder / craftCostOrder) * 1000) / 10,
      volume: c.volume ?? 0,
      reqCollection: c.reqCollection,
      reqSlayer: c.reqSlayer,
      manipulated,
      manipulationReason,
      ingredients,
    })
  }

  // Clean rows first by patient-route profit, flagged rows after
  rows.sort((a, b) => {
    if (a.manipulated !== b.manipulated) return a.manipulated ? 1 : -1
    return b.profitOrder - a.profitOrder
  })
  const trimmed = rows.slice(0, MAX_ROWS)

  return { rows: trimmed, totalCandidates: crafts.length }
}

export async function GET() {
  const now = Date.now()
  if (cachedResult && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedResult, { headers: { 'Cache-Control': 'public, s-maxage=120', 'X-Cache': 'HIT' } })
  }
  try {
    const result = await compute()
    cachedResult = result
    cacheTime = Date.now()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=120', 'X-Cache': 'MISS' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
