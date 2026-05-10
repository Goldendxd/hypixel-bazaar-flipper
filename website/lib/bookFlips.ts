export interface BookFlipRow {
  outputId: string
  outputName: string
  enchantName: string
  inputId: string
  inputQty: number        // always 16 (2^4 to reach tier 5 from tier 1)
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

export async function fetchBookFlips(): Promise<{ rows: BookFlipRow[]; totalCandidates: number }> {
  const res = await fetch('/api/book-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Book-flips API error ${res.status}`)
  return res.json()
}
