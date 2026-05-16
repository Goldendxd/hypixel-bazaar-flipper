'use client'

import { useCallback, useEffect, useState } from 'react'
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
  LOW:    'var(--green)',
  MEDIUM: 'var(--gold)',
  HIGH:   'var(--red)',
}

// ────────────────────────────────────────────────────────────────────────────
// Spark chart (tiny inline SVG sparkline)
// ────────────────────────────────────────────────────────────────────────────

function Sparkline({ data, color = 'var(--blue)', w = 80, h = 28 }: {
  data: PricePoint[]; color?: string; w?: number; h?: number
}) {
  if (data.length < 2) return <div style={{ width: w, height: h }} />
  const vals = data.map(d => d.avg).filter(v => v > 0)
  if (vals.length < 2) return <div style={{ width: w, height: h }} />
  const mn = Math.min(...vals)
  const mx = Math.max(...vals)
  const range = mx - mn || 1
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w
    const y = h - ((v - mn) / range) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Ingredient row
// ────────────────────────────────────────────────────────────────────────────

function IngredientRow({ ing, isLast }: { ing: CraftIngredient; isLast: boolean }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr 56px 72px 72px 80px',
      gap: 8,
      alignItems: 'center',
      padding: '7px 10px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ width: 28, height: 28, background: 'var(--surface2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
        <ItemIcon id={ing.id} size={24} />
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>{ing.name}</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: 1 }}>
          ×{ing.qty} · <span style={{ color: ing.source === 'AH' ? 'var(--gold)' : 'var(--blue)' }}>{ing.source}</span>
          {ing.volatility > 10 && <span style={{ marginLeft: 4, color: 'var(--red)' }}>±{ing.volatility.toFixed(0)}%</span>}
        </div>
      </div>
      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text2)', textAlign: 'right' }}>×{ing.qty}</div>
      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text2)', textAlign: 'right' }}>{coinsShort(ing.unitPrice)}</div>
      <div className="mono" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--red)', textAlign: 'right' }}>{coinsShort(ing.totalCost)}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Sparkline data={ing.priceHistory} color={ing.volatility > 15 ? 'var(--red)' : 'var(--text2)'} w={72} h={22} />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Scroll addon row
// ────────────────────────────────────────────────────────────────────────────

function ScrollRow({ scroll, isLast }: { scroll: ScrollAddon; isLast: boolean }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr 72px',
      gap: 8,
      alignItems: 'center',
      padding: '7px 10px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      <div style={{ width: 28, height: 28, background: 'var(--surface2)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <ItemIcon id={scroll.id} size={24} />
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>{scroll.name}</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>Post-craft ability · <span style={{ color: scroll.source === 'AH' ? 'var(--gold)' : 'var(--blue)' }}>{scroll.source}</span></div>
      </div>
      <div className="mono" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--purple)', textAlign: 'right' }}>{coinsShort(scroll.unitPrice)}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Inline mini bar chart for price history
// ────────────────────────────────────────────────────────────────────────────

