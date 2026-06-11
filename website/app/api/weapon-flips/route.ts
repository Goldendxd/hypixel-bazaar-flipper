import { NextResponse } from 'next/server'
import { WEAPON_CATALOG, WeaponCategory } from '@/lib/weaponCatalog'
import { ahFees } from '@/lib/economy'

export const dynamic = 'force-dynamic'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

export interface WeaponRow {
  id: string
  name: string
  category: WeaponCategory
  tier: 'EARLY' | 'MID' | 'LATE' | 'END'
  iconUrl: string

  marketPrice: number        // lowest BIN
  median: number             // recent median sale (0 = unknown)
  volume: number             // recent sales (0 = unknown)
  demand: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'

  craftable: boolean
  craftCostInsta: number
  craftCostOrder: number
  // Craft-flip profitability (sell at LBIN, full AH fees deducted)
  grossSale: number
  ahListingFee: number
  ahClaimingTax: number
  netProfit: number          // PRIMARY (buy-order materials)
  netProfitInsta: number
  roi: number
  manipulated: boolean
  ingredients: Array<{ id: string; name: string; qty: number; orderCost: number; instaCost: number }>
}

interface CoflnetCraft {
  itemId: string
  itemName: string | null
  sellPrice: number
  craftCost: number
  buyOrderCraftCost: number
  ingredients: Array<{ itemId: string; count: number; cost: number; buyOrderCost: number | null }>
  volume: number
  median: number
}

function titleCase(id: string): string {
  return id.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
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

async function compute(): Promise<{ rows: WeaponRow[]; totalCatalog: number }> {
  // Craft costs come from coflnet's pre-computed craft table
  const craftMap = new Map<string, CoflnetCraft>()
  try {
    const res = await fetch('https://sky.coflnet.com/api/craft/profit', { signal: AbortSignal.timeout(20000) })
    if (res.ok) {
      const crafts: CoflnetCraft[] = await res.json()
      for (const c of crafts) craftMap.set(c.itemId, c)
    }
  } catch { /* craft data optional — market prices still shown */ }

  // LBIN for every catalog weapon — modest concurrency with gaps so
  // coflnet's burst limiter doesn't silently zero half the catalog
  const lbin = new Map<string, number>()
  for (let i = 0; i < WEAPON_CATALOG.length; i += 5) {
    const batch = WEAPON_CATALOG.slice(i, i + 5)
    const results = await Promise.allSettled(batch.map(async w => ({ id: w.id, price: await fetchLbin(w.id) })))
    for (const r of results) {
      if (r.status === 'fulfilled') lbin.set(r.value.id, r.value.price)
    }
    if (i + 5 < WEAPON_CATALOG.length) await new Promise(res => setTimeout(res, 250))
  }

  const rows: WeaponRow[] = []

  for (const w of WEAPON_CATALOG) {
    const craft = craftMap.get(w.id)
    const marketPrice = lbin.get(w.id) ?? 0
    if (marketPrice <= 0 && !craft) continue   // nothing tradable to show

    const sellPrice = marketPrice > 0 ? marketPrice : (craft?.sellPrice ?? 0)
    const median = craft?.median ?? 0
    const volume = craft?.volume ?? 0
    const demand: WeaponRow['demand'] =
      volume >= 50 ? 'HIGH' : volume >= 10 ? 'MEDIUM' : volume > 0 ? 'LOW' : 'UNKNOWN'

    const craftable = !!craft && craft.craftCost > 0
    const craftCostInsta = craftable ? craft!.craftCost : 0
    const craftCostOrder = craftable ? (craft!.buyOrderCraftCost > 0 ? craft!.buyOrderCraftCost : craft!.craftCost) : 0

    const fees = ahFees(sellPrice)
    const netProfit = craftable ? fees.net - craftCostOrder : 0
    const netProfitInsta = craftable ? fees.net - craftCostInsta : 0

    const manipulated = median > 0 && sellPrice > median * 2.5

    rows.push({
      id: w.id,
      name: w.name,
      category: w.category,
      tier: w.tier,
      iconUrl: `https://sky.shiiyu.moe/item/${w.id}`,
      marketPrice: Math.round(sellPrice),
      median: Math.round(median),
      volume,
      demand,
      craftable,
      craftCostInsta: Math.round(craftCostInsta),
      craftCostOrder: Math.round(craftCostOrder),
      grossSale: fees.gross,
      ahListingFee: fees.listingFee,
      ahClaimingTax: fees.claimingTax,
      netProfit: Math.round(netProfit),
      netProfitInsta: Math.round(netProfitInsta),
      roi: craftCostOrder > 0 ? Math.round((netProfit / craftCostOrder) * 1000) / 10 : 0,
      manipulated,
      ingredients: (craft?.ingredients ?? []).map(ing => ({
        id: ing.itemId,
        name: titleCase(ing.itemId),
        qty: ing.count,
        orderCost: Math.round(ing.buyOrderCost ?? ing.cost),
        instaCost: Math.round(ing.cost),
      })),
    })
  }

  // Craft-flippable + profitable first, then by market price
  rows.sort((a, b) => {
    const ap = a.craftable && a.netProfit > 0 ? 1 : 0
    const bp = b.craftable && b.netProfit > 0 ? 1 : 0
    if (ap !== bp) return bp - ap
    if (ap === 1) return b.netProfit - a.netProfit
    return b.marketPrice - a.marketPrice
  })

  return { rows, totalCatalog: WEAPON_CATALOG.length }
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
