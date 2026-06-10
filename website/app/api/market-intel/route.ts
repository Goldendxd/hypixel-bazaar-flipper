import { NextResponse } from 'next/server'

// ═════════════════════════════════════════════════════════════════════════════
// MARKET INTELLIGENCE ENGINE
//
// - Rolling in-memory price history (snapshot per refresh, ~1/min)
// - Crash / spike anomaly detection with volume confirmation
// - Liquidity scoring, fill probability, volatility, manipulation filtering
// - Risk-adjusted flip ranking (profit/hour × fill probability ÷ risk)
// - Mayor impact intelligence
// ═════════════════════════════════════════════════════════════════════════════

const BZ_API     = 'https://api.hypixel.net/v2/skyblock/bazaar'
const ELECTION   = 'https://api.hypixel.net/v2/resources/skyblock/election'
const GEMINI_KEY = 'AIzaSyDtzLvCVeHYFLsp0DR3ftPyCwA7b_Evr50'
const TAX        = 0.0125     // bazaar sell tax (1.25% base)
const CACHE_TTL  = 60_000

// Bazaar order-flip semantics (quick_status):
//   buyPrice  = lowest ask  → you pay this insta-buying / undercut it with a sell order
//   sellPrice = highest bid → you get this insta-selling / outbid it with a buy order

interface QuickStatus {
  buyPrice: number; sellPrice: number
  buyVolume: number; sellVolume: number
  buyMovingWeek: number; sellMovingWeek: number
  buyOrders: number; sellOrders: number
}

// ─── Rolling history (in-memory, survives across requests) ───────────────────

interface Snap { t: number; buy: number; sell: number; buyVol: number }
const HISTORY_MAX = 90  // ~90 minutes of snapshots

const g = globalThis as unknown as {
  __mi_history?: Map<string, Snap[]>
  __mi_cache?: { data: object; ts: number }
  __mi_ai?: { text: string | null; ts: number }
}
if (!g.__mi_history) g.__mi_history = new Map()

