'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchForgeFlips, ForgeFlipRow } from '@/lib/forgeFlips'
import { Chip, ItemIcon, Oracle, PageHead, SkelRows, StatCard, Void, coins, coinsShort, fmtDuration } from '@/components/ui'
import { useDebounced } from '@/components/hooks'

const GRID = '30px minmax(190px, 1.6fr) 90px 110px 110px 104px 100px 70px'

type SortKey = 'perHour' | 'profit' | 'margin'

// Quick Forge HotM perk: up to −30% forge time at max level
const QF_MULT = 0.7

export default function ForgeFlipPage() {
  const [rows, setRows] = useState<ForgeFlipRow[]>([])
  const [totalForgeItems, setTotalForgeItems] = useState(0)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounced(searchRaw)
  const [maxHotm, setMaxHotm] = useState<number | ''>('')
  const [maxHours, setMaxHours] = useState<number | ''>('')
  const [quickForge, setQuickForge] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('perHour')

  const load = useCallback(async () => {
    try {
      const data = await fetchForgeFlips()
      setRows(data.rows)
      setTotalForgeItems(data.totalForgeItems)
      setAiSummary(data.aiSummary)
      setLastUpdated(new Date()); setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 300_000)
    return () => clearInterval(id)
  }, [load])

  const timeMult = quickForge ? QF_MULT : 1

  const filtered = useMemo(() => {
    return rows
      .filter(r => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
      .filter(r => maxHotm === '' || (r.hotm ?? 0) <= maxHotm)
      .filter(r => maxHours === '' || (r.totalDuration * timeMult) / 3600 <= maxHours)
      .map(r => ({ ...r, effDuration: r.totalDuration * timeMult, effPerHour: Math.round(r.profit / Math.max((r.totalDuration * timeMult) / 3600, 0.25)) }))
      .sort((a, b) => {
        if (sortKey === 'profit') return b.profit - a.profit
        if (sortKey === 'margin') return b.margin - a.margin
        return b.effPerHour - a.effPerHour
      })
  }, [rows, search, maxHotm, maxHours, sortKey, timeMult])

  const best = filtered[0]?.effPerHour ?? 0

  const HEAD: Array<{ label: string; sort?: SortKey; align?: 'right' }> = [
    { label: '#' },
    { label: 'Forge item' },
    { label: 'Time', align: 'right' },
    { label: 'Cost', align: 'right' },
    { label: 'Sells for', align: 'right' },
    { label: 'Profit', sort: 'profit', align: 'right' },
    { label: 'Coins/h', sort: 'perHour', align: 'right' },
    { label: 'Margin', sort: 'margin', align: 'right' },
  ]

  const SOURCE_TONE = { BZ: 'blue', AH: 'purple', FORGE: 'orange', COIN: 'gold' } as const

  return (
    <Shell>
      <PageHead
        title="Forge"
        highlight="Flips"
        sub={`Queue Dwarven Forge recipes, collect the profit — ${totalForgeItems || 120} recipes priced live, ranked by coins per hour per slot`}
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Best slot rate" value={best} format={(n) => `${coinsShort(n)}/h`} accent="var(--green)" sub="Per forge slot" />
        <StatCard label="Profitable recipes" value={filtered.length} accent="var(--gold)" sub="Passing filters" />
      </PageHead>

      <Oracle text={aiSummary} />

      <div className="bar">
        <input className="search" placeholder="Search recipe…" value={searchRaw} onChange={e => setSearchRaw(e.target.value)} />
        <div className="field">
          <label>Max HotM</label>
          <input type="number" value={maxHotm} min={1} max={10} placeholder="any"
            onChange={e => setMaxHotm(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Max hours</label>
          <input type="number" value={maxHours} min={0} placeholder="any"
            onChange={e => setMaxHours(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button className={`pill${quickForge ? ' on-orange' : ''}`} onClick={() => setQuickForge(v => !v)} title="Quick Forge HotM perk: −30% forge time">
          {quickForge ? '✓ Quick Forge −30%' : 'Quick Forge off'}
        </button>
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
          <Void glyph="♨" title="No forge flips match" sub="Raise the HotM / time limits or clear the search" />
        )}

        {!loading && filtered.map((r, i) => {
          const isOpen = expanded === r.id
          return (
            <div key={r.id}>
              <div className="gt-row" style={{ gridTemplateColumns: GRID }} onClick={() => setExpanded(isOpen ? null : r.id)}>
                <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--faint)' }}>{i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div className="ifr" style={{ width: 32, height: 32 }}><ItemIcon id={r.id} size={26} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.83rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.name}
                      {r.warning && <Chip label="⚠" tone="orange" />}
                    </div>
                    <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--faint)', display: 'flex', gap: 8 }}>
                      {r.hotm && <span>HotM {r.hotm}</span>}
                      <span>exit: {r.sellSource}</span>
                      {r.chainDepth > 1 && <span style={{ color: 'var(--warn)' }}>{r.chainDepth}-deep chain</span>}
                      {r.outputCount > 1 && <span>×{r.outputCount}</span>}
                    </div>
                  </div>
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.74rem', color: 'var(--dim)' }}>{fmtDuration(r.effDuration)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--blue)' }}>{coinsShort(r.ingredientCost)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--gold-hi)' }}>{coinsShort(r.sellPrice)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.83rem', fontWeight: 800, color: 'var(--green)' }}>+{coinsShort(r.profit)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.8rem', fontWeight: 700, color: 'var(--purple)' }}>{coinsShort(r.effPerHour)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.76rem', fontWeight: 700, color: r.margin > 25 ? 'var(--green)' : 'var(--dim)' }}>{r.margin.toFixed(0)}%</div>
              </div>

              {isOpen && (
                <div className="gt-expand">
                  {r.warning && (
                    <div style={{ marginBottom: 12, fontSize: '0.76rem', color: 'var(--orange)', fontWeight: 700 }}>⚠ {r.warning}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
                    {[
                      { label: 'Forge step', val: fmtDuration(r.duration * timeMult), color: 'var(--text)' },
                      { label: 'Full chain', val: fmtDuration(r.effDuration), color: 'var(--text)' },
                      { label: 'Gross sale', val: coins(r.sellPrice * r.outputCount), color: 'var(--accent)' },
                      { label: r.sellSource === 'BZ' ? 'Bazaar tax (1.25%)' : 'AH fees', val: `−${coins(r.fees)}`, color: 'var(--down)' },
                      { label: 'Net revenue', val: coins(r.revenue), color: 'var(--accent)' },
                      { label: 'Tree cost (optimal)', val: coins(r.ingredientCost), color: 'var(--info)' },
                      { label: 'Buy-everything cost', val: coins(r.naiveCost), color: 'var(--dim)' },
                      { label: 'Chain savings', val: r.naiveCost > r.ingredientCost ? coins(r.naiveCost - r.ingredientCost) : '—', color: 'var(--up)' },
                      { label: 'Exit market', val: r.sellSource === 'BZ' ? 'Bazaar sell offer' : 'AH lowest BIN', color: 'var(--dim)' },
                      { label: 'Weekly demand', val: r.weeklyVolume > 0 ? r.weeklyVolume.toLocaleString() : 'AH — unknown', color: 'var(--text)' },
                      { label: 'HotM required', val: r.hotm ? `Tier ${r.hotm}` : 'None', color: 'var(--dim)' },
                    ].map(({ label, val, color }) => (
                      <div key={label}>
                        <div className="mini-label">{label}</div>
                        <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="recipe-strip">
                    <span className="mini-label" style={{ marginBottom: 0 }}>Inputs</span>
                    {r.ingredients.map(ing => (
                      <span key={ing.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: 'var(--dim)' }}
                        title={ing.forgeCheaper ? `Sub-forging beats buying (market: ${coinsShort(ing.marketPrice)})` : undefined}>
                        <ItemIcon id={ing.id} size={18} />
                        <span className="mono" style={{ color: 'var(--text)' }}>{ing.qty.toLocaleString()}×</span>
                        {ing.name}
                        <Chip label={ing.forgeCheaper ? 'FORGE ↓' : ing.source} tone={SOURCE_TONE[ing.source]} />
                        <span className="mono" style={{ color: 'var(--faint)' }}>({coinsShort(ing.totalPrice)})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <RefreshTimer intervalMs={300_000} lastUpdated={lastUpdated} />
    </Shell>
  )
}
