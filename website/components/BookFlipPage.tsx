'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBookFlips, BookFlipRow } from '@/lib/bookFlips'
import Sidebar from '@/components/Sidebar'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

function BookIcon({ id, size = 36 }: { id: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://sky.shiiyu.moe/item/${id}`}
      alt={id}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb) {
          img.dataset.fb = '1'
          img.src = `https://sky.lea.moe/item/${id}`
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
          <div className="skeleton" style={{ height: 9, width: '40%' }} />
        </div>
        <div className="skeleton" style={{ height: 20, width: 44, borderRadius: 3 }} />
      </div>
      <div className="skeleton" style={{ height: 48, borderRadius: 4, marginBottom: 10 }} />
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

function BookCard({ row }: { row: BookFlipRow }) {
  const inRoman  = ROMAN[row.inputTier]  ?? `T${row.inputTier}`
  const outRoman = ROMAN[row.outputTier] ?? `T${row.outputTier}`

  return (
    <div className="flip-card">
      <div className="card-accent" style={{ background: 'linear-gradient(90deg, var(--blue), var(--purple))' }} />
      <div className="card-header">
        <div className="icon-box">
          <BookIcon id={row.outputId} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-name">{row.outputName}</div>
          <div className="card-sub">
            {row.inputQty}× {inRoman} → {outRoman}
            <span style={{ marginLeft: 4, color: 'var(--muted)' }}>· {row.inputQty === 2 ? '1 step' : `${Math.log2(row.inputQty)} steps`}</span>
          </div>
        </div>
        <span className="badge badge-green mono">{row.margin.toFixed(1)}%</span>
      </div>

      <div className="recipe-box">
        <div className="recipe-label">Combine on anvil</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <BookIcon id={row.inputId} size={26} />
              </div>
              <div style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '0.5rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 99, padding: '0 3px', lineHeight: '13px' }}>×{row.inputQty}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.enchantName} {inRoman}</div>
              <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{row.inputQty}× · {coins(row.inputUnitPrice)} ea</div>
            </div>
          </div>

          <span style={{ color: 'var(--blue)', fontWeight: 800, flexShrink: 0 }}>→</span>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--blue-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <BookIcon id={row.outputId} size={26} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.enchantName} {outRoman}</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>sell order</div>
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div className="card-stats">
        <div>
          <div className="stat-label">Input ({row.inputQty}×)</div>
          <div className="stat-value mono" style={{ color: 'var(--red)', fontSize: '0.9rem' }}>{coins(row.inputTotalCost)}</div>
        </div>
        <div>
          <div className="stat-label">Sell order</div>
          <div className="stat-value mono" style={{ color: 'var(--blue)', fontSize: '0.9rem' }}>{coins(row.outputSellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Profit / combine</div>
          <div className="stat-value mono" style={{ color: 'var(--green)', fontSize: '0.9rem' }}>{coins(row.profit)}</div>
        </div>
        <div>
          <div className="stat-label">Weekly sell vol</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem' }}>{row.sellVolume.toLocaleString()}</div>
        </div>
      </div>

      <div className="profit-row">
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Profit</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--blue)', letterSpacing: '-0.02em' }}>+{coins(row.profit)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Buy vol</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text2)' }}>{row.buyVolume.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
}

export default function BookFlipPage() {
  const [rows, setRows]                   = useState<BookFlipRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null)
  const [totalCandidates, setTotalCandidates] = useState(0)
  const [aiSummary, setAiSummary]         = useState<string | null>(null)

  const [minProfit, setMinProfit] = useState('')
  const [maxBudget, setMaxBudget] = useState('')
  const [minVolume, setMinVolume] = useState('')
  const [search, setSearch]       = useState('')
  const [maxQty, setMaxQty]       = useState('')

  const load = useCallback(async () => {
    try {
      const { rows: data, totalCandidates: tc, aiSummary: ai } = await fetchBookFlips()
      setRows(data)
      setTotalCandidates(tc)
      setAiSummary(ai)
      setLastUpdated(new Date())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const filtered = useMemo(() => {
    const mp = parseFloat(minProfit) || 0
    const mb = parseFloat(maxBudget) || Infinity
    const mv = parseFloat(minVolume) || 0
    const mq = parseFloat(maxQty) || Infinity
    const q  = search.toLowerCase()
    return rows.filter(r =>
      r.profit >= mp &&
      r.inputTotalCost <= mb &&
      r.sellVolume >= mv &&
      r.inputQty <= mq &&
      (q === '' || r.enchantName.toLowerCase().includes(q) || r.outputName.toLowerCase().includes(q))
    )
  }, [rows, minProfit, maxBudget, minVolume, maxQty, search])

  const top = filtered[0]

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" style={{ background: 'var(--blue)' }} />Live</span>
                : <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Book Flips</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Buy lower-tier enchantment books, combine on anvil, sell higher tiers for profit.{' '}
              {totalCandidates > 0 && <span style={{ color: 'var(--text2)' }}>{totalCandidates.toLocaleString()} routes checked.</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 110 }}>
              <div className="stat-label">Best Profit</div>
              <div className="stat-value mono" style={{ color: 'var(--blue)', marginTop: 4 }}>{top ? `+${coins(top.profit)}` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 100 }}>
              <div className="stat-label">Best Margin</div>
              <div className="stat-value mono" style={{ color: 'var(--green)', marginTop: 4 }}>{top ? `${top.margin.toFixed(1)}%` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 90 }}>
              <div className="stat-label">Profitable</div>
              <div className="stat-value mono" style={{ marginTop: 4 }}>{rows.length}</div>
            </div>
          </div>
        </div>

        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--blue)' }}>How it works</div>
          Buy input books at insta-buy. Combine on the <strong style={{ color: 'var(--text)' }}>vanilla anvil</strong> (2× Tier N → Tier N+1). Sell output via sell order. <strong style={{ color: 'var(--text)' }}>All routes checked</strong> — not just T1→T5. Sometimes T3→T4 is the most profitable. Profit after 1.25% bazaar tax.
        </div>

        {aiSummary && (
          <div className="ai-panel">
            <div className="ai-panel-label">✦ AI Analysis — Top Flips</div>
            <div className="ai-panel-body">{aiSummary}</div>
          </div>
        )}

        <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text2)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Filters</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px 12px' }}>
            <div>
              <div className="stat-label" style={{ marginBottom: 4 }}>Search enchant</div>
              <input className="filter-input" style={{ width: '100%' }} placeholder="Sharpness, Growth…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 4 }}>Min profit</div>
              <input className="filter-input" style={{ width: '100%' }} type="number" placeholder="0" value={minProfit} onChange={e => setMinProfit(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 4 }}>Max input cost</div>
              <input className="filter-input" style={{ width: '100%' }} type="number" placeholder="∞" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 4 }}>Min weekly sell vol</div>
              <input className="filter-input" style={{ width: '100%' }} type="number" placeholder="50" value={minVolume} onChange={e => setMinVolume(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 4 }}>Max books needed</div>
              <input className="filter-input" style={{ width: '100%' }} type="number" placeholder="∞" value={maxQty} onChange={e => setMaxQty(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))', gap: 10 }}>
          {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
          {!loading && filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>No profitable book combines right now</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Bazaar spreads may be tight. Refresh in a moment.</div>
            </div>
          )}
          {!loading && filtered.map(row => <BookCard key={`${row.outputId}-${row.inputTier}`} row={row} />)}
        </div>
      </main>
      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
