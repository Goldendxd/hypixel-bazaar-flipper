import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? ''

// ── SkyBlock calendar ────────────────────────────────────────────────────────
// 1 SkyBlock day = 20 real minutes; 1 year = 372 days = 124 real hours.
// Elections close on Late Spring 27th (day 88 of the year) of the year AFTER
// the election year — the new mayor takes office at that moment.
const SB_EPOCH_MS = 1_560_275_700_000        // SkyBlock year 1 start (calibrated)
const SB_DAY_MS   = 20 * 60 * 1000
const SB_YEAR_MS  = 372 * SB_DAY_MS          // 446,400,000 ms = 124h
const ELECTION_CLOSE_DAY = 88                // Late Spring 27th

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
  price: number          // insta-buy (lowest ask)
  sellPrice: number      // sell-offer exit (ask − 0.1)
  weeklyBuyVol: number
  weeklySellVol: number
  isPotentiallyManipulated: boolean
}

export interface NextMayorPrep {
  candidateName: string
  candidateKey: string
  voteShare: number
  isLeading: boolean
  items: MayorFlipItem[]
  aiRecommendation: string | null
}

export interface MayorData {
  mayorName: string
  mayorKey: string
  perks: MayorPerk[]
  minister: { name: string; perk: MayorPerk } | null
  isSpecial: boolean
  currentYear: number
  nextElectionYear: number
  msUntilElection: number
  votingCandidates: Candidate[]
  totalVotes: number
  items: MayorFlipItem[]
  nextMayorPreps: NextMayorPrep[]
  currentAiSummary: string | null
}

// ── Mayor → affected bazaar items, keyed by lowercase mayor NAME ─────────────
// (The Hypixel API uses internal keys like "dungeons" for Paul and "pets" for
//  Diana, which silently broke key-based lookups before. Names are stable.)
//
// action BUY  = stock up NOW, sell into the demand peak
// action SELL = clear holdings NOW (supply flood incoming)
// action HOLD = volatile, wait for a signal
// action WARN = exercise caution
interface ItemDef {
  id: string
  perkKey: string
  reason: string
  action: 'BUY' | 'SELL' | 'HOLD' | 'WARN'
  actionReason: string
}

