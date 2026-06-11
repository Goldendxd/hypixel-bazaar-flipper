'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchBookFlips, BookFlipRow } from '@/lib/bookFlips'
import { Chip, ItemIcon, Oracle, PageHead, SkelRows, StatCard, Void, coins, coinsShort } from '@/components/ui'

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V']
const GRID = '30px minmax(190px, 1.6fr) 120px 100px 100px 84px 96px 90px'

type SortKey = 'profit' | 'margin' | 'volume'

export default function BookFlipPage() {
  const [rows, setRows] = useState<BookFlipRow[]>([])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
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

  const HEAD: Array<{ label: string; sort?: SortKey; align?: 'right' }> = [
    { label: '#' },
    { label: 'Combine route' },
    { label: 'Book cost', align: 'right' },
    { label: 'Sell offer', align: 'right' },
    { label: 'Profit', sort: 'profit', align: 'right' },
    { label: 'Margin', sort: 'margin', align: 'right' },
    { label: 'Exit vol/wk', sort: 'volume', align: 'right' },
    { label: 'Safe exit', align: 'right' },
  ]

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
        <StatCard label="Best combine" value={best} format={(n) => `+${coinsShort(n)}`} accent="var(--green)" sub="Profit per craft" />
        <StatCard label="Routes found" value={filtered.length} accent="var(--gold)" sub="Max tier V" />
      </PageHead>

      <Oracle text={aiSummary} />

      <div className="bar">
        <input className="search" placeholder="Search enchant…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="field">
          <label>Min profit</label>
          <input type="number" value={minProfit} min={0}
            onChange={e => setMinProfit(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button className={`pill${hideWarned ? ' on-green' : ''}`} onClick={() => setHideWarned(v => !v)}>
          {hideWarned ? '✓ Clean only' : 'Show flagged'}
        </button>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--faint)' }}>
          2× TIER N → TIER N+1 · OUTPUT ≤ V
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

        {!loading && filtered.length === 0 && (
          <Void glyph="✦" title="No book combines match" sub="Lower the minimum profit or include flagged routes" />
        )}

        {!loading && filtered.map((r, i) => {
          const key = `${r.outputId}-${r.inputTier}`
          const isOpen = expanded === key
          const safeColor = r.instaExitProfit > 0 ? 'var(--green)' : 'var(--red)'
          return (
            <div key={key}>
              <div className="gt-row" style={{ gridTemplateColumns: GRID }} onClick={() => setExpanded(isOpen ? null : key)}>
                <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--faint)' }}>{i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div className="ifr" style={{ width: 32, height: 32 }}><ItemIcon id="ENCHANTED_BOOK" size={24} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.83rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.outputName}
                      {r.warning && <Chip label="⚠" tone="orange" />}
                    </div>
                    <div className="mono" style={{ fontSize: '0.62rem', color: 'var(--faint)' }}>
                      {r.inputQty}× {ROMAN[r.inputTier]} → {ROMAN[r.outputTier]}
                    </div>
                  </div>
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--blue)' }}>{coinsShort(r.inputTotalCost)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--gold-hi)' }}>{coinsShort(r.outputSellOffer)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.83rem', fontWeight: 800, color: 'var(--green)' }}>+{coinsShort(r.profit)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.76rem', fontWeight: 700, color: r.margin > 50 ? 'var(--green)' : 'var(--dim)' }}>{r.margin.toFixed(0)}%</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.76rem', color: 'var(--dim)' }}>{r.exitWeeklyInstabuys.toLocaleString()}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.76rem', fontWeight: 700, color: safeColor }}>
                  {r.instaExitProfit >= 0 ? '+' : ''}{coinsShort(r.instaExitProfit)}
                </div>
              </div>

              {isOpen && (
                <div className="gt-expand">
                  {r.warning && (
                    <div style={{ marginBottom: 12, fontSize: '0.76rem', color: 'var(--orange)', fontWeight: 700 }}>⚠ {r.warning}</div>
                  )}
                  <div className="recipe-strip" style={{ marginBottom: 12 }}>
                    <span className="mini-label" style={{ marginBottom: 0 }}>Plan</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>
                      Place a buy order for <strong className="mono" style={{ color: 'var(--text)' }}>{r.inputQty}× {r.enchantName} {ROMAN[r.inputTier]}</strong> at{' '}
                      <strong className="mono" style={{ color: 'var(--blue)' }}>{coins(r.inputBuyOrder)}</strong> each, combine on an anvil to{' '}
                      <strong style={{ color: 'var(--gold-hi)' }}>{r.outputName}</strong>, then list a sell offer at{' '}
                      <strong className="mono" style={{ color: 'var(--gold-hi)' }}>{coins(r.outputSellOffer)}</strong>.
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Buy order / book', val: coins(r.inputBuyOrder), color: 'var(--blue)' },
                      { label: 'Insta-buy total', val: coins(r.inputInstaCost), color: 'var(--dim)' },
                      { label: 'Revenue after tax', val: coins(r.revenue), color: 'var(--gold-hi)' },
                      { label: 'Insta-exit P/L', val: coins(r.instaExitProfit), color: r.instaExitProfit > 0 ? 'var(--green)' : 'var(--red)' },
                      { label: 'Input fills/wk', val: r.inputWeeklyInstasells.toLocaleString(), color: 'var(--text)' },
                      { label: 'Exit insta-buys/wk', val: r.exitWeeklyInstabuys.toLocaleString(), color: 'var(--text)' },
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
    </Shell>
  )
}
