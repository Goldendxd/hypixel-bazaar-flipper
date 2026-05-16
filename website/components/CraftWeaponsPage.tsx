'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchCraftWeapons, WeaponFlip, CraftIngredient, ScrollAddon, PricePoint, IngredientPricing,
} from '@/lib/craftWeapons'
import Sidebar from '@/components/Sidebar'
import RefreshTimer from '@/components/RefreshTimer'

// ─────────────────────────────────────────────────────────────────────────────
// Coin helpers
// ─────────────────────────────────────────────────────────────────────────────

function coins(n: number): string {
  if (!isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const abs  = Math.abs(n)
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`
  return `${sign}${abs.toLocaleString()}`
}
function coinsShort(n: number): string {
  if (!isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const abs  = Math.abs(n)
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`
  return `${sign}${abs.toFixed(0)}`
}

function parseCoinInput(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/,/g, '')
  if (!s) return NaN
  const mul = s.endsWith('b') ? 1e9 : s.endsWith('m') ? 1e6 : s.endsWith('k') ? 1e3 : 1
  const num = parseFloat(s.replace(/[kmb]$/, ''))
  return isFinite(num) ? num * mul : NaN
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution mode
// ─────────────────────────────────────────────────────────────────────────────

type ExecMode = 'INSTA_BUY' | 'BUY_ORDERS' | 'MIXED'

// For MIXED: use buy orders for items where the spread * qty >= MIXED_THRESHOLD
const MIXED_THRESHOLD = 1_000_000  // 1M min saving to bother waiting

function resolvePrice(pricing: IngredientPricing, qty: number, mode: ExecMode): number {
  if (pricing.source === 'AH') return pricing.instaBuy  // AH has no buy orders
  if (mode === 'INSTA_BUY') return pricing.instaBuy
  if (mode === 'BUY_ORDERS') return pricing.buyOrder
  // MIXED: use buy order only if saving is meaningful
  const saving = (pricing.instaBuy - pricing.buyOrder) * qty
  return saving >= MIXED_THRESHOLD ? pricing.buyOrder : pricing.instaBuy
}

// ─────────────────────────────────────────────────────────────────────────────
// OTC types
// ─────────────────────────────────────────────────────────────────────────────

interface OtcEntry { useOtc: boolean; rawInput: string }
type OtcMap = Record<string, OtcEntry>

function otcPrice(id: string, marketPrice: number, otc: OtcMap): number {
  const e = otc[id]
  if (e?.useOtc && e.rawInput) {
    const p = parseCoinInput(e.rawInput)
    if (isFinite(p) && p > 0) return p
  }
  return marketPrice
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives
// ─────────────────────────────────────────────────────────────────────────────

function ItemIcon({ id, size = 28 }: { id: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://sky.shiiyu.moe/item/${id}`} alt={id} width={size} height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = `https://sky.lea.moe/item/${id}` }
        else img.style.display = 'none'
      }} />
  )
}

const RISK_CLR: Record<string, string> = { LOW: 'var(--green)', MEDIUM: 'var(--gold)', HIGH: 'var(--red)' }
const LIQ_CLR:  Record<string, string> = { HIGH: 'var(--green)', MEDIUM: 'var(--gold)', LOW: 'var(--red)' }

function Sparkline({ data, color = 'var(--blue)', w = 64, h = 20 }: { data: PricePoint[]; color?: string; w?: number; h?: number }) {
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

function BarChart({ data, color = 'var(--blue)' }: { data: PricePoint[]; color?: string }) {
  const vals = data.map(d => d.avg).filter(v => v > 0)
  if (!vals.length) return <div style={{ padding: '14px 0', textAlign: 'center', fontSize: '0.65rem', color: 'var(--muted)' }}>No history</div>
  const mx = Math.max(...vals)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 36 }}>
      {vals.map((v, i) => (
        <div key={i} style={{ flex: 1, height: `${Math.max(3, (v / mx) * 36)}px`, background: color, borderRadius: '2px 2px 0 0', opacity: 0.6 + (i / vals.length) * 0.4 }} />
      ))}
    </div>
  )
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, border: `1px solid ${color}50`, background: `${color}12`, fontSize: '0.58rem', fontWeight: 700, color, letterSpacing: '0.05em' }}>
      {text}
    </span>
  )
}

