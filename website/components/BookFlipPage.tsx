'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBookFlips, BookFlipRow } from '@/lib/bookFlips'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

const ROMAN = ['','I','II','III','IV','V','VI','VII','VIII','IX','X']

function levelColor(level: number): string {
  if (level >= 7) return '#f59e0b'
  if (level >= 5) return '#a855f7'
  if (level >= 3) return '#3b82f6'
  return '#94a3b8'
}

function ItemIcon({ src, name, size = 38 }: { src: string; name: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
    />
  )
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div style={{ padding: '6px 8px 20px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #3b82f622, #8b5cf622)',
            border: '1px solid rgba(59,130,246,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>📚</div>
          <div>
            <div className="logo-text">Hypixel Flipper</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: 1, letterSpacing: '0.1em', fontWeight: 600 }}>SKYBLOCK BAZAAR</div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.12em', fontWeight: 700, padding: '0 14px', marginBottom: 6, textTransform: 'uppercase' }}>Markets</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Link href="/" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>📈</span>Order Flips</Link>
        <Link href="/craft" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🪓</span>Craft Flips</Link>
        <Link href="/fusion" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🧬</span>Fusion Flips</Link>
        <Link href="/forge" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🔨</span>Forge Flips</Link>
        <Link href="/pets" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🐾</span>Pet Flips</Link>
        <Link href="/books" className="nav-item active" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>📚</span>Book Flips</Link>
        <Link href="/mayor" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🏛️</span>Mayor Flips</Link>
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--blue)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>BOOK FLIPS</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>Combine 2× lower level books → higher level</div>
        </div>
      </div>
    </aside>
  )
}

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 13, width: '60%', marginBottom: 7 }} />
          <div className="skeleton" style={{ height: 10, width: '40%' }} />
        </div>
        <div className="skeleton" style={{ height: 22, width: 52, borderRadius: 99 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 12 }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 9, width: 60, marginBottom: 5 }} />
            <div className="skeleton" style={{ height: 13, width: 48 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
    </div>
  )
}

function BookCard({ row }: { row: BookFlipRow }) {
  const col = levelColor(row.outputLevel)
  const dimBg = `${col}11`
  const border = `${col}33`

  return (
    <div className="flip-card" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Level accent */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${col}, ${col}88)`, opacity: 0.9 }} />

      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: dimBg, border: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          <ItemIcon src={row.iconUrl} name={row.outputName} size={38} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.outputName}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: dimBg, border: `1px solid ${border}`, color: col,
              letterSpacing: '0.06em',
            }}>
              LVL {ROMAN[row.inputLevel] ?? row.inputLevel} + {ROMAN[row.inputLevel] ?? row.inputLevel} → {ROMAN[row.outputLevel] ?? row.outputLevel}
            </span>
          </div>
        </div>
        <span style={{
          fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)',
          background: 'var(--green-dim)', border: '1px solid var(--green-border)',
          borderRadius: 99, padding: '2px 9px', flexShrink: 0,
        }}>{row.margin.toFixed(1)}%</span>
      </div>

      {/* Recipe visual */}
      <div style={{
        margin: '0 12px 10px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <ItemIcon src={row.iconUrl.replace(`_${row.outputLevel}`, `_${row.inputLevel}`)} name={`${row.enchantName} ${ROMAN[row.inputLevel]}`} size={24} />
          <span style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>{ROMAN[row.inputLevel] ?? row.inputLevel}</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>×2</span>
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>→</span>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <ItemIcon src={row.iconUrl} name={row.outputName} size={24} />
          <span style={{ fontSize: '0.6rem', color: col }}>{ROMAN[row.outputLevel] ?? row.outputLevel}</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--muted)' }}>Input cost</div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--red)' }}>{coins(row.inputUnitPrice)} ea</div>
        </div>
      </div>

      <div style={{ padding: '4px 14px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <div className="stat-label">Total Input Cost</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{coins(row.inputTotalCost)}</div>
        </div>
        <div>
          <div className="stat-label">Sell Order</div>
          <div className="stat-value" style={{ color: col }}>{coins(row.outputSellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Revenue (after tax)</div>
          <div className="stat-value">{coins(row.revenue)}</div>
        </div>
        <div>
          <div className="stat-label">Weekly Sell Vol</div>
          <div className="stat-value">{row.sellVolume.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ padding: '0 12px 12px', marginTop: 'auto' }}>
        <div className="profit-bar" style={{ background: dimBg, border: `1px solid ${border}` }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: col, textTransform: 'uppercase', opacity: 0.8 }}>Profit</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: col, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              +{coins(row.profit)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Buy Vol</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text2)' }}>{row.buyVolume.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BookFlipPage() {
  const [rows, setRows]               = useState<BookFlipRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [totalBooks, setTotalBooks]   = useState(0)

  const [minProfit, setMinProfit]   = useState('')
  const [maxBudget, setMaxBudget]   = useState('')
  const [minVolume, setMinVolume]   = useState('')
  const [search, setSearch]         = useState('')

  const load = useCallback(async () => {
    try {
      const { rows: data, totalBooks: tb } = await fetchBookFlips()
      setRows(data)
      setTotalBooks(tb)
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
    const q  = search.toLowerCase()
    return rows.filter(r =>
      r.profit >= mp &&
      r.inputTotalCost <= mb &&
      r.sellVolume >= mv &&
      (q === '' || r.enchantName.toLowerCase().includes(q) || r.outputName.toLowerCase().includes(q))
    )
  }, [rows, minProfit, maxBudget, minVolume, search])

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="page-title">Book Flips</h1>
            <p className="page-subtitle">
              Combine 2× lower-level enchantment books into a higher level for bazaar profit
              {totalBooks > 0 && (
                <span style={{ color: 'var(--muted)', marginLeft: 8 }}>
                  · {totalBooks} enchantment types tracked
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastUpdated && <RefreshTimer lastUpdated={lastUpdated} intervalMs={60000} />}
          </div>
        </div>

        <div className="filters-row" style={{ marginBottom: 16 }}>
          <input
            className="filter-input"
            placeholder="Search enchant..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <input
            className="filter-input"
            placeholder="Min profit"
            value={minProfit}
            onChange={e => setMinProfit(e.target.value)}
            type="number"
          />
          <input
            className="filter-input"
            placeholder="Max input cost"
            value={maxBudget}
            onChange={e => setMaxBudget(e.target.value)}
            type="number"
          />
          <input
            className="filter-input"
            placeholder="Min weekly sell vol"
            value={minVolume}
            onChange={e => setMinVolume(e.target.value)}
            type="number"
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#f87171', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        <div className="flip-grid">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
            : filtered.length === 0
            ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>📚</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>No book flips found</div>
                <div style={{ fontSize: '0.75rem', marginTop: 6 }}>Try adjusting your filters or check back later</div>
              </div>
            )
            : filtered.map(r => <BookCard key={r.outputId} row={r} />)
          }
        </div>

        {!loading && filtered.length > 0 && (
          <div style={{ marginTop: 16, fontSize: '0.7rem', color: 'var(--muted)', textAlign: 'center' }}>
            Showing {filtered.length} flip{filtered.length !== 1 ? 's' : ''} · After 1.25% bazaar tax · Sorted by profit
          </div>
        )}
      </main>
    </div>
  )
}
