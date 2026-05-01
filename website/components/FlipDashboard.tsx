'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBazaarFlips, FlipRow } from '@/lib/api'

type SectionId = 'bazaar' | 'craft' | 'fusion'

type SectionMeta = {
  title: string
  eyebrow: string
  description: string
  accent: string
}

const SECTION_META: Record<SectionId, SectionMeta> = {
  bazaar: {
    title: 'Bazaar Flips',
    eyebrow: 'Fast spread plays',
    description: 'Live order-book opportunities from the bazaar feed, ranked by expected profit.',
    accent: '#6c8ebf',
  },
  craft: {
    title: 'Craft Flips',
    eyebrow: 'High-volume crafts',
    description: 'Heuristic craft-style picks: strong weekly activity, healthier fill score, and solid spread.',
    accent: '#f4c430',
  },
  fusion: {
    title: 'Fusion Flips',
    eyebrow: 'Higher-margin mixes',
    description: 'Heuristic fusion-style picks: bigger percentage spread, smaller bankroll pressure, and good liquidity.',
    accent: '#7c5cbf',
  },
}

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

function SectionPill({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        padding: '4px 10px',
        background: `${accent}1A`,
        border: `1px solid ${accent}33`,
        color: accent,
        fontSize: '0.7rem',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
  )
}

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
        {[0, 1, 2, 3].map((i) => (
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

function FlipCard({
  row,
  qty,
  profitTotal,
  starred,
  blocked,
  onStar,
  onBlock,
  badge,
  accent,
}: {
  row: FlipRow
  qty: number
  profitTotal: number
  starred: boolean
  blocked: boolean
  onStar: () => void
  onBlock: () => void
  badge: string
  accent: string
}) {
  const buyP = row.buyOrder
  const sellP = row.sellOrder
  const totalCost = buyP * qty

  return (
    <div className="flip-card" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: accent }} />
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={row.iconUrl}
              alt={row.name}
              width={40}
              height={40}
              style={{ objectFit: 'contain' }}
              onError={(e) => {
                const img = e.target as HTMLImageElement
                if (!img.dataset.fallback) {
                  img.dataset.fallback = '1'
                  img.src = `https://sky.lea.moe/item/${row.id}`
                } else {
                  img.style.display = 'none'
                }
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#d1d9e6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <SectionPill label={badge} accent={accent} />
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{row.id}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button className={`icon-btn ${starred ? 'starred' : ''}`} onClick={onStar} title="Whitelist" style={{ color: starred ? '#f4c430' : 'var(--muted)' }}>⭐</button>
            <button className="icon-btn" onClick={onBlock} title="Blacklist" style={{ color: blocked ? 'var(--red)' : 'var(--muted)', fontSize: 15 }}>🚫</button>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 12, columnGap: 8 }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>Buy Price</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>{coins(buyP)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>Sell Price</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f59e0b' }}>{coins(sellP)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>Quantity</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{qty.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 3 }}>Total Cost</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{coins(totalCost)}</div>
        </div>
      </div>

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

function SectionPanel({
  id,
  meta,
  rows,
  loading,
  qtyFor,
  starred,
  blocked,
  onStar,
  onBlock,
  emptyText,
}: {
  id: SectionId
  meta: SectionMeta
  rows: FlipRow[]
  loading: boolean
  qtyFor: (row: FlipRow) => number
  starred: Set<string>
  blocked: Set<string>
  onStar: (id: string) => void
  onBlock: (id: string) => void
  emptyText: string
}) {
  const topProfit = rows[0] ? rows[0].orderProfit * qtyFor(rows[0]) : 0

  return (
    <section id={id} style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <SectionPill label={meta.eyebrow} accent={meta.accent} />
          <h2 style={{ marginTop: 10, fontSize: '1.35rem', fontWeight: 800, color: '#d1d9e6' }}>{meta.title}</h2>
          <p style={{ marginTop: 6, maxWidth: 760, color: 'var(--muted)', lineHeight: 1.5 }}>{meta.description}</p>
        </div>
        <div style={{ minWidth: 180, textAlign: 'right' }}>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Top result</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: meta.accent, marginTop: 2 }}>{coins(topProfit)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>{rows.length} matches</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

        {!loading && rows.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: 'var(--muted)', border: '1px dashed var(--border2)', borderRadius: 14, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: 10, opacity: 0.35 }}>⊘</div>
            <div style={{ fontWeight: 600 }}>{emptyText}</div>
            <div style={{ fontSize: '0.82rem', marginTop: 4, opacity: 0.7 }}>Try widening the filters or refreshing the feed.</div>
          </div>
        )}

        {!loading && rows.map((row) => {
          const qty = qtyFor(row)
          const profitTotal = row.orderProfit * qty
          return (
            <FlipCard
              key={`${id}-${row.id}`}
              row={row}
              qty={qty}
              profitTotal={profitTotal}
              starred={starred.has(row.id)}
              blocked={blocked.has(row.id)}
              onStar={() => onStar(row.id)}
              onBlock={() => onBlock(row.id)}
              badge={meta.title.replace(' Flips', '').toUpperCase()}
              accent={meta.accent}
            />
          )
        })}
      </div>
    </section>
  )
}

export default function FlipDashboard() {
  const [rows, setRows] = useState<FlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [productCount, setProductCount] = useState(0)

  const [maxMoney, setMaxMoney] = useState<number | ''>(10_000_000)
  const [maxItems, setMaxItems] = useState<number | ''>(71_680)
  const [minWeeklyBuy, setMinWeeklyBuy] = useState<number | ''>(20_000)
  const [minWeeklySell, setMinWeeklySell] = useState<number | ''>(20_000)
  const [minCurBuy, setMinCurBuy] = useState<number | ''>(0)
  const [minCurSell, setMinCurSell] = useState<number | ''>(0)
  const [showFilter, setShowFilter] = useState<'all' | 'starred'>('all')

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
    const id = window.setInterval(load, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const effectiveQty = useCallback((row: FlipRow) => {
    const budgetQty = maxMoney !== '' && maxMoney > 0 ? Math.floor(maxMoney / row.buyOrder) : Infinity
    const itemsQty = maxItems !== '' && maxItems > 0 ? maxItems : Infinity
    const cap = Math.min(budgetQty, itemsQty)
    return Math.max(1, cap === Infinity ? 1 : cap)
  }, [maxMoney, maxItems])

  const commonRows = useMemo(() => {
    return rows
      .filter((r) => !blocked.has(r.id))
      .filter((r) => minWeeklyBuy === '' || r.weeklyVolume >= minWeeklyBuy)
      .filter((r) => minWeeklySell === '' || r.sellMovingWeek >= minWeeklySell)
      .filter((r) => minCurBuy === '' || r.buyOrders >= minCurBuy)
      .filter((r) => minCurSell === '' || r.sellOrders >= minCurSell)
      .filter((r) => showFilter === 'all' || starred.has(r.id))
  }, [rows, blocked, minWeeklyBuy, minWeeklySell, minCurBuy, minCurSell, showFilter, starred])

  const bazaarRows = useMemo(() => {
    return [...commonRows].sort((a, b) => (b.orderProfit * effectiveQty(b)) - (a.orderProfit * effectiveQty(a)))
  }, [commonRows, effectiveQty])

  const craftRows = useMemo(() => {
    return [...commonRows]
      .filter((r) => r.orderProfit > 0)
      .filter((r) => r.weeklyVolume >= Math.max(30_000, typeof minWeeklyBuy === 'number' ? minWeeklyBuy : 0))
      .filter((r) => r.fillScore >= 50)
      .sort((a, b) => {
        const aScore = a.orderProfit * effectiveQty(a) * (1 + a.fillScore / 140)
        const bScore = b.orderProfit * effectiveQty(b) * (1 + b.fillScore / 140)
        return bScore - aScore
      })
  }, [commonRows, minWeeklyBuy, effectiveQty])

  const fusionRows = useMemo(() => {
    return [...commonRows]
      .filter((r) => r.orderProfit > 0)
      .filter((r) => r.orderMargin >= 8)
      .filter((r) => r.fillScore >= 35)
      .sort((a, b) => {
        const aScore = a.orderProfit * effectiveQty(a) * (1 + a.orderMargin / 75)
        const bScore = b.orderProfit * effectiveQty(b) * (1 + b.orderMargin / 75)
        return bScore - aScore
      })
  }, [commonRows, effectiveQty])

  function toggleStar(id: string) {
    setStarred((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem('bf_starred', JSON.stringify([...next]))
      return next
    })
  }

  function toggleBlock(id: string) {
    setBlocked((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem('bf_blocked', JSON.stringify([...next]))
      return next
    })
  }

  const jumpTo = (id: SectionId) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>📊</span>
            <span style={{ color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800 }}>Hypixel flipper dashboard</span>
          </div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 900, color: '#e6eefb', lineHeight: 1.05 }}>Bazaar, craft, and fusion flips in one place.</h1>
          <p style={{ marginTop: 8, maxWidth: 860, color: 'var(--muted)', lineHeight: 1.6 }}>
            Live Hypixel SkyBlock market scans. Bazaar shows the raw spreads, craft surfaces the best high-volume plays, and fusion surfaces higher-margin opportunities.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['bazaar', 'craft', 'fusion'] as SectionId[]).map((section) => (
            <button
              key={section}
              onClick={() => jumpTo(section)}
              style={{
                border: '1px solid var(--border2)',
                background: 'var(--surface)',
                color: 'var(--text)',
                borderRadius: 999,
                padding: '8px 12px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {SECTION_META[section].title}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: '0.82rem', flexWrap: 'wrap' }}>
        {!loading && lastUpdated ? (
          <>
            <div className="pulse-dot" />
            <span style={{ color: 'var(--green)' }}>✓ Data updated at {lastUpdated.toLocaleTimeString()} ({productCount} products)</span>
          </>
        ) : (
          <span style={{ color: 'var(--muted)' }}>Loading…</span>
        )}
        {error && <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠ {error}</span>}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800 }}>Market filters</div>
            <div style={{ marginTop: 5, color: 'var(--muted)', fontSize: '0.9rem' }}>Use these filters to control what shows in all three sections.</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Show:</span>
            <select
              value={showFilter}
              onChange={(e) => setShowFilter(e.target.value as 'all' | 'starred')}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border2)',
                borderRadius: 6,
                color: 'var(--text)',
                padding: '6px 10px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="all">All</option>
              <option value="starred">Starred</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '14px 20px' }}>
          <FilterField label="Max Money for Flips" value={maxMoney} onChange={setMaxMoney} />
          <FilterField label="Max Items per Flip" value={maxItems} onChange={setMaxItems} />
          <FilterField label="Min Weekly Buy Vol" value={minWeeklyBuy} onChange={setMinWeeklyBuy} />
          <FilterField label="Min Weekly Sell Vol" value={minWeeklySell} onChange={setMinWeeklySell} />
          <FilterField label="Min Current Buy Vol" value={minCurBuy} onChange={setMinCurBuy} />
          <FilterField label="Min Current Sell Vol" value={minCurSell} onChange={setMinCurSell} />
        </div>
      </div>

      <SectionPanel
        id="bazaar"
        meta={SECTION_META.bazaar}
        rows={bazaarRows.slice(0, 8)}
        loading={loading}
        qtyFor={effectiveQty}
        starred={starred}
        blocked={blocked}
        onStar={toggleStar}
        onBlock={toggleBlock}
        emptyText="No bazaar flips match your filters"
      />

      <SectionPanel
        id="craft"
        meta={SECTION_META.craft}
        rows={craftRows.slice(0, 8)}
        loading={loading}
        qtyFor={effectiveQty}
        starred={starred}
        blocked={blocked}
        onStar={toggleStar}
        onBlock={toggleBlock}
        emptyText="No craft flips match your filters"
      />

      <SectionPanel
        id="fusion"
        meta={SECTION_META.fusion}
        rows={fusionRows.slice(0, 8)}
        loading={loading}
        qtyFor={effectiveQty}
        starred={starred}
        blocked={blocked}
        onStar={toggleStar}
        onBlock={toggleBlock}
        emptyText="No fusion flips match your filters"
      />
    </div>
  )
}