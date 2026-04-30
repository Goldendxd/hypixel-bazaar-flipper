'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { fetchBazaarFlips, FlipRow } from '@/lib/api'

// ── helpers ───────────────────────────────────────────────────────────────────

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

// ── skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 11, width: '40%' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 10, width: 70, marginBottom: 5 }} />
            <div className="skeleton" style={{ height: 14, width: 50 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 42, borderRadius: 6 }} />
    </div>
  )
}

// ── flip card ─────────────────────────────────────────────────────────────────

function FlipCard({
  row, qty, profitTotal, starred, blocked,
  onStar, onBlock,
}: {
  row: FlipRow
  qty: number
  profitTotal: number
  starred: boolean
  blocked: boolean
  onStar: () => void
  onBlock: () => void
}) {
  const buyP = row.buyOrder
  const sellP = row.sellOrder
  const totalCost = buyP * qty

  return (
    <div className="flip-card">
      {/* Card header */}
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
            background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Image
              src={row.iconUrl}
              alt={row.name}
              width={40}
              height={40}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#d1d9e6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.name}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
              {row.id}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              className={`icon-btn ${starred ? 'starred' : ''}`}
              onClick={onStar}
              title="Whitelist"
              style={{ color: starred ? '#f4c430' : 'var(--muted)' }}
            >⭐</button>
            <button
              className="icon-btn"
              onClick={onBlock}
              title="Blacklist"
              style={{ color: blocked ? 'var(--red)' : 'var(--muted)', fontSize: 15 }}
            >🚫</button>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 12, columnGap: 8 }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>
            Buy Price
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
            {coins(buyP)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>
            Sell Price
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>
            {coins(sellP)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>
            Quantity
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
            {qty.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>
            Total Cost
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
            {coins(totalCost)}
          </div>
        </div>
      </div>

      {/* Profit bar */}
      <div style={{ padding: '0 14px 14px' }}>
        <div className="profit-bar">
          <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--green)', textTransform: 'uppercase' }}>
            Est. Profit
          </span>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
            +{coins(profitTotal)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── filter input ──────────────────────────────────────────────────────────────

function FilterField({ label, value, onChange }: { label: string; value: number | ''; onChange: (v: number | '') => void }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
        {label}
      </div>
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

// ── main component ────────────────────────────────────────────────────────────

export default function FlipFinder() {
  const [rows, setRows] = useState<FlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [productCount, setProductCount] = useState(0)

  // Filters
  const [maxMoney, setMaxMoney]           = useState<number | ''>(10_000_000)
  const [maxItems, setMaxItems]           = useState<number | ''>(71_680)
  const [minWeeklyBuy, setMinWeeklyBuy]   = useState<number | ''>(10_000)
  const [minWeeklySell, setMinWeeklySell] = useState<number | ''>(10_000)
  const [minCurBuy, setMinCurBuy]         = useState<number | ''>(1_000)
  const [minCurSell, setMinCurSell]       = useState<number | ''>(1_000)

  const [showFilter, setShowFilter] = useState<'all' | 'starred'>('all')
  const [starred, setStarred]   = useState<Set<string>>(new Set())
  const [blocked, setBlocked]   = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const data = await fetchBazaarFlips()
      setRows(data)
      setProductCount(data.length)
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

  // Effective quantity for a row given budget + maxItems
  function effectiveQty(row: FlipRow): number {
    const budgetQty = maxMoney !== '' && maxMoney > 0
      ? Math.floor(maxMoney / row.buyOrder)
      : Infinity
    const itemsQty = maxItems !== '' && maxItems > 0 ? maxItems : Infinity
    return Math.max(1, Math.min(budgetQty, itemsQty) === Infinity ? 1 : Math.min(budgetQty, itemsQty))
  }

  const filtered = useMemo(() => {
    return rows
      .filter((r) => !blocked.has(r.id))
      .filter((r) => r.orderProfit > 0)
      .filter((r) => minWeeklyBuy   === '' || r.weeklyVolume      >= minWeeklyBuy)
      .filter((r) => minWeeklySell  === '' || r.sellMovingWeek    >= minWeeklySell)
      .filter((r) => minCurBuy      === '' || r.buyOrders         >= minCurBuy)
      .filter((r) => minCurSell     === '' || r.sellOrders        >= minCurSell)
      .filter((r) => showFilter === 'all' || starred.has(r.id))
      .sort((a, b) => {
        const aqty = effectiveQty(a)
        const bqty = effectiveQty(b)
        return (b.orderProfit * bqty) - (a.orderProfit * aqty)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, maxMoney, maxItems, minWeeklyBuy, minWeeklySell, minCurBuy, minCurSell, blocked, starred, showFilter])

  function toggleStar(id: string) {
    setStarred((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleBlock(id: string) {
    setBlocked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#d1d9e6' }}>Best Flips</h1>

        {/* Show dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Show:</span>
          <select
            value={showFilter}
            onChange={(e) => setShowFilter(e.target.value as 'all' | 'starred')}
            style={{
              background: 'var(--surface2)', border: '1px solid var(--border2)',
              borderRadius: 6, color: 'var(--text)', padding: '6px 10px',
              fontSize: '0.85rem', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="all">All</option>
            <option value="starred">Starred</option>
          </select>
        </div>
      </div>

      {/* Data updated line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: '0.82rem' }}>
        {!loading && lastUpdated ? (
          <>
            <div className="pulse-dot" />
            <span style={{ color: 'var(--green)' }}>
              ✓ Data updated at {lastUpdated.toLocaleTimeString()} ({productCount} products)
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--muted)' }}>Loading…</span>
        )}
        {error && <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠ {error}</span>}
      </div>

      {/* Filter panel */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '18px 20px', marginBottom: 24,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '14px 20px' }}>
          <FilterField label="Max Money for Flips" value={maxMoney}      onChange={setMaxMoney} />
          <FilterField label="Max Items per Flip"  value={maxItems}      onChange={setMaxItems} />
          <FilterField label="Min Weekly Buy Vol"  value={minWeeklyBuy}  onChange={setMinWeeklyBuy} />
          <FilterField label="Min Weekly Sell Vol" value={minWeeklySell} onChange={setMinWeeklySell} />
          <FilterField label="Min Current Buy Vol" value={minCurBuy}     onChange={setMinCurBuy} />
          <FilterField label="Min Current Sell Vol" value={minCurSell}   onChange={setMinCurSell} />
        </div>
      </div>

      {/* Card grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}

        {!loading && filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.3 }}>⊘</div>
            <div style={{ fontWeight: 600 }}>No profitable flips match your filters</div>
            <div style={{ fontSize: '0.82rem', marginTop: 4, opacity: 0.6 }}>Try raising the budget or lowering volume requirements</div>
          </div>
        )}

        {filtered.map((row) => {
          const qty = effectiveQty(row)
          const profitTotal = row.orderProfit * qty
          return (
            <FlipCard
              key={row.id}
              row={row}
              qty={qty}
              profitTotal={profitTotal}
              starred={starred.has(row.id)}
              blocked={blocked.has(row.id)}
              onStar={() => toggleStar(row.id)}
              onBlock={() => toggleBlock(row.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
