import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hypixel SkyBlock Bazaar Flipper',
  description: 'Live Bazaar flip opportunities — instant flips & order flips',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
