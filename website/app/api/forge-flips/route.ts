import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

const TAX = 0.0125
const GEMINI_KEY = 'AIzaSyDtzLvCVeHYFLsp0DR3ftPyCwA7b_Evr50'

async function askGemini(prompt: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(12000),
      }
    )
    if (!res.ok) return null
    const j = await res.json()
    return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
  } catch { return null }
}
const NEU_BASE = 'https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items'
const MIN_WEEKLY_SELL_VOL = 500

interface NeuItem {
  displayname: string
  crafttext?: string
  recipes?: Array<{
    type: string
    inputs: string[]
    count: number
    overrideOutputId?: string
    duration: number
  }>
}

export interface IngredientDetail {
  id: string
  name: string
  qty: number
  unitPrice: number
  totalPrice: number
  iconUrl: string
  isForged: boolean
  forgeTime?: number           // seconds for this ingredient's forge
  subIngredients?: IngredientDetail[]
}

export interface ForgeFlipRow {
  id: string
  name: string
  iconUrl: string
  duration: number             // seconds for the final forge step
  totalDuration: number        // seconds including all chained forge steps
  isShort: boolean             // totalDuration < 6h AND chain depth <= 1
  chainDepth: number           // 0 = no chain, 1 = one level, 2+ = multi-stage
  requiresHotM?: string
  sellPrice: number
  ingredientCost: number
  profitPerForge: number
  margin: number
  totalProfit: number
  forgesIn10M: number
  weeklyVolume: number
  sellMovingWeek: number
  isChained: boolean
  ingredients: IngredientDetail[]
}

function itemIconUrl(id: string): string {
  return `https://sky.shiiyu.moe/api/item/${id}`
}

function stripColorCodes(s: string): string {
  return s.replace(/[ÂÃ]?§[0-9a-fklmnor]/gi, '').trim()
}

