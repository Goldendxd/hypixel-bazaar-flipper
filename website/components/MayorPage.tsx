'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMayorData, MayorData, MayorFlipItem } from '@/lib/mayorData'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(0)
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Election now'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const ACTION_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  BUY:  { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)',   label: 'BUY'  },
  SELL: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', label: 'SELL' },
  HOLD: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  label: 'HOLD' },
  WARN: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)', label: 'WARN' },
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
            background: 'linear-gradient(135deg, #f59e0b22, #ef444422)',
            border: '1px solid rgba(245,158,11,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🏛️</div>
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
        <Link href="/books" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>📚</span>Book Flips</Link>
        <Link href="/mayor" className="nav-item active" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🏛️</span>Mayor Flips</Link>
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>MAYOR FLIPS</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>Market intelligence based on active mayor perks</div>
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
          <div className="skeleton" style={{ height: 10, width: '40%' }} />
        </div>
        <div className="skeleton" style={{ height: 22, width: 44, borderRadius: 6 }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div className="skeleton" style={{ height: 9, width: 80, marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 11, width: '90%', marginBottom: 4 }} />
        <div className="skeleton" style={{ height: 11, width: '70%' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 9, width: 60, marginBottom: 5 }} />
            <div className="skeleton" style={{ height: 13, width: 48 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MayorItemCard({ item, isDerpy }: { item: MayorFlipItem; isDerpy: boolean }) {
  const act = ACTION_STYLE[item.action] ?? ACTION_STYLE.WARN
  const accentGrad = item.action === 'BUY' ? 'var(--green)' : item.action === 'SELL' ? '#f87171' : item.action === 'HOLD' ? 'var(--gold)' : 'var(--muted)'

  return (
    <div className="flip-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 2, background: `linear-gradient(90deg, ${accentGrad}, ${accentGrad}55)`, opacity: 0.9 }} />

      <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: act.bg, border: `1px solid ${act.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          <ItemIcon src={item.iconUrl} name={item.name} size={38} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name}
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.perkName}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{
            fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6,
            background: act.bg, border: `1px solid ${act.border}`, color: act.color,
            letterSpacing: '0.08em',
          }}>{act.label}</span>
          {item.isPotentiallyManipulated && (
            <span style={{
              fontSize: '0.55rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4,
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: 'var(--gold)',
              letterSpacing: '0.05em',
            }}>⚠ MANIP?</span>
          )}
        </div>
      </div>

      {/* Perk reason */}
      <div style={{ margin: '0 12px 10px', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Why</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>{item.perkReason}</div>
        <div style={{ fontSize: '0.68rem', color: act.color, lineHeight: 1.5, marginTop: 4, fontWeight: 600 }}>{item.actionReason}</div>
      </div>

      <div style={{ padding: '4px 14px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <div className="stat-label">Buy Price</div>
          <div className="stat-value" style={{ color: item.action === 'BUY' ? 'var(--red)' : 'var(--text)' }}>{coins(item.price)}</div>
        </div>
        <div>
          <div className="stat-label">Sell Order</div>
          <div className="stat-value" style={{ color: item.action === 'SELL' ? 'var(--green)' : 'var(--text)' }}>{coins(item.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Weekly Buy Vol</div>
          <div className="stat-value">{item.weeklyBuyVol.toLocaleString()}</div>
        </div>
        <div>
          <div className="stat-label">Weekly Sell Vol</div>
          <div className="stat-value">{item.weeklySellVol.toLocaleString()}</div>
        </div>
      </div>

      {isDerpy && (
        <div style={{ margin: '0 12px 10px', padding: '6px 10px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6 }}>
          <span style={{ fontSize: '0.62rem', color: '#f87171' }}>⚠ Derpy: 4× tax on all transactions</span>
        </div>
      )}
    </div>
  )
}

type ActionFilter = 'ALL' | 'BUY' | 'SELL' | 'HOLD'

export default function MayorPage() {
  const [data, setData]               = useState<MayorData | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL')
  const [search, setSearch]           = useState('')
  const [countdown, setCountdown]     = useState(0)

  const load = useCallback(async () => {
    try {
      const d = await fetchMayorData()
      setData(d)
      setCountdown(d.msUntilElection)
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

  // Live countdown tick
  useEffect(() => {
    if (!data) return
    const interval = setInterval(() => setCountdown(c => Math.max(0, c - 1000)), 1000)
    return () => clearInterval(interval)
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase()
    return data.items.filter(item =>
      (actionFilter === 'ALL' || item.action === actionFilter) &&
      (q === '' || item.name.toLowerCase().includes(q) || item.perkName.toLowerCase().includes(q))
    )
  }, [data, actionFilter, search])

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        {/* Derpy global warning */}
        {data?.isDerpy && (
          <div style={{
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 10, padding: '10px 16px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#f87171', letterSpacing: '0.06em' }}>DERPY IS ACTIVE — QUAD TAXES!!!</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: 2 }}>All bazaar transactions cost 4× normal tax. Margins are significantly reduced — calculate carefully before buying.</div>
            </div>
          </div>
        )}

        <div className="page-header" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="page-title">Mayor Flips</h1>
            <p className="page-subtitle">
              Live market intelligence based on the active SkyBlock mayor perks
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {lastUpdated && <RefreshTimer lastUpdated={lastUpdated} intervalMs={60000} />}
          </div>
        </div>

        {/* Mayor info banner */}
        {data && !loading && (
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '12px 16px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Active Mayor</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold)' }}>{data.mayorName}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 2 }}>Year {data.currentYear}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Active Perks</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {data.perks.filter(p => !p.minister).map(p => (
                  <span key={p.name} style={{
                    fontSize: '0.62rem', fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                    background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: 'var(--gold)',
                  }}>{p.name}</span>
                ))}
              </div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border)', flexShrink: 0, display: 'none' }} className="hide-mobile" />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Next Election</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--blue)' }}>{fmtCountdown(countdown)}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 2 }}>Year {data.nextElectionYear}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="filter-input"
            placeholder="Search item..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 160px' }}
          />
          {(['ALL', 'BUY', 'SELL', 'HOLD'] as ActionFilter[]).map(a => {
            const s = ACTION_STYLE[a] ?? { color: 'var(--text)', bg: 'rgba(255,255,255,0.05)', border: 'var(--border)' }
            const active = actionFilter === a
            return (
              <button
                key={a}
                onClick={() => setActionFilter(a)}
                style={{
                  fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em',
                  padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                  border: `1px solid ${active ? s.border : 'var(--border)'}`,
                  background: active ? s.bg : 'transparent',
                  color: active ? s.color : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >{a}</button>
            )
          })}
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#f87171', fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        <div className="flip-grid">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : filtered.length === 0
            ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>🏛️</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {data?.items.length === 0
                    ? `No tracked items for ${data?.mayorName ?? 'this mayor'} yet`
                    : 'No items match your filter'}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: 6 }}>
                  {data?.items.length === 0 ? 'Check back after the next election' : 'Try changing the action filter'}
                </div>
              </div>
            )
            : filtered.map(item => (
              <MayorItemCard key={item.id} item={item} isDerpy={data?.isDerpy ?? false} />
            ))
          }
        </div>

        {!loading && data && (
          <div style={{ marginTop: 16, fontSize: '0.7rem', color: 'var(--muted)', textAlign: 'center' }}>
            {filtered.length} item{filtered.length !== 1 ? 's' : ''} for {data.mayorName} · Updated every 60s
          </div>
        )}
      </main>
    </div>
  )
}
