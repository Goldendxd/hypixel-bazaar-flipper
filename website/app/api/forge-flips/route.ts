import { NextResponse } from 'next/server'
import { FORGE_RECIPES, ForgeRecipe } from '@/lib/forgeRecipes'

export const dynamic = 'force-dynamic'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

const BZ_TAX = 0.0125
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? ''
const MIN_BZ_EXIT_VOL = 40       // weekly insta-buys consuming your sell offer

// AH fees: 1% claiming + tiered listing fee
function ahNet(price: number): number {
  const listing = price < 10_000_000 ? 0.01 : price < 100_000_000 ? 0.02 : 0.025
  return price * (1 - listing - 0.01)
}

export interface ForgeIngredient {
  id: string
  name: string
  qty: number
  unitPrice: number
  totalPrice: number
  source: 'BZ' | 'AH' | 'FORGE' | 'COIN'
  iconUrl: string
  subForgeTime?: number
}

export interface ForgeFlipRow {
  id: string
  name: string
  iconUrl: string
  duration: number           // final forge step, seconds
  totalDuration: number      // including forced sub-forges
  hotm: number | null
  outputCount: number
  sellSource: 'BZ' | 'AH'
  sellPrice: number          // gross exit price
  revenue: number            // after fees
  ingredientCost: number
  profit: number
  margin: number
  coinsPerHour: number       // profit ÷ total forge hours (per slot)
  weeklyVolume: number       // 0 when AH (unknown)
  ingredients: ForgeIngredient[]
  warning: string | null
}

type QS = { buyPrice: number; sellPrice: number; buyMovingWeek: number; sellMovingWeek: number }

function titleCase(id: string): string {
  return id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

async function askGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_KEY) return null
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

