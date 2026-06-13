// Per-enchant MAX COMBINABLE level on the anvil, from the NotEnoughUpdates
// repo (constants/enchants.json -> max_xp_table_levels). This is the highest
// level reachable by combining 2x(N) -> (N+1). Levels ABOVE this exist on the
// bazaar (e.g. Looting IV/V) but come from the Experimentation Table or drops
// and CANNOT be crafted by combining — so they are never valid book flips.
//
// Enchants absent here default to 5 (the standard ceiling). Stacking enchants
// (Expertise, Compact, ...) are handled separately and excluded entirely.

export const ENCHANT_COMBINE_MAX: Record<string, number> = {
  angler: 5,
  aqua_affinity: 1,
  bane_of_arthropods: 5,
  blast_protection: 5,
  caster: 5,
  chance: 3,
  cleave: 5,
  critical: 5,
  cubism: 5,
  depth_strider: 3,
  efficiency: 5,
  ender_slayer: 5,
  execute: 5,
  experience: 3,
  feather_falling: 5,
  fire_protection: 5,
  first_strike: 4,
  fortune: 3,
  frail: 5,
  frost_walker: 2,
  giant_killer: 5,
  growth: 5,
  harvesting: 5,
  infinite_quiver: 5,
  lethality: 5,
  life_steal: 3,
  looting: 3,
  luck: 5,
  luck_of_the_sea: 5,
  lure: 5,
  magnet: 5,
  piscary: 5,
  power: 5,
  projectile_protection: 5,
  prosecute: 5,
  protection: 5,
  respiration: 3,
  scavenger: 3,
  sharpness: 5,
  silk_touch: 1,
  smelting_touch: 1,
  smite: 5,
  spiked_hook: 5,
  syphon: 3,
  thorns: 3,
  thunderbolt: 5,
  thunderlord: 5,
  titan_killer: 5,
  triple_strike: 4,
  vampirism: 5,
  venomous: 5,
}

// Universal ceiling — nothing combines above V on the bazaar in practice.
export const DEFAULT_COMBINE_MAX = 5

// Accepts the bazaar base id in any form (e.g. "ENCHANTMENT_LOOTING",
// "ULTIMATE_WISE", "looting") and returns its combinable ceiling.
export function combineMaxFor(base: string): number {
  const key = base.toLowerCase().replace(/^enchantment_/, '')
  return ENCHANT_COMBINE_MAX[key] ?? DEFAULT_COMBINE_MAX
}
