'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchCraftFlips, CraftFlipRow } from '@/lib/craftFlips'
import { Chip, ItemIcon, PageHead, SkelRows, StatCard, Void, coins, coinsShort } from '@/components/ui'

const GRID = '30px minmax(190px, 1.6fr) 110px 110px 104px 84px 80px'

type SortKey = 'profit' | 'margin' | 'volume'
type CostMode = 'order' | 'insta'

export default function CraftFlipPage() {
  const [rows, setRows] = useState<CraftFlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<CostMode>('order')
  const [hideManip, setHideManip] = useState(true)
  const [minVolume, setMinVolume] = useState<number | ''>(5)
  const [sortKey, setSortKey] = useState<SortKey>('profit')

  const load = useCallback(async () => {
    try {
      const data = await fetchCraftFlips()
      setRows(data.rows)
      setLastUpdated(new Date()); setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 120_000)
    return () => clearInterval(id)
  }, [load])

  const profitOf = useCallback((r: CraftFlipRow) => mode === 'order' ? r.profitOrder : r.profitInsta, [mode])
  const costOf = useCallback((r: CraftFlipRow) => mode === 'order' ? r.craftCostOrder : r.craftCostInsta, [mode])
  const marginOf = useCallback((r: CraftFlipRow) => mode === 'order' ? r.marginOrder : r.marginInsta, [mode])

  const filtered = useMemo(() => {
    return rows
      .filter(r => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
      .filter(r => !hideManip || !r.manipulated)
      .filter(r => minVolume === '' || r.volume >= minVolume)
      .filter(r => profitOf(r) > 0)
      .sort((a, b) => {
        if (sortKey === 'margin') return marginOf(b) - marginOf(a)
        if (sortKey === 'volume') return b.volume - a.volume
        return profitOf(b) - profitOf(a)
      })
  }, [rows, search, hideManip, minVolume, sortKey, profitOf, costOf, marginOf])

  const best = filtered.length > 0 ? profitOf(filtered[0]) : 0

  const HEAD: Array<{ label: string; sort?: SortKey; align?: 'right' }> = [
    { label: '#' },
    { label: 'Item' },
    { label: 'Craft cost', align: 'right' },
    { label: 'Sells for', align: 'right' },
    { label: 'Profit', sort: 'profit', align: 'right' },
    { label: 'Margin', sort: 'margin', align: 'right' },
    { label: 'Sales', sort: 'volume', align: 'right' },
  ]

  return (
    <Shell>
      <PageHead
        title="Craft"
        highlight="Flips"
        sub="Buy raw materials, craft the item, sell it for more than the parts — live recipe costs with requirement checks"
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Best craft" value={best} format={(n) => `+${coinsShort(n)}`} accent="var(--green)" sub={mode === 'order' ? 'Patient buy orders' : 'Instant materials'} />
        <StatCard label="Profitable crafts" value={filtered.length} accent="var(--gold)" sub="Passing filters" />
      </PageHead>

      <div className="bar">
        <input className="search" placeholder="Search item…" value={search} onChange={e => setSearch(e.target.value)} />
        <button className={`pill${mode === 'order' ? ' on-blue' : ''}`} onClick={() => setMode('order')} title="Buy materials with patient buy orders (cheaper, slower)">
          ⏳ Buy orders
        </button>
        <button className={`pill${mode === 'insta' ? ' on-orange' : ''}`} onClick={() => setMode('insta')} title="Buy materials instantly (faster, pricier)">
          ⚡ Insta-buy
        </button>
        <div className="field">
          <label>Min sales</label>
          <input type="number" value={minVolume} min={0}
            onChange={e => setMinVolume(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button className={`pill${hideManip ? ' on-green' : ''}`} onClick={() => setHideManip(v => !v)}>
          {hideManip ? '✓ Manip filter' : 'Manip filter off'}
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
          <Void glyph="⚒" title="No craft flips match" sub="Lower the sales requirement or disable the manipulation filter" />
        )}

        {!loading && filtered.map((r, i) => {
          const isOpen = expanded === r.id
          const margin = marginOf(r)
          return (
            <div key={r.id}>
              <div className="gt-row" style={{ gridTemplateColumns: GRID }} onClick={() => setExpanded(isOpen ? null : r.id)}>
                <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--faint)' }}>{i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div className="ifr" style={{ width: 32, height: 32 }}><ItemIcon id={r.id} size={26} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.83rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.name}
                      {r.manipulated && <Chip label="⚠" tone="red" />}
                    </div>
                    <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--faint)', display: 'flex', gap: 8 }}>
                      {r.reqCollection && <span>{r.reqCollection.name} {r.reqCollection.level}</span>}
                      {r.reqSlayer && <span>{r.reqSlayer.name} slayer {r.reqSlayer.level}</span>}
                      {!r.reqCollection && !r.reqSlayer && <span>no requirements</span>}
                    </div>
                  </div>
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--blue)' }}>{coinsShort(costOf(r))}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--gold-hi)' }}>{coinsShort(r.sellPrice)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.83rem', fontWeight: 800, color: 'var(--green)' }}>+{coinsShort(profitOf(r))}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.76rem', fontWeight: 700, color: margin > 30 ? 'var(--green)' : 'var(--dim)' }}>{margin.toFixed(0)}%</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.76rem', color: 'var(--dim)' }}>{r.volume}</div>
              </div>

              {isOpen && (
                <div className="gt-expand">
                  {r.manipulationReason && (
                    <div style={{ marginBottom: 12, fontSize: '0.76rem', color: 'var(--red)', fontWeight: 700 }}>⚠ {r.manipulationReason}</div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
                    {[
                      { label: 'Median sale', val: r.median > 0 ? coins(r.median) : '—', color: 'var(--text)' },
                      { label: 'Cost (buy orders)', val: coins(r.craftCostOrder), color: 'var(--blue)' },
                      { label: 'Cost (insta)', val: coins(r.craftCostInsta), color: 'var(--orange)' },
                      { label: 'Profit (buy orders)', val: `+${coins(r.profitOrder)}`, color: 'var(--green)' },
                      { label: 'Profit (insta)', val: r.profitInsta > 0 ? `+${coins(r.profitInsta)}` : coins(r.profitInsta), color: r.profitInsta > 0 ? 'var(--green)' : 'var(--red)' },
                      { label: 'Recent sales', val: String(r.volume), color: 'var(--text)' },
                    ].map(({ label, val, color }) => (
                      <div key={label}>
                        <div className="mini-label">{label}</div>
                        <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {r.ingredients.length > 0 && (
                    <div className="recipe-strip">
                      <span className="mini-label" style={{ marginBottom: 0 }}>Recipe</span>
                      {r.ingredients.map(ing => (
                        <span key={ing.id} title={ing.isCrafted ? 'Cheaper to sub-craft this ingredient' : undefined}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: 'var(--dim)' }}>
                          <ItemIcon id={ing.id} size={18} />
                          <span className="mono" style={{ color: 'var(--text)' }}>{ing.qty}×</span>
                          {ing.name}
                          {ing.isCrafted && <span style={{ color: 'var(--purple)', fontSize: '0.62rem' }}>⚒</span>}
                          <span className="mono" style={{ color: 'var(--faint)' }}>({coinsShort(mode === 'order' ? ing.orderCost : ing.instaCost)})</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <RefreshTimer intervalMs={120_000} lastUpdated={lastUpdated} />
    </Shell>
  )
}