async function fetchLbin(tag: string): Promise<number> {
  try {
    const r = await fetch(`https://sky.coflnet.com/api/item/price/${tag}/bin`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return 0
    const j = await r.json()
    return j?.lowest ?? 0
  } catch { return 0 }
}

async function compute(): Promise<{ rows: ForgeFlipRow[]; totalForgeItems: number; aiSummary: string | null }> {
  const bazRes = await fetch('https://api.hypixel.net/v2/skyblock/bazaar', { signal: AbortSignal.timeout(15000) })
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  const baz = await bazRes.json()
  const products = baz.products as Record<string, { quick_status: QS }>

  // Skip pet recipes (AMMONITE;4 etc) — their value depends on level/candy
  const recipes = FORGE_RECIPES.filter(r => !r.id.includes(';'))
  const recipeMap = new Map<string, ForgeRecipe>(recipes.map(r => [r.id, r]))

  // Collect every id that needs a price and isn't on the bazaar → coflnet lbin
  const needsAh = new Set<string>()
  for (const r of recipes) {
    if (!products[r.id]) needsAh.add(r.id)
    for (const inp of r.inputs) {
      if (inp.id !== 'SKYBLOCK_COIN' && !products[inp.id] && !inp.id.includes(';')) needsAh.add(inp.id)
    }
  }

  // Batched LBIN fetches (concurrency 15)
  const lbin = new Map<string, number>()
  const ahIds = Array.from(needsAh)
  for (let i = 0; i < ahIds.length; i += 15) {
    const batch = ahIds.slice(i, i + 15)
    const results = await Promise.allSettled(batch.map(async id => ({ id, price: await fetchLbin(id) })))
    for (const res of results) {
      if (res.status === 'fulfilled') lbin.set(res.value.id, res.value.price)
    }
  }

  // Acquisition price for an ingredient (0 = unobtainable on the market)
  function marketBuy(id: string): { price: number; source: 'BZ' | 'AH' } {
    const p = products[id]
    if (p && p.quick_status.buyPrice > 0) return { price: p.quick_status.buyPrice, source: 'BZ' }
    return { price: lbin.get(id) ?? 0, source: 'AH' }
  }

  // Forge cost of an item, used when an ingredient has no market listing.
  // Returns cost and the extra forge time forced into the chain.
  const memo = new Map<string, { cost: number; time: number } | null>()
  function forgeCost(id: string, stack: Set<string>): { cost: number; time: number } | null {
    if (memo.has(id)) return memo.get(id) ?? null
    const recipe = recipeMap.get(id)
    if (!recipe || stack.has(id)) return null
    stack.add(id)
    let cost = 0
    let time = recipe.duration
    for (const inp of recipe.inputs) {
      if (inp.id === 'SKYBLOCK_COIN') { cost += inp.qty; continue }
      const m = marketBuy(inp.id)
      if (m.price > 0) { cost += m.price * inp.qty; continue }
      const sub = forgeCost(inp.id, stack)
      if (!sub) { stack.delete(id); memo.set(id, null); return null }
      cost += sub.cost * inp.qty
      time += sub.time
    }
    stack.delete(id)
    const out = { cost: cost / Math.max(1, recipe.count), time }
    memo.set(id, out)
    return out
  }

  const rows: ForgeFlipRow[] = []

  for (const recipe of recipes) {
    // ── Exit pricing ──
    const bzOut = products[recipe.id]
    let sellSource: 'BZ' | 'AH'
    let sellPrice = 0
    let revenue = 0
    let weeklyVolume = 0

    if (bzOut && bzOut.quick_status.buyPrice > 0) {
      sellSource = 'BZ'
      sellPrice = Math.round((bzOut.quick_status.buyPrice - 0.1) * 100) / 100
      revenue = sellPrice * (1 - BZ_TAX)
      weeklyVolume = bzOut.quick_status.buyMovingWeek
      if (weeklyVolume < MIN_BZ_EXIT_VOL) continue
    } else {
      sellSource = 'AH'
      sellPrice = lbin.get(recipe.id) ?? 0
      if (sellPrice <= 0) continue
      revenue = ahNet(sellPrice)
    }
    revenue *= recipe.count

    // ── Ingredient costs ──
    let ingredientCost = 0
    let extraTime = 0
    let feasible = true
    const ingredients: ForgeIngredient[] = []

    for (const inp of recipe.inputs) {
      if (inp.id === 'SKYBLOCK_COIN') {
        ingredientCost += inp.qty
        ingredients.push({
          id: inp.id, name: 'Coins (forge fee)', qty: inp.qty, unitPrice: 1,
          totalPrice: inp.qty, source: 'COIN', iconUrl: 'https://sky.shiiyu.moe/item/GOLD_INGOT',
        })
        continue
      }
      const m = marketBuy(inp.id)
      if (m.price > 0) {
        ingredientCost += m.price * inp.qty
        ingredients.push({
          id: inp.id, name: titleCase(inp.id), qty: inp.qty,
          unitPrice: Math.round(m.price * 100) / 100,
          totalPrice: Math.round(m.price * inp.qty * 100) / 100,
          source: m.source, iconUrl: `https://sky.shiiyu.moe/item/${inp.id}`,
        })
        continue
      }
      const sub = forgeCost(inp.id, new Set())
      if (!sub || sub.cost <= 0) { feasible = false; break }
      ingredientCost += sub.cost * inp.qty
      extraTime += sub.time
      ingredients.push({
        id: inp.id, name: titleCase(inp.id), qty: inp.qty,
        unitPrice: Math.round(sub.cost * 100) / 100,
        totalPrice: Math.round(sub.cost * inp.qty * 100) / 100,
        source: 'FORGE', iconUrl: `https://sky.shiiyu.moe/item/${inp.id}`,
        subForgeTime: sub.time,
      })
    }
    if (!feasible || ingredientCost <= 0) continue

    const profit = Math.round((revenue - ingredientCost) * 100) / 100
    if (profit <= 0) continue

    const totalDuration = recipe.duration + extraTime
    // Floor at 15 min per cycle — sub-minute forges (drill upgrades) can't be
    // chained back-to-back in practice, so raw duration wildly inflates coins/h
    const hours = Math.max(totalDuration / 3600, 0.25)
    const margin = Math.round((profit / ingredientCost) * 1000) / 10
    const coinsPerHour = Math.round(profit / hours)

    let warning: string | null = null
    if (sellSource === 'AH' && margin > 150) {
      warning = 'LBIN-based exit with a huge margin — check recent AH sales before forging'
    } else if (sellSource === 'BZ' && weeklyVolume < 150) {
      warning = `Only ${weeklyVolume} insta-buys/week — your sell offer may sit a while`
    }

    rows.push({
      id: recipe.id,
      name: recipe.name,
      iconUrl: `https://sky.shiiyu.moe/item/${recipe.id}`,
      duration: recipe.duration,
      totalDuration,
      hotm: recipe.hotm,
      outputCount: recipe.count,
      sellSource,
      sellPrice: Math.round(sellPrice),
      revenue: Math.round(revenue),
      ingredientCost: Math.round(ingredientCost),
      profit: Math.round(profit),
      margin,
      coinsPerHour,
      weeklyVolume,
      ingredients,
      warning,
    })
  }

  rows.sort((a, b) => b.coinsPerHour - a.coinsPerHour)

  let aiSummary: string | null = null
  const top5 = rows.slice(0, 5)
  if (top5.length > 0) {
    const fmtDur = (s: number) => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
      return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
    }
    aiSummary = await askGemini(
      `You are a Hypixel SkyBlock forge expert. Top 5 forge flips by coins/hour right now:

${top5.map((r, i) =>
  `${i + 1}. ${r.name}: cost ${r.ingredientCost.toLocaleString()}, sells ${r.sellPrice.toLocaleString()} (${r.sellSource}), profit ${r.profit.toLocaleString()} in ${fmtDur(r.totalDuration)} = ${r.coinsPerHour.toLocaleString()}/h per slot${r.hotm ? `, needs HotM ${r.hotm}` : ''}`
).join('\n')}

For each give ONE short tip (max 15 words): volume reality, manipulation risk, or genuinely good. Numbered list 1-5 only.`
    )
  }

  return { rows, totalForgeItems: recipes.length, aiSummary }
}

export async function GET() {
  const now = Date.now()
  if (cachedResult && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedResult, { headers: { 'Cache-Control': 'public, s-maxage=300', 'X-Cache': 'HIT' } })
  }
  try {
    const result = await compute()
    cachedResult = result
    cacheTime = Date.now()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=300', 'X-Cache': 'MISS' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
