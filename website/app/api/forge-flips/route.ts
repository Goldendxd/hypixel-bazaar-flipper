import { NextResponse } from 'next/server'
import { FORGE_RECIPES, ForgeRecipe } from '@/lib/forgeRecipes'
import { ahFees, bazaarNet } from '@/lib/economy'

export const dynamic = 'force-dynamic'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? ''
const MIN_BZ_EXIT_VOL = 40       // weekly insta-buys consuming your sell offer

export interface ForgeIngredient {
  id: string
  name: string
  qty: number
  unitPrice: number
  totalPrice: number
  source: 'BZ' | 'AH' | 'FORGE' | 'COIN'
  forgeCheaper: boolean      // sub-forging beats buying on the market
  marketPrice: number        // what buying outright would cost (0 = unlisted)
  iconUrl: string
  subForgeTime?: number
}

export interface ForgeFlipRow {
  id: string
  name: string
  iconUrl: string
  duration: number           // final forge step, seconds
  totalDuration: number      // including cheapest-route sub-forges
  hotm: number | null
  outputCount: number
  sellSource: 'BZ' | 'AH'
  sellPrice: number          // gross exit price
  fees: number               // bazaar tax or AH listing+claiming
  revenue: number            // net of fees
  ingredientCost: number     // min-cost dependency tree total
  naiveCost: number          // buying every input outright (for comparison)
  profit: number             // NET profit
  margin: number
  coinsPerHour: number       // net profit ÷ forge hours (per slot)
  weeklyVolume: number       // 0 when AH (unknown)
  chainDepth: number         // how many forge layers the cheapest route uses
  ingredients: ForgeIngredient[]
  warning: string | null
}

type QS = { buyPrice: number; sellPrice: number; buyMovingWeek: number; sellMovingWeek: number }
type BzProduct = {
  quick_status: QS
  sell_summary?: Array<{ pricePerUnit: number }>
  buy_summary?: Array<{ pricePerUnit: number }>
}

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

