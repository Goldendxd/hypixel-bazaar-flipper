'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchFusionFlips, FusionFlipRow } from '@/lib/fusionFlips'
import { ItemIcon, PageHead, SkelRows, StatCard, Void, coins, coinsShort } from '@/components/ui'

const GRID = '30px minmax(190px, 1.6fr) 120px 110px 110px 84px 90px'

type SortKey = 'total' | 'perFusion' | 'margin'

export default function FusionFlipPage() {
  const [rows, setRows] = useState<FusionFlipRow[]>([])
  const [totalShards, setTotalShards] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [search, setSearch] = useState('')
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

  const HEAD: Array<{ label: string; sort?: SortKey; align?: 'right' }> = [
    { label: '#' },
    { label: 'Output shard' },
    { label: 'Input cost', align: 'right' },
    { label: 'Sell offer', align: 'right' },
    { label: 'Per fusion', sort: 'perFusion', align: 'right' },
    { label: 'Margin', sort: 'margin', align: 'right' },
    { label: '10M scale', sort: 'total', align: 'right' },
  ]

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
        <StatCard label="Best fusion" value={best} format={(n) => `+${coinsShort(n)}`} accent="var(--green)" sub="Per fusion" />
        <StatCard label="Profitable fusions" value={filtered.length} accent="var(--gold)" sub="Live recipes" />
      </PageHead>

      <div className="bar">
        <input className="search" placeholder="Search shard…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="field">
          <label>Min margin %</label>
          <input type="number" value={minMargin} min={0} placeholder="any"
            onChange={e => setMinMargin(e.target.value === '' ? '' : Number(e.target.value))} />
        </div>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--faint)' }}>
          FUSION MACHINE · GALATEA
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
          <Void glyph="❖" title="No profitable fusions right now" sub="Shard prices move fast — check back in a minute" />
        )}

        {!loading && filtered.map((r, i) => {
          const isOpen = expanded === r.id
          return (
            <div key={r.id}>
              <div className="gt-row" style={{ gridTemplateColumns: GRID }} onClick={() => setExpanded(isOpen ? null : r.id)}>
                <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--faint)' }}>{i + 1}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div className="ifr" style={{ width: 32, height: 32 }}><ItemIcon id={r.id} src={r.iconUrl} size={24} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.83rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.name}
                      {r.outputQty > 1 && <span className="mono" style={{ color: 'var(--gold-hi)', marginLeft: 6, fontSize: '0.7rem' }}>×{r.outputQty}</span>}
                    </div>
                    <div className={`mono rar-${r.rarity?.toUpperCase()}`} style={{ fontSize: '0.62rem' }}>{r.rarity}</div>
                  </div>
                </div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--blue)' }}>{coinsShort(r.inputCost)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--gold-hi)' }}>{coinsShort(r.sellPrice)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.83rem', fontWeight: 800, color: 'var(--green)' }}>+{coinsShort(r.profitPerFusion)}</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.76rem', fontWeight: 700, color: r.margin > 30 ? 'var(--green)' : 'var(--dim)' }}>{r.margin.toFixed(0)}%</div>
                <div className="mono" style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--purple)' }}>+{coinsShort(r.totalProfit)}</div>
              </div>

              {isOpen && (
                <div className="gt-expand">
                  <div className="recipe-strip" style={{ marginBottom: 12 }}>
                    <span className="mini-label" style={{ marginBottom: 0 }}>Fuse</span>
                    {[r.input1, r.input2].map((inp, k) => (
                      <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: 'var(--dim)' }}>
                        <ItemIcon id={inp.id} src={inp.iconUrl} size={18} />
                        <span className="mono" style={{ color: 'var(--text)' }}>{inp.qty}×</span>
                        <span className={`rar-${inp.rarity?.toUpperCase()}`}>{inp.name}</span>
                        <span className="mono" style={{ color: 'var(--faint)' }}>({coinsShort(inp.unitPrice)} ea)</span>
                        {k === 0 && <span style={{ color: 'var(--gold)', margin: '0 4px' }}>+</span>}
                      </span>
                    ))}
                    <span style={{ color: 'var(--gold)' }}>→</span>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--gold-hi)' }}>{r.outputQty}× {r.name}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Input cost', val: coins(r.inputCost), color: 'var(--blue)' },
                      { label: 'Sell offer / shard', val: coins(r.sellPrice), color: 'var(--gold-hi)' },
                      { label: 'Fusions in 10M', val: r.fusesIn10M.toLocaleString(), color: 'var(--text)' },
                      { label: 'Weekly volume', val: coinsShort(r.weeklyVolume), color: 'var(--text)' },
                      { label: 'Fill score', val: `${r.fillScore}/100`, color: r.fillScore > 50 ? 'var(--green)' : 'var(--gold)' },
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
