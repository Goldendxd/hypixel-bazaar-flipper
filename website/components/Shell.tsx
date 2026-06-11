'use client'

// App shell: sticky glass top bar (trading-terminal style) + centered content.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV: Array<{ href: string; ico: string; label: string }> = [
  { href: '/',              ico: '◧', label: 'Overview' },
  { href: '/orders',        ico: '⇅', label: 'Bazaar' },
  { href: '/craft',         ico: '⚒', label: 'Crafts' },
  { href: '/forge',         ico: '♨', label: 'Forge' },
  { href: '/fusion',        ico: '❖', label: 'Fusion' },
  { href: '/craft-weapons', ico: '⚔', label: 'Weapons' },
  { href: '/books',         ico: '✦', label: 'Books' },
  { href: '/pets',          ico: '♟', label: 'Kat' },
  { href: '/mayor',         ico: '♛', label: 'Mayor' },
]

function Clock() {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-GB'))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="mono" suppressHydrationWarning>{time ?? '--:--:--'}</span>
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  return (
    <>
      <header className="topbar">
        <Link href="/" className="tb-logo">
          <div className="coin-mark">GF</div>
          <div>
            <div className="tb-name">Golden<span>Flipper</span></div>
            <div className="tb-tag">trading intelligence</div>
          </div>
        </Link>

        <nav className="tb-nav">
          {NAV.map(({ href, ico, label }) => (
            <Link key={href} href={href} className={`tb-link${path === href ? ' on' : ''}`}>
              <span className="tb-ico">{ico}</span>
              {label}
            </Link>
          ))}
        </nav>

        <div className="tb-status">
          <span className="live-dot" />
          <span>LIVE</span>
          <span style={{ color: 'var(--faint)' }}>·</span>
          <Clock />
        </div>
      </header>

      <main className="content page-anim">
        {children}
      </main>
    </>
  )
}
