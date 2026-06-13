'use client'

import { useEffect, useRef, useState } from 'react'
import Lottie from 'lottie-react'

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
  // sky.shiiyu.moe now hotlink-blocks (403) — coflnet's static icon CDN is
  // the reliable source for items, pets and books alike.
  const fallbacks = [
    ...(src ? [src] : []),
    `https://sky.coflnet.com/static/icon/${id}`,
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

// ─── FlipCard — ranked result card with inline stats and expandable detail ──

export function FlipGrid({ children }: { children: React.ReactNode }) {
  return <div className="fliplist">{children}</div>
}

export function FlipCard({ rank, iconId, iconSrc, title, titleClass, chips, sub, stats, net, netSub, netColor = 'var(--up)', actions, open, onToggle, children }: {
  rank: number
  iconId: string
  iconSrc?: string
  title: React.ReactNode
  titleClass?: string
  chips?: React.ReactNode
  sub?: React.ReactNode
  stats: Array<{ label: string; value: string; color?: string }>
  net: string
  netSub?: string
  netColor?: string
  actions?: React.ReactNode
  open?: boolean
  onToggle?: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="card lift fcard" onClick={onToggle}>
      <div className="fcard-head">
        <span className="fcard-rank">{rank}</span>
        <div className="ifr" style={{ width: 38, height: 38 }}><ItemIcon id={iconId} src={iconSrc} size={30} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span className={titleClass} style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: titleClass ? undefined : 'var(--text)' }}>{title}</span>
            {chips}
          </div>
          {sub && <div className="mono" style={{ fontSize: '0.64rem', color: 'var(--faint)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: '0.98rem', fontWeight: 800, color: netColor }}>{net}</div>
          {netSub && <div style={{ fontSize: '0.62rem', color: 'var(--faint)', marginTop: 1 }}>{netSub}</div>}
        </div>
        {actions && <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>{actions}</div>}
      </div>

      <div className="fcard-stats">
        {stats.map(s => (
          <div key={s.label}>
            <div className="mini-label">{s.label}</div>
            <div className="mono" style={{ fontSize: '0.78rem', fontWeight: 700, color: s.color ?? 'var(--text)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {open && children && (
        <div className="fcard-expand" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  )
}

// Sort selector for the toolbar — fully custom dropdown (the native <select>
// popup can't be styled and clashes with the theme)
export function SortSelect<T extends string>({ value, onChange, options, label = 'Sort by' }: {
  value: T
  onChange: (v: T) => void
  options: Array<{ key: T; label: string }>
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find(o => o.key === value)

  return (
    <div className={`dd${open ? ' open' : ''}`} ref={ref}>
      <button type="button" className="field dd-btn" onClick={() => setOpen(o => !o)}>
        <label style={{ cursor: 'pointer' }}>{label}</label>
        <span className="dd-val">{current?.label ?? '—'}</span>
        <svg className="dd-chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="dd-menu">
          {options.map(o => (
            <button
              key={o.key}
              type="button"
              className={`dd-item${o.key === value ? ' on' : ''}`}
              onClick={() => { onChange(o.key); setOpen(false) }}
            >
              {o.label}
              {o.key === value && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Skeleton placeholders shaped like flip cards
export function FlipSkeletons({ n = 8 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skel" style={{ height: 112, borderRadius: 'var(--r-lg)' }} />
      ))}
    </>
  )
}

// ─── Lottie loader — branded loading animation ───────────────────────────────

let loaderData: object | null = null

export function Loader({ label = 'Loading live market data', size = 120 }: { label?: string; size?: number }) {
  const [data, setData] = useState<object | null>(loaderData)
  useEffect(() => {
    if (loaderData) return
    fetch('/anim/loader.json').then(r => r.json()).then(j => { loaderData = j; setData(j) }).catch(() => {})
  }, [])
  return (
    <div className="loader-wrap">
      <div style={{ width: size, height: size }}>
        {data
          ? <Lottie animationData={data} loop style={{ width: size, height: size }} />
          : <div className="coin-spin" style={{ width: size * 0.5, height: size * 0.5, margin: 'auto' }} />}
      </div>
      <div className="loader-label">{label}<span className="loader-dots" /></div>
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
