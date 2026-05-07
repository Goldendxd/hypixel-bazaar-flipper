'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchFusionFlips, FusionFlipRow } from '@/lib/fusionFlips'
import RefreshTimer from '@/components/RefreshTimer'

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(1)
}

const RARITY_COLOR: Record<string, string> = {
  common:    '#aaaaaa',
  uncommon:  '#55ff55',
  rare:      '#5555ff',
  epic:      '#aa00aa',
  legendary: '#ffaa00',
  mythic:    '#ff55ff',
  special:   '#ff5555',
}

function rarityColor(r: string) {
  return RARITY_COLOR[r.toLowerCase()] ?? '#aaaaaa'
}

function ShardIcon({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  const src = `https://sky.shiiyu.moe/api/item/${id}`
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb) {
          img.dataset.fb = '1'
          img.src = `https://sky.lea.moe/api/item/${id}`
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
          }}>💎</div>
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
        <Link href="/fusion" className="nav-item active" style={{ textDecoration: 'none' }}><span style={{ fontSize: 15 }}>🧬</span>Fusion Flips</Link>
      </nav>
      <div style={{ marginTop: 'auto', padding: '0 8px' }}>
        <div style={{ background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--purple)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>GALATEA FUSION</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>Buy 2 shards → fuse via Kysha → sell output</div>
        </div>
      </div>
    </aside>
  )
}

