import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GoldenFlipper — SkyBlock Trading Intelligence',
  description:
    'Hypixel SkyBlock trading dashboard: tax-true bazaar arbitrage, forge dependency-chain costing, enchantment compounding math, weapon market analytics and mayor speculation.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Apply the saved theme before first paint so there's no light flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('gf_theme')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
