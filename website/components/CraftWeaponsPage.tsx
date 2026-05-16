'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchCraftWeapons, WeaponFlip, CraftIngredient, ScrollAddon, PricePoint } from '@/lib/craftWeapons'
import Sidebar from '@/components/Sidebar'
import RefreshTimer from '@/components/RefreshTimer'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function coins(n: number): string {
  if (!isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function coinsShort(n: number): string {
  if (!isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return n.toFixed(0)
}

// Parse a human-friendly number like "420m", "1.2b", "50k" or raw digits
function parseCoinInput(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/,/g, '')
  if (!s) return NaN
  const mul = s.endsWith('b') ? 1e9 : s.endsWith('m') ? 1e6 : s.endsWith('k') ? 1e3 : 1
  const num = parseFloat(s.replace(/[kmb]$/, ''))
  return isFinite(num) ? num * mul : NaN
}

function ItemIcon({ id, size = 32 }: { id: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://sky.shiiyu.moe/item/${id}`}
      alt={id}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb) {
          img.dataset.fb = '1'
          img.src = `https://sky.lea.moe/item/${id}`
        } else { img.style.display = 'none' }
      }}
    />
  )
}

const RISK_COLOR: Record<string, string> = {
  LOW: 'var(--green)', MEDIUM: 'var(--gold)', HIGH: 'var(--red)',
}

// ────────────────────────────────────────────────────────────────────────────
// Sparkline
// ────────────────────────────────────────────────────────────────────────────

