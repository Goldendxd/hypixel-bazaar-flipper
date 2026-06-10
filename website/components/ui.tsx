'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Coin formatters ─────────────────────────────────────────────────────────

export function coins(n: number): string {
  if (!isFinite(n)) return '—'
  const s = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`
  return `${s}${a.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
}

export function coinsShort(n: number): string {
  if (!isFinite(n)) return '—'
  const s = n < 0 ? '-' : ''
  const a = Math.abs(n)
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`
  return `${s}${a.toFixed(0)}`
}

// ─── AnimatedNumber — smooth count-up transitions ────────────────────────────

export function AnimatedNumber({ value, format = coins, duration = 600, className, style }: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
  style?: React.CSSProperties
}) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const rafRef  = useRef<number>()

  useEffect(() => {
    const from = prevRef.current
    const to   = value
    if (from === to) return
    prevRef.current = to
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setDisplay(from + (to - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  return <span className={className} style={style}>{format(display)}</span>
}

// ─── ItemIcon with fallback chain ────────────────────────────────────────────

export function ItemIcon({ id, size = 36, alt }: { id: string; size?: number; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`https://sky.shiiyu.moe/item/${id}`} alt={alt ?? id} width={size} height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = `https://sky.lea.moe/item/${id}` }
        else img.style.display = 'none'
      }} />
  )
}

// ─── Tag / chip ──────────────────────────────────────────────────────────────

export function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span className="chip" style={{ background: `${color}16`, color, border: `1px solid ${color}30` }}>
      {label}
    </span>
  )
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

export function Spark({ values, color = '#4d94ff', w = 64, h = 20, fill = false }: {
  values: number[]; color?: string; w?: number; h?: number; fill?: boolean
}) {
  const vals = values.filter(v => isFinite(v) && v > 0)
  if (vals.length < 2) return <div style={{ width: w, height: h }} />
  const mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 1
  const pts = vals.map((v, i) =>
    [((i / (vals.length - 1)) * w), (h - ((v - mn) / range) * (h - 3) - 1.5)] as const
  )
  const line = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }}>
      {fill && (
        <polygon
          points={`0,${h} ${line} ${w},${h}`}
          fill={color} opacity={0.12}
        />
      )}
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── Risk color helpers ──────────────────────────────────────────────────────

export const RISK_COLOR: Record<string, string> = {
  LOW: '#00e5a0', MEDIUM: '#ffb01f', HIGH: '#ff4d6a',
  SAFE: '#00e5a0', RISKY: '#ff4d6a',
}

export function heatColor(intensity: number): string {
  // 0 = calm (green) → 1 = extreme (red)
  const t = Math.max(0, Math.min(1, intensity))
  if (t < 0.5) {
    // green → gold
    const k = t * 2
    return `rgba(${Math.round(0 + 255 * k)}, ${Math.round(229 - 53 * k)}, ${Math.round(160 - 129 * k)}, 0.14)`
  }
  // gold → red
  const k = (t - 0.5) * 2
  return `rgba(255, ${Math.round(176 - 99 * k)}, ${Math.round(31 + 75 * k)}, ${Math.round((0.14 + 0.1 * k) * 100) / 100})`
}
