// Curated pets worth leveling-for-profit (all max at level 100).
// Golden Dragon / Ender Dragon-200 style curves are excluded — they don't
// follow the standard 1→100 table. Each pet is checked at its most liquid rarity.

export interface PetDef {
  tag: string
  name: string
  rarity: 'EPIC' | 'LEGENDARY'
}

// Total pet XP to go from level 1 to 100, by rarity (standard SkyBlock curve).
export const PET_XP_TO_100: Record<string, number> = {
  COMMON: 5_624_785,
  UNCOMMON: 8_644_220,
  RARE: 12_626_665,
  EPIC: 18_608_500,
  LEGENDARY: 25_353_230,
  MYTHIC: 25_353_230,
}

// Fann "Light Training": 200,000 coins/day for 125,000 XP/day = 1.6 coins/XP.
// The laziest paid leveling benchmark — if a flip clears this, it profits even
// when you never touch the pet yourself.
export const FANN_COINS_PER_XP = 1.6

export const PET_CATALOG: PetDef[] = [
  { tag: 'PET_BLACK_CAT',       name: 'Black Cat',       rarity: 'LEGENDARY' },
  { tag: 'PET_ENDERMAN',        name: 'Enderman',        rarity: 'LEGENDARY' },
  { tag: 'PET_GRIFFIN',         name: 'Griffin',         rarity: 'LEGENDARY' },
  { tag: 'PET_ENDER_DRAGON',    name: 'Ender Dragon',    rarity: 'LEGENDARY' },
  { tag: 'PET_TIGER',           name: 'Tiger',           rarity: 'LEGENDARY' },
  { tag: 'PET_LION',            name: 'Lion',            rarity: 'LEGENDARY' },
  { tag: 'PET_BLUE_WHALE',      name: 'Blue Whale',      rarity: 'LEGENDARY' },
  { tag: 'PET_MEGALODON',       name: 'Megalodon',       rarity: 'LEGENDARY' },
  { tag: 'PET_WITHER_SKELETON', name: 'Wither Skeleton', rarity: 'LEGENDARY' },
  { tag: 'PET_PHOENIX',         name: 'Phoenix',         rarity: 'LEGENDARY' },
  { tag: 'PET_ELEPHANT',        name: 'Elephant',        rarity: 'LEGENDARY' },
  { tag: 'PET_MONKEY',          name: 'Monkey',          rarity: 'LEGENDARY' },
  { tag: 'PET_GIRAFFE',         name: 'Giraffe',         rarity: 'LEGENDARY' },
  { tag: 'PET_BLAZE',           name: 'Blaze',           rarity: 'LEGENDARY' },
  { tag: 'PET_HOUND',           name: 'Hound',           rarity: 'LEGENDARY' },
  { tag: 'PET_SPIRIT',          name: 'Spirit',          rarity: 'LEGENDARY' },
  { tag: 'PET_PARROT',          name: 'Parrot',          rarity: 'LEGENDARY' },
  { tag: 'PET_TARANTULA',       name: 'Tarantula',       rarity: 'LEGENDARY' },
  { tag: 'PET_GUARDIAN',        name: 'Guardian',        rarity: 'LEGENDARY' },
  { tag: 'PET_WOLF',            name: 'Wolf',            rarity: 'LEGENDARY' },
  { tag: 'PET_OCELOT',          name: 'Ocelot',          rarity: 'LEGENDARY' },
  { tag: 'PET_SNOWMAN',         name: 'Snowman',         rarity: 'LEGENDARY' },
  { tag: 'PET_ARMADILLO',       name: 'Armadillo',       rarity: 'LEGENDARY' },
  { tag: 'PET_RABBIT',          name: 'Rabbit',          rarity: 'LEGENDARY' },
  { tag: 'PET_BEE',             name: 'Bee',             rarity: 'LEGENDARY' },
  { tag: 'PET_PIGMAN',          name: 'Pigman',          rarity: 'LEGENDARY' },
  { tag: 'PET_HORSE',           name: 'Horse',           rarity: 'LEGENDARY' },
  { tag: 'PET_SCATHA',          name: 'Scatha',          rarity: 'LEGENDARY' },
  { tag: 'PET_MITHRIL_GOLEM',   name: 'Mithril Golem',   rarity: 'LEGENDARY' },
  { tag: 'PET_DOLPHIN',         name: 'Dolphin',         rarity: 'LEGENDARY' },
]
