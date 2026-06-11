export interface BookFlipRow {
  outputId: string
  outputName: string
  enchantName: string
  inputId: string
  inputTier: number
  outputTier: number
  inputQty: number
  inputBuyOrder: number
  inputTotalCost: number
  inputInstaCost: number
  outputSellOffer: number
  revenue: number
  profit: number
  margin: number
  instaExitProfit: number
  exitWeeklyInstabuys: number
  inputWeeklyInstasells: number
  iconUrl: string
  warning: string | null
}

export async function fetchBookFlips(): Promise<{ rows: BookFlipRow[]; totalCandidates: number; aiSummary: string | null }> {
  const res = await fetch('/api/book-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Book-flips API error ${res.status}`)
  return res.json()
}
