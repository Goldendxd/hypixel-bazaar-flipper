'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchFusionFlips, FusionFlipRow } from '@/lib/fusionFlips'
import Sidebar from '@/components/Sidebar'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

const RARITY_COLOR: Record<string, string> = {
  common:    '#888888',
  uncommon:  '#55cc55',
  rare:      '#4d9fff',
  epic:      '#9d6fff',
  legendary: '#ffb700',
  mythic:    '#ff55ff',
  special:   '#ff4d4d',
}

function rarityColor(r: string) {
  return RARITY_COLOR[r.toLowerCase()] ?? '#888888'
}

function ShardIcon({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://sky.shiiyu.moe/api/item/${id}`}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb) {
          img.dataset.fb = '1'
          img.src = `https://sky.lea.moe/api/item/${id}`
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
          <div className="skeleton" style={{ height: 11, width: '55%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 9, width: '35%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 52, borderRadius: 4, marginBottom: 10 }} />
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

function FusionCard({ row }: { row: FusionFlipRow }) {
  const rc = rarityColor(row.rarity)

  return (
    <div className="flip-card">
      <div className="card-accent" style={{ background: 'linear-gradient(90deg, var(--purple), #c084fc)' }} />
      <div className="card-header">
        <div className="icon-box" style={{ borderColor: `${rc}40` }}>
          <ShardIcon id={row.id} name={row.name} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-name">{row.name}</div>
          <div className="card-sub">
            <span style={{ color: rc, textTransform: 'capitalize' }}>{row.rarity}</span>
            <span style={{ margin: '0 4px', color: 'var(--border2)' }}>·</span>
            <span>Galatea Shard</span>
          </div>
        </div>
        <span className="badge badge-green mono">{row.margin.toFixed(1)}%</span>
      </div>

      <div className="recipe-box">
        <div className="recipe-label">Fuse Together</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[row.input1, row.input2].map((inp, idx) => (
            <div key={idx} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              {idx === 1 && <span style={{ color: 'var(--purple)', fontWeight: 800, flexShrink: 0 }}>+</span>}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 26, height: 26, borderRadius: 4, background: 'var(--surface)', border: `1px solid ${rarityColor(inp.rarity)}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <ShardIcon id={inp.id} name={inp.name} size={26} />
                </div>
                {inp.qty > 1 && (
                  <div style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '0.5rem', fontWeight: 800, color: '#fff', background: 'var(--purple)', borderRadius: 99, padding: '0 3px', lineHeight: '13px' }}>×{inp.qty}</div>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inp.name}</div>
                <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{inp.qty > 1 ? `${inp.qty}× ` : ''}{coins(inp.unitPrice)}</div>
              </div>
            </div>
          ))}
          {row.outputQty > 1 && (
            <span className="badge badge-green" style={{ flexShrink: 0, marginLeft: 4 }}>→{row.outputQty}x</span>
          )}
        </div>
      </div>

      <div className="divider" />

      <div className="card-stats">
        <div>
          <div className="stat-label">Input Cost</div>
          <div className="stat-value mono" style={{ color: 'var(--red)', fontSize: '0.9rem' }}>{coins(row.inputCost)}</div>
        </div>
        <div>
          <div className="stat-label">Sell ({row.outputQty}x)</div>
          <div className="stat-value mono" style={{ color: 'var(--purple)', fontSize: '0.9rem' }}>{coins(row.sellPrice * row.outputQty)}</div>
        </div>
        <div>
          <div className="stat-label">Profit / Fuse</div>
          <div className="stat-value mono" style={{ color: 'var(--green)', fontSize: '0.9rem' }}>{coins(row.profitPerFusion)}</div>
        </div>
        <div>
          <div className="stat-label">Fusions (10M)</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem' }}>{row.fusesIn10M.toLocaleString()}</div>
        </div>
      </div>

      <div className="profit-row">
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Total Profit</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--purple)', letterSpacing: '-0.02em' }}>+{coins(row.totalProfit)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Fill</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)' }}>{row.fillScore}</div>
        </div>
      </div>
    </div>
  )
}

export default function FusionFlipPage() {
  const [rows, setRows]               = useState<FusionFlipRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [totalShards, setTotalShards] = useState(0)

  const load = useCallback(async () => {
    try {
      const { rows: data, totalShards: ts } = await fetchFusionFlips()
      setRows(data)
      setTotalShards(ts)
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
                ? <span className="live-badge"><span className="pulse-dot" style={{ background: 'var(--purple)' }} />Live</span>
                : <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Fusion Flips</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Buy 2 attribute shards → fuse via Kysha in Galatea → sell output.{' '}
              {totalShards > 0 && <span style={{ color: 'var(--text2)' }}>{totalShards} shards tracked.</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 110 }}>
              <div className="stat-label">Best Profit</div>
              <div className="stat-value mono" style={{ color: 'var(--purple)', marginTop: 4 }}>{top ? `+${coins(top.totalProfit)}` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 100 }}>
              <div className="stat-label">Best Margin</div>
              <div className="stat-value mono" style={{ color: 'var(--green)', marginTop: 4 }}>{top ? `${top.margin.toFixed(1)}%` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 90 }}>
              <div className="stat-label">Opportunities</div>
              <div className="stat-value mono" style={{ marginTop: 4 }}>{rows.length}</div>
            </div>
          </div>
        </div>

        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--purple)' }}>How it works</div>
          Buy both input shards at instant-buy. Go to <strong style={{ color: 'var(--text)' }}>Kysha at the Fusion House in Tangleburg, Galatea</strong> and fuse. Sell the output shard via sell order. Profit after 1.25% tax.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
          {!loading && visibleRows.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>No profitable fusions right now</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Shard prices may be too tight. Try again shortly.</div>
            </div>
          )}
          {!loading && visibleRows.map(row => <FusionCard key={row.id} row={row} />)}
        </div>
      </main>
      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
