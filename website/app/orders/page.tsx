'use client'

import FlipFinder from '@/components/FlipFinder'
import Sidebar from '@/components/Sidebar'
import Ticker from '@/components/Ticker'

export default function OrdersPage() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-scroll">
        <Ticker />
        <FlipFinder />
      </main>
    </div>
  )
}
