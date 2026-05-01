'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchStrategyRows, FlipStrategy, StrategyRow } from '@/lib/flipStrategies'

type StrategyConfig = {
  title: string
  subtitle: string
  accent: string
  navLabel: string
  navEmoji: string
  activePath: string
  strategy: FlipStrategy
}

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

function ShellNavItem({ href, active, emoji, label }: { href: string; active: boolean; emoji: string; label: string }) {
  return (
    <Link href={href} className={`nav-item${active ? ' active' : ''}`} style={{ textDecoration: 'none' }}>
      <span style={{ fontSize: 16 }}>{emoji}</span>
      {label}
    </Link>
  )
}

function StatBlock({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: '1.15rem', fontWeight: 800, color: accent ? '#f4c430' : 'var(--text)' }}>{value}</div>
    </div>
  )
}

function FlipCard({ row, accent }: { row: StrategyRow; accent: string }) {
  return (
    <div className="flip-card" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 3, background: accent }} />
      <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.iconUrl} alt={row.name} width={40} height={40} style={{ objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '0.96rem', color: '#d1d9e6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.note}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><div className="text-[0.68rem]" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Buy Price</div><div style={{ color: '#f59e0b', fontWeight: 800 }}>{coins(row.buyOrder)}</div></div>
        <div><div className="text-[0.68rem]" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Sell Price</div><div style={{ color: '#f59e0b', fontWeight: 800 }}>{coins(row.sellOrder)}</div></div>
        <div><div className="text-[0.68rem]" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Qty</div><div style={{ fontWeight: 800 }}>{row.qty.toLocaleString()}</div></div>
        <div><div className="text-[0.68rem]" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Total Cost</div><div style={{ fontWeight: 800 }}>{coins(row.totalCost)}</div></div>
      </div>

      <div style={{ padding: '0 14px 14px', display: 'grid', gap: 8 }}>
        <div className="profit-bar">
          <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em', color: 'var(--green)', textTransform: 'uppercase' }}>Est. Profit</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--green)' }}>+{coins(row.profitPerItem * row.qty)}</span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Score {row.score.toFixed(1)} · Margin {row.margin.toFixed(1)}% · Fill {row.fillScore}</div>
      </div>
    </div>
  )
}

export default function StrategyPage({ config }: { config: StrategyConfig }) {
  const [rows, setRows] = useState<StrategyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [productCount, setProductCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const data = await fetchStrategyRows(config.strategy)
      setRows(data)
      setProductCount(data.length)
      setLastUpdated(new Date())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [config.strategy])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const top = rows[0]
  const topProfit = top ? top.profitPerItem * top.qty : 0
  const topMargin = top ? top.margin : 0
  const topFill = top ? top.fillScore : 0

  const visibleRows = useMemo(() => rows.slice(0, 12), [rows])

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
            <ShellNavItem href="/" active={config.activePath === '/'} emoji="📈" label="Flips" />
            <ShellNavItem href="/craft" active={config.activePath === '/craft'} emoji="🪓" label="Craft flips" />
            <ShellNavItem href="/fusion" active={config.activePath === '/fusion'} emoji="🧬" label="Fusion flips" />
          </nav>
        </aside>

        <main style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{config.navEmoji}</span>
                <span style={{ color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.72rem', fontWeight: 800 }}>{config.navLabel}</span>
              </div>
              <h1 style={{ fontSize: '1.9rem', fontWeight: 900, color: '#e6eefb', lineHeight: 1.05 }}>{config.title}</h1>
              <p style={{ marginTop: 8, maxWidth: 860, color: 'var(--muted)', lineHeight: 1.6 }}>{config.subtitle}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 10, width: 'min(100%, 440px)' }}>
              <StatBlock label="Top total profit" value={top ? coins(topProfit) : '—'} accent />
              <StatBlock label="Top margin" value={top ? `${topMargin.toFixed(1)}%` : '—'} />
              <StatBlock label="Top fill" value={top ? `${topFill}` : '—'} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: '0.82rem', flexWrap: 'wrap' }}>
            {!loading && lastUpdated ? (
              <>
                <div className="pulse-dot" />
                <span style={{ color: 'var(--green)' }}>✓ Data updated at {lastUpdated.toLocaleTimeString()} ({productCount} products)</span>
              </>
            ) : (
              <span style={{ color: 'var(--muted)' }}>Loading…</span>
            )}
            {error && <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠ {error}</span>}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 24 }}>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 800, marginBottom: 6 }}>How it ranks</div>
            <div style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
              {config.strategy === 'craft'
                ? 'Craft flips are ranked by a liquidity-first score: weekly volume, fill score, and spread all matter, so the list prefers items that should move cleanly.'
                : 'Fusion flips are ranked by margin-heavy efficiency: the list favors bigger spread percentage, good fill scores, and sensible bankroll use.'}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {loading && Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flip-card" style={{ padding: 16 }}>
                <div className="skeleton" style={{ height: 14, width: '60%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 11, width: '40%', marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
              </div>
            ))}

            {!loading && visibleRows.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1px dashed var(--border2)', borderRadius: 14, background: 'rgba(255,255,255,0.02)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.3 }}>⊘</div>
                <div style={{ fontWeight: 600 }}>No flips match this strategy</div>
                <div style={{ fontSize: '0.82rem', marginTop: 4, opacity: 0.7 }}>Try refreshing later when bazaar spreads widen.</div>
              </div>
            )}

            {!loading && visibleRows.map((row) => <FlipCard key={row.id} row={row} accent={config.accent} />)}
          </div>
        </main>
      </div>
    </div>
  )
}
