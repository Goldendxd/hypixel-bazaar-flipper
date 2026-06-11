'use client'

import { useCallback, useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import RefreshTimer from '@/components/RefreshTimer'
import { fetchMayorData, MayorData, MayorFlipItem, NextMayorPrep } from '@/lib/mayorData'
import { ACTION_TONE, Chip, ItemIcon, Oracle, PageHead, StatCard, Void, coinsShort } from '@/components/ui'

function fmtCountdown(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function ItemCard({ item }: { item: MayorFlipItem }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card lift" style={{ padding: '13px 16px', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="ifr"><ItemIcon id={item.id} size={28} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.86rem' }}>{item.name}</span>
            <Chip label={item.action} tone={ACTION_TONE[item.action]} />
            {item.isPotentiallyManipulated && <Chip label="⚠ SUS" tone="red" />}
          </div>
          <div className="mono" style={{ fontSize: '0.66rem', color: 'var(--faint)', marginTop: 2 }}>{item.perkName}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--gold-hi)' }}>{coinsShort(item.price)}</div>
          <div className="mono" style={{ fontSize: '0.6rem', color: 'var(--faint)' }}>vol {coinsShort(item.weeklyBuyVol)}/wk</div>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--line)', animation: 'fadeIn 0.22s ease both' }}>
          <div style={{ fontSize: '0.76rem', color: 'var(--dim)', lineHeight: 1.6, marginBottom: 8 }}>{item.perkReason}</div>
          <div style={{ fontSize: '0.76rem', lineHeight: 1.6 }} className={`act-${item.action}`}>
            <strong>{item.action}:</strong> {item.actionReason}
          </div>
        </div>
      )}
    </div>
  )
}

function PrepBlock({ prep }: { prep: NextMayorPrep }) {
  const [open, setOpen] = useState(prep.isLeading)
  return (
    <div className="card" style={{ marginBottom: 12, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit', textAlign: 'left' }}
      >
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.92rem' }}>{prep.candidateName}</span>
        {prep.isLeading && <Chip label="★ LEADING" tone="gold" />}
        <div style={{ flex: 1, maxWidth: 220 }}>
          <div className="meter">
            <div className="meter-fill" style={{ width: `${prep.voteShare}%`, background: prep.isLeading ? 'linear-gradient(90deg, var(--gold-hi), var(--gold-deep))' : 'var(--line2)' }} />
          </div>
        </div>
        <span className="mono" style={{ fontSize: '0.78rem', fontWeight: 700, color: prep.isLeading ? 'var(--gold-hi)' : 'var(--dim)' }}>{prep.voteShare}%</span>
        <span style={{ color: 'var(--faint)', fontSize: '0.8rem' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '14px 18px', background: 'var(--bg2)' }}>
          {prep.aiRecommendation && (
            <div style={{ fontSize: '0.78rem', color: 'var(--purple)', marginBottom: 12, lineHeight: 1.6 }}>✦ {prep.aiRecommendation}</div>
          )}
          {prep.items.length === 0
            ? <div style={{ fontSize: '0.76rem', color: 'var(--faint)' }}>No tracked bazaar plays for this candidate.</div>
            : (
              <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                {prep.items.map(it => <ItemCard key={it.id} item={it} />)}
              </div>
            )}
        </div>
      )}
    </div>
  )
}

export default function MayorPage() {
  const [data, setData] = useState<MayorData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [actionTab, setActionTab] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')

  const load = useCallback(async () => {
    try {
      const j = await fetchMayorData()
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

  const items = (data?.items ?? []).filter(i => actionTab === 'ALL' || i.action === actionTab)
  const buys = data?.items.filter(i => i.action === 'BUY').length ?? 0
  const sells = data?.items.filter(i => i.action === 'SELL').length ?? 0

  return (
    <Shell>
      <PageHead
        title="Mayor"
        highlight="Plays"
        sub="Every mayor perk warps supply and demand — trade the term, then position for the next election"
        live
        lastUpdated={lastUpdated}
        error={error}
      >
        <StatCard label="Next election" value={data ? fmtCountdown(data.msUntilElection) : '—'} accent="var(--purple)" sub={data ? `SkyBlock year ${data.nextElectionYear}` : undefined} />
        <StatCard label="Tracked plays" value={data?.items.length ?? 0} accent="var(--gold)" sub={`${buys} buys · ${sells} sells`} />
      </PageHead>

      {data && (
        <div className="card rise" style={{ padding: '18px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div className="coin-mark" style={{ width: 52, height: 52, fontSize: 24 }}>♛</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem' }}>Mayor {data.mayorName}</span>
              {data.isSpecial && <Chip label="SPECIAL" tone="purple" />}
              {data.minister && <Chip label={`Minister: ${data.minister.name}`} tone="blue" />}
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {data.perks.map(p => <Chip key={p.name} label={p.name} tone="gold" />)}
              {data.minister && <Chip label={data.minister.perk.name} tone="blue" />}
            </div>
          </div>
        </div>
      )}

      <Oracle text={data?.currentAiSummary} />

      <div className="sect">Active plays — Mayor {data?.mayorName ?? '…'}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['ALL', 'BUY', 'SELL'] as const).map(tab => (
          <button
            key={tab}
            className={`pill${actionTab === tab ? (tab === 'BUY' ? ' on-green' : tab === 'SELL' ? ' on-red' : ' on') : ''}`}
            onClick={() => setActionTab(tab)}
          >
            {tab === 'ALL' ? 'All' : tab === 'BUY' ? '▲ Buy' : '▼ Sell'}
          </button>
        ))}
      </div>

      {!data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, marginBottom: 22 }}>
          {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="skel" style={{ height: 70, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      )}

      {data && items.length === 0 && (
        <div className="card" style={{ marginBottom: 22 }}>
          <Void glyph="♛" title={`No ${actionTab === 'ALL' ? '' : actionTab.toLowerCase() + ' '}plays for ${data.mayorName}`} sub="This mayor's perks don't move tracked bazaar items in that direction" />
        </div>
      )}

      {data && items.length > 0 && (
        <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 10, marginBottom: 22 }}>
          {items.map(it => <ItemCard key={it.id} item={it} />)}
        </div>
      )}

      {data && data.nextMayorPreps.length > 0 && (
        <>
          <div className="sect">Next election — position before the crowd</div>
          <div className="note">
            Voting is open for SkyBlock year {data.nextElectionYear}. Items below spike when their candidate wins —
            the earlier you position, the better the entry. <strong style={{ color: 'var(--text)' }}>{fmtCountdown(data.msUntilElection)}</strong> until the new mayor takes office.
          </div>
          {data.nextMayorPreps.map(p => <PrepBlock key={p.candidateKey} prep={p} />)}
        </>
      )}

      {data && data.nextMayorPreps.length === 0 && (
        <div className="note">
          Voting hasn&apos;t opened yet for the next election. Candidates appear in the back half of each SkyBlock year — check back soon.
        </div>
      )}

      <RefreshTimer intervalMs={60_000} lastUpdated={lastUpdated} />
    </Shell>
  )
}
