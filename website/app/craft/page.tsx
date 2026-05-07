import type { Metadata } from 'next'
import CraftFlipPage from '@/components/CraftFlipPage'

export const metadata: Metadata = {
  title: 'Craft Flips',
  description: 'Buy bazaar ingredients, craft items, and sell for profit on Hypixel SkyBlock',
}

export default function CraftPage() {
  return <CraftFlipPage />
}
