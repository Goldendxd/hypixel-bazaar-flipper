'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import Ticker from '@/components/Ticker'
import RefreshTimer from '@/components/RefreshTimer'
import { AnimatedNumber, Chip, ItemIcon, PriceChart, coins, coinsShort, heatColor } from '@/components/ui'
import { fetchBookFlips, BookFlipRow } from '@/lib/bookFlips'
import { fetchCraftFlips, CraftFlipRow } from '@/lib/craftFlips'
import { fetchKatFlips, KatFlipRow } from '@/lib/petsFlips'
import { fetchForgeFlips, ForgeFlipRow } from '@/lib/forgeFlips'
import { fetchFusionFlips, FusionFlipRow } from '@/lib/fusionFlips'
import { fetchMayorData, MayorData } from '@/lib/mayorData'

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

// ─── Metric card (reference style: dot + label + corner link, number, delta, spark) ──

function MetricCard({ label, value, format = coinsShort, delta, deltaGood, sub, spark, color, href }: {
  label: string
  value: number | null
  format?: (n: number) => string
  delta?: string
  deltaGood?: boolean
  sub?: string
  spark?: number[]
  color: string          // 'up' | 'down' | css color
  href: string
}) {
  const c = color === 'up' ? 'var(--up)' : color === 'down' ? 'var(--down)' : color
  return (
    <div className="card lift" style={{ padding: '14px 16px 8px', display: 'flex', flexDirection: 'column', minHeight: 138 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="dot" style={{ background: c }} />
        <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--dim)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <Link href={href} className="corner-btn" title="Open">↗</Link>
      </div>
      {value === null ? (
        <div className="skel" style={{ height: 26, width: 90, marginBottom: 8 }} />
      ) : (
        <AnimatedNumber value={value} format={format} className="mono" style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }} />
      )}
      <div style={{ fontSize: '0.66rem', marginTop: 5, minHeight: 14 }}>
        {delta && <span style={{ color: deltaGood ? 'var(--up)' : 'var(--down)', fontWeight: 700 }}>{delta} </span>}
        <span style={{ color: 'var(--faint)' }}>{sub}</span>
      </div>
      <div style={{ marginTop: 'auto' }}>
        {spark && spark.length > 1
          ? <PriceChart points={spark.map((v, i) => ({ label: `#${i + 1}`, value: v }))} h={46} color={c} />
          : <div style={{ height: 46 }} />}
      </div>
    </div>
  )
}

// ─── Item tile — compact per-item card for the section grids ────────────────

function ItemTile({ id, icon, name, sub, value, valueSub, href, rarityClass }: {
  id: string
  icon?: string          // explicit icon url override
  name: string
  sub: React.ReactNode
  value: string          // e.g. "+23.3M"
  valueSub?: string      // e.g. "147% ROI"
  href: string
  rarityClass?: string
}) {
  return (
    <Link href={href} className="card lift" style={{ padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none', color: 'inherit' }}>
      <div className="ifr" style={{ width: 38, height: 38 }}><ItemIcon id={id} src={icon} size={30} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={rarityClass} style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: rarityClass ? undefined : 'var(--text)' }}>{name}</div>
        <div className="mono" style={{ fontSize: '0.63rem', color: 'var(--faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div className="mono" style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--up)' }}>{value}</div>
        {valueSub && <div style={{ fontSize: '0.6rem', color: 'var(--faint)', marginTop: 1 }}>{valueSub}</div>}
      </div>
    </Link>
  )
}

function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 11 }}>
      {children}
    </div>
  )
}

function TileSkeletons({ n = 6 }: { n?: number }) {
  return <>{Array.from({ length: n }).map((_, i) => <div key={i} className="skel" style={{ height: 62, borderRadius: 'var(--r-lg)' }} />)}</>
}

function SectionHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="sect">
      {title}
      <Link href={href} style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>View all →</Link>
    </div>
  )
}

// ─── Recommendation row ──────────────────────────────────────────────────────