async function fetchLbin(tag: string, attempt = 0): Promise<number> {
  try {
    const r = await fetch(`https://sky.coflnet.com/api/item/price/${tag}/bin`, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
    if (!r.ok) {
      if (attempt < 3) {
        await new Promise(res => setTimeout(res, 600 * (attempt + 1)))
        return fetchLbin(tag, attempt + 1)
      }
      return 0
    }
    const j = await r.json()
    return j?.lowest ?? 0
  } catch {
    if (attempt < 3) {
      await new Promise(res => setTimeout(res, 600 * (attempt + 1)))
      return fetchLbin(tag, attempt + 1)
    }
    return 0
  }
}

async function compute(): Promise<{ rows: ForgeFlipRow[]; totalForgeItems: number; aiSummary: string | null }> {
  const bazRes = await fetch('https://api.hypixel.net/v2/skyblock/bazaar', { signal: AbortSignal.timeout(15000) })
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')
  const baz = await bazRes.json()
  const products = baz.products as Record<string, BzProduct>

  // Skip pet recipes (AMMONITE;4 etc) — their value depends on level/candy
  const recipes = FORGE_RECIPES.filter(r => !r.id.includes(';'))
  const recipeMap = new Map<string, ForgeRecipe>(recipes.map(r => [r.id, r]))

  // Every id that may need an AH price (outputs + all inputs not on bazaar)
  const needsAh = new Set<string>()
  for (const r of recipes) {
    if (!products[r.id]) needsAh.add(r.id)
    for (const inp of r.inputs) {
      if (inp.id !== 'SKYBLOCK_COIN' && !products[inp.id] && !inp.id.includes(';')) needsAh.add(inp.id)
    }
  }

  const lbin = new Map<string, number>()
  const ahIds = Array.from(needsAh)
  for (let i = 0; i < ahIds.length; i += 5) {
    const batch = ahIds.slice(i, i + 5)
    const results = await Promise.allSettled(batch.map(async id => ({ id, price: await fetchLbin(id) })))
    for (const res of results) {
      if (res.status === 'fulfilled') lbin.set(res.value.id, res.value.price)
    }
    if (i + 5 < ahIds.length) await new Promise(res => setTimeout(res, 250))
  }

  function marketBuy(id: string): { price: number; source: 'BZ' | 'AH' } {
    const p = products[id]
    // Real insta-buy cost = lowest ask (buy_summary side) in the live book
    const ask = p?.buy_summary?.[0]?.pricePerUnit ?? p?.quick_status.buyPrice ?? 0
    if (ask > 0) return { price: ask, source: 'BZ' }
    return { price: lbin.get(id) ?? 0, source: 'AH' }
  }

  // ── Min-cost dependency resolution ─────────────────────────────────────────
  // The Forge is a dependency-chain system: drills, gemstone chains and
  // upgrade items consume previous-tier items. For every node we take
  // min(market price, recursive forge cost) — never just the flat recipe.
  interface CostNode { cost: number; time: number; depth: number; viaForge: boolean }
  const memo = new Map<string, CostNode | null>()

  function bestCost(id: string, stack: Set<string>): CostNode | null {
    if (memo.has(id)) return memo.get(id) ?? null
    const market = marketBuy(id)
    const recipe = recipeMap.get(id)

    let forged: CostNode | null = null
    if (recipe && !stack.has(id)) {
      stack.add(id)
      let cost = 0
      let time = recipe.duration
      let depth = 1
      let ok = true
      for (const inp of recipe.inputs) {
        if (inp.id === 'SKYBLOCK_COIN') { cost += inp.qty; continue }
        const sub = bestCost(inp.id, stack)
        if (!sub) { ok = false; break }
        cost += sub.cost * inp.qty
        if (sub.viaForge) {
          time += sub.time
          depth = Math.max(depth, sub.depth + 1)
        }
      }
      stack.delete(id)
      if (ok) forged = { cost: cost / Math.max(1, recipe.count), time, depth, viaForge: true }
    }

    let result: CostNode | null = null
    if (market.price > 0 && forged) {
      result = market.price <= forged.cost
        ? { cost: market.price, time: 0, depth: 0, viaForge: false }
        : forged
    } else if (market.price > 0) {
      result = { cost: market.price, time: 0, depth: 0, viaForge: false }
    } else {
      result = forged
    }
    // Only memoize outside of an active recursion stack to keep cycles safe
    if (stack.size === 0) memo.set(id, result)
    return result
  }

  const rows: ForgeFlipRow[] = []

  for (const recipe of recipes) {
    // ── Exit pricing (tax-aware) ──
    const bzOut = products[recipe.id]
    let sellSource: 'BZ' | 'AH'
    let sellPrice = 0
    let revenue = 0
    let fees = 0
    let weeklyVolume = 0

    const bzAsk = bzOut ? (bzOut.buy_summary?.[0]?.pricePerUnit ?? bzOut.quick_status.buyPrice) : 0
    if (bzOut && bzAsk > 0) {
      sellSource = 'BZ'
      sellPrice = Math.round((bzAsk - 0.1) * 100) / 100
      revenue = bazaarNet(sellPrice)
      fees = sellPrice - revenue
      weeklyVolume = bzOut.quick_status.buyMovingWeek
      if (weeklyVolume < MIN_BZ_EXIT_VOL) continue
    } else {
      sellSource = 'AH'
      sellPrice = lbin.get(recipe.id) ?? 0
      if (sellPrice <= 0) continue
      const f = ahFees(sellPrice)
      revenue = f.net
      fees = f.listingFee + f.claimingTax
    }
    revenue *= recipe.count
    fees *= recipe.count

    // ── Ingredient costs via min-cost trees ──
    let ingredientCost = 0
    let naiveCost = 0
    let extraTime = 0
    let chainDepth = 0
    let feasible = true
    const ingredients: ForgeIngredient[] = []

    for (const inp of recipe.inputs) {
      if (inp.id === 'SKYBLOCK_COIN') {
        ingredientCost += inp.qty
        naiveCost += inp.qty
        ingredients.push({
          id: inp.id, name: 'Coins (forge fee)', qty: inp.qty, unitPrice: 1,
          totalPrice: inp.qty, source: 'COIN', forgeCheaper: false, marketPrice: inp.qty,
          iconUrl: 'https://sky.shiiyu.moe/item/GOLD_INGOT',
        })
        continue
      }
      const node = bestCost(inp.id, new Set())
      if (!node || node.cost <= 0) { feasible = false; break }
      const market = marketBuy(inp.id)

      ingredientCost += node.cost * inp.qty
      naiveCost += (market.price > 0 ? market.price : node.cost) * inp.qty
      if (node.viaForge) {
        extraTime += node.time
        chainDepth = Math.max(chainDepth, node.depth)
      }

      ingredients.push({
        id: inp.id, name: titleCase(inp.id), qty: inp.qty,
        unitPrice: Math.round(node.cost * 100) / 100,
        totalPrice: Math.round(node.cost * inp.qty * 100) / 100,
        source: node.viaForge ? 'FORGE' : market.source,
        forgeCheaper: node.viaForge && market.price > 0,
        marketPrice: Math.round(market.price * 100) / 100,
        iconUrl: `https://sky.shiiyu.moe/item/${inp.id}`,
        subForgeTime: node.viaForge ? node.time : undefined,
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
      fees: Math.round(fees),
      revenue: Math.round(revenue),
      ingredientCost: Math.round(ingredientCost),
      naiveCost: Math.round(naiveCost),
      profit: Math.round(profit),
      margin,
      coinsPerHour,
      weeklyVolume,
      chainDepth,
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
      `You are a Hypixel SkyBlock forge expert. Top 5 forge flips by coins/hour (full dependency-chain costs, taxes included):

${top5.map((r, i) =>
  `${i + 1}. ${r.name}: tree cost ${r.ingredientCost.toLocaleString()}, sells ${r.sellPrice.toLocaleString()} (${r.sellSource}), NET ${r.profit.toLocaleString()} in ${fmtDur(r.totalDuration)} = ${r.coinsPerHour.toLocaleString()}/h per slot${r.hotm ? `, HotM ${r.hotm}` : ''}${r.chainDepth > 1 ? `, ${r.chainDepth}-deep chain` : ''}`
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
