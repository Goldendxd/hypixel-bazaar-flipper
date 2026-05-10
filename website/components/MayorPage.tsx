'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMayorData, MayorData, MayorFlipItem } from '@/lib/mayorData'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return 'Election now'
  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const ACTION_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  BUY:  { color: '#10f5a0', bg: 'rgba(16,245,160,0.08)',   border: 'rgba(16,245,160,0.25)',   label: 'BUY'  },
  SELL: { color: '#f87171', bg: 'rgba(248,113,113,0.08)',  border: 'rgba(248,113,113,0.25)',  label: 'SELL' },
  HOLD: { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',   border: 'rgba(251,191,36,0.25)',   label: 'HOLD' },
  WARN: { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',  border: 'rgba(148,163,184,0.25)',  label: 'WARN' },
}

function ItemIcon({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://sky.shiiyu.moe/item/${id}`}
      alt={name}
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
        <Link href="/pets" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🐾</span>Kat Flips</Link>
        <Link href="/books" className="nav-item" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>📚</span>Book Flips</Link>
        <Link href="/mayor" className="nav-item active" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🏛️</span>Mayor Flips</Link>
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <div style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.12)', borderRadius: 10, padding: '10px 12px' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 13, width: '55%', marginBottom: 7 }} />
          <div className="skeleton" style={{ height: 10, width: '40%' }} />
        </div>
        <div className="skeleton" style={{ height: 22, width: 44, borderRadius: 6 }} />
      </div>
      <div className="skeleton" style={{ height: 52, borderRadius: 10, marginBottom: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
  const accentGrad = item.action === 'BUY'
    ? 'linear-gradient(90deg, var(--green), #34d399)'
    : item.action === 'SELL'
    ? 'linear-gradient(90deg, #f87171, #fb923c)'
    : item.action === 'HOLD'
    ? 'linear-gradient(90deg, var(--gold), var(--amber))'
    : 'linear-gradient(90deg, var(--muted), #64748b)'

  return (
    <div className="flip-card">
      <div style={{ height: 2, background: accentGrad, opacity: 0.85 }} />

      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${act.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <ItemIcon id={item.id} name={item.name} size={36} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
              {item.name}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 3, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                background: 'var(--gold-dim)', border: '1px solid rgba(251,191,36,0.25)', color: 'var(--gold)',
                letterSpacing: '0.05em',
              }}>⚠ MANIP?</span>
            )}
          </div>
        </div>
      </div>

      {/* Why box */}
      <div style={{ margin: '0 12px 10px', background: act.bg, border: `1px solid ${act.border}`, borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ fontSize: '0.6rem', color: act.color, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Why</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 4 }}>{item.perkReason}</div>
        <div style={{ fontSize: '0.74rem', color: act.color, lineHeight: 1.5, fontWeight: 600 }}>{item.actionReason}</div>
        {isDerpy && (
          <div style={{ marginTop: 6, fontSize: '0.68rem', color: '#f87171', fontWeight: 600 }}>
            ⚠ Derpy active: 4× bazaar tax — recalculate margins
          </div>
        )}
      </div>

      <div className="divider" />

      <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <div className="stat-label">Insta-buy price</div>
          <div className="stat-value" style={{ color: item.action === 'BUY' ? 'var(--red)' : 'var(--text)' }}>{coins(item.price)}</div>
        </div>
        <div>
          <div className="stat-label">Sell order</div>
          <div className="stat-value" style={{ color: item.action === 'SELL' ? 'var(--green)' : 'var(--text)' }}>{coins(item.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Weekly buy vol</div>
          <div className="stat-value">{item.weeklyBuyVol.toLocaleString()}</div>
        </div>
        <div>
          <div className="stat-label">Weekly sell vol</div>
          <div className="stat-value">{item.weeklySellVol.toLocaleString()}</div>
        </div>
      </div>
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

  const isDerpy = data?.isDerpy ?? false

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />

      <main className="main-scroll">
        {/* Derpy global warning banner */}
        {isDerpy && (
          <div className="warning-banner" style={{ marginBottom: 20, borderRadius: 12 }}>
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <span><strong>DERPY IS ACTIVE</strong> — 4× bazaar tax on all transactions. All profit margins are severely reduced. Calculate carefully before buying.</span>
          </div>
        )}

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
            <h1 className="page-title">Mayor Flips</h1>
            <p style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              Live market intelligence — which items to buy or sell based on the active mayor&apos;s perks.
              {data && <span style={{ color: 'var(--gold)', marginLeft: 6 }}>Active: {data.mayorName} · Year {data.currentYear}</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* Mayor info block */}
            {data && (
              <div className="stat-block" style={{ minWidth: 160 }}>
                <div className="stat-label">Active Mayor</div>
                <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
                  {data.mayorName}
                </div>
                <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {data.perks.filter(p => !p.minister).slice(0, 2).map(p => (
                    <span key={p.name} style={{
                      fontSize: '0.58rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                      background: 'var(--gold-dim)', border: '1px solid rgba(251,191,36,0.2)', color: 'var(--gold)',
                    }}>{p.name}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Next Election</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--blue)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {data ? fmtCountdown(countdown) : '—'}
              </div>
              {data && <div style={{ marginTop: 4, fontSize: '0.65rem', color: 'var(--muted)' }}>Year {data.nextElectionYear}</div>}
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Opportunities</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {filtered.length}
              </div>
            </div>
          </div>
        </div>

        <div className="info-box" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.12)' }}>
          <div className="section-label" style={{ color: 'var(--gold)', marginBottom: 6 }}>How it works</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.7 }}>
            Each SkyBlock mayor has unique perks that shift supply and demand for specific bazaar items. <strong style={{ color: 'var(--text)' }}>BUY</strong> signals items that will spike in demand. <strong style={{ color: 'var(--text)' }}>SELL</strong> signals items that will flood with supply. <strong style={{ color: 'var(--text)' }}>HOLD</strong> signals high volatility — wait for a clear trend. Items flagged <strong style={{ color: 'var(--gold)' }}>MANIP?</strong> have abnormal price spreads.
          </div>
        </div>

        {/* Filter panel */}
        <div className="filter-panel">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--gold)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>⚙ Filters</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['ALL', 'BUY', 'SELL', 'HOLD'] as ActionFilter[]).map(a => {
                const s = ACTION_STYLE[a] ?? { color: 'var(--text)', bg: 'rgba(255,255,255,0.05)', border: 'var(--border)' }
                const active = actionFilter === a
                return (
                  <button key={a} onClick={() => setActionFilter(a)} style={{
                    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
                    padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${active ? s.border : 'var(--border)'}`,
                    background: active ? s.bg : 'transparent',
                    color: active ? s.color : 'var(--muted)',
                    transition: 'all 0.15s',
                  }}>{a}</button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 16px' }}>
            <div>
              <div className="stat-label" style={{ marginBottom: 6 }}>Search item or perk</div>
              <input className="filter-input" placeholder="Wolf Tooth, EZPZ…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

          {!loading && filtered.length === 0 && (
            <div style={{
              gridColumn: '1/-1', textAlign: 'center', padding: '80px 0',
              color: 'var(--muted)', border: '1px dashed var(--border2)',
              borderRadius: 16, background: 'rgba(255,255,255,0.01)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.2 }}>🏛️</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
                {data?.items.length === 0
                  ? `No tracked items for ${data?.mayorName ?? 'this mayor'}`
                  : 'No items match your filter'}
              </div>
              <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>
                {data?.items.length === 0 ? 'Check back after the next election.' : 'Try changing the action filter.'}
              </div>
            </div>
          )}

          {!loading && filtered.map(item => (
            <MayorItemCard key={item.id} item={item} isDerpy={isDerpy} />
          ))}
        </div>
      </main>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
