import type { Metadata } from 'next'
import StrategyPage from '@/components/StrategyPage'

export const metadata: Metadata = {
  title: 'Craft Flips',
  description: 'Hypixel craft flip rankings built from live bazaar data',
}

export default function CraftPage() {
  return (
    <StrategyPage
      config={{
        title: 'Craft Flips',
        subtitle: 'Craft-flip rankings prioritize items with strong weekly volume, healthy fill score, and consistent spread.',
        accent: '#f4c430',
        navLabel: 'Craft page',
        navEmoji: '🪓',
        activePath: '/craft',
        strategy: 'craft',
      }}
    />
  )
}
