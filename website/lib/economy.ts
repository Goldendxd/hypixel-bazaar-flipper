// Shared Hypixel SkyBlock economy math — every profit number in the app
// must flow through these so taxes and fees are never silently dropped.

// ── Bazaar ───────────────────────────────────────────────────────────────────
// Flat 1.25% tax on the coins received from any bazaar sale
// (sell offers AND instant sells).
export const BAZAAR_TAX = 0.0125

export function bazaarNet(salePrice: number): number {
  return salePrice * (1 - BAZAAR_TAX)
}

// ── Auction House ────────────────────────────────────────────────────────────
// Listing fee (paid up front, charged on the BIN / starting price):
//   < 10M: 1% · 10M–100M: 2% · ≥ 100M: 2.5%
// Claiming tax (deducted when collecting a sale ≥ 1M): 1%
export interface AhFees {
  gross: number        // sale price
  listingFee: number
  claimingTax: number
  net: number          // what actually lands in your purse
  effectiveRate: number // total % lost to the AH
}

export function ahFees(salePrice: number): AhFees {
  if (salePrice <= 0) return { gross: 0, listingFee: 0, claimingTax: 0, net: 0, effectiveRate: 0 }
  const listingRate = salePrice < 10_000_000 ? 0.01 : salePrice < 100_000_000 ? 0.02 : 0.025
  const listingFee = salePrice * listingRate
  const claimingTax = salePrice >= 1_000_000 ? salePrice * 0.01 : 0
  const net = salePrice - listingFee - claimingTax
  return {
    gross: salePrice,
    listingFee: Math.round(listingFee),
    claimingTax: Math.round(claimingTax),
    net: Math.round(net),
    effectiveRate: Math.round(((listingFee + claimingTax) / salePrice) * 1000) / 10,
  }
}

export function ahNet(salePrice: number): number {
  return ahFees(salePrice).net
}

// ── Generic profit breakdown ────────────────────────────────────────────────
export interface ProfitBreakdown {
  grossSale: number
  fees: number          // all taxes + listing fees on the exit
  acquisitionCost: number
  netProfit: number     // PRIMARY metric everywhere
  roi: number           // % of acquisition cost
}

export function profitBreakdown(grossSale: number, fees: number, acquisitionCost: number): ProfitBreakdown {
  const netProfit = grossSale - fees - acquisitionCost
  return {
    grossSale: Math.round(grossSale),
    fees: Math.round(fees),
    acquisitionCost: Math.round(acquisitionCost),
    netProfit: Math.round(netProfit),
    roi: acquisitionCost > 0 ? Math.round((netProfit / acquisitionCost) * 1000) / 10 : 0,
  }
}
