'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPetsFlips, PetFlipRow } from '@/lib/petsFlips'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

const RARITY_COLORS: Record<string, string> = {
  LEGENDARY: '#f59e0b',
  MYTHIC:    '#ff45ff',
  EPIC:      '#a855f7',
  RARE:      '#3b82f6',
  UNCOMMON:  '#22c55e',
  COMMON:    '#94a3b8',
}

const RARITY_DIM: Record<string, string> = {
  LEGENDARY: 'rgba(245,158,11,0.07)',
  MYTHIC:    'rgba(255,69,255,0.07)',
  EPIC:      'rgba(168,85,247,0.07)',
  RARE:      'rgba(59,130,246,0.07)',
  UNCOMMON:  'rgba(34,197,94,0.07)',
  COMMON:    'rgba(148,163,184,0.05)',
}

function ItemIcon({ src, name, size = 38 }: { src: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const fallback = `https://sky.shiiyu.moe/item/${name.replace(/ /g, '_').toUpperCase()}`
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={failed ? fallback : src}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      onError={(e) => {
        if (!failed) { setFailed(true) }
        else { (e.target as HTMLImageElement).style.opacity = '0.3' }
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
            background: 'linear-gradient(135deg, #a855f722, #ec489922)',
            border: '1px solid rgba(168,85,247,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🐾</div>
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
        <Link href="/pets" className="nav-item active" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🐾</span>Pet Flips</Link>
        <Link href="/books" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>📚</span>Book Flips</Link>
        <Link href="/mayor" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🏛️</span>Mayor Flips</Link>
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <div style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: '0.65rem', color: '#a855f7', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>PET FLIPS</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>Tier Boost flips &amp; rarity arbitrage on the AH</div>
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
          <div className="skeleton" style={{ height: 13, width: '55%', marginBottom: 7 }} />
          <div className="skeleton" style={{ height: 10, width: '35%' }} />
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

function RarityBadge({ rarity, small }: { rarity: string; small?: boolean }) {
  const color = RARITY_COLORS[rarity] ?? '#94a3b8'
  const dim   = RARITY_DIM[rarity]   ?? 'rgba(148,163,184,0.05)'
  return (
    <span style={{
      fontSize: small ? '0.58rem' : '0.6rem',
      fontWeight: 700,
      padding: small ? '1px 5px' : '1px 6px',
      borderRadius: 4,
      background: dim,
      border: `1px solid ${color}44`,
      color,
      letterSpacing: '0.06em',
      whiteSpace: 'nowrap',
    }}>{rarity}</span>
  )
}

function PetCard({ row }: { row: PetFlipRow }) {
  const sellColor = RARITY_COLORS[row.sellRarity] ?? '#94a3b8'
  const buyColor  = RARITY_COLORS[row.buyRarity]  ?? '#94a3b8'
  const dimBg     = RARITY_DIM[row.sellRarity]    ?? 'rgba(148,163,184,0.05)'
  const border    = `${sellColor}30`

  const isTierBoost = row.flipType === 'TIER_BOOST'

  return (
    <div className="flip-card" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Rarity accent bar */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${sellColor}, ${sellColor}88)`, opacity: 0.9 }} />

      {/* Header */}
      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: dimBg, border: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          <ItemIcon src={row.iconUrl} name={row.name} size={38} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
            {isTierBoost ? (
              <>
                <RarityBadge rarity={row.buyRarity} small />
                <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>+⬆</span>
                <RarityBadge rarity={row.sellRarity} small />
                <span style={{
                  fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--gold)',
                  letterSpacing: '0.05em',
                }}>TIER BOOST</span>
              </>
            ) : (
              <>
                <RarityBadge rarity={row.buyRarity} small />
                <span style={{
                  fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                  background: 'rgba(99,179,237,0.1)', border: '1px solid rgba(99,179,237,0.25)', color: 'var(--blue)',
                  letterSpacing: '0.05em',
                }}>ARBITRAGE</span>
              </>
            )}
          </div>
        </div>
        <span style={{
          fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)',
          background: 'var(--green-dim)', border: '1px solid var(--green-border)',
          borderRadius: 99, padding: '2px 9px', flexShrink: 0,
        }}>{row.roi.toFixed(1)}%</span>
      </div>

      {/* Stats grid */}
      <div style={{ padding: '4px 14px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <div className="stat-label">Buy Price ({row.buyRarity.charAt(0) + row.buyRarity.slice(1).toLowerCase()})</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{coins(row.buyPrice)}</div>
        </div>
        {isTierBoost ? (
          <div>
            <div className="stat-label">Tier Boost Cost</div>
            <div className="stat-value" style={{ color: 'var(--red)' }}>{coins(row.tierBoostCost)}</div>
          </div>
        ) : (
          <div>
            <div className="stat-label">Buy AH Vol</div>
            <div className="stat-value">{row.buyVolume}</div>
          </div>
        )}
        <div>
          <div className="stat-label">Sell Price ({row.sellRarity.charAt(0) + row.sellRarity.slice(1).toLowerCase()})</div>
          <div className="stat-value" style={{ color: sellColor }}>{coins(row.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Sell AH Vol</div>
          <div className="stat-value">{row.sellVolume}</div>
        </div>
      </div>

      {/* Profit bar */}
      <div style={{ padding: '0 12px 12px', marginTop: 'auto' }}>
        <div className="profit-bar" style={{ background: dimBg, border: `1px solid ${border}` }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: sellColor, textTransform: 'uppercase', opacity: 0.8 }}>Profit</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: sellColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              +{coins(row.profit)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total Cost</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text2)' }}>{coins(row.totalCost)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ALL_RARITIES = ['LEGENDARY', 'MYTHIC', 'EPIC', 'RARE', 'UNCOMMON', 'COMMON']
const FLIP_TYPES   = ['ALL', 'TIER_BOOST', 'RARITY_ARBITRAGE'] as const
type FlipTypeFilter = typeof FLIP_TYPES[number]

export default function PetsFlipPage() {
  const [rows, setRows]                 = useState<PetFlipRow[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null)
  const [tierBoostCost, setTierBoost]   = useState(0)

  const [minProfit, setMinProfit]       = useState('')
  const [maxBudget, setMaxBudget]       = useState('')
  const [minVolume, setMinVolume]       = useState('')
  const [rarityFilter, setRarity]       = useState<string[]>([])
  const [flipTypeFilter, setFlipType]   = useState<FlipTypeFilter>('ALL')
  const [search, setSearch]             = useState('')

  const load = useCallback(async () => {
    try {
      const { rows: data, tierBoostCost: tb } = await fetchPetsFlips()
      setRows(data)
      setTierBoost(tb)
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
      r.totalCost <= mb &&
      r.sellVolume >= mv &&
      (rarityFilter.length === 0 || rarityFilter.includes(r.sellRarity)) &&
      (flipTypeFilter === 'ALL' || r.flipType === flipTypeFilter) &&
      (q === '' || r.name.toLowerCase().includes(q))
    )
  }, [rows, minProfit, maxBudget, minVolume, rarityFilter, flipTypeFilter, search])

  function toggleRarity(r: string) {
    setRarity(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {/* Header */}
        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="page-title">Pet Flips</h1>
            <p className="page-subtitle">
              Tier Boost flips &amp; rarity arbitrage — buy cheap, sell upgraded for profit
              {tierBoostCost > 0 && (
                <span style={{ color: 'var(--gold)', marginLeft: 8 }}>
                  · Tier Boost: {coins(tierBoostCost)} ea
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastUpdated && <RefreshTimer lastUpdated={lastUpdated} intervalMs={60000} />}
          </div>
        </div>

        {/* Filters */}
        <div className="filters-row" style={{ marginBottom: 12 }}>
          <input
            className="filter-input"
            placeholder="Search pet..."
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
            placeholder="Max budget"
            value={maxBudget}
            onChange={e => setMaxBudget(e.target.value)}
            type="number"
          />
          <input
            className="filter-input"
            placeholder="Min sell vol"
            value={minVolume}
            onChange={e => setMinVolume(e.target.value)}
            type="number"
          />
        </div>

        {/* Flip type toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {FLIP_TYPES.map(ft => {
            const active = flipTypeFilter === ft
            const label  = ft === 'RARITY_ARBITRAGE' ? 'ARBITRAGE' : ft
            return (
              <button
                key={ft}
                onClick={() => setFlipType(ft)}
                style={{
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
                  padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
                  background: active ? 'rgba(168,85,247,0.12)' : 'transparent',
                  color: active ? '#a855f7' : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >{label}</button>
            )
          })}
        </div>

        {/* Rarity toggles */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {ALL_RARITIES.map(r => {
            const active = rarityFilter.includes(r)
            const col = RARITY_COLORS[r]
            return (
              <button
                key={r}
                onClick={() => toggleRarity(r)}
                style={{
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
                  padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${active ? col : `${col}44`}`,
                  background: active ? `${col}22` : 'transparent',
                  color: active ? col : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >{r}</button>
            )
          })}
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#f87171', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        {/* Grid */}
        <div className="flip-grid">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
            : filtered.length === 0
            ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>🐾</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>No pet flips found</div>
                <div style={{ fontSize: '0.75rem', marginTop: 6 }}>Try adjusting your filters or check back later</div>
              </div>
            )
            : filtered.map(r => <PetCard key={`${r.tag}-${r.buyRarity}-${r.flipType}`} row={r} />)
          }
        </div>

        {!loading && filtered.length > 0 && (
          <div style={{ marginTop: 16, fontSize: '0.7rem', color: 'var(--muted)', textAlign: 'center' }}>
            Showing {filtered.length} flip{filtered.length !== 1 ? 's' : ''} · After 2% AH tax · Sorted by profit
          </div>
        )}
      </main>
    </div>
  )
}
