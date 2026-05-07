// Real Craft Flips: buy ingredients from bazaar, craft, sell the result on bazaar.
// Uses Hypixel's /resources/skyblock/items endpoint for recipes.

import { BazaarResponse, formatName, iconUrl } from '@/lib/api'

export interface CraftFlipRow {
  id: string
  name: string
  iconUrl: string
  ingredientCost: number   // total bazaar buy cost for all ingredients
  sellPrice: number        // bazaar sell order price (bid + 0.1 undercut)
  profitPerCraft: number   // after 1.25% tax
  margin: number           // %
  weeklyVolume: number
  fillScore: number
  craftCount: number       // how many crafts fit in 10M budget
  totalProfit: number
  recipe: { id: string; name: string; count: number; unitPrice: number }[]
}

interface HypixelItem {
  id: string
  recipe?: {
    [slot: string]: string  // e.g. "A1": "ENCHANTED_SUGAR:1", "A2": "ENCHANTED_SUGAR:1", ...
  }
}

const TAX = 0.0125
const BUDGET = 10_000_000

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

export async function fetchCraftFlips(): Promise<{ rows: CraftFlipRow[]; totalProducts: number }> {
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

  // Build price lookup: bazaar buy price (what you pay) = lowest ask = buyPrice
  const buyPrices: Record<string, number> = {}
  const sellBidPrices: Record<string, number> = {}
  const weeklyVols: Record<string, number> = {}
  const buyOrderCounts: Record<string, number> = {}
  const sellOrderCounts: Record<string, number> = {}

  for (const [id, product] of Object.entries(bz)) {
    const q = product.quick_status
    buyPrices[id] = q.buyPrice     // lowest ask — cost to buy instantly
    sellBidPrices[id] = q.sellPrice // highest bid — what you get selling
    weeklyVols[id] = q.buyMovingWeek
    buyOrderCounts[id] = q.buyOrders
    sellOrderCounts[id] = q.sellOrders
  }

  const maxVol = Math.max(...Object.values(weeklyVols), 1)

  const rows: CraftFlipRow[] = []

  for (const item of itemsData.items) {
    if (!item.recipe) continue
    const craftedId = item.id

    // Must be sellable on bazaar
    const sellBid = sellBidPrices[craftedId]
    if (!sellBid || sellBid <= 0) continue

    const ingredients = parseIngredients(item.recipe)
    if (ingredients.length === 0) continue

    // All ingredients must be on bazaar
    let ingredientCost = 0
    const recipeDetails: CraftFlipRow['recipe'] = []
    let missingIngredient = false

    for (const { id: ingId, count } of ingredients) {
      const price = buyPrices[ingId]
      if (!price || price <= 0) {
        missingIngredient = true
        break
      }
      ingredientCost += price * count
      recipeDetails.push({ id: ingId, name: formatName(ingId), count, unitPrice: price })
    }

    if (missingIngredient || ingredientCost <= 0) continue

    // Sell via order: post just above top bid (sell order)
    const sellOrder = Math.round((sellBid - 0.1) * 100) / 100
    const profitPerCraft = Math.round((sellOrder * (1 - TAX) - ingredientCost) * 100) / 100
    if (profitPerCraft <= 0) continue

    const margin = Math.round((profitPerCraft / ingredientCost) * 10000) / 100

    const wVol = weeklyVols[craftedId] ?? 0
    const volScore = Math.min(100, (wVol / maxVol) * 100)
    const depthPenalty = Math.min(100, (((buyOrderCounts[craftedId] ?? 0) + (sellOrderCounts[craftedId] ?? 0)) / 200) * 100)
    const fillScore = Math.round(volScore * 0.7 + (100 - depthPenalty) * 0.3)

    const craftCount = Math.max(1, Math.floor(BUDGET / ingredientCost))
    const totalProfit = Math.round(profitPerCraft * craftCount * 100) / 100

    rows.push({
      id: craftedId,
      name: formatName(craftedId),
      iconUrl: iconUrl(craftedId),
      ingredientCost: Math.round(ingredientCost * 100) / 100,
      sellPrice: sellOrder,
      profitPerCraft,
      margin,
      weeklyVolume: wVol,
      fillScore,
      craftCount,
      totalProfit,
      recipe: recipeDetails,
    })
  }

  // Sort by total profit descending
  rows.sort((a, b) => b.totalProfit - a.totalProfit)

  return { rows, totalProducts }
}