function RecRow({ ico, text, chip, chipTone, href }: {
  ico: string; text: React.ReactNode; chip: string | null
  chipTone: 'green' | 'blue' | 'purple' | 'orange' | 'gold'
  href: string
}) {
  return (
    <Link href={href} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 4px', borderBottom: '1px solid var(--line)', textDecoration: 'none', color: 'inherit' }}>
      <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--panel3)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, color: 'var(--dim)' }}>{ico}</span>
      <span style={{ fontSize: '0.78rem', color: 'var(--text)', flex: 1, minWidth: 0 }}>{text}</span>
      {chip ? <Chip label={chip} tone={chipTone} /> : <span className="skel" style={{ width: 56, height: 16, borderRadius: 99 }} />}
    </Link>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [intel, setIntel] = useState<IntelResponse | null>(null)
  const [books, setBooks] = useState<BookFlipRow[] | null>(null)
  const [crafts, setCrafts] = useState<CraftFlipRow[] | null>(null)
  const [kats, setKats] = useState<KatFlipRow[] | null>(null)
  const [forge, setForge] = useState<ForgeFlipRow[] | null>(null)
  const [fusion, setFusion] = useState<FusionFlipRow[] | null>(null)
  const [mayor, setMayor] = useState<MayorData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(() => {
    fetch('/api/market-intel', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json() })
      .then((j: IntelResponse) => { setIntel(j); setLastUpdated(new Date()); setError(null) })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
    fetchBookFlips().then(d => setBooks(d.rows)).catch(() => setBooks([]))
    fetchCraftFlips().then(d => setCrafts(d.rows)).catch(() => setCrafts([]))
    fetchKatFlips().then(d => setKats(d.rows)).catch(() => setKats([]))
    fetchForgeFlips().then(d => setForge(d.rows)).catch(() => setForge([]))
    fetchFusionFlips().then(d => setFusion(d.rows)).catch(() => setFusion([]))
    fetchMayorData().then(setMayor).catch(() => null)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const topFlip = intel?.flips[0]
  const second = intel?.flips[1]
  const third = intel?.flips[2]
  const crashes = intel?.alerts.filter(a => a.type === 'CRASH') ?? []
  const spikes = intel?.alerts.filter(a => a.type === 'SPIKE') ?? []

  const topCraft = crafts?.find(c => !c.manipulated)
  const topBook = books?.find(b => !b.warning)
  const topKat = kats?.[0]
  const topForge = forge?.[0]
  const leader = mayor?.nextMayorPreps?.[0]
  const leaderBuy = leader?.items.find(i => i.action === 'BUY')

  const hour = new Date().getHours()
  const greeting = hour < 6 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <Shell>
      {/* ── Welcome header ── */}
      <div className="pagehead" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="ph-title">{greeting}, Flipper</h1>
          <p className="ph-sub">Your SkyBlock market briefing — every number is net of taxes and fees.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {error && <span style={{ fontSize: '0.72rem', color: 'var(--down)', fontWeight: 700 }}>⚠ {error}</span>}
          <span className="ph-status" style={{ marginBottom: 0 }}>
            <span className="live-dot" />
            {lastUpdated ? <span suppressHydrationWarning>updated {lastUpdated.toLocaleTimeString()}</span> : 'connecting…'}
          </span>
        </div>
      </div>

      <Ticker />

      {/* ── Top row: recommendations + featured chart ── */}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, marginBottom: 6 }}>
        {/* Recommendations */}
        <div className="card" style={{ padding: '14px 16px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 13 }}>✦</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Recommendations</span>
          </div>
          <RecRow
            ico="⚒" href="/craft"
            text={topCraft ? <>Craft <strong>{topCraft.name}</strong> with buy-order materials</> : 'Scanning craft flips…'}
            chip={topCraft ? `+${coinsShort(topCraft.profitOrder)}` : null}
            chipTone="green"
          />
          <RecRow
            ico="✦" href="/books"
            text={topBook ? <>Combine <strong>{topBook.inputQty}× {topBook.enchantName} {['', 'I', 'II', 'III', 'IV', 'V'][topBook.inputTier]}</strong> into {topBook.outputName}</> : 'Scanning book combines…'}
            chip={topBook ? `+${coinsShort(topBook.profit)}` : null}
            chipTone="green"
          />
          <RecRow
            ico="♟" href="/pets"
            text={topKat ? <>Kat-upgrade <strong>{topKat.name}</strong> ({topKat.buyRarity.toLowerCase()} → {topKat.sellRarity.toLowerCase()}, {Math.round(topKat.upgradeHours)}h)</> : 'Scanning Kat flips…'}
            chip={topKat ? `+${coinsShort(topKat.profit)}` : null}
            chipTone="green"
          />
          <div style={{ borderBottom: 'none' }}>
            <RecRow
              ico="♛" href="/mayor"
              text={leader ? <>Position for <strong>{leader.candidateName}</strong>{leaderBuy ? <> — stock {leaderBuy.name}</> : null} before the election closes</> : 'Reading election data…'}
              chip={leader ? `${leader.voteShare}% lead` : null}
              chipTone="purple"
            />
          </div>
        </div>

        {/* Featured chart */}
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span className="dot" style={{ background: 'var(--down)' }} />
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--dim)', flex: 1 }}>Top spread — risk-adjusted #1</span>
            <Link href="/orders" className="corner-btn" title="Open bazaar spreads">↗</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="chip chip-red" style={{ fontSize: '0.72rem' }}>↝</span>
            {topFlip
              ? <AnimatedNumber value={topFlip.hourlyPotential} format={(n) => `${coinsShort(n)}/h`} className="mono" style={{ fontSize: '1.7rem', fontWeight: 800, letterSpacing: '-0.02em' }} />
              : <div className="skel" style={{ height: 30, width: 130 }} />}
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--dim)', lineHeight: 1.6, marginBottom: 8 }}>
            {topFlip ? (
              <>
                <strong style={{ color: 'var(--text)' }}>{topFlip.name}</strong> nets{' '}
                <strong style={{ color: 'var(--up)' }}>{topFlip.marginPct.toFixed(1)}% margin</strong> at{' '}
                {topFlip.fillProbability}% fill probability.
                {second && third && <> Also worth a look: <strong style={{ color: 'var(--down)' }}>{second.name}</strong> and <strong style={{ color: 'var(--down)' }}>{third.name}</strong>.</>}
              </>
            ) : 'Crunching the order books…'}
          </div>
          {topFlip && topFlip.spark.length > 1
            ? <PriceChart points={topFlip.spark.map((v, i) => ({ label: `snapshot ${i + 1}`, value: v }))} h={110} color="var(--down)" />
            : <div className="skel" style={{ height: 110 }} />}
        </div>
      </div>

      {/* ── Bazaar metrics ── */}
      <div className="sect">Bazaar</div>
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 13 }}>
        <MetricCard
          label="Products tracked" value={intel?.totalTracked ?? null} format={(n) => Math.round(n).toLocaleString()}
          sub="live bazaar feed" spark={intel?.flips.slice(0, 14).map(f => f.weeklyBuyVol)} color="var(--info)" href="/orders"
        />
        <MetricCard
          label="Top flip potential" value={topFlip?.hourlyPotential ?? null} format={(n) => `${coinsShort(n)}/h`}
          delta={topFlip ? `${topFlip.marginPct.toFixed(1)}%` : undefined} deltaGood sub="margin on #1 spread"
          spark={topFlip?.spark} color="up" href="/orders"
        />
        <MetricCard
          label="Volatility index" value={intel?.marketVolatilityIndex ?? null} format={(n) => `${n.toFixed(2)}%`}
          delta={intel ? (intel.marketVolatilityIndex > 8 ? 'turbulent' : 'calm') : undefined}
          deltaGood={(intel?.marketVolatilityIndex ?? 0) <= 8} sub="rolling deviation"
          spark={intel?.heatmap.slice(0, 14).map(h => h.volatility)} color={(intel?.marketVolatilityIndex ?? 0) > 8 ? 'down' : 'up'} href="/orders"
        />
        <MetricCard
          label="Active alerts" value={intel ? intel.alerts.length : null} format={(n) => String(Math.round(n))}
          delta={crashes.length > 0 ? `${crashes.length} crashes` : undefined} deltaGood={false}
          sub={`${spikes.length} spikes detected`} spark={intel?.flips.slice(0, 14).map(f => f.volatility)}
          color={crashes.length > 0 ? 'down' : 'var(--purple)'} href="/orders"
        />
      </div>

      {/* ── Engine metrics ── */}
      <div className="sect">Profit engines</div>
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 13 }}>
        <MetricCard
          label="Best craft flip" value={topCraft?.profitOrder ?? (crafts ? 0 : null)} format={(n) => `+${coinsShort(n)}`}
          delta={topCraft ? `${topCraft.marginOrder.toFixed(0)}%` : undefined} deltaGood sub={topCraft?.name ?? 'no clean flips'}
          spark={crafts?.slice(0, 12).map(c => c.profitOrder)} color="up" href="/craft"
        />
        <MetricCard
          label="Best book combine" value={topBook?.profit ?? (books ? 0 : null)} format={(n) => `+${coinsShort(n)}`}
          delta={topBook ? `${topBook.margin.toFixed(0)}%` : undefined} deltaGood sub={topBook?.outputName ?? 'no clean routes'}
          spark={books?.slice(0, 12).map(b => b.profit)} color="up" href="/books"
        />
        <MetricCard
          label="Best Kat flip" value={topKat?.profit ?? (kats ? 0 : null)} format={(n) => `+${coinsShort(n)}`}
          delta={topKat ? `${topKat.roi.toFixed(0)}% ROI` : undefined} deltaGood sub={topKat ? `${topKat.name} · ${Math.round(topKat.upgradeHours)}h` : 'no routes'}
          spark={kats?.slice(0, 12).map(k => k.profit)} color="up" href="/pets"
        />
        <MetricCard
          label="Best forge slot" value={topForge?.coinsPerHour ?? (forge ? 0 : null)} format={(n) => `${coinsShort(n)}/h`}
          delta={topForge ? `${topForge.margin.toFixed(0)}%` : undefined} deltaGood sub={topForge?.name ?? 'computing chains…'}
          spark={forge?.slice(0, 12).map(f => f.coinsPerHour)} color="var(--purple)" href="/forge"
        />
      </div>

      {/* ── Top bazaar spreads ── */}
      <SectionHead title="Top bazaar spreads" href="/orders" />
      <TileGrid>
        {!intel && <TileSkeletons />}
        {intel?.flips.filter(f => !f.manipulationFlag).slice(0, 6).map(f => (
          <ItemTile
            key={f.id} id={f.id} name={f.name} href="/orders"
            sub={<>buy {coinsShort(f.buyOrder)} → sell {coinsShort(f.sellOrder)}</>}
            value={`${coinsShort(f.hourlyPotential)}/h`}
            valueSub={`${f.marginPct.toFixed(1)}% · fill ${f.fillProbability}%`}
          />
        ))}
      </TileGrid>

      {/* ── Craft flips ── */}
      <SectionHead title="Craft flips" href="/craft" />
      <TileGrid>
        {!crafts && <TileSkeletons />}
        {crafts?.filter(c => !c.manipulated).slice(0, 6).map(c => (
          <ItemTile
            key={c.id} id={c.id} name={c.name} href="/craft"
            sub={<>craft {coinsShort(c.craftCostOrder)} → sell {coinsShort(c.sellPrice)}</>}
            value={`+${coinsShort(c.profitOrder)}`}
            valueSub={`${c.marginOrder.toFixed(0)}% net`}
          />
        ))}
      </TileGrid>

      {/* ── Book combines ── */}
      <SectionHead title="Book combines" href="/books" />
      <TileGrid>
        {!books && <TileSkeletons />}
        {books?.filter(b => !b.warning).slice(0, 6).map(b => (
          <ItemTile
            key={`${b.outputId}-${b.inputTier}`} id="ENCHANTED_BOOK" name={b.outputName} href="/books"
            sub={<>{b.inputQty}× T{b.inputTier} · {b.combineSteps} combine{b.combineSteps !== 1 ? 's' : ''} · {coinsShort(b.inputTotalCost)}</>}
            value={`+${coinsShort(b.profit)}`}
            valueSub={`${b.margin.toFixed(0)}% net`}
          />
        ))}
      </TileGrid>

      {/* ── Kat flips ── */}
      <SectionHead title="Kat pet flips" href="/pets" />
      <TileGrid>
        {!kats && <TileSkeletons />}
        {kats?.slice(0, 6).map(k => (
          <ItemTile
            key={`${k.tag}-${k.sellRarity}`} id={k.tag} name={k.name} href="/pets"
            rarityClass={`rar-${k.sellRarity}`}
            sub={<>{k.buyRarity.toLowerCase()} → {k.sellRarity.toLowerCase()} · {Math.round(k.upgradeHours)}h · {coinsShort(k.totalCost)} in</>}
            value={`+${coinsShort(k.profit)}`}
            valueSub={`${k.roi.toFixed(0)}% ROI`}
          />
        ))}
      </TileGrid>

      {/* ── Shard fusion ── */}
      <SectionHead title="Shard fusion" href="/fusion" />
      <TileGrid>
        {!fusion && <TileSkeletons n={3} />}
        {fusion && fusion.length === 0 && (
          <div className="card" style={{ padding: '16px', gridColumn: '1 / -1', textAlign: 'center', color: 'var(--faint)', fontSize: '0.78rem' }}>
            No profitable fusions right now — shard prices are tight. Check back in a minute.
          </div>
        )}
        {fusion?.slice(0, 6).map(f => (
          <ItemTile
            key={f.id} id={f.id} icon={f.iconUrl} name={f.name} href="/fusion"
            rarityClass={`rar-${f.rarity?.toUpperCase()}`}
            sub={<>{f.input1.qty}× {f.input1.name} + {f.input2.qty}× {f.input2.name}</>}
            value={`+${coinsShort(f.profitPerFusion)}`}
            valueSub={`${f.margin.toFixed(0)}% per fusion`}
          />
        ))}
      </TileGrid>

      {/* ── Forge ── */}
      <SectionHead title="Forge slots" href="/forge" />
      <TileGrid>
        {!forge && <TileSkeletons />}
        {forge?.slice(0, 6).map(f => (
          <ItemTile
            key={f.id} id={f.id} name={f.name} href="/forge"
            sub={<>cost {coinsShort(f.ingredientCost)} · {Math.round(f.totalDuration / 3600 * 10) / 10}h{f.hotm ? ` · HotM ${f.hotm}` : ''}</>}
            value={`${coinsShort(f.coinsPerHour)}/h`}
            valueSub={`+${coinsShort(f.profit)} net`}
          />
        ))}
      </TileGrid>

      {/* ── Alerts ── */}
      {intel && intel.alerts.length > 0 && (
        <>
          <div className="sect">Anomaly alerts</div>
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {intel.alerts.map((a, i) => {
              const isCrash = a.type === 'CRASH'
              return (
                <div key={`${a.itemId}-${i}`} className={`alarm${isCrash ? '' : ' up'}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="ifr"><ItemIcon id={a.itemId} size={26} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{a.itemName}</span>
                        <Chip label={isCrash ? `▼ ${a.changePct}%` : `▲ +${a.changePct}%`} tone={isCrash ? 'red' : 'green'} />
                      </div>
                      <div className="mono" style={{ fontSize: '0.68rem', color: 'var(--dim)', marginTop: 2 }}>
                        {coinsShort(a.prevAvg)} → <span style={{ color: isCrash ? 'var(--down)' : 'var(--up)', fontWeight: 700 }}>{coinsShort(a.current)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Mayor strip ── */}
      {mayor && (
        <>
          <div className="sect">Mayor watch</div>
          <Link href="/mayor" className="card lift" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap', textDecoration: 'none', color: 'inherit' }}>
            <div className="coin-mark" style={{ width: 40, height: 40, fontSize: 17 }}>♛</div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 3, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '0.92rem' }}>Mayor {mayor.mayorName}</span>
                {mayor.minister && <Chip label={`Minister ${mayor.minister.name}`} tone="blue" />}
                {leader && <Chip label={`${leader.candidateName} leads next — ${leader.voteShare}%`} tone="purple" />}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--dim)' }}>
                {mayor.items.filter(i => i.action === 'BUY').length} buy plays · {mayor.items.filter(i => i.action === 'SELL').length} sell plays ·
                election closes in {Math.max(0, Math.round(mayor.msUntilElection / 3600000))}h
              </div>
            </div>
            <span className="corner-btn">↗</span>
          </Link>
        </>
      )}

      {/* ── Heatmap ── */}
      {intel && intel.heatmap.length > 0 && (
        <>
          <div className="sect">Market heatmap</div>
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 9 }}>
            {intel.heatmap.map(cell => (
              <div key={cell.id} className="card lift" style={{ padding: '10px 12px', background: heatColor(cell.intensity) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <ItemIcon id={cell.id} size={18} />
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.name}</span>
                </div>
                <div className="mono" style={{ fontSize: '0.8rem', fontWeight: 700 }}>{coins(cell.price)}</div>
                <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--dim)', marginTop: 1 }}>
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
