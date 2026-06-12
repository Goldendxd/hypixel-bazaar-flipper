'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBazaarFlips, FlipRow } from '@/lib/api'
import RefreshTimer from '@/components/RefreshTimer'
import { Chip, FlipCard, FlipGrid, FlipSkeletons, PageHead, SortSelect, StatCard, Void, coins, coinsShort } from '@/components/ui'
import { STRATEGIES, StrategyMode } from '@/lib/strategy'
import { useDebounced } from '@/components/hooks'

// Realistic execution: cap quantity at 5% of the thinner side's weekly flow —
// beyond that you ARE the market.
const FLOW_CAPTURE = 0.05

// ── Execution modes ──────────────────────────────────────────────────────────
// Conservative: buy order in → sell offer out (max margin, slowest)
// Fast:         instant buy → instant sell (immediate, usually negative)
// Hybrid:       buy order in → instant sell out (patient entry, instant exit)
type ExecMode = 'CONSERVATIVE' | 'FAST' | 'HYBRID'

const MODES: Array<{ key: ExecMode; label: string; hint: string }> = [
  { key: 'CONSERVATIVE', label: 'Conservative', hint: 'Buy order → sell offer' },
  { key: 'HYBRID',       label: 'Hybrid',       hint: 'Buy order → insta-sell' },
  { key: 'FAST',         label: 'Fast',         hint: 'Insta-buy → insta-sell' },
]

function modeNumbers(r: FlipRow, mode: ExecMode) {
  if (mode === 'FAST') return { buy: r.instantBuyPrice, sell: r.instantSellPrice, profit: r.instantProfit, margin: r.instantMargin }
  if (mode === 'HYBRID') return { buy: r.buyOrder, sell: r.instantSellPrice, profit: r.hybridProfit, margin: r.hybridMargin }
  return { buy: r.buyOrder, sell: r.sellOrder, profit: r.orderProfit, margin: r.orderMargin }
}

function realisticQty(r: FlipRow, buyPrice: number, budget: number | '', maxItems: number | ''): number {
  const byBudget = budget !== '' && budget > 0 ? Math.floor(budget / buyPrice) : Infinity
  const byItems = maxItems !== '' && maxItems > 0 ? maxItems : Infinity
  const byMarket = Math.max(1, Math.floor(Math.min(r.weeklyVolume, r.sellMovingWeek) * FLOW_CAPTURE))
  const q = Math.min(byBudget, byItems, byMarket)
  return Math.max(0, q === Infinity ? 1 : q)
}

type SortKey = 'estProfit' | 'margin' | 'profitItem' | 'fill'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'estProfit', label: 'Est. net profit' },
  { key: 'margin', label: 'Margin %' },
  { key: 'profitItem', label: 'Net per item' },
  { key: 'fill', label: 'Fill probability' },
]

