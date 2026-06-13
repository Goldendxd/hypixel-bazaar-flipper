'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchWeaponFlips, fetchWeaponHistory, WeaponRow, PricePoint } from '@/lib/weaponFlips'
import { WEAPON_CATEGORIES, WeaponCategory } from '@/lib/weaponCatalog'
import { Loader, Chip, FlipCard, FlipGrid, ItemIcon, PageHead, PriceChart, SortSelect, StatCard, Void, coins, coinsShort } from '@/components/ui'
import { useDebounced } from '@/components/hooks'

type SortKey = 'profit' | 'roi' | 'price' | 'demand'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'profit', label: 'Net craft profit' },
  { key: 'roi', label: 'ROI %' },
  { key: 'price', label: 'Market price' },
  { key: 'demand', label: 'Demand' },
]

const DEMAND_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 } as const
const DEMAND_TONE = { HIGH: 'green', MEDIUM: 'blue', LOW: 'orange', UNKNOWN: 'dim' } as const
const TIER_TONE = { EARLY: 'dim', MID: 'blue', LATE: 'purple', END: 'gold' } as const

function HistoryChart({ id }: { id: string }) {
  const [points, setPoints] = useState<PricePoint[] | null>(null)
  useEffect(() => {
    let alive = true
    fetchWeaponHistory(id).then(p => { if (alive) setPoints(p) }).catch(() => { if (alive) setPoints([]) })
    return () => { alive = false }
  }, [id])
  if (points === null) return <div className="skel" style={{ height: 110, borderRadius: 10 }} />
  return (
    <PriceChart
      points={points.map(p => ({ label: new Date(p.time).toLocaleString(), value: p.avg }))}
      color="var(--up)"
      h={110}
    />
  )
}

