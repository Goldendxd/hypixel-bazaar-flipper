import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

// Skyblock year = 5 real days (2 election cycles per year-ish)
// Year is ~124 real hours. Elections happen at end of each year.
// Each SB month = 31 minutes real time. Year = 12 months = 372 minutes = 22320 seconds.
const SB_YEAR_REAL_MS = 22_320_000  // 6.2 real hours per SB year

interface MayorPerk {
  name: string
  description: string
  minister?: boolean
}

interface Candidate {
  key: string
  name: string
  perks: MayorPerk[]
  votes: number
}

export interface MayorFlipItem {
  id: string
  name: string
  iconUrl: string
  perkName: string
  perkReason: string
  action: 'BUY' | 'SELL' | 'HOLD' | 'WARN'
  actionReason: string
  price: number         // current bazaar buy price
  sellPrice: number     // current bazaar sell order
  weeklyBuyVol: number
  weeklySellVol: number
  priceChange?: number  // % change vs 7-day average (if available)
  isPotentiallyManipulated: boolean
}

export interface MayorData {
  mayorName: string
  mayorKey: string
  perks: MayorPerk[]
  isDerpy: boolean
  currentYear: number
  nextElectionYear: number
  msUntilElection: number
  votingCandidates: Candidate[]
  items: MayorFlipItem[]
}

