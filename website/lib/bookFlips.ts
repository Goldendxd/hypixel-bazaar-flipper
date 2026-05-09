export interface BookFlipRow {
  outputId: string
  outputName: string
  enchantName: string
  outputLevel: number
  inputId: string
  inputLevel: number
  inputQty: number
  inputUnitPrice: number
  inputTotalCost: number
  outputSellPrice: number
  outputBuyPrice: number
  revenue: number
  profit: number
  margin: number
  sellVolume: number
  buyVolume: number
  iconUrl: string
}

export async function fetchBookFlips(): Promise<{ rows: BookFlipRow[]; totalBooks: number }> {
  const res = await fetch('/api/book-flips', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Book-flips API error ${res.status}`)
  return res.json()
}
