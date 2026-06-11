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

export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}d ${h % 24}h`
  }
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  return `${m}m`
}

// ─── AnimatedNumber — eased count-up ─────────────────────────────────────────

export function AnimatedNumber({ value, format = coins, duration = 650, className, style }: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
  style?: React.CSSProperties
}) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const rafRef = useRef<number>()

  useEffect(() => {
    const from = prevRef.current
    const to = value
    if (from === to) return
    prevRef.current = to
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
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

export function ItemIcon({ id, size = 28, alt, src }: { id: string; size?: number; alt?: string; src?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? `https://sky.shiiyu.moe/item/${id}`} alt={alt ?? id} width={size} height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      loading="lazy"
      onError={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = `https://sky.lea.moe/item/${id}` }
        else img.style.visibility = 'hidden'
      }}
    />
  )
}

// ─── Chip ────────────────────────────────────────────────────────────────────

export type ChipTone = 'gold' | 'green' | 'red' | 'blue' | 'purple' | 'orange' | 'dim'

export function Chip({ label, tone = 'dim' }: { label: string; tone?: ChipTone }) {
  return <span className={`chip chip-${tone}`}>{label}</span>
}

export const ACTION_TONE: Record<string, ChipTone> = {
  BUY: 'green', SELL: 'red', HOLD: 'blue', WARN: 'orange',
}

export const RISK_TONE: Record<string, ChipTone> = {
  LOW: 'green', MEDIUM: 'orange', HIGH: 'red',
}

// ─── Stat card ───────────────────────────────────────────────────────────────

export function StatCard({ label, value, format, suffix, accent = 'var(--gold)', sub }: {
  label: string
  value: number | string
  format?: (n: number) => string
  suffix?: string
  accent?: string
  sub?: string
}) {
  return (
    <div className="statcard" style={{ ['--sc-accent' as never]: accent }}>
      <div className="sc-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        {typeof value === 'number'
          ? <AnimatedNumber value={value} format={format ?? ((n) => Math.round(n).toLocaleString())} className="sc-value" style={{ color: accent }} />
          : <span className="sc-value" style={{ color: accent }}>{value}</span>}
        {suffix && <span style={{ fontSize: '0.74rem', color: 'var(--dim)', fontWeight: 700 }}>{suffix}</span>}
      </div>
      {sub && <div className="sc-sub">{sub}</div>}
    </div>
  )
}

// ─── Page header ─────────────────────────────────────────────────────────────

export function PageHead({ title, highlight, sub, live, lastUpdated, error, children }: {
  title: string
  highlight?: string
  sub?: React.ReactNode
  live?: boolean
  lastUpdated?: Date | null
  error?: string | null
  children?: React.ReactNode
}) {
  return (
    <div className="pagehead">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {live !== undefined && (
            lastUpdated
              ? <span className="ph-status"><span className="live-dot" />Live · <span suppressHydrationWarning>{lastUpdated.toLocaleTimeString()}</span></span>
              : <span className="ph-status" style={{ color: 'var(--faint)' }}>Connecting…</span>
          )}
          {error && <span style={{ fontSize: '0.72rem', color: 'var(--red)', fontWeight: 700 }}>⚠ {error}</span>}
        </div>
        <h1 className="ph-title">
          {title}{highlight && <> <em>{highlight}</em></>}
        </h1>
        {sub && <p className="ph-sub">{sub}</p>}
      </div>
      {children && <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>}
    </div>
  )
}

// ─── AI Oracle panel ─────────────────────────────────────────────────────────

export function Oracle({ text, label = 'Oracle · AI Market Read' }: { text: string | null | undefined; label?: string }) {
  if (!text) return null
  return (
    <div className="oracle">
      <div className="oracle-label">✦ {label}</div>
      <div className="oracle-body">{text}</div>
    </div>
  )
}

// ─── Empty / skeleton states ─────────────────────────────────────────────────

export function Void({ glyph = '◇', title, sub }: { glyph?: string; title: string; sub?: string }) {
  return (
    <div className="void">
      <div className="void-glyph">{glyph}</div>
      <div className="void-title">{title}</div>
      {sub && <div className="void-sub">{sub}</div>}
    </div>
  )
}

export function SkelRows({ n = 8, h = 44 }: { n?: number; h?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ padding: '9px 16px', borderBottom: '1px solid var(--line)' }}>
          <div className="skel" style={{ height: h - 18 }} />
        </div>
      ))}
    </>
  )
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

export function Spark({ values, color = 'var(--gold)', w = 64, h = 20, fill = false }: {
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
      {fill && <polygon points={`0,${h} ${line} ${w},${h}`} fill={color} opacity={0.12} />}
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ─── Heat color (dashboard heatmap) ──────────────────────────────────────────

export function heatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity))
  if (t < 0.5) {
    const k = t * 2
    return `rgba(${Math.round(63 + 177 * k)}, ${Math.round(214 - 35 * k)}, ${Math.round(143 - 83 * k)}, 0.13)`
  }
  const k = (t - 0.5) * 2
  return `rgba(255, ${Math.round(179 - 80 * k)}, ${Math.round(60 + 29 * k)}, ${(0.13 + 0.09 * k).toFixed(2)})`
}
