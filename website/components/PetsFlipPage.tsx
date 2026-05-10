'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchKatFlips, KatFlipRow } from '@/lib/petsFlips'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

const RARITY_COLOR: Record<string, string> = {
  COMMON:    '#aaaaaa',
  UNCOMMON:  '#55ff55',
  RARE:      '#5555ff',
  EPIC:      '#aa00aa',
  LEGENDARY: '#ffaa00',
  MYTHIC:    '#ff55ff',
}
function rc(rarity: string) { return RARITY_COLOR[rarity] ?? '#aaaaaa' }

function PetIcon({ tag, rarity, size = 36 }: { tag: string; rarity: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://sky.shiiyu.moe/item/${tag}?rarity=${rarity.toLowerCase()}`}
      alt={tag}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb) {
          img.dataset.fb = '1'
          img.src = `https://sky.shiiyu.moe/item/${tag}`
        } else {
          img.style.display = 'none'
        }
      }}
    />
  )
}

function ItemIcon({ name, size = 22 }: { name: string; size?: number }) {
  const id = name.toUpperCase().replace(/ /g, '_')
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://sky.shiiyu.moe/item/${id}`}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
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
        <Link href="/pets" className="nav-item active" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🐾</span>Kat Flips</Link>
        <Link href="/books" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>📚</span>Book Flips</Link>
        <Link href="/mayor" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🏛️</span>Mayor Flips</Link>
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <div style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>KAT FLIPS</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>Buy pets, upgrade via Kat NPC, sell upgraded rarity for profit</div>
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

function KatCard({ row }: { row: KatFlipRow }) {
  const [expanded, setExpanded] = useState(false)
  const accentColor  = 'var(--gold)'
  const accentGrad   = 'linear-gradient(90deg, var(--gold), var(--amber))'
  const accentDim    = 'var(--gold-dim)'
  const accentBorder = 'rgba(251,191,36,0.2)'

  return (
    <div className="flip-card">
      <div style={{ height: 2, background: accentGrad, opacity: 0.85 }} />

      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${rc(row.buyRarity)}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <PetIcon tag={row.tag} rarity={row.buyRarity} size={36} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
              {row.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: rc(row.buyRarity), textTransform: 'capitalize' }}>{row.buyRarity.toLowerCase()}</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.65rem' }}>→</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: rc(row.sellRarity), textTransform: 'capitalize' }}>{row.sellRarity.toLowerCase()}</span>
              {row.upgradeHours > 0 && (
                <>
                  <span style={{ color: 'var(--muted)', fontSize: '0.65rem' }}>·</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{row.upgradeHours}h</span>
                </>
              )}
            </div>
          </div>
          <span style={{
            fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)',
            background: 'var(--green-dim)', border: '1px solid var(--green-border)',
            borderRadius: 99, padding: '2px 8px', flexShrink: 0,
          }}>{row.roi.toFixed(1)}%</span>
        </div>
      </div>

      {/* Upgrade cost box */}
      <div style={{ margin: '0 12px 10px', background: accentDim, border: `1px solid ${accentBorder}`, borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ fontSize: '0.6rem', color: accentColor, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Kat Upgrade Cost</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {row.upgradeCost > 0 && (
            <div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 2 }}>Kat fee</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)' }}>{coins(row.upgradeCost)}</div>
            </div>
          )}
          {row.materials.map((mat, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                <ItemIcon name={mat.name} size={20} />
              </div>
              <div>
                <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginBottom: 2 }}>{mat.qty}× {mat.name}</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)' }}>{coins(mat.cost)}</div>
              </div>
            </div>
          ))}
          {row.upgradeCost === 0 && row.materials.length === 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>No extra cost data</div>
          )}
        </div>
      </div>

      {/* AI tip */}
      {row.aiTip && (
        <div style={{ margin: '0 12px 10px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, padding: '7px 10px', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>✨</span>
          <span style={{ fontSize: '0.73rem', color: 'var(--purple)', lineHeight: 1.5 }}>{row.aiTip}</span>
        </div>
      )}

      <div className="divider" />

      <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <div className="stat-label">Buy Price</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{coins(row.buyPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Sell Price (after tax)</div>
          <div className="stat-value" style={{ color: accentColor }}>{coins(row.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Total Cost</div>
          <div className="stat-value">{coins(row.totalCost)}</div>
        </div>
        <div>
          <div className="stat-label">Upgrade Time</div>
          <div className="stat-value">{row.upgradeHours > 0 ? `${row.upgradeHours}h` : 'Instant'}</div>
        </div>
      </div>

      <div style={{ padding: '0 12px 12px' }}>
        <div className="profit-bar" style={{ background: accentDim, border: `1px solid ${accentBorder}` }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: accentColor, textTransform: 'uppercase', opacity: 0.8 }}>Profit</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: accentColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              +{coins(row.profit)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>ROI</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--green)' }}>{row.roi.toFixed(1)}%</div>
          </div>
        </div>
      </div>

      {/* Breakdown toggle */}
      <div style={{ padding: '0 12px 12px' }}>
        <button className="recipe-toggle" onClick={() => setExpanded(v => !v)}>
          {expanded ? '▲ Hide cost breakdown' : '▼ Show cost breakdown'}
        </button>
        {expanded && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="recipe-row">
              <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <PetIcon tag={row.tag} rarity={row.buyRarity} size={22} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text)' }}>{row.name} ({row.buyRarity.toLowerCase()})</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>AH lowest BIN</div>
              </div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--red)', flexShrink: 0 }}>{coins(row.buyPrice)}</div>
            </div>
            {row.upgradeCost > 0 && (
              <div className="recipe-row">
                <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🐱</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text)' }}>Kat NPC fee</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Paid directly to Kat · {row.upgradeHours}h wait</div>
                </div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>{coins(row.upgradeCost)}</div>
              </div>
            )}
            {row.materials.map((mat, i) => (
              <div key={i} className="recipe-row">
                <div style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ItemIcon name={mat.name} size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text)' }}>{mat.name}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{mat.qty}× (bazaar)</div>
                </div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--gold)', flexShrink: 0 }}>{coins(mat.cost)}</div>
              </div>
            ))}
            <div className="recipe-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 2 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--green)' }}>Profit (after 2% AH tax)</div>
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--green)', flexShrink: 0 }}>+{coins(row.profit)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const ALL_RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']

