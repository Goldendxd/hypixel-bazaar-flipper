'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBazaarFlips, FlipRow } from '@/lib/api'
import RefreshTimer from '@/components/RefreshTimer'
import { AnimatedNumber, Chip, ItemIcon, PageHead, SkelRows, StatCard, Void, coins, coinsShort } from '@/components/ui'

// Realistic execution: cap quantity at 5% of the thinner side's weekly flow —
// beyond that you ARE the market.
const FLOW_CAPTURE = 0.05

function realisticQty(row: FlipRow, budget: number | '', maxItems: number | ''): number {
  const byBudget = budget !== '' && budget > 0 ? Math.floor(budget / row.buyOrder) : Infinity
  const byItems = maxItems !== '' && maxItems > 0 ? maxItems : Infinity
  const byMarket = Math.max(1, Math.floor(Math.min(row.weeklyVolume, row.sellMovingWeek) * FLOW_CAPTURE))
  const q = Math.min(byBudget, byItems, byMarket)
  return Math.max(0, q === Infinity ? 1 : q)
}

const GRID = '30px minmax(170px, 1.5fr) 92px 92px 70px 92px 84px 104px 58px 64px'

type SortKey = 'estProfit' | 'margin' | 'profitItem' | 'fill'

export default function FlipFinder() {
  const [rows, setRows] = useState<FlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [productCount, setProductCount] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [budget, setBudget] = useState<number | ''>(10_000_000)
  const [maxItems, setMaxItems] = useState<number | ''>(71_680)
  const [minVolume, setMinVolume] = useState<number | ''>(20_000)
  const [hideManip, setHideManip] = useState(true)
  const [showFilter, setShowFilter] = useState<'all' | 'starred'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('estProfit')

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
        if (sortKey === 'margin') return b.row.orderMargin - a.row.orderMargin
        if (sortKey === 'profitItem') return b.row.orderProfit - a.row.orderProfit
        if (sortKey === 'fill') return b.row.fillProbability - a.row.fillProbability
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
    { label: 'Buy Order', align: 'right' },
    { label: 'Sell Order', align: 'right' },
    { label: 'Margin', sort: 'margin', align: 'right' },
    { label: 'Profit/it', sort: 'profitItem', align: 'right' },
    { label: 'Real Qty', align: 'right' },
    { label: 'Est Profit', sort: 'estProfit', align: 'right' },
    { label: 'Fill', sort: 'fill', align: 'right' },
    { label: '' },
  ]

  return (
    <div>
      <PageHead
        title="Order"
        highlight="Flips"
        sub={<>Post paired buy + sell orders to capture the spread — quantity capped at {FLOW_CAPTURE * 100}% of real weekly flow{productCount > 0 && <> · <span className="mono">{productCount.toLocaleString()}</span> products scanned</>}</>}
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Best realistic" value={topEst} format={(n) => `+${coinsShort(n)}`} accent="var(--green)" sub="Top opportunity" />
        <StatCard label="Opportunities" value={enriched.length} accent="var(--gold)" sub="Passing filters" />
      </PageHead>

      <div className="bar">
        <div className="field">
          <label>Budget</label>
          <input type="number" value={budget} min={0}
            onChange={e => setBudget(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Max items</label>
          <input type="number" value={maxItems} min={0}
            onChange={e => setMaxItems(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Min wk vol</label>
          <input type="number" value={minVolume} min={0}
            onChange={e => setMinVolume(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button className={`pill${hideManip ? ' on-green' : ''}`} onClick={() => setHideManip(v => !v)}>
          {hideManip ? '✓ Manip filter' : 'Manip filter off'}
        </button>
        <button className={`pill${showFilter === 'starred' ? ' on' : ''}`} onClick={() => setShowFilter(f => f === 'all' ? 'starred' : 'all')}>
          ★ Starred
        </button>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--faint)' }}>
          QTY = MIN(BUDGET, MAX ITEMS, {FLOW_CAPTURE * 100}% WK FLOW)
        </span>
      </div>

      <div className="grid-table">
        <div className="gt-head" style={{ gridTemplateColumns: GRID }}>
          {HEAD.map((h, i) => (
            <div
              key={i}
              className={h.sort ? `sortable${sortKey === h.sort ? ' sorted' : ''}` : undefined}
              onClick={h.sort ? () => setSortKey(h.sort!) : undefined}
              style={{ textAlign: h.align ?? 'left' }}
            >
              {h.label}{h.sort && sortKey === h.sort ? ' ▾' : ''}
            </div>
          ))}
        </div>

        {loading && <SkelRows n={10} />}

        {!loading && enriched.length === 0 && (
          <Void glyph="⊘" title="No flips match your filters" sub="Lower the volume requirement or disable the manipulation filter" />
        )}

        {!loading && enriched.map(({ row, qty, estProfit }, i) => {
          const isOpen = expanded === row.id
          const marginColor = row.orderMargin >= 8 ? 'var(--green)' : row.orderMargin >= 3 ? 'var(--gold)' : 'var(--dim)'
          const fillColor = row.fillProbability > 60 ? 'var(--green)' : row.fillProbability > 30 ? 'var(--gold)' : 'var(--red)'
          return (
            <div key={row.id}>
              <div className="gt-row" style={{ gridTemplateColumns: GRID }} onClick={() => setExpanded(isOpen ? null : row.id)}>
                <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--faint)' }}>{i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <div className="ifr" style={{ width: 30, height: 30 }}><ItemIcon id={row.id} size={24} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.81rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {row.name}
                      {row.manipulationFlag && <Chip label="⚠" tone="red" />}
                      {starred.has(row.id) && <span style={{ color: 'var(--gold-hi)', fontSize: '0.65rem' }}>★</span>}
                    </div>
                    <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--faint)' }}>
                      vol {coinsShort(Math.min(row.weeklyVolume, row.sellMovingWeek))}/wk
                    </div>
                  </div>
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, color: 'var(--blue)' }}>{coins(row.buyOrder)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, color: 'var(--gold-hi)' }}>{coins(row.sellOrder)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: marginColor }}>{row.orderMargin.toFixed(1)}%</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 600 }}>{coins(row.orderProfit)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--dim)' }}>{qty.toLocaleString()}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.83rem', fontWeight: 800, color: 'var(--green)' }}>+{coinsShort(estProfit)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.74rem', fontWeight: 700, color: fillColor }}>{row.fillProbability}%</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <button className={`iconbtn${starred.has(row.id) ? ' lit' : ''}`} onClick={(e) => { e.stopPropagation(); toggleStar(row.id) }} title="Star">★</button>
                  <button className="iconbtn" onClick={(e) => { e.stopPropagation(); toggleBlock(row.id) }} title="Hide">✕</button>
                </div>
              </div>

              {isOpen && (
                <div className="gt-expand">
                  {row.manipulationFlag && (
                    <div style={{ marginBottom: 10, fontSize: '0.76rem', color: 'var(--red)', fontWeight: 700 }}>
                      ⚠ {row.manipulationReason}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Total cost', val: coinsShort(row.buyOrder * qty), color: 'var(--red)' },
                      { label: 'Liquidity score', val: `${row.liquidityScore}/100`, color: row.liquidityScore > 60 ? 'var(--green)' : 'var(--gold)' },
                      { label: 'Stability', val: `${row.stabilityScore}/100`, color: row.stabilityScore > 60 ? 'var(--green)' : 'var(--gold)' },
                      { label: 'Hourly flow', val: `${coinsShort(row.hourlyThroughput)} items`, color: 'var(--text)' },
                      { label: 'Weekly buys', val: coinsShort(row.weeklyVolume), color: 'var(--text)' },
                      { label: 'Weekly sells', val: coinsShort(row.sellMovingWeek), color: 'var(--text)' },
                      { label: 'Open buy orders', val: row.buyOrders.toLocaleString(), color: 'var(--dim)' },
                      { label: 'Open sell orders', val: row.sellOrders.toLocaleString(), color: 'var(--dim)' },
                      { label: 'Insta-flip P/L', val: coins(row.instantProfit), color: row.instantProfit > 0 ? 'var(--green)' : 'var(--red)' },
                    ].map(({ label, val, color }) => (
                      <div key={label}>
                        <div className="mini-label">{label}</div>
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