function SkeletonCard() {
  return (
    <div className="flip-card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 13, width: '55%', marginBottom: 7 }} />
          <div className="skeleton" style={{ height: 10, width: '35%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 60, borderRadius: 10, marginBottom: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[0,1,2,3].map(i => <div key={i}><div className="skeleton" style={{ height: 9, width: 60, marginBottom: 5 }} /><div className="skeleton" style={{ height: 13, width: 48 }} /></div>)}
      </div>
      <div className="skeleton" style={{ height: 40, borderRadius: 8 }} />
    </div>
  )
}

function FusionCard({ row }: { row: FusionFlipRow }) {
  const rc = rarityColor(row.rarity)

  return (
    <div className="flip-card">
      {/* Purple accent top */}
      <div style={{ height: 2, background: 'linear-gradient(90deg, var(--purple), #c084fc)', opacity: 0.85 }} />

      {/* Output shard header */}
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${rc}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            <ShardIcon id={row.id} name={row.name} size={36} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
              {row.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: rc, textTransform: 'capitalize' }}>{row.rarity}</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.65rem' }}>·</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Galatea Shard</span>
            </div>
          </div>
          <span style={{
            fontSize: '0.7rem', fontWeight: 800, color: 'var(--green)',
            background: 'var(--green-dim)', border: '1px solid var(--green-border)',
            borderRadius: 99, padding: '2px 8px', flexShrink: 0,
          }}>{row.margin.toFixed(1)}%</span>
        </div>
      </div>

      {/* Fusion recipe — the two inputs with quantities */}
      <div style={{ margin: '0 12px 10px', background: 'rgba(167,139,250,0.05)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 10, padding: '10px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--purple)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Fuse together</div>
          {row.outputQty > 1 && (
            <div style={{ fontSize: '0.6rem', color: 'var(--green)', fontWeight: 700, background: 'var(--green-dim)', border: '1px solid var(--green-border)', borderRadius: 99, padding: '1px 7px' }}>
              → {row.outputQty}x output
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Input 1 */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${rarityColor(row.input1.rarity)}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <ShardIcon id={row.input1.id} name={row.input1.name} size={28} />
              </div>
              {row.input1.qty > 1 && (
                <div style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '0.55rem', fontWeight: 800, color: '#fff', background: 'var(--purple)', borderRadius: 99, padding: '0px 4px', lineHeight: '14px', border: '1px solid rgba(0,0,0,0.4)' }}>
                  ×{row.input1.qty}
                </div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.input1.name}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>
                {row.input1.qty > 1 ? `${row.input1.qty}× ` : ''}{coins(row.input1.unitPrice)} ea
              </div>
            </div>
          </div>

          {/* Plus */}
          <div style={{ fontSize: '1rem', color: 'var(--purple)', fontWeight: 800, flexShrink: 0 }}>+</div>

          {/* Input 2 */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `1px solid ${rarityColor(row.input2.rarity)}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <ShardIcon id={row.input2.id} name={row.input2.name} size={28} />
              </div>
              {row.input2.qty > 1 && (
                <div style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '0.55rem', fontWeight: 800, color: '#fff', background: 'var(--purple)', borderRadius: 99, padding: '0px 4px', lineHeight: '14px', border: '1px solid rgba(0,0,0,0.4)' }}>
                  ×{row.input2.qty}
                </div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.input2.name}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--muted)' }}>
                {row.input2.qty > 1 ? `${row.input2.qty}× ` : ''}{coins(row.input2.unitPrice)} ea
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* Stats */}
      <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
        <div>
          <div className="stat-label">Input Cost</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{coins(row.inputCost)}</div>
        </div>
        <div>
          <div className="stat-label">Sell ({row.outputQty}x)</div>
          <div className="stat-value" style={{ color: 'var(--purple)' }}>{coins(row.sellPrice * row.outputQty)}</div>
        </div>
        <div>
          <div className="stat-label">Profit / Fuse</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{coins(row.profitPerFusion)}</div>
        </div>
        <div>
          <div className="stat-label">Fusions (10M)</div>
          <div className="stat-value">{row.fusesIn10M.toLocaleString()}</div>
        </div>
      </div>

      {/* Profit bar */}
      <div style={{ padding: '0 12px 12px' }}>
        <div className="profit-bar" style={{ background: 'var(--purple-dim)', border: '1px solid rgba(167,139,250,0.2)' }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--purple)', textTransform: 'uppercase', opacity: 0.8 }}>Total Profit</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--purple)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              +{coins(row.totalProfit)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Fill</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text2)' }}>{row.fillScore}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FusionFlipPage() {
  const [rows, setRows]               = useState<FusionFlipRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [totalShards, setTotalShards] = useState(0)

  const load = useCallback(async () => {
    try {
      const { rows: data, totalShards: ts } = await fetchFusionFlips()
      setRows(data)
      setTotalShards(ts)
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
    const id = window.setInterval(load, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const top = rows[0]
  const visibleRows = useMemo(() => rows.slice(0, 24), [rows])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />

      <main className="main-scroll">
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {lastUpdated ? (
                <span className="live-badge" style={{ background: 'var(--purple-dim)', border: '1px solid rgba(167,139,250,0.25)', color: 'var(--purple)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--purple)', display: 'inline-block' }} />
                  Live
                </span>
              ) : (
                <span className="live-badge" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--muted)' }}>Loading…</span>
              )}
              {lastUpdated && <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
              {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)' }}>⚠ {error}</span>}
            </div>
            <h1 className="page-title">Fusion Flips</h1>
            <p style={{ marginTop: 6, fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              Buy 2 attribute shards on the bazaar, fuse them via Kysha in Galatea, sell the output shard.
              {totalShards > 0 && <span> {totalShards} shards tracked.</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Best Profit</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--purple)', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em' }}>
                {top ? `+${coins(top.totalProfit)}` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Best Margin</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {top ? `${top.margin.toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="stat-block" style={{ minWidth: 120 }}>
              <div className="stat-label">Opportunities</div>
              <div style={{ marginTop: 6, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {rows.length}
              </div>
            </div>
          </div>
        </div>

        <div className="info-box" style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.12)' }}>
          <div className="section-label" style={{ color: 'var(--purple)', marginBottom: 6 }}>How it works</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text2)', lineHeight: 1.7 }}>
            Buy both input shards from the bazaar at instant-buy price. Take them to <strong style={{ color: 'var(--text)' }}>Kysha at the Fusion House in Tangleburg, Galatea</strong> and fuse them. Sell the output shard via bazaar sell order. Profit shown after 1.25% tax. Sorted by total profit within 10M budget.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(288px, 1fr))', gap: 14 }}>
          {loading && Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}

          {!loading && visibleRows.length === 0 && (
            <div style={{
              gridColumn: '1/-1', textAlign: 'center', padding: '80px 0',
              color: 'var(--muted)', border: '1px dashed var(--border2)',
              borderRadius: 16, background: 'rgba(255,255,255,0.01)',
            }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.2 }}>🧬</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>No profitable fusions right now</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>Shard prices may be too tight. Try again shortly.</div>
            </div>
          )}

          {!loading && visibleRows.map(row => <FusionCard key={row.id} row={row} />)}
        </div>
      </main>

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </div>
  )
}
