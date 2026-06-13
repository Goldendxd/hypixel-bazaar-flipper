'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchKatFlips, KatFlipRow } from '@/lib/petsFlips'
import { Loader, Chip, FlipCard, FlipGrid, ItemIcon, Oracle, PageHead, SortSelect, StatCard, Void, coins, coinsShort } from '@/components/ui'
import { useDebounced } from '@/components/hooks'

type SortKey = 'profit' | 'roi' | 'perHour' | 'volume'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'profit', label: 'Net profit' },
  { key: 'roi', label: 'ROI %' },
  { key: 'perHour', label: 'Coins per hour' },
  { key: 'volume', label: 'Sales volume' },
]

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h >= 24) return `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`
  return `${Math.round(h * 10) / 10}h`
}

export default function PetsFlipPage() {
  const [rows, setRows] = useState<KatFlipRow[]>([])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounced(searchRaw)
  const [maxHours, setMaxHours] = useState<number | ''>('')
  const [budget, setBudget] = useState<number | ''>('')
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'LOW'>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('profit')

  const load = useCallback(async () => {
    try {
      const data = await fetchKatFlips()
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
      .filter(r => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
      .filter(r => maxHours === '' || r.upgradeHours <= maxHours)
      .filter(r => budget === '' || r.totalCost <= budget)
      .filter(r => riskFilter === 'ALL' || r.risk === 'LOW')
      .sort((a, b) => {
        if (sortKey === 'roi') return b.roi - a.roi
        if (sortKey === 'perHour') return b.profitPerHour - a.profitPerHour
        if (sortKey === 'volume') return b.weeklySales - a.weeklySales
        return b.profit - a.profit
      })
  }, [rows, search, maxHours, budget, riskFilter, sortKey])

  const best = filtered[0]?.profit ?? 0

  return (
    <Shell>
      <PageHead
        title="Kat"
        highlight="Flips"
        sub="Buy a pet, pay Kat to upgrade its rarity, resell the upgraded pet — deduped to the cheapest live auction per route, fees included"
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Best flip" value={best} format={(n) => `+${coinsShort(n)}`} accent="var(--up)" sub="After AH fees" />
        <StatCard label="Routes live" value={filtered.length} accent="var(--accent)" sub="With real sales volume" />
      </PageHead>

      <Oracle text={aiSummary} />

      <div className="bar">
        <input className="search" placeholder="Search pet…" value={searchRaw} onChange={e => setSearchRaw(e.target.value)} />
        <div className="field">
          <label>Budget</label>
          <input type="number" value={budget} min={0} placeholder="any"
            onChange={e => setBudget(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Max hours</label>
          <input type="number" value={maxHours} min={0} placeholder="any"
            onChange={e => setMaxHours(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button className={`pill${riskFilter === 'LOW' ? ' on-green' : ''}`} onClick={() => setRiskFilter(f => f === 'ALL' ? 'LOW' : 'ALL')}>
          {riskFilter === 'LOW' ? 'Low risk only' : 'All risk levels'}
        </button>
        <SortSelect value={sortKey} onChange={setSortKey} options={SORTS} />
      </div>

      {!loading && filtered.length === 0 && (
        <div className="card">
          <Void glyph="—" title="No Kat flips match" sub="Raise the budget / hours, or include higher-risk routes" />
        </div>
      )}

      <FlipGrid>
        {loading && <div className="grid-span"><Loader /></div>}
        {!loading && filtered.map((r, i) => {
          const key = `${r.tag}-${r.buyRarity}-${r.sellRarity}`
          const isOpen = expanded === key
          return (
            <FlipCard
              key={key}
              rank={i + 1}
              iconId={r.tag}
              title={r.name}
              titleClass={`rar-${r.sellRarity}`}
              chips={r.risk !== 'LOW' ? <Chip label={r.risk === 'HIGH' ? 'HIGH RISK' : 'MED RISK'} tone={r.risk === 'HIGH' ? 'red' : 'orange'} /> : undefined}
              sub={<>
                <span className={`rar-${r.buyRarity}`}>{r.buyRarity.toLowerCase()}</span>
                {' to '}
                <span className={`rar-${r.sellRarity}`}>{r.sellRarity.toLowerCase()}</span>
                {' · '}{fmtHours(r.upgradeHours)} with Kat
              </>}
              stats={[
                { label: 'Total cost', value: coinsShort(r.totalCost), color: 'var(--info)' },
                { label: 'Sells for', value: coinsShort(r.sellPrice), color: 'var(--accent)' },
                { label: 'ROI', value: `${r.roi.toFixed(0)}%`, color: r.roi > 50 ? 'var(--up)' : 'var(--dim)' },
                { label: 'Coins/h', value: coinsShort(r.profitPerHour), color: 'var(--purple)' },
                { label: 'Sales', value: String(r.weeklySales), color: 'var(--dim)' },
              ]}
              net={`+${coinsShort(r.profit)}`}
              netSub="net profit"
              open={isOpen}
              onToggle={() => setExpanded(isOpen ? null : key)}
            >
              {r.riskReason && (
                <div style={{ marginBottom: 12, fontSize: '0.76rem', color: r.risk === 'HIGH' ? 'var(--down)' : '#d97e06', fontWeight: 700 }}>
                  {r.riskReason}
                </div>
              )}
              {r.aiTip && (
                <div style={{ marginBottom: 12, fontSize: '0.78rem', color: 'var(--purple)' }}>{r.aiTip}</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: r.materials.length > 0 ? 12 : 0 }}>
                {[
                  { label: 'Pet purchase', val: coins(r.buyPrice), color: 'var(--info)' },
                  { label: 'Kat fee', val: coins(r.upgradeCost), color: '#d97e06' },
                  { label: 'Materials', val: r.materialCost > 0 ? coins(r.materialCost) : '—', color: '#d97e06' },
                  { label: 'Gross sale (median)', val: coins(r.grossSell), color: 'var(--accent)' },
                  { label: 'AH fees', val: `−${coins(r.grossSell - r.sellPrice)}`, color: 'var(--down)' },
                  { label: 'Net after fees', val: coins(r.sellPrice), color: 'var(--accent)' },
                  { label: 'Upgrade time', val: fmtHours(r.upgradeHours), color: 'var(--text)' },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <div className="mini-label">{label}</div>
                    <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color }}>{val}</div>
                  </div>
                ))}
              </div>
              {r.materials.length > 0 && (
                <div className="recipe-strip">
                  <span className="mini-label" style={{ marginBottom: 0 }}>Materials</span>
                  {r.materials.map(m => (
                    <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: 'var(--dim)' }}>
                      <ItemIcon id={m.id} size={18} />
                      <span className="mono" style={{ color: 'var(--text)' }}>{m.qty}×</span> {m.name}
                    </span>
                  ))}
                </div>
              )}
            </FlipCard>
          )
        })}
      </FlipGrid>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </Shell>
  )
}
