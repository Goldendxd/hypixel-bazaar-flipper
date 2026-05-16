'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchCraftWeapons, WeaponFlip, CraftIngredient, ScrollAddon, PricePoint, IngredientPricing,
} from '@/lib/craftWeapons'
import Sidebar from '@/components/Sidebar'
import RefreshTimer from '@/components/RefreshTimer'

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
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
function coinsMed(n: number): string {
  if (!isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const abs  = Math.abs(n)
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`
  return `${sign}${abs.toFixed(0)}`
}

function parseCoin(raw: string): number {
  const s = raw.trim().toLowerCase().replace(/,/g, '')
  if (!s) return NaN
  const mul = s.endsWith('b') ? 1e9 : s.endsWith('m') ? 1e6 : s.endsWith('k') ? 1e3 : 1
  return parseFloat(s.replace(/[kmb]$/, '')) * mul
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution mode
// ─────────────────────────────────────────────────────────────────────────────

type ExecMode = 'INSTA_BUY' | 'BUY_ORDERS' | 'MIXED'
const MIXED_SAVE_THRESHOLD = 1_000_000

function execPrice(pricing: IngredientPricing, qty: number, mode: ExecMode): number {
  if (pricing.source === 'AH') return pricing.instaBuy
  if (mode === 'INSTA_BUY')  return pricing.instaBuy
  if (mode === 'BUY_ORDERS') return pricing.buyOrder
  return (pricing.instaBuy - pricing.buyOrder) * qty >= MIXED_SAVE_THRESHOLD
    ? pricing.buyOrder : pricing.instaBuy
}

// ─────────────────────────────────────────────────────────────────────────────
// OTC
// ─────────────────────────────────────────────────────────────────────────────

interface OtcEntry { useOtc: boolean; rawInput: string }
type OtcMap = Record<string, OtcEntry>

function resolveUnit(id: string, marketPrice: number, otc: OtcMap): number {
  const e = otc[id]
  if (!e?.useOtc || !e.rawInput) return marketPrice
  const p = parseCoin(e.rawInput)
  return isFinite(p) && p > 0 ? p : marketPrice
}

// ─────────────────────────────────────────────────────────────────────────────
// Micro components
// ─────────────────────────────────────────────────────────────────────────────

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

const RISK_CLR: Record<string, string> = { LOW: 'var(--green)', MEDIUM: 'var(--gold)', HIGH: 'var(--red)' }
const LIQ_CLR:  Record<string, string> = { HIGH: 'var(--green)', MEDIUM: 'var(--gold)', LOW: 'var(--red)' }

function Chip({ text, color, bg }: { text: string; color: string; bg?: string }) {
  return (
    <span className="chip" style={{ background: bg ?? `${color}15`, color, border: `1px solid ${color}30` }}>
      {text}
    </span>
  )
}

function Sparkline({ data, color = 'var(--blue)', w = 72, h = 24 }: { data: PricePoint[]; color?: string; w?: number; h?: number }) {
  const vals = data.map(d => d.avg).filter(v => v > 0)
  if (vals.length < 2) return <div style={{ width: w, height: h }} />
  const mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 1
  const pts = vals.map((v, i) =>
    `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - mn) / range) * (h - 4) - 2).toFixed(1)}`
  ).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function MiniBar({ data, color = 'var(--blue)' }: { data: PricePoint[]; color?: string }) {
  const vals = data.map(d => d.avg).filter(v => v > 0)
  if (!vals.length) return <div style={{ color: 'var(--muted)', fontSize: '0.75rem', padding: '8px 0' }}>No history</div>
  const mx = Math.max(...vals)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
      {vals.map((v, i) => (
        <div key={i} style={{ flex: 1, height: `${Math.max(4, (v / mx) * 48)}px`, background: color, borderRadius: '3px 3px 0 0', opacity: 0.5 + (i / vals.length) * 0.5 }} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Collapsible panel wrapper
// ─────────────────────────────────────────────────────────────────────────────

function Panel({
  title, subtitle, accent, chips, defaultOpen = false, children,
}: {
  title: string; subtitle?: string; accent?: string; chips?: React.ReactNode
  defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="panel" style={{ borderColor: accent ? `${accent}30` : undefined, marginBottom: 20 }}>
      <button className="panel-header" onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          {accent && <div style={{ width: 4, height: 36, background: accent, borderRadius: 99, flexShrink: 0 }} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', letterSpacing: '-0.01em' }}>{title}</span>
              {chips}
            </div>
            {subtitle && <div style={{ fontSize: '0.775rem', color: 'var(--text2)', marginTop: 2 }}>{subtitle}</div>}
          </div>
        </div>
        <span style={{ color: 'var(--muted)', fontSize: '0.75rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▾</span>
      </button>
      {open && <div className="panel-body">{children}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PnL hero — big profit display
// ─────────────────────────────────────────────────────────────────────────────

function PnlHero({
  profit, craftCost, netRevenue, accentColor, otcSaving, marketProfit,
}: {
  profit: number; craftCost: number; netRevenue: number; accentColor: string
  otcSaving?: number; marketProfit?: number
}) {
  const pos = profit > 0
  return (
    <div style={{
      background: pos ? 'var(--green-dim)' : 'var(--red-dim)',
      border:     `1px solid ${pos ? 'var(--green-border)' : 'var(--red-border)'}`,
      borderRadius: 12, padding: '20px 24px',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 24, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Net Profit</div>
          <div className="num-xl" style={{ color: pos ? 'var(--green)' : 'var(--red)' }}>
            {pos ? '+' : ''}{coins(profit)}
          </div>
          {otcSaving != null && otcSaving > 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--green)', marginTop: 5, fontWeight: 500 }}>
              OTC saves <span className="mono" style={{ fontWeight: 700 }}>+{coinsMed(otcSaving)}</span>
              {marketProfit != null && <span style={{ color: 'var(--muted)' }}> · AH base: {coinsMed(marketProfit)}</span>}
            </div>
          )}
        </div>
        <div style={{ width: 1, height: 48, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Craft Cost</div>
            <div className="num-lg" style={{ color: 'var(--red)' }}>{coins(craftCost)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Revenue (after tax)</div>
            <div className="num-lg" style={{ color: accentColor }}>{coins(netRevenue)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Mode Panel
// ─────────────────────────────────────────────────────────────────────────────

function ExecPanel({ weapon, mode, setMode, scrollsIncluded, accent }: {
  weapon: WeaponFlip; mode: ExecMode; setMode: (m: ExecMode) => void
  scrollsIncluded: boolean; accent: string
}) {
  const items = [
    ...weapon.ingredients,
    ...(scrollsIncluded ? weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })) : []),
  ]
  const bzItems = weapon.ingredients.filter(x => x.source === 'BZ')

  const netRev = weapon.cleanLbin * (1 - weapon.ahTax)
  const instaCost  = items.reduce((a, x) => a + x.pricing.instaBuy * x.qty, 0)
  const orderCost  = items.reduce((a, x) => a + x.pricing.buyOrder * x.qty, 0)
  const mixedCost  = items.reduce((a, x) => a + execPrice(x.pricing, x.qty, 'MIXED') * x.qty, 0)

  const scenarios = [
    { key: 'INSTA_BUY'  as ExecMode, label: 'Insta Buy',   cost: instaCost,  profit: netRev - instaCost,  desc: 'Buy now, no waiting' },
    { key: 'BUY_ORDERS' as ExecMode, label: 'Buy Orders',  cost: orderCost,  profit: netRev - orderCost,  desc: 'Patient — fill at bid' },
    { key: 'MIXED'      as ExecMode, label: 'Smart Mix',   cost: mixedCost,  profit: netRev - mixedCost,  desc: 'Orders where spread ≥ 1M' },
  ]
  const best = scenarios.reduce((a, b) => a.profit > b.profit ? a : b)
  const boSaving = instaCost - orderCost

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Strategy cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {scenarios.map(s => {
          const active = mode === s.key
          const pos    = s.profit > 0
          const isBest = s.key === best.key
          return (
            <button key={s.key} onClick={() => setMode(s.key)} style={{
              background:   active ? `${accent}12` : 'var(--surface2)',
              border:       `1px solid ${active ? accent : isBest ? 'rgba(0,229,160,0.3)' : 'var(--border)'}`,
              borderRadius: 10, padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: '0.775rem', fontWeight: 700, color: active ? accent : 'var(--text)' }}>{s.label}</span>
                {isBest && <span style={{ fontSize: '0.62rem', color: 'var(--green)', fontWeight: 700 }}>Best ★</span>}
              </div>
              <div className="mono" style={{ fontSize: '1rem', fontWeight: 800, color: pos ? 'var(--green)' : 'var(--red)', marginBottom: 4 }}>
                {pos ? '+' : ''}{coinsMed(s.profit)}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text2)' }}>{s.desc}</div>
            </button>
          )
        })}
      </div>

      {/* Buy order savings alert */}
      {boSaving > 2_000_000 && (
        <div style={{ background: 'var(--green-dim)', border: '1px solid var(--green-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.875rem', color: 'var(--green)', fontWeight: 600 }}>
            Use Buy Orders for <span className="mono" style={{ fontWeight: 800 }}>+{coinsMed(boSaving)}</span> extra profit
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text2)' }}>
            {((boSaving / instaCost) * 100).toFixed(1)}% cost reduction
          </span>
        </div>
      )}

      {/* Per BZ item table */}
      {bzItems.length > 0 && (
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            Bazaar Item Spreads
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {bzItems.map(item => {
              const saving  = (item.pricing.instaBuy - item.pricing.buyOrder) * item.qty
              const spread  = item.pricing.spread
              const useOrder = mode === 'BUY_ORDERS' || (mode === 'MIXED' && saving >= MIXED_SAVE_THRESHOLD)
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 72px 72px 72px', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text)' }}>{item.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text2)', marginTop: 2 }}>
                      ×{item.qty} · <span style={{ color: 'var(--blue)' }}>BZ</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Chip text={useOrder ? 'ORDER' : 'INSTANT'} color={useOrder ? 'var(--green)' : 'var(--blue)'} />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 2 }}>Insta</div>
                    <div className="mono" style={{ fontSize: '0.775rem', fontWeight: 700, color: 'var(--red)' }}>{coinsMed(item.pricing.instaBuy)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 2 }}>Order</div>
                    <div className="mono" style={{ fontSize: '0.775rem', fontWeight: 700, color: 'var(--green)' }}>{coinsMed(item.pricing.buyOrder)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 2 }}>Save</div>
                    <div className="mono" style={{ fontSize: '0.775rem', fontWeight: 700, color: saving > 0 ? 'var(--green)' : 'var(--muted)' }}>
                      {saving > 100_000 ? `+${coinsMed(saving)}` : '—'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Spread: {weapon.ingredients.filter(x => x.source === 'BZ').map(x => `${x.name.split(' ')[0]} ${x.pricing.spread.toFixed(1)}%`).join(' · ')}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant Panel (Hyperion only)
// ─────────────────────────────────────────────────────────────────────────────

function VariantPanel({ weapon, selected, setSelected, execMode, setScrolls, accent }: {
  weapon: WeaponFlip; selected: number; setSelected: (i: number) => void
  execMode: ExecMode; setScrolls: (v: boolean) => void; accent: string
}) {
  const baseCost = weapon.ingredients.reduce((a, x) => a + execPrice(x.pricing, x.qty, execMode) * x.qty, 0)

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ fontSize: '0.775rem', color: 'var(--text2)', marginBottom: 16, lineHeight: 1.6 }}>
        All Hyperion variants share one AH tag — Coflnet has no scroll filter API.
        Scrolled LBIN is estimated as <strong style={{ color: 'var(--text)' }}>clean LBIN + scroll market prices</strong>, which is how real traders calculate it.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {weapon.variants.map((v, i) => {
          const scrollCost = weapon.scrollAddons
            .filter(s => v.scrollIds.includes(s.id))
            .reduce((a, s) => a + execPrice(s.pricing, 1, execMode), 0)
          const totalCost = baseCost + scrollCost
          const net       = v.estimatedLbin * (1 - weapon.ahTax)
          const profit    = net - totalCost
          const pos       = profit > 0
          const active    = selected === i
          return (
            <button key={v.label} onClick={() => { setSelected(i); setScrolls(v.scrollCount > 0) }} style={{
              background:   active ? `${accent}12` : 'var(--surface2)',
              border:       `1px solid ${active ? accent : 'var(--border)'}`,
              borderRadius: 12, padding: '16px 18px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: active ? accent : 'var(--text)', marginBottom: 6 }}>{v.label}</div>
              <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: pos ? 'var(--green)' : 'var(--red)', marginBottom: 6 }}>
                {pos ? '+' : ''}{coinsMed(profit)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: 3 }}>
                Est. LBIN: <span className="mono" style={{ color: 'var(--text)' }}>{coinsMed(v.estimatedLbin)}</span>
              </div>
              {v.scrollCount > 0 && (
                <div style={{ fontSize: '0.68rem', color: 'var(--purple)', marginTop: 4 }}>
                  +{v.scrollCount} scroll{v.scrollCount > 1 ? 's' : ''}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Profit Engine
// ─────────────────────────────────────────────────────────────────────────────

function ProfitEnginePanel({ weapon, execMode, otc, variantIdx, scrolls, accent }: {
  weapon: WeaponFlip; execMode: ExecMode; otc: OtcMap
  variantIdx: number; scrolls: boolean; accent: string
}) {
  const variant    = weapon.variants[variantIdx] ?? weapon.variants[0]
  const scrollItems = scrolls ? weapon.scrollAddons : []

  const instaCost  = weapon.ingredients.reduce((a, x) => a + x.pricing.instaBuy * x.qty, 0)
                   + scrollItems.reduce((a, s) => a + s.pricing.instaBuy, 0)
  const orderCost  = weapon.ingredients.reduce((a, x) => a + x.pricing.buyOrder * x.qty, 0)
                   + scrollItems.reduce((a, s) => a + s.pricing.buyOrder, 0)
  const otcCost    = [...weapon.ingredients, ...scrollItems.map(s => ({ ...s, qty: 1 }))].reduce((acc, x) => {
    const base = execPrice(x.pricing, x.qty, execMode)
    return acc + resolveUnit(x.id, base, otc) * x.qty
  }, 0)

  const netRev     = variant.estimatedLbin * (1 - weapon.ahTax)
  const profitInsta = netRev - instaCost
  const profitOrder = netRev - orderCost
  const profitOtc   = netRev - otcCost

  const best = Math.max(profitInsta, profitOrder, profitOtc)
  const bestLabel = best === profitOtc ? 'OTC' : best === profitOrder ? 'Buy Orders' : 'Insta Buy'

  const difficulty = instaCost > 400e6 ? { label: 'Extreme', color: 'var(--red)' }
    : instaCost > 200e6 ? { label: 'High',   color: 'var(--gold)' }
    : { label: 'Medium', color: 'var(--blue)' }

  const metrics = [
    { label: 'Est. LBIN (variant)',      val: coins(variant.estimatedLbin),      color: 'var(--text)'  },
    { label: 'Revenue after 2% AH tax',  val: coins(netRev),                     color: accent          },
    { label: 'Insta-buy cost',           val: coins(instaCost),                  color: 'var(--red)'   },
    { label: 'Buy-order cost',           val: coins(orderCost),                  color: 'var(--gold)'  },
    { label: 'OTC + exec cost',          val: coins(otcCost),                    color: 'var(--purple)' },
    { label: 'Buy-order saving',         val: `+${coinsMed(instaCost - orderCost)}`, color: 'var(--green)' },
    { label: 'Profit — Insta Buy',       val: `${profitInsta > 0 ? '+' : ''}${coins(profitInsta)}`, color: profitInsta > 0 ? 'var(--green)' : 'var(--red)' },
    { label: 'Profit — Buy Orders',      val: `${profitOrder > 0 ? '+' : ''}${coins(profitOrder)}`, color: profitOrder > 0 ? 'var(--green)' : 'var(--red)' },
    { label: 'Profit — OTC strategy',   val: `${profitOtc  > 0 ? '+' : ''}${coins(profitOtc)}`,   color: profitOtc  > 0 ? 'var(--green)' : 'var(--red)' },
    { label: 'Flip difficulty',          val: difficulty.label,                  color: difficulty.color },
    { label: 'Manip. risk',              val: weapon.manipulationRisk,           color: RISK_CLR[weapon.manipulationRisk] },
    { label: 'Est. sell time',           val: weapon.estimatedSellDays >= 99 ? 'Unknown' : weapon.estimatedSellDays < 1 ? `${(weapon.estimatedSellDays * 24).toFixed(0)}h` : `${weapon.estimatedSellDays.toFixed(1)}d`, color: 'var(--text)' },
  ]

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Verdict box */}
      <div style={{ background: best > 0 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${best > 0 ? 'var(--green-border)' : 'var(--red-border)'}`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Best Strategy: {bestLabel}</div>
        <div className="mono" style={{ fontSize: '1.3rem', fontWeight: 800, color: best > 0 ? 'var(--green)' : 'var(--red)', marginBottom: 6 }}>
          {best > 0 ? '+' : ''}{coins(best)}
        </div>
        <div style={{ fontSize: '0.825rem', color: 'var(--text2)' }}>
          {best <= 0
            ? `${weapon.name} craft is currently unprofitable — market spread too tight`
            : bestLabel === 'OTC'
              ? `+${coinsMed(best - profitInsta)} extra vs AH insta-buy — source ingredients directly from players`
              : bestLabel === 'Buy Orders'
                ? `+${coinsMed(best - profitInsta)} extra profit by being patient — place buy orders instead of insta-buying`
                : 'Insta-buy is optimal — spread too small to justify waiting for orders'}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {metrics.map(m => (
          <div key={m.label} className="metric-row">
            <span className="metric-label">{m.label}</span>
            <span className="metric-value mono" style={{ color: m.color }}>{m.val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// OTC Panel
// ─────────────────────────────────────────────────────────────────────────────

function OtcIngRow({ id, name, qty, marketUnit, source, history, vol, execMode, entry, onChange, netRev, othersCost, accent }: {
  id: string; name: string; qty: number; marketUnit: number
  source: 'AH' | 'BZ'; history: PricePoint[]; vol: number; execMode: ExecMode
  entry: OtcEntry; onChange: (e: OtcEntry) => void
  netRev: number; othersCost: number; accent: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const parsed    = entry.useOtc ? parseCoin(entry.rawInput) : NaN
  const effective = entry.useOtc && isFinite(parsed) && parsed > 0 ? parsed : marketUnit
  const discount  = marketUnit > 0 ? ((marketUnit - effective) / marketUnit) * 100 : 0
  const saved     = (marketUnit - effective) * qty

  // Breakeven analysis
  const maxForItem   = netRev - othersCost
  const breakeven    = qty > 0 ? maxForItem / qty : 0
  const safeBuy      = breakeven * 0.9
  const aggressive   = breakeven * 0.95
  const lbLow        = marketUnit * 0.93
  const lbHigh       = marketUnit * 0.97
  const viable       = isFinite(parsed) && parsed > 0 ? parsed * qty <= maxForItem : null

  return (
    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, background: 'var(--surface)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)' }}>
          <ItemIcon id={id} size={30} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>{name}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text2)', marginTop: 2 }}>
            ×{qty} · <span style={{ color: source === 'AH' ? 'var(--gold)' : 'var(--blue)' }}>{source}</span>
            {source === 'BZ' && <span style={{ marginLeft: 6, color: 'var(--muted)', fontStyle: 'italic' }}>Bazaar only — OTC N/A</span>}
            {vol > 10 && <span style={{ marginLeft: 6, color: 'var(--red)' }}>±{vol.toFixed(0)}% volatility</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 3 }}>Market</div>
          <div className="mono" style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>{coinsMed(marketUnit)}</div>
        </div>
        {source === 'AH' && (
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            <button onClick={() => onChange({ ...entry, useOtc: false })} style={{
              padding: '6px 12px', fontSize: '0.72rem', fontWeight: 700, borderRadius: '8px 0 0 8px',
              border: '1px solid var(--border)', cursor: 'pointer',
              background: !entry.useOtc ? 'var(--gold)' : 'var(--surface)',
              color:      !entry.useOtc ? '#000' : 'var(--text2)',
            }}>AH</button>
            <button onClick={() => { onChange({ ...entry, useOtc: true }); setTimeout(() => inputRef.current?.focus(), 40) }} style={{
              padding: '6px 12px', fontSize: '0.72rem', fontWeight: 700, borderRadius: '0 8px 8px 0',
              border: '1px solid var(--border)', borderLeft: 'none', cursor: 'pointer',
              background: entry.useOtc ? accent : 'var(--surface)',
              color:      entry.useOtc ? '#000' : 'var(--text2)',
            }}>OTC</button>
          </div>
        )}
      </div>

      {/* Sparkline */}
      <div style={{ marginBottom: entry.useOtc && source === 'AH' ? 12 : 0 }}>
        <Sparkline data={history} color={vol > 15 ? 'var(--red)' : 'var(--text2)'} w={160} h={28} />
      </div>

      {/* OTC input */}
      {entry.useOtc && source === 'AH' && (
        <div style={{ background: 'var(--surface)', border: `1px solid ${accent}25`, borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text2)', flexShrink: 0 }}>OTC Price / unit</label>
            <input ref={inputRef} value={entry.rawInput}
              onChange={e => onChange({ ...entry, rawInput: e.target.value })}
              placeholder={`e.g. ${coinsMed(marketUnit * 0.95)}`}
              className="filter-input mono"
              style={{ flex: 1, fontSize: '0.925rem', fontWeight: 700, padding: '8px 12px' }} />
          </div>

          {/* Quick-fill buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Safe Buy',    val: safeBuy,    color: 'var(--green)'  },
              { label: 'Aggressive', val: aggressive,  color: 'var(--gold)'   },
              { label: 'Breakeven',  val: breakeven,   color: 'var(--red)'    },
            ].map(({ label, val, color }) => (
              <button key={label} onClick={() => onChange({ ...entry, rawInput: val > 0 ? `${(val / 1e6).toFixed(2)}m` : '' })}
                style={{ background: 'var(--surface2)', border: `1px solid ${color}30`, borderRadius: 8, padding: '8px 0', cursor: 'pointer' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 3 }}>{label}</div>
                <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{val > 0 ? coinsMed(val) : '—'}</div>
              </button>
            ))}
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginBottom: isFinite(parsed) && parsed > 0 ? 12 : 0 }}>
            Typical lowball: <span className="mono" style={{ color: 'var(--text)' }}>{coinsMed(lbLow)} – {coinsMed(lbHigh)}</span>
            <span style={{ margin: '0 8px', color: 'var(--muted)' }}>·</span>
            3–7% below market
          </div>

          {isFinite(parsed) && parsed > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              {[
                { label: 'Discount', val: `${discount > 0 ? '-' : '+'}${Math.abs(discount).toFixed(1)}%`, color: discount > 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Saved',    val: `${saved > 0 ? '+' : ''}${coinsMed(saved)}`,                   color: saved > 0 ? 'var(--green)' : 'var(--red)' },
                { label: 'Viable',   val: viable === true ? 'YES ✓' : viable === false ? 'NO ✗' : '—',   color: viable === true ? 'var(--green)' : viable === false ? 'var(--red)' : 'var(--muted)' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ textAlign: 'center', background: 'var(--surface2)', borderRadius: 8, padding: '10px 0' }}>
                  <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div className="mono" style={{ fontSize: '0.875rem', fontWeight: 800, color }}>{val}</div>
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
  const variant    = weapon.variants[variantIdx] ?? weapon.variants[0]
  const netRev     = variant.estimatedLbin * (1 - weapon.ahTax)

  const allItems = useMemo(() => [
    ...weapon.ingredients,
    ...(scrolls ? weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })) : []),
  ], [weapon, scrolls])

  const otcCraft    = allItems.reduce((a, x) => a + resolveUnit(x.id, execPrice(x.pricing, x.qty, execMode), otc) * x.qty, 0)
  const mktCraft    = allItems.reduce((a, x) => a + execPrice(x.pricing, x.qty, execMode) * x.qty, 0)
  const otcProfit   = netRev - otcCraft
  const mktProfit   = netRev - mktCraft
  const anyActive   = allItems.some(x => otc[x.id]?.useOtc)
  const totalSaved  = mktCraft - otcCraft

  // Alerts
  const alerts = allItems
    .filter(x => x.source === 'AH')
    .flatMap(item => {
      const others = allItems.filter(x => x.id !== item.id)
        .reduce((a, x) => a + resolveUnit(x.id, execPrice(x.pricing, x.qty, execMode), otc) * x.qty, 0)
      const breakeven = item.qty > 0 ? (netRev - others) / item.qty : 0
      const lbProfit  = netRev - (mktCraft - execPrice(item.pricing, item.qty, execMode) * item.qty + item.pricing.instaBuy * 0.95 * item.qty)
      if (mktProfit <= 0 && lbProfit > 0)
        return [{ text: `Profitable if ${item.name} ≤ ${coinsMed(breakeven)}`, color: 'var(--gold)' }]
      if (lbProfit > mktProfit * 1.5 && mktProfit > 0)
        return [{ text: `Strong OTC margin on ${item.name}`, color: 'var(--green)' }]
      return []
    })

  const scenario = !anyActive ? { text: 'No overrides — using market prices', color: 'var(--muted)' }
    : otcProfit > 0 && mktProfit <= 0 ? { text: 'PROFITABLE ONLY VIA LOWBALL', color: 'var(--gold)' }
    : otcProfit > mktProfit * 1.4     ? { text: 'HIGH-MARGIN OTC OPPORTUNITY',  color: 'var(--green)' }
    : otcProfit > mktProfit           ? { text: 'OTC improves margin',           color: 'var(--green)' }
    : { text: 'Marginal or no OTC benefit', color: 'var(--text2)' }

  const activeChip = anyActive ? <Chip text={`ACTIVE · save ${coinsMed(totalSaved)}`} color="var(--green)" /> : undefined

  return (
    <Panel title={`Direct Trade / Lowball — ${weapon.name}`} accent={accent} chips={activeChip}>
      {/* Summary header */}
      {anyActive && (
        <div style={{ padding: '16px 24px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px 24px' }}>
          {[
            { label: 'OTC Craft Cost', val: coins(otcCraft),                       color: 'var(--red)'   },
            { label: 'OTC Profit',     val: `${otcProfit > 0 ? '+' : ''}${coins(otcProfit)}`, color: otcProfit > 0 ? 'var(--green)' : 'var(--red)' },
            { label: 'Total Saved',    val: `+${coinsMed(totalSaved)}`,             color: 'var(--green)' },
            { label: 'Profit Delta',   val: `${otcProfit - mktProfit > 0 ? '+' : ''}${coinsMed(otcProfit - mktProfit)}`, color: 'var(--green)' },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
              <div className="mono" style={{ fontSize: '1rem', fontWeight: 800, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Scenario + alerts */}
      <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: scenario.color, flexShrink: 0 }} />
        <span style={{ fontSize: '0.825rem', fontWeight: 700, color: scenario.color }}>{scenario.text}</span>
        {anyActive && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text2)' }}>vs market: <span className="mono">{coins(mktProfit)}</span></span>}
      </div>

      {alerts.map((a, i) => (
        <div key={i} style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.825rem', color: a.color, background: `${a.color}08` }}>
          <span>▶</span> {a.text}
        </div>
      ))}

      {/* Per-item rows */}
      {allItems.map(item => {
        const mktUnit    = execPrice(item.pricing, item.qty, execMode)
        const othersCost = allItems.filter(x => x.id !== item.id)
          .reduce((a, x) => a + resolveUnit(x.id, execPrice(x.pricing, x.qty, execMode), otc) * x.qty, 0)
        return (
          <OtcIngRow
            key={item.id}
            id={item.id} name={item.name} qty={item.qty}
            marketUnit={mktUnit} source={item.source}
            history={item.priceHistory} vol={item.volatility}
            execMode={execMode}
            entry={otc[item.id] ?? { useOtc: false, rawInput: '' }}
            onChange={e => setOtc(prev => ({ ...prev, [item.id]: e }))}
            netRev={netRev} othersCost={othersCost} accent={accent}
          />
        )
      })}

      <div style={{ padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text2)' }}>Mixed sourcing supported — toggle AH/OTC per ingredient independently</span>
        <button onClick={() => setOtc(() => ({}))} style={{ padding: '6px 14px', fontSize: '0.72rem', fontWeight: 700, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer' }}>
          Reset All
        </button>
      </div>
    </Panel>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Weapon card (market overview)
// ─────────────────────────────────────────────────────────────────────────────

function WeaponCard({ weapon, accent, execMode, otc, variantIdx, scrolls }: {
  weapon: WeaponFlip; accent: string; execMode: ExecMode; otc: OtcMap
  variantIdx: number; scrolls: boolean
}) {
  const variant    = weapon.variants[variantIdx] ?? weapon.variants[0]
  const variantLbin = variant.estimatedLbin

  const allItems = [
    ...weapon.ingredients,
    ...(scrolls ? weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })) : []),
  ]

  const effectiveCost = allItems.reduce((a, x) => {
    const base = execPrice(x.pricing, x.qty, execMode)
    return a + resolveUnit(x.id, base, otc) * x.qty
  }, 0)
  const marketCost = allItems.reduce((a, x) => a + execPrice(x.pricing, x.qty, execMode) * x.qty, 0)
  const netRev     = variantLbin * (1 - weapon.ahTax)
  const profit     = netRev - effectiveCost
  const otcSaving  = marketCost - effectiveCost
  const anyOtc     = allItems.some(x => otc[x.id]?.useOtc && parseCoin(otc[x.id]?.rawInput ?? '') > 0)

  return (
    <div className="flip-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-accent" style={{ background: `linear-gradient(90deg, ${accent}, var(--purple))` }} />

      {/* Weapon header */}
      <div style={{ padding: '20px 22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, background: 'var(--surface2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, border: `1px solid ${accent}30` }}>
            <ItemIcon id={weapon.id} size={44} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{weapon.name}</div>
            <div style={{ fontSize: '0.775rem', color: 'var(--text2)', marginTop: 4 }}>
              {variant.label} · LBIN
              <span className="mono" style={{ color: accent, marginLeft: 6, fontWeight: 700 }}>{coinsMed(variantLbin)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            <span className={`badge ${profit > 0 ? 'badge-green' : 'badge-red'} mono`} style={{ fontSize: '0.775rem' }}>
              {profit > 0 ? '+' : ''}{(effectiveCost > 0 ? (profit / effectiveCost) * 100 : 0).toFixed(1)}%
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: RISK_CLR[weapon.manipulationRisk] }}>
              {weapon.manipulationRisk} RISK
            </span>
          </div>
        </div>

        <PnlHero profit={profit} craftCost={effectiveCost} netRevenue={netRev} accentColor={accent}
          otcSaving={anyOtc ? otcSaving : undefined} marketProfit={anyOtc ? netRev - marketCost : undefined} />
      </div>

      {/* 24h chart */}
      <div style={{ padding: '0 22px 16px' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>24h Price History</div>
        <MiniBar data={weapon.priceHistory} color={accent} />
        {weapon.priceHistory.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>24h ago</span>
            <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>now</span>
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Ingredients */}
      <div style={{ padding: '16px 22px' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Ingredients</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...weapon.ingredients, ...(scrolls ? weapon.scrollAddons.map(s => ({ ...s, qty: 1, priceHistory: [] as PricePoint[], volatility: 0 })) : [])].map(item => {
            const base = execPrice(item.pricing, item.qty, execMode)
            const eff  = resolveUnit(item.id, base, otc)
            const tot  = eff * item.qty
            const isOtc = eff !== base
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, background: 'var(--surface)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  <ItemIcon id={item.id} size={28} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.name}
                    {isOtc && <Chip text="OTC" color="var(--green)" />}
                    {'volatility' in item && item.volatility > 10 && <Chip text={`±${item.volatility.toFixed(0)}%`} color="var(--red)" />}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text2)', marginTop: 2 }}>
                    ×{item.qty} · <span style={{ color: item.source === 'AH' ? 'var(--gold)' : 'var(--blue)' }}>{item.source}</span>
                    {!isOtc && item.source === 'BZ' && execMode !== 'INSTA_BUY' && (
                      <span style={{ marginLeft: 5, color: 'var(--green)' }}>
                        {execMode === 'BUY_ORDERS' ? 'buy order' : item.pricing.spread > 0 ? 'buy order' : 'insta'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="mono" style={{ fontSize: '0.875rem', fontWeight: 700, color: isOtc ? 'var(--green)' : 'var(--red)' }}>{coinsMed(tot)}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text2)', marginTop: 2 }}>{coinsMed(eff)} ea</div>
                </div>
                <Sparkline data={item.priceHistory} color={'volatility' in item && item.volatility > 15 ? 'var(--red)' : 'var(--text2)'} w={56} h={22} />
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '12px 22px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Updated {new Date(weapon.lastUpdated).toLocaleTimeString()}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison table
// ─────────────────────────────────────────────────────────────────────────────

function CompareTable({ hyperion, terminator, execH, execT, otcH, otcT }: {
  hyperion: WeaponFlip; terminator: WeaponFlip
  execH: ExecMode; execT: ExecMode; otcH: OtcMap; otcT: OtcMap
}) {
  const calc = (w: WeaponFlip, mode: ExecMode, otc: OtcMap) => {
    const cost   = w.ingredients.reduce((a, x) => a + resolveUnit(x.id, execPrice(x.pricing, x.qty, mode), otc) * x.qty, 0)
    const net    = w.cleanLbin * (1 - w.ahTax)
    const profit = net - cost
    const margin = cost > 0 ? (profit / cost) * 100 : 0
    const boSave = w.ingredients.filter(x => x.source === 'BZ').reduce((a, x) => a + (x.pricing.instaBuy - x.pricing.buyOrder) * x.qty, 0)
    return { profit, margin, boSave }
  }
  const h = calc(hyperion, execH, otcH)
  const t = calc(terminator, execT, otcT)

  const rows: Array<{ label: string; h: string; t: string; hColor?: string; tColor?: string; better: 'h' | 't' | 'none' }> = [
    { label: 'Clean LBIN',        h: coins(hyperion.cleanLbin),        t: coins(terminator.cleanLbin),        better: hyperion.cleanLbin > terminator.cleanLbin ? 'h' : 't' },
    { label: 'Craft Cost',        h: coins(hyperion.craftCost),        t: coins(terminator.craftCost),        better: hyperion.craftCost < terminator.craftCost ? 'h' : 't' },
    { label: 'Profit (AH insta)', h: coins(hyperion.profitNoScrolls),  t: coins(terminator.profitNoScrolls),  hColor: hyperion.profitNoScrolls > 0 ? 'var(--green)' : 'var(--red)', tColor: terminator.profitNoScrolls > 0 ? 'var(--green)' : 'var(--red)', better: hyperion.profitNoScrolls > terminator.profitNoScrolls ? 'h' : 't' },
    { label: 'Profit (current)',  h: coins(h.profit),                  t: coins(t.profit),                   hColor: h.profit > 0 ? 'var(--green)' : 'var(--red)', tColor: t.profit > 0 ? 'var(--green)' : 'var(--red)', better: h.profit > t.profit ? 'h' : 't' },
    { label: 'Margin %',         h: `${h.margin.toFixed(1)}%`,        t: `${t.margin.toFixed(1)}%`,         better: h.margin > t.margin ? 'h' : 't' },
    { label: 'BZ Order Saving',   h: `+${coinsMed(h.boSave)}`,        t: `+${coinsMed(t.boSave)}`,          better: h.boSave > t.boSave ? 'h' : 't' },
    { label: 'Manip. Risk',      h: hyperion.manipulationRisk,        t: terminator.manipulationRisk,        better: (hyperion.manipulationRisk === 'LOW' ? 0 : hyperion.manipulationRisk === 'MEDIUM' ? 1 : 2) < (terminator.manipulationRisk === 'LOW' ? 0 : terminator.manipulationRisk === 'MEDIUM' ? 1 : 2) ? 'h' : 't' },
  ]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '14px 18px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Metric</div>
        <div style={{ padding: '14px 18px', fontSize: '0.825rem', fontWeight: 700, color: 'var(--blue)', textAlign: 'center' }}>Hyperion</div>
        <div style={{ padding: '14px 18px', fontSize: '0.825rem', fontWeight: 700, color: 'var(--purple)', textAlign: 'center' }}>Terminator</div>
      </div>
      {rows.map((row, i) => (
        <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 1fr', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ padding: '12px 18px', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text2)' }}>{row.label}</div>
          <div className="mono" style={{ padding: '12px 18px', fontSize: '0.825rem', fontWeight: 700, color: row.hColor ?? (row.better === 'h' ? 'var(--green)' : 'var(--text2)'), textAlign: 'center', background: row.better === 'h' ? 'rgba(0,229,160,0.04)' : 'transparent' }}>
            {row.h}{row.better === 'h' && <span style={{ marginLeft: 5, color: 'var(--green)', fontSize: '0.65rem' }}>✓</span>}
          </div>
          <div className="mono" style={{ padding: '12px 18px', fontSize: '0.825rem', fontWeight: 700, color: row.tColor ?? (row.better === 't' ? 'var(--green)' : 'var(--text2)'), textAlign: 'center', background: row.better === 't' ? 'rgba(167,139,250,0.04)' : 'transparent' }}>
            {row.t}{row.better === 't' && <span style={{ marginLeft: 5, color: 'var(--green)', fontSize: '0.65rem' }}>✓</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flip-card" style={{ padding: 22 }}>
      <div style={{ height: 3, background: 'var(--surface3)', borderRadius: 2, marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
        <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 12, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 16, width: '48%', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 11, width: '32%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 48, borderRadius: 8, marginBottom: 16 }} />
      {[0,1,2,3].map(i => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
          <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 12, width: '52%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 9, width: '28%' }} />
          </div>
          <div className="skeleton" style={{ height: 14, width: 56 }} />
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
  const [refresh, setRefresh]         = useState(0)

  const [execH, setExecH] = useState<ExecMode>('INSTA_BUY')
  const [execT, setExecT] = useState<ExecMode>('INSTA_BUY')
  const [otcH, setOtcH]   = useState<OtcMap>({})
  const [otcT, setOtcT]   = useState<OtcMap>({})
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
  }, [load, refresh])

  const best = useMemo(() => {
    if (!hyperion || !terminator) return null
    return hyperion.profitNoScrolls > terminator.profitNoScrolls ? 'Hyperion' : 'Terminator'
  }, [hyperion, terminator])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">
        {/* Header */}
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" />Live</span>
                : <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.775rem', color: 'var(--text2)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.775rem', color: 'var(--red)' }}>⚠ {error}</span>}
              <button onClick={() => { setLoading(true); setRefresh(n => n + 1) }}
                style={{ padding: '5px 12px', fontSize: '0.72rem', fontWeight: 700, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', cursor: 'pointer' }}>
                Refresh
              </button>
            </div>
            <h1 className="page-title">Weapon Craft Flips</h1>
            <p className="page-subtitle">Live crafting flip terminal · Hyperion & Terminator · BZ buy orders · OTC calculator · 2% AH tax</p>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {hyperion && (
              <div className="stat-block" style={{ minWidth: 130 }}>
                <div className="stat-label">Hyperion Profit</div>
                <div className="stat-value" style={{ color: hyperion.profitNoScrolls > 0 ? 'var(--green)' : 'var(--red)', marginTop: 6 }}>
                  {hyperion.profitNoScrolls > 0 ? '+' : ''}{coinsMed(hyperion.profitNoScrolls)}
                </div>
              </div>
            )}
            {terminator && (
              <div className="stat-block" style={{ minWidth: 130 }}>
                <div className="stat-label">Terminator Profit</div>
                <div className="stat-value" style={{ color: terminator.profitNoScrolls > 0 ? 'var(--green)' : 'var(--red)', marginTop: 6 }}>
                  {terminator.profitNoScrolls > 0 ? '+' : ''}{coinsMed(terminator.profitNoScrolls)}
                </div>
              </div>
            )}
            {best && (
              <div className="stat-block" style={{ minWidth: 110 }}>
                <div className="stat-label">Best Right Now</div>
                <div className="stat-value" style={{ color: 'var(--gold)', marginTop: 6 }}>{best}</div>
              </div>
            )}
          </div>
        </div>

        {/* Pricing accuracy callout */}
        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--blue)' }}>Pricing sources</div>
          <strong style={{ color: 'var(--text)' }}>BZ items</strong> — Hypixel Bazaar API:
          <span style={{ color: 'var(--red)', margin: '0 4px' }}>insta-buy</span> = lowest ask (sell_summary[0]),
          <span style={{ color: 'var(--green)', margin: '0 4px' }}>buy order</span> = highest bid (buy_summary[0]).
          {' '}<strong style={{ color: 'var(--text)' }}>AH items</strong> — Coflnet /bin endpoint (live LBIN).
          {' '}Scrolled Hyperion LBIN = clean LBIN + scroll prices (no dedicated API — standard trader methodology).
        </div>

        {/* AI */}
        {aiSummary && (
          <div className="ai-panel">
            <div className="ai-panel-label">✦ AI Analysis</div>
            <div className="ai-panel-body">{aiSummary}</div>
          </div>
        )}

        {/* Comparison */}
        {hyperion && terminator && !loading && (
          <CompareTable hyperion={hyperion} terminator={terminator} execH={execH} execT={execT} otcH={otcH} otcT={otcT} />
        )}

        {/* ── HYPERION ── */}
        {!loading && hyperion && (
          <>
            <div className="section-label" style={{ color: 'var(--blue)' }}>Hyperion</div>

            <Panel title="Variant & Scroll Selection" subtitle="Choose clean, partial, or fully scrolled — affects LBIN estimate and margin" accent="var(--blue)" defaultOpen>
              <VariantPanel weapon={hyperion} selected={variantH} setSelected={setVariantH} execMode={execH} setScrolls={setScrollsH} accent="var(--blue)" />
            </Panel>

            <Panel title="Execution Strategy" subtitle="Insta Buy vs Buy Orders vs Smart Mix — affects all BZ ingredients" accent="var(--blue)">
              <ExecPanel weapon={hyperion} mode={execH} setMode={setExecH} scrollsIncluded={scrollsH} accent="var(--blue)" />
            </Panel>

            <Panel title="Profit Engine" subtitle="All scenarios side-by-side — best strategy, full breakdown" accent="var(--blue)">
              <ProfitEnginePanel weapon={hyperion} execMode={execH} otc={otcH} variantIdx={variantH} scrolls={scrollsH} accent="var(--blue)" />
            </Panel>

            <OtcPanel weapon={hyperion} accent="var(--blue)" scrolls={scrollsH} variantIdx={variantH} execMode={execH} otc={otcH} setOtc={setOtcH} />
          </>
        )}

        {/* ── TERMINATOR ── */}
        {!loading && terminator && (
          <>
            <div className="section-label" style={{ color: 'var(--purple)' }}>Terminator</div>

            <Panel title="Execution Strategy" subtitle="Insta Buy vs Buy Orders vs Smart Mix" accent="var(--purple)">
              <ExecPanel weapon={terminator} mode={execT} setMode={setExecT} scrollsIncluded={false} accent="var(--purple)" />
            </Panel>

            <Panel title="Profit Engine" subtitle="All scenarios side-by-side — full breakdown" accent="var(--purple)">
              <ProfitEnginePanel weapon={terminator} execMode={execT} otc={otcT} variantIdx={0} scrolls={false} accent="var(--purple)" />
            </Panel>

            <OtcPanel weapon={terminator} accent="var(--purple)" scrolls={false} variantIdx={0} execMode={execT} otc={otcT} setOtc={setOtcT} />
          </>
        )}

        {/* Weapon overview cards */}
        <div className="section-label">Market Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
          {loading && <><Skeleton /><Skeleton /></>}
          {!loading && hyperion && <WeaponCard weapon={hyperion} accent="var(--blue)" execMode={execH} otc={otcH} variantIdx={variantH} scrolls={scrollsH} />}
          {!loading && terminator && <WeaponCard weapon={terminator} accent="var(--purple)" execMode={execT} otc={otcT} variantIdx={0} scrolls={false} />}
        </div>
      </main>
      <RefreshTimer intervalMs={3 * 60 * 1000} lastUpdated={lastUpdated} />
    </div>
  )
}