const MAYOR_ITEMS: Record<string, ItemDef[]> = {
  // ─── PAUL (key: dungeons) ─────────────────────────────────────────────────
  paul: [
    { id: 'DUNGEON_CHEST_KEY', perkKey: 'EZPZ + Marauder', reason: 'EZPZ gives +10 dungeon score (easier S/S+), Marauder makes reward chests 20% cheaper — dungeoneers open far more chests', action: 'BUY', actionReason: 'Biggest Paul trade: buy keys early in the term, sell into the daily dungeon-rush demand' },
    { id: 'KISMET_FEATHER', perkKey: 'EZPZ', reason: 'More S+ runs means more master-mode chest rerolls — Kismet Feather demand climbs with run volume', action: 'BUY', actionReason: 'Demand tracks dungeon activity, which spikes all term under Paul' },
    { id: 'SPIRIT_LEAP', perkKey: 'EZPZ', reason: 'More dungeon runs → more Spirit Leap consumption in party runs', action: 'BUY', actionReason: 'Consumable demand rises with the dungeon surge' },
    { id: 'ESSENCE_WITHER', perkKey: 'EZPZ', reason: 'More Catacombs runs → more Wither Essence drops flood the bazaar', action: 'SELL', actionReason: 'Essence supply rises sharply — sell before the price sags' },
    { id: 'ESSENCE_UNDEAD', perkKey: 'EZPZ', reason: 'Same supply mechanic as Wither Essence — more runs, more drops', action: 'SELL', actionReason: 'Clear undead essence early in the term' },
  ],
  // ─── COLE (key: mining) ───────────────────────────────────────────────────
  cole: [
    { id: 'COAL', perkKey: 'Mining Fiesta', reason: 'Mining Fiesta events flood the market with ores; minion + player output rises sharply', action: 'SELL', actionReason: 'Sell coal stock before fiesta supply peaks' },
    { id: 'ENCHANTED_COAL', perkKey: 'Mining Fiesta', reason: 'Oversupply cascades up the crafting chain during fiestas', action: 'SELL', actionReason: 'Clear before the supply wave is processed upward' },
    { id: 'MITHRIL_ORE', perkKey: 'Mining Fiesta', reason: 'Dwarven Mines activity surges — mithril floods in during Cole', action: 'SELL', actionReason: 'Mithril price historically dips through Cole terms' },
    { id: 'REFINED_MITHRIL', perkKey: 'Mining Fiesta', reason: 'Players process excess mithril → refined supply rises too', action: 'SELL', actionReason: 'Sell refined mithril before the crafting wave lands' },
    { id: 'TITANIUM_ORE', perkKey: 'Mining Fiesta', reason: 'Titanium gets notably less scarce while everyone mines', action: 'SELL', actionReason: 'Offload before peak supply' },
    { id: 'REFINED_MINERAL', perkKey: 'Mining Fiesta', reason: 'Cole-exclusive rare drop (~1/750 ores) — only obtainable during his term', action: 'BUY', actionReason: 'Hoard before Cole leaves: supply stops dead when his term ends, price climbs after' },
    { id: 'GLOSSY_GEMSTONE', perkKey: 'Mining Fiesta', reason: 'Glossy Gemstones drop from any ore during fiestas — supply spikes during the term, dries up after', action: 'HOLD', actionReason: 'Cheap during Cole — accumulate near end of term for post-term appreciation' },
    { id: 'GOBLIN_EGG', perkKey: 'Mining Fiesta', reason: 'Dwarven Mines progression demand rises with mining activity', action: 'BUY', actionReason: 'Demand climbs with the mining rush' },
  ],
  // ─── DIANA (key: pets) ────────────────────────────────────────────────────
  diana: [
    { id: 'GRIFFIN_FEATHER', perkKey: 'Mythological Ritual', reason: 'Every burrow hunter farms feathers — supply explodes during Diana, price historically halves, then doubles back after the term', action: 'SELL', actionReason: 'Sell now, buy back in the final day of the term for the post-Diana rebound' },
    { id: 'DAEDALUS_STICK', perkKey: 'Mythological Ritual', reason: 'Mythological creature drop — supply spikes from event activity', action: 'SELL', actionReason: 'Sell into early-term demand before supply floods' },
    { id: 'ENCHANTMENT_ULTIMATE_CHIMERA_1', perkKey: 'Mythological Ritual', reason: 'Chimera I books drop from Diana mythological creatures — supply only exists during her terms', action: 'HOLD', actionReason: 'Price dips mid-term as drops flood in — accumulate late-term, sell between Diana terms' },
    { id: 'ENCHANTED_GOLD', perkKey: 'Mythological Ritual', reason: 'Minos Hunter crafts and Griffin upgrades consume enchanted gold during the event meta', action: 'BUY', actionReason: 'Mild demand bump from event crafting' },
  ],
  // ─── MARINA (key: fishing) ────────────────────────────────────────────────
  marina: [
    { id: 'ENCHANTED_RAW_FISH', perkKey: 'Fishing Festival', reason: 'Festival fishing floods the market with raw fish', action: 'SELL', actionReason: 'Sell before festival supply peaks' },
    { id: 'ENCHANTED_RAW_SALMON', perkKey: 'Fishing Festival', reason: 'Salmon supply rises with festival activity', action: 'SELL', actionReason: 'Clear salmon ahead of the supply wave' },
    { id: 'ENCHANTED_CLAY', perkKey: 'Luck of the Sea 2.0', reason: 'Clay is a common catch — higher catch rates flood supply', action: 'SELL', actionReason: 'Clay price sags during Marina terms' },
    { id: 'ENCHANTED_INK_SACK', perkKey: 'Double Trouble', reason: 'Squid catch volume rises with double-hook chance', action: 'SELL', actionReason: 'Ink supply rises — sell early' },
    { id: 'SPIKED_BAIT', perkKey: 'Fishing Festival', reason: '+15% sea creature chance bait stacks with Marina’s perk — best-in-slot for every festival fisher', action: 'BUY', actionReason: 'Buy before her term: demand surges immediately' },
    { id: 'FISH_BAIT', perkKey: 'Fishing Festival', reason: 'Bulk bait consumption rises across the board during festivals', action: 'BUY', actionReason: 'Cheap, high-volume demand play' },
  ],
  // ─── DIAZ (key: economist) ────────────────────────────────────────────────
  diaz: [
    { id: 'BOOSTER_COOKIE', perkKey: 'Shopping Spree', reason: 'Higher daily NPC buy limits push more players through gold-circulation loops — cookie demand (for bits) typically firms up', action: 'HOLD', actionReason: 'Watch cookie price — Diaz terms often lift it as coin velocity rises' },
    { id: 'ENCHANTED_GOLD', perkKey: 'Stock Exchange', reason: 'Stonks Auction and Trade Center activity centres on gold-adjacent items', action: 'HOLD', actionReason: 'Volatile around Stonks Auction rounds — trade the swings' },
    { id: 'ENCHANTED_EMERALD', perkKey: 'Long Term Investment', reason: 'Bank-interest perk increases idle coin stockpiles — emerald demand from minion upgrades follows spending waves', action: 'HOLD', actionReason: 'Secondary effect — watch for demand bumps' },
  ],
  // ─── FINNEGAN (key: farming) ──────────────────────────────────────────────
  finnegan: [
    { id: 'ENCHANTMENT_CULTIVATING_1', perkKey: 'Blooming Business', reason: 'Farming XP rush drives Cultivating book demand', action: 'BUY', actionReason: 'Buy before Finnegan — farming grinders want it' },
    { id: 'ENCHANTMENT_TURBO_CANE_1', perkKey: 'Blooming Business', reason: 'Turbo-crop books see demand as farmers optimise during the term', action: 'BUY', actionReason: 'Cheap books, real demand bump' },
    { id: 'ENCHANTED_WHEAT', perkKey: 'Ephemeral Trading', reason: 'Daily ±25% NPC price swings make crop bazaar prices whipsaw', action: 'HOLD', actionReason: 'Check today’s boosted/penalised crop before trading' },
    { id: 'ENCHANTED_CARROT', perkKey: 'Ephemeral Trading', reason: 'Same daily NPC rotation — unpredictable day to day', action: 'HOLD', actionReason: 'Volatile — trade only with the daily signal' },
    { id: 'ENCHANTED_POTATO', perkKey: 'Ephemeral Trading', reason: 'In the daily crop rotation', action: 'HOLD', actionReason: 'Wait for the daily crop announcement' },
    { id: 'ENCHANTED_SUGAR_CANE', perkKey: 'Ephemeral Trading', reason: 'In the daily crop rotation', action: 'HOLD', actionReason: 'High day-to-day variance' },
    { id: 'ENCHANTED_NETHER_STALK', perkKey: 'Ephemeral Trading', reason: 'Nether wart is in the rotation and feeds potion demand', action: 'HOLD', actionReason: 'Watch the rotation; alchemy demand cushions dips' },
  ],
  // ─── FOXY (key: events) ───────────────────────────────────────────────────
  foxy: [
    { id: 'GRAND_EXP_BOTTLE', perkKey: 'Sweet Tooth + Extra Event', reason: 'Foxy terms concentrate event activity; XP bottle demand rises through every event window', action: 'BUY', actionReason: 'Buy before the term, sell into event-day demand' },
    { id: 'TITANIC_EXP_BOTTLE', perkKey: 'Extra Event', reason: 'Best XP-per-coin bottle — progression players burn these during events', action: 'BUY', actionReason: 'Reliable demand bump on event days' },
    { id: 'CANDY_CORN', perkKey: 'Extra Event (Spooky)', reason: 'An extra Spooky Festival floods candy supply', action: 'SELL', actionReason: 'Sell before the extra event lands' },
    { id: 'GREEN_CANDY', perkKey: 'Extra Event (Spooky)', reason: 'More Spooky events = more candy drops', action: 'SELL', actionReason: 'Clear before supply spikes' },
    { id: 'PURPLE_CANDY', perkKey: 'Extra Event (Spooky)', reason: 'Purple candy supply rises with each extra festival', action: 'SELL', actionReason: 'Offload ahead of the event' },
  ],
  // ─── AATROX (key: slayer) ─────────────────────────────────────────────────
  aatrox: [
    { id: 'WOLF_TOOTH', perkKey: 'Slashed Pricing', reason: 'Half-price slayer quests → far more Wolf Slayer runs → tooth supply floods', action: 'SELL', actionReason: 'Sell before Aatrox starts — supply rises fast' },
    { id: 'TARANTULA_WEB', perkKey: 'Slashed Pricing', reason: 'More Spider Slayer runs → web supply rises', action: 'SELL', actionReason: 'Clear webs early in the term' },
    { id: 'REVENANT_FLESH', perkKey: 'Slashed Pricing', reason: 'Zombie Slayer volume doubles when quests are half price', action: 'SELL', actionReason: 'Flesh floods the bazaar during Aatrox' },
    { id: 'NULL_SPHERE', perkKey: 'Slayer XP Buff', reason: 'More Enderman Slayer activity floods Null Sphere supply', action: 'SELL', actionReason: 'Sell spheres early — supply rises all term' },
    { id: 'SUMMONING_EYE', perkKey: 'Slayer XP Buff', reason: 'More T4 Enderman runs → more eye supply', action: 'SELL', actionReason: 'Eye prices sag mid-term — exit early' },
    { id: 'ENCHANTED_GOLD_BLOCK', perkKey: 'Slashed Pricing', reason: 'Beacon/power-orb crafting demand rises with slayer grinding', action: 'BUY', actionReason: 'Secondary demand play' },
  ],
  // ─── SCORPIUS (special) ───────────────────────────────────────────────────
  scorpius: [
    { id: 'DARK_ORB', perkKey: 'Darker Auctions', reason: 'Extra Dark Auction rounds with exclusive items — every attendee needs Dark Orbs', action: 'BUY', actionReason: 'Buy orbs before the term — demand surges for every auction night' },
  ],
  // ─── DERPY (special) ──────────────────────────────────────────────────────
  derpy: [
    { id: 'GRAND_EXP_BOTTLE', perkKey: 'MOAR SKILLZ!!!', reason: '+50% skill XP makes every XP bottle 50% more efficient — demand spikes from progression players', action: 'BUY', actionReason: 'Buy before Derpy, sell into mid-term demand' },
    { id: 'TITANIC_EXP_BOTTLE', perkKey: 'MOAR SKILLZ!!!', reason: 'Best XP bottle — the go-to during Derpy', action: 'BUY', actionReason: 'Highest demand item during Derpy' },
    { id: 'COLOSSAL_EXP_BOTTLE', perkKey: 'MOAR SKILLZ!!!', reason: 'Mid-game bulk XP — steady demand all term', action: 'BUY', actionReason: 'Reliable flip with strong volume' },
    { id: 'HYPER_CATALYST', perkKey: 'TURBO MINIONS!!!', reason: 'Output-multiplying fuel (4×) stacks with doubled minion output → effectively 8×', action: 'BUY', actionReason: 'Best-in-slot fuel during Derpy — demand spikes day 1' },
    { id: 'CATALYST', perkKey: 'TURBO MINIONS!!!', reason: 'Output-multiplying fuel (3×) that also stacks with Turbo Minions', action: 'BUY', actionReason: 'Accessible fuel play — buy early' },
    { id: 'ENCHANTED_ROTTEN_FLESH', perkKey: 'TURBO MINIONS!!!', reason: 'Doubled zombie minion output floods flesh supply', action: 'SELL', actionReason: 'Price crashes within hours of Derpy starting' },
    { id: 'ENCHANTED_BONE', perkKey: 'TURBO MINIONS!!!', reason: 'Doubled skeleton minion output floods bones', action: 'SELL', actionReason: 'Sell before the floor collapses' },
    { id: 'ENCHANTED_STRING', perkKey: 'TURBO MINIONS!!!', reason: 'Doubled spider minion output crushes string prices', action: 'SELL', actionReason: 'Clear string positions now' },
    { id: 'ENCHANTED_IRON_INGOT', perkKey: 'TURBO MINIONS!!!', reason: 'Iron golem minion output doubles — supply flood', action: 'SELL', actionReason: 'Iron crashes during Derpy' },
    { id: 'ENCHANTED_DIAMOND', perkKey: 'QUAD TAXES!!!', reason: '4× bazaar tax (~5%) murders margins on expensive items', action: 'WARN', actionReason: 'Avoid big bazaar trades during Derpy — trade before or after the term' },
  ],
  // ─── JERRY (special) ──────────────────────────────────────────────────────
  jerry: [
    { id: 'HYPER_CATALYST', perkKey: 'Perkpocalypse (Turbo Minions)', reason: 'Jerry cycles every mayor’s perks — when Derpy’s Turbo Minions rolls, stacking fuels go wild', action: 'BUY', actionReason: 'Same logic as Derpy, in bursts all term' },
    { id: 'GRAND_EXP_BOTTLE', perkKey: 'Perkpocalypse (XP perks)', reason: 'XP-boosting perk windows make bottles spike repeatedly', action: 'BUY', actionReason: 'Buy early, sell into each perk window' },
    { id: 'DUNGEON_CHEST_KEY', perkKey: 'Perkpocalypse (EZPZ)', reason: 'Paul-perk windows reproduce the chest-key demand spike', action: 'BUY', actionReason: 'Demand bursts whenever dungeon perks roll' },
    { id: 'ENCHANTED_ROTTEN_FLESH', perkKey: 'Perkpocalypse (Turbo Minions)', reason: 'Minion-output windows flood common drops', action: 'SELL', actionReason: 'Sell minion commodities before the term' },
  ],
}

