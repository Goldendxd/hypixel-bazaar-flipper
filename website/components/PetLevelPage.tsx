'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchPetLevelFlips, PetLevelRow } from '@/lib/petLevelFlips'
import { Loader, Chip, FlipCard, FlipGrid, PageHead, SortSelect, StatCard, Void, coins, coinsShort } from '@/components/ui'
import { useDebounced } from '@/components/hooks'

type SortKey = 'value' | 'spread' | 'fann' | 'cheap'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'value', label: 'Value per 1M XP' },
  { key: 'spread', label: 'Gross spread' },
  { key: 'fann', label: 'Profit via Fann' },
  { key: 'cheap', label: 'Cheapest entry' },
]

const VERDICT_TONE = { STRONG: 'green', OK: 'blue', GRIND: 'orange', SKIP: 'dim' } as const
const VERDICT_LABEL = { STRONG: 'STRONG', OK: 'GOOD', GRIND: 'GRIND', SKIP: 'SKIP' } as const

export default function PetLevelPage() {
  const [rows, setRows] = useState<PetLevelRow[]>([])
  const [checked, setChecked] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounced(searchRaw)
  const [budget, setBudget] = useState<number | ''>('')
  const [fannOnly, setFannOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('value')

  const load = useCallback(async () => {
    try {
      const data = await fetchPetLevelFlips()
      setRows(data.rows); setChecked(data.checked)
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
      .filter(r => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
      .filter(r => budget === '' || r.lvl1Price <= budget)
      .filter(r => !fannOnly || r.netViaFann > 0)
      .sort((a, b) => {
        if (sortKey === 'spread') return b.grossSpread - a.grossSpread
        if (sortKey === 'fann') return b.netViaFann - a.netViaFann
        if (sortKey === 'cheap') return a.lvl1Price - b.lvl1Price
        return b.valuePerMilXp - a.valuePerMilXp
      })
  }, [rows, search, budget, fannOnly, sortKey])

  const best = filtered[0]?.valuePerMilXp ?? 0
  const strongCount = rows.filter(r => r.verdict === 'STRONG').length

  return (
    <Shell>
      <PageHead
        title="Pet"
        highlight="Leveling"
        sub="Buy a Lvl 1 pet, level it with Fann or by grinding, resell at Lvl 100. Ranked by coin value gained per million XP invested — the metric that survives whatever XP method you use."
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Best value / 1M XP" value={best} format={(n) => `+${coinsShort(n)}`} accent="var(--up)" sub="Top opportunity" />
        <StatCard label="Profit even via Fann" value={strongCount} accent="var(--accent)" sub={`of ${checked} pets checked`} />
      </PageHead>

      <div className="note">
        <strong style={{ color: 'var(--text)' }}>How to read this:</strong> Value per 1M XP is the gross spread divided by the XP needed to reach Lvl 100.
        Higher means more coins earned for every million XP you pour in. <span style={{ color: 'var(--up)', fontWeight: 700 }}>STRONG</span> flips profit even if you pay Fann to level (1.6 coins/XP);
        <span style={{ color: '#d97e06', fontWeight: 700 }}> GRIND</span> flips only pay off if you level cheaply by using the pet yourself.
      </div>

      <div className="bar">
        <input className="search" placeholder="Search pet…" value={searchRaw} onChange={e => setSearchRaw(e.target.value)} />
        <div className="field">
          <label>Max entry</label>
          <input type="number" value={budget} min={0} placeholder="any"
            onChange={e => setBudget(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <button className={`pill${fannOnly ? ' on-green' : ''}`} onClick={() => setFannOnly(v => !v)}>
          {fannOnly ? 'Fann-profitable only' : 'All flips'}
        </button>
        <SortSelect value={sortKey} onChange={setSortKey} options={SORTS} />
      </div>

      {!loading && filtered.length === 0 && (
        <div className="card">
          <Void glyph="—" title="No pet flips match" sub="Raise the budget or clear the Fann-only filter" />
        </div>
      )}

      <FlipGrid>
        {loading && <div className="grid-span"><Loader /></div>}
        {!loading && filtered.map((r, i) => {
          const isOpen = expanded === r.tag
          return (
            <FlipCard
              key={r.tag}
              rank={i + 1}
              iconId={r.tag}
              title={`${r.name}`}
              titleClass={`rar-${r.rarity}`}
              chips={<Chip label={VERDICT_LABEL[r.verdict]} tone={VERDICT_TONE[r.verdict]} />}
              sub={<>Lvl 1 → Lvl 100 · {(r.xpNeeded / 1e6).toFixed(1)}M XP · {r.rarity.toLowerCase()}</>}
              stats={[
                { label: 'Buy Lvl 1', value: coinsShort(r.lvl1Price), color: 'var(--info)' },
                { label: 'Sell Lvl 100', value: coinsShort(r.lvl100Price), color: 'var(--accent)' },
                { label: 'Spread', value: `+${coinsShort(r.grossSpread)}`, color: 'var(--up)' },
                { label: 'Via Fann', value: `${r.netViaFann >= 0 ? '+' : ''}${coinsShort(r.netViaFann)}`, color: r.netViaFann > 0 ? 'var(--up)' : 'var(--down)' },
              ]}
              net={`${coinsShort(r.valuePerMilXp)}`}
              netSub="per 1M XP"
              netColor="var(--up)"
              open={isOpen}
              onToggle={() => setExpanded(isOpen ? null : r.tag)}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Lvl 1 entry (cheapest)', val: coins(r.lvl1Price), color: 'var(--info)' },
                  { label: 'Lvl 100 exit (cheapest)', val: coins(r.lvl100Price), color: 'var(--accent)' },
                  { label: 'AH fees on exit', val: `−${coins(r.ahFees)}`, color: 'var(--down)' },
                  { label: 'Gross spread (net of fees)', val: `+${coins(r.grossSpread)}`, color: 'var(--up)' },
                  { label: 'XP to Lvl 100', val: `${(r.xpNeeded / 1e6).toFixed(2)}M`, color: 'var(--text)' },
                  { label: 'Value per 1M XP', val: coins(r.valuePerMilXp), color: 'var(--up)' },
                  { label: 'Fann cost (1.6/XP)', val: coins(r.fannCost), color: '#d97e06' },
                  { label: 'Net if Fann-leveled', val: `${r.netViaFann >= 0 ? '+' : ''}${coins(r.netViaFann)}`, color: r.netViaFann > 0 ? 'var(--up)' : 'var(--down)' },
                  { label: 'Lvl 1 listings', val: String(r.lvl1Count), color: 'var(--dim)' },
                  { label: 'Lvl 100 listings', val: String(r.lvl100Count), color: 'var(--dim)' },
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

      <RefreshTimer intervalMs={300_000} lastUpdated={lastUpdated} />
    </Shell>
  )
}
