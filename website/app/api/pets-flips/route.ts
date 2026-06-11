import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const COFLNET = 'https://sky.coflnet.com/api'
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? ''

// AH fees: 1% claiming tax + listing fee (1% under 10M, 2% 10–100M, 2.5% over)
function ahNet(price: number): number {
  const listing = price < 10_000_000 ? 0.01 : price < 100_000_000 ? 0.02 : 0.025
  return price * (1 - listing - 0.01)
}

const MIN_WEEKLY_SALES = 5      // upgraded pet must actually sell
const MAX_ROWS = 60

export interface KatFlipRow {
  tag: string
  name: string
  buyRarity: string
  sellRarity: string
  iconUrl: string
  buyPrice: number          // cheapest live auction for the base pet
  upgradeCost: number       // coins paid to Kat
  materialCost: number      // bazaar materials total
  totalCost: number
  sellPrice: number         // median sale of upgraded pet, after AH fees
  grossSell: number         // median sale before fees
  profit: number
  roi: number               // %
  upgradeHours: number
  profitPerHour: number
  weeklySales: number       // volume of the upgraded pet
  materials: Array<{ id: string; name: string; qty: number }>
  risk: 'LOW' | 'MEDIUM' | 'HIGH'
  riskReason: string | null
  aiTip: string | null
}

interface CoflnetKatEntry {
  volume: number
  median: number
  upgradeCost: number
  materialCost: number
  coreData: {
    name: string
    baseRarity: string
    hours: number
    cost: number
    material: string
    amount: number
    materials: Record<string, number> | null
    itemTag: string
  }
  targetRarity: string
  profit: number
  referenceAuction: string
  purchaseCost: number
  originAuctionName?: string
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

async function compute(): Promise<{ rows: KatFlipRow[]; fetched: number; aiSummary: string | null }> {
  const katRes = await fetch(`${COFLNET}/kat/profit`, { signal: AbortSignal.timeout(15000) })
  if (!katRes.ok) throw new Error('Coflnet Kat API fetch failed')
  const katData: CoflnetKatEntry[] = await katRes.json()

  // The feed lists one entry PER live auction, so the same pet appears many
  // times. Keep only the cheapest acquisition per (pet, base→target rarity).
  const bestByPet = new Map<string, CoflnetKatEntry>()
  for (const entry of katData) {
    const cd = entry.coreData
    if (!cd?.name || !cd.baseRarity || !entry.targetRarity) continue
    if (!entry.purchaseCost || entry.purchaseCost <= 0) continue
    const key = `${cd.itemTag || cd.name}__${cd.baseRarity}__${entry.targetRarity}`
    const existing = bestByPet.get(key)
    if (!existing || entry.purchaseCost < existing.purchaseCost) bestByPet.set(key, entry)
  }

  const rows: KatFlipRow[] = []

  for (const entry of bestByPet.values()) {
    const cd = entry.coreData
    const tag = cd.itemTag || `PET_${cd.name.toUpperCase().replace(/ /g, '_')}`

    const weeklySales = entry.volume ?? 0
    if (weeklySales < MIN_WEEKLY_SALES) continue

    const grossSell = entry.median ?? 0
    if (grossSell <= 0) continue
    const sellPrice = ahNet(grossSell)

    const buyPrice = entry.purchaseCost
    const upgradeCost = cd.cost ?? 0
    const materialCost = entry.materialCost ?? 0
    const totalCost = buyPrice + upgradeCost + materialCost

    const profit = sellPrice - totalCost
    if (profit <= 0) continue

    const roi = (profit / totalCost) * 100
    const hours = Math.max(0.05, cd.hours ?? 0)
    const profitPerHour = profit / hours

    // Risk model: thin volume or too-good-to-be-true ROI = sketchy median
    let risk: KatFlipRow['risk'] = 'LOW'
    let riskReason: string | null = null
    if (roi > 300) {
      risk = 'HIGH'; riskReason = 'ROI >300% — median is likely skewed by one lucky sale'
    } else if (weeklySales < 15) {
      risk = 'MEDIUM'; riskReason = `Only ${weeklySales} recent sales — the upgraded pet may sit unsold`
    } else if (roi > 120) {
      risk = 'MEDIUM'; riskReason = 'Very high ROI — double-check the upgraded pet price in-game'
    }

    const materials: KatFlipRow['materials'] = []
    if (cd.materials && Object.keys(cd.materials).length > 0) {
      for (const [mid, qty] of Object.entries(cd.materials)) {
        materials.push({ id: mid, name: titleCase(mid), qty })
      }
    } else if (cd.material && cd.amount > 0) {
      materials.push({ id: cd.material, name: titleCase(cd.material), qty: cd.amount })
    }

    rows.push({
      tag,
      name: cd.name,
      buyRarity: cd.baseRarity,
      sellRarity: entry.targetRarity,
      iconUrl: `https://sky.shiiyu.moe/item/${tag}`,
      buyPrice: Math.round(buyPrice),
      upgradeCost: Math.round(upgradeCost),
      materialCost: Math.round(materialCost),
      totalCost: Math.round(totalCost),
      sellPrice: Math.round(sellPrice),
      grossSell: Math.round(grossSell),
      profit: Math.round(profit),
      roi: Math.round(roi * 10) / 10,
      upgradeHours: cd.hours ?? 0,
      profitPerHour: Math.round(profitPerHour),
      weeklySales,
      materials,
      risk,
      riskReason,
      aiTip: null,
    })
  }

  rows.sort((a, b) => b.profit - a.profit)
  rows.splice(MAX_ROWS)

  // Gemini risk review of the top flips
  const top5 = rows.slice(0, 5)
  let aiSummary: string | null = null
  if (top5.length > 0) {
    const raw = await askGemini(
      `You are a Hypixel SkyBlock economy expert. Top 5 Kat pet-upgrade flips right now:

${top5.map((r, i) =>
  `${i + 1}. ${r.name} (${r.buyRarity} → ${r.sellRarity}): buy ${r.buyPrice.toLocaleString()}, Kat fee ${r.upgradeCost.toLocaleString()}${r.materialCost > 0 ? ` + ${r.materialCost.toLocaleString()} materials` : ''}, sells ~${r.sellPrice.toLocaleString()} after fees → profit ${r.profit.toLocaleString()} (${r.roi}% ROI), ${r.upgradeHours}h wait, ${r.weeklySales} recent sales`
).join('\n')}

For each give ONE short tip (max 15 words): manipulation risk, volume reality, or genuinely good. Numbered list 1-5 only.`
    )
    if (raw) {
      const tips = raw.split('\n').filter(l => /^\d\./.test(l.trim()))
      tips.forEach((tip, i) => { if (rows[i]) rows[i].aiTip = tip.replace(/^\d+\.\s*/, '').trim() })
      aiSummary = raw
    }
  }

  return { rows, fetched: katData.length, aiSummary }
}

export async function GET() {
  const now = Date.now()
  if (cachedResult && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedResult, { headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'HIT' } })
  }
  try {
    const result = await compute()
    cachedResult = result
    cacheTime = Date.now()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'MISS' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
