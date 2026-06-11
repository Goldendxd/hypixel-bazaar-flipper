// Curated weapon catalog — SkyBlock weapons worth tracking on the market,
// tagged by progression category. IDs are coflnet/NEU item tags.
// Rift gear is deliberately excluded: it trades in motes, not coins.

export type WeaponCategory =
  | 'SWORD' | 'BOW' | 'MAGE' | 'DUNGEON' | 'SLAYER' | 'CRIMSON' | 'MINING'

export const WEAPON_CATEGORIES: Array<{ key: WeaponCategory; label: string }> = [
  { key: 'SWORD',   label: 'Swords' },
  { key: 'BOW',     label: 'Bows' },
  { key: 'MAGE',    label: 'Mage' },
  { key: 'DUNGEON', label: 'Dungeon' },
  { key: 'SLAYER',  label: 'Slayer' },
  { key: 'CRIMSON', label: 'Crimson / Kuudra' },
  { key: 'MINING',  label: 'Mining' },
]

export interface WeaponDef {
  id: string
  name: string
  category: WeaponCategory
  tier: 'EARLY' | 'MID' | 'LATE' | 'END'
}

export const WEAPON_CATALOG: WeaponDef[] = [
  // ── Swords — progression ──
  { id: 'END_SWORD',             name: 'End Sword',              category: 'SWORD',   tier: 'EARLY' },
  { id: 'GOLEM_SWORD',           name: 'Golem Sword',            category: 'SWORD',   tier: 'EARLY' },
  { id: 'ZOMBIE_SWORD',          name: 'Zombie Sword',           category: 'SWORD',   tier: 'EARLY' },
  { id: 'ORNATE_ZOMBIE_SWORD',   name: 'Ornate Zombie Sword',    category: 'SWORD',   tier: 'MID' },
  { id: 'FLORID_ZOMBIE_SWORD',   name: 'Florid Zombie Sword',    category: 'SWORD',   tier: 'LATE' },
  { id: 'ASPECT_OF_THE_END',     name: 'Aspect of the End',      category: 'SWORD',   tier: 'EARLY' },
  { id: 'ASPECT_OF_THE_VOID',    name: 'Aspect of the Void',     category: 'SWORD',   tier: 'MID' },
  { id: 'ASPECT_OF_THE_DRAGON',  name: 'Aspect of the Dragons',  category: 'SWORD',   tier: 'MID' },
  { id: 'PIGMAN_SWORD',          name: 'Pigman Sword',           category: 'SWORD',   tier: 'MID' },
  { id: 'MIDAS_SWORD',           name: 'Midas Sword',            category: 'SWORD',   tier: 'LATE' },
  { id: 'FLOWER_OF_TRUTH',       name: 'Flower of Truth',        category: 'SWORD',   tier: 'LATE' },

  // ── Bows ──
  { id: 'RUNAANS_BOW',           name: "Runaan's Bow",           category: 'BOW',     tier: 'EARLY' },
  { id: 'MAGMA_BOW',             name: 'Magma Bow',              category: 'BOW',     tier: 'MID' },
  { id: 'MOSQUITO_BOW',          name: 'Mosquito Bow',           category: 'BOW',     tier: 'MID' },
  { id: 'EXPLOSIVE_BOW',         name: 'Explosive Bow',          category: 'BOW',     tier: 'MID' },
  { id: 'HURRICANE_BOW',         name: 'Hurricane Bow',          category: 'BOW',     tier: 'MID' },
  { id: 'ARTISANAL_SHORTBOW',    name: 'Artisanal Shortbow',     category: 'BOW',     tier: 'MID' },
  { id: 'SOULS_REBOUND',         name: 'Souls Rebound',          category: 'BOW',     tier: 'MID' },
  { id: 'LAST_BREATH',           name: 'Last Breath',            category: 'BOW',     tier: 'LATE' },
  { id: 'JUJU_SHORTBOW',         name: 'Juju Shortbow',          category: 'BOW',     tier: 'LATE' },
  { id: 'TERMINATOR',            name: 'Terminator',             category: 'BOW',     tier: 'END' },

  // ── Mage ──
  { id: 'FROZEN_SCYTHE',         name: 'Frozen Scythe',          category: 'MAGE',    tier: 'EARLY' },
  { id: 'GLACIAL_SCYTHE',        name: 'Glacial Scythe',         category: 'MAGE',    tier: 'MID' },
  { id: 'EMBER_ROD',             name: 'Ember Rod',              category: 'MAGE',    tier: 'EARLY' },
  { id: 'BAT_WAND',              name: 'Spirit Sceptre',         category: 'MAGE',    tier: 'MID' },
  { id: 'ICE_SPRAY_WAND',        name: 'Ice Spray Wand',         category: 'MAGE',    tier: 'LATE' },
  { id: 'FIRE_VEIL_WAND',        name: 'Fire Veil Wand',         category: 'MAGE',    tier: 'MID' },
  { id: 'YETI_SWORD',            name: 'Yeti Sword',             category: 'MAGE',    tier: 'LATE' },
  { id: 'MIDAS_STAFF',           name: 'Midas Staff',            category: 'MAGE',    tier: 'LATE' },
  { id: 'RAGNAROCK_AXE',         name: 'Ragnarock Axe',          category: 'MAGE',    tier: 'MID' },

  // ── Dungeon ──
  { id: 'BONZO_STAFF',           name: 'Bonzo Staff',            category: 'DUNGEON', tier: 'EARLY' },
  { id: 'LIVID_DAGGER',          name: 'Livid Dagger',           category: 'DUNGEON', tier: 'MID' },
  { id: 'SHADOW_FURY',           name: 'Shadow Fury',            category: 'DUNGEON', tier: 'LATE' },
  { id: 'SILENT_DEATH',          name: 'Silent Death',           category: 'DUNGEON', tier: 'LATE' },
  { id: 'GIANTS_SWORD',          name: "Giant's Sword",          category: 'DUNGEON', tier: 'LATE' },
  { id: 'DARK_CLAYMORE',         name: 'Dark Claymore',          category: 'DUNGEON', tier: 'END' },
  { id: 'NECRON_BLADE',          name: 'Necron Blade (unrefined)', category: 'DUNGEON', tier: 'END' },
  { id: 'HYPERION',              name: 'Hyperion',               category: 'DUNGEON', tier: 'END' },
  { id: 'VALKYRIE',              name: 'Valkyrie',               category: 'DUNGEON', tier: 'END' },
  { id: 'SCYLLA',                name: 'Scylla',                 category: 'DUNGEON', tier: 'END' },
  { id: 'ASTRAEA',               name: 'Astraea',                category: 'DUNGEON', tier: 'END' },

  // ── Slayer ──
  { id: 'REVENANT_FALCHION',     name: 'Revenant Falchion',      category: 'SLAYER',  tier: 'EARLY' },
  { id: 'REAPER_FALCHION',       name: 'Reaper Falchion',        category: 'SLAYER',  tier: 'MID' },
  { id: 'REAPER_SCYTHE',         name: 'Reaper Scythe',          category: 'SLAYER',  tier: 'LATE' },
  { id: 'AXE_OF_THE_SHREDDED',   name: 'Axe of the Shredded',    category: 'SLAYER',  tier: 'LATE' },
  { id: 'SCORPION_FOIL',         name: 'Scorpion Foil',          category: 'SLAYER',  tier: 'MID' },
  { id: 'THICK_SCORPION_FOIL',   name: 'Thick Scorpion Foil',    category: 'SLAYER',  tier: 'MID' },
  { id: 'POOCH_SWORD',           name: 'Pooch Sword',            category: 'SLAYER',  tier: 'MID' },
  { id: 'VOIDWALKER_KATANA',     name: 'Voidwalker Katana',      category: 'SLAYER',  tier: 'EARLY' },
  { id: 'VOIDEDGE_KATANA',       name: 'Voidedge Katana',        category: 'SLAYER',  tier: 'MID' },
  { id: 'VORPAL_KATANA',         name: 'Vorpal Katana',          category: 'SLAYER',  tier: 'LATE' },
  { id: 'ATOMSPLIT_KATANA',      name: 'Atomsplit Katana',       category: 'SLAYER',  tier: 'END' },

  // ── Crimson Isle / Kuudra ──
  { id: 'MAWDUST_DAGGER',        name: 'Twilight Dagger',        category: 'CRIMSON', tier: 'LATE' },
  { id: 'BURSTMAW_DAGGER',       name: 'Mawdredge Dagger',       category: 'CRIMSON', tier: 'LATE' },
  { id: 'FIREDUST_DAGGER',       name: 'Firedust Dagger',        category: 'CRIMSON', tier: 'LATE' },
  { id: 'BURSTFIRE_DAGGER',      name: 'Kindlebane Dagger',      category: 'CRIMSON', tier: 'LATE' },

  // ── Mining ──
  { id: 'GEMSTONE_GAUNTLET',     name: 'Gemstone Gauntlet',      category: 'MINING',  tier: 'END' },
  { id: 'AMETHYST_GAUNTLET',     name: 'Amethyst Gauntlet',      category: 'MINING',  tier: 'LATE' },
]