function BarChart({ data, color = 'var(--blue)' }: { data: PricePoint[]; color?: string }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.7rem' }}>
        No history data
      </div>
    )
  }
  const vals = data.map(d => d.avg).filter(v => v > 0)
  if (vals.length === 0) return null
  const mx = Math.max(...vals)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
      {vals.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(4, (v / mx) * 40)}px`,
            background: color,
            borderRadius: '2px 2px 0 0',
            opacity: 0.7 + (i / vals.length) * 0.3,
          }}
        />
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main weapon card
// ────────────────────────────────────────────────────────────────────────────

type SellMode = 'lbin' | 'sellOrder'

function WeaponCard({ weapon, accentColor, scrollMode }: {
  weapon: WeaponFlip
  accentColor: string
  scrollMode: boolean
}) {
  const [sellMode, setSellMode] = useState<SellMode>('lbin')

  const sellPrice = sellMode === 'lbin' ? weapon.lbin : weapon.sellOrderPrice
  const taxedSellPrice = sellPrice * (1 - weapon.ahTax)
  const profit = scrollMode
    ? taxedSellPrice - weapon.craftCostWithScrolls
    : taxedSellPrice - weapon.craftCost
  const margin = scrollMode
    ? weapon.craftCostWithScrolls > 0 ? (profit / weapon.craftCostWithScrolls) * 100 : 0
    : weapon.craftCost > 0 ? (profit / weapon.craftCost) * 100 : 0

  const isProfitable = profit > 0
  const craftCost = scrollMode ? weapon.craftCostWithScrolls : weapon.craftCost

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
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>
              LBIN <span className="mono" style={{ color: accentColor }}>{coinsShort(weapon.lbin)}</span>
              <span style={{ margin: '0 6px', color: 'var(--border2)' }}>·</span>
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

        {/* Sell mode toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          <button
            className={`tab-btn${sellMode === 'lbin' ? ' active' : ''}`}
            onClick={() => setSellMode('lbin')}
            style={{ flex: 1, fontSize: '0.65rem' }}
          >
            LBIN (instant)
          </button>
          <button
            className={`tab-btn${sellMode === 'sellOrder' ? ' active' : ''}`}
            onClick={() => setSellMode('sellOrder')}
            style={{ flex: 1, fontSize: '0.65rem' }}
          >
            Sell Order
          </button>
        </div>
      </div>

      {/* P&L row */}
      <div style={{ margin: '0 14px 12px', background: isProfitable ? 'rgba(0,255,135,0.04)' : 'rgba(255,77,77,0.04)', border: `1px solid ${isProfitable ? 'rgba(0,255,135,0.15)' : 'rgba(255,77,77,0.15)'}`, borderRadius: 4, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Net Profit</div>
          <div className="mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: isProfitable ? 'var(--green)' : 'var(--red)', letterSpacing: '-0.02em' }}>
            {isProfitable ? '+' : ''}{coins(profit)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Craft Cost</div>
          <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--red)' }}>{coins(craftCost)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>After 2% Tax</div>
          <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 700, color: accentColor }}>{coins(taxedSellPrice)}</div>
        </div>
      </div>

      {/* Stats grid */}
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
          <div className="stat-label">Volatility</div>
          <div className="stat-value mono" style={{ fontSize: '0.85rem', color: weapon.manipulationRisk === 'HIGH' ? 'var(--red)' : weapon.manipulationRisk === 'MEDIUM' ? 'var(--gold)' : 'var(--green)' }}>
            {weapon.manipulationRisk}
          </div>
        </div>
        <div>
          <div className="stat-label">AH Tax</div>
          <div className="stat-value mono" style={{ fontSize: '0.85rem' }}>2%</div>
        </div>
      </div>

      {weapon.manipulationReason && (
        <div style={{ margin: '0 14px 12px', padding: '7px 10px', background: 'rgba(255,183,0,0.06)', border: '1px solid rgba(255,183,0,0.2)', borderRadius: 4, fontSize: '0.65rem', color: 'var(--gold)' }}>
          ⚠ {weapon.manipulationReason}
        </div>
      )}

      {/* 24h price chart */}
      <div style={{ margin: '0 14px 12px' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>24h Price History</div>
        <BarChart data={weapon.priceHistory} color={accentColor} />
        {weapon.priceHistory.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>24h ago</span>
            <span style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>now</span>
          </div>
        )}
      </div>

      <div className="divider" />

      {/* Ingredients */}
      <div style={{ padding: '10px 0 0' }}>
        <div style={{ padding: '0 14px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ingredients</div>
          <div style={{ display: 'grid', gridTemplateColumns: '56px 72px 72px 80px', gap: 8 }}>
            {['Qty','Unit','Total','24h'].map(h => (
              <div key={h} style={{ fontSize: '0.55rem', fontWeight: 700, color: 'var(--muted)', textAlign: 'right', textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>
        </div>
        {weapon.ingredients.map((ing, i) => (
          <IngredientRow key={ing.id} ing={ing} isLast={i === weapon.ingredients.length - 1 && weapon.scrollAddons.length === 0} />
        ))}
      </div>

      {weapon.scrollAddons.length > 0 && (
        <>
          <div style={{ padding: '8px 14px 6px' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Scroll Addons (optional)</div>
          </div>
          {weapon.scrollAddons.map((s, i) => (
            <ScrollRow key={s.id} scroll={s} isLast={i === weapon.scrollAddons.length - 1} />
          ))}
        </>
      )}

      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <div style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>
          Updated {new Date(weapon.lastUpdated).toLocaleTimeString()}
        </div>
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
// Side-by-side comparison panel
// ────────────────────────────────────────────────────────────────────────────

function ComparisonPanel({ hyperion, terminator }: { hyperion: WeaponFlip; terminator: WeaponFlip }) {
  const rows = [
    { label: 'Craft Cost',    h: coins(hyperion.craftCost),              t: coins(terminator.craftCost),              better: hyperion.craftCost < terminator.craftCost ? 'h' : 't' },
    { label: 'LBIN',          h: coins(hyperion.lbin),                   t: coins(terminator.lbin),                   better: hyperion.lbin > terminator.lbin ? 'h' : 't' },
    { label: 'Profit (raw)',  h: coins(hyperion.profitNoScrolls),         t: coins(terminator.profitNoScrolls),         better: hyperion.profitNoScrolls > terminator.profitNoScrolls ? 'h' : 't' },
    { label: 'Margin %',      h: `${hyperion.marginNoScrolls.toFixed(1)}%`, t: `${terminator.marginNoScrolls.toFixed(1)}%`, better: hyperion.marginNoScrolls > terminator.marginNoScrolls ? 'h' : 't' },
    { label: 'Risk',          h: hyperion.manipulationRisk,               t: terminator.manipulationRisk,               better: (hyperion.manipulationRisk === 'LOW' ? 0 : hyperion.manipulationRisk === 'MEDIUM' ? 1 : 2) < (terminator.manipulationRisk === 'LOW' ? 0 : terminator.manipulationRisk === 'MEDIUM' ? 1 : 2) ? 'h' : 't' },
    { label: 'Est. Sell',     h: hyperion.estimatedSellDays >= 99 ? '—' : `${hyperion.estimatedSellDays.toFixed(1)}d`, t: terminator.estimatedSellDays >= 99 ? '—' : `${terminator.estimatedSellDays.toFixed(1)}d`, better: hyperion.estimatedSellDays < terminator.estimatedSellDays ? 'h' : 't' },
  ]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '8px 10px', fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }} />
        <div style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--blue)', textAlign: 'center' }}>HYPERION</div>
        <div style={{ padding: '8px 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--purple)', textAlign: 'center' }}>TERMINATOR</div>
      </div>
      {rows.map((row, i) => (
        <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ padding: '9px 10px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--muted)' }}>{row.label}</div>
          <div className="mono" style={{ padding: '9px 10px', fontSize: '0.72rem', fontWeight: 700, color: row.better === 'h' ? 'var(--green)' : 'var(--text2)', textAlign: 'center', background: row.better === 'h' ? 'rgba(0,255,135,0.04)' : 'transparent' }}>
            {row.h}{row.better === 'h' && <span style={{ marginLeft: 4, fontSize: '0.55rem', color: 'var(--green)' }}>✓</span>}
          </div>
          <div className="mono" style={{ padding: '9px 10px', fontSize: '0.72rem', fontWeight: 700, color: row.better === 't' ? 'var(--green)' : 'var(--text2)', textAlign: 'center', background: row.better === 't' ? 'rgba(0,255,135,0.04)' : 'transparent' }}>
            {row.t}{row.better === 't' && <span style={{ marginLeft: 4, fontSize: '0.55rem', color: 'var(--green)' }}>✓</span>}
          </div>
        </div>
      ))}
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
              >
                REFRESH
              </button>
            </div>
            <h1 className="page-title">Weapon Craft Flips</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Live crafting profit for Hyperion &amp; Terminator. All prices from Coflnet API. AH tax 2%.
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

        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--blue)' }}>How it works</div>
          Craft cost = sum of all ingredient instabuy prices from Coflnet. Output price = AH lowest BIN. <strong style={{ color: 'var(--text)' }}>2% AH tax</strong> applied on sell. Hyperion scrolls (Implosion, Shadow Warp, Wither Shield) are optional post-craft upgrades. Toggle below to include them in margin calculation.
        </div>

        {aiSummary && (
          <div className="ai-panel">
            <div className="ai-panel-label">✦ AI Analysis — Weapon Craft Flips</div>
            <div className="ai-panel-body">{aiSummary}</div>
          </div>
        )}

        {/* Scroll mode toggle */}
        <div className="toolbar" style={{ gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text2)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Hyperion Scrolls</span>
          <button
            className={`tab-btn${!scrollMode ? ' active' : ''}`}
            onClick={() => setScrollMode(false)}
            style={{ fontSize: '0.65rem' }}
          >
            No Scrolls
          </button>
          <button
            className={`tab-btn${scrollMode ? ' active' : ''}`}
            onClick={() => setScrollMode(true)}
            style={{ fontSize: '0.65rem' }}
          >
            All 3 Scrolls
          </button>
          <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
            (scrolls add abilities, not stats — optional resell upgrade)
          </span>
        </div>

        {/* Comparison table */}
        {hyperion && terminator && !loading && (
          <ComparisonPanel hyperion={hyperion} terminator={terminator} />
        )}

        {/* Weapon cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {loading && <><SkeletonCard /><SkeletonCard /></>}
          {!loading && hyperion && (
            <WeaponCard weapon={hyperion} accentColor="var(--blue)" scrollMode={scrollMode} />
          )}
          {!loading && terminator && (
            <WeaponCard weapon={terminator} accentColor="var(--purple)" scrollMode={false} />
          )}
        </div>
      </main>
      <RefreshTimer intervalMs={3 * 60 * 1000} lastUpdated={lastUpdated} />
    </div>
  )
}
