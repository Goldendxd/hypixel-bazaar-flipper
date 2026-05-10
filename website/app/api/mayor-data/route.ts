import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

const GEMINI_KEY = 'AIzaSyDtzLvCVeHYFLsp0DR3ftPyCwA7b_Evr50'

// SkyBlock year = 5 real days. Elections happen at start of each new year.
const SB_YEAR_MS  = 5 * 24 * 60 * 60 * 1000
const SB_EPOCH_MS = 1560275700000  // June 11 2019 17:15 UTC (calibrated)

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
  price: number
  sellPrice: number
  weeklyBuyVol: number
  weeklySellVol: number
  isPotentiallyManipulated: boolean
}

export interface NextMayorPrep {
  candidateName: string
  candidateKey: string
  voteShare: number        // % of total votes
  isLeading: boolean
  items: MayorFlipItem[]
  aiRecommendation: string | null
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
  totalVotes: number
  items: MayorFlipItem[]
  nextMayorPreps: NextMayorPrep[]
  currentAiSummary: string | null
}

// Mayor → affected bazaar items
// All entries verified against Hypixel SkyBlock wiki game mechanics.
// action BUY  = stock up NOW (before/at start of term), sell into demand peak
// action SELL = clear holdings NOW (supply flood incoming during term)
// action HOLD = price volatile, wait for signal
// action WARN = exercise caution
const MAYOR_ITEMS: Record<string, Array<{
  id: string
  perkKey: string
  reason: string
  action: 'BUY' | 'SELL' | 'HOLD' | 'WARN'
  actionReason: string
}>> = {
  // ─── DERPY ───────────────────────────────────────────────────────────────
  // MOAR SKILLZ!!!: +50% skill XP across ALL skills (farming, mining, combat, fishing, etc.)
  // XP bottles grant skill XP — they become 50% more efficient, so demand genuinely spikes.
  // TURBO MINIONS!!!: Doubles minion OUTPUT (drops), NOT speed. Output-multiplying fuels STACK
  //   with this: HYPER_CATALYST (normally 4× output → 8× during Derpy), TASTY_CHEESE (2× → 4×)
  //   Speed-based fuels (ENCHANTED_BREAD, HAMSTER_WHEEL) do NOT stack — do not recommend.
  // DOUBLE MOBS HP!!!: All mobs have 2× health — combat is slower, slayer supply may dip.
  // QUAD TAXES: 4× bazaar tax (~5% instead of 1.25%). High-value items hit hardest.
  derp: [
    // MOAR SKILLZ!!! — skill XP doubled → all XP bottles give 50% more skill XP
    { id: 'GRAND_EXP_BOTTLE',      perkKey: 'MOAR SKILLZ!!!', reason: 'Gives large amounts of skill XP. With +50% XP perk, each bottle is 50% more efficient → strong demand from players pushing skill levels', action: 'BUY', actionReason: 'Buy before Derpy starts; sell into demand peak mid-term as players grind skills' },
    { id: 'TITANIC_EXP_BOTTLE',    perkKey: 'MOAR SKILLZ!!!', reason: 'Best XP-per-coin bottle. At Enchanting 60 gives up to 850k XP — 50% efficiency boost makes it the go-to during Derpy', action: 'BUY', actionReason: 'Highest demand item during Derpy from progression players — buy early, sell at peak' },
    { id: 'COLOSSAL_EXP_BOTTLE',   perkKey: 'MOAR SKILLZ!!!', reason: 'Second-tier bulk skill XP bottle. Popular with mid-game players rushing skills during Derpy', action: 'BUY', actionReason: 'Steady demand rise throughout Derpy — reliable flip with good volume' },
    // TURBO MINIONS!!! — doubles minion OUTPUT (drops). Stacking fuels amplify this:
    { id: 'HYPER_CATALYST',        perkKey: 'TURBO MINIONS!!!', reason: 'Output-multiplying fuel (normally 4× drops). Stacks with Turbo Minions: becomes 8× drop output — massively OP. Players rush to buy these', action: 'BUY', actionReason: 'Best-in-slot fuel during Derpy. Buy before term starts; demand spikes hard on day 1' },
    { id: 'TASTY_CHEESE',          perkKey: 'TURBO MINIONS!!!', reason: 'Output-multiplying fuel (normally 2× drops). Stacks with Turbo Minions: becomes 4× output. Budget option that still stacks', action: 'BUY', actionReason: 'Accessible output fuel — buy early, sell into mid-Derpy demand' },
    // TURBO MINIONS supply crashes — doubled minion drops flood the market
    { id: 'ENCHANTED_ROTTEN_FLESH',perkKey: 'TURBO MINIONS!!!', reason: 'Zombie minion output doubles → massive Rotten Flesh oversupply crashes bazaar price', action: 'SELL', actionReason: 'Price crashes within hours of Derpy starting — sell immediately' },
    { id: 'ENCHANTED_BONE',        perkKey: 'TURBO MINIONS!!!', reason: 'Skeleton minion output doubles → bone market flooded', action: 'SELL', actionReason: 'Sell skeleton minion stock before price floor collapses' },
    { id: 'ENCHANTED_STRING',      perkKey: 'TURBO MINIONS!!!', reason: 'Spider minion output doubles → string supply spike crushes prices', action: 'SELL', actionReason: 'Clear string position; supply flood imminent when Derpy activates' },
    { id: 'ENCHANTED_GUNPOWDER',   perkKey: 'TURBO MINIONS!!!', reason: 'Creeper minion output doubles → gunpowder oversupply', action: 'SELL', actionReason: 'Sell before price drops from doubled creeper minion drops' },
    { id: 'ENCHANTED_IRON_INGOT',  perkKey: 'TURBO MINIONS!!!', reason: 'Iron golem minion output doubles → iron ingot supply flood on bazaar', action: 'SELL', actionReason: 'Iron prices crash during Derpy — offload now' },
    // QUAD TAXES — avoid large bazaar trades during Derpy (5% tax vs normal 1.25%)
    { id: 'ENCHANTED_DIAMOND',     perkKey: 'QUAD TAXES', reason: 'High-value item hit hard by 4× bazaar tax. Normal 1.25% sell tax becomes ~5% — margins disappear on expensive items', action: 'WARN', actionReason: 'Avoid buying/selling expensive items during Derpy — tax kills margins. Trade before or after' },
  ],
  // ─── DIANA ───────────────────────────────────────────────────────────────
  // Mythological Ritual: Players dig Griffin burrows using a Griffin Pet + Ancestral Spade.
  // Mythological creatures (Gaia Constructs, Minotaurs, etc.) drop specific items.
  // Key drops: Griffin Feather (100% drop), Daedalus Stick, Dwarf Turtle Shelmet, Chimera
  // Griffin Feather price historically: ~57k during Diana → ~120k outside Diana (2× swing).
  diana: [
    { id: 'GRIFFIN_FEATHER',       perkKey: 'Mythological Ritual', reason: 'Required for Griffin pet upgrades. During Diana, players dig Griffin burrows constantly → massive feather supply. Price historically halves during Diana term (57k vs 120k outside)', action: 'SELL', actionReason: 'Sell Griffin Feather holdings NOW before supply crashes. Buy back after Diana ends for 2× profit' },
    { id: 'DAEDALUS_STICK',        perkKey: 'Mythological Ritual', reason: 'Rare Mythological creature drop used in Daedalus Axe crafting. Supply spikes from burrow hunting during Diana', action: 'SELL', actionReason: 'Supply rises from event activity — sell into initial demand before price drops' },
    { id: 'ENCHANTED_EGG',         perkKey: 'Mythological Ritual', reason: 'Harp blocks, Chickens, and various mobs drop eggs during Diana event activity — supply rises', action: 'SELL', actionReason: 'Minor supply spike from increased outdoor activity — clear surplus' },
    // Demand spike: players need specific items to dig burrows
    { id: 'ANCESTRAL_SPADE',       perkKey: 'Mythological Ritual', reason: 'Required tool to dig Griffin burrows. Only works during Diana. Demand surges as every burrow hunter needs one', action: 'BUY', actionReason: 'Buy spades before Diana starts — every burrow hunter needs one, demand spikes immediately' },
  ],
  // ─── MARINA ──────────────────────────────────────────────────────────────
  // Fishing Festival: Special Fishing Festival events with Shark enemies and shark loot.
  // Luck of the Sea 2.0: +15% Sea Creature Chance → more rare sea creature drops.
  // Double Trouble: +0.1 Double Hook Chance per 1% Sea Creature Chance.
  // +50 Fishing Wisdom: more fishing XP per catch.
  // Real effect: massive fishing activity → fish drops flood market, sea creature loot spikes.
  marina: [
    // Supply crash: common fishing items flood from increased fishing activity
    { id: 'ENCHANTED_RAW_FISH',    perkKey: 'Fishing Festival', reason: 'Massive fishing activity during Marina floods the market with Raw Fish. Classic supply-crash scenario — price drops fast', action: 'SELL', actionReason: 'Sell before fishing activity peaks — price drops as supply floods in' },
    { id: 'ENCHANTED_RAW_SALMON',  perkKey: 'Fishing Festival', reason: 'Salmon floods from doubled fishing session activity during Marina festival events', action: 'SELL', actionReason: 'Clear salmon before oversupply from Marina fishers tanks the price' },
    { id: 'ENCHANTED_CLAY',        perkKey: 'Luck of the Sea 2.0', reason: 'Clay is a common fishing drop — +15% Sea Creature Chance also boosts general catch rates, flooding clay supply', action: 'SELL', actionReason: 'Clay price drops during Marina from increased fishing activity — sell now' },
    { id: 'ENCHANTED_INK_SACK',    perkKey: 'Double Trouble', reason: 'Squid drops rise from double hook chance and high fishing activity during Marina', action: 'SELL', actionReason: 'Ink sack supply rises — sell before price suppressed' },
    // Demand spike: players gear up for fishing events
    { id: 'SPIKED_BAIT',           perkKey: 'Fishing Festival', reason: 'Spiked Bait gives +15% Sea Creature Chance — stacks with Marina\'s +15%, making it best-in-slot. Demand spikes as every serious fisher wants it', action: 'BUY', actionReason: 'Buy before Marina starts — stacks with her perk, every fisher wants it, demand surges day 1' },
    { id: 'SQUIDS_KNEE',           perkKey: 'Luck of the Sea 2.0', reason: 'Fishing accessory demand rises as players min-max sea creature chance during Marina', action: 'BUY', actionReason: 'Demand rises from players maximising sea creature chance during Marina' },
  ],
  // ─── COLE ────────────────────────────────────────────────────────────────
  // Mining Fiesta: +75 Mining Wisdom globally (more mining XP per ore).
  // 2× ore drops (coal, cobblestone, etc.) → common ore prices CRASH.
  // Chance to find Refined Minerals (~1/750) and Glossy Gemstones (~1/1500) from any ore.
  // Molten Forge: forge recipes cost 10% fewer materials.
  cole: [
    // Supply crash: ore drops double → prices crash
    { id: 'COAL',                  perkKey: 'Mining Fiesta', reason: '2× ore drops during Cole means coal floods the market. Minion coal also doubles. Prices typically crash 30-60% at peak supply', action: 'SELL', actionReason: 'Sell all coal immediately — price crashes within the first day of Cole' },
    { id: 'ENCHANTED_COAL',        perkKey: 'Mining Fiesta', reason: 'Enchanted coal also oversupplied from 2× mining output. Crafters avoid buying what they can easily farm', action: 'SELL', actionReason: 'Clear enchanted coal before supply crash propagates up the crafting chain' },
    { id: 'MITHRIL_ORE',           perkKey: 'Mining Fiesta', reason: '2× mining drops → mithril floods Dwarven Mines. Price historically crashes during Cole', action: 'SELL', actionReason: 'Sell mithril before market is saturated — supply doubles overnight' },
    { id: 'REFINED_MITHRIL',       perkKey: 'Mining Fiesta', reason: 'Mithril supply spike → refined mithril also oversupplied as players process excess ore', action: 'SELL', actionReason: 'Clear refined mithril; supply pressure from Cole cascades up the crafting chain' },
    { id: 'TITANIUM_ORE',          perkKey: 'Mining Fiesta', reason: '2× drops includes titanium — rarer ore becomes notably less scarce during Cole', action: 'SELL', actionReason: 'Titanium supply rises enough to suppress prices — sell before crash' },
    // Demand spike: Refined Minerals and Glossy Gemstones are rare bonus drops from Cole
    { id: 'REFINED_MINERAL',       perkKey: 'Mining Fiesta', reason: 'Rare Cole-exclusive drop (~1/750 ore) — drops ONLY during Cole\'s term. Players rush to farm as many as possible before he leaves', action: 'BUY', actionReason: 'Buy and hoard before Cole ends — only drops during his term, price spikes after he leaves' },
    { id: 'GOBLIN_EGG',            perkKey: 'Mining Fiesta', reason: 'Increased mining activity in Dwarven Mines drives Goblin Egg demand for Dwarven progression', action: 'BUY', actionReason: 'Mining activity surge boosts goblin egg demand — buy before peak' },
  ],
  // ─── FINNEGAN ────────────────────────────────────────────────────────────
  // Ephemeral Trading: Each SkyBlock day, one crop gets +25% NPC sell price, previous day crop gets -25%.
  // This affects NPC sell prices, NOT directly bazaar prices. However bazaar prices DO react
  // because players sell boosted crops to NPC instead of bazaar, reducing bazaar supply of that crop,
  // while the penalized crop has no NPC demand so floods bazaar. Highly volatile day-to-day.
  // Blooming Business: +50% farming XP on all farming activities.
  finnegan: [
    // Farming XP doubled — ENCHANTMENT_CULTIVATING books spike in demand
    { id: 'ENCHANTMENT_CULTIVATING_1', perkKey: 'Blooming Business', reason: '+50% farming XP — players rush Cultivating enchant milestone farming. Cultivating book demand spikes as it requires farming collections to level', action: 'BUY', actionReason: 'Buy Cultivating books before Finnegan — farming XP rush drives demand' },
    { id: 'ENCHANTED_WHEAT',           perkKey: 'Ephemeral Trading', reason: 'NPC price swings ±25% daily. When wheat is the "penalty" crop, players dump it on bazaar → price crash. When "bonus" crop, players sell to NPC not bazaar → bazaar supply tightens', action: 'HOLD', actionReason: 'Highly volatile. Check today\'s Finnegan crop before trading wheat' },
    { id: 'ENCHANTED_CARROT',          perkKey: 'Ephemeral Trading', reason: 'Random daily NPC price swing affects bazaar indirectly. Bonus crop day = less supply to bazaar (sold to NPC). Penalty day = bazaar gets dumped', action: 'HOLD', actionReason: 'Daily crop changes make carrot unpredictable — hold until you know today\'s crop' },
    { id: 'ENCHANTED_POTATO',          perkKey: 'Ephemeral Trading', reason: 'Same daily NPC swing mechanic — potato pricing volatile during Finnegan', action: 'HOLD', actionReason: 'Monitor which crop is buffed/nerfed each day before committing' },
    { id: 'ENCHANTED_PUMPKIN',         perkKey: 'Ephemeral Trading', reason: 'Pumpkin included in daily crop rotation. Also used in Spooky Festival so has additional price drivers', action: 'HOLD', actionReason: 'Volatile — watch daily crop announcement' },
    { id: 'ENCHANTED_SUGAR_CANE',      perkKey: 'Ephemeral Trading', reason: 'Sugar cane in daily rotation — when penalized, players dump on bazaar → price drops', action: 'HOLD', actionReason: 'High variance day-to-day — hold until daily crop is confirmed' },
    { id: 'ENCHANTED_NETHER_WART',     perkKey: 'Ephemeral Trading', reason: 'Nether wart in daily crop NPC price rotation', action: 'HOLD', actionReason: 'Monitor daily crop before taking position' },
  ],
  // ─── PAUL ────────────────────────────────────────────────────────────────
  // EZPZ: +10 dungeon score for all players (free extra dungeon grade).
  //   With EZPZ, most players can now achieve S or S+ easier → more chest opens → key demand UP.
  //   More dungeon runs → more essence drops → essence supply UP.
  // Marauder: Dungeon reward chests cost 20% LESS coins to open. NOT slayer-related.
  //   Cheaper chests = players open more chests = more chest key demand.
  // Benediction: Blessings are 25% stronger. Affects dungeon Blessings (not God Potions).
  paul: [
    { id: 'DUNGEON_CHEST_KEY',     perkKey: 'EZPZ + Marauder', reason: 'EZPZ gives +10 dungeon score (easier S/S+ grades). Marauder makes chests 20% cheaper to open. Both perks together = massive chest key demand spike as dungeoneers open far more chests', action: 'BUY', actionReason: 'Biggest Paul trade. Buy chest keys before Paul starts — demand spikes hard day 1. Sell mid-term' },
    { id: 'REVIVE_STONE',          perkKey: 'EZPZ', reason: 'More dungeon runs from easier grading → players use more Revive Stones (die less punishing with EZPZ extra deaths too)', action: 'BUY', actionReason: 'Consumable demand rises with dungeon activity surge during Paul' },
    { id: 'SPIRIT_LEAP',           perkKey: 'EZPZ', reason: 'More dungeon activity → Spirit Leap demand spikes for mid-floor teleportation in party runs', action: 'BUY', actionReason: 'Dungeon consumable — demand rises proportionally with run volume during Paul' },
    // Supply crash: more dungeon runs = more essence drops
    { id: 'WITHER_ESSENCE',        perkKey: 'EZPZ', reason: 'More dungeon runs during Paul → more Wither Essence drops from Catacombs. Classic supply-demand flip', action: 'SELL', actionReason: 'Essence supply rises from increased dungeon activity — sell before price drops' },
    { id: 'UNDEAD_ESSENCE',        perkKey: 'EZPZ', reason: 'More dungeon activity → Undead Essence drops increase from Catacombs runs', action: 'SELL', actionReason: 'Sell undead essence; supply rises from Paul-driven dungeon surge' },
    { id: 'SPIDER_ESSENCE',        perkKey: 'EZPZ', reason: 'More dungeon runs → Spider Essence supply increases', action: 'SELL', actionReason: 'Essence supply rises — clear holdings before price pressure' },
  ],
  // ─── FOXY ────────────────────────────────────────────────────────────────
  // Extra Event: One extra Traveling Zoo, Spooky Festival, or similar event during term.
  //   Extra Spooky Festival = more Spooky event candy + pumpkin farming activity.
  // Happy Hours: 2h per day where ALL players get double skill XP.
  //   XP bottles become 2× efficient during Happy Hours — demand spikes every day.
  foxy: [
    { id: 'GRAND_EXP_BOTTLE',      perkKey: 'Happy Hours', reason: 'Happy Hours (2h daily double skill XP) makes skill XP sources 2× efficient. Players buy XP bottles to burn during the 2h window every day of Foxy\'s term', action: 'BUY', actionReason: 'Daily XP bottle demand during Happy Hours — buy before Foxy starts, sell daily into the window' },
    { id: 'TITANIC_EXP_BOTTLE',    perkKey: 'Happy Hours', reason: 'Best XP bottle — players save Titanics for Happy Hours for maximum skill XP efficiency. Demand rises throughout term', action: 'BUY', actionReason: 'Buy before term; sell into daily Happy Hours demand windows' },
    { id: 'COLOSSAL_EXP_BOTTLE',   perkKey: 'Happy Hours', reason: 'Budget XP bottle option — strong demand from mid-game players during Happy Hours', action: 'BUY', actionReason: 'Reliable flip — consistent demand every day of Foxy' },
    // Extra Spooky Festival event
    { id: 'CANDY_CORN',            perkKey: 'Extra Event (Spooky)', reason: 'Extra Spooky Festival → more Candy Corn drops from Spooky events. Supply spikes after the event', action: 'SELL', actionReason: 'Sell Candy Corn before/during extra Spooky event — supply floods in after' },
    { id: 'GREEN_CANDY',           perkKey: 'Extra Event (Spooky)', reason: 'Extra Spooky Festival event = more Green Candy supply from event mobs', action: 'SELL', actionReason: 'Sell before extra event supply hits the market' },
    { id: 'PURPLE_CANDY',          perkKey: 'Extra Event (Spooky)', reason: 'Extra Spooky Festival = more Purple Candy. Rarer but supply still rises from extra event', action: 'SELL', actionReason: 'Extra event supply spike — offload purple candy now' },
  ],
  // ─── AATROX ──────────────────────────────────────────────────────────────
  // Slayer XP Buff: +25% slayer XP. Players do more slayer quests → more slayer drops.
  // Slayer Quest Buff: Slayer quests give +1 tier (e.g., Tier 3 quest counts as Tier 4 reward).
  //   More players reach higher tiers → more rare slayer drops.
  aatrox: [
    // Supply crashes: more slayer runs = more drops from bosses
    { id: 'WOLF_TOOTH',            perkKey: 'Slayer XP Buff', reason: '+25% slayer XP → players do more Wolf Slayer runs → more Wolf Tooth drops flood the bazaar', action: 'SELL', actionReason: 'Sell wolf teeth before Aatrox starts — supply rises fast from increased slayer activity' },
    { id: 'TARANTULA_WEB',         perkKey: 'Slayer XP Buff', reason: '+25% slayer XP → more Spider Slayer runs → Tarantula Web supply rises significantly', action: 'SELL', actionReason: 'Spider slayer drops increase during Aatrox — sell tarantula webs now' },
    { id: 'VOIDLING_CATALYST',     perkKey: 'Slayer XP Buff', reason: '+25% slayer XP → more Enderman Slayer activity → Voidling Catalyst supply rises', action: 'SELL', actionReason: 'Enderman slayer more active; catalyst supply rises — sell now' },
    { id: 'REVENANT_FLESH',        perkKey: 'Slayer XP Buff', reason: '+25% slayer XP → more Zombie Slayer runs → Revenant Flesh floods bazaar', action: 'SELL', actionReason: 'Zombie slayer supply spike — clear revenant flesh holdings' },
    { id: 'SUMMONING_EYE',         perkKey: 'Slayer Quest Buff (+1 tier)', reason: 'Quest tier +1 means more players reach Tier 4 (the eye-dropping tier) of Enderman Slayer. Eye supply rises from players who couldn\'t normally farm T4', action: 'SELL', actionReason: 'Eye supply rises as more players can now farm T4 Enderman — sell before market floods' },
    // Demand spike: players gear up for slayer runs
    { id: 'MANA_FLUX_POWER_ORB',   perkKey: 'Slayer XP Buff', reason: 'Slayer-focused players buy consumables and support items for longer grinding sessions during Aatrox', action: 'BUY', actionReason: 'Support item demand rises proportionally with slayer activity surge during Aatrox' },
  ],
  // ─── SCORPIUS ────────────────────────────────────────────────────────────
  // Bribe: Players who voted for Scorpius receive 50k–1M coins directly.
  //   This is a pure coin handout — NOT related to gold trading. No gold market effect.
  // Darker Auctions: Dark Auction has 7 rounds instead of 4, includes corrupted items.
  //   Dark Orbs used to participate → demand spikes.
  scorpius: [
    { id: 'DARK_ORBS',             perkKey: 'Darker Auctions', reason: 'Darker Auctions adds 3 extra Dark Auction rounds and exclusive corrupted items. Players need Dark Orbs to participate → strong demand spike', action: 'BUY', actionReason: 'Buy Dark Orbs before Scorpius term — every Dark Auction attendee needs them, demand surges' },
    // Bribe = direct coin welfare. No item market effect. Do not add fake items here.
  ],
  // ─── BARRY ───────────────────────────────────────────────────────────────
  // Barry's Cans: Extra Barry Cans drop from fishing — used in Barry's questline.
  // Prosecution: Players can place bounties on other players.
  barry: [
    { id: 'BARRY_SKIN',            perkKey: "Barry's Cans", reason: "Barry-exclusive collectible only obtainable during his term from Barry Cans — supply rises only while he's active", action: 'SELL', actionReason: 'Barry Skins are only available during his term — sell into supply spike during term' },
  ],
  // ─── JERRY ───────────────────────────────────────────────────────────────
  // Perkpocalypse: Activates ALL other mayors' perks simultaneously for a limited time.
  // This is a chaotic everything-happens-at-once scenario.
  // Key items: Turbo Minions fuels (stacking output fuels), XP bottles (multiple XP perks active),
  //   dungeon keys (EZPZ active), slayer drops (multiple slayer perks active)
  jerry: [
    { id: 'HYPER_CATALYST',        perkKey: 'Perkpocalypse (TURBO MINIONS)', reason: 'Jerry activates Turbo Minions from Derpy — output-multiplying fuels stack. Hyper Catalyst (4× normal → 8× with Turbo Minions) is the biggest winner', action: 'BUY', actionReason: 'Best fuel during Jerry perkpocalypse — same logic as Derpy but all perks hit at once' },
    { id: 'GRAND_EXP_BOTTLE',      perkKey: 'Perkpocalypse (MOAR SKILLZ + Happy Hours)', reason: 'Jerry activates both MOAR SKILLZ (Derpy +50% skill XP) AND Happy Hours (Foxy double XP windows) simultaneously — XP bottles are massively amplified', action: 'BUY', actionReason: 'Multiple XP perks active at once — huge XP bottle demand spike during Jerry' },
    { id: 'DUNGEON_CHEST_KEY',     perkKey: 'Perkpocalypse (EZPZ + Marauder)', reason: 'Jerry activates Paul\'s EZPZ (+10 dungeon score) and Marauder (20% cheaper chests) — chest key demand spikes just like during Paul', action: 'BUY', actionReason: 'EZPZ + Marauder stack during Jerry — same chest key demand spike as Paul' },
    // Supply crashes from multiple slayer perks at once
    { id: 'WOLF_TOOTH',            perkKey: 'Perkpocalypse (Aatrox slayer perks)', reason: 'Aatrox slayer buffs activate during Jerry — all slayer drops flood the market from increased activity', action: 'SELL', actionReason: 'Multiple slayer perks active — wolf tooth and slayer drops spike in supply' },
    { id: 'ENCHANTED_ROTTEN_FLESH',perkKey: 'Perkpocalypse (TURBO MINIONS)', reason: 'Turbo Minions active during Jerry → zombie minion output doubles → rotten flesh floods market', action: 'SELL', actionReason: 'Minion output doubles — zombie drops crash in price' },
  ],
}

