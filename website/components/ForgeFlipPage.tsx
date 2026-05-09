'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchForgeFlips, ForgeFlipRow, IngredientDetail } from '@/lib/forgeFlips'
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
        } else {
          img.style.opacity = '0.3'
        }
      }}
    />
  )
}

// Recursive ingredient row — expands forged sub-ingredients
function IngRow({ ing, depth = 0 }: { ing: IngredientDetail; depth?: number }) {
  const [open, setOpen] = useState(false)
  const hasChildren = ing.isForged && (ing.subIngredients?.length ?? 0) > 0

  return (
    <>
      <div
        onClick={() => hasChildren && setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          paddingLeft: 10 + depth * 18,
          paddingRight: 12, paddingTop: 6, paddingBottom: 6,
          borderBottom: '1px solid rgba(255,255,255,0.035)',
          cursor: hasChildren ? 'pointer' : 'default',
          background: depth > 0 ? `rgba(255,255,255,0.0${depth * 2})` : undefined,
        }}
      >
        {/* Depth connector */}
        {depth > 0 && (
          <div style={{ width: 2, alignSelf: 'stretch', background: 'rgba(255,255,255,0.08)', borderRadius: 1, marginRight: 4, flexShrink: 0 }} />
        )}
        <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ItemIcon src={ing.iconUrl} name={ing.name} size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
          {ing.isForged && (
            <span style={{
              fontSize: '0.58rem', background: 'rgba(251,146,60,0.15)', color: 'var(--amber)',
              border: '1px solid rgba(251,146,60,0.3)', borderRadius: 4, padding: '0 4px',
              flexShrink: 0, lineHeight: '14px',
            }}>FORGED</span>
          )}
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ing.name}
          </span>
          {ing.isForged && ing.forgeTime !== undefined && (
            <span style={{ fontSize: '0.62rem', color: 'var(--muted)', flexShrink: 0 }}>({fmtDur(ing.forgeTime)})</span>
          )}
        </div>
        <span style={{ fontSize: '0.68rem', color: 'var(--muted)', flexShrink: 0 }}>×{Number.isInteger(ing.qty) ? ing.qty : ing.qty.toFixed(1)}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0, minWidth: 50, textAlign: 'right' }}>{coins(ing.totalPrice)}</span>
        {hasChildren && (
          <span style={{ fontSize: '0.6rem', color: 'var(--muted)', flexShrink: 0, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
        )}
      </div>
      {open && ing.subIngredients?.map((s, i) => (
        <IngRow key={i} ing={s} depth={depth + 1} />
      ))}
    </>
  )
}

