'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { fetchBazaarFlips, FlipRow, iconFallbacks } from '@/lib/api'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

function ItemIcon({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  const fallbacks = iconFallbacks(id)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fallbacks[0]}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        const idx = parseInt(img.dataset.fallbackIdx ?? '0', 10)
        if (idx < fallbacks.length - 1) {
          img.dataset.fallbackIdx = String(idx + 1)
          img.src = fallbacks[idx + 1]
        } else {
          img.style.display = 'none'
        }
      }}
    />
  )
}

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 13, width: '55%', marginBottom: 7 }} />
          <div className="skeleton" style={{ height: 10, width: '35%' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 9, width: 60, marginBottom: 5 }} />
            <div className="skeleton" style={{ height: 13, width: 48 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
    </div>
  )
}

function FlipCard({
  row, qty, profitTotal, starred, blocked, onStar, onBlock,
}: {
  row: FlipRow; qty: number; profitTotal: number
  starred: boolean; blocked: boolean; onStar: () => void; onBlock: () => void
}) {
  const totalCost = row.buyOrder * qty

  const marginColor = row.orderMargin >= 5 ? 'var(--green)' : row.orderMargin >= 2 ? 'var(--gold)' : 'var(--red)'

  return (
    <div className="flip-card">
      {/* Top accent line */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, var(--blue), var(--purple))', opacity: 0.7 }} />

      {/* Header */}
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Icon */}
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <ItemIcon id={row.id} name={row.name} size={36} />
          </div>

          {/* Name + ID */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              letterSpacing: '-0.01em',
            }}>
              {row.name}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2, letterSpacing: '0.04em' }}>
              {row.id}
            </div>
          </div>

          {/* Margin chip + buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{
              fontSize: '0.68rem', fontWeight: 800, color: marginColor,
              background: `${marginColor}18`, border: `1px solid ${marginColor}35`,
              borderRadius: 99, padding: '2px 7px', letterSpacing: '0.04em',
            }}>{row.orderMargin.toFixed(1)}%</span>
            <button className={`icon-btn ${starred ? 'starred' : ''}`} onClick={onStar} title="Whitelist"
              style={{ color: starred ? 'var(--gold)' : 'var(--muted)', fontSize: 13 }}>⭐</button>
            <button className="icon-btn" onClick={onBlock} title="Blacklist"
              style={{ color: blocked ? 'var(--red)' : 'var(--muted)', fontSize: 13 }}>🚫</button>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Stats */}
      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
        <div>
          <div className="stat-label">Buy Order</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{coins(row.buyOrder)}</div>
        </div>
        <div>
          <div className="stat-label">Sell Order</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{coins(row.sellOrder)}</div>
        </div>
        <div>
          <div className="stat-label">Quantity</div>
          <div className="stat-value">{qty.toLocaleString()}</div>
        </div>
        <div>
          <div className="stat-label">Total Cost</div>
          <div className="stat-value" style={{ color: 'var(--text2)' }}>{coins(totalCost)}</div>
        </div>
      </div>

      {/* Profit */}
      <div style={{ padding: '0 12px 12px' }}>
        <div className="profit-bar">
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--green)', textTransform: 'uppercase', opacity: 0.7 }}>Est. Profit</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--green)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              +{coins(profitTotal)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Fill</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text2)' }}>{row.fillScore}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FilterField({ label, value, onChange }: {
  label: string; value: number | ''; onChange: (v: number | '') => void
}) {
  return (
    <div>
      <div className="stat-label" style={{ marginBottom: 6 }}>{label}</div>
      <input
        type="number"
        className="filter-input"
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        min={0}
      />
    </div>
  )
}

