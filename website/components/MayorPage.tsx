'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchMayorData, MayorData, MayorFlipItem, NextMayorPrep } from '@/lib/mayorData'
import Sidebar from '@/components/Sidebar'
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

const ACTION: Record<string, { color: string; label: string }> = {
  BUY:  { color: 'var(--green)',  label: 'BUY'  },
  SELL: { color: 'var(--red)',    label: 'SELL' },
  HOLD: { color: 'var(--gold)',   label: 'HOLD' },
  WARN: { color: 'var(--text2)', label: 'WARN' },
}

const MAYOR_ICON: Record<string, string> = {
  diana:    'DIANA_MEDAL',
  derp:     'DERPY_MEDAL',
  marina:   'MARINA_MEDAL',
  cole:     'COLE_MEDAL',
  finnegan: 'FINNEGAN_MEDAL',
  paul:     'PAUL_MEDAL',
  foxy:     'FOXY_MEDAL',
  aatrox:   'AATROX_MEDAL',
  scorpius: 'SCORPIUS_MEDAL',
  barry:    'BARRY_MEDAL',
  jerry:    'JERRY_MEDAL',
}

function MayorAvatar({ mayorKey, name, size = 28 }: { mayorKey: string; name: string; size?: number }) {
  const itemId = MAYOR_ICON[mayorKey] ?? `${mayorKey.toUpperCase()}_MEDAL`
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://sky.shiiyu.moe/item/${itemId}`}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb) {
          img.dataset.fb = '1'
          img.src = `https://sky.lea.moe/item/${itemId}`
        } else { img.style.display = 'none' }
      }}
    />
  )
}

