'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchForgeFlips, ForgeFlipRow, IngredientDetail } from '@/lib/forgeFlips'
import Sidebar from '@/components/Sidebar'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

function fmtDur(s: number): string {
  if (s <= 0) return '< 1m'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function ItemIcon({ id, src, name, size = 28 }: { id?: string; src?: string; name: string; size?: number }) {
  const primary = src ?? (id ? `https://sky.shiiyu.moe/api/item/${id}` : '')
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={primary}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb && id) {
          img.dataset.fb = '1'
          img.src = `https://sky.lea.moe/api/item/${id}`
        } else { img.style.opacity = '0.3' }
      }}
    />
  )
}

function IngRow({ ing, depth = 0 }: { ing: IngredientDetail; depth?: number }) {
  const [open, setOpen] = useState(false)
  const hasChildren = ing.isForged && (ing.subIngredients?.length ?? 0) > 0

  return (
    <>
      <div
        onClick={() => hasChildren && setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          paddingLeft: 10 + depth * 16,
          paddingRight: 10, paddingTop: 5, paddingBottom: 5,
          borderBottom: '1px solid var(--border)',
          cursor: hasChildren ? 'pointer' : 'default',
          background: depth > 0 ? 'var(--surface2)' : undefined,
        }}
      >
        {depth > 0 && <div style={{ width: 2, alignSelf: 'stretch', background: 'var(--border2)', borderRadius: 1, marginRight: 2, flexShrink: 0 }} />}
        <div style={{ width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ItemIcon src={ing.iconUrl} name={ing.name} size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
          {ing.isForged && (
            <span style={{ fontSize: '0.55rem', background: 'rgba(255,140,0,0.12)', color: 'var(--amber)', border: '1px solid rgba(255,140,0,0.25)', borderRadius: 3, padding: '0 4px', lineHeight: '13px', flexShrink: 0 }}>FORGED</span>
          )}
          <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.name}</span>
          {ing.isForged && ing.forgeTime !== undefined && (
            <span style={{ fontSize: '0.6rem', color: 'var(--muted)', flexShrink: 0 }}>({fmtDur(ing.forgeTime)})</span>
          )}
        </div>
        <span className="mono" style={{ fontSize: '0.67rem', color: 'var(--muted)', flexShrink: 0 }}>×{Number.isInteger(ing.qty) ? ing.qty : ing.qty.toFixed(1)}</span>
        <span className="mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0, minWidth: 48, textAlign: 'right' }}>{coins(ing.totalPrice)}</span>
        {hasChildren && <span style={{ fontSize: '0.55rem', color: 'var(--muted)', flexShrink: 0 }}>{open ? '▲' : '▼'}</span>}
      </div>
      {open && ing.subIngredients?.map((s, i) => <IngRow key={i} ing={s} depth={depth + 1} />)}
    </>
  )
}

