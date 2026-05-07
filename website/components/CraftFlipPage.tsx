'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCraftFlips, CraftFlipRow } from '@/lib/craftFlips'
import { iconFallbacks } from '@/lib/api'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

function ItemIcon({ id, name, size = 40 }: { id: string; name: string; size?: number }) {
  const fallbacks = iconFallbacks(id)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fallbacks[0]}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        const idx = parseInt(img.dataset.fallbackIdx ?? '0', 10)
        if (idx < fallbacks.length - 1) {
          img.dataset.fallbackIdx = String(idx + 1)
          img.src = fallbacks[idx + 1]
        } else {
          img.style.display = 'none'
        }
      }}
    />
  )
}

function CraftCard({ row }: { row: CraftFlipRow }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flip-card" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: '#f4c430' }} />

      {/* Header */}
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ItemIcon id={row.id} name={row.name} size={40} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#d1d9e6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>Craft &amp; sell • {row.recipe.length} ingredient{row.recipe.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Ingredient Cost</div>
          <div style={{ color: '#ef4444', fontWeight: 800 }}>{coins(row.ingredientCost)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Sell Price</div>
          <div style={{ color: '#f59e0b', fontWeight: 800 }}>{coins(row.sellPrice)}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Margin</div>
          <div style={{ color: 'var(--green)', fontWeight: 800 }}>{row.margin.toFixed(1)}%</div>
        </div>
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Crafts (10M)</div>
          <div style={{ fontWeight: 800 }}>{row.craftCount.toLocaleString()}</div>
        </div>
      </div>

      {/* Profit bar */}
      <div style={{ padding: '0 14px 10px' }}>
        <div className="profit-bar">
          <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--green)', textTransform: 'uppercase' }}>Est. Profit</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--green)' }}>+{coins(row.totalProfit)}</span>
        </div>
        <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--muted)' }}>
          {coins(row.profitPerCraft)}/craft · Fill {row.fillScore} · Vol {coins(row.weeklyVolume)}/wk
        </div>
      </div>

      {/* Recipe toggle */}
      <div style={{ padding: '0 14px 14px' }}>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: 'var(--surface2)', border: '1px solid var(--border2)',
            borderRadius: 6, color: 'var(--muted)', fontSize: '0.75rem',
            padding: '5px 10px', cursor: 'pointer', width: '100%',
          }}
        >
          {expanded ? 'Hide recipe ▲' : 'Show recipe ▼'}
        </button>

        {expanded && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {row.recipe.map(ing => (
              <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface2)', borderRadius: 6 }}>
                <div style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ItemIcon id={ing.id} name={ing.name} size={24} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ing.name}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{ing.count}x · {coins(ing.unitPrice)} ea</div>
                </div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f59e0b', flexShrink: 0 }}>{coins(ing.unitPrice * ing.count)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 8 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 11, width: '40%' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 10, width: 70, marginBottom: 5 }} />
            <div className="skeleton" style={{ height: 14, width: 50 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 42, borderRadius: 6 }} />
    </div>
  )
}

export default function CraftFlipPage() {
  const [rows, setRows] = useState<CraftFlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
  const visibleRows = useMemo(() => rows.slice(0, 20), [rows])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: 220, background: 'var(--sidebar)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '20px 12px', gap: 4, flexShrink: 0 }}>
          <div style={{ padding: '4px 8px 20px', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>💎</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#8ab4e8' }}>Hypixel Flipper</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 1 }}>BAZAAR • CRAFT • FUSION</div>
              </div>
            </div>
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Link href="/" className="nav-item" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 16 }}>📈</span>Flips
            </Link>
            <Link href="/craft" className="nav-item active" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 16 }}>🪓</span>Craft flips
            </Link>
            <Link href="/fusion" className="nav-item" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 16 }}>🧬</span>Fusion flips
            </Link>
          </nav>
        </aside>

        <main style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>🪓</span>
                <span style={{ color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800 }}>Craft page</span>
              </div>
              <h1 style={{ fontSize: '1.9rem', fontWeight: 900, color: '#e6eefb', lineHeight: 1.05 }}>Craft Flips</h1>
              <p style={{ marginTop: 8, maxWidth: 860, color: 'var(--muted)', lineHeight: 1.6 }}>
                Buy ingredients from the bazaar, craft the item, and sell it for profit. Only shows crafts where the bazaar sell price beats the total ingredient cost after 1.25% tax. Click &ldquo;Show recipe&rdquo; to see what to buy.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 10, width: 'min(100%, 440px)' }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 800 }}>Top profit</div>
                <div style={{ marginTop: 6, fontSize: '1.15rem', fontWeight: 800, color: '#f4c430' }}>{top ? coins(top.totalProfit) : '—'}</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 800 }}>Top margin</div>
                <div style={{ marginTop: 6, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>{top ? `${top.margin.toFixed(1)}%` : '—'}</div>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 800 }}>Craftable items</div>
                <div style={{ marginTop: 6, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)' }}>{rows.length}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: '0.82rem', flexWrap: 'wrap' }}>
            {!loading && lastUpdated ? (
              <>
                <div className="pulse-dot" />
                <span style={{ color: 'var(--green)' }}>✓ Data updated at {lastUpdated.toLocaleTimeString()} ({totalProducts} products)</span>
              </>
            ) : (
              <span style={{ color: 'var(--muted)' }}>Fetching recipes from NEU repo… this takes ~30s on first load</span>
            )}
            {error && <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠ {error}</span>}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 24 }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, marginBottom: 6 }}>How it works</div>
            <div style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              Ingredient costs are pulled live from the bazaar (instant-buy price). The crafted item is sold via a sell order just below the current lowest ask. Profit is calculated after the 1.25% sell tax. Sorted by total profit with a 10M budget.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}

            {!loading && visibleRows.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1px dashed var(--border2)', borderRadius: 14, background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.3 }}>⊘</div>
                <div style={{ fontWeight: 600 }}>No profitable crafts found</div>
                <div style={{ fontSize: '0.82rem', marginTop: 4, opacity: 0.7 }}>The bazaar may be tight right now. Try again shortly.</div>
              </div>
            )}

            {!loading && visibleRows.map(row => <CraftCard key={row.id} row={row} />)}
          </div>
        </main>
      </div>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