function ItemIcon({ id, name, size = 24 }: { id: string; name: string; size?: number }) {
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
        } else { img.style.display = 'none' }
      }}
    />
  )
}

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 11, width: '55%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 9, width: '35%' }} />
        </div>
        <div className="skeleton" style={{ height: 20, width: 38, borderRadius: 3 }} />
      </div>
      <div className="skeleton" style={{ height: 48, borderRadius: 4, marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 8, width: 52, marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 12, width: 44 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MayorItemCard({ item, isDerpy }: { item: MayorFlipItem; isDerpy: boolean }) {
  const act = ACTION[item.action] ?? ACTION.WARN

  return (
    <div className="flip-card">
      <div className="card-accent" style={{ background: act.color }} />
      <div className="card-header">
        <div className="icon-box">
          <ItemIcon id={item.id} name={item.name} size={34} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-name">{item.name}</div>
          <div className="card-sub">{item.perkName}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: 3, background: `${act.color}18`, border: `1px solid ${act.color}40`, color: act.color, letterSpacing: '0.06em' }}>{act.label}</span>
          {item.isPotentiallyManipulated && (
            <span style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,183,0,0.08)', border: '1px solid rgba(255,183,0,0.25)', color: 'var(--gold)', letterSpacing: '0.04em' }}>MANIP?</span>
          )}
        </div>
      </div>

      <div style={{ margin: '0 10px 8px', padding: '9px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderLeft: `2px solid ${act.color}`, borderRadius: 4 }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.6, marginBottom: 5 }}>{item.perkReason}</div>
        <div style={{ fontSize: '0.72rem', color: act.color, fontWeight: 600, lineHeight: 1.5 }}>{item.actionReason}</div>
        {isDerpy && (
          <div style={{ marginTop: 5, fontSize: '0.65rem', color: 'var(--red)', fontWeight: 600 }}>⚠ Derpy: 4× bazaar tax — recalculate margins</div>
        )}
      </div>

      <div className="divider" />

      <div className="card-stats">
        <div>
          <div className="stat-label">Insta-buy</div>
          <div className="stat-value mono" style={{ color: item.action === 'BUY' ? 'var(--red)' : 'var(--text)', fontSize: '0.9rem' }}>{coins(item.price)}</div>
        </div>
        <div>
          <div className="stat-label">Sell order</div>
          <div className="stat-value mono" style={{ color: item.action === 'SELL' ? 'var(--green)' : 'var(--text)', fontSize: '0.9rem' }}>{coins(item.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Weekly buy vol</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem' }}>{item.weeklyBuyVol.toLocaleString()}</div>
        </div>
        <div>
          <div className="stat-label">Weekly sell vol</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem' }}>{item.weeklySellVol.toLocaleString()}</div>
        </div>
      </div>
    </div>
  )
}

function ElectionPanel({ preps, totalVotes, countdown }: { preps: NextMayorPrep[]; totalVotes: number; countdown: number }) {
  if (!preps.length) return null
  const sorted = [...preps].sort((a, b) => b.voteShare - a.voteShare)
  const leader = sorted[0]

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>
            Next Election · {fmtCountdown(countdown)} remaining
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Leading: <span style={{ color: 'var(--gold)' }}>{leader.candidateName}</span>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 2 }}>{totalVotes.toLocaleString()} votes cast</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 2 }}>Leader</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--gold)', letterSpacing: '-0.03em' }}>{leader.voteShare.toFixed(1)}%</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
        {sorted.map(prep => (
          <div key={prep.candidateKey}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 22, height: 22, borderRadius: 3, overflow: 'hidden', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MayorAvatar mayorKey={prep.candidateKey} name={prep.candidateName} size={22} />
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: prep.isLeading ? 700 : 500, color: prep.isLeading ? 'var(--text)' : 'var(--text2)' }}>
                  {prep.candidateName}
                  {prep.isLeading && (
                    <span style={{ marginLeft: 6, fontSize: '0.55rem', background: 'rgba(255,183,0,0.12)', color: 'var(--gold)', border: '1px solid rgba(255,183,0,0.25)', borderRadius: 3, padding: '1px 5px', fontWeight: 700, letterSpacing: '0.06em' }}>LEAD</span>
                  )}
                </span>
              </div>
              <span className="mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: prep.isLeading ? 'var(--gold)' : 'var(--muted)' }}>{prep.voteShare.toFixed(1)}%</span>
            </div>
            <div className="vote-bar-track">
              <div className="vote-bar-fill" style={{ width: `${prep.voteShare}%`, background: prep.isLeading ? 'var(--gold)' : 'var(--border2)' }} />
            </div>
          </div>
        ))}
      </div>

      {leader.items.filter(i => i.action === 'BUY').length > 0 && (
        <div style={{ padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4 }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 8 }}>
            If {leader.candidateName} wins — buy now to prep
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {leader.items.filter(i => i.action === 'BUY').slice(0, 5).map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', background: 'var(--green-dim)', border: '1px solid var(--green-border)', borderRadius: 3 }}>
                <div style={{ width: 18, height: 18, flexShrink: 0 }}>
                  <ItemIcon id={item.id} name={item.name} size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text)' }}>{item.name}</div>
                  <div className="mono" style={{ fontSize: '0.58rem', color: 'var(--muted)' }}>{coins(item.price)}</div>
                </div>
              </div>
            ))}
          </div>
          {leader.aiRecommendation && (
            <div style={{ marginTop: 8, padding: '6px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '2px solid var(--purple)', borderRadius: 3, display: 'flex', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--purple)', flexShrink: 0, marginTop: 2 }}>✦</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text2)', lineHeight: 1.6 }}>{leader.aiRecommendation}</span>
            </div>
          )}
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
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">
        {isDerpy && (
          <div className="warning-banner">
            <span>⚠</span>
            <span><strong>DERPY IS ACTIVE</strong> — 4× bazaar tax on all transactions. All profit margins severely reduced. Calculate carefully.</span>
          </div>
        )}

        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" style={{ background: 'var(--gold)' }} />Live</span>
                : <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Mayor Flips</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Market intelligence based on active mayor perks + next-election vote tracking.
              {data && <span style={{ marginLeft: 6, color: 'var(--gold)' }}>Active: {data.mayorName} · Year {data.currentYear}</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data && (
              <div className="stat-block" style={{ minWidth: 150 }}>
                <div className="stat-label">Active Mayor</div>
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 26, height: 26, flexShrink: 0 }}>
                    <MayorAvatar mayorKey={data.mayorKey} name={data.mayorName} size={26} />
                  </div>
                  <div className="mono" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--gold)' }}>{data.mayorName}</div>
                </div>
                <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {data.perks.filter(p => !p.minister).slice(0, 2).map(p => (
                    <span key={p.name} style={{ fontSize: '0.55rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--gold-dim)', border: '1px solid var(--gold-border)', color: 'var(--gold)' }}>{p.name}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="stat-block" style={{ minWidth: 110 }}>
              <div className="stat-label">Next Election</div>
              <div className="stat-value mono" style={{ color: 'var(--blue)', marginTop: 5 }}>{data ? fmtCountdown(countdown) : '—'}</div>
              {data && <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: 3 }}>Year {data.nextElectionYear}</div>}
            </div>
            <div className="stat-block" style={{ minWidth: 90 }}>
              <div className="stat-label">Opportunities</div>
              <div className="stat-value mono" style={{ marginTop: 5 }}>{filtered.length}</div>
            </div>
          </div>
        </div>

        {data?.currentAiSummary && (
          <div className="ai-panel">
            <div className="ai-panel-label">✦ AI Analysis — {data.mayorName} Market Moves</div>
            <div className="ai-panel-body">{data.currentAiSummary}</div>
          </div>
        )}

        {data?.nextMayorPreps && data.nextMayorPreps.length > 0 && (
          <ElectionPanel preps={data.nextMayorPreps} totalVotes={data.totalVotes} countdown={countdown} />
        )}

        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--gold)' }}>How it works</div>
          Each mayor has perks that shift supply/demand for specific bazaar items. <strong style={{ color: 'var(--text)' }}>BUY</strong> = demand spike incoming. <strong style={{ color: 'var(--text)' }}>SELL</strong> = supply flood expected. <strong style={{ color: 'var(--text)' }}>HOLD</strong> = volatile, wait for signal. Voting panel shows who&apos;s winning so you can prep early.
        </div>

        <div className="toolbar">
          <span style={{ fontSize: '0.68rem', color: 'var(--text2)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Filter</span>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(['ALL', 'BUY', 'SELL', 'HOLD'] as ActionFilter[]).map(a => {
              const color = a === 'ALL' ? 'var(--text2)' : a === 'BUY' ? 'var(--green)' : a === 'SELL' ? 'var(--red)' : 'var(--gold)'
              return (
                <button key={a} onClick={() => setActionFilter(a)} style={{
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
                  padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
                  border: `1px solid ${actionFilter === a ? color : 'var(--border)'}`,
                  background: actionFilter === a ? `${color}18` : 'transparent',
                  color: actionFilter === a ? color : 'var(--muted)',
                  transition: 'all 0.12s',
                }}>{a}</button>
              )
            })}
          </div>
          <input
            className="filter-input"
            placeholder="Search item or perk…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginLeft: 'auto', width: 180 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(272px, 1fr))', gap: 10 }}>
          {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}

          {!loading && filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>
                {data?.items.length === 0
                  ? `No tracked items for ${data?.mayorName ?? 'this mayor'}`
                  : 'No items match your filter'}
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>
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
