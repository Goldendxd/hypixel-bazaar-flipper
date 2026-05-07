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

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000))
      setSecondsLeft(remaining)
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [lastUpdated, intervalMs])

  const total = intervalMs / 1000
  const pct = Math.max(0, Math.min(100, (secondsLeft / total) * 100))
  const r = 11
  const circ = 2 * Math.PI * r
  const dash = circ * (pct / 100)

  const isUrgent = secondsLeft <= 5
  const isMid    = secondsLeft <= 15 && !isUrgent
  const color    = isUrgent ? 'var(--red)' : isMid ? 'var(--gold)' : 'var(--green)'

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: 20,
      zIndex: 50,
      background: 'rgba(7,9,15,0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
      minWidth: 150,
      userSelect: 'none',
    }}>
      {/* Ring */}
      <svg width="30" height="30" viewBox="0 0 30 30">
        {/* Track */}
        <circle cx="15" cy="15" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
        {/* Progress */}
        <circle
          cx="15" cy="15" r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 15 15)"
          style={{ transition: 'stroke-dasharray 0.5s linear, stroke 0.4s ease', filter: `drop-shadow(0 0 4px ${color})` }}
        />
        {/* Number */}
        <text
          x="15" y="19.5"
          textAnchor="middle"
          fill={color}
          fontSize="7.5"
          fontWeight="800"
          fontFamily="monospace"
          style={{ transition: 'fill 0.4s ease' }}
        >
          {secondsLeft}
        </text>
      </svg>

      <div>
        <div style={{
          fontSize: '0.6rem',
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontWeight: 700,
          marginBottom: 3,
        }}>Next Refresh</div>
        <div style={{
          fontSize: '0.9rem',
          fontWeight: 800,
          color,
          fontFamily: 'monospace',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.05em',
          transition: 'color 0.4s ease',
        }}>
          {mm}:{ss}
        </div>
      </div>
    </div>
  )
}
