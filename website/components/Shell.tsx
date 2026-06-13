'use client'

// App shell: white left sidebar (SaaS style) + soft-gray content canvas.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

const NAV: Array<{ section: string; links: Array<{ href: string; ico: string; label: string }> }> = [
  {
    section: 'Market',
    links: [
      { href: '/',       ico: '◧', label: 'Dashboard' },
      { href: '/orders', ico: '⇅', label: 'Bazaar Spreads' },
    ],
  },
  {
    section: 'Production',
    links: [
      { href: '/craft',         ico: '⚒', label: 'Craft Flips' },
      { href: '/forge',         ico: '♨', label: 'Forge' },
      { href: '/fusion',        ico: '❖', label: 'Shard Fusion' },
      { href: '/craft-weapons', ico: '⚔', label: 'Weapons' },
    ],
  },
  {
    section: 'Speculation',
    links: [
      { href: '/books',     ico: '✦', label: 'Book Combines' },
      { href: '/pets',      ico: '♟', label: 'Kat Flips' },
      { href: '/pet-level', ico: '♞', label: 'Pet Leveling' },
      { href: '/mayor',     ico: '♛', label: 'Mayor Plays' },
    ],
  },
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
  const allLinks = NAV.flatMap(g => g.links)

  return (
    <>
      <aside className="side">
        <Link href="/" className="side-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="Golden Flipper" width={34} height={34} style={{ display: 'block', flexShrink: 0 }} />
          <div className="side-name">GoldenFlipper<span>_</span></div>
        </Link>
        <div className="side-toggle"><ThemeToggle /></div>

        {NAV.map(group => (
          <div key={group.section}>
            <div className="side-sect">{group.section}</div>
            {group.links.map(({ href, ico, label }) => (
              <Link key={href} href={href} className={`side-link${path === href ? ' on' : ''}`}>
                <span className="sl-ico">{ico}</span>
                {label}
              </Link>
            ))}
          </div>
        ))}

        <div className="side-foot">
          <span className="live-dot" />
          <span>LIVE</span>
          <span style={{ color: 'var(--faint)' }}>·</span>
          <Clock />
        </div>
      </aside>

      <main className="content page-anim">
        <nav className="mobilebar">
          {allLinks.map(({ href, label }) => (
            <Link key={href} href={href} className={path === href ? 'on' : ''}>{label}</Link>
          ))}
          <div style={{ marginLeft: 'auto', paddingLeft: 6 }}><ThemeToggle /></div>
        </nav>
        {children}
      </main>
    </>
  )
}
