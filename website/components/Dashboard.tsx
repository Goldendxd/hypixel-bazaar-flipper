'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import Ticker from '@/components/Ticker'
import RefreshTimer from '@/components/RefreshTimer'
import { AnimatedNumber, ItemIcon, Spark, Tag, coins, coinsShort, heatColor } from '@/components/ui'

// ─── Types (mirror /api/market-intel) ────────────────────────────────────────

interface MarketAlert {
  type: 'CRASH' | 'SPIKE'
  itemId: string; itemName: string
  prevAvg: number; current: number; changePct: number
  weeklyVolume: number; timestamp: string; note: string
}

interface IntelFlip {
  id: string; name: string
  buyOrder: number; sellOrder: number
  profitPerItem: number; marginPct: number
  liquidityScore: number; fillProbability: number
  volatility: number; manipulationFlag: boolean
  riskClass: 'SAFE' | 'RISKY'
  hourlyPotential: number; riskAdjusted: number
  weeklyBuyVol: number; weeklySellVol: number
  spark: number[]
}

interface HeatCell {
  id: string; name: string; price: number
  volatility: number; spreadPct: number
  intensity: number; weeklyVolume: number
}

interface IntelResponse {
  fetchedAt: string
  totalTracked: number
  marketVolatilityIndex: number
  historyDepth: number
  alerts: MarketAlert[]
  flips: IntelFlip[]
  heatmap: HeatCell[]
  mayor: { name: string; perks: string[]; impact: string } | null
  aiSummary: string | null
}

// ─── Hero metric card ────────────────────────────────────────────────────────

