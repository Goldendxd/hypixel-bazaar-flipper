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

  const pct = Math.max(0, Math.min(100, (secondsLeft / (intervalMs / 1000)) * 100))
  const color = secondsLeft <= 5 ? '#ef4444' : secondsLeft <= 15 ? '#f59e0b' : 'var(--green)'

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: 16,
      zIndex: 50,
      background: 'var(--surface)',
      border: '1px solid var(--border2)',
      borderRadius: 10,
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      minWidth: 160,
    }}>
      {/* Circular progress */}
      <svg width="28" height="28" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r="11" fill="none" stroke="var(--border2)" strokeWidth="2.5" />
        <circle
          cx="14" cy="14" r="11"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={`${2 * Math.PI * 11}`}
          strokeDashoffset={`${2 * Math.PI * 11 * (1 - pct / 100)}`}
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
          style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s' }}
        />
        <text x="14" y="18" textAnchor="middle" fill={color} fontSize="8" fontWeight="800" fontFamily="monospace">
          {secondsLeft}
        </text>
      </svg>

      <div>
        <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
          Next refresh
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
          {String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}
        </div>
      </div>
    </div>
  )
}
