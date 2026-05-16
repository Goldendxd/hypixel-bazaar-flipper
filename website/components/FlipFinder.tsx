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
    <div className="flip-card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 11, width: '60%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 9, width: '40%' }} />
        </div>
        <div className="skeleton" style={{ height: 20, width: 44, borderRadius: 3 }} />
      </div>
      <div className="divider" style={{ marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px', marginBottom: 10 }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 8, width: 52, marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 12, width: 44 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 36, borderRadius: 4 }} />
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
      <div className="card-accent" style={{ background: `linear-gradient(90deg, var(--blue), var(--purple))` }} />
      <div className="card-header">
        <div className="icon-box">
          <ItemIcon id={row.id} name={row.name} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-name">{row.name}</div>
          <div className="card-sub">{row.id}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span className="mono" style={{
            fontSize: '0.72rem', fontWeight: 700, color: marginColor,
            background: `${marginColor}15`, border: `1px solid ${marginColor}30`,
            borderRadius: 3, padding: '2px 6px',
          }}>{row.orderMargin.toFixed(1)}%</span>
          <button className={`icon-btn${starred ? ' starred' : ''}`} onClick={onStar} title="Star" style={{ fontSize: 12 }}>★</button>
          <button className="icon-btn" onClick={onBlock} title="Block" style={{ fontSize: 12, color: blocked ? 'var(--red)' : undefined }}>✕</button>
        </div>
      </div>

      <div className="divider" />

      <div className="card-stats">
        <div>
          <div className="stat-label">Buy Order</div>
          <div className="stat-value mono" style={{ color: 'var(--blue)', fontSize: '0.9rem' }}>{coins(row.buyOrder)}</div>
        </div>
        <div>
          <div className="stat-label">Sell Order</div>
          <div className="stat-value mono" style={{ color: 'var(--cyan)', fontSize: '0.9rem' }}>{coins(row.sellOrder)}</div>
        </div>
        <div>
          <div className="stat-label">Qty ({coins(totalCost)})</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem' }}>{qty.toLocaleString()}</div>
        </div>
        <div>
          <div className="stat-label">Fill Score</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem', color: 'var(--text2)' }}>{row.fillScore}</div>
        </div>
      </div>

      <div className="profit-row">
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Est. Profit</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--green)', letterSpacing: '-0.02em' }}>+{coins(profitTotal)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Weekly Buy</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)' }}>{coins(row.weeklyVolume)}</div>
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
      <div className="stat-label" style={{ marginBottom: 4 }}>{label}</div>
      <input
        type="number"
        className="filter-input"
        style={{ width: '100%' }}
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
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {lastUpdated
              ? <span className="live-badge"><span className="pulse-dot" />Live</span>
              : <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Loading…</span>}
            {lastUpdated && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lastUpdated.toLocaleTimeString()}</span>}
            {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
          </div>
          <h1 className="page-title">Order Flips</h1>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            Post buy + sell orders to capture the spread.{' '}
            {productCount > 0 && <span style={{ color: 'var(--text2)' }}>{productCount.toLocaleString()} products tracked.</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="stat-block" style={{ minWidth: 110 }}>
            <div className="stat-label">Best Profit</div>
            <div className="stat-value mono" style={{ color: 'var(--green)', marginTop: 4 }}>
              {loading ? '—' : `+${coins(topProfit)}`}
            </div>
          </div>
          <div className="stat-block" style={{ minWidth: 100 }}>
            <div className="stat-label">Opportunities</div>
            <div className="stat-value mono" style={{ marginTop: 4 }}>
              {loading ? '—' : filtered.length}
            </div>
          </div>
        </div>
      </div>

      <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text2)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Filters</span>
          <select value={showFilter} onChange={e => setShowFilter(e.target.value as 'all' | 'starred')} className="styled-select" style={{ fontSize: '0.75rem' }}>
            <option value="all">All Items</option>
            <option value="starred">Starred Only</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px 14px' }}>
          <FilterField label="Max Budget"         value={maxMoney}      onChange={setMaxMoney} />
          <FilterField label="Max Items / Flip"   value={maxItems}      onChange={setMaxItems} />
          <FilterField label="Min Weekly Buy Vol"  value={minWeeklyBuy}  onChange={setMinWeeklyBuy} />
          <FilterField label="Min Weekly Sell Vol" value={minWeeklySell} onChange={setMinWeeklySell} />
          <FilterField label="Min Buy Orders"      value={minCurBuy}     onChange={setMinCurBuy} />
          <FilterField label="Min Sell Orders"     value={minCurSell}    onChange={setMinCurSell} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: 10 }}>
        {loading && Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}

        {!loading && filtered.length === 0 && (
          <div style={{
            gridColumn: '1/-1', textAlign: 'center', padding: '60px 0',
            color: 'var(--muted)', border: '1px dashed var(--border)',
            borderRadius: 6,
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.15 }}>⊘</div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>No flips match your filters</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Try lowering volume requirements or clearing blocked items</div>
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