function Sparkline({ data, color = 'var(--blue)', w = 72, h = 22 }: {
  data: PricePoint[]; color?: string; w?: number; h?: number
}) {
  const vals = data.map(d => d.avg).filter(v => v > 0)
  if (vals.length < 2) return <div style={{ width: w, height: h }} />
  const mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 1
  const pts = vals.map((v, i) =>
    `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - mn) / range) * (h - 4) - 2).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Bar chart (24h history)
// ────────────────────────────────────────────────────────────────────────────

function BarChart({ data, color = 'var(--blue)' }: { data: PricePoint[]; color?: string }) {
  const vals = data.map(d => d.avg).filter(v => v > 0)
  if (!vals.length) return (
    <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.7rem' }}>No history data</div>
  )
  const mx = Math.max(...vals)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
      {vals.map((v, i) => (
        <div key={i} style={{ flex: 1, height: `${Math.max(4, (v / mx) * 40)}px`, background: color, borderRadius: '2px 2px 0 0', opacity: 0.65 + (i / vals.length) * 0.35 }} />
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// OTC types
// ────────────────────────────────────────────────────────────────────────────

interface OtcEntry {
  useOtc: boolean
  rawInput: string // what the user typed
}

type OtcMap = Record<string, OtcEntry> // keyed by ingredient id

// Given OTC overrides + weapon data, compute effective per-unit price for each ingredient
function effectiveUnitPrice(id: string, marketPrice: number, otc: OtcMap): number {
  const e = otc[id]
  if (e?.useOtc && e.rawInput) {
    const parsed = parseCoinInput(e.rawInput)
    if (isFinite(parsed) && parsed > 0) return parsed
  }
  return marketPrice
}

// ── OTC analysis: breakeven price, suggested buy ranges ──
interface OtcAnalysis {
  breakevenPrice: number   // max per-unit price to pay for item and still break even
  aggressiveBuy:  number   // 95% of breakeven = max room for error
  safeBuy:        number   // 90% of breakeven = comfortable margin
  lowballRange:   [number, number]
}

function computeOtcAnalysis(
  itemId: string,
  itemQty: number,
  otherIngsCost: number, // total cost of all other ingredients
  outputNetRevenue: number, // after AH tax
  marketUnitPrice: number,
): OtcAnalysis {
  // max total spend on this item to still profit
  const maxTotalForItem = outputNetRevenue - otherIngsCost
  const breakevenPrice = itemQty > 0 ? maxTotalForItem / itemQty : 0
  const aggressiveBuy  = breakevenPrice * 0.95
  const safeBuy        = breakevenPrice * 0.90

  // typical lowball is 3-7% below market
  const lbLow  = marketUnitPrice * 0.93
  const lbHigh = marketUnitPrice * 0.97
  return { breakevenPrice, aggressiveBuy, safeBuy, lowballRange: [lbLow, lbHigh] }
}

// ────────────────────────────────────────────────────────────────────────────
// OTC opportunity alert
// ────────────────────────────────────────────────────────────────────────────

interface OtcOpportunity {
  itemId:   string
  itemName: string
  label:    string
  color:    string
}

function detectOtcOpportunities(
  weapon: WeaponFlip,
  otc: OtcMap,
  outputNetRevenue: number,
): OtcOpportunity[] {
  const allItems = [
    ...weapon.ingredients,
    ...weapon.scrollAddons.map(s => ({
      id: s.id, name: s.name, qty: 1, unitPrice: s.unitPrice,
      totalCost: s.unitPrice, source: s.source as 'AH' | 'BZ',
      priceHistory: [], volatility: 0,
    })),
  ]

  const opportunities: OtcOpportunity[] = []

  for (const item of allItems) {
    // Only flag AH items — BZ items don't have player-trade equivalent
    if (item.source !== 'AH') continue

    const othersCost = allItems
      .filter(x => x.id !== item.id)
      .reduce((acc, x) => acc + effectiveUnitPrice(x.id, x.unitPrice, otc) * x.qty, 0)

    const analysis = computeOtcAnalysis(
      item.id,
      item.qty,
      othersCost,
      outputNetRevenue,
      item.unitPrice,
    )

    const marketTotal = item.unitPrice * item.qty
    const lbTotal     = analysis.lowballRange[1] * item.qty  // optimistic lowball

    const normalCraftCost = allItems.reduce((a, x) => a + x.unitPrice * x.qty, 0)
    const normalProfit    = outputNetRevenue - normalCraftCost
    const lbCraftCost     = normalCraftCost - marketTotal + lbTotal
    const lbProfit        = outputNetRevenue - lbCraftCost

    if (normalProfit <= 0 && lbProfit > 0) {
      opportunities.push({
        itemId: item.id,
        itemName: item.name,
        label: `Profitable if ${item.name} bought ≤ ${coinsShort(analysis.breakevenPrice / item.qty)}`,
        color: 'var(--gold)',
      })
    } else if (lbProfit > normalProfit * 1.5 && normalProfit > 0) {
      opportunities.push({
        itemId: item.id,
        itemName: item.name,
        label: `Strong OTC margin on ${item.name} — saves ${coinsShort(marketTotal - lbTotal)} per craft`,
        color: 'var(--green)',
      })
    }
  }

  return opportunities
}

// ────────────────────────────────────────────────────────────────────────────
// Ingredient row (inside OTC panel — editable)
// ────────────────────────────────────────────────────────────────────────────

function OtcIngredientRow({
  id, name, qty, marketUnitPrice, source, priceHistory, volatility,
  otcEntry, onChange, outputNetRevenue, otherIngsCost, accentColor,
}: {
  id: string; name: string; qty: number; marketUnitPrice: number
  source: 'AH' | 'BZ'; priceHistory: PricePoint[]; volatility: number
  otcEntry: OtcEntry
  onChange: (entry: OtcEntry) => void
  outputNetRevenue: number; otherIngsCost: number; accentColor: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const analysis = useMemo(() =>
    computeOtcAnalysis(id, qty, otherIngsCost, outputNetRevenue, marketUnitPrice),
    [id, qty, otherIngsCost, outputNetRevenue, marketUnitPrice]
  )

  const otcPrice     = otcEntry.useOtc ? parseCoinInput(otcEntry.rawInput) : NaN
  const effectivePrice = otcEntry.useOtc && isFinite(otcPrice) && otcPrice > 0
    ? otcPrice : marketUnitPrice
  const discount     = marketUnitPrice > 0 ? ((marketUnitPrice - effectivePrice) / marketUnitPrice) * 100 : 0
  const savedTotal   = (marketUnitPrice - effectivePrice) * qty
  const isProfitable = otcEntry.useOtc && isFinite(otcPrice) && otcPrice > 0
    ? (otcPrice * qty) <= (outputNetRevenue - otherIngsCost)
    : null

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
      {/* Top row: icon + name + source badge + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, background: 'var(--surface2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          <ItemIcon id={id} size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: '0.58rem', color: 'var(--muted)', marginTop: 1 }}>
            ×{qty}
            <span style={{ marginLeft: 5, color: source === 'AH' ? 'var(--gold)' : 'var(--blue)' }}>{source}</span>
            {source === 'BZ' && <span style={{ marginLeft: 5, color: 'var(--muted)', fontStyle: 'italic' }}>BZ only — OTC N/A</span>}
          </div>
        </div>

        {/* AH/OTC toggle — only for AH items */}
        {source === 'AH' && (
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            <button
              onClick={() => onChange({ ...otcEntry, useOtc: false })}
              style={{
                padding: '3px 8px', fontSize: '0.6rem', fontWeight: 700, borderRadius: '3px 0 0 3px',
                border: '1px solid var(--border2)', cursor: 'pointer', letterSpacing: '0.05em',
                background: !otcEntry.useOtc ? 'var(--gold)' : 'var(--surface2)',
                color:      !otcEntry.useOtc ? '#000' : 'var(--muted)',
              }}
            >AH</button>
            <button
              onClick={() => { onChange({ ...otcEntry, useOtc: true }); setTimeout(() => inputRef.current?.focus(), 50) }}
              style={{
                padding: '3px 8px', fontSize: '0.6rem', fontWeight: 700, borderRadius: '0 3px 3px 0',
                border: '1px solid var(--border2)', borderLeft: 'none', cursor: 'pointer', letterSpacing: '0.05em',
                background: otcEntry.useOtc ? accentColor : 'var(--surface2)',
                color:      otcEntry.useOtc ? '#000' : 'var(--muted)',
              }}
            >OTC</button>
          </div>
        )}
      </div>

      {/* Market price line */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: otcEntry.useOtc && source === 'AH' ? 8 : 0 }}>
        <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>Market: <span className="mono" style={{ color: 'var(--text2)' }}>{coinsShort(marketUnitPrice)} ea</span> · total <span className="mono" style={{ color: 'var(--red)' }}>{coinsShort(marketUnitPrice * qty)}</span></span>
        <Sparkline data={priceHistory} color={volatility > 15 ? 'var(--red)' : 'var(--muted)'} w={60} h={18} />
      </div>

      {/* OTC input + analysis */}
      {otcEntry.useOtc && source === 'AH' && (
        <div style={{ background: 'var(--surface2)', borderRadius: 4, padding: '10px 12px', border: `1px solid ${accentColor}30` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>OTC PRICE / UNIT</span>
            <input
              ref={inputRef}
              value={otcEntry.rawInput}
              onChange={e => onChange({ ...otcEntry, rawInput: e.target.value })}
              placeholder={`e.g. ${coinsShort(marketUnitPrice * 0.95)}`}
              className="filter-input mono"
              style={{ flex: 1, fontSize: '0.8rem', fontWeight: 700, padding: '5px 8px' }}
            />
          </div>

          {/* Suggested buy prices */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            {[
              { label: 'Safe Buy',       val: analysis.safeBuy,        color: 'var(--green)'  },
              { label: 'Aggressive',     val: analysis.aggressiveBuy,  color: 'var(--gold)'   },
              { label: 'Breakeven Max',  val: analysis.breakevenPrice, color: 'var(--red)'    },
            ].map(({ label, val, color }) => (
              <button
                key={label}
                onClick={() => onChange({ ...otcEntry, rawInput: val > 0 ? (val / 1e6).toFixed(2) + 'm' : '' })}
                style={{ background: 'var(--surface)', border: `1px solid ${color}40`, borderRadius: 3, padding: '5px 0', cursor: 'pointer', textAlign: 'center' }}
              >
                <div style={{ fontSize: '0.55rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div className="mono" style={{ fontSize: '0.7rem', fontWeight: 700, color }}>
                  {val > 0 ? coinsShort(val) : '—'}
                </div>
              </button>
            ))}
          </div>

          {/* Lowball range hint */}
          <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: 8 }}>
            Typical lowball range: <span className="mono" style={{ color: 'var(--text2)' }}>
              {coinsShort(analysis.lowballRange[0])} – {coinsShort(analysis.lowballRange[1])}
            </span> (3–7% below market)
          </div>

          {/* Live result if price entered */}
          {isFinite(otcPrice) && otcPrice > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Discount</div>
                <div className="mono" style={{ fontSize: '0.72rem', fontWeight: 700, color: discount > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {discount > 0 ? '-' : '+'}{Math.abs(discount).toFixed(1)}%
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Saved</div>
                <div className="mono" style={{ fontSize: '0.72rem', fontWeight: 700, color: savedTotal > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {savedTotal > 0 ? '+' : ''}{coinsShort(savedTotal)}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Viable</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isProfitable === true ? 'var(--green)' : isProfitable === false ? 'var(--red)' : 'var(--muted)' }}>
                  {isProfitable === true ? 'YES' : isProfitable === false ? 'NO' : '—'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Full OTC panel (per weapon)
// ────────────────────────────────────────────────────────────────────────────

function OtcPanel({
  weapon, accentColor, scrollsIncluded, otc, setOtc,
}: {
  weapon: WeaponFlip; accentColor: string; scrollsIncluded: boolean
  otc: OtcMap; setOtc: (fn: (prev: OtcMap) => OtcMap) => void
}) {
  const [open, setOpen] = useState(false)

  // Combine ingredients + (optional) scrolls into one list for OTC
  const allItems: Array<{ id: string; name: string; qty: number; unitPrice: number; source: 'AH' | 'BZ'; priceHistory: PricePoint[]; volatility: number }> = [
    ...weapon.ingredients,
    ...(scrollsIncluded ? weapon.scrollAddons.map(s => ({
      id: s.id, name: s.name, qty: 1, unitPrice: s.unitPrice,
      source: s.source as 'AH' | 'BZ', priceHistory: [], volatility: 0,
    })) : []),
  ]

  // Net revenue after AH tax (from LBIN)
  const outputNetRevenue = weapon.lbin * (1 - weapon.ahTax)

  // Effective total craft cost with OTC overrides
  const otcCraftCost = allItems.reduce((acc, item) => {
    return acc + effectiveUnitPrice(item.id, item.unitPrice, otc) * item.qty
  }, 0)

  const marketCraftCost = allItems.reduce((a, x) => a + x.unitPrice * x.qty, 0)
  const otcProfit       = outputNetRevenue - otcCraftCost
  const marketProfit    = outputNetRevenue - marketCraftCost
  const profitDelta     = otcProfit - marketProfit
  const otcMargin       = otcCraftCost > 0 ? (otcProfit / otcCraftCost) * 100 : 0
  const marginDelta     = otcMargin - (marketCraftCost > 0 ? (marketProfit / marketCraftCost) * 100 : 0)

  const anyOtcActive = allItems.some(x => otc[x.id]?.useOtc)
  const totalSaved   = allItems.reduce((acc, item) => {
    if (!otc[item.id]?.useOtc) return acc
    const p = parseCoinInput(otc[item.id]?.rawInput ?? '')
    if (!isFinite(p) || p <= 0) return acc
    return acc + (item.unitPrice - p) * item.qty
  }, 0)

  // Opportunity detection
  const opportunities = useMemo(
    () => detectOtcOpportunities(weapon, otc, outputNetRevenue),
    [weapon, otc, outputNetRevenue]
  )

  // Scenario label
  const scenario: { text: string; color: string } = (() => {
    if (!anyOtcActive) return { text: 'No OTC overrides active', color: 'var(--muted)' }
    if (otcProfit > 0 && marketProfit <= 0) return { text: 'PROFITABLE ONLY VIA LOWBALL', color: 'var(--gold)' }
    if (otcProfit > marketProfit * 1.4)     return { text: 'HIGH-MARGIN OTC OPPORTUNITY', color: 'var(--green)' }
    if (otcProfit > marketProfit)            return { text: 'OTC improves margin', color: 'var(--green)' }
    if (otcProfit <= 0)                     return { text: 'Not profitable even at OTC price', color: 'var(--red)' }
    return { text: 'Marginal OTC benefit', color: 'var(--text2)' }
  })()

  // Lowball efficiency score (0-100)
  const lowballScore = (() => {
    if (!anyOtcActive || totalSaved <= 0) return 0
    const maxSaveable = marketCraftCost * 0.10 // assume max possible saving is 10% of craft cost
    return Math.min(100, Math.round((totalSaved / maxSaveable) * 100))
  })()

  return (
    <div style={{ border: `1px solid ${accentColor}40`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
      {/* Panel header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'var(--surface2)', border: 'none', cursor: 'pointer', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: anyOtcActive ? 'var(--green)' : 'var(--muted)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Direct Trade / Lowball — {weapon.name}
          </span>
          {anyOtcActive && (
            <span className="badge badge-green mono" style={{ fontSize: '0.58rem' }}>
              ACTIVE · save {coinsShort(totalSaved)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {anyOtcActive && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: scenario.color }}>{scenario.text}</span>
          )}
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
        </div>
      </button>

      {open && (
        <div style={{ background: 'var(--surface)' }}>
          {/* OTC summary bar */}
          {anyOtcActive && (
            <div style={{ padding: '12px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px 16px' }}>
              <div>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>OTC Craft Cost</div>
                <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--red)' }}>{coins(otcCraftCost)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>OTC Profit</div>
                <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 800, color: otcProfit > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {otcProfit > 0 ? '+' : ''}{coins(otcProfit)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>OTC Margin</div>
                <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 800, color: otcMargin > 0 ? 'var(--green)' : 'var(--red)' }}>{otcMargin.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Profit Delta</div>
                <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 800, color: profitDelta > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {profitDelta > 0 ? '+' : ''}{coins(profitDelta)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Margin Δ</div>
                <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 800, color: marginDelta > 0 ? 'var(--green)' : 'var(--red)' }}>
                  {marginDelta > 0 ? '+' : ''}{marginDelta.toFixed(2)}pp
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>OTC Score</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <div style={{ flex: 1, height: 6, background: 'var(--surface)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${lowballScore}%`, height: '100%', background: lowballScore > 60 ? 'var(--green)' : lowballScore > 30 ? 'var(--gold)' : 'var(--red)', borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                  <span className="mono" style={{ fontSize: '0.7rem', fontWeight: 700, color: lowballScore > 60 ? 'var(--green)' : lowballScore > 30 ? 'var(--gold)' : 'var(--red)', minWidth: 28 }}>{lowballScore}</span>
                </div>
              </div>
            </div>
          )}

          {/* Scenario badge */}
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: scenario.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: scenario.color }}>{scenario.text}</span>
            {anyOtcActive && (
              <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--muted)' }}>
                vs market: <span className="mono" style={{ color: 'var(--text2)' }}>{coins(marketProfit)}</span>
              </span>
            )}
          </div>

          {/* OTC opportunity alerts */}
          {opportunities.length > 0 && (
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {opportunities.map(op => (
                <div key={op.itemId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', color: op.color }}>
                  <span style={{ fontWeight: 800 }}>▶</span>
                  <span>{op.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Per-item OTC rows */}
          <div>
            {allItems.map(item => {
              const entry = otc[item.id] ?? { useOtc: false, rawInput: '' }
              const othersCost = allItems
                .filter(x => x.id !== item.id)
                .reduce((acc, x) => acc + effectiveUnitPrice(x.id, x.unitPrice, otc) * x.qty, 0)
              return (
                <OtcIngredientRow
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  qty={item.qty}
                  marketUnitPrice={item.unitPrice}
                  source={item.source}
                  priceHistory={item.priceHistory}
                  volatility={item.volatility}
                  otcEntry={entry}
                  onChange={e => setOtc(prev => ({ ...prev, [item.id]: e }))}
                  outputNetRevenue={outputNetRevenue}
                  otherIngsCost={othersCost}
                  accentColor={accentColor}
                />
              )
            })}
          </div>

          {/* Reset */}
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>
              Mixed sourcing supported — toggle AH/OTC per item independently
            </span>
            <button
              onClick={() => setOtc(() => ({}))}
              style={{ padding: '3px 10px', fontSize: '0.62rem', fontWeight: 700, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 3, color: 'var(--muted)', cursor: 'pointer', letterSpacing: '0.05em' }}
            >
              RESET ALL
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Standard ingredient row (read-only, in weapon card)
// ────────────────────────────────────────────────────────────────────────────

function IngredientRow({ ing, otcOverride, isLast }: {
  ing: CraftIngredient; otcOverride?: number | null; isLast: boolean
}) {
  const effectiveUnit  = otcOverride != null && otcOverride > 0 ? otcOverride : ing.unitPrice
  const effectiveTotal = effectiveUnit * ing.qty
  const isOtc = otcOverride != null && otcOverride > 0 && otcOverride !== ing.unitPrice

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 48px 68px 68px 68px', gap: 8, alignItems: 'center', padding: '7px 10px', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
      <div style={{ width: 28, height: 28, background: 'var(--surface2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
        <ItemIcon id={ing.id} size={24} />
      </div>
      <div>
        <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{ing.name}</div>
        <div style={{ fontSize: '0.58rem', color: 'var(--muted)', marginTop: 1 }}>
          <span style={{ color: ing.source === 'AH' ? 'var(--gold)' : 'var(--blue)' }}>{ing.source}</span>
          {isOtc && <span style={{ marginLeft: 4, color: 'var(--green)', fontWeight: 700 }}>OTC</span>}
          {ing.volatility > 10 && <span style={{ marginLeft: 4, color: 'var(--red)' }}>±{ing.volatility.toFixed(0)}%</span>}
        </div>
      </div>
      <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text2)', textAlign: 'right' }}>×{ing.qty}</div>
      <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--text2)', textAlign: 'right' }}>{coinsShort(effectiveUnit)}</div>
      <div className="mono" style={{ fontSize: '0.72rem', fontWeight: 700, color: isOtc ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>{coinsShort(effectiveTotal)}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Sparkline data={ing.priceHistory} color={ing.volatility > 15 ? 'var(--red)' : 'var(--muted)'} w={60} h={18} />
      </div>
    </div>
  )
}

function ScrollRow({ scroll, isLast }: { scroll: ScrollAddon; isLast: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 72px', gap: 8, alignItems: 'center', padding: '7px 10px', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
      <div style={{ width: 28, height: 28, background: 'var(--surface2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <ItemIcon id={scroll.id} size={24} />
      </div>
      <div>
        <div style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text)' }}>{scroll.name}</div>
        <div style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>Post-craft · <span style={{ color: 'var(--gold)' }}>{scroll.source}</span></div>
      </div>
      <div className="mono" style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--purple)', textAlign: 'right' }}>{coinsShort(scroll.unitPrice)}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main weapon card
// ────────────────────────────────────────────────────────────────────────────

type SellMode = 'lbin' | 'sellOrder'

function WeaponCard({ weapon, accentColor, scrollMode, otc }: {
  weapon: WeaponFlip; accentColor: string; scrollMode: boolean; otc: OtcMap
}) {
  const [sellMode, setSellMode] = useState<SellMode>('lbin')

  const sellPrice       = sellMode === 'lbin' ? weapon.lbin : weapon.sellOrderPrice
  const taxedSellPrice  = sellPrice * (1 - weapon.ahTax)

  // Effective craft cost with OTC overrides applied
  const allItems = scrollMode
    ? [...weapon.ingredients, ...weapon.scrollAddons.map(s => ({ ...s, qty: 1 }))]
    : weapon.ingredients

  const effectiveCraftCost = allItems.reduce((acc, item) => {
    const unitP = effectiveUnitPrice(item.id, item.unitPrice, otc)
    return acc + unitP * item.qty
  }, 0)

  const profit = taxedSellPrice - effectiveCraftCost
  const margin = effectiveCraftCost > 0 ? (profit / effectiveCraftCost) * 100 : 0
  const isProfitable = profit > 0

  // OTC savings
  const marketCraftCost = allItems.reduce((a, x) => a + x.unitPrice * x.qty, 0)
  const otcSavings = marketCraftCost - effectiveCraftCost
  const anyOtc = allItems.some(x => otc[x.id]?.useOtc && parseCoinInput(otc[x.id]?.rawInput ?? '') > 0)

  return (
    <div className="flip-card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="card-accent" style={{ background: `linear-gradient(90deg, ${accentColor}, var(--purple))` }} />

      {/* Header */}
      <div style={{ padding: '14px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, background: 'var(--surface2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: `1px solid ${accentColor}33` }}>
            <ItemIcon id={weapon.id} size={40} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{weapon.name}</div>
            <div style={{ fontSize: '0.63rem', color: 'var(--muted)', marginTop: 2 }}>
              LBIN <span className="mono" style={{ color: accentColor }}>{coinsShort(weapon.lbin)}</span>
              <span style={{ margin: '0 5px', color: 'var(--border2)' }}>·</span>
              Sell Order <span className="mono" style={{ color: 'var(--text2)' }}>{coinsShort(weapon.sellOrderPrice)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span className={`badge ${isProfitable ? 'badge-green' : 'badge-red'} mono`}>
              {isProfitable ? '+' : ''}{margin.toFixed(1)}%
            </span>
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: RISK_COLOR[weapon.manipulationRisk] }}>
              {weapon.manipulationRisk} RISK
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          <button className={`tab-btn${sellMode === 'lbin' ? ' active' : ''}`} onClick={() => setSellMode('lbin')} style={{ flex: 1, fontSize: '0.63rem' }}>LBIN (instant)</button>
          <button className={`tab-btn${sellMode === 'sellOrder' ? ' active' : ''}`} onClick={() => setSellMode('sellOrder')} style={{ flex: 1, fontSize: '0.63rem' }}>Sell Order</button>
        </div>
      </div>

      {/* P&L */}
      <div style={{ margin: '0 14px 12px', background: isProfitable ? 'rgba(0,255,135,0.04)' : 'rgba(255,77,77,0.04)', border: `1px solid ${isProfitable ? 'rgba(0,255,135,0.18)' : 'rgba(255,77,77,0.18)'}`, borderRadius: 4, padding: '10px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: anyOtc ? 8 : 0 }}>
          <div>
            <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Net Profit</div>
            <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: isProfitable ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.02em' }}>
              {isProfitable ? '+' : ''}{coins(profit)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Craft Cost</div>
            <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--red)' }}>{coins(effectiveCraftCost)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>After 2% Tax</div>
            <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: accentColor }}>{coins(taxedSellPrice)}</div>
          </div>
        </div>
        {anyOtc && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--green)', fontWeight: 700 }}>
              OTC savings: <span className="mono">+{coinsShort(otcSavings)}</span>
            </span>
            <span style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>
              vs AH: <span className="mono">{coinsShort(taxedSellPrice - marketCraftCost)}</span>
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ margin: '0 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <div className="stat-label">Weekly Volume</div>
          <div className="stat-value mono" style={{ fontSize: '0.85rem' }}>{weapon.weeklyVolume > 0 ? weapon.weeklyVolume.toLocaleString() : '—'}</div>
        </div>
        <div>
          <div className="stat-label">Est. Sell Time</div>
          <div className="stat-value mono" style={{ fontSize: '0.85rem', color: weapon.estimatedSellDays > 7 ? 'var(--red)' : 'var(--text)' }}>
            {weapon.estimatedSellDays >= 99 ? '—' : weapon.estimatedSellDays < 1 ? `${(weapon.estimatedSellDays * 24).toFixed(0)}h` : `${weapon.estimatedSellDays.toFixed(1)}d`}
          </div>
        </div>
        <div>
          <div className="stat-label">Price Risk</div>
          <div className="stat-value mono" style={{ fontSize: '0.85rem', color: RISK_COLOR[weapon.manipulationRisk] }}>{weapon.manipulationRisk}</div>
        </div>
        <div>
          <div className="stat-label">AH Tax</div>
          <div className="stat-value mono" style={{ fontSize: '0.85rem' }}>2%</div>
        </div>
      </div>

      {weapon.manipulationReason && (
        <div style={{ margin: '0 14px 12px', padding: '7px 10px', background: 'rgba(255,183,0,0.06)', border: '1px solid rgba(255,183,0,0.2)', borderRadius: 4, fontSize: '0.63rem', color: 'var(--gold)' }}>
          ⚠ {weapon.manipulationReason}
        </div>
      )}

      {/* 24h chart */}
      <div style={{ margin: '0 14px 12px' }}>
        <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>24h Price History</div>
        <BarChart data={weapon.priceHistory} color={accentColor} />
        {weapon.priceHistory.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: '0.56rem', color: 'var(--muted)' }}>24h ago</span>
            <span style={{ fontSize: '0.56rem', color: 'var(--muted)' }}>now</span>
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Ingredients */}
      <div style={{ padding: '10px 0 0' }}>
        <div style={{ padding: '0 10px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ingredients</div>
          <div style={{ display: 'grid', gridTemplateColumns: '48px 68px 68px 68px', gap: 8 }}>
            {['Qty', 'Unit', 'Total', '24h'].map(h => (
              <div key={h} style={{ fontSize: '0.52rem', fontWeight: 700, color: 'var(--muted)', textAlign: 'right', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
        </div>
        {weapon.ingredients.map((ing, i) => {
          const e = otc[ing.id]
          const ov = e?.useOtc ? parseCoinInput(e.rawInput) : null
          return (
            <IngredientRow
              key={ing.id}
              ing={ing}
              otcOverride={ov != null && isFinite(ov) && ov > 0 ? ov : null}
              isLast={i === weapon.ingredients.length - 1 && weapon.scrollAddons.length === 0}
            />
          )
        })}
      </div>

      {weapon.scrollAddons.length > 0 && (
        <>
          <div style={{ padding: '8px 14px 5px' }}>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scroll Addons (optional)</div>
          </div>
          {weapon.scrollAddons.map((s, i) => <ScrollRow key={s.id} scroll={s} isLast={i === weapon.scrollAddons.length - 1} />)}
        </>
      )}

      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <div style={{ fontSize: '0.56rem', color: 'var(--muted)' }}>Updated {new Date(weapon.lastUpdated).toLocaleTimeString()}</div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Skeleton
// ────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 14 }}>
      <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: '55%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 10, width: '40%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 64, borderRadius: 4, marginBottom: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[0,1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 36, borderRadius: 4 }} />)}
      </div>
      <div className="skeleton" style={{ height: 40, borderRadius: 4, marginBottom: 12 }} />
      {[0,1,2].map(i => (
        <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none' }}>
          <div className="skeleton" style={{ width: 28, height: 28, borderRadius: 3, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 10, width: '60%', marginBottom: 5 }} />
            <div className="skeleton" style={{ height: 8, width: '35%' }} />
          </div>
          <div className="skeleton" style={{ height: 12, width: 50 }} />
        </div>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Comparison panel
// ────────────────────────────────────────────────────────────────────────────

function ComparisonPanel({
  hyperion, terminator, otcHyperion, otcTerminator,
}: {
  hyperion: WeaponFlip; terminator: WeaponFlip; otcHyperion: OtcMap; otcTerminator: OtcMap
}) {
  const AH_TAX = 0.02

  const hNet = hyperion.lbin * (1 - AH_TAX)
  const tNet = terminator.lbin * (1 - AH_TAX)

  const hOtcCost = hyperion.ingredients.reduce((acc, ing) =>
    acc + effectiveUnitPrice(ing.id, ing.unitPrice, otcHyperion) * ing.qty, 0)
  const tOtcCost = terminator.ingredients.reduce((acc, ing) =>
    acc + effectiveUnitPrice(ing.id, ing.unitPrice, otcTerminator) * ing.qty, 0)

  const hOtcProfit = hNet - hOtcCost
  const tOtcProfit = tNet - tOtcCost

  const rows = [
    { label: 'Craft Cost (AH)', h: coins(hyperion.craftCost),          t: coins(terminator.craftCost),          better: hyperion.craftCost < terminator.craftCost ? 'h' : 't' },
    { label: 'Craft Cost (OTC)', h: coins(hOtcCost),                   t: coins(tOtcCost),                      better: hOtcCost < tOtcCost ? 'h' : 't' },
    { label: 'LBIN',             h: coins(hyperion.lbin),              t: coins(terminator.lbin),               better: hyperion.lbin > terminator.lbin ? 'h' : 't' },
    { label: 'Profit (AH)',      h: coins(hyperion.profitNoScrolls),    t: coins(terminator.profitNoScrolls),    better: hyperion.profitNoScrolls > terminator.profitNoScrolls ? 'h' : 't' },
    { label: 'Profit (OTC)',     h: coins(hOtcProfit),                 t: coins(tOtcProfit),                    better: hOtcProfit > tOtcProfit ? 'h' : 't' },
    { label: 'AH Margin',        h: `${hyperion.marginNoScrolls.toFixed(1)}%`,   t: `${terminator.marginNoScrolls.toFixed(1)}%`, better: hyperion.marginNoScrolls > terminator.marginNoScrolls ? 'h' : 't' },
    { label: 'OTC Margin',       h: `${(hOtcCost > 0 ? (hOtcProfit / hOtcCost) * 100 : 0).toFixed(1)}%`, t: `${(tOtcCost > 0 ? (tOtcProfit / tOtcCost) * 100 : 0).toFixed(1)}%`, better: (hOtcProfit / hOtcCost) > (tOtcProfit / tOtcCost) ? 'h' : 't' },
    { label: 'Risk',             h: hyperion.manipulationRisk,         t: terminator.manipulationRisk,          better: (hyperion.manipulationRisk === 'LOW' ? 0 : hyperion.manipulationRisk === 'MEDIUM' ? 1 : 2) < (terminator.manipulationRisk === 'LOW' ? 0 : terminator.manipulationRisk === 'MEDIUM' ? 1 : 2) ? 'h' : 't' },
    { label: 'Est. Sell',        h: hyperion.estimatedSellDays >= 99 ? '—' : `${hyperion.estimatedSellDays.toFixed(1)}d`, t: terminator.estimatedSellDays >= 99 ? '—' : `${terminator.estimatedSellDays.toFixed(1)}d`, better: hyperion.estimatedSellDays < terminator.estimatedSellDays ? 'h' : 't' },
  ]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '8px 10px', fontSize: '0.58rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Metric</div>
        <div style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--blue)', textAlign: 'center' }}>HYPERION</div>
        <div style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--purple)', textAlign: 'center' }}>TERMINATOR</div>
      </div>
      {rows.map((row, i) => {
        const isOtcRow = row.label.includes('OTC')
        return (
          <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', background: isOtcRow ? 'rgba(77,159,255,0.02)' : 'transparent' }}>
            <div style={{ padding: '8px 10px', fontSize: '0.63rem', fontWeight: 600, color: isOtcRow ? 'var(--blue)' : 'var(--muted)' }}>{row.label}</div>
            <div className="mono" style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, color: row.better === 'h' ? 'var(--green)' : 'var(--text2)', textAlign: 'center', background: row.better === 'h' ? 'rgba(0,255,135,0.04)' : 'transparent' }}>
              {row.h}{row.better === 'h' && <span style={{ marginLeft: 4, fontSize: '0.52rem', color: 'var(--green)' }}>✓</span>}
            </div>
            <div className="mono" style={{ padding: '8px 10px', fontSize: '0.7rem', fontWeight: 700, color: row.better === 't' ? 'var(--green)' : 'var(--text2)', textAlign: 'center', background: row.better === 't' ? 'rgba(0,255,135,0.04)' : 'transparent' }}>
              {row.t}{row.better === 't' && <span style={{ marginLeft: 4, fontSize: '0.52rem', color: 'var(--green)' }}>✓</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function CraftWeaponsPage() {
  const [hyperion, setHyperion]       = useState<WeaponFlip | null>(null)
  const [terminator, setTerminator]   = useState<WeaponFlip | null>(null)
  const [aiSummary, setAiSummary]     = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [scrollMode, setScrollMode]   = useState(false)
  const [manualRefresh, setManualRefresh] = useState(0)

  // Per-weapon OTC maps
  const [otcH, setOtcH] = useState<OtcMap>({})
  const [otcT, setOtcT] = useState<OtcMap>({})

  const load = useCallback(async () => {
    try {
      const data = await fetchCraftWeapons()
      setHyperion(data.hyperion)
      setTerminator(data.terminator)
      setAiSummary(data.aiSummary)
      setLastUpdated(new Date())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    load()
    const id = window.setInterval(load, 3 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [load, manualRefresh])

  const bestWeapon = hyperion && terminator
    ? (hyperion.profitNoScrolls > terminator.profitNoScrolls ? 'Hyperion' : 'Terminator')
    : null

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">
        {/* Header */}
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" style={{ background: 'var(--blue)' }} />Live</span>
                : <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
              <button
                onClick={() => { setLoading(true); setManualRefresh(n => n + 1) }}
                style={{ marginLeft: 4, padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text2)', cursor: 'pointer', letterSpacing: '0.06em' }}
              >REFRESH</button>
            </div>
            <h1 className="page-title">Weapon Craft Flips</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Live crafting profit for Hyperion &amp; Terminator · AH tax 2% · OTC / direct-trade calculator included
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hyperion && (
              <div className="stat-block" style={{ minWidth: 110 }}>
                <div className="stat-label">Hyperion Profit</div>
                <div className="stat-value mono" style={{ color: hyperion.profitNoScrolls > 0 ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
                  {hyperion.profitNoScrolls > 0 ? '+' : ''}{coinsShort(hyperion.profitNoScrolls)}
                </div>
              </div>
            )}
            {terminator && (
              <div className="stat-block" style={{ minWidth: 110 }}>
                <div className="stat-label">Terminator Profit</div>
                <div className="stat-value mono" style={{ color: terminator.profitNoScrolls > 0 ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
                  {terminator.profitNoScrolls > 0 ? '+' : ''}{coinsShort(terminator.profitNoScrolls)}
                </div>
              </div>
            )}
            {bestWeapon && (
              <div className="stat-block" style={{ minWidth: 90 }}>
                <div className="stat-label">Best Now</div>
                <div className="stat-value mono" style={{ color: 'var(--gold)', marginTop: 4 }}>{bestWeapon}</div>
              </div>
            )}
          </div>
        </div>

        {/* Callout */}
        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--blue)' }}>How it works</div>
          Craft cost = instabuy prices from Coflnet. Output = AH lowest BIN. <strong style={{ color: 'var(--text)' }}>2% AH tax</strong> on sell.
          Use the <strong style={{ color: 'var(--text)' }}>Direct Trade / Lowball</strong> panels below to override individual ingredient prices with OTC deals — calculations update instantly.
        </div>

        {/* AI summary */}
        {aiSummary && (
          <div className="ai-panel">
            <div className="ai-panel-label">✦ AI Analysis — Weapon Craft Flips</div>
            <div className="ai-panel-body">{aiSummary}</div>
          </div>
        )}

        {/* Scroll toggle */}
        <div className="toolbar" style={{ gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text2)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hyperion Scrolls</span>
          <button className={`tab-btn${!scrollMode ? ' active' : ''}`} onClick={() => setScrollMode(false)} style={{ fontSize: '0.65rem' }}>No Scrolls</button>
          <button className={`tab-btn${scrollMode ? ' active' : ''}`} onClick={() => setScrollMode(true)} style={{ fontSize: '0.65rem' }}>All 3 Scrolls</button>
          <span style={{ fontSize: '0.63rem', color: 'var(--muted)' }}>(optional post-craft ability upgrades)</span>
        </div>

        {/* Comparison */}
        {hyperion && terminator && !loading && (
          <ComparisonPanel hyperion={hyperion} terminator={terminator} otcHyperion={otcH} otcTerminator={otcT} />
        )}

        {/* OTC panels */}
        {!loading && hyperion && (
          <OtcPanel weapon={hyperion} accentColor="var(--blue)" scrollsIncluded={scrollMode} otc={otcH} setOtc={setOtcH} />
        )}
        {!loading && terminator && (
          <OtcPanel weapon={terminator} accentColor="var(--purple)" scrollsIncluded={false} otc={otcT} setOtc={setOtcT} />
        )}

        {/* Weapon cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {loading && <><SkeletonCard /><SkeletonCard /></>}
          {!loading && hyperion && <WeaponCard weapon={hyperion} accentColor="var(--blue)" scrollMode={scrollMode} otc={otcH} />}
          {!loading && terminator && <WeaponCard weapon={terminator} accentColor="var(--purple)" scrollMode={false} otc={otcT} />}
        </div>
      </main>
      <RefreshTimer intervalMs={3 * 60 * 1000} lastUpdated={lastUpdated} />
    </div>
  )
}
