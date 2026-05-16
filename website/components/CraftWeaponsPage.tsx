'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchCraftWeapons, WeaponFlip, CraftIngredient, ScrollAddon, PricePoint, IngredientPricing,
} from '@/lib/craftWeapons'
import Sidebar from '@/components/Sidebar'
import RefreshTimer from '@/components/RefreshTimer'

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (!isFinite(n)) return '—'
  const s = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`
  return `${s}${a.toLocaleString()}`
}
function fmtS(n: number): string {
  if (!isFinite(n)) return '—'
  const s = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`
  return `${s}${a.toFixed(0)}`
}
function parseCoin(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/,/g, '')
  if (!s) return NaN
  const mul = s.endsWith('b') ? 1e9 : s.endsWith('m') ? 1e6 : s.endsWith('k') ? 1e3 : 1
  return parseFloat(s.replace(/[kmb]$/, '')) * mul
}

// ─── Execution mode ───────────────────────────────────────────────────────────
//
// instaBuy  = sell_summary[0] = lowest ask = what you pay clicking "Buy Now"
//             → immediate, costs MORE
// buyOrder  = quick_status.sellPrice = weighted avg sell offer
//             → patient, costs LESS (you place a buy order and wait)

type ExecMode = 'INSTA_BUY' | 'BUY_ORDERS' | 'MIXED'
const MIXED_THRESHOLD = 1_000_000

function execCostPerUnit(pricing: IngredientPricing, qty: number, mode: ExecMode): number {
  if (pricing.source === 'AH') return pricing.instaBuy
  if (mode === 'INSTA_BUY')   return pricing.instaBuy
  if (mode === 'BUY_ORDERS')  return pricing.buyOrder
  // MIXED: use buy order only where total saving >= threshold
  const saving = (pricing.instaBuy - pricing.buyOrder) * qty
  return saving >= MIXED_THRESHOLD ? pricing.buyOrder : pricing.instaBuy
}

// ─── OTC ─────────────────────────────────────────────────────────────────────

interface OtcEntry { useOtc: boolean; rawInput: string }
type OtcMap = Record<string, OtcEntry>

function resolveUnitPrice(id: string, marketUnit: number, otc: OtcMap): number {
  const e = otc[id]
  if (!e?.useOtc || !e.rawInput) return marketUnit
  const p = parseCoin(e.rawInput)
  return isFinite(p) && p > 0 ? p : marketUnit
}

// ─── Micro components ─────────────────────────────────────────────────────────

function ItemIcon({ id, size = 36 }: { id: string; size?: number }) {
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

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 99,
      fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em',
      background: `${color}18`, color, border: `1px solid ${color}30`,
    }}>{label}</span>
  )
}

