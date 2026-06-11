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

// ─── ItemIcon — fallback chain + session cache + generic placeholder ─────────
// Resolution order: explicit src → shiiyu → lea.moe → generic coin glyph.
// Successful sources are remembered per item id for the session so repeat
// renders skip the broken hops.

const GENERIC_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#5a6473" stroke-width="1.6"/><text x="12" y="16" text-anchor="middle" font-size="10" fill="#5a6473" font-family="monospace">?</text></svg>`
  )

function iconCacheGet(id: string): string | null {
  try { return sessionStorage.getItem(`gf_icon:${id}`) } catch { return null }
}
function iconCacheSet(id: string, src: string) {
  try { sessionStorage.setItem(`gf_icon:${id}`, src) } catch { /* quota */ }
}

export function ItemIcon({ id, size = 28, alt, src }: { id: string; size?: number; alt?: string; src?: string }) {
  const fallbacks = [
    ...(src ? [src] : []),
    `https://sky.shiiyu.moe/item/${id}`,
    `https://sky.lea.moe/item/${id}`,
    GENERIC_ICON,
  ]
  const cached = typeof window !== 'undefined' ? iconCacheGet(id) : null
  const initial = cached ?? fallbacks[0]
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={initial} alt={alt ?? id} width={size} height={size}
      style={{ objectFit: 'contain', imageRendering: 'pixelated', display: 'block' }}
      loading="lazy"
      onLoad={(e) => {
        const img = e.target as HTMLImageElement
        if (!img.src.startsWith('data:')) iconCacheSet(id, img.src)
      }}
      onError={(e) => {
        const img = e.target as HTMLImageElement
        const idx = fallbacks.findIndex(f => img.src === f || img.src.endsWith(f))
        const next = fallbacks[Math.max(0, idx) + 1] ?? GENERIC_ICON
        if (img.src !== next) img.src = next
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

// ─── PriceChart — interactive SVG line chart with hover crosshair ────────────

export function PriceChart({ points, w = 560, h = 140, color = 'var(--up)' }: {
  points: Array<{ label: string; value: number }>
  w?: number
  h?: number
  color?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const vals = points.map(p => p.value).filter(v => isFinite(v) && v > 0)
  if (vals.length < 2) return <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--faint)', fontSize: '0.74rem' }}>Not enough history</div>

  const mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 1
  const pad = 6
  const xs = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2)
  const ys = (v: number) => h - pad - ((v - mn) / range) * (h - pad * 2)
  const line = points.map((p, i) => `${xs(i).toFixed(1)},${ys(p.value).toFixed(1)}`).join(' ')
  const hovered = hover != null ? points[hover] : null

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: w }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * w
          const i = Math.round(((x - pad) / (w - pad * 2)) * (points.length - 1))
          setHover(Math.max(0, Math.min(points.length - 1, i)))
        }}
        onMouseLeave={() => setHover(null)}
      >
        <polygon points={`${pad},${h - pad} ${line} ${w - pad},${h - pad}`} fill={color} opacity={0.08} />
        <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && (
          <>
            <line x1={xs(hover)} y1={pad} x2={xs(hover)} y2={h - pad} stroke="var(--line2)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={xs(hover)} cy={ys(points[hover].value)} r="3.5" fill={color} stroke="var(--bg)" strokeWidth="1.5" />
          </>
        )}
      </svg>
      {hovered && (
        <div style={{
          position: 'absolute', top: 0, left: `${(xs(hover!) / w) * 100}%`,
          transform: `translateX(${hover! > points.length / 2 ? '-105%' : '8px'})`,
          background: 'var(--panel3)', border: '1px solid var(--line2)', borderRadius: 8,
          padding: '5px 10px', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 3,
        }}>
          <div className="mono" style={{ fontSize: '0.76rem', fontWeight: 700, color }}>{coins(hovered.value)}</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--faint)' }}>{hovered.label}</div>
        </div>
      )}
    </div>
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
