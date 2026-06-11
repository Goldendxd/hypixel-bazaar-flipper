'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import Ticker from '@/components/Ticker'
import RefreshTimer from '@/components/RefreshTimer'
import { AnimatedNumber, Chip, ItemIcon, Oracle, PageHead, Spark, StatCard, coins, coinsShort, heatColor } from '@/components/ui'

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

function AlertCard({ alert }: { alert: MarketAlert }) {
  const isCrash = alert.type === 'CRASH'
  const color = isCrash ? 'var(--red)' : 'var(--green)'
  return (
    <div className={`alarm${isCrash ? '' : ' up'}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="ifr"><ItemIcon id={alert.itemId} size={28} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>{alert.itemName}</span>
            <Chip label={isCrash ? `▼ CRASH ${alert.changePct}%` : `▲ SPIKE +${alert.changePct}%`} tone={isCrash ? 'red' : 'green'} />
          </div>
          <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--dim)', marginTop: 3 }}>
            {coinsShort(alert.prevAvg)} → <span style={{ color, fontWeight: 700 }}>{coinsShort(alert.current)}</span>
            {' · '}{coinsShort(alert.weeklyVolume)}/wk
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.74rem', color: 'var(--dim)', marginTop: 10, lineHeight: 1.55, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        {alert.note}
      </div>
    </div>
  )
}

function FlipCard({ flip, rank }: { flip: IntelFlip; rank: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="card lift"
      style={{ padding: '13px 17px', cursor: 'pointer' }}
      onClick={() => setOpen(o => !o)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--faint)', width: 20, flexShrink: 0 }}>{rank}</span>
        <div className="ifr"><ItemIcon id={flip.id} size={28} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: '0.87rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{flip.name}</span>
            <Chip label={flip.riskClass} tone={flip.riskClass === 'SAFE' ? 'green' : 'orange'} />
            {flip.manipulationFlag && <Chip label="⚠ MANIP" tone="red" />}
          </div>
          <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--dim)', marginTop: 2 }}>
            buy <span style={{ color: 'var(--blue)' }}>{coinsShort(flip.buyOrder)}</span>
            {' · sell '}<span style={{ color: 'var(--gold-hi)' }}>{coinsShort(flip.sellOrder)}</span>
            {' · '}<span style={{ color: 'var(--green)' }}>+{flip.marginPct.toFixed(1)}%</span>
          </div>
        </div>
        <Spark values={flip.spark} color={flip.volatility > 12 ? 'var(--red)' : 'var(--gold)'} w={64} h={22} fill />
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 86 }}>
          <div className="mono" style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--green)' }}>
            {coinsShort(flip.hourlyPotential)}/h
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--faint)', marginTop: 1 }}>fill {flip.fillProbability}%</div>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12, animation: 'fadeIn 0.25s ease both' }}>
          {[
            { label: 'Profit / item', val: `+${coins(flip.profitPerItem)}`, color: 'var(--green)' },
            { label: 'Liquidity', val: `${flip.liquidityScore}/100`, color: flip.liquidityScore > 60 ? 'var(--green)' : 'var(--gold)' },
            { label: 'Volatility', val: `${flip.volatility.toFixed(1)}%`, color: flip.volatility > 12 ? 'var(--red)' : 'var(--text)' },
            { label: 'Weekly buys', val: coinsShort(flip.weeklyBuyVol), color: 'var(--text)' },
            { label: 'Weekly sells', val: coinsShort(flip.weeklySellVol), color: 'var(--text)' },
            { label: 'Risk-adj score', val: coinsShort(flip.riskAdjusted), color: 'var(--purple)' },
          ].map(({ label, val, color }) => (
            <div key={label}>
              <div className="mini-label">{label}</div>
              <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState<IntelResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [riskTab, setRiskTab] = useState<'ALL' | 'SAFE' | 'RISKY'>('ALL')

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
  const crashes = data?.alerts.filter(a => a.type === 'CRASH') ?? []
  const spikes = data?.alerts.filter(a => a.type === 'SPIKE') ?? []

  return (
    <Shell>
      <Ticker />

      <PageHead
        title="Market"
        highlight="Overview"
        sub="Live SkyBlock economy radar — crash detection, risk-adjusted flips and mayor impact at a glance"
        live
        lastUpdated={lastUpdated}
        error={error}
      />

      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 13, marginBottom: 22 }}>
        <StatCard label="Products tracked" value={data?.totalTracked ?? 0} accent="var(--blue)" sub="Live bazaar feed" />
        <StatCard label="Top flip potential" value={topHourly} format={coinsShort} suffix="/hour" accent="var(--green)" sub="Risk-adjusted #1 opportunity" />
        <StatCard label="Volatility index" value={data?.marketVolatilityIndex ?? 0} format={(n) => n.toFixed(2)} suffix="%" accent={(data?.marketVolatilityIndex ?? 0) > 8 ? 'var(--red)' : 'var(--gold)'} sub="Avg rolling deviation" />
        <StatCard label="Active alerts" value={data?.alerts.length ?? 0} accent={crashes.length > 0 ? 'var(--red)' : 'var(--purple)'} sub={`${crashes.length} crashes · ${spikes.length} spikes`} />
      </div>

      <Oracle text={data?.aiSummary} />

      {data && data.alerts.length > 0 && (
        <>
          <div className="sect">Anomaly alerts — crash &amp; spike detection</div>
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12, marginBottom: 22 }}>
            {data.alerts.map((a, i) => <AlertCard key={`${a.itemId}-${i}`} alert={a} />)}
          </div>
        </>
      )}

      {data && data.alerts.length === 0 && (
        <div className="note success">
          <strong style={{ color: 'var(--text)' }}>No market anomalies detected.</strong>{' '}
          Crash detection needs ~10 min of rolling history{data.historyDepth < 10 ? ` (warming up: ${data.historyDepth}/10 snapshots)` : ''} — alerts trigger on sustained ±40% moves with live volume on 100K+ items.
        </div>
      )}

      {data?.mayor && (
        <div className="card rise-1" style={{ padding: '17px 21px', marginBottom: 22, display: 'flex', alignItems: 'center', gap: 17, flexWrap: 'wrap' }}>
          <div className="coin-mark" style={{ width: 44, height: 44, fontSize: 19 }}>♛</div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem' }}>Mayor {data.mayor.name}</span>
              {data.mayor.perks.slice(0, 3).map(p => <Chip key={p} label={p} tone="gold" />)}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--dim)', lineHeight: 1.55 }}>{data.mayor.impact}</div>
          </div>
        </div>
      )}

      <div className="sect">Top flips — risk-adjusted ranking</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['ALL', 'SAFE', 'RISKY'] as const).map(tab => (
          <button
            key={tab}
            className={`pill${riskTab === tab ? (tab === 'SAFE' ? ' on-green' : tab === 'RISKY' ? ' on-orange' : ' on') : ''}`}
            onClick={() => setRiskTab(tab)}
          >
            {tab === 'ALL' ? 'All' : tab === 'SAFE' ? '● Safe' : '◆ Risky'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--faint)', alignSelf: 'center' }}>
          profit/hour × fill probability ÷ risk
        </span>
      </div>
      <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 22 }}>
        {!data && [0, 1, 2, 3, 4].map(i => <div key={i} className="skel" style={{ height: 62, borderRadius: 'var(--r-lg)' }} />)}
        {data && filteredFlips.length === 0 && (
          <div className="card" style={{ padding: '34px 0', textAlign: 'center', color: 'var(--faint)', fontSize: '0.85rem' }}>
            No {riskTab.toLowerCase()} flips right now — the spread is tight
          </div>
        )}
        {filteredFlips.map((f, i) => <FlipCard key={f.id} flip={f} rank={i + 1} />)}
      </div>

      {data && data.heatmap.length > 0 && (
        <>
          <div className="sect">Market heatmap — volatility × spread</div>
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 9, marginBottom: 22 }}>
            {data.heatmap.map(cell => (
              <div key={cell.id} className="card lift" style={{ padding: '10px 12px', background: heatColor(cell.intensity) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                  <ItemIcon id={cell.id} size={20} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cell.name}
                  </span>
                </div>
                <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--gold-hi)' }}>
                  <AnimatedNumber value={cell.price} format={coinsShort} />
                </div>
                <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--dim)', marginTop: 2 }}>
                  σ {cell.volatility.toFixed(1)}% · spr {cell.spreadPct.toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </Shell>
  )
}
