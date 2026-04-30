'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import { fetchBazaarFlips, FlipRow } from '@/lib/api'

// ── helpers ──────────────────────────────────────────────────────────────────

function coins(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}

type SortKey = keyof FlipRow
type SortDir = 'asc' | 'desc'

// ── component ─────────────────────────────────────────────────────────────────

export default function BazaarTable() {
  const [rows, setRows] = useState<FlipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Filters
  const [mode, setMode] = useState<'instant' | 'order'>('instant')
  const [minProfit, setMinProfit] = useState(0)
  const [minVolume, setMinVolume] = useState(0)
  const [search, setSearch] = useState('')

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>('instantProfit')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Clipboard feedback
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchBazaarFlips()
      setRows(data)
      setLastUpdated(new Date())
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + 60 s auto-refresh
  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  // When mode switches, reset sort to the right profit column
  useEffect(() => {
    setSortKey(mode === 'instant' ? 'instantProfit' : 'orderProfit')
    setSortDir('desc')
  }, [mode])

  const profitKey: SortKey = mode === 'instant' ? 'instantProfit' : 'orderProfit'
  const marginKey: SortKey = mode === 'instant' ? 'instantMargin' : 'orderMargin'

  const filtered = useMemo(() => {
    const profit = (r: FlipRow) =>
      mode === 'instant' ? r.instantProfit : r.orderProfit

    return rows
      .filter((r) => profit(r) >= minProfit)
      .filter((r) => r.weeklyVolume >= minVolume)
      .filter((r) =>
        search ? r.name.toLowerCase().includes(search.toLowerCase()) : true
      )
      .sort((a, b) => {
        const av = a[sortKey] as number
        const bv = b[sortKey] as number
        return sortDir === 'desc' ? bv - av : av - bv
      })
  }, [rows, mode, minProfit, minVolume, search, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-slate-600 ml-1">↕</span>
    return (
      <span className="text-yellow-400 ml-1">
        {sortDir === 'desc' ? '↓' : '↑'}
      </span>
    )
  }

  function copyItem(name: string) {
    navigator.clipboard.writeText(name)
    setCopied(name)
    setTimeout(() => setCopied(null), 1500)
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5 items-end">
        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {(['instant', 'order'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                mode === m
                  ? 'bg-yellow-400 text-slate-900'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {m} flip
            </button>
          ))}
        </div>

        {/* Min profit */}
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Min profit (coins)
          <input
            type="number"
            min={0}
            value={minProfit}
            onChange={(e) => setMinProfit(Number(e.target.value))}
            className="w-36 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-yellow-500"
            placeholder="0"
          />
        </label>

        {/* Min weekly volume */}
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Min weekly volume
          <input
            type="number"
            min={0}
            value={minVolume}
            onChange={(e) => setMinVolume(Number(e.target.value))}
            className="w-36 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-yellow-500"
            placeholder="0"
          />
        </label>

        {/* Search */}
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Search item
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-yellow-500"
            placeholder="e.g. Enchanted…"
          />
        </label>

        {/* Refresh */}
        <button
          onClick={load}
          className="ml-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-sm text-slate-300 transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Status bar */}
      <div className="mb-3 text-xs text-slate-500 flex gap-4">
        {lastUpdated && <span>Updated: {lastUpdated.toLocaleTimeString()}</span>}
        <span>{filtered.length} items shown</span>
        {error && <span className="text-red-400">Error: {error}</span>}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800/80 text-slate-400 text-left">
              <th className="px-3 py-3 w-8">#</th>
              <th className="px-3 py-3 w-8"></th>
              <th
                className="px-3 py-3 cursor-pointer hover:text-slate-200 select-none"
                onClick={() => toggleSort('name')}
              >
                Item <SortArrow k="name" />
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-slate-200 select-none"
                onClick={() =>
                  toggleSort(
                    mode === 'instant' ? 'instantBuyPrice' : 'buyOrder'
                  )
                }
              >
                Buy <SortArrow k={mode === 'instant' ? 'instantBuyPrice' : 'buyOrder'} />
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-slate-200 select-none"
                onClick={() =>
                  toggleSort(
                    mode === 'instant' ? 'instantSellPrice' : 'sellOrder'
                  )
                }
              >
                Sell <SortArrow k={mode === 'instant' ? 'instantSellPrice' : 'sellOrder'} />
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-slate-200 select-none"
                onClick={() => toggleSort(profitKey)}
              >
                Profit <SortArrow k={profitKey} />
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-slate-200 select-none"
                onClick={() => toggleSort(marginKey)}
              >
                Margin % <SortArrow k={marginKey} />
              </th>
              <th
                className="px-3 py-3 text-right cursor-pointer hover:text-slate-200 select-none"
                onClick={() => toggleSort('weeklyVolume')}
              >
                Wk Volume <SortArrow k="weeklyVolume" />
              </th>
              <th className="px-3 py-3 text-center">Copy</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-500">
                  Loading Bazaar data…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-500">
                  No flips match your filters.
                </td>
              </tr>
            )}
            {filtered.map((row, i) => {
              const profit =
                mode === 'instant' ? row.instantProfit : row.orderProfit
              const margin =
                mode === 'instant' ? row.instantMargin : row.orderMargin
              const buyP =
                mode === 'instant' ? row.instantBuyPrice : row.buyOrder
              const sellP =
                mode === 'instant' ? row.instantSellPrice : row.sellOrder
              const profitColor =
                profit > 0 ? 'text-green-400' : 'text-red-400'

              return (
                <tr
                  key={row.id}
                  className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-3 py-2.5 text-slate-600">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <Image
                      src={row.iconUrl}
                      alt={row.name}
                      width={24}
                      height={24}
                      className="rounded-sm"
                      onError={(e) => {
                        // Fallback: hide broken icon
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-100 whitespace-nowrap">
                    {row.name}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300 tabular-nums">
                    {coins(buyP)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-300 tabular-nums">
                    {coins(sellP)}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${profitColor}`}>
                    {coins(profit)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${profitColor}`}>
                    {margin.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-400 tabular-nums">
                    {coins(row.weeklyVolume)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => copyItem(row.name)}
                      title="Copy item name"
                      className="px-2 py-1 rounded text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                    >
                      {copied === row.name ? '✓' : 'Copy'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-slate-600">
        Prices include 1.25% transaction tax. Instant flip: buy at lowest ask,
        sell at highest bid. Order flip: place orders at current bid/ask.
      </p>
    </div>
  )
}
