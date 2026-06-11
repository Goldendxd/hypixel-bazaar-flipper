'use client'

import FlipFinder from '@/components/FlipFinder'
import Shell from '@/components/Shell'
import Ticker from '@/components/Ticker'

export default function OrdersPage() {
  return (
    <Shell>
      <Ticker />
      <FlipFinder />
    </Shell>
  )
}