// Mayor → affected bazaar items with action guidance
// Each entry: [id, perkName, reason, action, actionReason]
const MAYOR_ITEMS: Record<string, Array<{
  id: string
  perkKey: string
  reason: string
  action: 'BUY' | 'SELL' | 'HOLD' | 'WARN'
  actionReason: string
}>> = {
  // Derpy
  derp: [
    { id: 'ENCHANTED_EXPERIENCE_BOTTLE', perkKey: 'MOAR SKILLZ!!!', reason: '+50% skill XP → higher demand for XP items', action: 'BUY', actionReason: 'Demand spikes during Derpy — buy before prices peak' },
    { id: 'GRAND_EXP_BOTTLE', perkKey: 'MOAR SKILLZ!!!', reason: '+50% skill XP → XP bottles in high demand', action: 'BUY', actionReason: 'Best XP per-coin ratio — buy early, sell mid-term' },
    { id: 'TITANIC_EXP_BOTTLE', perkKey: 'MOAR SKILLZ!!!', reason: '+50% skill XP — players rush max skills', action: 'BUY', actionReason: 'Prices rise fast during Derpy term' },
    { id: 'COLOSSAL_EXP_BOTTLE', perkKey: 'MOAR SKILLZ!!!', reason: '+50% skill XP — efficient for high-level skills', action: 'BUY', actionReason: 'Buy now before demand drives price up' },
    { id: 'ENCHANTED_BREAD', perkKey: 'TURBO MINIONS!!!', reason: 'Double minion output → minion fuel demand rises', action: 'BUY', actionReason: 'Minion fuels sell well during double output period' },
    { id: 'HAMSTER_WHEEL', perkKey: 'TURBO MINIONS!!!', reason: 'Minion fuel — doubles output during Derpy', action: 'BUY', actionReason: 'High-velocity item during Derpy; flip quickly' },
    { id: 'CATALYST', perkKey: 'TURBO MINIONS!!!', reason: 'Minion fuel — doubles output during Derpy', action: 'BUY', actionReason: 'Stock up early; sell mid-term for profit' },
    { id: 'FOUL_FLESH', perkKey: 'TURBO MINIONS!!!', reason: 'Double minion drops = more mob drops on bazaar', action: 'SELL', actionReason: 'Oversupply from double drops suppresses price — sell now' },
    { id: 'ENCHANTED_ROTTEN_FLESH', perkKey: 'TURBO MINIONS!!!', reason: 'Double zombie minion output floods market', action: 'SELL', actionReason: 'Supply spike from TURBO MINIONS — clear stock' },
    { id: 'ENCHANTED_BONE', perkKey: 'TURBO MINIONS!!!', reason: 'Double skeleton minion drops → oversupply', action: 'SELL', actionReason: 'Sell before price drops further' },
  ],
  // Diana
  diana: [
    { id: 'ENCHANTED_CLOVER', perkKey: 'Mythological Ritual', reason: "Diana's event spawns Mythological creatures → luck drops", action: 'SELL', actionReason: 'Sell surplus clover items while demand is elevated' },
    { id: 'GRIFFIN_FEATHER', perkKey: 'Mythological Ritual', reason: 'Griffin burrow event spawns more creatures', action: 'BUY', actionReason: 'Rare drops spike in value during Diana; buy BIN low' },
    { id: 'ENCHANTED_FERMENTED_SPIDER_EYE', perkKey: 'Mythological Ritual', reason: 'Spider drops spike during mythological event', action: 'SELL', actionReason: 'Oversupply drives down price — sell now' },
  ],
  // Finnegan (farming)
  finnegan: [
    { id: 'ENCHANTED_WHEAT', perkKey: 'Ephemeral Trading', reason: 'Specific crop prices shift during Finnegan term', action: 'HOLD', actionReason: 'Monitor for price volatility; hold until clear trend' },
    { id: 'ENCHANTED_CARROT', perkKey: 'Ephemeral Trading', reason: 'Crop prices shift with Finnegan perks', action: 'HOLD', actionReason: 'Watch price movement before committing' },
    { id: 'ENCHANTED_POTATO', perkKey: 'Ephemeral Trading', reason: 'Crop prices shift with Finnegan perks', action: 'HOLD', actionReason: 'Watch price movement before committing' },
    { id: 'ENCHANTED_MELON', perkKey: 'Ephemeral Trading', reason: 'Crop prices shift with Finnegan perks', action: 'HOLD', actionReason: 'Watch price movement before committing' },
    { id: 'ENCHANTED_PUMPKIN', perkKey: 'Ephemeral Trading', reason: 'Pumpkin prices shift with Finnegan', action: 'HOLD', actionReason: 'Monitor before entering a large position' },
    { id: 'ENCHANTED_SUGAR_CANE', perkKey: 'Ephemeral Trading', reason: 'Sugar cane output affected by Finnegan perks', action: 'HOLD', actionReason: 'Watch the trend before buying or selling' },
  ],
  // Cole (mining)
  cole: [
    { id: 'MITHRIL_ORE', perkKey: 'Mining Fiesta', reason: 'Mining event → mithril demand spikes', action: 'SELL', actionReason: 'Flood of mithril from event miners — sell before crash' },
    { id: 'GEMSTONE_POWDER', perkKey: 'Mining Fiesta', reason: 'Mining event boosts gemstone gathering', action: 'SELL', actionReason: 'Supply increase during event — clear position' },
    { id: 'REFINED_MITHRIL', perkKey: 'Mining Fiesta', reason: 'Increased mithril supply suppresses price', action: 'HOLD', actionReason: 'Wait for post-event recovery before buying' },
    { id: 'TITANIUM_ORE', perkKey: 'Mining Fiesta', reason: 'Mining event → titanium demand spikes', action: 'SELL', actionReason: 'Sell titanium during event for premium price' },
  ],
  // Marina (fishing)
  marina: [
    { id: 'SPONGE', perkKey: 'Fishing Festival', reason: 'Fishing event increases fish drop rates', action: 'SELL', actionReason: 'Supply spike from fishing event — sell now' },
    { id: 'ENCHANTED_RAW_FISH', perkKey: 'Fishing Festival', reason: 'Fish drops flood the market during event', action: 'SELL', actionReason: 'Oversupply during fishing event — clear stock' },
    { id: 'ENCHANTED_RAW_SALMON', perkKey: 'Fishing Festival', reason: 'Salmon drops up during fishing event', action: 'SELL', actionReason: 'Price suppressed by event — sell before crash' },
    { id: 'ENCHANTED_CLAY', perkKey: 'Fishing Festival', reason: 'Clay fishing drops increase during Marina term', action: 'BUY', actionReason: 'Buy after supply spike crash; resell when prices recover' },
  ],
  // Paul (combat)
  paul: [
    { id: 'GOD_POTION_2', perkKey: 'Benediction', reason: 'Combat buffs encourage God Pot usage', action: 'BUY', actionReason: 'Demand for God Pots spikes during Paul — buy early' },
    { id: 'DUNGEON_CHEST_KEY', perkKey: 'EZPZ', reason: '+10 dungeon score bonus drives dungeon runs', action: 'BUY', actionReason: 'More dungeon runs = higher chest key demand' },
    { id: 'WITHER_ESSENCE', perkKey: 'EZPZ', reason: 'More dungeon runs = more Wither Essence drops', action: 'SELL', actionReason: 'Essence oversupply during Paul — sell into demand' },
  ],
  // Foxy (events)
  foxy: [
    { id: 'CHOCOLATE', perkKey: 'Extra Event', reason: 'Chocolate event → chocolate demand spikes', action: 'BUY', actionReason: 'Stockpile chocolate before prices peak during event' },
    { id: 'ENCHANTED_COOKIE', perkKey: 'Extra Event', reason: 'Event items in demand during Foxy term', action: 'BUY', actionReason: 'Event cookie demand rises — buy before event starts' },
  ],
  // Aatrox (slayer)
  aatrox: [
    { id: 'WOLF_TOOTH', perkKey: 'Slayer XP Buff', reason: 'Slayer XP buff → more slayer runs → more drops', action: 'SELL', actionReason: 'More slayer activity floods drop market — sell now' },
    { id: 'SPIDER_CATALYST', perkKey: 'Slayer XP Buff', reason: 'Spider slayer items in demand during buff', action: 'BUY', actionReason: 'Demand rises during slayer events' },
  ],
}

