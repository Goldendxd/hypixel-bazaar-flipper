'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { fetchBazaarFlips, FlipRow, iconFallbacks } from '@/lib/api'
import RefreshTimer from '@/components/RefreshTimer'
import { AnimatedNumber, coinsShort, Tag } from '@/components/ui'

function coins(n: number): string {
  if (!isFinite(n)) return '—'
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`
  return `${s}${a.toFixed(1)}`
}

function ItemIcon({ id, name, size = 28 }: { id: string; name: string; size?: number }) {
  const fallbacks = iconFallbacks(id)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fallbacks[0]} alt={name} width={size} height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        const idx = parseInt(img.dataset.fallbackIdx ?? '0', 10)
        if (idx < fallbacks.length - 1) { img.dataset.fallbackIdx = String(idx + 1); img.src = fallbacks[idx + 1] }
        else img.style.display = 'none'
      }}
    />
  )
}

// Realistic execution: you can capture only a slice of real market flow.
// Cap quantity at 5% of the thinner side's weekly volume — beyond that you ARE the market.
const FLOW_CAPTURE = 0.05

function realisticQty(row: FlipRow, budget: number | '', maxItems: number | ''): number {
  const byBudget = budget !== '' && budget > 0 ? Math.floor(budget / row.buyOrder) : Infinity
  const byItems  = maxItems !== '' && maxItems > 0 ? maxItems : Infinity
  const byMarket = Math.max(1, Math.floor(Math.min(row.weeklyVolume, row.sellMovingWeek) * FLOW_CAPTURE))
  const q = Math.min(byBudget, byItems, byMarket)
  return Math.max(0, q === Infinity ? 1 : q)
}

const GRID = '30px minmax(170px, 1.5fr) 92px 92px 70px 92px 84px 104px 58px 64px'

type SortKey = 'estProfit' | 'margin' | 'profitItem' | 'fill'

export default function FlipFinder() {
  const [rows, setRows]               = useState<FlipRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [productCount, setProductCount] = useState(0)
  const [expanded, setExpanded]       = useState<string | null>(null)

  const [budget, setBudget]           = useState<number | ''>(10_000_000)
  const [maxItems, setMaxItems]       = useState<number | ''>(71_680)
  const [minVolume, setMinVolume]     = useState<number | ''>(20_000)
  const [hideManip, setHideManip]     = useState(true)
  const [showFilter, setShowFilter]   = useState<'all' | 'starred'>('all')
  const [sortKey, setSortKey]         = useState<SortKey>('estProfit')

  const [starred, setStarred] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('bf_starred') ?? '[]')) } catch { return new Set() }
  })
  const [blocked, setBlocked] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('bf_blocked') ?? '[]')) } catch { return new Set() }
  })

  const load = useCallback(async () => {
    try {
      const { rows: data, totalProducts } = await fetchBazaarFlips()
      setRows(data); setProductCount(totalProducts)
      setLastUpdated(new Date()); setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const enriched = useMemo(() => {
    return rows
      .filter(r => !blocked.has(r.id))
      .filter(r => !hideManip || !r.manipulationFlag)
      .filter(r => minVolume === '' || Math.min(r.weeklyVolume, r.sellMovingWeek) >= minVolume)
      .filter(r => showFilter === 'all' || starred.has(r.id))
      .map(r => {
        const qty = realisticQty(r, budget, maxItems)
        return { row: r, qty, estProfit: r.orderProfit * qty }
      })
      .filter(x => x.qty > 0 && x.estProfit > 0)
      .sort((a, b) => {
        if (sortKey === 'margin')     return b.row.orderMargin - a.row.orderMargin
        if (sortKey === 'profitItem') return b.row.orderProfit - a.row.orderProfit
        if (sortKey === 'fill')       return b.row.fillProbability - a.row.fillProbability
        return b.estProfit - a.estProfit
      })
      .slice(0, 60)
  }, [rows, budget, maxItems, minVolume, blocked, starred, showFilter, hideManip, sortKey])

  function toggleStar(id: string) {
    setStarred(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); localStorage.setItem('bf_starred', JSON.stringify([...n])); return n })
  }
  function toggleBlock(id: string) {
    setBlocked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); localStorage.setItem('bf_blocked', JSON.stringify([...n])); return n })
  }

  const topEst = enriched[0]?.estProfit ?? 0

  const HEAD: Array<{ label: string; sort?: SortKey; align?: 'right' }> = [
    { label: '#' },
    { label: 'Item' },
    { label: 'Buy Order',  align: 'right' },
    { label: 'Sell Order', align: 'right' },
    { label: 'Margin',     sort: 'margin', align: 'right' },
    { label: 'Profit/it',  sort: 'profitItem', align: 'right' },
    { label: 'Real Qty',   align: 'right' },
    { label: 'Est Profit', sort: 'estProfit', align: 'right' },
    { label: 'Fill',       sort: 'fill', align: 'right' },
    { label: '' },
  ]

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            {lastUpdated
              ? <span className="live-badge"><span className="pulse-dot" />Live</span>
              : <span style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>Connecting…</span>}
            {lastUpdated && <span className="mono" style={{ fontSize: '0.68rem', color: 'var(--text2)' }}>{lastUpdated.toLocaleTimeString()}</span>}
            {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
          </div>
          <h1 className="page-title">Order Flips</h1>
          <p className="page-subtitle">
            Post buy + sell orders to capture the spread · profit capped at {FLOW_CAPTURE * 100}% of real weekly flow
            {productCount > 0 && <> · <span className="mono" style={{ color: 'var(--text2)' }}>{productCount.toLocaleString()}</span> products</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="stat-block" style={{ minWidth: 130 }}>
            <div className="stat-label">Best Realistic</div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>
              {loading ? '—' : <AnimatedNumber value={topEst} format={(n) => `+${coinsShort(n)}`} />}
            </div>
          </div>
          <div className="stat-block" style={{ minWidth: 110 }}>
            <div className="stat-label">Opportunities</div>
            <div className="stat-value">{loading ? '—' : enriched.length}</div>
          </div>
        </div>
      </div>

      {/* ── Control strip ── */}
      <div className="toolbar">
        <div className="control-field">
          <label>Budget</label>
          <input type="number" value={budget} min={0}
            onChange={e => setBudget(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <div className="control-field">
          <label>Max Items</label>
          <input type="number" value={maxItems} min={0}
            onChange={e => setMaxItems(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <div className="control-field">
          <label>Min Wk Vol</label>
          <input type="number" value={minVolume} min={0}
            onChange={e => setMinVolume(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button
          className={`tab-btn${hideManip ? ' active-green' : ''}`}
          onClick={() => setHideManip(v => !v)}
          title="Filter out manipulated / fake-margin items"
        >
          {hideManip ? '✓ Manip filter' : 'Manip filter off'}
        </button>
        <button
          className={`tab-btn${showFilter === 'starred' ? ' active-gold' : ''}`}
          onClick={() => setShowFilter(f => f === 'all' ? 'starred' : 'all')}
        >
          ★ Starred
        </button>
        <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          QTY = MIN(BUDGET, MAX ITEMS, {FLOW_CAPTURE * 100}% WK FLOW)
        </span>
      </div>

      {/* ── Terminal table ── */}
      <div className="term-table">
        <div className="term-head" style={{ gridTemplateColumns: GRID }}>
          {HEAD.map((h, i) => (
            <div
              key={i}
              onClick={h.sort ? () => setSortKey(h.sort!) : undefined}
              style={{
                textAlign: h.align ?? 'left',
                cursor: h.sort ? 'pointer' : 'default',
                color: h.sort && sortKey === h.sort ? 'var(--cyan)' : undefined,
                userSelect: 'none',
              }}
            >
              {h.label}{h.sort && sortKey === h.sort ? ' ▾' : ''}
            </div>
          ))}
        </div>

        {loading && Array.from({ length: 10 }).map((_, i) => (
          <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
            <div className="skeleton" style={{ height: 30 }} />
          </div>
        ))}

        {!loading && enriched.length === 0 && (
          <div style={{ textAlign: 'center', padding: '54px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: '1.6rem', marginBottom: 8, opacity: 0.2 }}>⊘</div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 3, color: 'var(--text2)' }}>No flips match your filters</div>
            <div style={{ fontSize: '0.72rem', opacity: 0.6 }}>Lower the volume requirement or disable the manipulation filter</div>
          </div>
        )}

        {!loading && enriched.map(({ row, qty, estProfit }, i) => {
          const isOpen = expanded === row.id
          const marginColor = row.orderMargin >= 8 ? 'var(--green)' : row.orderMargin >= 3 ? 'var(--gold)' : 'var(--text2)'
          const fillColor   = row.fillProbability > 60 ? 'var(--green)' : row.fillProbability > 30 ? 'var(--gold)' : 'var(--red)'
          return (
            <div key={row.id}>
              <div
                className="term-row"
                style={{ gridTemplateColumns: GRID }}
                onClick={() => setExpanded(isOpen ? null : row.id)}
              >
                <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--muted)' }}>{i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <div style={{ width: 30, height: 30, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    <ItemIcon id={row.id} name={row.name} size={24} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {row.name}
                      {row.manipulationFlag && <Tag label="⚠" color="var(--red)" />}
                      {starred.has(row.id) && <span style={{ color: 'var(--gold)', fontSize: '0.65rem' }}>★</span>}
                    </div>
                    <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      vol {coinsShort(Math.min(row.weeklyVolume, row.sellMovingWeek))}/wk
                    </div>
                  </div>
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, color: 'var(--blue)' }}>{coins(row.buyOrder)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, color: 'var(--cyan)' }}>{coins(row.sellOrder)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: marginColor }}>{row.orderMargin.toFixed(1)}%</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>{coins(row.orderProfit)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text2)' }}>{qty.toLocaleString()}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.82rem', fontWeight: 800, color: 'var(--green)' }}>+{coinsShort(estProfit)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.74rem', fontWeight: 700, color: fillColor }}>{row.fillProbability}%</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <button className={`icon-btn${starred.has(row.id) ? ' starred' : ''}`} onClick={(e) => { e.stopPropagation(); toggleStar(row.id) }} title="Star">★</button>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); toggleBlock(row.id) }} title="Hide">✕</button>
                </div>
              </div>

              {isOpen && (
                <div className="term-expand">
                  {row.manipulationFlag && (
                    <div style={{ marginBottom: 10, fontSize: '0.74rem', color: 'var(--red)', fontWeight: 600 }}>
                      ⚠ {row.manipulationReason}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Total Cost',      val: coinsShort(row.buyOrder * qty),       color: 'var(--red)' },
                      { label: 'Liquidity Score', val: `${row.liquidityScore}/100`,           color: row.liquidityScore > 60 ? 'var(--green)' : 'var(--gold)' },
                      { label: 'Stability',       val: `${row.stabilityScore}/100`,           color: row.stabilityScore > 60 ? 'var(--green)' : 'var(--gold)' },
                      { label: 'Hourly Flow',     val: `${coinsShort(row.hourlyThroughput)} items`, color: 'var(--text)' },
                      { label: 'Weekly Buys',     val: coinsShort(row.weeklyVolume),          color: 'var(--text)' },
                      { label: 'Weekly Sells',    val: coinsShort(row.sellMovingWeek),        color: 'var(--text)' },
                      { label: 'Open Buy Orders', val: row.buyOrders.toLocaleString(),        color: 'var(--text2)' },
                      { label: 'Open Sell Orders', val: row.sellOrders.toLocaleString(),      color: 'var(--text2)' },
                      { label: 'Insta-flip P/L',  val: coins(row.instantProfit),              color: row.instantProfit > 0 ? 'var(--green)' : 'var(--red)' },
                    ].map(({ label, val, color }) => (
                      <div key={label}>
                        <div style={{ fontSize: '0.56rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, fontFamily: 'var(--font-mono)' }}>{label}</div>
                        <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
