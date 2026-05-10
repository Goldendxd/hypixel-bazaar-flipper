import { NextResponse } from 'next/server'

let cachedResult: object | null = null
let cacheTime = 0
const CACHE_TTL = 60_000

// SkyBlock year = 5 real days = 432000000ms. Elections happen at end of each year.
// The Hypixel API returns the current election year. Each year is exactly 5 real days.
const SB_YEAR_MS = 5 * 24 * 60 * 60 * 1000  // 5 real days in ms

// SkyBlock epoch: year 1 started at this Unix timestamp (ms)
// Year 1 = real-world 2019-06-11 00:00:00 UTC ≈ 1560300000000
// Calibrated: each SB year = 5 real days = 432000 real seconds
const SB_EPOCH_MS = 1560275700000  // June 11 2019 17:15 UTC (calibrated start)

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

// Precise mayor → affected bazaar item definitions
// Based on official Hypixel SkyBlock wiki mayor perk descriptions.
// action: BUY = stock up now (demand spike), SELL = clear stock (supply spike or margin squeeze), HOLD = monitor
const MAYOR_ITEMS: Record<string, Array<{
  id: string
  perkKey: string
  reason: string
  action: 'BUY' | 'SELL' | 'HOLD' | 'WARN'
  actionReason: string
}>> = {
  // ─── DERPY ───────────────────────────────────────────────────────────────
  // Perks: TURBO MINIONS!!! (doubles minion output), MOAR SKILLZ!!! (doubles skill XP gain),
  //        QUAD TAXES (4× bazaar/AH tax applies site-wide)
  derp: [
    // MOAR SKILLZ!!! — skill XP doubled → XP books and XP items spike in demand
    { id: 'ENCHANTED_EXPERIENCE_BOTTLE', perkKey: 'MOAR SKILLZ!!!', reason: 'Doubles skill XP gain — players rush XP items to max skills fast', action: 'BUY', actionReason: 'Buy before Derpy starts; demand spikes sharply on day 1' },
    { id: 'GRAND_EXP_BOTTLE',            perkKey: 'MOAR SKILLZ!!!', reason: 'Largest bulk XP source — doubled efficiency during Derpy', action: 'BUY', actionReason: 'High demand from progression players — buy early and sell mid-term' },
    { id: 'TITANIC_EXP_BOTTLE',          perkKey: 'MOAR SKILLZ!!!', reason: 'Titanic XP bottles have highest XP/coin — players prefer them during doubled XP', action: 'BUY', actionReason: 'Prices peak mid-Derpy; buy early, sell into peak demand' },
    { id: 'COLOSSAL_EXP_BOTTLE',         perkKey: 'MOAR SKILLZ!!!', reason: 'Large XP bottle — doubled efficiency means higher demand', action: 'BUY', actionReason: 'Steady demand rise throughout Derpy — good flip target' },
    // TURBO MINIONS!!! — minion output doubled → fuel demand rises, supply of drops also rises
    { id: 'ENCHANTED_BREAD',             perkKey: 'TURBO MINIONS!!!', reason: 'Best-in-slot minion fuel — doubles minion speed which stacks with doubled output perk', action: 'BUY', actionReason: 'Minion fuel demand rises with output doubling; sell mid-term' },
    { id: 'HAMSTER_WHEEL',               perkKey: 'TURBO MINIONS!!!', reason: 'Popular minion fuel — demand spikes from players maximizing double output', action: 'BUY', actionReason: 'High-velocity flip during Derpy; buy low, sell into spike' },
    { id: 'CATALYST',                    perkKey: 'TURBO MINIONS!!!', reason: 'Minion speed fuel — players buy more during doubled output to maximize gains', action: 'BUY', actionReason: 'Stock up early; sell mid-term for reliable profit' },
    { id: 'FOUL_FLESH',                  perkKey: 'TURBO MINIONS!!!', reason: 'Double zombie minion drops flood the market with Foul Flesh', action: 'SELL', actionReason: 'Supply spike suppresses price — clear stock before crash' },
    { id: 'ENCHANTED_ROTTEN_FLESH',      perkKey: 'TURBO MINIONS!!!', reason: 'Double zombie minion output → massive Rotten Flesh oversupply', action: 'SELL', actionReason: 'Sell now — price crashes mid-Derpy from supply flood' },
    { id: 'ENCHANTED_BONE',              perkKey: 'TURBO MINIONS!!!', reason: 'Double skeleton minion drops → bone oversupply on bazaar', action: 'SELL', actionReason: 'Sell before price drops further from supply spike' },
    { id: 'ENCHANTED_STRING',            perkKey: 'TURBO MINIONS!!!', reason: 'Spider minion output doubles → string supply spike', action: 'SELL', actionReason: 'Clear string position; supply crash imminent' },
    { id: 'ENCHANTED_GUNPOWDER',         perkKey: 'TURBO MINIONS!!!', reason: 'Creeper minion output doubles → gunpowder oversupply', action: 'SELL', actionReason: 'Sell gunpowder holdings before supply floods in' },
  ],
  // ─── DIANA ───────────────────────────────────────────────────────────────
  // Perks: Mythological Ritual (more Mythological creature spawns during griffin burrow event),
  //        Lucky!, Sharing is Caring
  diana: [
    // Mythological Ritual — players hunt griffin burrows extensively, buying lore items and selling drops
    { id: 'GRIFFIN_FEATHER',              perkKey: 'Mythological Ritual', reason: "Diana's Griffin burrow event — Griffin Feathers are used in progression and have higher drop rates", action: 'SELL', actionReason: 'Feather supply rises from event activity — sell into early spike before crash' },
    { id: 'ENCHANTED_EGG',               perkKey: 'Mythological Ritual', reason: 'Mythological creatures drop items including eggs — supply rises during event', action: 'SELL', actionReason: 'Sell surplus eggs; supply exceeds demand during Diana' },
    { id: 'MAGIC_MUSHROOM_SOUP',          perkKey: 'Lucky!', reason: 'Diana Lucky! perk increases rare drop rates — luck-boosting items spike in demand', action: 'BUY', actionReason: 'Players buy luck items to maximize rare Mythological drops' },
    { id: 'ENCHANTED_CLOVER',             perkKey: 'Lucky!', reason: 'Luck-boosting consumable — demand spikes during Diana for rare drop hunting', action: 'BUY', actionReason: 'Buy before event peak; sell into demand' },
    { id: 'REPLENISH',                    perkKey: 'Sharing is Caring', reason: 'Diana event drives player activity up — general consumables rise in demand', action: 'HOLD', actionReason: 'Monitor price trend before committing' },
  ],
  // ─── MARINA ──────────────────────────────────────────────────────────────
  // Perks: Fishing Festival (fishing XP ×2 every 3rd day), Luck of the Sea ✦ (fishing luck +2),
  //        Legends of the Sea (legendary fish drop rates increase)
  marina: [
    { id: 'GREAT_WHITE_SHARK_TOOTH',      perkKey: 'Legends of the Sea', reason: 'Rare fishing drop — higher drop rate during Marina term from Legends of the Sea perk', action: 'SELL', actionReason: 'Supply increases from boosted drop rates — sell into demand spike before crash' },
    { id: 'MIDAS_STAFF',                  perkKey: 'Legends of the Sea', reason: 'Rare fishing drop — boosted drop rate from Legends of the Sea', action: 'SELL', actionReason: 'Increased supply during Marina — offload before price dip' },
    { id: 'ENCHANTED_RAW_FISH',           perkKey: 'Fishing Festival', reason: 'Fishing XP doubled every 3rd day — massive player activity floods fish supply', action: 'SELL', actionReason: 'Supply spike from Fishing Festival days — sell before price crash' },
    { id: 'ENCHANTED_RAW_SALMON',         perkKey: 'Fishing Festival', reason: 'Salmon drops flood market during Fishing Festival days of doubled XP', action: 'SELL', actionReason: 'Clear salmon holdings; oversupply from event fishers' },
    { id: 'ENCHANTED_CLAY',               perkKey: 'Luck of the Sea ✦', reason: 'Clay is a fishing drop — higher fishing luck and activity boosts clay supply', action: 'SELL', actionReason: 'Sell now; supply rises during Marina from increased fishing activity' },
    { id: 'ENCHANTED_INK_SACK',           perkKey: 'Fishing Festival', reason: 'Squid fishing drops spike during Marina fishing events', action: 'SELL', actionReason: 'Ink supply rises from event — sell before price suppression' },
    { id: 'WHALE_BAIT',                   perkKey: 'Fishing Festival', reason: 'Bait items in high demand during Marina for maximizing fishing event profits', action: 'BUY', actionReason: 'Demand spike from players preparing for Fishing Festival days' },
    { id: 'BAIT_RING',                    perkKey: 'Fishing Festival', reason: 'Fishing consumable demand rises during Marina term', action: 'BUY', actionReason: 'Players gear up for fishing events — buy before demand peak' },
  ],
  // ─── COLE ────────────────────────────────────────────────────────────────
  // Perks: Mining Fiesta (mining events double in frequency), Prospector (mining drop rates ×2),
  //        Molten Forge (forge recipes cost 10% less), Entrench (gemstone mining boost)
  cole: [
    { id: 'MITHRIL_ORE',                  perkKey: 'Prospector', reason: 'Mining drop rates doubled — mithril mining output doubles, flooding the market', action: 'SELL', actionReason: 'Sell mithril before supply crash from doubled drop rates' },
    { id: 'REFINED_MITHRIL',              perkKey: 'Prospector', reason: 'Mithril supply spike → refined mithril supply also rises', action: 'SELL', actionReason: 'Clear refined mithril holdings; supply pressure from Cole perk' },
    { id: 'TITANIUM_ORE',                 perkKey: 'Prospector', reason: 'Titanium mining drops doubled — rare ore becomes less scarce', action: 'SELL', actionReason: 'Supply spike during Cole; sell titanium at current prices' },
    { id: 'GLACITE',                      perkKey: 'Prospector', reason: 'Mining drop rates up — Glacite supply increases during Cole term', action: 'SELL', actionReason: 'Sell glacite position before supply-driven price drop' },
    { id: 'RUBY_GEMSTONE',                perkKey: 'Entrench', reason: 'Gemstone mining boosted — ruby supply rises during Cole', action: 'SELL', actionReason: 'Gemstone oversupply incoming; sell now' },
    { id: 'SAPPHIRE_GEMSTONE',            perkKey: 'Entrench', reason: 'Gemstone mining boosted — sapphire supply spikes during Cole', action: 'SELL', actionReason: 'Clear sapphire; supply exceeds demand during Cole' },
    { id: 'AMBER_GEMSTONE',               perkKey: 'Entrench', reason: 'Gemstone mining boosted — amber supply rises', action: 'SELL', actionReason: 'Sell amber before price drops from supply spike' },
    { id: 'COBALT_GEMSTONE',              perkKey: 'Entrench', reason: 'Gemstone mining boosted — cobalt supply increases', action: 'SELL', actionReason: 'Supply incoming; offload cobalt holdings' },
    { id: 'FUEL_TANK',                    perkKey: 'Mining Fiesta', reason: 'Mining events doubled in frequency — mining fuel demand rises sharply', action: 'BUY', actionReason: 'Players stockpile mining fuel for doubled event frequency; buy now' },
    { id: 'GOBLIN_EGG',                   perkKey: 'Mining Fiesta', reason: 'Mining events increased — Goblin Egg demand rises for Dwarven Mines progression', action: 'BUY', actionReason: 'Higher mining activity boosts demand for progression items' },
    { id: 'GOLDEN_GOBLIN_EGG',            perkKey: 'Mining Fiesta', reason: 'Rare mining event drop — frequency doubled during Cole means more Golden Goblin Eggs', action: 'SELL', actionReason: 'Supply of rare drops increases; sell into initial price spike' },
  ],
  // ─── FINNEGAN ────────────────────────────────────────────────────────────
  // Perks: Ephemeral Trading (random crop prices change each SkyBlock day — each day one crop
  //        is chosen as the "market crop" and sells for 25% more to NPCs, while crops from
  //        the previous day sell for 25% less), Blooming Business (farming XP ×2),
  //        Pest Repellent (pests appear less frequently)
  finnegan: [
    // All major crops affected by Ephemeral Trading price swings — hold until crop of the day is known
    { id: 'ENCHANTED_WHEAT',             perkKey: 'Ephemeral Trading', reason: 'Random crop selected daily for +25% NPC price — wheat may spike or crash', action: 'HOLD', actionReason: 'Check which crop is the day\'s market crop before buying or selling' },
    { id: 'ENCHANTED_CARROT',            perkKey: 'Ephemeral Trading', reason: 'Random crop prices shift daily — carrot may be the buffed or nerfed crop', action: 'HOLD', actionReason: 'Volatile day-to-day; hold and monitor daily crop announcement' },
    { id: 'ENCHANTED_POTATO',            perkKey: 'Ephemeral Trading', reason: 'Random daily crop price shift — potato pricing volatile during Finnegan', action: 'HOLD', actionReason: 'Monitor daily crop before committing to a position' },
    { id: 'ENCHANTED_MELON',             perkKey: 'Ephemeral Trading', reason: 'Melon may be the daily boosted or penalized crop — volatile pricing', action: 'HOLD', actionReason: 'Ephemeral Trading makes crop prices highly volatile — watch daily' },
    { id: 'ENCHANTED_PUMPKIN',           perkKey: 'Ephemeral Trading', reason: 'Pumpkin pricing shifts randomly each SkyBlock day during Finnegan', action: 'HOLD', actionReason: 'High volatility — monitor before entering a large position' },
    { id: 'ENCHANTED_SUGAR_CANE',        perkKey: 'Ephemeral Trading', reason: 'Sugar cane may be the daily boosted crop — check before trading', action: 'HOLD', actionReason: 'Price can spike 25% or drop 25% depending on daily selection' },
    { id: 'ENCHANTED_COCOA_BEAN',        perkKey: 'Ephemeral Trading', reason: 'Cocoa is a tradeable crop affected by Ephemeral Trading daily shifts', action: 'HOLD', actionReason: 'Volatile during Finnegan; hold until daily crop is announced' },
    { id: 'ENCHANTED_NETHER_WART',       perkKey: 'Ephemeral Trading', reason: 'Nether wart included in Ephemeral Trading crop rotation', action: 'HOLD', actionReason: 'Monitor daily crop announcement before taking a position' },
    // Blooming Business: farming XP ×2 → farming XP sources spike in demand
    { id: 'CULTIVATING',                 perkKey: 'Blooming Business', reason: 'Farming XP doubled — Cultivating enchant book demand rises as players rush farming milestones', action: 'BUY', actionReason: 'Buy Cultivating books before Finnegan — demand spikes as players farm for XP' },
    { id: 'REPLENISH',                   perkKey: 'Blooming Business', reason: 'Farming XP doubled — Replenish enchant sought by active farmers during Finnegan', action: 'BUY', actionReason: 'Increased farming activity drives demand for farming enchant books' },
  ],
  // ─── PAUL ────────────────────────────────────────────────────────────────
  // Perks: EZPZ (+10 dungeon score bonus applied to all players, making chests better),
  //        Benediction (God Potion effectiveness +15%), Have a Nice Day (bounty hunter quests),
  //        Marauder (slayer boss HP reduced by 10%)
  paul: [
    { id: 'GOD_POTION_2',                perkKey: 'Benediction', reason: 'God Potion effectiveness +15% during Paul — every end-game player wants them', action: 'BUY', actionReason: 'Demand spike on day 1 of Paul — buy before prices peak' },
    { id: 'DUNGEON_CHEST_KEY',           perkKey: 'EZPZ', reason: '+10 dungeon score for all players makes every dungeon chest free — chest key demand spikes', action: 'BUY', actionReason: 'Massive demand spike from dungeoneer community; buy early' },
    { id: 'WITHER_ESSENCE',              perkKey: 'EZPZ', reason: 'More dungeon runs (due to better scores) → more Wither Essence drops', action: 'SELL', actionReason: 'Increased dungeon activity floods essence market — sell before price drops' },
    { id: 'UNDEAD_ESSENCE',              perkKey: 'EZPZ', reason: 'More dungeon activity → more Undead Essence drops from catacombs', action: 'SELL', actionReason: 'Dungeon essence supply rises; sell now' },
    { id: 'SPIDER_ESSENCE',              perkKey: 'EZPZ', reason: 'More dungeon activity → Spider Essence supply increases', action: 'SELL', actionReason: 'Essence oversupply expected during Paul — sell now' },
    { id: 'REVIVE_STONE',                perkKey: 'EZPZ', reason: 'More dungeon runs from EZPZ bonus → Revive Stone usage rises', action: 'BUY', actionReason: 'Players do more runs; Revive Stone demand increases' },
    { id: 'SPIRIT_LEAP',                 perkKey: 'EZPZ', reason: 'More dungeon activity → Spirit Leap demand spikes for party teleports', action: 'BUY', actionReason: 'Consumable demand rises with dungeon activity surge' },
    { id: 'WOLF_TOOTH',                  perkKey: 'Marauder', reason: 'Slayer boss HP -10% → more slayer kills per hour → more Wolf Tooth drops', action: 'SELL', actionReason: 'Slayer drop supply rises; sell wolf teeth before price drops' },
    { id: 'TARANTULA_WEB',               perkKey: 'Marauder', reason: 'Slayer boss HP -10% → more spider slayer kills → Tarantula Web supply rises', action: 'SELL', actionReason: 'Spider slayer drops increase during Paul — sell now' },
    { id: 'VOIDLING_CATALYST',           perkKey: 'Marauder', reason: 'Enderman slayer easier with -10% HP → Voidling Catalyst drop rates up', action: 'SELL', actionReason: 'Enderman slayer drops increase; sell before supply crash' },
  ],
  // ─── FOXY ────────────────────────────────────────────────────────────────
  // Perks: Extra Event (one extra Traveling Zoo, Spooky Festival, or other event per term),
  //        Benevolent (NPCs give 10% bonus coins), Happy Hours (double skill XP 2h per day),
  //        Trickster (pets get bonus stats)
  foxy: [
    { id: 'ENCHANTED_PUMPKIN',           perkKey: 'Extra Event', reason: 'Extra Spooky Festival event during Foxy — pumpkin demand spikes', action: 'BUY', actionReason: 'Spooky Festival triggers pumpkin demand; stockpile before event' },
    { id: 'CANDY_CORN',                  perkKey: 'Extra Event', reason: 'Extra Spooky Festival means more Candy Corn — prices spike then crash', action: 'SELL', actionReason: 'Sell Candy Corn into the event supply spike' },
    { id: 'GREEN_CANDY',                 perkKey: 'Extra Event', reason: 'Spooky Festival gives extra Green Candy — supply rises', action: 'SELL', actionReason: 'Extra event = extra candy supply; sell before crash' },
    { id: 'PURPLE_CANDY',                perkKey: 'Extra Event', reason: 'Spooky Festival extra event gives more Purple Candy', action: 'SELL', actionReason: 'Candy supply spikes during extra Spooky event; sell now' },
    { id: 'BAT_PERSON_HELMET',           perkKey: 'Extra Event', reason: 'Spooky Festival extra event makes Bat Person set farmable again — supply rises', action: 'SELL', actionReason: 'Extra Spooky Festival means more Bat Person drops; sell early' },
    { id: 'ENCHANTED_EXPERIENCE_BOTTLE', perkKey: 'Happy Hours', reason: 'Double skill XP for 2h per day during Foxy — XP item demand spikes', action: 'BUY', actionReason: 'Players use Happy Hours to push skills; buy XP bottles before peak demand' },
    { id: 'GRAND_EXP_BOTTLE',            perkKey: 'Happy Hours', reason: 'Double XP during Happy Hours makes large XP bottles valuable', action: 'BUY', actionReason: 'Buy before Happy Hours demand peaks each day of Foxy' },
  ],
  // ─── AATROX ──────────────────────────────────────────────────────────────
  // Perks: Slayer XP Buff (+25% slayer XP), Slayer Quest Buff (all slayer quests give +1 tier),
  //        Capricorn (combat stats increased)
  aatrox: [
    { id: 'WOLF_TOOTH',                  perkKey: 'Slayer XP Buff', reason: '+25% slayer XP → more Wolf Slayer runs → more Wolf Tooth drops', action: 'SELL', actionReason: 'Slayer activity rises; Wolf Tooth supply floods in — sell now' },
    { id: 'TARANTULA_WEB',               perkKey: 'Slayer XP Buff', reason: '+25% slayer XP → more Spider Slayer runs → Tarantula Web supply rises', action: 'SELL', actionReason: 'Spider slayer drops increase; sell before price drops' },
    { id: 'VOIDLING_CATALYST',            perkKey: 'Slayer XP Buff', reason: '+25% slayer XP → more Enderman Slayer → Voidling Catalyst supply rises', action: 'SELL', actionReason: 'Enderman slayer more active; sell catalyst drops now' },
    { id: 'BLAZE_ROD',                   perkKey: 'Slayer XP Buff', reason: '+25% slayer XP → more Blaze Slayer runs → Blaze Rod supply rises', action: 'SELL', actionReason: 'Blaze slayer activity up; sell blaze drops before supply crash' },
    { id: 'REVENANT_FLESH',              perkKey: 'Slayer XP Buff', reason: '+25% slayer XP → more Zombie Slayer → Revenant Flesh supply rises', action: 'SELL', actionReason: 'Zombie slayer drops increase during Aatrox; clear holdings' },
    { id: 'SUMMONING_EYE',               perkKey: 'Slayer Quest Buff', reason: 'Slayer quest tier +1 — more players reach higher tiers and farm Summoning Eyes', action: 'SELL', actionReason: 'Summoning Eye supply increases from higher-tier slayer activity' },
    { id: 'SPIDER_CATALYST',             perkKey: 'Slayer XP Buff', reason: 'More spider slayer activity → Spider Catalyst demand rises for progression', action: 'BUY', actionReason: 'Spider slayer players buy catalysts; demand rises during Aatrox' },
  ],
  // ─── SCORPIUS ────────────────────────────────────────────────────────────
  // Perks: Bribe (selling to Scorpius gives extra coins), Darker Auctions (corrupted items more
  //        likely from dark auction), Perk 3 (mayor candidate), Mayor's mandate
  scorpius: [
    { id: 'DARK_ORBS',                   perkKey: 'Darker Auctions', reason: 'Corrupted items more likely at Dark Auction — Dark Orb demand spikes', action: 'BUY', actionReason: 'Players buy Dark Orbs to maximize Darker Auctions perk value' },
    { id: 'ENCHANTED_GOLD',              perkKey: 'Bribe', reason: 'Bribe perk gives extra coins for selling to Scorpius NPC — gold trade volume spikes', action: 'BUY', actionReason: 'Gold demand rises as players exploit Bribe NPC selling bonus' },
    { id: 'ENCHANTED_GOLD_BLOCK',        perkKey: 'Bribe', reason: 'Bribe perk drives gold market — enchanted gold blocks affected by increased trade', action: 'HOLD', actionReason: 'Monitor gold block prices during Bribe exploitation' },
  ],
  // ─── BARRY ───────────────────────────────────────────────────────────────
  // Perks: Bail Out (players can be bailed out of jail faster), Barry's Cans (extra Barry Cans
  //        drop from fishing), Prosecution (bounties for killing players)
  barry: [
    { id: 'BARRY_SKIN',                  perkKey: "Barry's Cans", reason: "Barry's Cans drop more from fishing during his term — Barry Skin collectible rises", action: 'SELL', actionReason: 'Barry Can supply rises; sell Barry-related collectibles during term' },
  ],
  // ─── JERRY ───────────────────────────────────────────────────────────────
  // Perks: Perkpocalypse (activates perks from all other mayors simultaneously for a limited time)
  // Jerry is a special case — all mayor perks activate, so all affected items may spike
  jerry: [
    { id: 'ENCHANTED_EXPERIENCE_BOTTLE', perkKey: 'Perkpocalypse', reason: 'Jerry activates all mayor perks — MOAR SKILLZ!!! and Happy Hours both active', action: 'BUY', actionReason: 'Multiple XP perks stack during Jerry; massive XP demand spike' },
    { id: 'DUNGEON_CHEST_KEY',           perkKey: 'Perkpocalypse', reason: 'Jerry activates EZPZ from Paul perk simultaneously with others', action: 'BUY', actionReason: 'EZPZ bonus active during Jerry — dungeon chest key demand spikes' },
    { id: 'GOD_POTION_2',               perkKey: 'Perkpocalypse', reason: 'Paul Benediction perk active during Jerry — God Pot demand spikes', action: 'BUY', actionReason: 'God Pots in high demand as Benediction stacks with other Jerry perks' },
    { id: 'HAMSTER_WHEEL',               perkKey: 'Perkpocalypse', reason: 'TURBO MINIONS!!! from Derpy active during Jerry perkpocalypse', action: 'BUY', actionReason: 'Minion fuel demand spikes; all minion perks active during Jerry' },
    { id: 'WOLF_TOOTH',                  perkKey: 'Perkpocalypse', reason: 'Slayer buffs from Aatrox/Paul active during Jerry — all slayer drops rise', action: 'SELL', actionReason: 'Multiple slayer perks activate; slayer drop supply spikes' },
  ],
}

