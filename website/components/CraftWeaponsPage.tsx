'use client'

import { useCallback, useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchCraftWeapons, CraftWeaponsResponse, WeaponFlip } from '@/lib/craftWeapons'
import { Chip, ItemIcon, Oracle, PageHead, Spark, StatCard, coins, coinsShort } from '@/components/ui'

const RISK_TONE = { LOW: 'green', MEDIUM: 'orange', HIGH: 'red' } as const

function WeaponCard({ w }: { w: WeaponFlip }) {
  const [tab, setTab] = useState<'clean' | 'scrolled'>('clean')
  const isScrolled = tab === 'scrolled' && w.scrollAddons.length > 0
  const profit = isScrolled ? w.profitWithScrolls : w.profitNoScrolls
  const margin = isScrolled ? w.marginWithScrolls : w.marginNoScrolls
  const cost = isScrolled ? w.craftCostWithScrolls : w.craftCost
  const spark = w.priceHistory.map(p => p.avg)

  return (
    <div className="card rise" style={{ padding: '20px 22px', marginBottom: 18 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="ifr" style={{ width: 52, height: 52, borderRadius: 14 }}>
          <ItemIcon id={w.id} size={40} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem' }}>{w.name}</span>
            <Chip label={`${w.manipulationRisk} RISK`} tone={RISK_TONE[w.manipulationRisk]} />
          </div>
          <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--dim)', marginTop: 3 }}>
            LBIN {coinsShort(w.cleanLbin)} · ~{w.estimatedSellDays.toFixed(1)}d to sell · vol {coinsShort(w.weeklyVolume)}/wk
          </div>
        </div>
        <Spark values={spark} color="var(--gold)" w={120} h={34} fill />
        <div style={{ textAlign: 'right' }}>
          <div className="mini-label">Profit ({isScrolled ? 'scrolled' : 'clean'})</div>
          <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: profit > 0 ? 'var(--green)' : 'var(--red)' }}>
            {profit > 0 ? '+' : ''}{coinsShort(profit)}
          </div>
          <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--dim)' }}>{margin.toFixed(1)}% margin</div>
        </div>
      </div>

      {w.manipulationReason && (
        <div style={{ fontSize: '0.76rem', color: 'var(--orange)', fontWeight: 700, marginBottom: 12 }}>⚠ {w.manipulationReason}</div>
      )}

      {/* mode tabs */}
      {w.scrollAddons.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className={`pill${tab === 'clean' ? ' on' : ''}`} onClick={() => setTab('clean')}>Clean craft</button>
          <button className={`pill${tab === 'scrolled' ? ' on-purple' : ''}`} onClick={() => setTab('scrolled')}>Fully scrolled</button>
        </div>
      )}

      {/* cost summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Craft cost', val: coins(cost), color: 'var(--blue)' },
          { label: 'Sells for (LBIN)', val: coins(isScrolled ? (w.variants[w.variants.length - 1]?.estimatedLbin ?? w.cleanLbin) : w.cleanLbin), color: 'var(--gold-hi)' },
          { label: 'AH tax', val: coins(w.ahTax), color: 'var(--red)' },
          { label: 'Est. days to sell', val: `${w.estimatedSellDays.toFixed(1)}d`, color: 'var(--text)' },
        ].map(({ label, val, color }) => (
          <div key={label}>
            <div className="mini-label">{label}</div>
            <div className="mono" style={{ fontSize: '0.92rem', fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* ingredients */}
      <div className="sect" style={{ padding: '6px 0 10px' }}>Ingredients</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: w.variants.length > 0 ? 16 : 0 }}>
        {[...w.ingredients, ...(isScrolled ? w.scrollAddons.map(s => ({ id: s.id, name: s.name, qty: 1, pricing: s.pricing, unitPrice: s.unitPrice, totalCost: s.unitPrice, source: s.source, iconUrl: s.iconUrl })) : [])].map(ing => (
          <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 12px', background: 'rgba(10,8,6,0.4)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' }}>
            <ItemIcon id={ing.id} size={22} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600, flex: 1, minWidth: 0 }}>
              <span className="mono" style={{ color: 'var(--gold-hi)' }}>{ing.qty}×</span> {ing.name}
            </span>
            <Chip label={ing.source} tone={ing.source === 'BZ' ? 'blue' : 'purple'} />
            <Chip label={ing.pricing.fillTimeEst} tone="dim" />
            <span className="mono" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', minWidth: 76, textAlign: 'right' }}>
              {coinsShort(ing.totalCost)}
            </span>
          </div>
        ))}
      </div>

      {/* variants */}
      {w.variants.length > 0 && (
        <>
          <div className="sect" style={{ padding: '6px 0 10px' }}>Sell variants</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 9 }}>
            {w.variants.map(v => (
              <div key={v.label} className="card lift" style={{ padding: '11px 14px' }}>
                <div className="mini-label">{v.label}</div>
                <div className="mono" style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--gold-hi)' }}>{coinsShort(v.estimatedLbin)}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--faint)', marginTop: 3 }}>{v.note}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function CraftWeaponsPage() {
  const [data, setData] = useState<CraftWeaponsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const j = await fetchCraftWeapons()
      setData(j); setLastUpdated(new Date()); setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 180_000)
    return () => clearInterval(t)
  }, [load])

  return (
    <Shell>
      <PageHead
        title="Endgame"
        highlight="Weapons"
        sub="Hyperion & Terminator craft calculators — live ingredient pricing on both markets, scroll variants and manipulation checks"
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Hyperion profit" value={data?.hyperion.profitNoScrolls ?? 0} format={(n) => `${n > 0 ? '+' : ''}${coinsShort(n)}`} accent={(data?.hyperion.profitNoScrolls ?? 0) > 0 ? 'var(--green)' : 'var(--red)'} sub="Clean craft" />
        <StatCard label="Terminator profit" value={data?.terminator.profitNoScrolls ?? 0} format={(n) => `${n > 0 ? '+' : ''}${coinsShort(n)}`} accent={(data?.terminator.profitNoScrolls ?? 0) > 0 ? 'var(--green)' : 'var(--red)'} sub="Clean craft" />
      </PageHead>

      <Oracle text={data?.aiSummary} />

      {!data && (
        <>
          <div className="skel" style={{ height: 320, borderRadius: 'var(--r-lg)', marginBottom: 18 }} />
          <div className="skel" style={{ height: 320, borderRadius: 'var(--r-lg)' }} />
        </>
      )}

      {data && (
        <>
          <WeaponCard w={data.hyperion} />
          <WeaponCard w={data.terminator} />
        </>
      )}

      <RefreshTimer intervalMs={180_000} lastUpdated={lastUpdated} />
    </Shell>
  )
}