export default function FlipFinder() {
  const [rows, setRows]               = useState<FlipRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [productCount, setProductCount] = useState(0)

  const [maxMoney,      setMaxMoney]      = useState<number | ''>(10_000_000)
  const [maxItems,      setMaxItems]      = useState<number | ''>(71_680)
  const [minWeeklyBuy,  setMinWeeklyBuy]  = useState<number | ''>(20_000)
  const [minWeeklySell, setMinWeeklySell] = useState<number | ''>(20_000)
  const [minCurBuy,     setMinCurBuy]     = useState<number | ''>(0)
  const [minCurSell,    setMinCurSell]    = useState<number | ''>(0)
  const [showFilter,    setShowFilter]    = useState<'all' | 'starred'>('all')

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
      setRows(data)
      setProductCount(totalProducts)
      setLastUpdated(new Date())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  function effectiveQty(row: FlipRow): number {
    const bq = maxMoney !== '' && maxMoney > 0 ? Math.floor(maxMoney / row.buyOrder) : Infinity
    const iq = maxItems !== '' && maxItems > 0 ? maxItems : Infinity
    const mn = Math.min(bq, iq)
    return Math.max(1, mn === Infinity ? 1 : mn)
  }

  const filtered = useMemo(() => {
    return rows
      .filter(r => !blocked.has(r.id))
      .filter(r => minWeeklyBuy  === '' || r.weeklyVolume   >= minWeeklyBuy)
      .filter(r => minWeeklySell === '' || r.sellMovingWeek >= minWeeklySell)
      .filter(r => minCurBuy     === '' || r.buyOrders      >= minCurBuy)
      .filter(r => minCurSell    === '' || r.sellOrders     >= minCurSell)
      .filter(r => showFilter === 'all' || starred.has(r.id))
      .sort((a, b) => (b.orderProfit * effectiveQty(b)) - (a.orderProfit * effectiveQty(a)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, maxMoney, maxItems, minWeeklyBuy, minWeeklySell, minCurBuy, minCurSell, blocked, starred, showFilter])

  function toggleStar(id: string) {
    setStarred(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); localStorage.setItem('bf_starred', JSON.stringify([...n])); return n })
  }
  function toggleBlock(id: string) {
    setBlocked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); localStorage.setItem('bf_blocked', JSON.stringify([...n])); return n })
  }

  const topProfit = filtered[0] ? filtered[0].orderProfit * effectiveQty(filtered[0]) : 0

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="live-badge">
              <span className="pulse-dot" />
              Live
            </span>
            {lastUpdated && (
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>⚠ {error}</span>}
          </div>
          <h1 className="page-title">Order Flips</h1>
          <p style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            Post buy &amp; sell orders to capture the spread. {productCount > 0 && <span>{productCount.toLocaleString()} products tracked.</span>}
          </p>
        </div>

        {/* Top stat blocks */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="stat-block" style={{ minWidth: 120 }}>
            <div className="stat-label">Best Profit</div>
            <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
              {loading ? '—' : `+${coins(topProfit)}`}
            </div>
          </div>
          <div className="stat-block" style={{ minWidth: 120 }}>
            <div className="stat-label">Opportunities</div>
            <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
              {loading ? '—' : filtered.length.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Filter panel */}
      <div className="filter-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--blue)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>⚙ Filters</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="stat-label">Show</span>
            <select
              value={showFilter}
              onChange={e => setShowFilter(e.target.value as 'all' | 'starred')}
              className="styled-select"
            >
              <option value="all">All Items</option>
              <option value="starred">Starred Only</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 16px' }}>
          <FilterField label="Max Budget"        value={maxMoney}      onChange={setMaxMoney} />
          <FilterField label="Max Items / Flip"  value={maxItems}      onChange={setMaxItems} />
          <FilterField label="Min Weekly Buy Vol" value={minWeeklyBuy}  onChange={setMinWeeklyBuy} />
          <FilterField label="Min Weekly Sell Vol" value={minWeeklySell} onChange={setMinWeeklySell} />
          <FilterField label="Min Buy Orders"    value={minCurBuy}     onChange={setMinCurBuy} />
          <FilterField label="Min Sell Orders"   value={minCurSell}    onChange={setMinCurSell} />
        </div>
      </div>

      {/* Card grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))', gap: 14 }}>
        {loading && Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}

        {!loading && filtered.length === 0 && (
          <div style={{
            gridColumn: '1/-1', textAlign: 'center', padding: '80px 0',
            color: 'var(--muted)', border: '1px dashed var(--border2)',
            borderRadius: 16, background: 'rgba(255,255,255,0.01)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.2 }}>⊘</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>No flips match your filters</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Try lowering volume requirements or clearing hidden items</div>
          </div>
        )}

        {filtered.map(row => {
          const qty = effectiveQty(row)
          return (
            <FlipCard
              key={row.id}
              row={row}
              qty={qty}
              profitTotal={row.orderProfit * qty}
              starred={starred.has(row.id)}
              blocked={blocked.has(row.id)}
              onStar={() => toggleStar(row.id)}
              onBlock={() => toggleBlock(row.id)}
            />
          )
        })}
      </div>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