function HeroMetric({ label, value, format, suffix, accent, sub }: {
  label: string; value: number; format?: (n: number) => string
  suffix?: string; accent: string; sub?: string
}) {
  return (
    <div className="hero-metric" style={{ ['--hero-accent' as never]: accent }}>
      <div className="stat-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <AnimatedNumber
          value={value}
          format={format ?? ((n) => Math.round(n).toLocaleString())}
          className="num-xl"
          style={{ color: accent }}
        />
        {suffix && <span style={{ fontSize: '0.8rem', color: 'var(--text2)', fontWeight: 600 }}>{suffix}</span>}
      </div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

// ─── Alert card ──────────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: MarketAlert }) {
  const isCrash = alert.type === 'CRASH'
  const color = isCrash ? 'var(--red)' : 'var(--green)'
  return (
    <div className={`alert-card${isCrash ? '' : ' spike'}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, background: 'var(--surface2)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          <ItemIcon id={alert.itemId} size={30} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)' }}>{alert.itemName}</span>
            <Tag label={isCrash ? `▼ CRASH ${alert.changePct}%` : `▲ SPIKE +${alert.changePct}%`} color={color} />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: 3 }}>
            <span className="mono">{coinsShort(alert.prevAvg)}</span>
            {' → '}
            <span className="mono" style={{ color, fontWeight: 700 }}>{coinsShort(alert.current)}</span>
            {' · vol '}
            <span className="mono">{coinsShort(alert.weeklyVolume)}/wk</span>
            {' · '}
            {new Date(alert.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text2)', marginTop: 10, lineHeight: 1.5, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        {alert.note}
      </div>
    </div>
  )
}

// ─── Flip row ────────────────────────────────────────────────────────────────

function FlipRowItem({ flip, rank }: { flip: IntelFlip; rank: number }) {
  const [open, setOpen] = useState(false)
  const riskColor = flip.riskClass === 'SAFE' ? 'var(--green)' : 'var(--gold)'
  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '12px 16px', cursor: 'pointer', transition: 'border-color 0.18s, transform 0.18s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--muted)', width: 20, flexShrink: 0 }}>{rank}</span>
        <div style={{ width: 34, height: 34, background: 'var(--surface-solid)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          <ItemIcon id={flip.id} size={28} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flip.name}</span>
            <Tag label={flip.riskClass} color={riskColor} />
            {flip.manipulationFlag && <Tag label="⚠ MANIP" color="var(--red)" />}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text2)', marginTop: 2 }}>
            buy <span className="mono" style={{ color: 'var(--blue)' }}>{coinsShort(flip.buyOrder)}</span>
            {' · sell '}
            <span className="mono" style={{ color: 'var(--cyan)' }}>{coinsShort(flip.sellOrder)}</span>
            {' · '}
            <span className="mono" style={{ color: 'var(--green)' }}>+{flip.marginPct.toFixed(1)}%</span>
          </div>
        </div>
        <Spark values={flip.spark} color={flip.volatility > 12 ? '#ff4d6a' : '#4d94ff'} w={64} h={22} fill />
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 86 }}>
          <div className="mono" style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--green)' }}>
            {coinsShort(flip.hourlyPotential)}/h
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--muted)', marginTop: 1 }}>fill {flip.fillProbability}%</div>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12, animation: 'fadeIn 0.25s ease both' }}>
          {[
            { label: 'Profit / item',  val: `+${coins(flip.profitPerItem)}`,        color: 'var(--green)' },
            { label: 'Liquidity',      val: `${flip.liquidityScore}/100`,            color: flip.liquidityScore > 60 ? 'var(--green)' : 'var(--gold)' },
            { label: 'Volatility',     val: `${flip.volatility.toFixed(1)}%`,        color: flip.volatility > 12 ? 'var(--red)' : 'var(--text)' },
            { label: 'Weekly buys',    val: coinsShort(flip.weeklyBuyVol),           color: 'var(--text)' },
            { label: 'Weekly sells',   val: coinsShort(flip.weeklySellVol),          color: 'var(--text)' },
            { label: 'Risk-adj score', val: coinsShort(flip.riskAdjusted),           color: 'var(--purple)' },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
              <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData]               = useState<IntelResponse | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [riskTab, setRiskTab]         = useState<'ALL' | 'SAFE' | 'RISKY'>('ALL')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/market-intel', { cache: 'no-store' })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const j: IntelResponse = await res.json()
      setData(j); setLastUpdated(new Date()); setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const filteredFlips = useMemo(() => {
    if (!data) return []
    const rows = data.flips.filter(f => !f.manipulationFlag || riskTab === 'RISKY')
    if (riskTab === 'ALL') return rows.slice(0, 15)
    return rows.filter(f => f.riskClass === riskTab).slice(0, 15)
  }, [data, riskTab])

  const topHourly = data?.flips[0]?.hourlyPotential ?? 0
  const crashes   = data?.alerts.filter(a => a.type === 'CRASH') ?? []
  const spikes    = data?.alerts.filter(a => a.type === 'SPIKE') ?? []

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">

        <Ticker />

        {/* ── Header ── */}
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" />Live</span>
                : <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Connecting…</span>}
              {lastUpdated && <span style={{ fontSize: '0.72rem', color: 'var(--text2)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Market Intelligence</h1>
            <p className="page-subtitle">
              Real-time SkyBlock economy radar · crash detection · risk-adjusted flip ranking · mayor impact
            </p>
          </div>
        </div>

        {/* ── Hero metrics ── */}
        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
          <HeroMetric label="Products Tracked"   value={data?.totalTracked ?? 0}            accent="var(--blue)"   sub="Live bazaar feed" />
          <HeroMetric label="Top Flip Potential" value={topHourly} format={coinsShort}      suffix="/hour" accent="var(--green)" sub="Risk-adjusted #1 opportunity" />
          <HeroMetric label="Volatility Index"   value={data?.marketVolatilityIndex ?? 0} format={(n) => n.toFixed(2)} suffix="%" accent={(data?.marketVolatilityIndex ?? 0) > 8 ? 'var(--red)' : 'var(--gold)'} sub="Avg rolling deviation" />
          <HeroMetric label="Active Alerts"      value={data?.alerts.length ?? 0}           accent={crashes.length > 0 ? 'var(--red)' : 'var(--purple)'} sub={`${crashes.length} crashes · ${spikes.length} spikes`} />
        </div>

        {/* ── AI summary ── */}
        {data?.aiSummary && (
          <div className="ai-panel">
            <div className="ai-panel-label">✦ AI Market Read</div>
            <div className="ai-panel-body">{data.aiSummary}</div>
          </div>
        )}

        {/* ── Alert center ── */}
        {data && data.alerts.length > 0 && (
          <>
            <div className="section-label" style={{ color: 'var(--red)' }}>Anomaly Alerts — Crash & Spike Detection</div>
            <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12, marginBottom: 24 }}>
              {data.alerts.map((a, i) => <AlertCard key={`${a.itemId}-${i}`} alert={a} />)}
            </div>
          </>
        )}

        {data && data.alerts.length === 0 && (
          <div className="info-callout" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'var(--green)', fontSize: '1.1rem' }}>✓</span>
            <div>
              <strong style={{ color: 'var(--text)' }}>No market anomalies detected.</strong>{' '}
              Crash detection needs ~10 min of rolling history{data.historyDepth < 10 ? ` (warming up: ${data.historyDepth}/10 snapshots)` : ''} — alerts trigger on sustained ±40% moves with live volume on 100K+ items.
            </div>
          </div>
        )}

        {/* ── Mayor panel ── */}
        {data?.mayor && (
          <div className="glass anim-in-d1" style={{ padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'linear-gradient(135deg, var(--gold), var(--amber))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, boxShadow: '0 0 24px rgba(255,176,31,0.25)' }}>
              👑
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}>Mayor {data.mayor.name}</span>
                {data.mayor.perks.slice(0, 3).map(p => <Tag key={p} label={p} color="var(--gold)" />)}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text2)', lineHeight: 1.55 }}>{data.mayor.impact}</div>
            </div>
          </div>
        )}

        {/* ── Top flips ── */}
        <div className="section-label" style={{ color: 'var(--green)' }}>Top Flips — Risk-Adjusted Ranking</div>
        <div className="glass anim-in-d2" style={{ padding: '16px 18px', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['ALL', 'SAFE', 'RISKY'] as const).map(tab => (
              <button
                key={tab}
                className={`tab-btn${riskTab === tab ? (tab === 'SAFE' ? ' active-green' : tab === 'RISKY' ? ' active-amber' : ' active') : ''}`}
                onClick={() => setRiskTab(tab)}
              >
                {tab === 'ALL' ? 'All' : tab === 'SAFE' ? '● Safe' : '◆ Risky'}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--muted)', alignSelf: 'center' }}>
              ranked by profit/hour × fill probability ÷ risk
            </span>
          </div>
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!data && [0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12 }} />)}
            {data && filteredFlips.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                No {riskTab.toLowerCase()} flips right now — market spread is tight
              </div>
            )}
            {filteredFlips.map((f, i) => <FlipRowItem key={f.id} flip={f} rank={i + 1} />)}
          </div>
        </div>

        {/* ── Volatility heatmap ── */}
        {data && data.heatmap.length > 0 && (
          <>
            <div className="section-label" style={{ color: 'var(--purple)' }}>Market Heatmap — Volatility × Spread</div>
            <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 24 }}>
              {data.heatmap.map(cell => (
                <div key={cell.id} className="heat-cell" style={{ background: heatColor(cell.intensity) }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                    <ItemIcon id={cell.id} size={20} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {cell.name}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text)' }}>{coinsShort(cell.price)}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text2)', marginTop: 2 }}>
                    σ {cell.volatility.toFixed(1)}% · spr {cell.spreadPct.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

      </main>
      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