export default function PetsFlipPage() {
  const [rows, setRows]               = useState<KatFlipRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [aiSummary, setAiSummary]     = useState<string | null>(null)

  const [minProfit,    setMinProfit]   = useState('')
  const [maxBudget,    setMaxBudget]   = useState('')
  const [search,       setSearch]      = useState('')
  const [rarityFilter, setRarity]      = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const { rows: data, aiSummary: ai } = await fetchKatFlips()
      setRows(data)
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
    const q  = search.toLowerCase()
    return rows.filter(r =>
      r.profit >= mp &&
      r.totalCost <= mb &&
      (rarityFilter.length === 0 || rarityFilter.includes(r.buyRarity)) &&
      (q === '' || r.name.toLowerCase().includes(q))
    )
  }, [rows, minProfit, maxBudget, rarityFilter, search])

  const top = filtered[0]

  function toggleRarity(r: string) {
    setRarity(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />

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
                <span className="live-badge" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--muted)' }}>Loading…</span>
              )}
              {lastUpdated && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Kat Flips</h1>
            <p style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              Buy pets at lowest AH BIN, upgrade rarity via Kat NPC (with real per-pet costs), sell the upgraded rarity for profit.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Best Profit</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
                {top ? `+${coins(top.profit)}` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Best ROI</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {top ? `${top.roi.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Opportunities</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {filtered.length}
              </div>
            </div>
          </div>
        </div>

        <div className="info-box">
          <div className="section-label" style={{ color: 'var(--gold)', marginBottom: 6 }}>How it works</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.7 }}>
            Buy a pet at the lowest AH BIN price. Take it to <strong style={{ color: 'var(--text)' }}>Kat&apos;s Florist</strong> in the Hub and pay Kat&apos;s exact coin fee + any required bazaar materials to upgrade its rarity. Sell the upgraded pet on the AH. Profit is shown after 2% AH tax. Costs sourced from <strong style={{ color: 'var(--text)' }}>real live Kat data</strong> — not flat estimates.
          </div>
        </div>

        {/* Gemini AI summary */}
        {aiSummary && (
          <div style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--purple)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>✨</span> AI Analysis — Top Kat Flips
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text2)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{aiSummary}</div>
          </div>
        )}

        {/* Filters */}
        <div className="filter-panel">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>⚙ Filters</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 16px', marginBottom: 12 }}>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Search pet</div>
              <input className="filter-input" placeholder="Wolf, Enderman…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Min profit</div>
              <input className="filter-input" type="number" placeholder="0" value={minProfit} onChange={e => setMinProfit(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Max total cost</div>
              <input className="filter-input" type="number" placeholder="∞" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} />
            </div>
          </div>
          {/* Rarity filter chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_RARITIES.map(r => {
              const active = rarityFilter.includes(r)
              const color  = RARITY_COLOR[r] ?? '#aaa'
              return (
                <button key={r} onClick={() => toggleRarity(r)} style={{
                  fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em',
                  padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${active ? color : `${color}44`}`,
                  background: active ? `${color}22` : 'transparent',
                  color: active ? color : 'var(--muted)',
                  transition: 'all 0.15s', textTransform: 'capitalize',
                }}>{r.toLowerCase()}</button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))', gap: 14 }}>
          {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}

          {!loading && filtered.length === 0 && (
            <div style={{
              gridColumn: '1/-1', textAlign: 'center', padding: '80px 0',
              color: 'var(--muted)', border: '1px dashed var(--border2)',
              borderRadius: 16, background: 'rgba(255,255,255,0.01)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.2 }}>🐾</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>No profitable pet flips right now</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Try lowering filters or check back after prices update.</div>
            </div>
          )}

          {!loading && filtered.map(row => <KatCard key={`${row.tag}-${row.buyRarity}`} row={row} />)}
        </div>
      </main>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
