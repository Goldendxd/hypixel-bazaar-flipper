// Strategy mode presets — shared risk-filter knobs applied by list pages.

export type StrategyMode = 'SAFE' | 'BALANCED' | 'RISK'

export interface StrategyPreset {
  label: string
  blurb: string
  minVolume: number        // minimum weekly flow / recent sales
  maxMargin: number        // margins above this are treated as bait
  hideManipulated: boolean
}

export const STRATEGIES: Record<StrategyMode, StrategyPreset> = {
  SAFE: {
    label: 'Safe',
    blurb: 'High liquidity, sane margins, manipulation filtered',
    minVolume: 50_000,
    maxMargin: 40,
    hideManipulated: true,
  },
  BALANCED: {
    label: 'Balanced',
    blurb: 'Reasonable liquidity, manipulation filtered',
    minVolume: 10_000,
    maxMargin: 150,
    hideManipulated: true,
  },
  RISK: {
    label: 'High Risk',
    blurb: 'Everything — thin books and wild margins included',
    minVolume: 0,
    maxMargin: Infinity,
    hideManipulated: false,
  },
}

// Scaled-down volume gates for low-frequency markets (AH crafts, books)
export const STRATEGY_SLOW: Record<StrategyMode, { minVolume: number; maxMargin: number; hideManipulated: boolean }> = {
  SAFE: { minVolume: 100, maxMargin: 60, hideManipulated: true },
  BALANCED: { minVolume: 25, maxMargin: 200, hideManipulated: true },
  RISK: { minVolume: 0, maxMargin: Infinity, hideManipulated: false },
}
