'use client'

// App shell: fixed left rail navigation + content area.
// Every page wraps its content in <Shell>.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV: Array<{ section: string; links: Array<{ href: string; ico: string; label: string }> }> = [
  {
    section: 'Market',
    links: [
      { href: '/',       ico: '◈', label: 'Overview' },
      { href: '/orders', ico: '⇅', label: 'Order Flips' },
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
      { href: '/books', ico: '✦', label: 'Book Combines' },
      { href: '/pets',  ico: '♟', label: 'Kat Flips' },
      { href: '/mayor', ico: '♛', label: 'Mayor Plays' },
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
    <div className="shell">
      <aside className="rail">
        <Link href="/" className="rail-logo">
          <div className="coin-mark">A</div>
          <div>
            <div className="rail-logo-name">AURUM</div>
            <div className="rail-logo-tag">profit terminal</div>
          </div>
        </Link>

        {NAV.map(group => (
          <div key={group.section}>
            <div className="rail-section">{group.section}</div>
            {group.links.map(({ href, ico, label }) => (
              <Link key={href} href={href} className={`rail-link${path === href ? ' on' : ''}`}>
                <span className="rl-ico">{ico}</span>
                {label}
              </Link>
            ))}
          </div>
        ))}

        <div className="rail-foot">
          <span className="live-dot" />
          <span>LIVE</span>
          <span style={{ color: 'var(--faint)' }}>·</span>
          <Clock />
        </div>
      </aside>

      <main className="content">
        <nav className="mobilebar">
          {allLinks.map(({ href, label }) => (
            <Link key={href} href={href} className={path === href ? 'on' : ''}>{label}</Link>
          ))}
        </nav>
        {children}
      </main>
    </div>
  )
}
