'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchCraftFlips, CraftFlipRow } from '@/lib/craftFlips'
import { Loader, Chip, FlipCard, FlipGrid, ItemIcon, PageHead, SortSelect, StatCard, Void, coins, coinsShort } from '@/components/ui'
import { useDebounced } from '@/components/hooks'

type SortKey = 'profit' | 'margin' | 'volume'
type CostMode = 'order' | 'insta'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'profit', label: 'Net profit' },
  { key: 'margin', label: 'Margin %' },
  { key: 'volume', label: 'Sales volume' },
]

export default function CraftFlipPage() {
  const [rows, setRows] = useState<CraftFlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounced(searchRaw)
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
        <StatCard label="Best craft" value={best} format={(n) => `+${coinsShort(n)}`} accent="var(--up)" sub={mode === 'order' ? 'Patient buy orders' : 'Instant materials'} />
        <StatCard label="Profitable crafts" value={filtered.length} accent="var(--accent)" sub="Passing filters" />
      </PageHead>

      <div className="bar">
        <input className="search" placeholder="Search item…" value={searchRaw} onChange={e => setSearchRaw(e.target.value)} />
        <button className={`pill${mode === 'order' ? ' on-blue' : ''}`} onClick={() => setMode('order')} title="Buy materials with patient buy orders (cheaper, slower)">
          Buy orders
        </button>
        <button className={`pill${mode === 'insta' ? ' on-orange' : ''}`} onClick={() => setMode('insta')} title="Buy materials instantly (faster, pricier)">
          Insta-buy
        </button>
        <div className="field">
          <label>Min sales</label>
          <input type="number" value={minVolume} min={0}
            onChange={e => setMinVolume(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button className={`pill${hideManip ? ' on-green' : ''}`} onClick={() => setHideManip(v => !v)}>
          {hideManip ? 'Manip filter on' : 'Manip filter off'}
        </button>
        <SortSelect value={sortKey} onChange={setSortKey} options={SORTS} />
      </div>

      {!loading && filtered.length === 0 && (
        <div className="card">
          <Void glyph="—" title="No craft flips match" sub="Lower the sales requirement or disable the manipulation filter" />
        </div>
      )}

      <FlipGrid>
        {loading && <div className="grid-span"><Loader /></div>}
        {!loading && filtered.map((r, i) => {
          const isOpen = expanded === r.id
          const margin = marginOf(r)
          const req = r.reqCollection
            ? `${r.reqCollection.name} ${r.reqCollection.level}`
            : r.reqSlayer ? `${r.reqSlayer.name} slayer ${r.reqSlayer.level}` : 'no requirements'
          return (
            <FlipCard
              key={r.id}
              rank={i + 1}
              iconId={r.id}
              title={r.name}
              chips={r.manipulated ? <Chip label="!" tone="red" /> : undefined}
              sub={req}
              stats={[
                { label: 'Craft cost', value: coinsShort(costOf(r)), color: 'var(--info)' },
                { label: 'Sells for', value: coinsShort(r.sellPrice), color: 'var(--accent)' },
                { label: 'Margin', value: `${margin.toFixed(0)}%`, color: margin > 30 ? 'var(--up)' : 'var(--dim)' },
                { label: 'Sales', value: String(r.volume), color: 'var(--dim)' },
              ]}
              net={`+${coinsShort(profitOf(r))}`}
              netSub="net profit"
              open={isOpen}
              onToggle={() => setExpanded(isOpen ? null : r.id)}
            >
              {r.manipulationReason && (
                <div style={{ marginBottom: 12, fontSize: '0.76rem', color: 'var(--down)', fontWeight: 700 }}>{r.manipulationReason}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
                {[
                  { label: 'Gross sale', val: coins(r.sellPrice), color: 'var(--accent)' },
                  { label: 'AH listing fee', val: `−${coins(r.ahListingFee)}`, color: 'var(--down)' },
                  { label: 'AH claiming tax', val: `−${coins(r.ahClaimingTax)}`, color: 'var(--down)' },
                  { label: 'Median sale', val: r.median > 0 ? coins(r.median) : '—', color: 'var(--text)' },
                  { label: 'Cost (buy orders)', val: coins(r.craftCostOrder), color: 'var(--info)' },
                  { label: 'Cost (insta)', val: coins(r.craftCostInsta), color: '#d97e06' },
                  { label: 'Profit (buy orders)', val: `+${coins(r.profitOrder)}`, color: 'var(--up)' },
                  { label: 'Profit (insta)', val: r.profitInsta > 0 ? `+${coins(r.profitInsta)}` : coins(r.profitInsta), color: r.profitInsta > 0 ? 'var(--up)' : 'var(--down)' },
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
                      {ing.isCrafted && <Chip label="sub-craft" tone="purple" />}
                      <span className="mono" style={{ color: 'var(--faint)' }}>({coinsShort(mode === 'order' ? ing.orderCost : ing.instaCost)})</span>
                    </span>
                  ))}
                </div>
              )}
            </FlipCard>
          )
        })}
      </FlipGrid>

      <RefreshTimer intervalMs={120_000} lastUpdated={lastUpdated} />
    </Shell>
  )
}
