// Fusion Flips: chained/compound crafts where intermediate items are themselves
// crafted rather than bought, unlocking a bigger margin than a single craft step.
// Example: buy raw Sugar → craft Enchanted Sugar → craft Enchanted Sugar Cane Block
// We price each ingredient recursively: use craft cost if cheaper than bazaar buy price.

import { BazaarResponse, formatName, iconUrl } from '@/lib/api'

export interface FusionFlipRow {
  id: string
  name: string
  iconUrl: string
  rawCost: number        // total cost of all base ingredients (no crafting substitution)
  fusionCost: number     // cost using cheapest path (craft intermediates when profitable)
  sellPrice: number      // bazaar sell order
  profitPerFusion: number
  margin: number
  craftCount: number     // how many fusions fit in 10M budget
  totalProfit: number
  weeklyVolume: number
  fillScore: number
  steps: number          // how many craft steps deep this fusion goes
  chain: string[]        // readable list of craft steps
}

interface HypixelItem {
  id: string
  recipe?: Record<string, string>
}

const TAX = 0.0125
const BUDGET = 10_000_000
const MAX_DEPTH = 4  // prevent infinite recursion on circular recipes

function parseIngredients(recipe: Record<string, string>): { id: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const val of Object.values(recipe)) {
    if (!val) continue
    const [rawId, countStr] = val.split(':')
    const id = rawId.trim().toUpperCase()
    const count = parseInt(countStr ?? '1', 10) || 1
    counts[id] = (counts[id] ?? 0) + count
  }
  return Object.entries(counts).map(([id, count]) => ({ id, count }))
}

// Recursively compute cheapest cost to obtain `qty` of `id`
// Returns { cost, steps } where steps = number of craft steps used
function cheapestCost(
  id: string,
  qty: number,
  buyPrices: Record<string, number>,
  recipeMap: Map<string, { id: string; count: number }[]>,
  depth: number,
  visitedInPath: Set<string>,
): { cost: number; steps: number; chain: string[] } {
  const bazaarCost = (buyPrices[id] ?? Infinity) * qty

  if (depth >= MAX_DEPTH || visitedInPath.has(id)) {
    return { cost: bazaarCost, steps: 0, chain: [] }
  }

  const recipe = recipeMap.get(id)
  if (!recipe) return { cost: bazaarCost, steps: 0, chain: [] }

  visitedInPath.add(id)
  let craftCost = 0
  let totalSteps = 1
  const chainParts: string[] = []
  let feasible = true

  for (const { id: ingId, count } of recipe) {
    const sub = cheapestCost(ingId, count * qty, buyPrices, recipeMap, depth + 1, new Set(visitedInPath))
    if (sub.cost === Infinity) { feasible = false; break }
    craftCost += sub.cost
    totalSteps += sub.steps
    chainParts.push(...sub.chain)
  }
  visitedInPath.delete(id)

  if (!feasible || craftCost >= bazaarCost) {
    return { cost: bazaarCost, steps: 0, chain: [] }
  }

  chainParts.push(formatName(id))
  return { cost: craftCost, steps: totalSteps, chain: chainParts }
}

