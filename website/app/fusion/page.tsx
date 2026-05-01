import type { Metadata } from 'next'
import StrategyPage from '@/components/StrategyPage'

export const metadata: Metadata = {
  title: 'Fusion Flips',
  description: 'Hypixel fusion flip rankings built from live bazaar data',
}

export default function FusionPage() {
  return (
    <StrategyPage
      config={{
        title: 'Fusion Flips',
        subtitle: 'Fusion-flip rankings prioritize higher margins and efficient capital use while keeping liquidity in view.',
        accent: '#7c5cbf',
        navLabel: 'Fusion page',
        navEmoji: '🧬',
        activePath: '/fusion',
        strategy: 'fusion',
      }}
    />
  )
}