function itemDisplayName(id: string): string {
  return id.replace(/_/g, ' ')
    .split(' ')
    .map((w: string) => {
      if (['EXP', 'NPC', 'AH', 'XP'].includes(w)) return w
      return w.charAt(0) + w.slice(1).toLowerCase()
    })
    .join(' ')
    .replace(/^Enchanted /, '✦ ')
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

function buildItems(
  mayorKey: string,
  products: Record<string, { quick_status: { buyPrice: number; sellPrice: number; buyMovingWeek: number; sellMovingWeek: number } }>,
): MayorFlipItem[] {
  const affectedItems = MAYOR_ITEMS[mayorKey] ?? []
  const items: MayorFlipItem[] = []

  for (const def of affectedItems) {
    const p = products[def.id]
    if (!p) continue
    const q = p.quick_status
    const price     = Math.round(q.buyPrice * 100) / 100
    const sellPrice = Math.round((q.sellPrice - 0.1) * 100) / 100
    if (price <= 0) continue

    const spread = price / Math.max(q.sellPrice, 1)
    const isPotentiallyManipulated = spread > 8

    items.push({
      id:       def.id,
      name:     itemDisplayName(def.id),
      iconUrl:  `https://sky.shiiyu.moe/item/${def.id}`,
      perkName: def.perkKey,
      perkReason:   def.reason,
      action:       def.action,
      actionReason: def.actionReason,
      price,
      sellPrice,
      weeklyBuyVol:  q.buyMovingWeek,
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
  const baz  = await bazRes.json()

  const mayor   = elec.mayor
  const current = elec.current  // active voting cycle

  const mayorKey:  string = mayor.key
  const mayorName: string = mayor.name
  const isDerpy = mayorKey === 'derp'

  const currentYear: number = mayor.election?.year ?? current?.year ?? 0
  const nextElectionYear    = currentYear + 1

  let msUntilElection: number
  const nowMs = Date.now()
  if (currentYear > 0) {
    const currentYearStartMs = SB_EPOCH_MS + (currentYear - 1) * SB_YEAR_MS
    const nextYearStartMs    = currentYearStartMs + SB_YEAR_MS
    msUntilElection = Math.max(0, nextYearStartMs - nowMs)
  } else {
    msUntilElection = SB_YEAR_MS
  }

  const products = baz.products as Record<string, {
    quick_status: {
      buyPrice: number; sellPrice: number
      buyMovingWeek: number; sellMovingWeek: number
    }
  }>

  // Current mayor items
  const items = buildItems(mayorKey, products)

  // Voting candidates for next election
  const votingCandidates: Candidate[] = current?.candidates ?? []
  const totalVotes = votingCandidates.reduce((sum: number, c: Candidate) => sum + (c.votes ?? 0), 0)

  // Build per-candidate next-mayor prep data
  const nextMayorPreps: NextMayorPrep[] = []
  for (const candidate of votingCandidates) {
    const candItems = buildItems(candidate.key, products)
    const voteShare = totalVotes > 0 ? Math.round((candidate.votes / totalVotes) * 1000) / 10 : 0
    nextMayorPreps.push({
      candidateName: candidate.name,
      candidateKey: candidate.key,
      voteShare,
      isLeading: false,
      items: candItems,
      aiRecommendation: null,
    })
  }

  // Mark leader
  if (nextMayorPreps.length > 0) {
    const maxVotes = Math.max(...nextMayorPreps.map(p => p.voteShare))
    for (const prep of nextMayorPreps) {
      if (prep.voteShare === maxVotes) { prep.isLeading = true; break }
    }
  }

  // Gemini: analyze current mayor + give advice on next mayor prep
  let currentAiSummary: string | null = null
  const buyItems  = items.filter(i => i.action === 'BUY').slice(0, 4)
  const sellItems = items.filter(i => i.action === 'SELL').slice(0, 3)

  const currentPrompt = `You are a Hypixel SkyBlock economy expert. The current active mayor is ${mayorName}.

Top BUY signals (prices right now):
${buyItems.map(i => `- ${i.name} (${i.perkName}): ${i.price.toLocaleString()} coins insta-buy, sell order ${i.sellPrice.toLocaleString()}`).join('\n')}

Top SELL signals:
${sellItems.map(i => `- ${i.name} (${i.perkName}): ${i.price.toLocaleString()} coins insta-buy`).join('\n')}

${nextMayorPreps.length > 0 ? `The current vote leader for the next election is ${nextMayorPreps.find(p => p.isLeading)?.candidateName ?? 'unknown'} with ${nextMayorPreps.find(p => p.isLeading)?.voteShare ?? 0}% of votes.` : ''}

Give 3 short sharp bullet points (max 15 words each) of the most important market moves to make RIGHT NOW given this mayor. Then 1 bullet on what to buy NOW to prepare for the likely next mayor. Use plain text, no markdown headers.`

  currentAiSummary = await askGemini(currentPrompt)

  // Gemini: per-candidate next-mayor recommendations for the leading candidate
  const leader = nextMayorPreps.find(p => p.isLeading)
  if (leader) {
    const leaderBuys = leader.items.filter(i => i.action === 'BUY').slice(0, 4)
    if (leaderBuys.length > 0) {
      const nextPrompt = `You are a Hypixel SkyBlock economy expert. The leading candidate for next mayor is ${leader.candidateName} (${leader.voteShare}% of votes).

If ${leader.candidateName} wins, these bazaar items will spike in demand:
${leaderBuys.map(i => `- ${i.name} (${i.perkName}): currently ${i.price.toLocaleString()} coins`).join('\n')}

Give ONE paragraph (max 40 words) on whether to buy these NOW to prepare for the next mayor, and what the main risk is (could a different mayor win?). Plain text only.`

      leader.aiRecommendation = await askGemini(nextPrompt)
    }
  }

  return {
    mayorName, mayorKey,
    perks: mayor.perks ?? [],
    isDerpy, currentYear, nextElectionYear, msUntilElection,
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
