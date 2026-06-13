'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchFusionFlips, FusionFlipRow } from '@/lib/fusionFlips'
import { Loader, FlipCard, FlipGrid, ItemIcon, PageHead, SortSelect, StatCard, Void, coins, coinsShort } from '@/components/ui'
import { useDebounced } from '@/components/hooks'

type SortKey = 'total' | 'perFusion' | 'margin'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'total', label: '10M-scale profit' },
  { key: 'perFusion', label: 'Profit per fusion' },
  { key: 'margin', label: 'Margin %' },
]

export default function FusionFlipPage() {
  const [rows, setRows] = useState<FusionFlipRow[]>([])
  const [totalShards, setTotalShards] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounced(searchRaw)
  const [minMargin, setMinMargin] = useState<number | ''>('')
  const [sortKey, setSortKey] = useState<SortKey>('total')

  const load = useCallback(async () => {
    try {
      const data = await fetchFusionFlips()
      setRows(data.rows)
      setTotalShards(data.totalShards)
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
      .filter(r => minMargin === '' || r.margin >= minMargin)
      .sort((a, b) => {
        if (sortKey === 'perFusion') return b.profitPerFusion - a.profitPerFusion
        if (sortKey === 'margin') return b.margin - a.margin
        return b.totalProfit - a.totalProfit
      })
      .slice(0, 60)
  }, [rows, search, minMargin, sortKey])

  const best = filtered[0]?.profitPerFusion ?? 0

  return (
    <Shell>
      <PageHead
        title="Shard"
        highlight="Fusion"
        sub={`Fuse two attribute shards into a pricier one — ${totalShards || '…'} Galatea shards scanned, best input combo auto-selected per output`}
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Best fusion" value={best} format={(n) => `+${coinsShort(n)}`} accent="var(--up)" sub="Per fusion" />
        <StatCard label="Profitable fusions" value={filtered.length} accent="var(--accent)" sub="Live recipes" />
      </PageHead>

      <div className="bar">
        <input className="search" placeholder="Search shard…" value={searchRaw} onChange={e => setSearchRaw(e.target.value)} />
        <div className="field">
          <label>Min margin %</label>
          <input type="number" value={minMargin} min={0} placeholder="any"
            onChange={e => setMinMargin(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <SortSelect value={sortKey} onChange={setSortKey} options={SORTS} />
        <span className="mono" style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--faint)' }}>
          FUSION MACHINE · GALATEA
        </span>
      </div>

      {!loading && filtered.length === 0 && (
        <div className="card">
          <Void glyph="—" title="No profitable fusions right now" sub="Shard prices move fast — check back in a minute" />
        </div>
      )}

      <FlipGrid>
        {loading && <div className="grid-span"><Loader /></div>}
        {!loading && filtered.map((r, i) => {
          const isOpen = expanded === r.id
          return (
            <FlipCard
              key={r.id}
              rank={i + 1}
              iconId={r.id}
              iconSrc={r.iconUrl}
              title={r.name}
              titleClass={`rar-${r.rarity?.toUpperCase()}`}
              chips={r.outputQty > 1 ? <span className="mono" style={{ color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 700 }}>x{r.outputQty}</span> : undefined}
              sub={<>{r.input1.qty}× {r.input1.name} + {r.input2.qty}× {r.input2.name}</>}
              stats={[
                { label: 'Input cost', value: coinsShort(r.inputCost), color: 'var(--info)' },
                { label: 'Sell offer', value: coinsShort(r.sellPrice), color: 'var(--accent)' },
                { label: 'Margin', value: `${r.margin.toFixed(0)}%`, color: r.margin > 30 ? 'var(--up)' : 'var(--dim)' },
                { label: '10M scale', value: `+${coinsShort(r.totalProfit)}`, color: 'var(--purple)' },
              ]}
              net={`+${coinsShort(r.profitPerFusion)}`}
              netSub="per fusion"
              open={isOpen}
              onToggle={() => setExpanded(isOpen ? null : r.id)}
            >
              <div className="recipe-strip" style={{ marginBottom: 12 }}>
                <span className="mini-label" style={{ marginBottom: 0 }}>Fuse</span>
                {[r.input1, r.input2].map((inp, k) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: 'var(--dim)' }}>
                    <ItemIcon id={inp.id} src={inp.iconUrl} size={18} />
                    <span className="mono" style={{ color: 'var(--text)' }}>{inp.qty}×</span>
                    <span className={`rar-${inp.rarity?.toUpperCase()}`}>{inp.name}</span>
                    <span className="mono" style={{ color: 'var(--faint)' }}>({coinsShort(inp.unitPrice)} ea)</span>
                    {k === 0 && <span style={{ color: 'var(--accent)', margin: '0 4px' }}>+</span>}
                  </span>
                ))}
                <span style={{ color: 'var(--accent)' }}>=</span>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text)' }}>{r.outputQty}× {r.name}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Input cost', val: coins(r.inputCost), color: 'var(--info)' },
                  { label: 'Sell offer / shard', val: coins(r.sellPrice), color: 'var(--accent)' },
                  { label: 'Fusions in 10M', val: r.fusesIn10M.toLocaleString(), color: 'var(--text)' },
                  { label: 'Weekly volume', val: coinsShort(r.weeklyVolume), color: 'var(--text)' },
                  { label: 'Fill score', val: `${r.fillScore}/100`, color: r.fillScore > 50 ? 'var(--up)' : 'var(--dim)' },
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
