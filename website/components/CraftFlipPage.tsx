'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCraftFlips, CraftFlipRow } from '@/lib/craftFlips'
import { iconFallbacks } from '@/lib/api'
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
        } else {
          img.style.display = 'none'
        }
      }}
    />
  )
}

function Sidebar({ active }: { active: string }) {
  return (
    <aside className="sidebar">
      <div style={{ padding: '6px 8px 20px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #63b3ed22, #a78bfa22)',
            border: '1px solid rgba(99,179,237,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>💎</div>
          <div>
            <div className="logo-text">Hypixel Flipper</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: 1, letterSpacing: '0.1em', fontWeight: 600 }}>SKYBLOCK BAZAAR</div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.12em', fontWeight: 700, padding: '0 14px', marginBottom: 6, textTransform: 'uppercase' }}>Markets</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Link href="/" className={`nav-item${active === '/' ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 15 }}>📈</span>Order Flips
        </Link>
        <Link href="/craft" className={`nav-item${active === '/craft' ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 15 }}>🪓</span>Craft Flips
        </Link>
        <Link href="/fusion" className={`nav-item${active === '/fusion' ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 15 }}>🧬</span>Fusion Flips
        </Link>
        <Link href="/forge" className={`nav-item${active === '/forge' ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 15 }}>🔨</span>Forge Flips
        </Link>
        <Link href="/pets" className={`nav-item${active === '/pets' ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 15 }}>🐾</span>Pet Flips
        </Link>
        <Link href="/books" className={`nav-item${active === '/books' ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 15 }}>📚</span>Book Flips
        </Link>
        <Link href="/mayor" className={`nav-item${active === '/mayor' ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 15 }}>🏛️</span>Mayor Flips
        </Link>
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <div style={{
          background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)',
          borderRadius: 10, padding: '10px 12px',
        }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>CRAFT FLIPS</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>Buy ingredients, craft &amp; sell for profit</div>
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
          <div className="skeleton" style={{ height: 13, width: '55%', marginBottom: 7 }} />
          <div className="skeleton" style={{ height: 10, width: '40%' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
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

function CraftCard({ row }: { row: CraftFlipRow }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flip-card">
      {/* Gold accent */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, var(--gold), var(--amber))', opacity: 0.8 }} />

      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <ItemIcon id={row.id} name={row.name} size={36} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
              {row.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--muted)', letterSpacing: '0.04em' }}>
                {row.recipe.length} ingredient{row.recipe.length !== 1 ? 's' : ''}
              </span>
              {row.outputCount > 1 && (
                <span className="chip chip-gold" style={{ fontSize: '0.6rem' }}>×{row.outputCount} output</span>
              )}
            </div>
          </div>
          <span style={{
            fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)',
            background: 'var(--green-dim)', border: '1px solid var(--green-border)',
            borderRadius: 99, padding: '2px 8px',
          }}>{row.margin.toFixed(1)}%</span>
        </div>
      </div>

      <div className="divider" />

      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
        <div>
          <div className="stat-label">Ingredients</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{coins(row.ingredientCost)}</div>
        </div>
        <div>
          <div className="stat-label">Sell Price</div>
          <div className="stat-value" style={{ color: 'var(--gold)' }}>{coins(row.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Profit / Craft</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{coins(row.profitPerCraft)}</div>
        </div>
        <div>
          <div className="stat-label">Crafts (10M)</div>
          <div className="stat-value">{row.craftCount.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        <div className="profit-bar" style={{ background: 'var(--gold-dim)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--gold)', textTransform: 'uppercase', opacity: 0.8 }}>Total Profit</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              +{coins(row.totalProfit)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Fill</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text2)' }}>{row.fillScore}</div>
          </div>
        </div>
      </div>

      {/* Recipe toggle */}
      <div style={{ padding: '0 12px 12px' }}>
        <button className="recipe-toggle" onClick={() => setExpanded(v => !v)}>
          {expanded ? '▲ Hide recipe' : '▼ Show recipe'}
        </button>
        {expanded && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {row.recipe.map(ing => (
              <div key={ing.id} className="recipe-row">
                <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ItemIcon id={ing.id} name={ing.name} size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ing.name}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{ing.count}× · {coins(ing.unitPrice)} ea</div>
                </div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>{coins(ing.unitPrice * ing.count)}</div>
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
  const visibleRows = useMemo(() => rows.slice(0, 20), [rows])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar active="/craft" />

      <main className="main-scroll">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {lastUpdated ? (
                <span className="live-badge" style={{ background: 'var(--gold-dim)', border: '1px solid rgba(251,191,36,0.25)', color: 'var(--gold)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
                  Live
                </span>
              ) : (
                <span className="live-badge" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
                  Loading…
                </span>
              )}
              {lastUpdated && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Craft Flips</h1>
            <p style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              Buy bazaar ingredients, craft items, and sell for profit. {totalProducts > 0 && `${totalProducts.toLocaleString()} products tracked.`}
              {loading && !lastUpdated && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>Fetching recipes — ~30s first load…</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Best Profit</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
                {top ? `+${coins(top.totalProfit)}` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Top Margin</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {top ? `${top.margin.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Craftable</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {rows.length}
              </div>
            </div>
          </div>
        </div>

        <div className="info-box">
          <div className="section-label" style={{ color: 'var(--blue)', marginBottom: 6 }}>How it works</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.7 }}>
            Ingredient costs are sourced live from the bazaar (instant-buy). The crafted item is sold via order just below the lowest ask. Profit shown after 1.25% sell tax. Sorted by total profit within a 10M budget. Click <strong style={{ color: 'var(--text)' }}>Show recipe</strong> to see exactly what to buy.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}

          {!loading && visibleRows.length === 0 && (
            <div style={{
              gridColumn: '1/-1', textAlign: 'center', padding: '80px 0',
              color: 'var(--muted)', border: '1px dashed var(--border2)',
              borderRadius: 16, background: 'rgba(255,255,255,0.01)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.2 }}>⊘</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>No profitable crafts right now</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Bazaar spreads may be tight. Refresh in a moment.</div>
            </div>
          )}

          {!loading && visibleRows.map(row => <CraftCard key={row.id} row={row} />)}
        </div>
      </main>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