export default function FlipFinder() {
  const [rows, setRows] = useState<FlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [productCount, setProductCount] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [mode, setMode] = useState<ExecMode>('CONSERVATIVE')
  const [strategy, setStrategy] = useState<StrategyMode>('BALANCED')
  const [budget, setBudget] = useState<number | ''>(10_000_000)
  const [maxItems, setMaxItems] = useState<number | ''>(71_680)
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounced(searchRaw)
  const [sortKey, setSortKey] = useState<SortKey>('estProfit')

  const [starred, setStarred] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('bf_starred') ?? '[]')) } catch { return new Set() }
  })
  const [blocked, setBlocked] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try { return new Set(JSON.parse(localStorage.getItem('bf_blocked') ?? '[]')) } catch { return new Set() }
  })
  const [showFilter, setShowFilter] = useState<'all' | 'starred'>('all')

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

  const preset = STRATEGIES[strategy]

  const enriched = useMemo(() => {
    return rows
      .filter(r => !blocked.has(r.id))
      .filter(r => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
      .filter(r => !preset.hideManipulated || !r.manipulationFlag)
      .filter(r => Math.min(r.weeklyVolume, r.sellMovingWeek) >= preset.minVolume)
      .filter(r => showFilter === 'all' || starred.has(r.id))
      .map(r => {
        const nums = modeNumbers(r, mode)
        const qty = realisticQty(r, nums.buy, budget, maxItems)
        return { row: r, nums, qty, estProfit: nums.profit * qty }
      })
      .filter(x => x.nums.margin <= preset.maxMargin)
      .filter(x => x.qty > 0 && x.estProfit > 0)
      .sort((a, b) => {
        if (sortKey === 'margin') return b.nums.margin - a.nums.margin
        if (sortKey === 'profitItem') return b.nums.profit - a.nums.profit
        if (sortKey === 'fill') return b.row.fillProbability - a.row.fillProbability
        return b.estProfit - a.estProfit
      })
      .slice(0, 60)
  }, [rows, mode, preset, budget, maxItems, blocked, starred, showFilter, search, sortKey])

  function toggleStar(id: string) {
    setStarred(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); localStorage.setItem('bf_starred', JSON.stringify([...n])); return n })
  }
  function toggleBlock(id: string) {
    setBlocked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); localStorage.setItem('bf_blocked', JSON.stringify([...n])); return n })
  }

  const topEst = enriched[0]?.estProfit ?? 0
  const modeDef = MODES.find(m => m.key === mode)!

  return (
    <div>
      <PageHead
        title="Bazaar"
        highlight="Spreads"
        sub={<>{modeDef.hint} — all profits net of 1.25% bazaar tax, quantity capped at {FLOW_CAPTURE * 100}% of real weekly flow{productCount > 0 && <> · <span className="mono">{productCount.toLocaleString()}</span> products scanned</>}</>}
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Best realistic" value={topEst} format={(n) => `+${coinsShort(n)}`} accent="var(--up)" sub="Net estimate" />
        <StatCard label="Opportunities" value={enriched.length} accent="var(--accent)" sub={`${preset.label} preset`} />
      </PageHead>

      <div className="bar">
        {MODES.map(m => (
          <button key={m.key} className={`pill${mode === m.key ? ' on' : ''}`} onClick={() => setMode(m.key)} title={m.hint}>
            {m.label}
          </button>
        ))}
        <span className="divider-v" />
        {(Object.keys(STRATEGIES) as StrategyMode[]).map(k => (
          <button
            key={k}
            className={`pill${strategy === k ? (k === 'SAFE' ? ' on-green' : k === 'RISK' ? ' on-red' : ' on-blue') : ''}`}
            onClick={() => setStrategy(k)}
            title={STRATEGIES[k].blurb}
          >
            {STRATEGIES[k].label}
          </button>
        ))}
      </div>

      <div className="bar" style={{ animationDelay: '0.12s' }}>
        <input className="search" placeholder="Search item…" value={searchRaw} onChange={e => setSearchRaw(e.target.value)} />
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
        <button className={`pill${showFilter === 'starred' ? ' on' : ''}`} onClick={() => setShowFilter(f => f === 'all' ? 'starred' : 'all')}>
          ★ Starred
        </button>
        <SortSelect value={sortKey} onChange={setSortKey} options={SORTS} />
        <span className="mono" style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--faint)' }}>
          QTY = MIN(BUDGET, MAX ITEMS, {FLOW_CAPTURE * 100}% WK FLOW)
        </span>
      </div>

      {!loading && enriched.length === 0 && (
        <div className="card">
          <Void glyph="—" title="No flips match your filters" sub={mode === 'FAST' ? 'Fast mode is rarely profitable — spreads must exceed double tax' : 'Try the Balanced or High Risk preset'} />
        </div>
      )}

      <FlipGrid>
        {loading && <FlipSkeletons n={10} />}
        {!loading && enriched.map(({ row, nums, qty, estProfit }, i) => {
          const isOpen = expanded === row.id
          const marginColor = nums.margin >= 8 ? 'var(--up)' : nums.margin >= 3 ? 'var(--accent)' : 'var(--dim)'
          const fillColor = row.fillProbability > 60 ? 'var(--up)' : row.fillProbability > 30 ? 'var(--accent)' : 'var(--down)'
          return (
            <FlipCard
              key={row.id}
              rank={i + 1}
              iconId={row.id}
              title={row.name}
              chips={<>
                {row.manipulationFlag && <Chip label="!" tone="red" />}
                {starred.has(row.id) && <span style={{ color: 'var(--warn)', fontSize: '0.7rem' }}>★</span>}
              </>}
              sub={<>vol {coinsShort(Math.min(row.weeklyVolume, row.sellMovingWeek))}/wk · qty {qty.toLocaleString()}</>}
              stats={[
                { label: mode === 'FAST' ? 'Insta buy' : 'Buy order', value: coins(nums.buy), color: 'var(--info)' },
                { label: mode === 'CONSERVATIVE' ? 'Sell offer' : 'Insta sell', value: coins(nums.sell), color: 'var(--accent)' },
                { label: 'Margin', value: `${nums.margin.toFixed(1)}%`, color: marginColor },
                { label: 'Net/item', value: coins(nums.profit), color: nums.profit > 0 ? 'var(--text)' : 'var(--down)' },
                { label: 'Fill', value: `${row.fillProbability}%`, color: fillColor },
              ]}
              net={`+${coinsShort(estProfit)}`}
              netSub="est. net"
              open={isOpen}
              onToggle={() => setExpanded(isOpen ? null : row.id)}
              actions={<>
                <button className={`iconbtn${starred.has(row.id) ? ' lit' : ''}`} onClick={(e) => { e.stopPropagation(); toggleStar(row.id) }} title="Star">★</button>
                <button className="iconbtn" onClick={(e) => { e.stopPropagation(); toggleBlock(row.id) }} title="Hide">✕</button>
              </>}
            >
              {row.manipulationFlag && (
                <div style={{ marginBottom: 10, fontSize: '0.76rem', color: 'var(--down)', fontWeight: 700 }}>
                  {row.manipulationReason}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Total cost', val: coinsShort(nums.buy * qty), color: 'var(--down)' },
                  { label: 'Conservative net', val: coins(row.orderProfit), color: row.orderProfit > 0 ? 'var(--up)' : 'var(--down)' },
                  { label: 'Hybrid net', val: coins(row.hybridProfit), color: row.hybridProfit > 0 ? 'var(--up)' : 'var(--down)' },
                  { label: 'Fast net', val: coins(row.instantProfit), color: row.instantProfit > 0 ? 'var(--up)' : 'var(--down)' },
                  { label: 'Liquidity score', val: `${row.liquidityScore}/100`, color: row.liquidityScore > 60 ? 'var(--up)' : 'var(--accent)' },
                  { label: 'Stability', val: `${row.stabilityScore}/100`, color: row.stabilityScore > 60 ? 'var(--up)' : 'var(--accent)' },
                  { label: 'Hourly flow', val: `${coinsShort(row.hourlyThroughput)} items`, color: 'var(--text)' },
                  { label: 'Open buy orders', val: row.buyOrders.toLocaleString(), color: 'var(--dim)' },
                  { label: 'Open sell orders', val: row.sellOrders.toLocaleString(), color: 'var(--dim)' },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <div className="mini-label">{label}</div>
                    <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{val}</div>
                  </div>
                ))}
              </div>
            </FlipCard>
          )
        })}
      </FlipGrid>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
