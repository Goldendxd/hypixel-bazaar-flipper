import { NextResponse } from 'next/server'

// Server-side in-memory cache so we don't re-fetch 1913 items every request
let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const TAX = 0.0125
const NEU_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items'

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
    const res = await fetch(`${NEU_BASE}/${id}.json`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.recipe ?? null
  } catch {
    return null
  }
}

async function computeFlips() {
  // Fetch bazaar data
  const bazRes = await fetch('https://api.hypixel.net/skyblock/bazaar', {
    signal: AbortSignal.timeout(15000),
  })
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  const baz = await bazRes.json()

  const products: Record<string, { quick_status: { buyPrice: number; sellPrice: number; buyMovingWeek: number; sellMovingWeek: number; buyOrders: number; sellOrders: number } }> = baz.products
  const allIds = Object.keys(products)

  const buyPrices: Record<string, number> = {}    // lowest ask — cost to buy now
  const sellBids: Record<string, number> = {}     // highest bid — what you get
  const weeklyVols: Record<string, number> = {}
  const sellVols: Record<string, number> = {}
  const buyOrders: Record<string, number> = {}
  const sellOrders: Record<string, number> = {}

  for (const [id, p] of Object.entries(products)) {
    const q = p.quick_status
    buyPrices[id] = q.buyPrice
    sellBids[id] = q.sellPrice
    weeklyVols[id] = q.buyMovingWeek
    sellVols[id] = q.sellMovingWeek
    buyOrders[id] = q.buyOrders
    sellOrders[id] = q.sellOrders
  }

  const maxVol = Math.max(...Object.values(weeklyVols), 1)

  // Fetch all recipes in parallel (50 concurrent)
  const BATCH = 50
  const recipeMap: Record<string, Record<string, string>> = {}

  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (id) => ({ id, recipe: await fetchNEURecipe(id) }))
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.recipe) {
        recipeMap[r.value.id] = r.value.recipe
      }
    }
  }

  // Compute profitable crafts
  const rows = []

  for (const [itemId, recipe] of Object.entries(recipeMap)) {
    const outputCount = parseInt(recipe['count'] ?? '1', 10) || 1
    const ings = parseIngredients(recipe)
    if (ings.length === 0) continue

    const sellBid = sellBids[itemId]
    if (!sellBid || sellBid <= 0) continue

    // Cost: buy all ingredients at instant-buy (lowest ask)
    let ingredientCost = 0
    const recipeDetails = []
    let feasible = true

    for (const { id: ingId, count } of ings) {
      const price = buyPrices[ingId]
      if (!price || price <= 0) { feasible = false; break }
      ingredientCost += price * count
      recipeDetails.push({ id: ingId, count, unitPrice: Math.round(price * 100) / 100 })
    }
    if (!feasible || ingredientCost <= 0) continue

    // Sell via order: just below current lowest ask (buyPrice - 0.1)
    const sellOrder = Math.round((buyPrices[itemId] ?? sellBid) * 100 - 10) / 100
    const revenue = sellOrder * (1 - TAX) * outputCount
    const profitPerCraft = Math.round((revenue - ingredientCost) * 100) / 100
    if (profitPerCraft <= 0) continue

    const margin = Math.round((profitPerCraft / ingredientCost) * 10000) / 100

    const wVol = weeklyVols[itemId] ?? 0
    const volScore = Math.min(100, (wVol / maxVol) * 100)
    const depthPenalty = Math.min(100, (((buyOrders[itemId] ?? 0) + (sellOrders[itemId] ?? 0)) / 200) * 100)
    const fillScore = Math.round(volScore * 0.7 + (100 - depthPenalty) * 0.3)

    const craftCount = Math.max(1, Math.floor(10_000_000 / ingredientCost))
    const totalProfit = Math.round(profitPerCraft * craftCount * 100) / 100

    rows.push({
      id: itemId,
      ingredientCost: Math.round(ingredientCost * 100) / 100,
      sellPrice: sellOrder,
      profitPerCraft,
      margin,
      weeklyVolume: wVol,
      sellMovingWeek: sellVols[itemId] ?? 0,
      fillScore,
      craftCount,
      totalProfit,
      outputCount,
      recipe: recipeDetails,
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