function pushHistory(id: string, snap: Snap) {
  const h = g.__mi_history!.get(id) ?? []
  // Only push if the last snapshot is older than 45s (avoid duplicates on cache miss bursts)
  if (h.length === 0 || snap.t - h[h.length - 1].t > 45_000) {
    h.push(snap)
    if (h.length > HISTORY_MAX) h.shift()
    g.__mi_history!.set(id, h)
  }
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarketAlert {
  type: 'CRASH' | 'SPIKE'
  itemId: string
  itemName: string
  prevAvg: number
  current: number
  changePct: number
  weeklyVolume: number
  timestamp: string
  note: string
}

export interface IntelFlip {
  id: string
  name: string
  buyOrder: number          // post bid just above top bid
  sellOrder: number         // post ask just below lowest ask
  profitPerItem: number     // after tax
  marginPct: number
  liquidityScore: number    // 0–100
  fillProbability: number   // 0–100
  volatility: number        // % stdev/mean over rolling history
  manipulationFlag: boolean
  riskClass: 'SAFE' | 'RISKY'
  hourlyPotential: number   // realistic coins/hour estimate
  riskAdjusted: number      // ranking score
  weeklyBuyVol: number
  weeklySellVol: number
  spark: number[]           // recent mid prices
}

export interface HeatCell {
  id: string
  name: string
  price: number
  volatility: number
  spreadPct: number
  intensity: number   // 0–1 for heat coloring
  weeklyVolume: number
}

// ─── Mayor intelligence ───────────────────────────────────────────────────────

const MAYOR_IMPACT: Record<string, { summary: string; items: string[] }> = {
  Cole:   { summary: 'Mining economy boost — ore/gemstone supply rises, prices soften. Mithril & gemstone-related items dip.', items: ['MITHRIL_ORE', 'GEMSTONE', 'ENCHANTED_MITHRIL'] },
  Diana:  { summary: 'Mythological event — Griffin pets, Daedalus Axe, Minos relics spike in demand. Ancient Claw market heats up.', items: ['GRIFFIN_PET', 'DAEDALUS_AXE', 'ANCIENT_CLAW', 'ENCHANTED_ANCIENT_CLAW'] },
  Derpy:  { summary: 'Double mob HP/drops — slayer materials supply doubles, prices crash. Minion upgrades demand rises.', items: ['REVENANT_FLESH', 'TARANTULA_WEB', 'WOLF_TOOTH'] },
  Marina: { summary: 'Fishing boost — sea creature drops flood in, fishing loot prices dip. Fishing gear demand rises.', items: ['INK_SACK', 'SPONGE', 'LILY_PAD'] },
  Paul:   { summary: 'Dungeon-focused — dungeon runs surge, dungeon loot supply up. Kismet feathers & dungeon consumables in demand.', items: ['KISMET_FEATHER'] },
  Aatrox: { summary: 'Slayer cost halved — slayer item supply surges, prices soften across slayer drops.', items: ['REVENANT_FLESH', 'TARANTULA_WEB'] },
  Finnegan: { summary: 'Farming boost — crop supply rises, farming material prices dip. Farming tool demand up.', items: ['ENCHANTED_WHEAT', 'ENCHANTED_CARROT'] },
  Jerry:  { summary: 'Jerry mayhem — Jerry boxes and perkpocalypse chaos. Watch for wild swings everywhere.', items: [] },
  Scorpius: { summary: 'Dark Auction mayor — DA items spike. Scorpius costs coins; coin sinks affect liquidity.', items: [] },
  Dante:  { summary: 'Unusual mayor — expect non-standard market behavior.', items: [] },
}

async function fetchMayor(): Promise<{ name: string; perks: string[]; impact: string } | null> {
  try {
    const res = await fetch(ELECTION, { signal: AbortSignal.timeout(8000), next: { revalidate: 600 } })
    if (!res.ok) return null
    const j = await res.json()
    const name: string = j?.mayor?.name ?? 'Unknown'
    const perks: string[] = (j?.mayor?.perks ?? []).map((p: { name?: string }) => p?.name ?? '').filter(Boolean)
    const impact = MAYOR_IMPACT[name]?.summary ?? 'No major market-wide modifiers expected from this mayor.'
    return { name, perks, impact }
  } catch { return null }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

async function askGemini(prompt: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(13000),
      }
    )
    if (!res.ok) return null
    const j = await res.json()
    return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
  } catch { return null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatName(id: string): string {
  return id.split(/[_:]/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function rollingVolatility(h: Snap[]): number {
  const mids = h.map(s => (s.buy + s.sell) / 2).filter(v => v > 0)
  if (mids.length < 3) return 0
  const mean = mids.reduce((a, b) => a + b, 0) / mids.length
  if (mean === 0) return 0
  const variance = mids.reduce((a, b) => a + (b - mean) ** 2, 0) / mids.length
  return (Math.sqrt(variance) / mean) * 100
}

// ─── Core compute ─────────────────────────────────────────────────────────────

async function compute() {
  const now = Date.now()
  const [bzRes, mayor] = await Promise.all([
    fetch(BZ_API, { signal: AbortSignal.timeout(15000), cache: 'no-store' }),
    fetchMayor(),
  ])
  if (!bzRes.ok) throw new Error(`Bazaar fetch failed: ${bzRes.status}`)
  const baz = await bzRes.json()
  const products: Record<string, { quick_status: QuickStatus }> = baz?.products ?? {}

  const alerts: MarketAlert[] = []
  const flips: IntelFlip[] = []
  const heatCandidates: HeatCell[] = []

  let totalTracked = 0
  let volatilitySum = 0
  let volatilityCount = 0

  for (const [id, p] of Object.entries(products)) {
    const q = p.quick_status
    if (!q || !q.buyPrice || !q.sellPrice) continue
    totalTracked++

    // ── History update ──
    pushHistory(id, { t: now, buy: q.buyPrice, sell: q.sellPrice, buyVol: q.buyMovingWeek })
    const history = g.__mi_history!.get(id) ?? []
    const vol = rollingVolatility(history)
    if (history.length >= 5) { volatilitySum += vol; volatilityCount++ }

    // ── Anomaly detection (needs ≥ 10 snapshots ≈ 10 min of history) ──
    if (history.length >= 10) {
      const mid     = (q.buyPrice + q.sellPrice) / 2
      const baseline = median(history.slice(0, -3).map(s => (s.buy + s.sell) / 2))
      if (baseline >= 100_000 && mid > 0) {
        const changePct = ((mid - baseline) / baseline) * 100
        const volumePersists = q.buyMovingWeek > 1_000
        // Crash: ≥ 40% drop with persistent volume (filters API glitches: require 3 consecutive low snaps)
        const last3 = history.slice(-3).map(s => (s.buy + s.sell) / 2)
        const sustained = last3.every(v => v < baseline * 0.7)
        if (changePct <= -40 && volumePersists && sustained) {
          alerts.push({
            type: 'CRASH', itemId: id, itemName: formatName(id),
            prevAvg: Math.round(baseline), current: Math.round(mid),
            changePct: Math.round(changePct * 10) / 10,
            weeklyVolume: q.buyMovingWeek,
            timestamp: new Date(now).toISOString(),
            note: 'Sustained collapse with live volume — possible dump or patch effect. Verify in-game before buying.',
          })
        } else if (changePct >= 60 && volumePersists && last3.every(v => v > baseline * 1.4)) {
          alerts.push({
            type: 'SPIKE', itemId: id, itemName: formatName(id),
            prevAvg: Math.round(baseline), current: Math.round(mid),
            changePct: Math.round(changePct * 10) / 10,
            weeklyVolume: q.buyMovingWeek,
            timestamp: new Date(now).toISOString(),
            note: 'Sustained surge — demand shock or manipulation pump. High risk to chase.',
          })
        }
      }
    }

    // ── Flip evaluation ──
    const spread = q.buyPrice - q.sellPrice
    if (spread <= 0) continue

    const buyOrder  = q.sellPrice + 0.1
    const sellOrder = q.buyPrice - 0.1
    const profit    = sellOrder * (1 - TAX) - buyOrder
    if (profit <= 0) continue
    const marginPct = (profit / buyOrder) * 100

    // Liquidity score: log-scaled weekly movement, both sides matter
    const minWeek  = Math.min(q.buyMovingWeek, q.sellMovingWeek)
    const liquidityScore = Math.min(100, Math.round(Math.log10(Math.max(1, minWeek)) * 18))

    // Fill probability: depends on order book competition vs throughput
    const hourlyThroughput = minWeek / 168
    const competition = Math.max(1, q.buyOrders + q.sellOrders)
    const fillProbability = Math.min(100, Math.round((hourlyThroughput / (hourlyThroughput + competition * 8)) * 130 + liquidityScore * 0.35))

    // Manipulation heuristics:
    //  - absurd margin on thin volume
    //  - bid pushed above ask elsewhere / extreme spread with no flow
    const manipulationFlag =
      (marginPct > 25 && minWeek < 5_000) ||
      (marginPct > 100) ||
      (vol > 35) ||
      (q.sellPrice < 1 && q.buyPrice > 1000)

    const riskClass: 'SAFE' | 'RISKY' =
      !manipulationFlag && liquidityScore >= 55 && vol < 12 && marginPct < 20 ? 'SAFE' : 'RISKY'

    // Realistic hourly potential: capped by throughput share (assume you capture ≤ 8% of hourly flow)
    const itemsPerHour = hourlyThroughput * 0.08
    const hourlyPotential = profit * itemsPerHour * (fillProbability / 100)

    // Risk-adjusted score
    const riskPenalty = manipulationFlag ? 0.05 : 1 - Math.min(0.7, vol / 50)
    const riskAdjusted = hourlyPotential * riskPenalty

    if (minWeek >= 1_000 && profit > 1) {
      flips.push({
        id, name: formatName(id),
        buyOrder: Math.round(buyOrder * 10) / 10,
        sellOrder: Math.round(sellOrder * 10) / 10,
        profitPerItem: Math.round(profit * 10) / 10,
        marginPct: Math.round(marginPct * 100) / 100,
        liquidityScore, fillProbability,
        volatility: Math.round(vol * 100) / 100,
        manipulationFlag, riskClass,
        hourlyPotential: Math.round(hourlyPotential),
        riskAdjusted: Math.round(riskAdjusted),
        weeklyBuyVol: q.buyMovingWeek,
        weeklySellVol: q.sellMovingWeek,
        spark: history.slice(-24).map(s => (s.buy + s.sell) / 2),
      })
    }

    // ── Heatmap candidates: high-value, high-volume items ──
    if (q.buyPrice > 1_000 && q.buyMovingWeek > 100_000) {
      const spreadPct = (spread / q.buyPrice) * 100
      heatCandidates.push({
        id, name: formatName(id),
        price: Math.round(q.buyPrice * 10) / 10,
        volatility: Math.round(vol * 100) / 100,
        spreadPct: Math.round(spreadPct * 100) / 100,
        intensity: Math.max(0, Math.min(1, (vol / 20) * 0.6 + (spreadPct / 30) * 0.4)),
        weeklyVolume: q.buyMovingWeek,
      })
    }
  }

  // Sort + trim
  flips.sort((a, b) => b.riskAdjusted - a.riskAdjusted)
  const topFlips = flips.slice(0, 40)
  alerts.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
  const topAlerts = alerts.slice(0, 12)
  heatCandidates.sort((a, b) => b.weeklyVolume - a.weeklyVolume)
  const heatmap = heatCandidates.slice(0, 36)

  const marketVolatilityIndex = volatilityCount > 0
    ? Math.round((volatilitySum / volatilityCount) * 100) / 100
    : 0

  // ── AI summary (cached 10 min — expensive) ──
  let aiSummary: string | null = g.__mi_ai && now - g.__mi_ai.ts < 600_000 ? g.__mi_ai.text : null
  if (aiSummary === null && (!g.__mi_ai || now - g.__mi_ai.ts >= 600_000)) {
    const top5 = topFlips.slice(0, 5)
    const prompt = `You are a Hypixel SkyBlock market analyst. Current state:
- Market volatility index: ${marketVolatilityIndex}% (avg rolling stdev)
- Active mayor: ${mayor?.name ?? 'unknown'} — ${mayor?.impact ?? ''}
- Active alerts: ${topAlerts.length ? topAlerts.map(a => `${a.type} ${a.itemName} ${a.changePct}%`).join('; ') : 'none'}
- Top risk-adjusted bazaar order flips: ${top5.map(f => `${f.name}: +${f.profitPerItem}/item, ${f.marginPct}% margin, fill ${f.fillProbability}%, ${f.riskClass}`).join('; ')}

In 3 sentences max: what should a trader focus on right now, and what should they avoid? Be specific with item names.`
    aiSummary = await askGemini(prompt)
    g.__mi_ai = { text: aiSummary, ts: now }
  }

  return {
    fetchedAt: new Date(now).toISOString(),
    totalTracked,
    marketVolatilityIndex,
    historyDepth: Math.max(0, ...Array.from(g.__mi_history!.values()).map(h => h.length)),
    alerts: topAlerts,
    flips: topFlips,
    heatmap,
    mayor,
    aiSummary,
  }
}

export async function GET() {
  if (g.__mi_cache && Date.now() - g.__mi_cache.ts < CACHE_TTL) {
    return NextResponse.json(g.__mi_cache.data, { headers: { 'X-Cache': 'HIT' } })
  }
  try {
    const result = await compute()
    g.__mi_cache = { data: result, ts: Date.now() }
    return NextResponse.json(result, { headers: { 'X-Cache': 'MISS' } })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
