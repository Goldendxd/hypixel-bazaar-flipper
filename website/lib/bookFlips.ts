export interface BookFlipRow {
  outputId: string
  outputName: string
  enchantName: string
  inputId: string
  inputTier: number
  outputTier: number
  inputQty: number           // 2^(outputTier - inputTier)
  inputUnitPrice: number
  inputTotalCost: number
  outputSellPrice: number
  revenue: number
  profit: number
  margin: number
  sellVolume: number
  buyVolume: number
  iconUrl: string
}

export async function fetchBookFlips(): Promise<{ rows: BookFlipRow[]; totalCandidates: number; aiSummary: string | null }> {
  const res = await fetch('/api/book-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Book-flips API error ${res.status}`)
  return res.json()
}
