import { NextResponse } from 'next/server'
import { PET_CATALOG, PET_XP_TO_100, FANN_COINS_PER_XP } from '@/lib/petCatalog'
import { ahFees } from '@/lib/economy'

export const dynamic = 'force-dynamic'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

const COFLNET = 'https://sky.coflnet.com/api'

export interface PetLevelRow {
  tag: string
  name: string
  rarity: string
  iconUrl: string
  lvl1Price: number          // cheapest live Lvl 1 BIN
  lvl100Price: number        // cheapest live Lvl 100 BIN
  lvl1Count: number          // listing depth for liquidity read
  lvl100Count: number
  grossSpread: number        // lvl100 net of AH fees − lvl1 cost (before XP)
  ahFees: number
  xpNeeded: number           // XP to take it 1 → 100
  valuePerMilXp: number      // grossSpread ÷ (xpNeeded / 1e6) — the key metric
  fannCost: number           // pay-Fann-to-level cost (1.6 coins/XP)
  netViaFann: number         // guaranteed profit if you pay Fann to level it
  verdict: 'STRONG' | 'OK' | 'GRIND' | 'SKIP'
}

interface CoflnetAuction { startingBid: number; itemName?: string }

async function fetchBins(tag: string, rarity: string, level: number, attempt = 0): Promise<CoflnetAuction[]> {
  try {
    const r = await fetch(
      `${COFLNET}/auctions/tag/${tag}/active/bin?Rarity=${rarity}&PetLevel=${level}`,
      { signal: AbortSignal.timeout(10000), cache: 'no-store' }
    )
    if (!r.ok) {
      if (attempt < 2) { await sleep(500 * (attempt + 1)); return fetchBins(tag, rarity, level, attempt + 1) }
      return []
    }
    const j = await r.json()
    return Array.isArray(j) ? j : []
  } catch {
    if (attempt < 2) { await sleep(500 * (attempt + 1)); return fetchBins(tag, rarity, level, attempt + 1) }
    return []
  }
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))
const cheapest = (a: CoflnetAuction[]) => a.reduce((m, x) => (x.startingBid > 0 && x.startingBid < m ? x.startingBid : m), Infinity)

async function compute(): Promise<{ rows: PetLevelRow[]; checked: number }> {
  const rows: PetLevelRow[] = []

  // Batches of 3 pets (= 6 calls) so coflnet's burst limiter stays happy
  for (let i = 0; i < PET_CATALOG.length; i += 3) {
    const batch = PET_CATALOG.slice(i, i + 3)
    const results = await Promise.all(batch.map(async pet => {
      const [lo, hi] = await Promise.all([
        fetchBins(pet.tag, pet.rarity, 1),
        fetchBins(pet.tag, pet.rarity, 100),
      ])
      return { pet, lo, hi }
    }))

    for (const { pet, lo, hi } of results) {
      const lvl1 = cheapest(lo)
      const lvl100 = cheapest(hi)
      if (!isFinite(lvl1) || !isFinite(lvl100) || lvl1 <= 0 || lvl100 <= 0) continue

      const fees = ahFees(lvl100)
      const grossSpread = Math.round(fees.net - lvl1)
      const xpNeeded = PET_XP_TO_100[pet.rarity] ?? 25_353_230
      const valuePerMilXp = Math.round(grossSpread / (xpNeeded / 1e6))
      const fannCost = Math.round(xpNeeded * FANN_COINS_PER_XP)
      const netViaFann = grossSpread - fannCost

      // Verdict from value-per-million-XP (method-agnostic) + Fann floor
      let verdict: PetLevelRow['verdict']
      if (netViaFann > 0) verdict = 'STRONG'            // profits even paying Fann
      else if (valuePerMilXp > 1_500_000) verdict = 'OK'  // great if you level cheaply
      else if (valuePerMilXp > 600_000) verdict = 'GRIND' // worth it only grinding free XP
      else verdict = 'SKIP'

      rows.push({
        tag: pet.tag,
        name: pet.name,
        rarity: pet.rarity,
        iconUrl: `https://sky.coflnet.com/static/icon/${pet.tag}`,
        lvl1Price: Math.round(lvl1),
        lvl100Price: Math.round(lvl100),
        lvl1Count: lo.length,
        lvl100Count: hi.length,
        grossSpread,
        ahFees: fees.listingFee + fees.claimingTax,
        xpNeeded,
        valuePerMilXp,
        fannCost,
        netViaFann,
        verdict,
      })
    }
    if (i + 3 < PET_CATALOG.length) await sleep(250)
  }

  // Best value-per-XP first; skip clearly-negative spreads
  rows.sort((a, b) => b.valuePerMilXp - a.valuePerMilXp)
  return { rows: rows.filter(r => r.grossSpread > 0), checked: PET_CATALOG.length }
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