function Sparkline({ data, color = '#4d94ff', w = 64, h = 20 }: { data: PricePoint[]; color?: string; w?: number; h?: number }) {
  const vals = data.map(d => d.avg).filter(v => v > 0)
  if (vals.length < 2) return <div style={{ width: w, height: h }} />
  const mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 1
  const pts = vals.map((v, i) =>
    `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - mn) / range) * (h - 3) - 1.5).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0, opacity: 0.8 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

const RISK_COLOR: Record<string, string> = { LOW: '#00e5a0', MEDIUM: '#f5a623', HIGH: '#ff5566' }

// ─── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, badge, accent = '#4d94ff', defaultOpen = false, children }: {
  title: string; badge?: string; accent?: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: open ? '12px 12px 0 0' : 12,
          padding: '14px 20px', cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <div style={{ width: 3, height: 18, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <span style={{ flex: 1, fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)', textAlign: 'left' }}>{title}</span>
        {badge && <Tag label={badge} color={accent} />}
        <span style={{ color: 'var(--muted)', fontSize: '0.7rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Profit Hero ──────────────────────────────────────────────────────────────

function ProfitHero({ profit, cost, revenue, accent, label = 'Net Profit' }: {
  profit: number; cost: number; revenue: number; accent: string; label?: string
}) {
  const pos = profit >= 0
  const margin = cost > 0 ? (profit / cost) * 100 : 0
  return (
    <div style={{
      background: pos ? 'rgba(0,229,160,0.06)' : 'rgba(255,85,102,0.06)',
      border: `1px solid ${pos ? 'rgba(0,229,160,0.2)' : 'rgba(255,85,102,0.2)'}`,
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{label}</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.75rem', fontWeight: 800, color: pos ? '#00e5a0' : '#ff5566', lineHeight: 1 }}>
            {pos ? '+' : ''}{fmt(profit)}
          </div>
          <div style={{ marginTop: 6, fontSize: '0.72rem', color: 'var(--text2)' }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: pos ? '#00e5a0' : '#ff5566', fontWeight: 700 }}>
              {pos ? '+' : ''}{margin.toFixed(1)}%
            </span>
            {' '}margin
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Craft Cost</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem', fontWeight: 700, color: '#ff5566' }}>{fmt(cost)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Revenue</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem', fontWeight: 700, color: accent }}>{fmt(revenue)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Execution Mode Selector ──────────────────────────────────────────────────

function ExecSelector({ weapon, mode, setMode, scrollsIncluded, accent }: {
  weapon: WeaponFlip; mode: ExecMode; setMode: (m: ExecMode) => void
  scrollsIncluded: boolean; accent: string
}) {
  const items = [
    ...weapon.ingredients,
    ...(scrollsIncluded ? weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })) : []),
  ]
  const netRev = weapon.cleanLbin * (1 - weapon.ahTax)
  const costs = {
    INSTA_BUY:  items.reduce((a, x) => a + x.pricing.instaBuy * x.qty, 0),
    BUY_ORDERS: items.reduce((a, x) => a + x.pricing.buyOrder * x.qty, 0),
    MIXED:      items.reduce((a, x) => a + execCostPerUnit(x.pricing, x.qty, 'MIXED') * x.qty, 0),
  }
  const profits = {
    INSTA_BUY:  netRev - costs.INSTA_BUY,
    BUY_ORDERS: netRev - costs.BUY_ORDERS,
    MIXED:      netRev - costs.MIXED,
  }
  const bestKey = (Object.keys(profits) as ExecMode[]).reduce((a, b) => profits[a] > profits[b] ? a : b)
  const boSaving = costs.INSTA_BUY - costs.BUY_ORDERS

  const cards: { key: ExecMode; label: string; desc: string }[] = [
    { key: 'INSTA_BUY',  label: 'Insta Buy',  desc: 'Pay lowest ask instantly — no waiting' },
    { key: 'BUY_ORDERS', label: 'Buy Orders',  desc: 'Place order at avg sell price — wait for fill' },
    { key: 'MIXED',      label: 'Smart Mix',   desc: `Use orders where save ≥ ${fmtS(MIXED_THRESHOLD)}` },
  ]

  const bzItems = weapon.ingredients.filter(x => x.source === 'BZ')

  return (
    <div style={{ padding: '20px' }}>
      {/* Mode cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {cards.map(c => {
          const active = mode === c.key
          const isBest = c.key === bestKey
          const pnl = profits[c.key]
          return (
            <button key={c.key} onClick={() => setMode(c.key)} style={{
              background: active ? `${accent}12` : 'var(--surface2)',
              border: `1.5px solid ${active ? accent : isBest ? 'rgba(0,229,160,0.25)' : 'var(--border)'}`,
              borderRadius: 10, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: active ? accent : 'var(--text)' }}>{c.label}</span>
                {isBest && <span style={{ fontSize: '0.6rem', color: '#00e5a0', fontWeight: 800, letterSpacing: '0.05em' }}>BEST</span>}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.05rem', fontWeight: 800, color: pnl >= 0 ? '#00e5a0' : '#ff5566', marginBottom: 6 }}>
                {pnl >= 0 ? '+' : ''}{fmtS(pnl)}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text2)', lineHeight: 1.4 }}>{c.desc}</div>
            </button>
          )
        })}
      </div>

      {/* Buy order info banner */}
      {boSaving > 500_000 && (
        <div style={{
          background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.18)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#00e5a0', marginBottom: 2 }}>
              Buy Orders save <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmtS(boSaving)}</span>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text2)' }}>
              Place buy orders at the weighted avg sell price — sellers fill you for less than insta-buy
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem', color: '#00e5a0', fontWeight: 700 }}>
              {costs.INSTA_BUY > 0 ? ((boSaving / costs.INSTA_BUY) * 100).toFixed(1) : '0'}% cheaper
            </div>
          </div>
        </div>
      )}

      {/* BZ spreads table */}
      {bzItems.length > 0 && (
        <div>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Bazaar Spreads — Insta Buy vs Buy Order
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 70px', gap: 8, padding: '6px 12px' }}>
              {['Item', 'Insta Buy', 'Buy Order', 'Save/unit', 'Fill Time'].map(h => (
                <div key={h} style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {bzItems.map(item => {
              const saving = item.pricing.instaBuy - item.pricing.buyOrder
              const useOrder = mode === 'BUY_ORDERS' || (mode === 'MIXED' && saving * item.qty >= MIXED_THRESHOLD)
              return (
                <div key={item.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 70px', gap: 8,
                  padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>{item.name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text2)', marginTop: 1 }}>×{item.qty}</div>
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', fontWeight: 700, color: useOrder ? 'var(--text2)' : '#ff5566' }}>{fmtS(item.pricing.instaBuy)}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', fontWeight: 700, color: '#00e5a0' }}>{fmtS(item.pricing.buyOrder)}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', fontWeight: 700, color: saving > 0 ? '#00e5a0' : 'var(--muted)' }}>
                    {saving > 100 ? `-${fmtS(saving)}` : '—'}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text2)' }}>{item.pricing.fillTimeEst}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Variant Picker ───────────────────────────────────────────────────────────

function VariantPicker({ weapon, selected, setSelected, execMode, setScrolls, accent }: {
  weapon: WeaponFlip; selected: number; setSelected: (i: number) => void
  execMode: ExecMode; setScrolls: (v: boolean) => void; accent: string
}) {
  const baseCost = weapon.ingredients.reduce((a, x) => a + execCostPerUnit(x.pricing, x.qty, execMode) * x.qty, 0)
  return (
    <div style={{ padding: '20px' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
        All Hyperion variants share one AH listing tag — no scroll-filter API exists. Scrolled LBIN is estimated as <strong style={{ color: 'var(--text)' }}>clean LBIN + sum of scroll market prices</strong>, the standard trader methodology.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
        {weapon.variants.map((v, i) => {
          const scrollCost = weapon.scrollAddons
            .filter(s => v.scrollIds.includes(s.id))
            .reduce((a, s) => a + execCostPerUnit(s.pricing, 1, execMode), 0)
          const total  = baseCost + scrollCost
          const net    = v.estimatedLbin * (1 - weapon.ahTax)
          const profit = net - total
          const pos    = profit >= 0
          const active = selected === i
          return (
            <button key={v.label} onClick={() => { setSelected(i); setScrolls(v.scrollCount > 0) }} style={{
              background:   active ? `${accent}10` : 'var(--surface2)',
              border:       `1.5px solid ${active ? accent : 'var(--border)'}`,
              borderRadius: 10, padding: '16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: active ? accent : 'var(--text)', marginBottom: 8 }}>{v.label}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.1rem', fontWeight: 800, color: pos ? '#00e5a0' : '#ff5566', marginBottom: 6 }}>
                {pos ? '+' : ''}{fmtS(profit)}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text2)' }}>
                LBIN <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{fmtS(v.estimatedLbin)}</span>
              </div>
              {v.scrollCount > 0 && (
                <div style={{ marginTop: 6, fontSize: '0.65rem', color: '#a78bfa' }}>+{v.scrollCount} scroll{v.scrollCount > 1 ? 's' : ''}</div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Profit Engine ────────────────────────────────────────────────────────────

function ProfitEngine({ weapon, execMode, otc, variantIdx, scrolls, accent }: {
  weapon: WeaponFlip; execMode: ExecMode; otc: OtcMap
  variantIdx: number; scrolls: boolean; accent: string
}) {
  const variant     = weapon.variants[variantIdx] ?? weapon.variants[0]
  const scrollItems = scrolls ? weapon.scrollAddons : []

  const instaC = weapon.ingredients.reduce((a, x) => a + x.pricing.instaBuy * x.qty, 0)
               + scrollItems.reduce((a, s) => a + s.pricing.instaBuy, 0)
  const orderC = weapon.ingredients.reduce((a, x) => a + x.pricing.buyOrder * x.qty, 0)
               + scrollItems.reduce((a, s) => a + s.pricing.buyOrder, 0)
  const otcC   = [...weapon.ingredients, ...scrollItems.map(s => ({ ...s, qty: 1 }))].reduce((acc, x) => {
    const base = execCostPerUnit(x.pricing, x.qty, execMode)
    return acc + resolveUnitPrice(x.id, base, otc) * x.qty
  }, 0)

  const netRev  = variant.estimatedLbin * (1 - weapon.ahTax)
  const pInsta  = netRev - instaC
  const pOrder  = netRev - orderC
  const pOtc    = netRev - otcC
  const best    = Math.max(pInsta, pOrder, pOtc)
  const bestLbl = best === pOtc ? 'OTC Direct' : best === pOrder ? 'Buy Orders' : 'Insta Buy'

  const rows = [
    { label: 'Est. LBIN',                 val: fmt(variant.estimatedLbin),                                                              color: 'var(--text)' },
    { label: 'Revenue (after 2% tax)',    val: fmt(netRev),                                                                             color: accent },
    { label: 'Cost — Insta Buy',          val: fmt(instaC),                                                                             color: '#ff5566' },
    { label: 'Cost — Buy Orders',         val: fmt(orderC),                                                                             color: '#f5a623' },
    { label: 'Buy Order Saving',          val: `−${fmtS(instaC - orderC)}`,                                                            color: '#00e5a0' },
    { label: 'Profit — Insta Buy',        val: `${pInsta >= 0 ? '+' : ''}${fmt(pInsta)}`,                                              color: pInsta >= 0 ? '#00e5a0' : '#ff5566' },
    { label: 'Profit — Buy Orders',       val: `${pOrder >= 0 ? '+' : ''}${fmt(pOrder)}`,                                              color: pOrder >= 0 ? '#00e5a0' : '#ff5566' },
    { label: 'Profit — OTC',              val: `${pOtc >= 0 ? '+' : ''}${fmt(pOtc)}`,                                                  color: pOtc >= 0 ? '#00e5a0' : '#ff5566' },
    { label: 'Manipulation Risk',         val: weapon.manipulationRisk,                                                                  color: RISK_COLOR[weapon.manipulationRisk] },
    { label: 'Est. Sell Time',            val: weapon.estimatedSellDays >= 99 ? 'Unknown' : weapon.estimatedSellDays < 1 ? `${(weapon.estimatedSellDays * 24).toFixed(0)}h` : `${weapon.estimatedSellDays.toFixed(1)}d`, color: 'var(--text)' },
  ]

  return (
    <div style={{ padding: '20px' }}>
      {/* Verdict */}
      <div style={{
        background: best >= 0 ? 'rgba(0,229,160,0.06)' : 'rgba(255,85,102,0.06)',
        border: `1px solid ${best >= 0 ? 'rgba(0,229,160,0.2)' : 'rgba(255,85,102,0.2)'}`,
        borderRadius: 12, padding: '16px 18px', marginBottom: 20,
      }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          Best Strategy: {bestLbl}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.4rem', fontWeight: 800, color: best >= 0 ? '#00e5a0' : '#ff5566', marginBottom: 8 }}>
          {best >= 0 ? '+' : ''}{fmt(best)}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text2)' }}>
          {best < 0
            ? `${weapon.name} is currently unprofitable — spread is too tight`
            : bestLbl === 'OTC Direct'
              ? `Direct player trade saves ${fmtS(instaC - otcC)} vs AH insta-buy`
              : bestLbl === 'Buy Orders'
                ? `Placing buy orders saves ${fmtS(instaC - orderC)} vs buying instantly`
                : 'Insta-buy is optimal — spread too small to justify waiting'}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text2)' }}>{r.label}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', fontWeight: 700, color: r.color }}>{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── OTC Row ──────────────────────────────────────────────────────────────────

function OtcRow({ id, name, qty, marketUnit, source, history, execMode, entry, onChange, netRev, othersCost, accent }: {
  id: string; name: string; qty: number; marketUnit: number
  source: 'AH' | 'BZ'; history: PricePoint[]; execMode: ExecMode
  entry: OtcEntry; onChange: (e: OtcEntry) => void
  netRev: number; othersCost: number; accent: string
}) {
  const ref     = useRef<HTMLInputElement>(null)
  const parsed  = entry.useOtc ? parseCoin(entry.rawInput) : NaN
  const eff     = entry.useOtc && isFinite(parsed) && parsed > 0 ? parsed : marketUnit
  const disc    = marketUnit > 0 ? ((marketUnit - eff) / marketUnit) * 100 : 0
  const saved   = (marketUnit - eff) * qty

  const breakeven  = qty > 0 ? (netRev - othersCost) / qty : 0
  const safeBuy    = breakeven * 0.90
  const aggressive = breakeven * 0.95
  const viable     = isFinite(parsed) && parsed > 0 ? parsed * qty <= netRev - othersCost : null

  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: entry.useOtc && source === 'AH' ? 14 : 0 }}>
        <div style={{ width: 34, height: 34, background: 'var(--surface2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)' }}>
          <ItemIcon id={id} size={28} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{name}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text2)', marginTop: 2 }}>
            ×{qty} ·{' '}
            <span style={{ color: source === 'AH' ? '#f5a623' : '#4d94ff' }}>{source}</span>
            {source === 'BZ' && <span style={{ marginLeft: 6, color: 'var(--muted)', fontStyle: 'italic' }}>BZ only — no OTC</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: 2 }}>Market</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{fmtS(marketUnit)}</div>
          </div>
          <Sparkline data={history} color="var(--text2)" w={52} h={18} />
          {source === 'AH' && (
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
              <button onClick={() => onChange({ ...entry, useOtc: false })} style={{
                padding: '6px 12px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', border: 'none',
                background: !entry.useOtc ? '#f5a623' : 'var(--surface)', color: !entry.useOtc ? '#000' : 'var(--text2)', transition: 'all 0.15s',
              }}>AH</button>
              <button onClick={() => { onChange({ ...entry, useOtc: true }); setTimeout(() => ref.current?.focus(), 40) }} style={{
                padding: '6px 12px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', border: 'none', borderLeft: '1px solid var(--border)',
                background: entry.useOtc ? accent : 'var(--surface)', color: entry.useOtc ? '#000' : 'var(--text2)', transition: 'all 0.15s',
              }}>OTC</button>
            </div>
          )}
        </div>
      </div>

      {entry.useOtc && source === 'AH' && (
        <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', border: `1px solid ${accent}20` }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text2)', flexShrink: 0 }}>OTC price / unit</label>
            <input ref={ref} value={entry.rawInput}
              onChange={e => onChange({ ...entry, rawInput: e.target.value })}
              placeholder={`e.g. ${fmtS(marketUnit * 0.95)}`}
              className="filter-input mono"
              style={{ flex: 1, fontSize: '0.9rem', fontWeight: 700, padding: '7px 12px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Safe',       val: safeBuy,    color: '#00e5a0' },
              { label: 'Aggressive', val: aggressive,  color: '#f5a623' },
              { label: 'Breakeven',  val: breakeven,   color: '#ff5566' },
            ].map(({ label, val, color }) => (
              <button key={label} onClick={() => onChange({ ...entry, rawInput: val > 0 ? `${(val / 1e6).toFixed(2)}m` : '' })}
                style={{ background: 'var(--surface)', border: `1px solid ${color}25`, borderRadius: 8, padding: '8px 6px', cursor: 'pointer', textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', fontWeight: 700, color }}>{val > 0 ? fmtS(val) : '—'}</div>
              </button>
            ))}
          </div>

          {isFinite(parsed) && parsed > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Discount', val: `${disc > 0 ? '-' : '+'}${Math.abs(disc).toFixed(1)}%`, color: disc > 0 ? '#00e5a0' : '#ff5566' },
                { label: 'Saved',    val: `${saved > 0 ? '+' : ''}${fmtS(saved)}`,               color: saved > 0 ? '#00e5a0' : '#ff5566' },
                { label: 'Viable',   val: viable === true ? 'YES ✓' : viable === false ? 'NO ✗' : '—', color: viable === true ? '#00e5a0' : viable === false ? '#ff5566' : 'var(--muted)' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: 'var(--surface)', borderRadius: 8, padding: '8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', fontWeight: 800, color }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OtcPanel({ weapon, accent, scrolls, variantIdx, execMode, otc, setOtc }: {
  weapon: WeaponFlip; accent: string; scrolls: boolean
  variantIdx: number; execMode: ExecMode
  otc: OtcMap; setOtc: (fn: (prev: OtcMap) => OtcMap) => void
}) {
  const variant  = weapon.variants[variantIdx] ?? weapon.variants[0]
  const netRev   = variant.estimatedLbin * (1 - weapon.ahTax)
  const allItems = useMemo(() => [
    ...weapon.ingredients,
    ...(scrolls ? weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })) : []),
  ], [weapon, scrolls])

  const mktCost  = allItems.reduce((a, x) => a + execCostPerUnit(x.pricing, x.qty, execMode) * x.qty, 0)
  const otcCost  = allItems.reduce((a, x) => a + resolveUnitPrice(x.id, execCostPerUnit(x.pricing, x.qty, execMode), otc) * x.qty, 0)
  const mktProfit = netRev - mktCost
  const otcProfit = netRev - otcCost
  const saved    = mktCost - otcCost
  const anyActive = allItems.some(x => otc[x.id]?.useOtc)

  const alerts = allItems.filter(x => x.source === 'AH').flatMap(item => {
    const others = allItems.filter(x => x.id !== item.id)
      .reduce((a, x) => a + resolveUnitPrice(x.id, execCostPerUnit(x.pricing, x.qty, execMode), otc) * x.qty, 0)
    const be = item.qty > 0 ? (netRev - others) / item.qty : 0
    const lbProfit = netRev - (mktCost - execCostPerUnit(item.pricing, item.qty, execMode) * item.qty + item.pricing.instaBuy * 0.95 * item.qty)
    if (mktProfit <= 0 && lbProfit > 0) return [{ text: `Profitable if ${item.name} ≤ ${fmtS(be)}/unit`, color: '#f5a623' }]
    if (lbProfit > mktProfit * 1.5 && mktProfit > 0) return [{ text: `Strong OTC opportunity on ${item.name}`, color: '#00e5a0' }]
    return []
  })

  const scenario = !anyActive ? 'No overrides — using market prices'
    : otcProfit > 0 && mktProfit <= 0 ? 'PROFITABLE ONLY VIA LOWBALL'
    : otcProfit > mktProfit * 1.4    ? 'HIGH-MARGIN OTC OPPORTUNITY'
    : otcProfit > mktProfit          ? 'OTC improves margin'
    : 'Marginal or no OTC benefit'

  const scenColor = !anyActive ? 'var(--muted)'
    : otcProfit > 0 && mktProfit <= 0 ? '#f5a623'
    : otcProfit > mktProfit           ? '#00e5a0'
    : 'var(--text2)'

  const badge = anyActive ? `save ${fmtS(saved)}` : undefined

  return (
    <Section title={`OTC / Direct Trade — ${weapon.name}`} accent={accent} badge={badge}>
      {anyActive && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '14px 20px', padding: '16px 20px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
          {[
            { label: 'OTC Cost',      val: fmt(otcCost),   color: '#ff5566' },
            { label: 'OTC Profit',    val: `${otcProfit >= 0 ? '+' : ''}${fmt(otcProfit)}`, color: otcProfit >= 0 ? '#00e5a0' : '#ff5566' },
            { label: 'Total Saved',   val: `+${fmtS(saved)}`,   color: '#00e5a0' },
            { label: 'Extra vs Mkt',  val: `${otcProfit - mktProfit >= 0 ? '+' : ''}${fmtS(otcProfit - mktProfit)}`, color: '#00e5a0' },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.95rem', fontWeight: 800, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: scenColor, flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: scenColor }}>{scenario}</span>
        {anyActive && <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text2)' }}>market base: <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{fmt(mktProfit)}</span></span>}
      </div>

      {alerts.map((a, i) => (
        <div key={i} style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', fontSize: '0.78rem', color: a.color, background: `${a.color}08`, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>▶</span>{a.text}
        </div>
      ))}

      {allItems.map(item => {
        const mktUnit   = execCostPerUnit(item.pricing, item.qty, execMode)
        const othersCost = allItems.filter(x => x.id !== item.id)
          .reduce((a, x) => a + resolveUnitPrice(x.id, execCostPerUnit(x.pricing, x.qty, execMode), otc) * x.qty, 0)
        return (
          <OtcRow key={item.id}
            id={item.id} name={item.name} qty={item.qty}
            marketUnit={mktUnit} source={item.source}
            history={item.priceHistory}
            execMode={execMode}
            entry={otc[item.id] ?? { useOtc: false, rawInput: '' }}
            onChange={e => setOtc(prev => ({ ...prev, [item.id]: e }))}
            netRev={netRev} othersCost={othersCost} accent={accent}
          />
        )
      })}

      <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text2)' }}>Toggle AH/OTC per ingredient independently</span>
        <button onClick={() => setOtc(() => ({}))} style={{ padding: '5px 12px', fontSize: '0.68rem', fontWeight: 700, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text2)', cursor: 'pointer' }}>
          Reset
        </button>
      </div>
    </Section>
  )
}

// ─── Ingredient Card ──────────────────────────────────────────────────────────

function IngCard({ item, execMode, otc }: { item: CraftIngredient | (ScrollAddon & { qty: number; priceHistory: PricePoint[]; volatility: number }); execMode: ExecMode; otc: OtcMap }) {
  const base   = execCostPerUnit(item.pricing, item.qty, execMode)
  const eff    = resolveUnitPrice(item.id, base, otc)
  const total  = eff * item.qty
  const isOtc  = eff < base - 1
  const isOrder = !isOtc && item.source === 'BZ' && execMode !== 'INSTA_BUY' && eff < item.pricing.instaBuy - 1
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ width: 30, height: 30, background: 'var(--surface)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
        <ItemIcon id={item.id} size={26} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {item.name}
          {isOtc   && <Tag label="OTC"   color="#00e5a0" />}
          {isOrder && <Tag label="ORDER" color="#4d94ff" />}
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--text2)', marginTop: 2 }}>
          ×{item.qty} · <span style={{ color: item.source === 'AH' ? '#f5a623' : '#4d94ff' }}>{item.source}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem', fontWeight: 700, color: isOtc ? '#00e5a0' : '#ff5566' }}>{fmtS(total)}</div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text2)', marginTop: 1 }}>{fmtS(eff)} ea</div>
      </div>
      <Sparkline data={item.priceHistory} w={48} h={18} />
    </div>
  )
}

// ─── Weapon Overview Card ─────────────────────────────────────────────────────

function WeaponCard({ weapon, accent, execMode, otc, variantIdx, scrolls }: {
  weapon: WeaponFlip; accent: string; execMode: ExecMode; otc: OtcMap
  variantIdx: number; scrolls: boolean
}) {
  const variant = weapon.variants[variantIdx] ?? weapon.variants[0]
  const allItems = [
    ...weapon.ingredients,
    ...(scrolls ? weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })) : []),
  ]
  const effectiveCost = allItems.reduce((a, x) => a + resolveUnitPrice(x.id, execCostPerUnit(x.pricing, x.qty, execMode), otc) * x.qty, 0)
  const marketCost    = allItems.reduce((a, x) => a + execCostPerUnit(x.pricing, x.qty, execMode) * x.qty, 0)
  const netRev        = variant.estimatedLbin * (1 - weapon.ahTax)
  const profit        = netRev - effectiveCost
  const otcSaving     = marketCost - effectiveCost
  const anyOtc        = allItems.some(x => otc[x.id]?.useOtc && parseCoin(otc[x.id]?.rawInput ?? '') > 0)

  return (
    <div className="flip-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-accent" style={{ background: `linear-gradient(90deg, ${accent}, #a78bfa)` }} />

      <div style={{ padding: '18px 20px 14px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, background: 'var(--surface2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: `1px solid ${accent}25` }}>
            <ItemIcon id={weapon.id} size={40} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{weapon.name}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: 3 }}>
              {variant.label} · LBIN{' '}
              <span style={{ fontFamily: 'JetBrains Mono, monospace', color: accent, fontWeight: 700 }}>{fmtS(variant.estimatedLbin)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            <Tag label={`${profit >= 0 ? '+' : ''}${(effectiveCost > 0 ? (profit / effectiveCost) * 100 : 0).toFixed(1)}%`} color={profit >= 0 ? '#00e5a0' : '#ff5566'} />
            <Tag label={`${weapon.manipulationRisk} RISK`} color={RISK_COLOR[weapon.manipulationRisk]} />
          </div>
        </div>

        <ProfitHero profit={profit} cost={effectiveCost} revenue={netRev} accent={accent} />
        {anyOtc && otcSaving > 0 && (
          <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#00e5a0', fontWeight: 600 }}>
            OTC saves <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 800 }}>+{fmtS(otcSaving)}</span> vs market
          </div>
        )}
      </div>

      {/* 24h chart */}
      {weapon.priceHistory.length > 0 && (
        <div style={{ padding: '0 20px 14px' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>24h Price</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 36 }}>
            {weapon.priceHistory.map((p, i) => {
              const vals = weapon.priceHistory.map(x => x.avg).filter(v => v > 0)
              const mx = Math.max(...vals), mn = Math.min(...vals)
              const h = Math.max(3, ((p.avg - mn) / (mx - mn || 1)) * 36)
              return <div key={i} style={{ flex: 1, height: h, background: accent, borderRadius: '2px 2px 0 0', opacity: 0.4 + (i / vals.length) * 0.6 }} />
            })}
          </div>
        </div>
      )}

      <div style={{ width: '100%', height: 1, background: 'var(--border)' }} />

      {/* Ingredients */}
      <div style={{ padding: '14px 20px' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Ingredients</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allItems.map(item => <IngCard key={item.id} item={item} execMode={execMode} otc={otc} />)}
        </div>
      </div>

      <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', fontSize: '0.62rem', color: 'var(--muted)' }}>
        Updated {new Date(weapon.lastUpdated).toLocaleTimeString()}
      </div>
    </div>
  )
}

