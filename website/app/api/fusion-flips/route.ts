import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

const TAX = 0.0125
const NEU_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items'
const MAX_DEPTH = 4

function parseIngredients(recipe: Record<string, string>): { id: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const [key, val] of Object.entries(recipe)) {
    if (key === 'count') continue
    if (!val || val === '') continue
    const parts = val.split(':')
    const id = parts[0].trim().toUpperCase()
    const cnt = parseInt(parts[1] ?? '1', 10) || 1
    counts[id] = (counts[id] ?? 0) + cnt
  }
  return Object.entries(counts).map(([id, count]) => ({ id, count }))
}

async function fetchNEURecipe(id: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`${NEU_BASE}/${id}.json`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    return data.recipe ?? null
  } catch {
    return null
  }
}

// Recursively compute cheapest cost for `qty` of `id`
// Returns cheapest cost and whether any crafting was used (steps > 0)
function cheapestCost(
  id: string,
  qty: number,
  buyPrices: Record<string, number>,
  recipeMap: Record<string, { ings: { id: string; count: number }[]; outputCount: number }>,
  depth: number,
  visiting: Set<string>,
): { cost: number; steps: number; chain: string[] } {
  const bazaarCost = (buyPrices[id] ?? Infinity) * qty
  if (depth >= MAX_DEPTH || visiting.has(id)) return { cost: bazaarCost, steps: 0, chain: [] }

  const entry = recipeMap[id]
  if (!entry) return { cost: bazaarCost, steps: 0, chain: [] }

  visiting.add(id)
  let craftCost = 0
  let totalSteps = 1
  const chainParts: string[] = []
  let feasible = true

  for (const { id: ingId, count } of entry.ings) {
    const needed = Math.ceil((count * qty) / entry.outputCount)
    const sub = cheapestCost(ingId, needed, buyPrices, recipeMap, depth + 1, new Set(visiting))
    if (sub.cost === Infinity) { feasible = false; break }
    craftCost += sub.cost
    totalSteps += sub.steps
    chainParts.push(...sub.chain)
  }
  visiting.delete(id)

  if (!feasible || craftCost >= bazaarCost) return { cost: bazaarCost, steps: 0, chain: [] }

  // Format name from ID
  const name = id.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
  chainParts.push(name)
  return { cost: craftCost, steps: totalSteps, chain: chainParts }
}

async function computeFlips() {
  const bazRes = await fetch('https://api.hypixel.net/skyblock/bazaar', { signal: AbortSignal.timeout(15000) })
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  const baz = await bazRes.json()

  const products: Record<string, { quick_status: { buyPrice: number; sellPrice: number; buyMovingWeek: number; sellMovingWeek: number; buyOrders: number; sellOrders: number } }> = baz.products
  const allIds = Object.keys(products)

  const buyPrices: Record<string, number> = {}
  const weeklyVols: Record<string, number> = {}
  const sellVols: Record<string, number> = {}
  const buyOrders: Record<string, number> = {}
  const sellOrders: Record<string, number> = {}

  for (const [id, p] of Object.entries(products)) {
    const q = p.quick_status
    buyPrices[id] = q.buyPrice
    weeklyVols[id] = q.buyMovingWeek
    sellVols[id] = q.sellMovingWeek
    buyOrders[id] = q.buyOrders
    sellOrders[id] = q.sellOrders
  }

  const maxVol = Math.max(...Object.values(weeklyVols), 1)

  // Fetch all recipes
  const BATCH = 50
  const rawRecipes: Record<string, Record<string, string>> = {}

  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (id) => ({ id, recipe: await fetchNEURecipe(id) }))
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.recipe) {
        rawRecipes[r.value.id] = r.value.recipe
      }
    }
  }

  // Build normalized recipe map
  const recipeMap: Record<string, { ings: { id: string; count: number }[]; outputCount: number }> = {}
  for (const [id, recipe] of Object.entries(rawRecipes)) {
    const ings = parseIngredients(recipe)
    const outputCount = parseInt(recipe['count'] ?? '1', 10) || 1
    if (ings.length > 0) recipeMap[id] = { ings, outputCount }
  }

  const rows = []

  for (const [itemId, entry] of Object.entries(recipeMap)) {
    const { ings: topIngs, outputCount } = entry

    const sellAsk = buyPrices[itemId]
    if (!sellAsk || sellAsk <= 0) continue

    // Raw cost: buy all top-level ingredients at bazaar price
    let rawCost = 0
    let rawFeasible = true
    for (const { id: ingId, count } of topIngs) {
      const p = buyPrices[ingId]
      if (!p || p <= 0) { rawFeasible = false; break }
      rawCost += p * count
    }
    if (!rawFeasible || rawCost <= 0) continue

    // Fusion cost: recursively substitute cheaper crafted intermediates
    let fusionCost = 0
    let totalSteps = 1
    const chainParts: string[] = []
    let fusionFeasible = true

    for (const { id: ingId, count } of topIngs) {
      const sub = cheapestCost(ingId, count, buyPrices, recipeMap, 0, new Set([itemId]))
      if (sub.cost === Infinity) { fusionFeasible = false; break }
      fusionCost += sub.cost
      totalSteps += sub.steps
      chainParts.push(...sub.chain)
    }

    if (!fusionFeasible || fusionCost <= 0) continue
    // Must be at least 2 steps deep AND fusion must be cheaper than raw
    if (totalSteps < 2 || fusionCost >= rawCost) continue

    const sellOrder = Math.round((sellAsk - 0.1) * 100) / 100
    const revenue = sellOrder * (1 - TAX) * outputCount
    const profitPerFusion = Math.round((revenue - fusionCost) * 100) / 100
    if (profitPerFusion <= 0) continue

    const margin = Math.round((profitPerFusion / fusionCost) * 10000) / 100

    const wVol = weeklyVols[itemId] ?? 0
    const volScore = Math.min(100, (wVol / maxVol) * 100)
    const depthPenalty = Math.min(100, (((buyOrders[itemId] ?? 0) + (sellOrders[itemId] ?? 0)) / 200) * 100)
    const fillScore = Math.round(volScore * 0.7 + (100 - depthPenalty) * 0.3)

    const craftCount = Math.max(1, Math.floor(10_000_000 / fusionCost))
    const totalProfit = Math.round(profitPerFusion * craftCount * 100) / 100

    const name = itemId.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ')
    chainParts.push(name)
    const uniqueChain = [...new Set(chainParts)]

    rows.push({
      id: itemId,
      rawCost: Math.round(rawCost * 100) / 100,
      fusionCost: Math.round(fusionCost * 100) / 100,
      sellPrice: sellOrder,
      profitPerFusion,
      margin,
      weeklyVolume: wVol,
      fillScore,
      craftCount,
      totalProfit,
      steps: totalSteps,
      chain: uniqueChain,
    })
  }

  rows.sort((a, b) => b.totalProfit - a.totalProfit)
  return { rows, totalProducts: allIds.length }
}

export async function GET() {
  const now = Date.now()
  if (cachedResult && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedResult, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'HIT' },
    })
  }

  try {
    const result = await computeFlips()
    cachedResult = result
    cacheTime = Date.now()
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'MISS' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
