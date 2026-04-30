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

type SortKey = keyof FlipRow
type SortDir = 'asc' | 'desc'

// ── skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-t border-[var(--border)]">
      {[8, 24, 140, 70, 70, 80, 70, 80, 50].map((w, i) => (
        <td key={i} className="px-3 py-3">
          <div className="skeleton h-4 rounded" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

// ── stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card min-w-[120px]">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-bold text-slate-100 leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function BazaarTable() {
  const [rows, setRows] = useState<FlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(60)

  const [mode, setMode] = useState<'instant' | 'order'>('instant')
  const [minProfit, setMinProfit] = useState(0)
  const [minVolume, setMinVolume] = useState(0)
  const [search, setSearch] = useState('')

  const [sortKey, setSortKey] = useState<SortKey>('instantProfit')
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
    const refreshId = setInterval(load, 60_000)
    return () => clearInterval(refreshId)
  }, [load])

  // Countdown ticker
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

  const filtered = useMemo(() => {
    const profit = (r: FlipRow) => (mode === 'instant' ? r.instantProfit : r.orderProfit)
    return rows
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
    if (sortKey !== k) return <span className="ml-1 opacity-25">⇅</span>
    return <span className="ml-1 text-amber-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
  }

  function copyItem(name: string) {
    navigator.clipboard.writeText(name)
    setCopied(name)
    setTimeout(() => setCopied(null), 1500)
  }

  // Stats
  const topProfit = filtered[0] ? (mode === 'instant' ? filtered[0].instantProfit : filtered[0].orderProfit) : 0
  const avgMargin = filtered.length
    ? filtered.reduce((s, r) => s + (mode === 'instant' ? r.instantMargin : r.orderMargin), 0) / filtered.length
    : 0

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Mode + filters ── */}
      <div className="flex flex-wrap gap-3 mb-6 items-end">

        {/* Mode toggle */}
        <div
          className="flex rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border2)', background: 'var(--surface)' }}
        >
          {(['instant', 'order'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`mode-btn ${mode === m ? 'active' : 'inactive'}`}
            >
              {m} flip
            </button>
          ))}
        </div>

        {/* Min profit */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Min profit</span>
          <input
            type="number"
            min={0}
            value={minProfit}
            onChange={(e) => setMinProfit(Number(e.target.value))}
            className="filter-input w-32"
            placeholder="0"
          />
        </label>

        {/* Min volume */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Min wk volume</span>
          <input
            type="number"
            min={0}
            value={minVolume}
            onChange={(e) => setMinVolume(Number(e.target.value))}
            className="filter-input w-32"
            placeholder="0"
          />
        </label>

        {/* Search */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Search</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm select-none">⌕</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-input w-44 pl-7"
              placeholder="Enchanted…"
            />
          </div>
        </label>

        {/* Refresh btn */}
        <button
          onClick={load}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{ background: 'var(--surface)', border: '1px solid var(--border2)', color: 'var(--muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border2)')}
        >
          <span style={{ fontSize: 15 }}>↻</span>
          Refresh
        </button>
      </div>

      {/* ── Stat cards ── */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          <StatCard label="Items shown" value={String(filtered.length)} sub={`of ${rows.length} total`} />
          <StatCard label="Top profit" value={coins(topProfit)} sub="per flip" />
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
          <span>⚠</span>
          <span>{error}</span>
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
                className="px-3 py-3.5 text-left sortable text-[11px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort('name')}
              >
                Item <SortIcon k="name" />
              </th>
              <th
                className="px-3 py-3.5 text-right sortable text-[11px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort(mode === 'instant' ? 'instantBuyPrice' : 'buyOrder')}
              >
                Buy <SortIcon k={mode === 'instant' ? 'instantBuyPrice' : 'buyOrder'} />
              </th>
              <th
                className="px-3 py-3.5 text-right sortable text-[11px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort(mode === 'instant' ? 'instantSellPrice' : 'sellOrder')}
              >
                Sell <SortIcon k={mode === 'instant' ? 'instantSellPrice' : 'sellOrder'} />
              </th>
              <th
                className="px-3 py-3.5 text-right sortable text-[11px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort(profitKey)}
              >
                Profit <SortIcon k={profitKey} />
              </th>
              <th
                className="px-3 py-3.5 text-right sortable text-[11px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort(marginKey)}
              >
                Margin <SortIcon k={marginKey} />
              </th>
              <th
                className="px-3 py-3.5 text-right sortable text-[11px] font-semibold uppercase tracking-widest text-slate-500"
                onClick={() => toggleSort('weeklyVolume')}
              >
                Wk Vol <SortIcon k="weeklyVolume" />
              </th>
              <th className="px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-widest text-slate-600">
                Copy
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Skeleton */}
            {loading && Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)}

            {/* Empty */}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-20 text-center" style={{ color: 'var(--muted)' }}>
                  <div className="text-3xl mb-3 opacity-30">⊘</div>
                  <div className="font-medium">No flips match your filters</div>
                  <div className="text-xs mt-1 opacity-60">Try lowering min profit or clearing the search</div>
                </td>
              </tr>
            )}

            {/* Rows */}
            {filtered.map((row, i) => {
              const profit = mode === 'instant' ? row.instantProfit : row.orderProfit
              const margin = mode === 'instant' ? row.instantMargin : row.orderMargin
              const buyP = mode === 'instant' ? row.instantBuyPrice : row.buyOrder
              const sellP = mode === 'instant' ? row.instantSellPrice : row.sellOrder
              const isTop = i < 3
              const profitPos = profit > 0

              return (
                <tr
                  key={row.id}
                  className={`flip-row ${isTop ? 'top-row' : ''}`}
                >
                  {/* Rank */}
                  <td className="px-3 py-3">
                    <span
                      className={`row-rank text-xs font-bold tabular-nums ${
                        i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-amber-700' : 'text-slate-700'
                      }`}
                    >
                      {i + 1}
                    </span>
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
                  <td className="px-3 py-3 font-medium text-slate-200 whitespace-nowrap max-w-[220px] truncate">
                    {row.name}
                  </td>

                  {/* Buy */}
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400 text-xs font-mono">
                    {coins(buyP)}
                  </td>

                  {/* Sell */}
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400 text-xs font-mono">
                    {coins(sellP)}
                  </td>

                  {/* Profit badge */}
                  <td className="px-3 py-3 text-right">
                    <span className={profitPos ? 'badge-green' : 'badge-red'}>
                      {profitPos ? '+' : ''}{coins(profit)}
                    </span>
                  </td>

                  {/* Margin */}
                  <td className={`px-3 py-3 text-right tabular-nums text-xs font-semibold ${profitPos ? 'text-emerald-400' : 'text-red-400'}`}>
                    {profitPos ? '+' : ''}{margin.toFixed(2)}%
                  </td>

                  {/* Volume */}
                  <td className="px-3 py-3 text-right tabular-nums text-xs text-slate-500 font-mono">
                    {coins(row.weeklyVolume)}
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

      {/* Footer note */}
      <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--muted)', opacity: 0.5 }}>
        Prices include 1.25 % transaction tax.
        Instant flip: buy at lowest ask, sell at highest bid.
        Order flip: place orders at current bid / ask.
      </p>
    </div>
  )
}
