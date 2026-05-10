'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchBookFlips, BookFlipRow } from '@/lib/bookFlips'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

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
        } else {
          img.style.display = 'none'
        }
      }}
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
            background: 'linear-gradient(135deg, #63b3ed22, #a78bfa22)',
            border: '1px solid rgba(99,179,237,0.2)',
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
        <Link href="/pets" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🐾</span>Kat Flips</Link>
        <Link href="/books" className="nav-item active" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>📚</span>Book Flips</Link>
        <Link href="/mayor" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🏛️</span>Mayor Flips</Link>
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <div style={{ background: 'rgba(99,179,237,0.05)', border: '1px solid rgba(99,179,237,0.12)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--blue)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>BOOK FLIPS</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>Combine 2× lower-level books into a higher level for profit</div>
        </div>
      </div>
    </aside>
  )
}

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 13, width: '60%', marginBottom: 7 }} />
          <div className="skeleton" style={{ height: 10, width: '40%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 52, borderRadius: 10, marginBottom: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
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
  return (
    <div className="flip-card">
      {/* Blue accent */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, var(--blue), var(--purple))', opacity: 0.8 }} />

      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <BookIcon id={row.outputId} size={36} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
              {row.outputName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '0.04em' }}>
                Combine 16× {row.enchantName} I → V
              </span>
            </div>
          </div>
          <span style={{
            fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)',
            background: 'var(--green-dim)', border: '1px solid var(--green-border)',
            borderRadius: 99, padding: '2px 8px', flexShrink: 0,
          }}>{row.margin.toFixed(1)}%</span>
        </div>
      </div>

      {/* Recipe visual */}
      <div style={{ margin: '0 12px 10px', background: 'var(--blue-dim)', border: '1px solid rgba(99,179,237,0.15)', borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--blue)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Combine on anvil</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Input */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <BookIcon id={row.inputId} size={28} />
              </div>
              <div style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '0.55rem', fontWeight: 800, color: '#fff', background: 'var(--blue)', borderRadius: 99, padding: '0px 4px', lineHeight: '14px', border: '1px solid rgba(0,0,0,0.4)' }}>
                ×16
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.enchantName} I</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>16× · {coins(row.inputUnitPrice)} ea</div>
            </div>
          </div>

          <div style={{ fontSize: '1rem', color: 'var(--blue)', fontWeight: 800, flexShrink: 0 }}>→</div>

          {/* Output */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,179,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              <BookIcon id={row.outputId} size={28} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--blue)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.enchantName} V</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>sell order</div>
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <div className="stat-label">Input cost (16×)</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{coins(row.inputTotalCost)}</div>
        </div>
        <div>
          <div className="stat-label">Sell order</div>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{coins(row.outputSellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Profit / combine</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{coins(row.profit)}</div>
        </div>
        <div>
          <div className="stat-label">Weekly sell vol</div>
          <div className="stat-value">{row.sellVolume.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        <div className="profit-bar" style={{ background: 'var(--blue-dim)', border: '1px solid rgba(99,179,237,0.2)' }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--blue)', textTransform: 'uppercase', opacity: 0.8 }}>Profit</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--blue)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              +{coins(row.profit)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Buy vol</div>
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
  const [totalCandidates, setTotalCandidates] = useState(0)

  const [minProfit,  setMinProfit]  = useState('')
  const [maxBudget,  setMaxBudget]  = useState('')
  const [minVolume,  setMinVolume]  = useState('')
  const [search,     setSearch]     = useState('')

  const load = useCallback(async () => {
    try {
      const { rows: data, totalCandidates: tc } = await fetchBookFlips()
      setRows(data)
      setTotalCandidates(tc)
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

  const top = filtered[0]

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />

      <main className="main-scroll">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {lastUpdated ? (
                <span className="live-badge" style={{ background: 'var(--blue-dim)', border: '1px solid rgba(99,179,237,0.25)', color: 'var(--blue)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block' }} />
                  Live
                </span>
              ) : (
                <span className="live-badge" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--muted)' }}>Loading…</span>
              )}
              {lastUpdated && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Book Flips</h1>
            <p style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              Buy 16× Tier I enchantment books, combine up to Tier V on the anvil, sell for profit.
              {totalCandidates > 0 && <span> {totalCandidates.toLocaleString()} enchantment types tracked.</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Best Profit</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--blue)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
                {top ? `+${coins(top.profit)}` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Best Margin</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {top ? `${top.margin.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Combinable</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {rows.length}
              </div>
            </div>
          </div>
        </div>

        <div className="info-box" style={{ background: 'rgba(99,179,237,0.04)', border: '1px solid rgba(99,179,237,0.12)' }}>
          <div className="section-label" style={{ color: 'var(--blue)', marginBottom: 6 }}>How it works</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.7 }}>
            Buy <strong style={{ color: 'var(--text)' }}>16× Tier I</strong> books from the bazaar at instant-buy price. Combine them on the <strong style={{ color: 'var(--text)' }}>vanilla anvil</strong> (2×TI→TII, 2×TII→TIII, 2×TIII→TIV, 2×TIV→TV) to produce 1× Tier V. Place a sell order just below the lowest ask. Profit shown after 1.25% bazaar tax.
          </div>
        </div>

        {/* Filter panel */}
        <div className="filter-panel">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--blue)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>⚙ Filters</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 16px' }}>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Search enchant</div>
              <input className="filter-input" placeholder="Sharpness, Growth…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Min profit</div>
              <input className="filter-input" type="number" placeholder="0" value={minProfit} onChange={e => setMinProfit(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Max input cost</div>
              <input className="filter-input" type="number" placeholder="∞" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Min weekly sell vol</div>
              <input className="filter-input" type="number" placeholder="5" value={minVolume} onChange={e => setMinVolume(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}

          {!loading && filtered.length === 0 && (
            <div style={{
              gridColumn: '1/-1', textAlign: 'center', padding: '80px 0',
              color: 'var(--muted)', border: '1px dashed var(--border2)',
              borderRadius: 16, background: 'rgba(255,255,255,0.01)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.2 }}>📚</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>No profitable book combines right now</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Bazaar spreads may be tight. Refresh in a moment.</div>
            </div>
          )}

          {!loading && filtered.map(row => <BookCard key={row.outputId} row={row} />)}
        </div>
      </main>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
