'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchWeaponFlips, fetchWeaponHistory, WeaponRow, PricePoint } from '@/lib/weaponFlips'
import { WEAPON_CATEGORIES, WeaponCategory } from '@/lib/weaponCatalog'
import { Chip, ItemIcon, PageHead, PriceChart, SkelRows, StatCard, Void, coins, coinsShort } from '@/components/ui'
import { useDebounced } from '@/components/hooks'

const GRID = '30px minmax(190px, 1.6fr) 90px 110px 110px 110px 84px 80px'

type SortKey = 'profit' | 'roi' | 'price' | 'demand'
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
  if (points === null) return <div className="skel" style={{ height: 120, borderRadius: 10 }} />
  return (
    <PriceChart
      points={points.map(p => ({ label: new Date(p.time).toLocaleString(), value: p.avg }))}
      color="var(--up)"
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

  const HEAD: Array<{ label: string; sort?: SortKey; align?: 'right' }> = [
    { label: '#' },
    { label: 'Weapon' },
    { label: 'Demand', sort: 'demand', align: 'right' },
    { label: 'Market (LBIN)', sort: 'price', align: 'right' },
    { label: 'Craft cost', align: 'right' },
    { label: 'Net profit', sort: 'profit', align: 'right' },
    { label: 'ROI', sort: 'roi', align: 'right' },
    { label: 'Sales', align: 'right' },
  ]

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
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value as WeaponCategory | 'ALL')}>
            <option value="ALL">All</option>
            {WEAPON_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <button className={`pill${craftableOnly ? ' on-green' : ''}`} onClick={() => setCraftableOnly(v => !v)}>
          {craftableOnly ? '✓ Profitable crafts' : 'All weapons'}
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

        {loading && <SkelRows n={12} />}

        {!loading && filtered.length === 0 && (
          <Void glyph="⚔" title="No weapons match" sub="Clear the search or switch category" />
        )}

        {!loading && filtered.map((r, i) => {
          const isOpen = expanded === r.id
          const catLabel = WEAPON_CATEGORIES.find(c => c.key === r.category)?.label ?? r.category
          return (
            <div key={r.id} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 56px' } as React.CSSProperties}>
              <div className="gt-row" style={{ gridTemplateColumns: GRID }} onClick={() => setExpanded(isOpen ? null : r.id)}>
                <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--faint)' }}>{i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div className="ifr" style={{ width: 32, height: 32 }}><ItemIcon id={r.id} size={26} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.83rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.name}
                      {r.manipulated && <Chip label="⚠" tone="red" />}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                      <Chip label={catLabel} tone="dim" />
                      <Chip label={r.tier} tone={TIER_TONE[r.tier]} />
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}><Chip label={r.demand} tone={DEMAND_TONE[r.demand]} /></div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--accent)' }}>{coinsShort(r.marketPrice)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: r.craftable ? 'var(--info)' : 'var(--faint)' }}>
                  {r.craftable ? coinsShort(r.craftCostOrder) : 'drop only'}
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.83rem', fontWeight: 800, color: !r.craftable ? 'var(--faint)' : r.netProfit > 0 ? 'var(--up)' : 'var(--down)' }}>
                  {r.craftable ? `${r.netProfit > 0 ? '+' : ''}${coinsShort(r.netProfit)}` : '—'}
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.76rem', fontWeight: 700, color: r.roi > 15 ? 'var(--up)' : 'var(--dim)' }}>
                  {r.craftable ? `${r.roi.toFixed(0)}%` : '—'}
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.76rem', color: 'var(--dim)' }}>{r.volume || '—'}</div>
              </div>

              {isOpen && (
                <div className="gt-expand">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
                    {[
                      { label: 'Gross sale (LBIN)', val: coins(r.grossSale), color: 'var(--accent)' },
                      { label: 'AH listing fee', val: `−${coins(r.ahListingFee)}`, color: 'var(--down)' },
                      { label: 'AH claiming tax', val: `−${coins(r.ahClaimingTax)}`, color: 'var(--down)' },
                      { label: 'Median sale', val: r.median > 0 ? coins(r.median) : '—', color: 'var(--text)' },
                      ...(r.craftable ? [
                        { label: 'Craft (buy orders)', val: coins(r.craftCostOrder), color: 'var(--info)' },
                        { label: 'Craft (insta-buy)', val: coins(r.craftCostInsta), color: 'var(--warn)' },
                        { label: 'NET profit (orders)', val: `${r.netProfit > 0 ? '+' : ''}${coins(r.netProfit)}`, color: r.netProfit > 0 ? 'var(--up)' : 'var(--down)' },
                        { label: 'NET profit (insta)', val: `${r.netProfitInsta > 0 ? '+' : ''}${coins(r.netProfitInsta)}`, color: r.netProfitInsta > 0 ? 'var(--up)' : 'var(--down)' },
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
                  <HistoryChart id={r.id} />
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