export async function fetchFusionFlips(): Promise<{ rows: FusionFlipRow[]; totalProducts: number }> {
  const [bazaarRes, itemsRes] = await Promise.all([
    fetch('/api/bazaar', { cache: 'no-store' }),
    fetch('/api/items', { cache: 'no-store' }),
  ])

  if (!bazaarRes.ok) throw new Error(`Bazaar API error ${bazaarRes.status}`)
  if (!itemsRes.ok) throw new Error(`Items API error ${itemsRes.status}`)

  const bazaarData: BazaarResponse = await bazaarRes.json()
  const itemsData: { items: HypixelItem[] } = await itemsRes.json()

  const bz = bazaarData.products
  const totalProducts = Object.keys(bz).length

  const buyPrices: Record<string, number> = {}
  const sellBidPrices: Record<string, number> = {}
  const weeklyVols: Record<string, number> = {}
  const buyOrderCounts: Record<string, number> = {}
  const sellOrderCounts: Record<string, number> = {}

  for (const [id, product] of Object.entries(bz)) {
    const q = product.quick_status
    buyPrices[id] = q.buyPrice
    sellBidPrices[id] = q.sellPrice
    weeklyVols[id] = q.buyMovingWeek
    buyOrderCounts[id] = q.buyOrders
    sellOrderCounts[id] = q.sellOrders
  }

  const maxVol = Math.max(...Object.values(weeklyVols), 1)

  // Build recipe map: item id → ingredients
  const recipeMap = new Map<string, { id: string; count: number }[]>()
  for (const item of itemsData.items) {
    if (item.recipe) {
      const ings = parseIngredients(item.recipe)
      if (ings.length > 0) recipeMap.set(item.id, ings)
    }
  }

  const rows: FusionFlipRow[] = []

  for (const item of itemsData.items) {
    if (!item.recipe) continue
    const craftedId = item.id

    const sellBid = sellBidPrices[craftedId]
    if (!sellBid || sellBid <= 0) continue

    const topLevelIngs = parseIngredients(item.recipe)
    if (topLevelIngs.length === 0) continue

    // Raw cost: just buy everything directly
    let rawCost = 0
    let feasible = true
    for (const { id: ingId, count } of topLevelIngs) {
      const p = buyPrices[ingId]
      if (!p || p <= 0) { feasible = false; break }
      rawCost += p * count
    }
    if (!feasible || rawCost <= 0) continue

    // Fusion cost: use cheapest path recursively for each ingredient
    let fusionCost = 0
    let totalSteps = 1
    const chainParts: string[] = []
    let fusionFeasible = true

    for (const { id: ingId, count } of topLevelIngs) {
      const sub = cheapestCost(ingId, count, buyPrices, recipeMap, 0, new Set([craftedId]))
      if (sub.cost === Infinity) { fusionFeasible = false; break }
      fusionCost += sub.cost
      totalSteps += sub.steps
      chainParts.push(...sub.chain)
    }

    if (!fusionFeasible || fusionCost <= 0) continue

    // Only show if fusion is strictly cheaper than buying directly
    if (fusionCost >= rawCost) continue
    // Must be at least 2 craft steps deep to be a "fusion"
    if (totalSteps < 2) continue

    const sellOrder = Math.round((sellBid - 0.1) * 100) / 100
    const profitPerFusion = Math.round((sellOrder * (1 - TAX) - fusionCost) * 100) / 100
    if (profitPerFusion <= 0) continue

    const margin = Math.round((profitPerFusion / fusionCost) * 10000) / 100

    const wVol = weeklyVols[craftedId] ?? 0
    const volScore = Math.min(100, (wVol / maxVol) * 100)
    const depthPenalty = Math.min(100, (((buyOrderCounts[craftedId] ?? 0) + (sellOrderCounts[craftedId] ?? 0)) / 200) * 100)
    const fillScore = Math.round(volScore * 0.7 + (100 - depthPenalty) * 0.3)

    const craftCount = Math.max(1, Math.floor(BUDGET / fusionCost))
    const totalProfit = Math.round(profitPerFusion * craftCount * 100) / 100

    chainParts.push(formatName(craftedId))
    const uniqueChain = [...new Set(chainParts)]

    rows.push({
      id: craftedId,
      name: formatName(craftedId),
      iconUrl: iconUrl(craftedId),
      rawCost: Math.round(rawCost * 100) / 100,
      fusionCost: Math.round(fusionCost * 100) / 100,
      sellPrice: sellOrder,
      profitPerFusion,
      margin,
      craftCount,
      totalProfit,
      weeklyVolume: wVol,
      fillScore,
      steps: totalSteps,
      chain: uniqueChain,
    })
  }

  rows.sort((a, b) => b.totalProfit - a.totalProfit)
  return { rows, totalProducts }
}
