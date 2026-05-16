'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchKatFlips, KatFlipRow } from '@/lib/petsFlips'
import Sidebar from '@/components/Sidebar'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

const RARITY_COLOR: Record<string, string> = {
  COMMON:    '#888888',
  UNCOMMON:  '#55cc55',
  RARE:      '#4d9fff',
  EPIC:      '#9d6fff',
  LEGENDARY: '#ffb700',
  MYTHIC:    '#ff55ff',
}
function rc(rarity: string) { return RARITY_COLOR[rarity] ?? '#888888' }

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
        } else { img.style.display = 'none' }
      }}
    />
  )
}

function MatIcon({ name, size = 20 }: { name: string; size?: number }) {
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

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 4, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 11, width: '55%', marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 9, width: '40%' }} />
        </div>
        <div className="skeleton" style={{ height: 20, width: 44, borderRadius: 3 }} />
      </div>
      <div className="skeleton" style={{ height: 42, borderRadius: 4, marginBottom: 10 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px', marginBottom: 10 }}>
        {[0,1,2,3].map(i => (
          <div key={i}>
            <div className="skeleton" style={{ height: 8, width: 52, marginBottom: 4 }} />
            <div className="skeleton" style={{ height: 12, width: 44 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 36, borderRadius: 4 }} />
    </div>
  )
}

function KatCard({ row }: { row: KatFlipRow }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="flip-card">
      <div className="card-accent" style={{ background: 'linear-gradient(90deg, var(--gold), var(--amber))' }} />
      <div className="card-header">
        <div className="icon-box" style={{ borderColor: `${rc(row.buyRarity)}40` }}>
          <PetIcon tag={row.tag} rarity={row.buyRarity} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-name">{row.name}</div>
          <div className="card-sub" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ color: rc(row.buyRarity), textTransform: 'capitalize', fontWeight: 600 }}>{row.buyRarity.toLowerCase()}</span>
            <span style={{ color: 'var(--muted)' }}>→</span>
            <span style={{ color: rc(row.sellRarity), textTransform: 'capitalize', fontWeight: 600 }}>{row.sellRarity.toLowerCase()}</span>
            {row.upgradeHours > 0 && <span style={{ color: 'var(--muted)' }}>· {row.upgradeHours}h</span>}
          </div>
        </div>
        <span className="badge badge-green mono">{row.roi.toFixed(1)}%</span>
      </div>

      {/* Cost breakdown */}
      <div className="recipe-box">
        <div className="recipe-label">Kat Upgrade Cost</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {row.upgradeCost > 0 && (
            <div>
              <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: 1 }}>Kat fee</div>
              <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)' }}>{coins(row.upgradeCost)}</div>
            </div>
          )}
          {row.materials.map((mat, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 18, height: 18, flexShrink: 0 }}>
                <MatIcon name={mat.name} size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: 1 }}>{mat.qty}× {mat.name}</div>
                <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--gold)' }}>{coins(mat.cost)}</div>
              </div>
            </div>
          ))}
          {row.upgradeCost === 0 && row.materials.length === 0 && (
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>No extra cost data</div>
          )}
        </div>
      </div>

      {row.aiTip && (
        <div style={{ margin: '0 10px 8px', padding: '7px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '2px solid var(--purple)', borderRadius: 4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1, color: 'var(--purple)' }}>✦</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>{row.aiTip}</span>
        </div>
      )}

      <div className="divider" />

      <div className="card-stats">
        <div>
          <div className="stat-label">Buy Price</div>
          <div className="stat-value mono" style={{ color: 'var(--red)', fontSize: '0.9rem' }}>{coins(row.buyPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Sell (after 2% tax)</div>
          <div className="stat-value mono" style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>{coins(row.sellPrice)}</div>
        </div>
        <div>
          <div className="stat-label">Total Cost</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem' }}>{coins(row.totalCost)}</div>
        </div>
        <div>
          <div className="stat-label">Wait Time</div>
          <div className="stat-value mono" style={{ fontSize: '0.9rem' }}>{row.upgradeHours > 0 ? `${row.upgradeHours}h` : 'Instant'}</div>
        </div>
      </div>

      <div className="profit-row">
        <div>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>Profit</div>
          <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--green)', letterSpacing: '-0.02em' }}>+{coins(row.profit)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--muted)', textTransform: 'uppercase' }}>ROI</div>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--gold)' }}>{row.roi.toFixed(1)}%</div>
        </div>
      </div>

      <div style={{ padding: '0 10px 10px' }}>
        <button className="recipe-toggle" onClick={() => setExpanded(v => !v)}>
          <span>Cost breakdown</span>
          <span style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{expanded ? '▲' : '▼'}</span>
        </button>
        {expanded && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              { icon: <PetIcon tag={row.tag} rarity={row.buyRarity} size={20} />, name: `${row.name} (${row.buyRarity.toLowerCase()})`, sub: 'AH lowest BIN', val: row.buyPrice, color: 'var(--red)' },
              ...(row.upgradeCost > 0 ? [{ icon: <span style={{ fontSize: 14 }}>🐱</span>, name: 'Kat NPC fee', sub: `${row.upgradeHours}h wait`, val: row.upgradeCost, color: 'var(--gold)' }] : []),
              ...row.materials.map(m => ({ icon: <MatIcon name={m.name} size={20} />, name: m.name, sub: `${m.qty}× (bazaar)`, val: m.cost, color: 'var(--gold)' })),
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4 }}>
                <div style={{ width: 20, height: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text)' }}>{item.name}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>{item.sub}</div>
                </div>
                <div className="mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: item.color, flexShrink: 0 }}>{coins(item.val)}</div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: 'var(--green-dim)', border: '1px solid var(--green-border)', borderRadius: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--green)' }}>Profit (after 2% AH tax)</div>
              </div>
              <div className="mono" style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--green)', flexShrink: 0 }}>+{coins(row.profit)}</div>
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

  const [minProfit,    setMinProfit]  = useState('')
  const [maxBudget,    setMaxBudget]  = useState('')
  const [search,       setSearch]     = useState('')
  const [rarityFilter, setRarity]     = useState<string[]>([])

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
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {lastUpdated
                ? <span className="live-badge"><span className="pulse-dot" style={{ background: 'var(--gold)' }} />Live</span>
                : <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Loading…</span>}
              {lastUpdated && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.7rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Kat Flips</h1>
            <p className="page-subtitle" style={{ marginTop: 4 }}>
              Buy pets at AH, upgrade via Kat NPC with real live costs, sell upgraded rarity for profit.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 110 }}>
              <div className="stat-label">Best Profit</div>
              <div className="stat-value mono" style={{ color: 'var(--gold)', marginTop: 4 }}>{top ? `+${coins(top.profit)}` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 100 }}>
              <div className="stat-label">Best ROI</div>
              <div className="stat-value mono" style={{ color: 'var(--green)', marginTop: 4 }}>{top ? `${top.roi.toFixed(1)}%` : '—'}</div>
            </div>
            <div className="stat-block" style={{ minWidth: 90 }}>
              <div className="stat-label">Flips</div>
              <div className="stat-value mono" style={{ marginTop: 4 }}>{filtered.length}</div>
            </div>
          </div>
        </div>

        <div className="info-callout">
          <div className="info-callout-label" style={{ color: 'var(--gold)' }}>How it works</div>
          Buy a pet at lowest AH BIN. Take to <strong style={{ color: 'var(--text)' }}>Kat&apos;s Florist</strong> in the Hub. Pay Kat&apos;s exact coin fee + any required bazaar materials to upgrade rarity. Sell the upgraded pet on the AH. Costs sourced from live Kat data — not flat estimates. Profit after 2% AH tax.
        </div>

        {aiSummary && (
          <div className="ai-panel">
            <div className="ai-panel-label">✦ AI Analysis — Top Kat Flips</div>
            <div className="ai-panel-body">{aiSummary}</div>
          </div>
        )}

        <div className="toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text2)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Filters</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px 12px' }}>
            <div>
              <div className="stat-label" style={{ marginBottom: 4 }}>Search pet</div>
              <input className="filter-input" style={{ width: '100%' }} placeholder="Wolf, Enderman…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 4 }}>Min profit</div>
              <input className="filter-input" style={{ width: '100%' }} type="number" placeholder="0" value={minProfit} onChange={e => setMinProfit(e.target.value)} />
            </div>
            <div>
              <div className="stat-label" style={{ marginBottom: 4 }}>Max total cost</div>
              <input className="filter-input" style={{ width: '100%' }} type="number" placeholder="∞" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {ALL_RARITIES.map(r => {
              const active = rarityFilter.includes(r)
              const color  = RARITY_COLOR[r] ?? '#888'
              return (
                <button key={r} onClick={() => toggleRarity(r)} style={{
                  fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em',
                  padding: '3px 9px', borderRadius: 3, cursor: 'pointer',
                  border: `1px solid ${active ? color : `${color}40`}`,
                  background: active ? `${color}18` : 'transparent',
                  color: active ? color : 'var(--muted)',
                  transition: 'all 0.12s', textTransform: 'capitalize',
                }}>{r.toLowerCase()}</button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(282px, 1fr))', gap: 10 }}>
          {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
          {!loading && filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--muted)', border: '1px dashed var(--border)', borderRadius: 6 }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>No profitable pet flips right now</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>Try lowering filters or check back after prices update.</div>
            </div>
          )}
          {!loading && filtered.map(row => <KatCard key={`${row.tag}-${row.buyRarity}`} row={row} />)}
        </div>
      </main>
      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
