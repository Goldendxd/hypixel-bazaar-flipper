'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchBookFlips, BookFlipRow } from '@/lib/bookFlips'
import { Chip, FlipCard, FlipGrid, FlipSkeletons, Oracle, PageHead, SortSelect, StatCard, Void, coins, coinsShort } from '@/components/ui'
import { useDebounced } from '@/components/hooks'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V']

type SortKey = 'profit' | 'margin' | 'volume'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'profit', label: 'Net profit' },
  { key: 'margin', label: 'Margin %' },
  { key: 'volume', label: 'Exit volume' },
]

export default function BookFlipPage() {
  const [rows, setRows] = useState<BookFlipRow[]>([])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounced(searchRaw)
  const [minProfit, setMinProfit] = useState<number | ''>(10_000)
  const [hideWarned, setHideWarned] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('profit')

  const load = useCallback(async () => {
    try {
      const data = await fetchBookFlips()
      setRows(data.rows)
      setAiSummary(data.aiSummary)
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

  const filtered = useMemo(() => {
    return rows
      .filter(r => search === '' || r.enchantName.toLowerCase().includes(search.toLowerCase()))
      .filter(r => minProfit === '' || r.profit >= minProfit)
      .filter(r => !hideWarned || !r.warning)
      .sort((a, b) => {
        if (sortKey === 'margin') return b.margin - a.margin
        if (sortKey === 'volume') return b.exitWeeklyInstabuys - a.exitWeeklyInstabuys
        return b.profit - a.profit
      })
      .slice(0, 70)
  }, [rows, search, minProfit, hideWarned, sortKey])

  const best = filtered[0]?.profit ?? 0

  return (
    <Shell>
      <PageHead
        title="Book"
        highlight="Combines"
        sub="Buy-order low-tier enchanted books, anvil-combine them, sell the result — capped at Tier V outputs (T6/T7 are drop-only phantom-bid traps)"
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Best combine" value={best} format={(n) => `+${coinsShort(n)}`} accent="var(--up)" sub="Net per craft" />
        <StatCard label="Routes found" value={filtered.length} accent="var(--accent)" sub="Max tier V" />
      </PageHead>

      <Oracle text={aiSummary} />

      <div className="bar">
        <input className="search" placeholder="Search enchant…" value={searchRaw} onChange={e => setSearchRaw(e.target.value)} />
        <div className="field">
          <label>Min profit</label>
          <input type="number" value={minProfit} min={0}
            onChange={e => setMinProfit(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button className={`pill${hideWarned ? ' on-green' : ''}`} onClick={() => setHideWarned(v => !v)}>
          {hideWarned ? 'Clean only' : 'Show flagged'}
        </button>
        <SortSelect value={sortKey} onChange={setSortKey} options={SORTS} />
        <span className="mono" style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--faint)' }}>
          2 × TIER N = TIER N+1 · OUTPUT MAX V
        </span>
      </div>

      {!loading && filtered.length === 0 && (
        <div className="card">
          <Void glyph="—" title="No book combines match" sub="Lower the minimum profit or include flagged routes" />
        </div>
      )}

      <FlipGrid>
        {loading && <FlipSkeletons n={10} />}
        {!loading && filtered.map((r, i) => {
          const key = `${r.outputId}-${r.inputTier}`
          const isOpen = expanded === key
          return (
            <FlipCard
              key={key}
              rank={i + 1}
              iconId="ENCHANTED_BOOK"
              title={r.outputName}
              chips={r.warning ? <Chip label="!" tone="orange" /> : undefined}
              sub={<>{r.inputQty}× {ROMAN[r.inputTier]} · {r.combineSteps} combine{r.combineSteps !== 1 ? 's' : ''} · {r.t1Equivalent}× T{r.baseTier} equivalent</>}
              stats={[
                { label: 'Book cost', value: coinsShort(r.inputTotalCost), color: 'var(--info)' },
                { label: 'Sell offer', value: coinsShort(r.outputSellOffer), color: 'var(--accent)' },
                { label: 'Margin', value: `${r.margin.toFixed(0)}%`, color: r.margin > 50 ? 'var(--up)' : 'var(--dim)' },
                { label: 'Exit vol/wk', value: r.exitWeeklyInstabuys.toLocaleString(), color: 'var(--dim)' },
                { label: 'Safe exit', value: `${r.instaExitProfit >= 0 ? '+' : ''}${coinsShort(r.instaExitProfit)}`, color: r.instaExitProfit > 0 ? 'var(--up)' : 'var(--down)' },
              ]}
              net={`+${coinsShort(r.profit)}`}
              netSub="net profit"
              open={isOpen}
              onToggle={() => setExpanded(isOpen ? null : key)}
            >
              {r.warning && (
                <div style={{ marginBottom: 12, fontSize: '0.76rem', color: '#d97e06', fontWeight: 700 }}>{r.warning}</div>
              )}
              <div className="recipe-strip" style={{ marginBottom: 12 }}>
                <span className="mini-label" style={{ marginBottom: 0 }}>Plan</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>
                  Place a buy order for <strong className="mono" style={{ color: 'var(--text)' }}>{r.inputQty}× {r.enchantName} {ROMAN[r.inputTier]}</strong> at{' '}
                  <strong className="mono" style={{ color: 'var(--info)' }}>{coins(r.inputBuyOrder)}</strong> each, combine on an anvil to{' '}
                  <strong style={{ color: 'var(--text)' }}>{r.outputName}</strong>, then list a sell offer at{' '}
                  <strong className="mono" style={{ color: 'var(--accent)' }}>{coins(r.outputSellOffer)}</strong>.
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Base-tier equivalent', val: `${r.t1Equivalent}× T${r.baseTier}`, color: 'var(--text)' },
                  { label: 'Anvil combines', val: String(r.combineSteps), color: 'var(--text)' },
                  { label: 'Buy order / book', val: coins(r.inputBuyOrder), color: 'var(--info)' },
                  { label: 'Insta-buy total', val: coins(r.inputInstaCost), color: 'var(--dim)' },
                  { label: 'Gross sale', val: coins(r.grossRevenue), color: 'var(--accent)' },
                  { label: 'Bazaar tax (1.25%)', val: `−${coins(r.bazaarTax)}`, color: 'var(--down)' },
                  { label: 'Net revenue', val: coins(r.revenue), color: 'var(--accent)' },
                  { label: 'Insta-exit net P/L', val: coins(r.instaExitProfit), color: r.instaExitProfit > 0 ? 'var(--up)' : 'var(--down)' },
                  { label: 'Input fills/wk', val: r.inputWeeklyInstasells.toLocaleString(), color: 'var(--text)' },
                  { label: 'Exit insta-buys/wk', val: r.exitWeeklyInstabuys.toLocaleString(), color: 'var(--text)' },
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
    </Shell>
  )
}
