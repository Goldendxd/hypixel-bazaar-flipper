import type { Metadata } from 'next'
import FusionFlipPage from '@/components/FusionFlipPage'

export const metadata: Metadata = {
  title: 'Fusion Flips',
  description: 'Multi-step compound crafts — chain recipes to minimize ingredient cost on Hypixel SkyBlock',
}

export default function FusionPage() {
  return <FusionFlipPage />
}
