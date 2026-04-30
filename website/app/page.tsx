'use client'

import BazaarTable from '@/components/BazaarTable'

export default function Home() {
  return (
    <main className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero header */}
      <header className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold tracking-widest uppercase text-amber-500/80 border border-amber-500/20 bg-amber-500/5 px-3 py-1 rounded-full">
            Hypixel SkyBlock
          </span>
        </div>
        <h1
          className="text-4xl sm:text-5xl font-bold tracking-tight glow-yellow"
          style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#fbbf24' }}
        >
          Bazaar Flipper
        </h1>
        <p className="mt-3 text-slate-400 text-sm max-w-lg leading-relaxed">
          Real-time flip opportunities pulled straight from the Hypixel API.
          Spot instant buy/sell spreads or patient order flips — refreshes every 60 s.
        </p>
      </header>

      <BazaarTable />

      <footer className="mt-10 text-xs text-slate-700 text-center pb-4">
        Not affiliated with Hypixel Inc. · Data from api.hypixel.net
      </footer>
    </main>
  )
}