// ─── Compare Table ────────────────────────────────────────────────────────────

function CompareTable({ hyperion, terminator, execH, execT, otcH, otcT }: {
  hyperion: WeaponFlip; terminator: WeaponFlip
  execH: ExecMode; execT: ExecMode; otcH: OtcMap; otcT: OtcMap
}) {
  const calc = (w: WeaponFlip, mode: ExecMode, otc: OtcMap) => {
    const cost   = w.ingredients.reduce((a, x) => a + resolveUnitPrice(x.id, execCostPerUnit(x.pricing, x.qty, mode), otc) * x.qty, 0)
    const net    = w.cleanLbin * (1 - w.ahTax)
    const profit = net - cost
    const margin = cost > 0 ? (profit / cost) * 100 : 0
    const boSave = w.ingredients.filter(x => x.source === 'BZ').reduce((a, x) => a + (x.pricing.instaBuy - x.pricing.buyOrder) * x.qty, 0)
    return { profit, margin, boSave }
  }
  const h = calc(hyperion, execH, otcH)
  const t = calc(terminator, execT, otcT)

  const rows: Array<{ label: string; h: string; t: string; hColor?: string; tColor?: string; winner: 'h' | 't' | 'tie' }> = [
    { label: 'Clean LBIN',       h: fmt(hyperion.cleanLbin),       t: fmt(terminator.cleanLbin),       winner: hyperion.cleanLbin > terminator.cleanLbin ? 'h' : 't' },
    { label: 'Craft Cost',       h: fmt(hyperion.craftCost),       t: fmt(terminator.craftCost),       winner: hyperion.craftCost < terminator.craftCost ? 'h' : 't' },
    { label: 'Profit (base)',    h: fmt(hyperion.profitNoScrolls),  t: fmt(terminator.profitNoScrolls), hColor: hyperion.profitNoScrolls >= 0 ? '#00e5a0' : '#ff5566', tColor: terminator.profitNoScrolls >= 0 ? '#00e5a0' : '#ff5566', winner: hyperion.profitNoScrolls > terminator.profitNoScrolls ? 'h' : 't' },
    { label: 'Profit (current)', h: fmt(h.profit),                 t: fmt(t.profit),                   hColor: h.profit >= 0 ? '#00e5a0' : '#ff5566', tColor: t.profit >= 0 ? '#00e5a0' : '#ff5566', winner: h.profit > t.profit ? 'h' : 't' },
    { label: 'Margin %',        h: `${h.margin.toFixed(1)}%`,     t: `${t.margin.toFixed(1)}%`,       winner: h.margin > t.margin ? 'h' : 't' },
    { label: 'BO Saving',       h: `+${fmtS(h.boSave)}`,         t: `+${fmtS(t.boSave)}`,           winner: h.boSave > t.boSave ? 'h' : 't' },
    { label: 'Risk',            h: hyperion.manipulationRisk,     t: terminator.manipulationRisk,     winner: (['LOW','MEDIUM','HIGH'].indexOf(hyperion.manipulationRisk) < ['LOW','MEDIUM','HIGH'].indexOf(terminator.manipulationRisk)) ? 'h' : 't' },
  ]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '12px 16px', fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Metric</div>
        <div style={{ padding: '12px 16px', fontSize: '0.8rem', fontWeight: 700, color: '#4d94ff', textAlign: 'center' }}>Hyperion</div>
        <div style={{ padding: '12px 16px', fontSize: '0.8rem', fontWeight: 700, color: '#a78bfa', textAlign: 'center' }}>Terminator</div>
      </div>
      {rows.map((row, i) => (
        <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ padding: '11px 16px', fontSize: '0.78rem', color: 'var(--text2)', fontWeight: 500 }}>{row.label}</div>
          <div style={{ padding: '11px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center', color: row.hColor ?? (row.winner === 'h' ? '#00e5a0' : 'var(--text2)'), background: row.winner === 'h' ? 'rgba(0,229,160,0.04)' : 'transparent' }}>
            {row.h}{row.winner === 'h' && <span style={{ marginLeft: 5, fontSize: '0.6rem', color: '#00e5a0' }}>✓</span>}
          </div>
          <div style={{ padding: '11px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', fontWeight: 700, textAlign: 'center', color: row.tColor ?? (row.winner === 't' ? '#00e5a0' : 'var(--text2)'), background: row.winner === 't' ? 'rgba(167,139,250,0.04)' : 'transparent' }}>
            {row.t}{row.winner === 't' && <span style={{ marginLeft: 5, fontSize: '0.6rem', color: '#00e5a0' }}>✓</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flip-card" style={{ padding: 20 }}>
      <div style={{ height: 3, background: 'var(--surface3)', borderRadius: 2, marginBottom: 18 }} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 15, width: '45%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 10, width: '30%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 14 }} />
      <div className="skeleton" style={{ height: 36, borderRadius: 8, marginBottom: 14 }} />
      {[0, 1, 2].map(i => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div className="skeleton" style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 11, width: '50%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 9, width: '28%' }} />
          </div>
          <div className="skeleton" style={{ height: 13, width: 52 }} />
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CraftWeaponsPage() {
  const [hyperion,   setHyperion]   = useState<WeaponFlip | null>(null)
  const [terminator, setTerminator] = useState<WeaponFlip | null>(null)
  const [aiSummary,  setAiSummary]  = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [tick, setTick]             = useState(0)

  const [execH, setExecH]         = useState<ExecMode>('INSTA_BUY')
  const [execT, setExecT]         = useState<ExecMode>('INSTA_BUY')
  const [otcH, setOtcH]           = useState<OtcMap>({})
  const [otcT, setOtcT]           = useState<OtcMap>({})
  const [variantH, setVariantH]   = useState(0)
  const [scrollsH, setScrollsH]   = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await fetchCraftWeapons()
      setHyperion(data.hyperion); setTerminator(data.terminator)
      setAiSummary(data.aiSummary); setLastUpdated(new Date()); setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    setLoading(true); load()
    const id = window.setInterval(load, 3 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [load, tick])

  const best = useMemo(() => {
    if (!hyperion || !terminator) return null
    return hyperion.profitNoScrolls > terminator.profitNoScrolls ? 'Hyperion' : 'Terminator'
  }, [hyperion, terminator])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">

        {/* ── Header ── */}
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" />Live</span>
                : <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.72rem', color: 'var(--text2)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.72rem', color: '#ff5566' }}>⚠ {error}</span>}
              <button onClick={() => { setLoading(true); setTick(n => n + 1) }}
                style={{ padding: '4px 12px', fontSize: '0.68rem', fontWeight: 700, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text2)', cursor: 'pointer' }}>
                Refresh
              </button>
            </div>
            <h1 className="page-title">Weapon Craft Flips</h1>
            <p className="page-subtitle">Live terminal · Hyperion & Terminator · BZ buy orders · OTC calculator · 2% AH tax</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {hyperion && (
              <div className="stat-block">
                <div className="stat-label">Hyperion Profit</div>
                <div className="stat-value" style={{ color: hyperion.profitNoScrolls >= 0 ? '#00e5a0' : '#ff5566', marginTop: 4 }}>
                  {hyperion.profitNoScrolls >= 0 ? '+' : ''}{fmtS(hyperion.profitNoScrolls)}
                </div>
              </div>
            )}
            {terminator && (
              <div className="stat-block">
                <div className="stat-label">Terminator Profit</div>
                <div className="stat-value" style={{ color: terminator.profitNoScrolls >= 0 ? '#00e5a0' : '#ff5566', marginTop: 4 }}>
                  {terminator.profitNoScrolls >= 0 ? '+' : ''}{fmtS(terminator.profitNoScrolls)}
                </div>
              </div>
            )}
            {best && (
              <div className="stat-block">
                <div className="stat-label">Best Now</div>
                <div className="stat-value" style={{ color: '#f5a623', marginTop: 4 }}>{best}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Pricing note ── */}
        <div className="info-callout" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#4d94ff', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>How pricing works</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)' }}>Insta Buy</strong> — click &quot;Buy Instantly&quot; on BZ, pay the <em>lowest sell offer</em> (sell_summary[0]) · costs more, immediate.{' '}
            <strong style={{ color: 'var(--text)' }}>Buy Order</strong> — place a buy order at the <em>weighted avg sell price</em> (quick_status.sellPrice) · costs less, wait for a seller to fill you.{' '}
            <strong style={{ color: 'var(--text)' }}>AH items</strong> — Coflnet live LBIN, no buy orders exist.
          </div>
        </div>

        {/* ── AI ── */}
        {aiSummary && (
          <div className="ai-panel" style={{ marginBottom: 20 }}>
            <div className="ai-panel-label">✦ AI Analysis</div>
            <div className="ai-panel-body">{aiSummary}</div>
          </div>
        )}

        {/* ── Compare table ── */}
        {!loading && hyperion && terminator && (
          <CompareTable hyperion={hyperion} terminator={terminator} execH={execH} execT={execT} otcH={otcH} otcT={otcT} />
        )}

        {/* ══ HYPERION ══ */}
        {!loading && hyperion && (
          <>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#4d94ff', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #4d94ff30, transparent)' }} />
              Hyperion
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #4d94ff30)' }} />
            </div>

            <Section title="Variant Selection" accent="#4d94ff" defaultOpen>
              <VariantPicker weapon={hyperion} selected={variantH} setSelected={setVariantH} execMode={execH} setScrolls={setScrollsH} accent="#4d94ff" />
            </Section>

            <Section title="Execution Strategy — Insta Buy vs Buy Orders" accent="#4d94ff">
              <ExecSelector weapon={hyperion} mode={execH} setMode={setExecH} scrollsIncluded={scrollsH} accent="#4d94ff" />
            </Section>

            <Section title="Profit Engine" accent="#4d94ff">
              <ProfitEngine weapon={hyperion} execMode={execH} otc={otcH} variantIdx={variantH} scrolls={scrollsH} accent="#4d94ff" />
            </Section>

            <OtcPanel weapon={hyperion} accent="#4d94ff" scrolls={scrollsH} variantIdx={variantH} execMode={execH} otc={otcH} setOtc={setOtcH} />
          </>
        )}

        {/* ══ TERMINATOR ══ */}
        {!loading && terminator && (
          <>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14, marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #a78bfa30, transparent)' }} />
              Terminator
              <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #a78bfa30)' }} />
            </div>

            <Section title="Execution Strategy — Insta Buy vs Buy Orders" accent="#a78bfa">
              <ExecSelector weapon={terminator} mode={execT} setMode={setExecT} scrollsIncluded={false} accent="#a78bfa" />
            </Section>

            <Section title="Profit Engine" accent="#a78bfa">
              <ProfitEngine weapon={terminator} execMode={execT} otc={otcT} variantIdx={0} scrolls={false} accent="#a78bfa" />
            </Section>

            <OtcPanel weapon={terminator} accent="#a78bfa" scrolls={false} variantIdx={0} execMode={execT} otc={otcT} setOtc={setOtcT} />
          </>
        )}

        {/* ══ Market Overview cards ══ */}
        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 14, marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--border), transparent)' }} />
          Market Overview
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, var(--border))' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
          {loading && <><Skeleton /><Skeleton /></>}
          {!loading && hyperion   && <WeaponCard weapon={hyperion}   accent="#4d94ff" execMode={execH} otc={otcH} variantIdx={variantH} scrolls={scrollsH} />}
          {!loading && terminator && <WeaponCard weapon={terminator} accent="#a78bfa" execMode={execT} otc={otcT} variantIdx={0}       scrolls={false} />}
        </div>

      </main>
      <RefreshTimer intervalMs={3 * 60 * 1000} lastUpdated={lastUpdated} />
    </div>
  )
}