function itemDisplayName(id: string): string {
  return id.replace(/_/g, ' ')
    .split(' ')
    .map((w: string) => {
      if (w === 'EXP') return 'EXP'
      if (w === 'NPC') return 'NPC'
      if (w === 'AH')  return 'AH'
      return w.charAt(0) + w.slice(1).toLowerCase()
    })
    .join(' ')
    .replace(/^Enchanted /, '✦ ')
}

function itemIconUrl(id: string): string {
  return `https://sky.shiiyu.moe/item/${id}`
}

async function compute(): Promise<MayorData> {
  // Correct v2 election endpoint
  const [elecRes, bazRes] = await Promise.all([
    fetch('https://api.hypixel.net/v2/resources/skyblock/election', {
      signal: AbortSignal.timeout(10000),
    }),
    fetch('https://api.hypixel.net/skyblock/bazaar', {
      signal: AbortSignal.timeout(15000),
    }),
  ])
  if (!elecRes.ok) throw new Error(`Election fetch failed: ${elecRes.status}`)
  if (!bazRes.ok) throw new Error('Bazaar fetch failed')

  const elec = await elecRes.json()
  const baz  = await bazRes.json()

  const mayor   = elec.mayor
  const current = elec.current  // current voting cycle (if there is one)

  const mayorKey:  string = mayor.key
  const mayorName: string = mayor.name
  const isDerpy = mayorKey === 'derp'

  // The election API returns the current year of the active mayor
  const currentYear: number = mayor.election?.year ?? current?.year ?? 0
  const nextElectionYear    = currentYear + 1

  // Calculate time until next election using SkyBlock calendar math.
  // Each SkyBlock year = exactly 5 real days = 432000 real seconds.
  // The API may return lastUpdated (unix ms). We compute how far into the current
  // year we are, then how long until the next year boundary.
  let msUntilElection: number
  const nowMs = Date.now()
  if (currentYear > 0) {
    // Each year starts at: SB_EPOCH_MS + (year - 1) * SB_YEAR_MS
    const currentYearStartMs = SB_EPOCH_MS + (currentYear - 1) * SB_YEAR_MS
    const nextYearStartMs    = currentYearStartMs + SB_YEAR_MS
    msUntilElection = Math.max(0, nextYearStartMs - nowMs)
  } else {
    msUntilElection = SB_YEAR_MS
  }

  const products = baz.products as Record<string, {
    quick_status: {
      buyPrice: number
      sellPrice: number
      buyMovingWeek: number
      sellMovingWeek: number
    }
  }>

  const affectedItems = MAYOR_ITEMS[mayorKey] ?? []
  const items: MayorFlipItem[] = []

  for (const def of affectedItems) {
    const p = products[def.id]
    if (!p) continue
    const q = p.quick_status
    const price     = Math.round(q.buyPrice * 100) / 100
    const sellPrice = Math.round((q.sellPrice - 0.1) * 100) / 100
    if (price <= 0) continue

    // Flag potential manipulation: spread ratio >8 is suspicious
    const spread = price / Math.max(q.sellPrice, 1)
    const isPotentiallyManipulated = spread > 8

    items.push({
      id:       def.id,
      name:     itemDisplayName(def.id),
      iconUrl:  itemIconUrl(def.id),
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

  // Sort: BUY first (most actionable), then SELL, then HOLD, then WARN
  const order: Record<string, number> = { BUY: 0, SELL: 1, HOLD: 2, WARN: 3 }
  items.sort((a, b) => (order[a.action] ?? 9) - (order[b.action] ?? 9))

  return {
    mayorName,
    mayorKey,
    perks: mayor.perks ?? [],
    isDerpy,
    currentYear,
    nextElectionYear,
    msUntilElection,
    votingCandidates: current?.candidates ?? [],
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