function ForgeCard({ row }: { row: ForgeFlipRow }) {
  const [expanded, setExpanded] = useState(false)
  const isMultiStage = row.chainDepth >= 2
  const accentColor  = row.isShort ? 'var(--amber)' : 'var(--blue)'
  const accentDim    = row.isShort ? 'rgba(251,146,60,0.07)' : 'var(--blue-dim)'
  const accentBorder = row.isShort ? 'rgba(251,146,60,0.18)' : 'rgba(99,179,237,0.18)'
  const gradFrom     = row.isShort ? 'var(--amber)' : 'var(--blue)'
  const gradTo       = row.isShort ? '#fde68a' : '#93c5fd'

  return (
    <div className="flip-card" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Top accent line */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${gradFrom}, ${gradTo})`, opacity: 0.9 }} />

      {/* Header */}
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: accentDim, border: `1px solid ${accentBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          <ItemIcon src={row.iconUrl} name={row.name} size={38} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
            {/* Show total time prominently */}
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: accentColor }}>
              ⏱ {row.isChained && row.totalDuration !== row.duration
                ? `${fmtDur(row.duration)} (+${fmtDur(row.totalDuration - row.duration)} chain)`
                : fmtDur(row.duration)}
            </span>
            {isMultiStage && (
              <span style={{ fontSize: '0.58rem', color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 4, padding: '0 5px', lineHeight: '16px' }}>
                {row.chainDepth}-STAGE
              </span>
            )}
            {row.isChained && !isMultiStage && (
              <span style={{ fontSize: '0.58rem', color: 'var(--amber)', background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 4, padding: '0 5px', lineHeight: '16px' }}>
                CHAIN
              </span>
            )}
            {row.requiresHotM && (
              <span style={{ fontSize: '0.58rem', color: 'var(--muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 4, padding: '0 5px', lineHeight: '16px' }}>
                {row.requiresHotM}
              </span>
            )}
          </div>
        </div>
        <span style={{
          fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)',
          background: 'var(--green-dim)', border: '1px solid var(--green-border)',
          borderRadius: 99, padding: '2px 9px', flexShrink: 0,
        }}>{row.margin.toFixed(1)}%</span>
      </div>

      {/* Total chain time bar (shown only for chained items) */}
      {row.isChained && row.totalDuration > row.duration && (
        <div style={{ margin: '0 12px 8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Total chain time</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: accentColor }}>{fmtDur(row.totalDuration)}</span>
        </div>
      )}

      {/* Stats */}
      <div style={{ padding: '4px 14px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <div className="stat-label">Ingredient Cost</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{coins(row.ingredientCost)}</div>
        </div>
        <div>
          <div className="stat-label">Sell Price</div>
          <div className="stat-value" style={{ color: accentColor }}>{coins(row.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Profit / Forge</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{coins(row.profitPerForge)}</div>
        </div>
        <div>
          <div className="stat-label">Weekly Sell Vol</div>
          <div className="stat-value">{row.sellMovingWeek.toLocaleString()}</div>
        </div>
      </div>

      {/* Expandable ingredient tree */}
      <div style={{ padding: '0 12px 6px' }}>
        <button
          onClick={() => setExpanded(e => !e)}
          className="recipe-toggle"
          style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>
            Ingredients ({row.ingredients.length})
            {row.ingredients.some(i => i.isForged) && (
              <span style={{ marginLeft: 6, fontSize: '0.62rem', color: 'var(--amber)', opacity: 0.8 }}>
                incl. forged
              </span>
            )}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{expanded ? '▲ hide' : '▼ show'}</span>
        </button>
      </div>

      {expanded && (
        <div style={{
          margin: '0 12px 10px',
          background: accentDim,
          border: `1px solid ${accentBorder}`,
          borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{ padding: '6px 10px 4px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Item</span>
            <div style={{ display: 'flex', gap: 24 }}>
              <span style={{ fontSize: '0.6rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Qty</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost</span>
            </div>
          </div>
          {row.ingredients.map((ing, i) => (
            <IngRow key={i} ing={ing} />
          ))}
          <div style={{ padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 700 }}>Total</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--red)' }}>{coins(row.ingredientCost)}</span>
          </div>
        </div>
      )}

      {/* Profit bar */}
      <div style={{ padding: '0 12px 12px', marginTop: 'auto' }}>
        <div className="profit-bar" style={{ background: accentDim, border: `1px solid ${accentBorder}` }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: accentColor, textTransform: 'uppercase', opacity: 0.8 }}>Total Profit</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: accentColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              +{coins(row.totalProfit)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Forges (10M)</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text2)' }}>{row.forgesIn10M.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div className="skeleton" style={{ width: 38, height: 38, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 13, width: '60%', marginBottom: 7 }} />
          <div className="skeleton" style={{ height: 10, width: '40%' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 12 }}>
        {[0,1,2,3].map(i => <div key={i}><div className="skeleton" style={{ height: 9, width: 60, marginBottom: 5 }} /><div className="skeleton" style={{ height: 13, width: 48 }} /></div>)}
      </div>
      <div className="skeleton" style={{ height: 34, borderRadius: 8, marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div style={{ padding: '6px 8px 20px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #fbbf2422, #fb923c22)',
            border: '1px solid rgba(251,191,36,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🔨</div>
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
        <Link href="/forge" className="nav-item active" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🔨</span>Forge Flips</Link>
        <Link href="/pets" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🐾</span>Pet Flips</Link>
        <Link href="/books" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>📚</span>Book Flips</Link>
        <Link href="/mayor" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🏛️</span>Mayor Flips</Link>
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <div style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>THE FORGE</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>Buy ingredients → forge → sell output</div>
        </div>
      </div>
    </aside>
  )
}

type Tab = 'short' | 'long'

export default function ForgeFlipPage() {
  const [rows, setRows]               = useState<ForgeFlipRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [totalForgeItems, setTotal]   = useState(0)
  const [tab, setTab]                 = useState<Tab>('short')
  const [search, setSearch]           = useState('')

  const load = useCallback(async () => {
    try {
      const { rows: data, totalForgeItems: t } = await fetchForgeFlips()
      setRows(data)
      setTotal(t)
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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />

      <main className="main-scroll">
        {/* Page header */}
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {lastUpdated ? (
                <span className="live-badge" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', color: 'var(--gold)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', display: 'inline-block' }} />
                  Live
                </span>
              ) : (
                <span className="live-badge" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--muted)' }}>Loading…</span>
              )}
              {lastUpdated && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Forge Flips</h1>
            <p style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              Buy ingredients, queue at The Forge, sell output.
              {totalForgeItems > 0 && <span> {totalForgeItems} forgeable items tracked.</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Best Short</div>
              <div style={{ marginTop: 6, fontSize: '1.05rem', fontWeight: 800, color: 'var(--amber)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
                {topShort ? `+${coins(topShort.totalProfit)}` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Best Long</div>
              <div style={{ marginTop: 6, fontSize: '1.05rem', fontWeight: 800, color: 'var(--blue)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
                {topLong ? `+${coins(topLong.totalProfit)}` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 90 }}>
              <div className="stat-label">Total Flips</div>
              <div style={{ marginTop: 6, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {rows.length}
              </div>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="info-box" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.12)' }}>
          <div className="section-label" style={{ color: 'var(--gold)', marginBottom: 6 }}>How it works</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.7 }}>
            Buy all listed ingredients at bazaar instant-buy price. Queue the forge at The Forge (Dwarven Mines). Sell the output via sell order. Profit after 1.25% tax. Only items with 500+ weekly sell volume are shown.{' '}
            <strong style={{ color: 'var(--amber)' }}>CHAIN</strong> = one forged ingredient.{' '}
            <strong style={{ color: '#f87171' }}>N-STAGE</strong> = full multi-stage dependency chain — expand ingredients to see every item to buy. Short tab: total chain time &lt; 6h. Long tab: 6h+ or multi-stage.
          </div>
        </div>

        {/* Tabs + search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['short', 'long'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 16px', borderRadius: 8, border: '1px solid',
                cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                transition: 'all 0.15s',
                background: tab === t ? (t === 'short' ? 'rgba(251,146,60,0.15)' : 'var(--blue-dim)') : 'rgba(255,255,255,0.03)',
                color: tab === t ? (t === 'short' ? 'var(--amber)' : 'var(--blue)') : 'var(--muted)',
                borderColor: tab === t ? (t === 'short' ? 'rgba(251,146,60,0.3)' : 'rgba(99,179,237,0.3)') : 'var(--border)',
              }}
            >
              {t === 'short' ? '⚡ Short (< 6h)' : '⏳ Long (≥ 6h / multi-stage)'}
              <span style={{ marginLeft: 6, fontSize: '0.7rem', background: 'rgba(255,255,255,0.08)', borderRadius: 99, padding: '1px 6px' }}>
                {t === 'short' ? shortRows.length : longRows.length}
              </span>
            </button>
          ))}
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="filter-input"
            style={{ marginLeft: 'auto', width: 170 }}
          />
        </div>

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

          {!loading && activeRows.length === 0 && (
            <div style={{
              gridColumn: '1/-1', textAlign: 'center', padding: '80px 0',
              color: 'var(--muted)', border: '1px dashed var(--border2)',
              borderRadius: 16, background: 'rgba(255,255,255,0.01)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.2 }}>🔨</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>No profitable forge flips right now</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Ingredient prices may be too high. Try again shortly.</div>
            </div>
          )}

          {!loading && activeRows.map(row => <ForgeCard key={row.id} row={row} />)}
        </div>
      </main>

      <RefreshTimer intervalMs={5 * 60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