// Hypixel internal key → lowercase name (fallback when name lookup fails)
const KEY_TO_NAME: Record<string, string> = {
  dungeons: 'paul', mining: 'cole', pets: 'diana', fishing: 'marina',
  economist: 'diaz', farming: 'finnegan', events: 'foxy', slayer: 'aatrox',
  shady: 'scorpius', derpy: 'derpy', jerry: 'jerry', scorpius: 'scorpius',
}

function mayorLookup(name: string, key: string): ItemDef[] {
  return MAYOR_ITEMS[name.toLowerCase()] ?? MAYOR_ITEMS[KEY_TO_NAME[key] ?? ''] ?? []
}

function itemDisplayName(id: string): string {
  if (id.startsWith('ENCHANTMENT_')) {
    const m = id.match(/^ENCHANTMENT_(.+)_(\d+)$/)
    if (m) {
      const roman = ['', 'I', 'II', 'III', 'IV', 'V'][parseInt(m[2], 10)] ?? m[2]
      return m[1].replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) + ' ' + roman
    }
  }
  return id.replace(/_/g, ' ')
    .split(' ')
    .map(w => ['EXP', 'NPC', 'XP'].includes(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ')
    .replace(/^Enchanted /, '✦ ')
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

type QuickStatus = { buyPrice: number; sellPrice: number; buyMovingWeek: number; sellMovingWeek: number }
type BzProduct = {
  quick_status: QuickStatus
  sell_summary?: Array<{ pricePerUnit: number }>
  buy_summary?: Array<{ pricePerUnit: number }>
}

function buildItems(name: string, key: string, products: Record<string, BzProduct>): MayorFlipItem[] {
  const items: MayorFlipItem[] = []
  for (const def of mayorLookup(name, key)) {
    const p = products[def.id]
    if (!p) continue
    const q = p.quick_status
    // Real top-of-book: buy_summary[0] = lowest ask, sell_summary[0] = highest bid
    const ask = p.buy_summary?.[0]?.pricePerUnit ?? q.buyPrice
    const bid = p.sell_summary?.[0]?.pricePerUnit ?? q.sellPrice
    const price = Math.round(ask * 100) / 100
    if (price <= 0) continue
    const sellPrice = Math.round((ask - 0.1) * 100) / 100

    // Spread sanity: ask far above bid on a thin book = unreliable pricing
    const spread = bid > 0 ? ask / bid : 99
    const isPotentiallyManipulated = spread > 8 && q.sellMovingWeek < 5000

    items.push({
      id: def.id,
      name: itemDisplayName(def.id),
      iconUrl: `https://sky.shiiyu.moe/item/${def.id}`,
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
  const order: Record<string, number> = { BUY: 0, SELL: 1, HOLD: 2, WARN: 3 }
  items.sort((a, b) => (order[a.action] ?? 9) - (order[b.action] ?? 9))
  return items
}

async function compute(): Promise<MayorData> {
  const [elecRes, bazRes] = await Promise.all([
    fetch('https://api.hypixel.net/v2/resources/skyblock/election', { signal: AbortSignal.timeout(10000) }),
    fetch('https://api.hypixel.net/v2/skyblock/bazaar', { signal: AbortSignal.timeout(15000) }),
  ])
  if (!elecRes.ok) throw new Error(`Election fetch failed: ${elecRes.status}`)
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')

  const elec = await elecRes.json()
  const baz = await bazRes.json()

  const mayor = elec.mayor
  const current = elec.current   // active voting cycle (null between elections)

  const mayorKey: string = mayor.key
  const mayorName: string = mayor.name
  const lowerName = mayorName.toLowerCase()
  const isSpecial = ['derpy', 'jerry', 'scorpius'].includes(lowerName)

  const minister = mayor.minister
    ? { name: mayor.minister.name as string, perk: mayor.minister.perk as MayorPerk }
    : null

  // ── Election countdown ──
  // Election year N closes (new mayor takes office) on day 88 of year N+1.
  const nowMs = Date.now()
  const electionYear: number = current?.year ?? (mayor.election?.year ?? 0) + 1
  let msUntilElection = 0
  if (electionYear > 0) {
    const closeMs = SB_EPOCH_MS + electionYear * SB_YEAR_MS + ELECTION_CLOSE_DAY * SB_DAY_MS
    msUntilElection = Math.max(0, closeMs - nowMs)
  }
  const currentYear = Math.floor((nowMs - SB_EPOCH_MS) / SB_YEAR_MS) + 1

  const products = baz.products as Record<string, BzProduct>

  const items = buildItems(mayorName, mayorKey, products)

  const votingCandidates: Candidate[] = current?.candidates ?? []
  const totalVotes = votingCandidates.reduce((sum: number, c: Candidate) => sum + (c.votes ?? 0), 0)

  const nextMayorPreps: NextMayorPrep[] = votingCandidates.map(c => ({
    candidateName: c.name,
    candidateKey: c.key,
    voteShare: totalVotes > 0 ? Math.round((c.votes / totalVotes) * 1000) / 10 : 0,
    isLeading: false,
    items: buildItems(c.name, c.key, products),
    aiRecommendation: null,
  }))
  nextMayorPreps.sort((a, b) => b.voteShare - a.voteShare)
  if (nextMayorPreps.length > 0) nextMayorPreps[0].isLeading = true

  // ── Gemini market read ──
  let currentAiSummary: string | null = null
  const buyItems = items.filter(i => i.action === 'BUY').slice(0, 4)
  const sellItems = items.filter(i => i.action === 'SELL').slice(0, 3)
  const leader = nextMayorPreps[0]

  const currentPrompt = `You are a Hypixel SkyBlock economy expert. The active mayor is ${mayorName}${minister ? ` with minister ${minister.name}` : ''}.

Top BUY signals (live prices):
${buyItems.map(i => `- ${i.name} (${i.perkName}): ${i.price.toLocaleString()} coins`).join('\n') || '- none'}

Top SELL signals:
${sellItems.map(i => `- ${i.name} (${i.perkName}): ${i.price.toLocaleString()} coins`).join('\n') || '- none'}

${leader ? `The vote leader for the next election is ${leader.candidateName} at ${leader.voteShare}% of votes.` : ''}

Give 3 short sharp bullet points (max 15 words each) of the best market moves RIGHT NOW under this mayor, then 1 bullet on what to buy NOW for the likely next mayor. Plain text bullets only.`

  currentAiSummary = await askGemini(currentPrompt)

  if (leader) {
    const leaderBuys = leader.items.filter(i => i.action === 'BUY').slice(0, 4)
    if (leaderBuys.length > 0) {
      leader.aiRecommendation = await askGemini(
        `You are a Hypixel SkyBlock economy expert. ${leader.candidateName} leads the next election with ${leader.voteShare}% of votes.

If they win, these bazaar items spike in demand:
${leaderBuys.map(i => `- ${i.name} (${i.perkName}): currently ${i.price.toLocaleString()} coins`).join('\n')}

ONE paragraph (max 40 words): should players buy these now, and what is the main risk? Plain text.`
      )
    }
  }

  return {
    mayorName, mayorKey,
    perks: mayor.perks ?? [],
    minister,
    isSpecial,
    currentYear,
    nextElectionYear: electionYear,
    msUntilElection,
    votingCandidates, totalVotes,
    items,
    nextMayorPreps,
    currentAiSummary,
  }
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
