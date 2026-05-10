import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const AH_TAX = 0.02
const COFLNET = 'https://sky.coflnet.com/api'
const GEMINI_KEY = 'AIzaSyDtzLvCVeHYFLsp0DR3ftPyCwA7b_Evr50'

export type FlipStrategy = 'KAT_UPGRADE' | 'TIER_BOOST'

export interface KatFlipRow {
  tag: string
  name: string
  strategy: FlipStrategy
  buyRarity: string
  sellRarity: string
  iconUrl: string
  buyPrice: number
  upgradeCost: number       // coins paid to Kat NPC
  materialCost: number      // bazaar items cost
  tierBoostCost: number     // cost of Tier Boost item (0 for Kat)
  totalCost: number
  sellPrice: number         // after 2% AH tax
  profit: number
  roi: number
  upgradeHours: number      // time Kat takes in hours
  materials: Array<{ name: string; qty: number; cost: number }>
  aiTip: string | null
}

// Shape from sky.coflnet.com/api/kat/profit
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
    materials: Record<string, number>
    itemTag: string
  }
  targetRarity: string
  profit: number
  referenceAuction: string
  purchaseCost: number
}

function petIconUrl(tag: string, rarity: string): string {
  // sky.shiiyu.moe supports /item/PET_TAG with query for rarity tinting
  return `https://sky.shiiyu.moe/item/${tag}?rarity=${rarity.toLowerCase()}`
}

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

async function compute(): Promise<{ rows: KatFlipRow[]; fetched: number; aiSummary: string | null }> {
  const katRes = await fetch(`${COFLNET}/kat/profit?limit=150`, { signal: AbortSignal.timeout(15000) })
  if (!katRes.ok) throw new Error('Kat API fetch failed')
  const katData: CoflnetKatEntry[] = await katRes.json()

  const rows: KatFlipRow[] = []

  for (const entry of katData) {
    const cd = entry.coreData
    if (!cd?.name || !cd.baseRarity || !entry.targetRarity) continue

    const tag = `PET_${cd.name.toUpperCase().replace(/ /g, '_')}`
    const buyPrice = entry.purchaseCost ?? 0
    if (buyPrice <= 0) continue

    const sellPrice = (entry.median ?? 0) * (1 - AH_TAX)
    if (sellPrice <= 0) continue

    const upgradeCost = cd.cost ?? 0
    const materialCost = entry.materialCost ?? 0
    const totalCost = buyPrice + upgradeCost + materialCost
    const profit = sellPrice - totalCost
    if (profit <= 0) continue

    const materials: KatFlipRow['materials'] = []
    if (cd.material && cd.amount > 0 && materialCost > 0) {
      materials.push({
        name: cd.material.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
        qty: cd.amount,
        cost: materialCost,
      })
    }

    rows.push({
      tag,
      name: cd.name,
      strategy: 'KAT_UPGRADE',
      buyRarity: cd.baseRarity,
      sellRarity: entry.targetRarity,
      iconUrl: petIconUrl(tag, cd.baseRarity),
      buyPrice: Math.round(buyPrice),
      upgradeCost: Math.round(upgradeCost),
      materialCost: Math.round(materialCost),
      tierBoostCost: 0,
      totalCost: Math.round(totalCost),
      sellPrice: Math.round(sellPrice),
      profit: Math.round(profit),
      roi: Math.round((profit / totalCost) * 10000) / 100,
      upgradeHours: cd.hours ?? 0,
      materials,
      aiTip: null,
    })
  }

  rows.sort((a, b) => b.profit - a.profit)

  // Ask Gemini to review top flips and flag risks / give tips
  const top5 = rows.slice(0, 5)
  let aiSummary: string | null = null
  if (top5.length > 0) {
    const prompt = `You are a Hypixel SkyBlock economy expert. Here are the top 5 Kat pet upgrade flips right now:

${top5.map((r, i) => `${i + 1}. ${r.name} (${r.buyRarity} → ${r.sellRarity}): buy ${r.buyPrice.toLocaleString()} coins, upgrade ${r.upgradeCost.toLocaleString()} coins${r.materialCost > 0 ? ` + ${r.materialCost.toLocaleString()} materials` : ''}, sell ${r.sellPrice.toLocaleString()} coins, profit ${r.profit.toLocaleString()} coins (${r.roi}% ROI), takes ${r.upgradeHours}h`).join('\n')}

For each flip, give ONE short sentence (max 15 words) of actionable advice — risks like price manipulation, low volume, long wait time, or why it's genuinely good. Format: just the numbered tips 1-5, nothing else.`

    const geminiRaw = await askGemini(prompt)
    if (geminiRaw) {
      // Parse numbered tips and attach to rows
      const tips = geminiRaw.split('\n').filter(l => /^\d\./.test(l.trim()))
      tips.forEach((tip, i) => {
        if (rows[i]) rows[i].aiTip = tip.replace(/^\d+\.\s*/, '').trim()
      })
      aiSummary = geminiRaw
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

