'use client'

import { useEffect, useRef, useState } from 'react'
import { coinsShort } from '@/components/ui'

interface TickerEntry {
  id: string
  name: string
  price: number
  delta: number | null  // % change since previous snapshot, null on first load
}

function formatName(id: string): string {
  return id
    .split(/[_:]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export default function Ticker() {
  const [entries, setEntries] = useState<TickerEntry[]>([])
  const prevPrices = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/bazaar', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const products: Record<string, { quick_status: { buyPrice: number; buyMovingWeek: number } }> = data?.products ?? {}

        const rows = Object.entries(products)
          .map(([id, p]) => ({ id, price: p.quick_status?.buyPrice ?? 0, vol: p.quick_status?.buyMovingWeek ?? 0 }))
          .filter(x => x.price > 100 && x.vol > 50_000)
          .sort((a, b) => b.vol - a.vol)
          .slice(0, 28)

        if (!alive) return
        const next: TickerEntry[] = rows.map(r => {
          const prev = prevPrices.current.get(r.id)
          const delta = prev && prev > 0 ? ((r.price - prev) / prev) * 100 : null
          return { id: r.id, name: formatName(r.id), price: r.price, delta }
        })
        rows.forEach(r => prevPrices.current.set(r.id, r.price))
        setEntries(next)
      } catch { /* keep previous ticker on error */ }
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (entries.length === 0) {
    return (
      <div className="ticker-bar anim-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 18 }}>
          <span className="pulse-dot" />
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.08em' }}>
            CONNECTING TO BAZAAR FEED…
          </span>
        </div>
      </div>
    )
  }

  // Duplicate the list so the marquee loops seamlessly
  const loop = [...entries, ...entries]

  return (
    <div className="ticker-bar anim-in">
      <div className="ticker-track">
        {loop.map((e, i) => {
          const up   = e.delta != null && e.delta > 0.05
          const down = e.delta != null && e.delta < -0.05
          const deltaColor = up ? 'var(--green)' : down ? 'var(--red)' : 'var(--muted)'
          return (
            <span key={`${e.id}-${i}`} className="ticker-item">
              <span style={{ color: 'var(--text2)', fontWeight: 600 }}>{e.name}</span>
              <span className="mono" style={{ color: 'var(--text)', fontWeight: 700 }}>{coinsShort(e.price)}</span>
              {e.delta != null && Math.abs(e.delta) > 0.01 && (
                <span className="mono" style={{ color: deltaColor, fontWeight: 700, fontSize: '0.68rem' }}>
                  {up ? '▲' : down ? '▼' : ''}{Math.abs(e.delta).toFixed(2)}%
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