function StatRow({ label, value, color, mono = true }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      <span className={mono ? 'mono' : ''} style={{ fontSize: '0.72rem', fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution mode panel
// ─────────────────────────────────────────────────────────────────────────────

function ExecModePanel({
  weapon, mode, setMode, scrollsIncluded, accentColor,
}: {
  weapon: WeaponFlip; mode: ExecMode; setMode: (m: ExecMode) => void
  scrollsIncluded: boolean; accentColor: string
}) {
  const allItems = [
    ...weapon.ingredients,
    ...(scrollsIncluded ? weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })) : []),
  ]

  const bzItems = allItems.filter(x => x.source === 'BZ')

  const instaBuyCost  = allItems.reduce((a, x) => a + resolvePrice(x.pricing, x.qty, 'INSTA_BUY')  * x.qty, 0)
  const buyOrderCost  = allItems.reduce((a, x) => a + resolvePrice(x.pricing, x.qty, 'BUY_ORDERS') * x.qty, 0)
  const mixedCost     = allItems.reduce((a, x) => a + resolvePrice(x.pricing, x.qty, 'MIXED')      * x.qty, 0)

  const outputNetRev = weapon.cleanLbin * (1 - weapon.ahTax)
  const profitInsta  = outputNetRev - instaBuyCost
  const profitOrder  = outputNetRev - buyOrderCost
  const profitMixed  = outputNetRev - mixedCost
  const boSaving     = instaBuyCost - buyOrderCost

  // Per-BZ-item recommendation
  const itemRecs = bzItems.map(x => {
    const saving = (x.pricing.instaBuy - x.pricing.buyOrder) * x.qty
    const spread = x.pricing.spread
    const rec    = saving >= MIXED_THRESHOLD && spread < 8 ? 'BUY_ORDER' : 'INSTA_BUY'
    return { id: x.id, name: x.name, saving, spread, rec, fillTime: x.pricing.fillTimeEst, liquidity: x.pricing.liquidity }
  })

  const strategies: Array<{ key: ExecMode; label: string; profit: number; cost: number; desc: string }> = [
    { key: 'INSTA_BUY',   label: 'Insta Buy',    profit: profitInsta, cost: instaBuyCost, desc: 'Buy everything now — no waiting' },
    { key: 'BUY_ORDERS',  label: 'Buy Orders',   profit: profitOrder, cost: buyOrderCost, desc: `Save ${coinsShort(boSaving)} — wait for fills` },
    { key: 'MIXED',       label: 'Mixed',         profit: profitMixed, cost: mixedCost,    desc: `Smart split — orders only where spread ≥ ${coinsShort(MIXED_THRESHOLD)}` },
  ]

  const bestStrategy = strategies.reduce((a, b) => a.profit > b.profit ? a : b)

  return (
    <div style={{ border: `1px solid ${accentColor}35`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
      {/* Header */}
      <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Execution Strategy — {weapon.name}</span>
          <Pill text={`BEST: ${bestStrategy.label.toUpperCase()}`} color="var(--green)" />
        </div>
        <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>affects all BZ items ({bzItems.length})</span>
      </div>

      <div style={{ padding: '12px 14px', background: 'var(--surface)' }}>
        {/* Strategy selector cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {strategies.map(s => {
            const active  = mode === s.key
            const isBest  = s.key === bestStrategy.key
            const profitable = s.profit > 0
            return (
              <button
                key={s.key}
                onClick={() => setMode(s.key)}
                style={{
                  background:   active ? `${accentColor}15` : 'var(--surface2)',
                  border:       `1px solid ${active ? accentColor : isBest ? 'var(--green)50' : 'var(--border)'}`,
                  borderRadius: 4, padding: '10px 10px', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: active ? accentColor : 'var(--text)', textTransform: 'uppercase' }}>{s.label}</span>
                  {isBest && <span style={{ fontSize: '0.52rem', color: 'var(--green)', fontWeight: 700 }}>★ BEST</span>}
                </div>
                <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 800, color: profitable ? 'var(--green)' : 'var(--red)', marginBottom: 3 }}>
                  {profitable ? '+' : ''}{coinsShort(s.profit)}
                </div>
                <div style={{ fontSize: '0.56rem', color: 'var(--muted)', lineHeight: 1.3 }}>{s.desc}</div>
              </button>
            )
          })}
        </div>

        {/* Buy order savings summary */}
        {boSaving > 0 && (
          <div style={{ background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.15)', borderRadius: 4, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.63rem', color: 'var(--green)', fontWeight: 700 }}>
              Use Buy Orders for <span className="mono">+{coinsShort(boSaving)}</span> extra profit
            </div>
            <div style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>
              {boSaving / (outputNetRev || 1) > 0 ? `(${((boSaving / (instaBuyCost || 1)) * 100).toFixed(1)}% cost reduction)` : ''}
            </div>
          </div>
        )}

        {/* Per-item BZ recommendations */}
        {itemRecs.length > 0 && (
          <div>
            <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Per-Item Execution</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {itemRecs.map(r => (
                <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 70px 70px', gap: 8, alignItems: 'center', padding: '5px 8px', background: 'var(--surface2)', borderRadius: 3 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
                  <span style={{ textAlign: 'right' }}>
                    <Pill text={r.rec === 'BUY_ORDER' ? 'ORDER' : 'INSTANT'} color={r.rec === 'BUY_ORDER' ? 'var(--green)' : 'var(--blue)'} />
                  </span>
                  <span className="mono" style={{ fontSize: '0.62rem', color: r.saving > 0 ? 'var(--green)' : 'var(--muted)', textAlign: 'right' }}>
                    {r.saving > 0 ? `+${coinsShort(r.saving)}` : '—'}
                  </span>
                  <span style={{ fontSize: '0.6rem', color: 'var(--muted)', textAlign: 'right' }}>
                    {r.spread.toFixed(1)}% spread
                  </span>
                  <span style={{ fontSize: '0.6rem', color: LIQ_CLR[r.liquidity], textAlign: 'right' }}>
                    {r.fillTime}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant selector panel (Hyperion only)
// ─────────────────────────────────────────────────────────────────────────────

function VariantPanel({
  weapon, selectedVariant, setSelectedVariant, execMode, scrollsIncluded, setScrollsIncluded, accentColor,
}: {
  weapon: WeaponFlip
  selectedVariant: number; setSelectedVariant: (i: number) => void
  execMode: ExecMode
  scrollsIncluded: boolean; setScrollsIncluded: (v: boolean) => void
  accentColor: string
}) {
  if (weapon.scrollAddons.length === 0) return null

  const craftCostBase = weapon.ingredients.reduce(
    (a, x) => a + resolvePrice(x.pricing, x.qty, execMode) * x.qty, 0
  )

  return (
    <div style={{ border: `1px solid ${accentColor}35`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hyperion Variant</span>
        <Pill text="SCROLL COMBINATIONS" color={accentColor} />
      </div>
      <div style={{ padding: '12px 14px', background: 'var(--surface)' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5 }}>
          All Hyperion variants share one AH item tag. Scrolled LBIN is estimated as <strong style={{ color: 'var(--text)' }}>clean LBIN + scroll market prices</strong>. The thin scrolled AH market prices additively — this is how real traders calculate it.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {weapon.variants.map((v, i) => {
            const active = selectedVariant === i
            const scrollCostForVariant = weapon.scrollAddons
              .filter(s => v.scrollIds.includes(s.id))
              .reduce((a, s) => a + resolvePrice(s.pricing, 1, execMode), 0)
            const totalCost   = craftCostBase + scrollCostForVariant
            const netRevenue  = v.estimatedLbin * (1 - weapon.ahTax)
            const profit      = netRevenue - totalCost
            const profitable  = profit > 0
            return (
              <button
                key={v.label}
                onClick={() => { setSelectedVariant(i); setScrollsIncluded(v.scrollCount > 0) }}
                style={{
                  background:   active ? `${accentColor}18` : 'var(--surface2)',
                  border:       `1px solid ${active ? accentColor : 'var(--border)'}`,
                  borderRadius: 4, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: active ? accentColor : 'var(--text)', marginBottom: 4 }}>
                  {v.label}
                </div>
                <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 800, color: profitable ? 'var(--green)' : 'var(--red)', marginBottom: 3 }}>
                  {profitable ? '+' : ''}{coinsShort(profit)}
                </div>
                <div style={{ fontSize: '0.58rem', color: 'var(--muted)', marginBottom: 2 }}>
                  Est. LBIN <span className="mono" style={{ color: 'var(--text2)' }}>{coinsShort(v.estimatedLbin)}</span>
                </div>
                <div style={{ fontSize: '0.56rem', color: 'var(--muted)', lineHeight: 1.3 }}>{v.note}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OTC panel
// ─────────────────────────────────────────────────────────────────────────────

interface OtcAnalysis {
  breakevenMax: number; aggressiveBuy: number; safeBuy: number
  lowballLow: number; lowballHigh: number
}

function computeOtcAnalysis(qty: number, othersCost: number, outputNetRev: number, marketUnit: number): OtcAnalysis {
  const maxForItem    = outputNetRev - othersCost
  const breakevenMax  = qty > 0 ? maxForItem / qty : 0
  return {
    breakevenMax,
    aggressiveBuy: breakevenMax * 0.95,
    safeBuy:       breakevenMax * 0.90,
    lowballLow:    marketUnit * 0.93,
    lowballHigh:   marketUnit * 0.97,
  }
}

function OtcItemRow({
  id, name, qty, marketUnitPrice, source, priceHistory, volatility, execMode,
  entry, onChange, outputNetRev, othersCost, accentColor,
}: {
  id: string; name: string; qty: number; marketUnitPrice: number
  source: 'AH' | 'BZ'; priceHistory: PricePoint[]; volatility: number; execMode: ExecMode
  entry: OtcEntry; onChange: (e: OtcEntry) => void
  outputNetRev: number; othersCost: number; accentColor: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const analysis = useMemo(
    () => computeOtcAnalysis(qty, othersCost, outputNetRev, marketUnitPrice),
    [qty, othersCost, outputNetRev, marketUnitPrice]
  )
  const parsed    = entry.useOtc ? parseCoinInput(entry.rawInput) : NaN
  const effective = entry.useOtc && isFinite(parsed) && parsed > 0 ? parsed : marketUnitPrice
  const discount  = marketUnitPrice > 0 ? ((marketUnitPrice - effective) / marketUnitPrice) * 100 : 0
  const saved     = (marketUnitPrice - effective) * qty
  const viable    = entry.useOtc && isFinite(parsed) && parsed > 0
    ? parsed * qty <= outputNetRev - othersCost : null

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <div style={{ width: 26, height: 26, background: 'var(--surface2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          <ItemIcon id={id} size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text)' }}>{name}</div>
          <div style={{ fontSize: '0.57rem', color: 'var(--muted)', marginTop: 1 }}>
            ×{qty} · <span style={{ color: source === 'AH' ? 'var(--gold)' : 'var(--blue)' }}>{source}</span>
            {source === 'BZ' && <span style={{ marginLeft: 4, color: 'var(--muted)', fontStyle: 'italic' }}>BZ — OTC N/A</span>}
            {volatility > 10 && <span style={{ marginLeft: 4, color: 'var(--red)' }}>±{volatility.toFixed(0)}% vol</span>}
          </div>
        </div>
        {source === 'AH' && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button onClick={() => onChange({ ...entry, useOtc: false })}
              style={{ padding: '2px 7px', fontSize: '0.58rem', fontWeight: 700, borderRadius: '3px 0 0 3px', border: '1px solid var(--border2)', cursor: 'pointer',
                background: !entry.useOtc ? 'var(--gold)' : 'var(--surface2)', color: !entry.useOtc ? '#000' : 'var(--muted)' }}>
              AH
            </button>
            <button onClick={() => { onChange({ ...entry, useOtc: true }); setTimeout(() => inputRef.current?.focus(), 40) }}
              style={{ padding: '2px 7px', fontSize: '0.58rem', fontWeight: 700, borderRadius: '0 3px 3px 0', border: '1px solid var(--border2)', borderLeft: 'none', cursor: 'pointer',
                background: entry.useOtc ? accentColor : 'var(--surface2)', color: entry.useOtc ? '#000' : 'var(--muted)' }}>
              OTC
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: entry.useOtc && source === 'AH' ? 8 : 0 }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>
          Market: <span className="mono" style={{ color: 'var(--text2)' }}>{coinsShort(marketUnitPrice)} ea</span>
          {source === 'BZ' && execMode === 'BUY_ORDERS' && <span style={{ marginLeft: 4, color: 'var(--green)', fontSize: '0.56rem' }}>(using buy order price)</span>}
        </span>
        <Sparkline data={priceHistory} color={volatility > 15 ? 'var(--red)' : 'var(--muted)'} w={56} h={16} />
      </div>

      {entry.useOtc && source === 'AH' && (
        <div style={{ background: 'var(--surface2)', borderRadius: 4, padding: '9px 10px', border: `1px solid ${accentColor}25` }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 7 }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>OTC PRICE</span>
            <input ref={inputRef} value={entry.rawInput}
              onChange={e => onChange({ ...entry, rawInput: e.target.value })}
              placeholder={coinsShort(marketUnitPrice * 0.95)}
              className="filter-input mono"
              style={{ flex: 1, fontSize: '0.78rem', fontWeight: 700, padding: '4px 7px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 7 }}>
            {[
              { label: 'Safe',       val: analysis.safeBuy,       color: 'var(--green)' },
              { label: 'Aggressive', val: analysis.aggressiveBuy, color: 'var(--gold)'  },
              { label: 'Breakeven',  val: analysis.breakevenMax,  color: 'var(--red)'   },
            ].map(({ label, val, color }) => (
              <button key={label} onClick={() => onChange({ ...entry, rawInput: val > 0 ? `${(val / 1e6).toFixed(2)}m` : '' })}
                style={{ background: 'var(--surface)', border: `1px solid ${color}35`, borderRadius: 3, padding: '4px 0', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: '0.52rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 1 }}>{label}</div>
                <div className="mono" style={{ fontSize: '0.67rem', fontWeight: 700, color }}>{val > 0 ? coinsShort(val) : '—'}</div>
              </button>
            ))}
          </div>
          <div style={{ fontSize: '0.57rem', color: 'var(--muted)', marginBottom: isFinite(parsed) && parsed > 0 ? 7 : 0 }}>
            Typical lowball: <span className="mono" style={{ color: 'var(--text2)' }}>{coinsShort(analysis.lowballLow)} – {coinsShort(analysis.lowballHigh)}</span>
          </div>
          {isFinite(parsed) && parsed > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
              {[
                { label: 'Discount',  val: `${discount > 0 ? '-' : '+'}${Math.abs(discount).toFixed(1)}%`, color: discount > 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Saved',     val: saved > 0 ? `+${coinsShort(saved)}` : coinsShort(saved), color: saved > 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Viable',    val: viable === true ? 'YES' : viable === false ? 'NO' : '—', color: viable === true ? 'var(--green)' : viable === false ? 'var(--red)' : 'var(--muted)' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.52rem', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                  <div className="mono" style={{ fontSize: '0.7rem', fontWeight: 700, color }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OtcPanel({
  weapon, accentColor, scrollsIncluded, selectedVariant, execMode, otc, setOtc,
}: {
  weapon: WeaponFlip; accentColor: string; scrollsIncluded: boolean
  selectedVariant: number; execMode: ExecMode
  otc: OtcMap; setOtc: (fn: (prev: OtcMap) => OtcMap) => void
}) {
  const [open, setOpen] = useState(false)

  const variantLbin   = weapon.variants[selectedVariant]?.estimatedLbin ?? weapon.cleanLbin
  const outputNetRev  = variantLbin * (1 - weapon.ahTax)

  const allItems = useMemo(() => [
    ...weapon.ingredients,
    ...(scrollsIncluded ? weapon.scrollAddons.map(s => ({
      id: s.id, name: s.name, qty: 1,
      pricing: s.pricing,
      unitPrice: s.unitPrice, totalCost: s.unitPrice,
      source: s.source, iconUrl: s.iconUrl, priceHistory: [] as PricePoint[], volatility: 0,
    })) : []),
  ], [weapon, scrollsIncluded])

  const otcCraftCost = allItems.reduce((acc, item) => {
    const marketPrice = resolvePrice(item.pricing, item.qty, execMode)
    return acc + otcPrice(item.id, marketPrice, otc) * item.qty
  }, 0)
  const marketCraftCost = allItems.reduce((a, x) => a + resolvePrice(x.pricing, x.qty, execMode) * x.qty, 0)
  const otcProfit       = outputNetRev - otcCraftCost
  const marketProfit    = outputNetRev - marketCraftCost
  const otcMargin       = otcCraftCost > 0 ? (otcProfit / otcCraftCost) * 100 : 0
  const anyOtcActive    = allItems.some(x => otc[x.id]?.useOtc)
  const totalSaved      = allItems.reduce((acc, item) => {
    if (!otc[item.id]?.useOtc) return acc
    const p = parseCoinInput(otc[item.id]?.rawInput ?? '')
    const m = resolvePrice(item.pricing, item.qty, execMode)
    if (!isFinite(p) || p <= 0) return acc
    return acc + (m - p) * item.qty
  }, 0)

  // OTC opportunity alerts
  const alerts = useMemo(() => {
    const out: Array<{ label: string; color: string }> = []
    allItems.forEach(item => {
      if (item.source !== 'AH') return
      const otherCost  = allItems.filter(x => x.id !== item.id)
        .reduce((a, x) => a + otcPrice(x.id, resolvePrice(x.pricing, x.qty, execMode), otc) * x.qty, 0)
      const { breakevenMax } = computeOtcAnalysis(item.qty, otherCost, outputNetRev, resolvePrice(item.pricing, item.qty, execMode))
      const mktTotal  = resolvePrice(item.pricing, item.qty, execMode) * item.qty
      const lbTotal   = item.pricing.instaBuy * 0.95 * item.qty
      const lbProfit  = outputNetRev - (marketCraftCost - mktTotal + lbTotal)
      if (marketProfit <= 0 && lbProfit > 0)
        out.push({ label: `Profitable if ${item.name} bought ≤ ${coinsShort(breakevenMax)}`, color: 'var(--gold)' })
      else if (lbProfit > marketProfit * 1.5 && marketProfit > 0)
        out.push({ label: `Strong OTC margin on ${item.name} — save ~${coinsShort(mktTotal * 0.05)} per craft`, color: 'var(--green)' })
    })
    return out
  }, [allItems, otc, execMode, outputNetRev, marketCraftCost, marketProfit])

  const scenarioLabel = (() => {
    if (!anyOtcActive) return { text: 'No OTC active', color: 'var(--muted)' }
    if (otcProfit > 0 && marketProfit <= 0) return { text: 'PROFITABLE ONLY VIA LOWBALL', color: 'var(--gold)' }
    if (otcProfit > marketProfit * 1.4)     return { text: 'HIGH-MARGIN OTC OPPORTUNITY', color: 'var(--green)' }
    if (otcProfit > marketProfit)            return { text: 'OTC improves margin', color: 'var(--green)' }
    if (otcProfit <= 0)                     return { text: 'Still unprofitable at OTC price', color: 'var(--red)' }
    return { text: 'Marginal OTC benefit', color: 'var(--text2)' }
  })()

  const lowballScore = !anyOtcActive || totalSaved <= 0 ? 0
    : Math.min(100, Math.round((totalSaved / (marketCraftCost * 0.08)) * 100))

  return (
    <div style={{ border: `1px solid ${accentColor}35`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: 'var(--surface2)', border: 'none', cursor: 'pointer', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: anyOtcActive ? 'var(--green)' : 'var(--muted)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Direct Trade / Lowball — {weapon.name}
          </span>
          {anyOtcActive && <Pill text={`ACTIVE · save ${coinsShort(totalSaved)}`} color="var(--green)" />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {anyOtcActive && <span style={{ fontSize: '0.63rem', fontWeight: 700, color: scenarioLabel.color }}>{scenarioLabel.text}</span>}
          <span style={{ fontSize: '0.68rem', color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▾</span>
        </div>
      </button>

      {open && (
        <div style={{ background: 'var(--surface)' }}>
          {anyOtcActive && (
            <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px 14px' }}>
              {[
                { label: 'OTC Craft Cost', val: coins(otcCraftCost),                   color: 'var(--red)'   },
                { label: 'OTC Profit',     val: `${otcProfit > 0 ? '+' : ''}${coins(otcProfit)}`, color: otcProfit > 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'OTC Margin',     val: `${otcMargin.toFixed(1)}%`,             color: otcMargin > 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Profit Delta',   val: `${(otcProfit - marketProfit) > 0 ? '+' : ''}${coinsShort(otcProfit - marketProfit)}`, color: 'var(--green)' },
                { label: 'Total Saved',    val: `+${coinsShort(totalSaved)}`,           color: 'var(--green)' },
                { label: 'OTC Score',      val: `${lowballScore}/100`,                  color: lowballScore > 60 ? 'var(--green)' : lowballScore > 30 ? 'var(--gold)' : 'var(--red)' },
              ].map(({ label, val, color }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.52rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
                  <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 800, color }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '7px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: scenarioLabel.color }} />
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: scenarioLabel.color }}>{scenarioLabel.text}</span>
            {anyOtcActive && <span style={{ marginLeft: 'auto', fontSize: '0.58rem', color: 'var(--muted)' }}>vs market: <span className="mono">{coins(marketProfit)}</span></span>}
          </div>

          {alerts.map((a, i) => (
            <div key={i} style={{ padding: '5px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.63rem', color: a.color }}>
              <span style={{ fontWeight: 800 }}>▶</span> {a.label}
            </div>
          ))}

          {allItems.map(item => {
            const baseMarketPrice = resolvePrice(item.pricing, item.qty, execMode)
            const othersCost = allItems.filter(x => x.id !== item.id)
              .reduce((acc, x) => acc + otcPrice(x.id, resolvePrice(x.pricing, x.qty, execMode), otc) * x.qty, 0)
            return (
              <OtcItemRow
                key={item.id}
                id={item.id} name={item.name} qty={item.qty}
                marketUnitPrice={baseMarketPrice}
                source={item.source}
                priceHistory={item.priceHistory}
                volatility={item.volatility}
                execMode={execMode}
                entry={otc[item.id] ?? { useOtc: false, rawInput: '' }}
                onChange={e => setOtc(prev => ({ ...prev, [item.id]: e }))}
                outputNetRev={outputNetRev}
                othersCost={othersCost}
                accentColor={accentColor}
              />
            )
          })}

          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>Mixed sourcing — toggle AH/OTC per ingredient independently</span>
            <button onClick={() => setOtc(() => ({}))}
              style={{ padding: '2px 9px', fontSize: '0.6rem', fontWeight: 700, background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 3, color: 'var(--muted)', cursor: 'pointer' }}>
              RESET
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Advanced Profit Engine panel
// ─────────────────────────────────────────────────────────────────────────────

function ProfitEngine({
  weapon, execMode, otc, selectedVariant, scrollsIncluded, accentColor,
}: {
  weapon: WeaponFlip; execMode: ExecMode; otc: OtcMap
  selectedVariant: number; scrollsIncluded: boolean; accentColor: string
}) {
  const variant       = weapon.variants[selectedVariant] ?? weapon.variants[0]
  const variantLbin   = variant.estimatedLbin

  const allIngredients = weapon.ingredients
  const scrollItems    = scrollsIncluded ? weapon.scrollAddons : []

  const instaBuyCost  = allIngredients.reduce((a, x) => a + x.pricing.instaBuy * x.qty, 0)
                      + scrollItems.reduce((a, s) => a + s.pricing.instaBuy, 0)

  const buyOrderCost  = allIngredients.reduce((a, x) => a + x.pricing.buyOrder * x.qty, 0)
                      + scrollItems.reduce((a, s) => a + s.pricing.buyOrder, 0)

  const otcCost = [...allIngredients, ...scrollItems.map(s => ({ ...s, qty: 1 }))].reduce((acc, x) => {
    const base = resolvePrice(x.pricing, x.qty, execMode)
    return acc + otcPrice(x.id, base, otc) * x.qty
  }, 0)

  const netRev        = variantLbin * (1 - weapon.ahTax)

  // Scenarios
  const scenarios = [
    { label: 'Insta Buy (worst case)',   cost: instaBuyCost, profit: netRev - instaBuyCost },
    { label: 'Buy Orders (patient)',     cost: buyOrderCost, profit: netRev - buyOrderCost },
    { label: 'OTC + selected exec',      cost: otcCost,      profit: netRev - otcCost      },
  ]

  const best = scenarios.reduce((a, b) => a.profit > b.profit ? a : b)

  // Flip difficulty
  const difficulty = (() => {
    if (instaBuyCost > 400e6) return { label: 'EXTREME', color: 'var(--red)' }
    if (instaBuyCost > 200e6) return { label: 'HIGH',    color: 'var(--gold)' }
    if (instaBuyCost > 50e6)  return { label: 'MEDIUM',  color: 'var(--blue)' }
    return { label: 'LOW', color: 'var(--green)' }
  })()

  return (
    <div style={{ border: `1px solid ${accentColor}35`, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}>
      <div style={{ background: 'var(--surface2)', padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Profit Engine — {weapon.name}</span>
        <Pill text={variant.label.toUpperCase()} color={accentColor} />
      </div>
      <div style={{ padding: '12px 14px', background: 'var(--surface)' }}>
        {/* Scenario comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {scenarios.map(s => {
            const isBest = s.label === best.label
            const prof   = s.profit
            return (
              <div key={s.label} style={{ background: 'var(--surface2)', border: `1px solid ${isBest ? 'var(--green)' : 'var(--border)'}`, borderRadius: 4, padding: '10px 10px' }}>
                <div style={{ fontSize: '0.57rem', fontWeight: 700, color: isBest ? 'var(--green)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                  {s.label}{isBest ? ' ★' : ''}
                </div>
                <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 800, color: prof > 0 ? 'var(--green)' : 'var(--red)', marginBottom: 3 }}>
                  {prof > 0 ? '+' : ''}{coinsShort(prof)}
                </div>
                <div style={{ fontSize: '0.57rem', color: 'var(--muted)' }}>cost: <span className="mono">{coinsShort(s.cost)}</span></div>
              </div>
            )
          })}
        </div>

        {/* Detailed breakdown */}
        <div style={{ marginBottom: 12 }}>
          <StatRow label="Est. LBIN (variant)"    value={coins(variantLbin)}                    color="var(--text)"   />
          <StatRow label="After 2% AH tax"         value={coins(netRev)}                         color={accentColor}   />
          <StatRow label="Insta-buy cost"           value={coins(instaBuyCost)}                   color="var(--red)"    />
          <StatRow label="Buy-order cost"           value={coins(buyOrderCost)}                   color="var(--gold)"   />
          <StatRow label="OTC + exec cost"          value={coins(otcCost)}                        color="var(--purple)" />
          <StatRow label="Buy-order saving"         value={`+${coinsShort(instaBuyCost - buyOrderCost)}`} color="var(--green)" />
          <StatRow label="Best-case profit"         value={`+${coinsShort(best.profit)}`}         color="var(--green)"  />
          <StatRow label="Realistic profit (insta)" value={`${netRev - instaBuyCost > 0 ? '+' : ''}${coinsShort(netRev - instaBuyCost)}`} color={netRev - instaBuyCost > 0 ? 'var(--green)' : 'var(--red)'} />
          <StatRow label="Market liq. risk"         value={weapon.manipulationRisk}               color={RISK_CLR[weapon.manipulationRisk]} />
          <StatRow label="Flip difficulty"          value={difficulty.label}                      color={difficulty.color} />
          <StatRow label="Est. sell time"           value={weapon.estimatedSellDays >= 99 ? 'Unknown' : weapon.estimatedSellDays < 1 ? `${(weapon.estimatedSellDays * 24).toFixed(0)}h` : `${weapon.estimatedSellDays.toFixed(1)}d`} />
        </div>

        {/* Headline verdict */}
        <div style={{ background: best.profit > 0 ? 'rgba(0,255,135,0.05)' : 'rgba(255,77,77,0.05)', border: `1px solid ${best.profit > 0 ? 'rgba(0,255,135,0.2)' : 'rgba(255,77,77,0.2)'}`, borderRadius: 4, padding: '10px 12px' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Verdict</div>
          <div style={{ fontSize: '0.72rem', color: best.profit > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, lineHeight: 1.4 }}>
            {best.profit <= 0
              ? `Not profitable via any strategy — market is too tight on ${weapon.name}`
              : best.profit === netRev - otcCost && otcCost < instaBuyCost
                ? `+${coinsShort(best.profit)} profit if OTC-sourced · +${coinsShort(best.profit - (netRev - instaBuyCost))} gain over AH`
                : best.profit === netRev - buyOrderCost
                  ? `+${coinsShort(best.profit)} profit via buy orders · save ${coinsShort(instaBuyCost - buyOrderCost)} vs insta-buy`
                  : `+${coinsShort(best.profit)} profit via insta-buy — tight spread, not worth waiting`
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingredient table (weapon card inner)
// ─────────────────────────────────────────────────────────────────────────────

function IngredientTable({ weapon, execMode, otc }: {
  weapon: WeaponFlip; execMode: ExecMode; otc: OtcMap
}) {
  const allItems: Array<CraftIngredient | (ScrollAddon & { qty: number; priceHistory: PricePoint[]; volatility: number })> = [
    ...weapon.ingredients,
    ...weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })),
  ]

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 44px 64px 64px 58px', gap: 6, padding: '4px 10px 5px', borderBottom: '1px solid var(--border)' }}>
        {['', 'Item', 'Qty', 'Unit', 'Total', '24h'].map(h => (
          <div key={h} style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', textAlign: h === '' ? 'left' : 'right' }}>{h}</div>
        ))}
      </div>
      {allItems.map((item, i) => {
        const isScroll   = !('totalCost' in item)
        const basePrice  = resolvePrice(item.pricing, item.qty, execMode)
        const effective  = otcPrice(item.id, basePrice, otc)
        const total      = effective * item.qty
        const isOtc      = effective !== basePrice
        const isLast     = i === allItems.length - 1
        return (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 44px 64px 64px 58px', gap: 6, alignItems: 'center', padding: '6px 10px', borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
            <div style={{ width: 26, height: 26, background: 'var(--surface2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <ItemIcon id={item.id} size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{item.name}</div>
              <div style={{ fontSize: '0.56rem', color: 'var(--muted)', marginTop: 1 }}>
                <span style={{ color: item.source === 'AH' ? 'var(--gold)' : 'var(--blue)' }}>{item.source}</span>
                {isScroll && <span style={{ marginLeft: 4, color: 'var(--purple)' }}>scroll</span>}
                {isOtc    && <span style={{ marginLeft: 4, color: 'var(--green)', fontWeight: 700 }}>OTC</span>}
                {!isOtc && item.source === 'BZ' && execMode !== 'INSTA_BUY' && (
                  <span style={{ marginLeft: 4, color: 'var(--green)' }}>
                    {execMode === 'BUY_ORDERS' ? 'order' : item.pricing.spread > 0 ? 'order' : 'instant'}
                  </span>
                )}
              </div>
            </div>
            <div className="mono" style={{ fontSize: '0.65rem', color: 'var(--text2)', textAlign: 'right' }}>×{item.qty}</div>
            <div className="mono" style={{ fontSize: '0.65rem', color: 'var(--text2)', textAlign: 'right' }}>{coinsShort(effective)}</div>
            <div className="mono" style={{ fontSize: '0.7rem', fontWeight: 700, color: isOtc ? 'var(--green)' : 'var(--red)', textAlign: 'right' }}>{coinsShort(total)}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Sparkline data={item.priceHistory} color={item.volatility > 15 ? 'var(--red)' : 'var(--muted)'} w={52} h={16} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Bazaar spread widget
// ─────────────────────────────────────────────────────────────────────────────

function SpreadRow({ item, execMode }: { item: CraftIngredient; execMode: ExecMode }) {
  if (item.source !== 'BZ') return null
  const { instaBuy, buyOrder, spread, liquidity, fillTimeEst } = item.pricing
  const saving = (instaBuy - buyOrder) * item.qty
  const usingOrder = execMode === 'BUY_ORDERS' || (execMode === 'MIXED' && saving >= MIXED_THRESHOLD)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', borderBottom: '1px solid var(--border)', background: usingOrder ? 'rgba(0,255,135,0.02)' : 'transparent' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.63rem', fontWeight: 600, color: 'var(--text)' }}>{item.name}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: '0.57rem', color: 'var(--muted)' }}>Insta: <span className="mono" style={{ color: 'var(--red)' }}>{coinsShort(instaBuy)}</span></span>
          <span style={{ fontSize: '0.57rem', color: 'var(--muted)' }}>Order: <span className="mono" style={{ color: 'var(--green)' }}>{coinsShort(buyOrder)}</span></span>
          <span style={{ fontSize: '0.57rem', color: 'var(--muted)' }}>Spread: <span className="mono" style={{ color: spread > 5 ? 'var(--gold)' : 'var(--text2)' }}>{spread.toFixed(1)}%</span></span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: saving > 0 ? 'var(--green)' : 'var(--muted)' }}>
          {saving > 0 ? `+${coinsShort(saving)}` : '—'}
        </div>
        <div style={{ fontSize: '0.55rem', color: LIQ_CLR[liquidity] }}>{liquidity} · {fillTimeEst}</div>
      </div>
      {usingOrder && <Pill text="ORDER" color="var(--green)" />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main weapon card
// ─────────────────────────────────────────────────────────────────────────────

function WeaponCard({
  weapon, accentColor, execMode, otc, selectedVariant, scrollsIncluded,
}: {
  weapon: WeaponFlip; accentColor: string; execMode: ExecMode; otc: OtcMap
  selectedVariant: number; scrollsIncluded: boolean
}) {
  const [showSpreads, setShowSpreads] = useState(false)
  const variant    = weapon.variants[selectedVariant] ?? weapon.variants[0]
  const variantLbin = variant.estimatedLbin

  const allItems = [
    ...weapon.ingredients,
    ...(scrollsIncluded ? weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })) : []),
  ]

  const effectiveCost = allItems.reduce((acc, x) => {
    const base = resolvePrice(x.pricing, x.qty, execMode)
    return acc + otcPrice(x.id, base, otc) * x.qty
  }, 0)

  const netRev    = variantLbin * (1 - weapon.ahTax)
  const profit    = netRev - effectiveCost
  const margin    = effectiveCost > 0 ? (profit / effectiveCost) * 100 : 0
  const isProfit  = profit > 0

  const marketCost = allItems.reduce((a, x) => a + resolvePrice(x.pricing, x.qty, execMode) * x.qty, 0)
  const otcSaving  = marketCost - effectiveCost
  const anyOtc     = allItems.some(x => otc[x.id]?.useOtc && parseCoinInput(otc[x.id]?.rawInput ?? '') > 0)

  const bzItems = weapon.ingredients.filter(x => x.source === 'BZ')

  return (
    <div className="flip-card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className="card-accent" style={{ background: `linear-gradient(90deg, ${accentColor}, var(--purple))` }} />

      <div style={{ padding: '13px 14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 44, height: 44, background: 'var(--surface2)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: `1px solid ${accentColor}30` }}>
            <ItemIcon id={weapon.id} size={40} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>{weapon.name}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: 2 }}>
              {variant.label} · LBIN <span className="mono" style={{ color: accentColor }}>{coinsShort(variantLbin)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span className={`badge ${isProfit ? 'badge-green' : 'badge-red'} mono`}>
              {isProfit ? '+' : ''}{margin.toFixed(1)}%
            </span>
            <span style={{ fontSize: '0.56rem', fontWeight: 700, color: RISK_CLR[weapon.manipulationRisk] }}>
              {weapon.manipulationRisk} RISK
            </span>
          </div>
        </div>
      </div>

      {/* P&L */}
      <div style={{ margin: '0 14px 10px', background: isProfit ? 'rgba(0,255,135,0.04)' : 'rgba(255,77,77,0.04)', border: `1px solid ${isProfit ? 'rgba(0,255,135,0.18)' : 'rgba(255,77,77,0.18)'}`, borderRadius: 4, padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: anyOtc ? 7 : 0 }}>
          <div>
            <div style={{ fontSize: '0.53rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Net Profit</div>
            <div className="mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: isProfit ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.02em' }}>
              {isProfit ? '+' : ''}{coins(profit)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.53rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Craft Cost</div>
            <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--red)' }}>{coinsShort(effectiveCost)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.53rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Net Revenue</div>
            <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: accentColor }}>{coinsShort(netRev)}</div>
          </div>
        </div>
        {anyOtc && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--green)', fontWeight: 700 }}>OTC: <span className="mono">+{coinsShort(otcSaving)}</span> saved</span>
            <span style={{ fontSize: '0.56rem', color: 'var(--muted)' }}>AH: <span className="mono">{coinsShort(netRev - marketCost)}</span></span>
          </div>
        )}
      </div>

      {weapon.manipulationReason && (
        <div style={{ margin: '0 14px 10px', padding: '6px 9px', background: 'rgba(255,183,0,0.06)', border: '1px solid rgba(255,183,0,0.2)', borderRadius: 4, fontSize: '0.62rem', color: 'var(--gold)' }}>
          ⚠ {weapon.manipulationReason}
        </div>
      )}

      {/* 24h chart */}
      <div style={{ margin: '0 14px 10px' }}>
        <div style={{ fontSize: '0.56rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>24h Price History</div>
        <BarChart data={weapon.priceHistory} color={accentColor} />
        {weapon.priceHistory.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: '0.54rem', color: 'var(--muted)' }}>24h ago</span>
            <span style={{ fontSize: '0.54rem', color: 'var(--muted)' }}>now</span>
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Ingredient table */}
      <div style={{ padding: '8px 0 0' }}>
        <IngredientTable weapon={weapon} execMode={execMode} otc={otc} />
      </div>

      {/* BZ spread toggle */}
      {bzItems.length > 0 && (
        <>
          <button onClick={() => setShowSpreads(s => !s)}
            style={{ margin: '8px 14px 0', padding: '5px 0', background: 'none', border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.05em' }}>
            {showSpreads ? '▲ HIDE' : '▼ SHOW'} BZ SPREADS ({bzItems.length} items)
          </button>
          {showSpreads && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--border)' }}>
              {bzItems.map(item => <SpreadRow key={item.id} item={item} execMode={execMode} />)}
            </div>
          )}
        </>
      )}

      <div style={{ padding: '8px 14px 12px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <div style={{ fontSize: '0.54rem', color: 'var(--muted)' }}>Updated {new Date(weapon.lastUpdated).toLocaleTimeString()}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison panel
// ─────────────────────────────────────────────────────────────────────────────

function ComparisonPanel({
  hyperion, terminator, execModeH, execModeT, otcH, otcT,
}: {
  hyperion: WeaponFlip; terminator: WeaponFlip
  execModeH: ExecMode; execModeT: ExecMode
  otcH: OtcMap; otcT: OtcMap
}) {
  const compute = (w: WeaponFlip, mode: ExecMode, otc: OtcMap, variantIdx: number) => {
    const variant   = w.variants[variantIdx] ?? w.variants[0]
    const cost      = w.ingredients.reduce((a, x) => a + otcPrice(x.id, resolvePrice(x.pricing, x.qty, mode), otc) * x.qty, 0)
    const net       = variant.estimatedLbin * (1 - w.ahTax)
    const profit    = net - cost
    const margin    = cost > 0 ? (profit / cost) * 100 : 0
    const boSaving  = w.ingredients.filter(x => x.source === 'BZ').reduce((a, x) => a + (x.pricing.instaBuy - x.pricing.buyOrder) * x.qty, 0)
    return { profit, margin, boSaving }
  }

  const h = compute(hyperion, execModeH, otcH, 0)
  const t = compute(terminator, execModeT, otcT, 0)

  const rows = [
    { label: 'Clean LBIN',         h: coins(hyperion.cleanLbin),        t: coins(terminator.cleanLbin),        better: hyperion.cleanLbin > terminator.cleanLbin ? 'h' : 't' },
    { label: 'Craft Cost',         h: coins(hyperion.craftCost),        t: coins(terminator.craftCost),        better: hyperion.craftCost < terminator.craftCost ? 'h' : 't' },
    { label: 'AH Profit (insta)',  h: coins(hyperion.profitNoScrolls),  t: coins(terminator.profitNoScrolls),  better: hyperion.profitNoScrolls > terminator.profitNoScrolls ? 'h' : 't' },
    { label: 'Exec Profit',        h: coins(h.profit),                  t: coins(t.profit),                   better: h.profit > t.profit ? 'h' : 't' },
    { label: 'Exec Margin',        h: `${h.margin.toFixed(1)}%`,        t: `${t.margin.toFixed(1)}%`,         better: h.margin > t.margin ? 'h' : 't' },
    { label: 'Buy Order Saving',   h: `+${coinsShort(h.boSaving)}`,     t: `+${coinsShort(t.boSaving)}`,      better: h.boSaving > t.boSaving ? 'h' : 't' },
    { label: 'Manip. Risk',        h: hyperion.manipulationRisk,        t: terminator.manipulationRisk,        better: (hyperion.manipulationRisk === 'LOW' ? 0 : hyperion.manipulationRisk === 'MEDIUM' ? 1 : 2) < (terminator.manipulationRisk === 'LOW' ? 0 : terminator.manipulationRisk === 'MEDIUM' ? 1 : 2) ? 'h' : 't' },
    { label: 'Est. Sell',          h: hyperion.estimatedSellDays >= 99 ? '—' : `${hyperion.estimatedSellDays.toFixed(1)}d`, t: terminator.estimatedSellDays >= 99 ? '—' : `${terminator.estimatedSellDays.toFixed(1)}d`, better: hyperion.estimatedSellDays < terminator.estimatedSellDays ? 'h' : 't' },
  ]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '148px 1fr 1fr', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '8px 10px', fontSize: '0.56rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Metric</div>
        <div style={{ padding: '8px 10px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--blue)', textAlign: 'center' }}>HYPERION</div>
        <div style={{ padding: '8px 10px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--purple)', textAlign: 'center' }}>TERMINATOR</div>
      </div>
      {rows.map((row, i) => (
        <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '148px 1fr 1fr', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ padding: '7px 10px', fontSize: '0.61rem', fontWeight: 600, color: 'var(--muted)' }}>{row.label}</div>
          <div className="mono" style={{ padding: '7px 10px', fontSize: '0.68rem', fontWeight: 700, color: row.better === 'h' ? 'var(--green)' : 'var(--text2)', textAlign: 'center', background: row.better === 'h' ? 'rgba(0,255,135,0.04)' : 'transparent' }}>
            {row.h}{row.better === 'h' && <span style={{ marginLeft: 3, fontSize: '0.5rem' }}>✓</span>}
          </div>
          <div className="mono" style={{ padding: '7px 10px', fontSize: '0.68rem', fontWeight: 700, color: row.better === 't' ? 'var(--green)' : 'var(--text2)', textAlign: 'center', background: row.better === 't' ? 'rgba(0,255,135,0.04)' : 'transparent' }}>
            {row.t}{row.better === 't' && <span style={{ marginLeft: 3, fontSize: '0.5rem' }}>✓</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 14 }}>
      <div style={{ height: 4, background: 'var(--surface3)', borderRadius: 2, marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <div className="skeleton" style={{ width: 44, height: 44, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 13, width: '50%', marginBottom: 7 }} />
          <div className="skeleton" style={{ height: 9, width: '38%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 60, borderRadius: 4, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 36, borderRadius: 4, marginBottom: 10 }} />
      {[0,1,2,3].map(i => (
        <div key={i} style={{ display: 'flex', gap: 7, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <div className="skeleton" style={{ width: 26, height: 26, borderRadius: 3, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 9, width: '55%', marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 7, width: '32%' }} />
          </div>
          <div className="skeleton" style={{ height: 10, width: 44 }} />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function CraftWeaponsPage() {
  const [hyperion, setHyperion]       = useState<WeaponFlip | null>(null)
  const [terminator, setTerminator]   = useState<WeaponFlip | null>(null)
  const [aiSummary, setAiSummary]     = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [manualRefresh, setManualRefresh] = useState(0)

  // Per-weapon exec mode
  const [execModeH, setExecModeH]   = useState<ExecMode>('INSTA_BUY')
  const [execModeT, setExecModeT]   = useState<ExecMode>('INSTA_BUY')

  // Per-weapon OTC
  const [otcH, setOtcH] = useState<OtcMap>({})
  const [otcT, setOtcT] = useState<OtcMap>({})

  // Hyperion variant selection (0=clean, 1=1-scroll, 2=2-scroll, 3=fully scrolled)
  const [variantH, setVariantH]           = useState(0)
  const [scrollsIncludedH, setScrollsH]   = useState(false)

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

  const bestWeapon = useMemo(() => {
    if (!hyperion || !terminator) return null
    return hyperion.profitNoScrolls > terminator.profitNoScrolls ? 'Hyperion' : 'Terminator'
  }, [hyperion, terminator])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">
        {/* Page header */}
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" style={{ background: 'var(--blue)' }} />Live</span>
                : <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
              <button onClick={() => { setLoading(true); setManualRefresh(n => n + 1) }}
                style={{ marginLeft: 4, padding: '2px 8px', fontSize: '0.63rem', fontWeight: 700, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text2)', cursor: 'pointer', letterSpacing: '0.06em' }}>
                REFRESH
              </button>
            </div>
            <h1 className="page-title">Weapon Craft Flips</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Live crafting flip terminal · Hyperion &amp; Terminator · Bazaar buy/sell orders · OTC calculator · 2% AH tax
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

        {/* How it works */}
        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--blue)' }}>Pricing accuracy</div>
          <strong style={{ color: 'var(--text)' }}>BZ items</strong> use Hypixel Bazaar API directly —
          {' '}<span style={{ color: 'var(--red)' }}>insta-buy</span> = lowest ask (sell_summary[0]),
          {' '}<span style={{ color: 'var(--green)' }}>buy order</span> = highest bid (buy_summary[0]).
          {' '}<strong style={{ color: 'var(--text)' }}>AH items</strong> use Coflnet /bin endpoint (LBIN).
          {' '}Scrolled Hyperion LBIN = clean LBIN + scroll market prices (no dedicated API endpoint exists — this is the standard trader methodology).
        </div>

        {/* AI panel */}
        {aiSummary && (
          <div className="ai-panel">
            <div className="ai-panel-label">✦ AI Analysis — Weapon Craft Flips</div>
            <div className="ai-panel-body">{aiSummary}</div>
          </div>
        )}

        {/* Comparison */}
        {hyperion && terminator && !loading && (
          <ComparisonPanel hyperion={hyperion} terminator={terminator} execModeH={execModeH} execModeT={execModeT} otcH={otcH} otcT={otcT} />
        )}

        {/* ─── HYPERION SECTIONS ─── */}
        {!loading && hyperion && (
          <>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '4px 0 8px', paddingLeft: 2 }}>
              ── HYPERION ──────────────────────────────────────
            </div>
            <VariantPanel weapon={hyperion} selectedVariant={variantH} setSelectedVariant={setVariantH} execMode={execModeH} scrollsIncluded={scrollsIncludedH} setScrollsIncluded={setScrollsH} accentColor="var(--blue)" />
            <ExecModePanel weapon={hyperion} mode={execModeH} setMode={setExecModeH} scrollsIncluded={scrollsIncludedH} accentColor="var(--blue)" />
            <ProfitEngine weapon={hyperion} execMode={execModeH} otc={otcH} selectedVariant={variantH} scrollsIncluded={scrollsIncludedH} accentColor="var(--blue)" />
            <OtcPanel weapon={hyperion} accentColor="var(--blue)" scrollsIncluded={scrollsIncludedH} selectedVariant={variantH} execMode={execModeH} otc={otcH} setOtc={setOtcH} />
          </>
        )}

        {/* ─── TERMINATOR SECTIONS ─── */}
        {!loading && terminator && (
          <>
            <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '8px 0 8px', paddingLeft: 2 }}>
              ── TERMINATOR ─────────────────────────────────────
            </div>
            <ExecModePanel weapon={terminator} mode={execModeT} setMode={setExecModeT} scrollsIncluded={false} accentColor="var(--purple)" />
            <ProfitEngine weapon={terminator} execMode={execModeT} otc={otcT} selectedVariant={0} scrollsIncluded={false} accentColor="var(--purple)" />
            <OtcPanel weapon={terminator} accentColor="var(--purple)" scrollsIncluded={false} selectedVariant={0} execMode={execModeT} otc={otcT} setOtc={setOtcT} />
          </>
        )}

        {/* Weapon cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12, marginTop: 8 }}>
          {loading && <><SkeletonCard /><SkeletonCard /></>}
          {!loading && hyperion && <WeaponCard weapon={hyperion} accentColor="var(--blue)" execMode={execModeH} otc={otcH} selectedVariant={variantH} scrollsIncluded={scrollsIncludedH} />}
          {!loading && terminator && <WeaponCard weapon={terminator} accentColor="var(--purple)" execMode={execModeT} otc={otcT} selectedVariant={0} scrollsIncluded={false} />}
        </div>
      </main>
      <RefreshTimer intervalMs={3 * 60 * 1000} lastUpdated={lastUpdated} />
    </div>
  )
}
