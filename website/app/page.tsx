'use client'

import BazaarTable from '@/components/BazaarTable'

export default function Home() {
  return (
    <main className="max-w-screen-2xl mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-yellow-400 tracking-tight">
          Hypixel SkyBlock — Bazaar Flipper
        </h1>
        <p className="mt-1 text-slate-400 text-sm">
          Live data from the Hypixel API · refreshes every 60 s · no API key needed
        </p>
      </header>
      <BazaarTable />
    </main>
  )
}