async function fetchNeuItem(id: string): Promise<NeuItem | null> {
  try {
    const r = await fetch(`${NEU_BASE}/${id}.json`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    return r.json()
  } catch { return null }
}

function parseInput(s: string): { id: string; qty: number } {
  const idx = s.lastIndexOf(':')
  if (idx === -1) return { id: s.trim(), qty: 1 }
  return { id: s.slice(0, idx).trim(), qty: parseFloat(s.slice(idx + 1)) || 1 }
}

// Recursively build the full ingredient tree, expanding forged sub-ingredients to any depth
function buildIngTree(
  id: string,
  qty: number,
  forgeMap: Map<string, NeuItem>,
  nameMap: Record<string, string>,
  buyPrice: Record<string, number>,
  visited: Set<string> = new Set(),
): IngredientDetail {
  if (id === 'SKYBLOCK_COIN') {
    return { id, name: 'Coins (forge fee)', qty, unitPrice: 1, totalPrice: qty, iconUrl: itemIconUrl('GOLD_INGOT'), isForged: false }
  }
  const price = buyPrice[id] ?? 0
  const total = Math.round(price * qty * 100) / 100
  const isForged = forgeMap.has(id)

  let subIngredients: IngredientDetail[] | undefined
  let forgeTime: number | undefined

  if (isForged && !visited.has(id)) {
    const forgeItem = forgeMap.get(id)!
    const recipe = forgeItem.recipes!.find(r => r.type === 'forge')!
    forgeTime = recipe.duration
    const nextVisited = new Set(visited).add(id)
    subIngredients = recipe.inputs.map(inp => {
      const { id: sid, qty: sq } = parseInput(inp)
      return buildIngTree(sid, sq, forgeMap, nameMap, buyPrice, nextVisited)
    })
  }

  return {
    id, name: nameMap[id] ?? id, qty,
    unitPrice: Math.round(price * 100) / 100,
    totalPrice: total,
    iconUrl: itemIconUrl(id),
    isForged,
    forgeTime,
    subIngredients,
  }
}

// Get chain depth (max nesting of forged ingredients)
function chainDepth(id: string, forgeMap: Map<string, NeuItem>, visited: Set<string> = new Set()): number {
  if (!forgeMap.has(id) || visited.has(id)) return 0
  const recipe = forgeMap.get(id)!.recipes!.find(r => r.type === 'forge')!
  const nextVisited = new Set(visited).add(id)
  let max = 0
  for (const inp of recipe.inputs) {
    const { id: sid } = parseInput(inp)
    if (forgeMap.has(sid)) {
      max = Math.max(max, 1 + chainDepth(sid, forgeMap, nextVisited))
    }
  }
  return max
}

// Sum total forge time including all chained forges (visited prevents infinite loops)
function totalForgeTime(id: string, forgeMap: Map<string, NeuItem>, visited: Set<string> = new Set()): number {
  if (!forgeMap.has(id) || visited.has(id)) return 0
  const recipe = forgeMap.get(id)!.recipes!.find(r => r.type === 'forge')!
  const nextVisited = new Set(visited).add(id)
  let total = recipe.duration
  for (const inp of recipe.inputs) {
    const { id: sid } = parseInput(inp)
    if (forgeMap.has(sid)) {
      total += totalForgeTime(sid, forgeMap, nextVisited)
    }
  }
  return total
}

async function computeFlips(): Promise<{ rows: ForgeFlipRow[]; totalForgeItems: number; aiSummary: string | null }> {
  const [bazRes, treeRes] = await Promise.all([
    fetch('https://api.hypixel.net/v2/skyblock/bazaar', { signal: AbortSignal.timeout(15000) }),
    fetch('https://api.github.com/repos/NotEnoughUpdates/NotEnoughUpdates-REPO/git/trees/master?recursive=1', {
      signal: AbortSignal.timeout(15000),
    }),
  ])
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  if (!treeRes.ok) throw new Error('NEU tree fetch failed')

  const baz = await bazRes.json()
  const tree = await treeRes.json()

  const products = baz.products as Record<string, {
    quick_status: {
      buyPrice: number; sellPrice: number
      buyMovingWeek: number; sellMovingWeek: number
      buyOrders: number; sellOrders: number
    }
  }>

  const buyPrice: Record<string, number> = {}
  const sellBid: Record<string, number> = {}
  const weeklyBuy: Record<string, number> = {}
  const weeklySell: Record<string, number> = {}

  for (const [id, p] of Object.entries(products)) {
    const q = p.quick_status
    buyPrice[id] = q.buyPrice
    sellBid[id] = q.sellPrice
    weeklyBuy[id] = q.buyMovingWeek
    weeklySell[id] = q.sellMovingWeek
  }

  const allIds: string[] = (tree.tree as Array<{ path: string }>)
    .filter(x => x.path.startsWith('items/') && x.path.endsWith('.json'))
    .map(x => x.path.slice(6, -5))

  const BATCH = 60
  // forgeMap: id -> NeuItem (only items with forge recipes)
  const forgeMap = new Map<string, NeuItem>()
  const nameMap: Record<string, string> = {}

  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (id) => ({ id, item: await fetchNeuItem(id) }))
    )
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value.item) continue
      const { id, item } = r.value
      nameMap[id] = stripColorCodes(item.displayname ?? id)
      if ((item.recipes ?? []).some(r => r.type === 'forge')) {
        forgeMap.set(id, item)
      }
    }
  }

  const rows: ForgeFlipRow[] = []

  for (const [outputId, item] of forgeMap) {
    const recipe = item.recipes!.find(r => r.type === 'forge')!
    const inputs = recipe.inputs.map(parseInput)

    // Build full recursive ingredient tree
    let ingredientCost = 0
    let feasible = true
    const ingredients: IngredientDetail[] = []

    for (const { id: ingId, qty } of inputs) {
      if (ingId === 'SKYBLOCK_COIN') {
        ingredientCost += qty
        ingredients.push({ id: ingId, name: 'Coins (forge fee)', qty, unitPrice: 1, totalPrice: qty, iconUrl: itemIconUrl('GOLD_INGOT'), isForged: false })
        continue
      }
      const price = buyPrice[ingId]
      if (!price || price <= 0) { feasible = false; break }
      ingredientCost += price * qty
      ingredients.push(buildIngTree(ingId, qty, forgeMap, nameMap, buyPrice))
    }

    if (!feasible || ingredientCost <= 0) continue

    const outputSellBid = sellBid[outputId] ?? 0
    if (outputSellBid <= 0) continue

    const sellVol = weeklySell[outputId] ?? 0
    if (sellVol < MIN_WEEKLY_SELL_VOL) continue

    const sellOrder = Math.round((outputSellBid - 0.1) * 100) / 100
    const revenue = Math.round(sellOrder * (1 - TAX) * 100) / 100
    ingredientCost = Math.round(ingredientCost * 100) / 100
    const profitPerForge = Math.round((revenue - ingredientCost) * 100) / 100
    if (profitPerForge <= 0) continue

    const margin = Math.round((profitPerForge / ingredientCost) * 10000) / 100
    const forgesIn10M = Math.max(1, Math.floor(10_000_000 / ingredientCost))
    const totalProfit = Math.round(profitPerForge * forgesIn10M * 100) / 100

    const duration = recipe.duration
    const depth = chainDepth(outputId, forgeMap)
    const totDuration = totalForgeTime(outputId, forgeMap)
    // "Short" = final step under 6h AND no multi-stage chain (depth <= 1)
    const isShort = totDuration < 21600 && depth <= 1
    const isChained = depth >= 1

    // For long flips require at least 1% margin
    if (!isShort && margin < 1) continue

    const hotMMatch = (item.crafttext ?? '').match(/HotM\s*(\d+)/i)

    rows.push({
      id: outputId,
      name: nameMap[outputId] ?? outputId,
      iconUrl: itemIconUrl(outputId),
      duration,
      totalDuration: totDuration,
      isShort,
      chainDepth: depth,
      requiresHotM: hotMMatch ? `HotM ${hotMMatch[1]}` : undefined,
      sellPrice: sellOrder,
      ingredientCost,
      profitPerForge,
      margin,
      totalProfit,
      forgesIn10M,
      weeklyVolume: weeklyBuy[outputId] ?? 0,
      sellMovingWeek: sellVol,
      isChained,
      ingredients,
    })
  }

  rows.sort((a, b) => b.totalProfit - a.totalProfit)

  // Gemini analysis of top forge flips
  let aiSummary: string | null = null
  const top5 = rows.slice(0, 5)
  if (top5.length > 0) {
    function fmtDur(s: number) {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
      return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
    }
    const prompt = `You are a Hypixel SkyBlock forge expert. Here are the top 5 forge flips right now:

${top5.map((r, i) =>
  `${i + 1}. ${r.name}: ingredients ${r.ingredientCost.toLocaleString()} coins, sell ${r.sellPrice.toLocaleString()} coins, profit ${r.profitPerForge.toLocaleString()} per forge (${r.margin.toFixed(1)}% margin), forge time ${fmtDur(r.totalDuration)}, weekly sell vol ${r.sellMovingWeek.toLocaleString()}${r.requiresHotM ? `, requires ${r.requiresHotM}` : ''}`
).join('\n')}

For each, give ONE short tip (max 15 words): is the volume real, is this worth the forge time, or is it a solid flip? Format: numbered list 1-5 only.`

    aiSummary = await askGemini(prompt)
  }

  return { rows, totalForgeItems: forgeMap.size, aiSummary }
}

export async function GET() {
  const now = Date.now()
  if (cachedResult && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedResult, {
      headers: { 'Cache-Control': 'public, s-maxage=300', 'X-Cache': 'HIT' },
    })
  }
  try {
    const result = await computeFlips()
    cachedResult = result
    cacheTime = Date.now()
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=300', 'X-Cache': 'MISS' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
