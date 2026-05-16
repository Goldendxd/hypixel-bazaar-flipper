'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCraftFlips, CraftFlipRow } from '@/lib/craftFlips'
import { iconFallbacks } from '@/lib/api'
import Sidebar from '@/components/Sidebar'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

function ItemIcon({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  const fallbacks = iconFallbacks(id)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fallbacks[0]}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        const idx = parseInt(img.dataset.fallbackIdx ?? '0', 10)
        if (idx < fallbacks.length - 1) {
          img.dataset.fallbackIdx = String(idx + 1)
          img.src = fallbacks[idx + 1]
        } else { img.style.display = 'none' }
      }}
    />
  )
}

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 11, width: '60%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 9, width: '35%' }} />
        </div>
        <div className="skeleton" style={{ height: 20, width: 44, borderRadius: 3 }} />
      </div>
      <div className="divider" style={{ marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px', marginBottom: 10 }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 8, width: 52, marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 12, width: 44 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 36, borderRadius: 4 }} />
    </div>
  )
}

function CraftCard({ row }: { row: CraftFlipRow }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flip-card">
      <div className="card-accent" style={{ background: 'linear-gradient(90deg, var(--gold), var(--amber))' }} />
      <div className="card-header">
        <div className="icon-box">
          <ItemIcon id={row.id} name={row.name} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-name">{row.name}</div>
          <div className="card-sub">
            {row.recipe.length} ingredient{row.recipe.length !== 1 ? 's' : ''}
            {row.outputCount > 1 && <span style={{ marginLeft: 6, color: 'var(--gold)' }}>×{row.outputCount} output</span>}
          </div>
        </div>
        <span className="badge badge-green mono">{row.margin.toFixed(1)}%</span>
      </div>

      <div className="divider" />

      <div className="card-stats">
        <div>
          <div className="stat-label">Ingredients</div>
          <div className="stat-value mono" style={{ color: 'var(--red)', fontSize: '0.9rem' }}>{coins(row.ingredientCost)}</div>
        </div>
        <div>
          <div className="stat-label">Sell Price</div>
          <div className="stat-value mono" style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>{coins(row.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Profit / Craft</div>
          <div className="stat-value mono" style={{ color: 'var(--green)', fontSize: '0.9rem' }}>{coins(row.profitPerCraft)}</div>
        </div>
        <div>
          <div className="stat-label">Crafts (10M)</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem' }}>{row.craftCount.toLocaleString()}</div>
        </div>
      </div>

      <div className="profit-row">
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Total Profit</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--gold)', letterSpacing: '-0.02em' }}>+{coins(row.totalProfit)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Fill</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)' }}>{row.fillScore}</div>
        </div>
      </div>

      <div style={{ padding: '0 10px 10px' }}>
        <button className="recipe-toggle" onClick={() => setExpanded(v => !v)}>
          <span>Recipe ({row.recipe.length})</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{expanded ? '▲' : '▼'}</span>
        </button>
        {expanded && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {row.recipe.map(ing => (
              <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4 }}>
                <div style={{ width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ItemIcon id={ing.id} name={ing.name} size={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ing.name}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{ing.count}× · {coins(ing.unitPrice)} ea</div>
                </div>
                <div className="mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>{coins(ing.unitPrice * ing.count)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CraftFlipPage() {
  const [rows, setRows]               = useState<CraftFlipRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [totalProducts, setTotalProducts] = useState(0)

  const load = useCallback(async () => {
    try {
      const { rows: data, totalProducts: tp } = await fetchCraftFlips()
      setRows(data)
      setTotalProducts(tp)
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
    const id = window.setInterval(load, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const top = rows[0]
  const visibleRows = useMemo(() => rows.slice(0, 24), [rows])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" style={{ background: 'var(--gold)' }} />Live</span>
                : <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Craft Flips</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Buy ingredients → craft → sell.{' '}
              {totalProducts > 0 && <span style={{ color: 'var(--text2)' }}>{totalProducts.toLocaleString()} products tracked.</span>}
              {loading && !lastUpdated && <span style={{ color: 'var(--gold)', marginLeft: 4 }}>~30s first load…</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 110 }}>
              <div className="stat-label">Best Profit</div>
              <div className="stat-value mono" style={{ color: 'var(--gold)', marginTop: 4 }}>{top ? `+${coins(top.totalProfit)}` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 100 }}>
              <div className="stat-label">Top Margin</div>
              <div className="stat-value mono" style={{ color: 'var(--green)', marginTop: 4 }}>{top ? `${top.margin.toFixed(1)}%` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 90 }}>
              <div className="stat-label">Craftable</div>
              <div className="stat-value mono" style={{ marginTop: 4 }}>{rows.length}</div>
            </div>
          </div>
        </div>

        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--gold)' }}>How it works</div>
          Buy all ingredients at instant-buy price. Craft the item. Sell via sell order. Profit after 1.25% tax. Sorted by total profit within 10M budget. Expand any card to see the full ingredient list.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))', gap: 10 }}>
          {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
          {!loading && visibleRows.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>No profitable crafts right now</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Bazaar spreads may be tight. Refresh shortly.</div>
            </div>
          )}
          {!loading && visibleRows.map(row => <CraftCard key={row.id} row={row} />)}
        </div>
      </main>
      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