function ForgeCard({ row }: { row: ForgeFlipRow }) {
  const [expanded, setExpanded] = useState(false)
  const isMultiStage = row.chainDepth >= 2
  const accentColor = row.isShort ? 'var(--amber)' : 'var(--blue)'

  return (
    <div className="flip-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card-accent" style={{ background: row.isShort ? 'linear-gradient(90deg, var(--amber), #fde68a)' : 'linear-gradient(90deg, var(--blue), #93c5fd)' }} />

      <div className="card-header">
        <div className="icon-box">
          <ItemIcon src={row.iconUrl} name={row.name} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-name">{row.name}</div>
          <div className="card-sub" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ color: accentColor, fontWeight: 600 }}>
              ⏱ {row.isChained && row.totalDuration !== row.duration
                ? `${fmtDur(row.duration)} +${fmtDur(row.totalDuration - row.duration)}`
                : fmtDur(row.duration)}
            </span>
            {isMultiStage && <span className="badge badge-red">{row.chainDepth}-STAGE</span>}
            {row.isChained && !isMultiStage && <span className="badge badge-gold">CHAIN</span>}
            {row.requiresHotM && <span className="badge badge-muted">{row.requiresHotM}</span>}
          </div>
        </div>
        <span className="badge badge-green mono">{row.margin.toFixed(1)}%</span>
      </div>

      {row.isChained && row.totalDuration > row.duration && (
        <div style={{ margin: '0 10px 8px', padding: '6px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Total chain time</span>
          <span className="mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: accentColor }}>{fmtDur(row.totalDuration)}</span>
        </div>
      )}

      <div className="divider" />

      <div className="card-stats">
        <div>
          <div className="stat-label">Ingredient Cost</div>
          <div className="stat-value mono" style={{ color: 'var(--red)', fontSize: '0.9rem' }}>{coins(row.ingredientCost)}</div>
        </div>
        <div>
          <div className="stat-label">Sell Price</div>
          <div className="stat-value mono" style={{ color: accentColor, fontSize: '0.9rem' }}>{coins(row.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Profit / Forge</div>
          <div className="stat-value mono" style={{ color: 'var(--green)', fontSize: '0.9rem' }}>{coins(row.profitPerForge)}</div>
        </div>
        <div>
          <div className="stat-label">Weekly Sell Vol</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem' }}>{row.sellMovingWeek.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ padding: '0 10px 8px' }}>
        <button className="recipe-toggle" onClick={() => setExpanded(e => !e)}>
          <span>
            Ingredients ({row.ingredients.length})
            {row.ingredients.some(i => i.isForged) && <span style={{ marginLeft: 5, fontSize: '0.6rem', color: 'var(--amber)' }}>incl. forged</span>}
          </span>
          <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{expanded ? '▲' : '▼'}</span>
        </button>
      </div>

      {expanded && (
        <div style={{ margin: '0 10px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ padding: '5px 10px 4px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Item</span>
            <div style={{ display: 'flex', gap: 22 }}>
              <span style={{ fontSize: '0.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Qty</span>
              <span style={{ fontSize: '0.58rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost</span>
            </div>
          </div>
          {row.ingredients.map((ing, i) => <IngRow key={i} ing={ing} />)}
          <div style={{ padding: '5px 10px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700 }}>Total</span>
            <span className="mono" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--red)' }}>{coins(row.ingredientCost)}</span>
          </div>
        </div>
      )}

      <div className="profit-row" style={{ marginTop: 'auto' }}>
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Total Profit</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: accentColor, letterSpacing: '-0.02em' }}>+{coins(row.totalProfit)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Forges (10M)</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)' }}>{row.forgesIn10M.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 11, width: '60%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 9, width: '40%' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px', marginBottom: 10 }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 8, width: 52, marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 12, width: 44 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 30, borderRadius: 4, marginBottom: 8 }} />
      <div className="skeleton" style={{ height: 36, borderRadius: 4 }} />
    </div>
  )
}

type Tab = 'short' | 'long'

export default function ForgeFlipPage() {
  const [rows, setRows]               = useState<ForgeFlipRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [totalForgeItems, setTotal]   = useState(0)
  const [aiSummary, setAiSummary]     = useState<string | null>(null)
  const [tab, setTab]                 = useState<Tab>('short')
  const [search, setSearch]           = useState('')

  const load = useCallback(async () => {
    try {
      const { rows: data, totalForgeItems: t, aiSummary: ai } = await fetchForgeFlips()
      setRows(data)
      setTotal(t)
      setAiSummary(ai)
      setLastUpdated(new Date())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 5 * 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const shortRows = useMemo(() => rows.filter(r => r.isShort), [rows])
  const longRows  = useMemo(() => rows.filter(r => !r.isShort), [rows])
  const activeRows = (tab === 'short' ? shortRows : longRows)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))

  const topShort = shortRows[0]
  const topLong  = longRows[0]

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" style={{ background: 'var(--amber)' }} />Live</span>
                : <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Forge Flips</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Buy ingredients → queue at The Forge → sell output.{' '}
              {totalForgeItems > 0 && <span style={{ color: 'var(--text2)' }}>{totalForgeItems} items tracked.</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 110 }}>
              <div className="stat-label">Best Short</div>
              <div className="stat-value mono" style={{ color: 'var(--amber)', marginTop: 4 }}>{topShort ? `+${coins(topShort.totalProfit)}` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 110 }}>
              <div className="stat-label">Best Long</div>
              <div className="stat-value mono" style={{ color: 'var(--blue)', marginTop: 4 }}>{topLong ? `+${coins(topLong.totalProfit)}` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 90 }}>
              <div className="stat-label">Total Flips</div>
              <div className="stat-value mono" style={{ marginTop: 4 }}>{rows.length}</div>
            </div>
          </div>
        </div>

        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--amber)' }}>How it works</div>
          Buy ingredients at instant-buy. Queue at The Forge (Dwarven Mines). Sell output via sell order. Profit after 1.25% tax. 500+ weekly sell vol threshold.{' '}
          <strong style={{ color: 'var(--amber)' }}>CHAIN</strong> = needs a forged ingredient.{' '}
          <strong style={{ color: 'var(--red)' }}>N-STAGE</strong> = multi-stage — expand to see all items to buy.
        </div>

        {aiSummary && (
          <div className="ai-panel">
            <div className="ai-panel-label">✦ AI Analysis — Top Forge Flips</div>
            <div className="ai-panel-body">{aiSummary}</div>
          </div>
        )}

        <div className="toolbar">
          <button className={`tab-btn${tab === 'short' ? ' active-amber' : ''}`} onClick={() => setTab('short')}>
            ⚡ Short (&lt; 6h) <span style={{ marginLeft: 4, fontSize: '0.68rem', color: 'var(--muted)' }}>{shortRows.length}</span>
          </button>
          <button className={`tab-btn${tab === 'long' ? ' active-blue' : ''}`} onClick={() => setTab('long')}>
            ⏳ Long (≥ 6h) <span style={{ marginLeft: 4, fontSize: '0.68rem', color: 'var(--muted)' }}>{longRows.length}</span>
          </button>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="filter-input"
            style={{ marginLeft: 'auto', width: 150 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(292px, 1fr))', gap: 10 }}>
          {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          {!loading && activeRows.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>No profitable forge flips right now</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Ingredient prices may be too high. Try again shortly.</div>
            </div>
          )}
          {!loading && activeRows.map(row => <ForgeCard key={row.id} row={row} />)}
        </div>
      </main>
      <RefreshTimer intervalMs={5 * 60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
