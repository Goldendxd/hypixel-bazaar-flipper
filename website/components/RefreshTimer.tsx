'use client'

import { useEffect, useState } from 'react'

export default function RefreshTimer({
  intervalMs,
  lastUpdated,
}: {
  intervalMs: number
  lastUpdated: Date | null
}) {
  const [secondsLeft, setSecondsLeft] = useState(intervalMs / 1000)

  useEffect(() => {
    if (!lastUpdated) return
    const target = lastUpdated.getTime() + intervalMs
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [lastUpdated, intervalMs])

  const total = intervalMs / 1000
  const pct = Math.max(0, Math.min(1, secondsLeft / total))
  const r = 11
  const circ = 2 * Math.PI * r

  const isUrgent = secondsLeft <= 5
  const isMid = secondsLeft <= 15 && !isUrgent
  const color = isUrgent ? 'var(--red)' : isMid ? 'var(--gold)' : 'var(--green)'

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div className="refresh-pod">
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r={r} fill="none" stroke="rgba(28,37,54,0.1)" strokeWidth="2.5" />
        <circle
          cx="15" cy="15" r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={`${circ * pct} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 15 15)"
          style={{ transition: 'stroke-dasharray 0.5s linear, stroke 0.4s ease', filter: `drop-shadow(0 0 4px ${color})` }}
        />
        <text x="15" y="19.5" textAnchor="middle" fill={color} fontSize="8" fontWeight="800" fontFamily="monospace">
          {secondsLeft}
        </text>
      </svg>
      <div>
        <div className="mini-label" style={{ marginBottom: 2 }}>Next refresh</div>
        <div className="mono" style={{ fontSize: '0.88rem', fontWeight: 700, color, transition: 'color 0.4s ease' }}>
          {mm}:{ss}
        </div>
      </div>
    </div>
  )
}