async function compute(): Promise<MayorData> {
  const [elecRes, bazRes] = await Promise.all([
    fetch('https://api.hypixel.net/resources/skyblock/election', { signal: AbortSignal.timeout(10000) }),
    fetch('https://api.hypixel.net/skyblock/bazaar', { signal: AbortSignal.timeout(15000) }),
  ])
  if (!elecRes.ok) throw new Error('Election fetch failed')
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')

  const elec = await elecRes.json()
  const baz = await bazRes.json()

  const mayor = elec.mayor
  const current = elec.current
  const mayorKey: string = mayor.key
  const mayorName: string = mayor.name
  const isDerpy = mayorKey === 'derp'

  const currentYear: number = current.year
  const nextElectionYear = currentYear + 1

  // Estimate time until next election using SkyBlock year length
  // Each SB year ≈ 6.2 real hours, election at year end
  // We can't get exact ms from the API, so estimate based on year
  const msUntilElection = SB_YEAR_REAL_MS  // approximate — API doesn't expose exact time

  const products = baz.products as Record<string, {
    quick_status: {
      buyPrice: number; sellPrice: number
      buyMovingWeek: number; sellMovingWeek: number
    }
  }>

  const affectedItems = MAYOR_ITEMS[mayorKey] ?? []
  const items: MayorFlipItem[] = []

  for (const def of affectedItems) {
    const p = products[def.id]
    if (!p) continue
    const q = p.quick_status
    const price = q.buyPrice
    const sellPrice = Math.round((q.sellPrice - 0.1) * 100) / 100
    if (price <= 0) continue

    // Flag potential manipulation: if price is >5x the sell side spread is extreme
    const spread = price / Math.max(q.sellPrice, 1)
    const isPotentiallyManipulated = spread > 8

    items.push({
      id: def.id,
      name: def.id.replace(/_/g, ' ').replace(/ENCHANTED /i, '✦ ').split(' ')
        .map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' '),
      iconUrl: `https://sky.coflnet.com/static/icon/${def.id}`,
      perkName: def.perkKey,
      perkReason: def.reason,
      action: def.action,
      actionReason: def.actionReason,
      price,
      sellPrice,
      weeklyBuyVol: q.buyMovingWeek,
      weeklySellVol: q.sellMovingWeek,
      isPotentiallyManipulated,
    })
  }

  // Sort: BUY first (most actionable), then SELL, then HOLD, then WARN
  const order: Record<string, number> = { BUY: 0, SELL: 1, HOLD: 2, WARN: 3 }
  items.sort((a, b) => (order[a.action] ?? 9) - (order[b.action] ?? 9))

  return {
    mayorName,
    mayorKey,
    perks: mayor.perks,
    isDerpy,
    currentYear: mayor.election?.year ?? currentYear,
    nextElectionYear,
    msUntilElection,
    votingCandidates: current.candidates ?? [],
    items,
  }
}

export async function GET() {
  const now = Date.now()
  if (cachedResult && now - cacheTime < CACHE_TTL) {
    return NextResponse.json(cachedResult, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'HIT' },
    })
  }
  try {
    const result = await compute()
    cachedResult = result
    cacheTime = Date.now()
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=60', 'X-Cache': 'MISS' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
