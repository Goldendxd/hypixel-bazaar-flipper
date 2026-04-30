'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { fetchBazaarFlips, FlipRow } from '@/lib/api'

// ── helpers ───────────────────────────────────────────────────────────────────

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}

function fillBar(score: number) {
  const color =
    score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  const label =
    score >= 70 ? 'Fast' : score >= 40 ? 'Med' : 'Slow'
  return { color, label }
}

type SortKey = keyof FlipRow
type SortDir = 'asc' | 'desc'

// ── skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-t border-[var(--border)]">
      {[8, 28, 150, 70, 70, 90, 65, 80, 90, 60].map((w, i) => (
        <td key={i} className="px-3 py-3">
          <div className="skeleton h-4 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="stat-card min-w-[120px]">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">{label}</div>
      <div className={`text-lg font-bold leading-tight ${accent ? 'text-amber-400' : 'text-slate-100'}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────

export default function BazaarTable() {
  const [rows, setRows] = useState<FlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(60)

  const [mode, setMode] = useState<'instant' | 'order'>('order')
  const [minProfit, setMinProfit] = useState(0)
  const [minVolume, setMinVolume] = useState(0)
  const [search, setSearch] = useState('')

  // ── Budget / qty inputs ──
  const [budget, setBudget] = useState<number | ''>('')     // max coins to spend
  const [qty, setQty] = useState<number | ''>('')           // how many to order

  const [sortKey, setSortKey] = useState<SortKey>('orderProfit')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchBazaarFlips()
      setRows(data)
      setLastUpdated(new Date())
      setCountdown(60)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (loading) return
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1_000)
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    setSortKey(mode === 'instant' ? 'instantProfit' : 'orderProfit')
    setSortDir('desc')
  }, [mode])

  const profitKey: SortKey = mode === 'instant' ? 'instantProfit' : 'orderProfit'
  const marginKey: SortKey = mode === 'instant' ? 'instantMargin' : 'orderMargin'

  // Per-row effective qty: if budget set, cap qty to what budget allows
  function effectiveQty(row: FlipRow): number {
    const buyPrice = mode === 'instant' ? row.instantBuyPrice : row.buyOrder
    const userQty = typeof qty === 'number' && qty > 0 ? qty : null
    const budgetQty = typeof budget === 'number' && budget > 0
      ? Math.floor(budget / buyPrice)
      : null

    if (userQty !== null && budgetQty !== null) return Math.min(userQty, budgetQty)
    if (userQty !== null) return userQty
    if (budgetQty !== null) return budgetQty
    return 1
  }

  const filtered = useMemo(() => {
    const profit = (r: FlipRow) => (mode === 'instant' ? r.instantProfit : r.orderProfit)
    return rows
      .filter((r) => mode === 'order' ? r.orderProfit > 0 : true)
      .filter((r) => profit(r) >= minProfit)
      .filter((r) => r.weeklyVolume >= minVolume)
      .filter((r) => (search ? r.name.toLowerCase().includes(search.toLowerCase()) : true))
      .sort((a, b) => {
        const av = a[sortKey] as number
        const bv = b[sortKey] as number
        return sortDir === 'desc' ? bv - av : av - bv
      })
  }, [rows, mode, minProfit, minVolume, search, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 opacity-20">⇅</span>
    return <span className="ml-1 text-amber-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  function copyItem(name: string) {
    navigator.clipboard.writeText(name)
    setCopied(name)
    setTimeout(() => setCopied(null), 1500)
  }

  const hasBudgetOrQty = (typeof budget === 'number' && budget > 0) || (typeof qty === 'number' && qty > 0)
  const topProfit = filtered[0] ? (mode === 'instant' ? filtered[0].instantProfit : filtered[0].orderProfit) : 0
  const avgMargin = filtered.length
    ? filtered.reduce((s, r) => s + (mode === 'instant' ? r.instantMargin : r.orderMargin), 0) / filtered.length
    : 0
  const bestTotalProfit = filtered[0] ? topProfit * effectiveQty(filtered[0]) : 0

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Mode toggle ── */}
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <div
          className="flex rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border2)', background: 'var(--surface)' }}
        >
          {(['order', 'instant'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`mode-btn ${mode === m ? 'active' : 'inactive'}`}
            >
              {m === 'order' ? 'Order flip' : 'Instant flip'}
            </button>
          ))}
        </div>

        <button
          onClick={load}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border2)')}
        >
          <span style={{ fontSize: 15 }}>↻</span> Refresh
        </button>
      </div>

      {/* ── Budget / position panel ── */}
      <div
        className="mb-5 p-4 rounded-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border2)' }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
          Position calculator
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 font-medium">Max budget (coins)</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 text-sm select-none font-bold">⬡</span>
              <input
                type="number"
                min={0}
                value={budget}
                onChange={(e) => setBudget(e.target.value === '' ? '' : Number(e.target.value))}
                className="filter-input w-44 pl-7"
                placeholder="e.g. 5000000"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400 font-medium">Quantity to order</span>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))}
              className="filter-input w-36"
              placeholder="e.g. 64"
            />
          </label>

          <div className="text-xs text-slate-500 max-w-xs leading-relaxed">
            {hasBudgetOrQty
              ? <>
                  <span className="text-amber-400 font-semibold">Best total profit: </span>
                  <span className="text-slate-200 font-semibold">{coins(bestTotalProfit)} coins</span>
                  {filtered[0] && (
                    <span className="text-slate-500"> · {effectiveQty(filtered[0])}× {filtered[0].name}</span>
                  )}
                </>
              : <span className="opacity-60">Enter a budget or quantity to see your total profit per flip.</span>
            }
          </div>

          {(budget !== '' || qty !== '') && (
            <button
              onClick={() => { setBudget(''); setQty('') }}
              className="text-xs text-slate-600 hover:text-slate-400 underline underline-offset-2 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Min profit / item</span>
          <input
            type="number"
            min={0}
            value={minProfit}
            onChange={(e) => setMinProfit(Number(e.target.value))}
            className="filter-input w-36"
            placeholder="0"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Min wk volume</span>
          <input
            type="number"
            min={0}
            value={minVolume}
            onChange={(e) => setMinVolume(Number(e.target.value))}
            className="filter-input w-36"
            placeholder="50000"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Search</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm select-none">⌕</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input w-44 pl-7"
              placeholder="item name…"
            />
          </div>
        </label>
      </div>

      {/* ── Stat cards ── */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          <StatCard label="Showing" value={String(filtered.length)} sub={`of ${rows.length} items`} />
          <StatCard label="Top profit / item" value={coins(topProfit)} sub={mode === 'order' ? 'order flip' : 'instant flip'} accent />
          <StatCard label="Avg margin" value={`${avgMargin.toFixed(1)}%`} sub="filtered items" />
          <div className="stat-card flex items-center gap-3 min-w-[160px]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Live data</div>
              <div className="text-sm font-semibold text-slate-300 leading-tight">
                {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">next in {countdown}s</div>
            </div>
            <div className="pulse-dot ml-auto" />
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div
          className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'var(--red-glow)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
        >
          <span>⚠</span> {error}
          <button onClick={load} className="ml-auto underline underline-offset-2 opacity-70 hover:opacity-100">Retry</button>
        </div>
      )}

      {/* ── Table ── */}
      <div
        className="overflow-x-auto rounded-2xl"
        style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border2)' }}>
              <th className="px-3 py-3.5 w-10 text-left">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">#</span>
              </th>
              <th className="px-2 py-3.5 w-10" />
              <th
                className="px-3 py-3.5 text-left sortable text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort('name')}
              >
                Item <SortIcon k="name" />
              </th>
              <th
                className="px-3 py-3.5 text-right sortable text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort(mode === 'instant' ? 'instantBuyPrice' : 'buyOrder')}
              >
                {mode === 'order' ? 'Buy order' : 'Buy at'} <SortIcon k={mode === 'instant' ? 'instantBuyPrice' : 'buyOrder'} />
              </th>
              <th
                className="px-3 py-3.5 text-right sortable text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort(mode === 'instant' ? 'instantSellPrice' : 'sellOrder')}
              >
                {mode === 'order' ? 'Sell order' : 'Sell at'} <SortIcon k={mode === 'instant' ? 'instantSellPrice' : 'sellOrder'} />
              </th>
              <th
                className="px-3 py-3.5 text-right sortable text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort(profitKey)}
              >
                Profit/item <SortIcon k={profitKey} />
              </th>
              <th
                className="px-3 py-3.5 text-right sortable text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort(marginKey)}
              >
                Margin <SortIcon k={marginKey} />
              </th>
              {hasBudgetOrQty && (
                <th className="px-3 py-3.5 text-right text-[10px] font-semibold uppercase tracking-widest text-amber-600">
                  Total profit
                </th>
              )}
              <th
                className="px-3 py-3.5 text-right sortable text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort('weeklyVolume')}
              >
                Wk vol <SortIcon k="weeklyVolume" />
              </th>
              <th
                className="px-3 py-3.5 text-center sortable text-[10px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort('fillScore')}
              >
                Fill speed <SortIcon k="fillScore" />
              </th>
              <th className="px-3 py-3.5 text-center text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                Copy
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 14 }).map((_, i) => <SkeletonRow key={i} />)}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={hasBudgetOrQty ? 11 : 10} className="py-20 text-center" style={{ color: 'var(--muted)' }}>
                  <div className="text-3xl mb-3 opacity-30">⊘</div>
                  <div className="font-medium">No profitable flips match your filters</div>
                  <div className="text-xs mt-1 opacity-60">Try lowering min profit or min volume</div>
                </td>
              </tr>
            )}

            {filtered.map((row, i) => {
              const profit = mode === 'instant' ? row.instantProfit : row.orderProfit
              const margin = mode === 'instant' ? row.instantMargin : row.orderMargin
              const buyP = mode === 'instant' ? row.instantBuyPrice : row.buyOrder
              const sellP = mode === 'instant' ? row.instantSellPrice : row.sellOrder
              const eqty = effectiveQty(row)
              const totalProfit = profit * eqty
              const { color: fillColor, label: fillLabel } = fillBar(row.fillScore)
              const isTop = i < 3

              return (
                <tr key={row.id} className={`flip-row ${isTop ? 'top-row' : ''}`}>
                  {/* Rank */}
                  <td className="px-3 py-3">
                    <span className={`row-rank text-xs font-bold tabular-nums ${
                      i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-700'
                    }`}>{i + 1}</span>
                  </td>

                  {/* Icon */}
                  <td className="px-2 py-3">
                    <div className="w-7 h-7 rounded-md overflow-hidden flex-shrink-0" style={{ background: 'var(--surface2)' }}>
                      <Image
                        src={row.iconUrl}
                        alt={row.name}
                        width={28}
                        height={28}
                        className="rounded-md"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                  </td>

                  {/* Name */}
                  <td className="px-3 py-3 font-medium text-slate-200 whitespace-nowrap max-w-[200px] truncate">
                    {row.name}
                  </td>

                  {/* Buy */}
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-mono text-slate-400">
                    {coins(buyP)}
                  </td>

                  {/* Sell */}
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-mono text-slate-400">
                    {coins(sellP)}
                  </td>

                  {/* Profit / item */}
                  <td className="px-3 py-3 text-right">
                    <span className={profit >= 0 ? 'badge-green' : 'badge-red'}>
                      {profit >= 0 ? '+' : ''}{coins(profit)}
                    </span>
                  </td>

                  {/* Margin */}
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-semibold text-emerald-400">
                    +{margin.toFixed(2)}%
                  </td>

                  {/* Total profit (only when budget/qty set) */}
                  {hasBudgetOrQty && (
                    <td className="px-3 py-3 text-right">
                      <div className="text-sm font-bold text-amber-400 tabular-nums">{coins(totalProfit)}</div>
                      <div className="text-[10px] text-slate-600 tabular-nums">{eqty}×</div>
                    </td>
                  )}

                  {/* Weekly volume */}
                  <td className="px-3 py-3 text-right tabular-nums text-xs font-mono text-slate-500">
                    {coins(row.weeklyVolume)}
                  </td>

                  {/* Fill speed */}
                  <td className="px-3 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="h-1.5 w-20 rounded-full overflow-hidden"
                          style={{ background: 'var(--border2)' }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${row.fillScore}%`, background: fillColor }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: fillColor }}>{fillLabel}</span>
                    </div>
                  </td>

                  {/* Copy */}
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => copyItem(row.name)}
                      className={`copy-btn ${copied === row.name ? 'copied' : ''}`}
                    >
                      {copied === row.name ? '✓ Done' : 'Copy'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--muted)', opacity: 0.45 }}>
        {mode === 'order'
          ? 'Order flip: post buy order 0.1 above top bid, sell order 0.1 below lowest ask. Profit after 1.25% sell tax.'
          : 'Instant flip: buy at lowest ask, immediately resell at highest bid. Profit after 1.25% sell tax.'
        }
        · Only items with ≥1k weekly volume shown. Fill speed = volume + order depth signal.
      </p>
    </div>
  )
}