export default function CraftWeaponsPage() {
  const [rows, setRows] = useState<WeaponRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounced(searchRaw)
  const [category, setCategory] = useState<WeaponCategory | 'ALL'>('ALL')
  const [craftableOnly, setCraftableOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('profit')

  const load = useCallback(async () => {
    try {
      const data = await fetchWeaponFlips()
      setRows(data.rows)
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

  const filtered = useMemo(() => {
    return rows
      .filter(r => category === 'ALL' || r.category === category)
      .filter(r => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
      .filter(r => !craftableOnly || (r.craftable && r.netProfit > 0))
      .sort((a, b) => {
        if (sortKey === 'roi') return b.roi - a.roi
        if (sortKey === 'price') return b.marketPrice - a.marketPrice
        if (sortKey === 'demand') return DEMAND_RANK[b.demand] - DEMAND_RANK[a.demand]
        const ap = a.craftable ? a.netProfit : -Infinity
        const bp = b.craftable ? b.netProfit : -Infinity
        return bp - ap
      })
  }, [rows, category, search, craftableOnly, sortKey])

  const bestProfit = rows.filter(r => r.craftable).reduce((m, r) => Math.max(m, r.netProfit), 0)
  const craftableCount = rows.filter(r => r.craftable && r.netProfit > 0).length

  return (
    <Shell>
      <PageHead
        title="Weapon"
        highlight="Market"
        sub="The SkyBlock weapon economy by category — live BIN pricing, full crafting-tree costs and AH-tax-true net profit. Rift gear excluded (trades in motes, not coins)."
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Best craft flip" value={bestProfit} format={(n) => `+${coinsShort(n)}`} accent="var(--up)" sub="Net after AH fees" />
        <StatCard label="Craft-flippable" value={craftableCount} accent="var(--accent)" sub={`of ${rows.length} tracked weapons`} />
      </PageHead>

      <div className="bar">
        <input className="search" placeholder="Search weapon…" value={searchRaw} onChange={e => setSearchRaw(e.target.value)} />
        <SortSelect
          label="Category"
          value={category}
          onChange={setCategory}
          options={[{ key: 'ALL' as const, label: 'All' }, ...WEAPON_CATEGORIES.map(c => ({ key: c.key, label: c.label }))]}
        />
        <button className={`pill${craftableOnly ? ' on-green' : ''}`} onClick={() => setCraftableOnly(v => !v)}>
          {craftableOnly ? 'Profitable crafts' : 'All weapons'}
        </button>
        <SortSelect value={sortKey} onChange={setSortKey} options={SORTS} />
      </div>

      {!loading && filtered.length === 0 && (
        <div className="card">
          <Void glyph="—" title="No weapons match" sub="Clear the search or switch category" />
        </div>
      )}

      <FlipGrid>
        {loading && <div className="grid-span"><Loader /></div>}
        {!loading && filtered.map((r, i) => {
          const isOpen = expanded === r.id
          const catLabel = WEAPON_CATEGORIES.find(c => c.key === r.category)?.label ?? r.category
          return (
            <FlipCard
              key={r.id}
              rank={i + 1}
              iconId={r.id}
              title={r.name}
              chips={<>
                <Chip label={r.tier} tone={TIER_TONE[r.tier]} />
                {r.manipulated && <Chip label="!" tone="red" />}
              </>}
              sub={<>{catLabel} · demand {r.demand.toLowerCase()}{r.volume ? ` · ${r.volume} sales` : ''}</>}
              stats={[
                { label: 'Market (LBIN)', value: coinsShort(r.marketPrice), color: 'var(--accent)' },
                { label: 'Craft cost', value: r.craftable ? coinsShort(r.craftCostOrder) : 'drop only', color: r.craftable ? 'var(--info)' : 'var(--faint)' },
                { label: 'ROI', value: r.craftable ? `${r.roi.toFixed(0)}%` : '—', color: r.roi > 15 ? 'var(--up)' : 'var(--dim)' },
                { label: 'Demand', value: r.demand, color: r.demand === 'HIGH' ? 'var(--up)' : 'var(--dim)' },
              ]}
              net={r.craftable ? `${r.netProfit > 0 ? '+' : ''}${coinsShort(r.netProfit)}` : coinsShort(r.marketPrice)}
              netSub={r.craftable ? 'net craft profit' : 'market price'}
              netColor={!r.craftable ? 'var(--text)' : r.netProfit > 0 ? 'var(--up)' : 'var(--down)'}
              open={isOpen}
              onToggle={() => setExpanded(isOpen ? null : r.id)}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
                {[
                  { label: 'Gross sale (LBIN)', val: coins(r.grossSale), color: 'var(--accent)' },
                  { label: 'AH listing fee', val: `−${coins(r.ahListingFee)}`, color: 'var(--down)' },
                  { label: 'AH claiming tax', val: `−${coins(r.ahClaimingTax)}`, color: 'var(--down)' },
                  { label: 'Median sale', val: r.median > 0 ? coins(r.median) : '—', color: 'var(--text)' },
                  ...(r.craftable ? [
                    { label: 'Craft (buy orders)', val: coins(r.craftCostOrder), color: 'var(--info)' },
                    { label: 'Craft (insta-buy)', val: coins(r.craftCostInsta), color: '#d97e06' },
                    { label: 'Net profit (orders)', val: `${r.netProfit > 0 ? '+' : ''}${coins(r.netProfit)}`, color: r.netProfit > 0 ? 'var(--up)' : 'var(--down)' },
                    { label: 'Net profit (insta)', val: `${r.netProfitInsta > 0 ? '+' : ''}${coins(r.netProfitInsta)}`, color: r.netProfitInsta > 0 ? 'var(--up)' : 'var(--down)' },
                  ] : []),
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <div className="mini-label">{label}</div>
                    <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{val}</div>
                  </div>
                ))}
              </div>

              {r.ingredients.length > 0 && (
                <div className="recipe-strip" style={{ marginBottom: 14 }}>
                  <span className="mini-label" style={{ marginBottom: 0 }}>Crafting tree</span>
                  {r.ingredients.map(ing => (
                    <span key={ing.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: 'var(--dim)' }}>
                      <ItemIcon id={ing.id} size={18} />
                      <span className="mono" style={{ color: 'var(--text)' }}>{ing.qty}×</span>
                      {ing.name}
                      <span className="mono" style={{ color: 'var(--faint)' }}>({coinsShort(ing.orderCost)})</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="mini-label" style={{ marginBottom: 8 }}>Price trend — 24h</div>
              {isOpen && <HistoryChart id={r.id} />}
            </FlipCard>
          )
        })}
      </FlipGrid>

      <RefreshTimer intervalMs={300_000} lastUpdated={lastUpdated} />
    </Shell>
  )
}
