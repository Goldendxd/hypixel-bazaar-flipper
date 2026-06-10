'use client'

// Renders the terminal top navigation bar.
// Kept as "Sidebar" so every existing page picks up the new layout unchanged.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV = [
  { href: '/',               icon: '◉',  label: 'Dashboard'  },
  { href: '/orders',         icon: '↕',  label: 'Orders'     },
  { href: '/craft',          icon: '⚒',  label: 'Craft'      },
  { href: '/fusion',         icon: '⚗',  label: 'Fusion'     },
  { href: '/forge',          icon: '🔥', label: 'Forge'      },
  { href: '/pets',           icon: '🐾', label: 'Pets'       },
  { href: '/books',          icon: '📖', label: 'Books'      },
  { href: '/mayor',          icon: '👑', label: 'Mayor'      },
  { href: '/craft-weapons',  icon: '⚔',  label: 'Weapons'    },
]

function Clock() {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-GB'))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="mono">{time ?? '--:--:--'}</span>
}

export default function Sidebar() {
  const path = usePathname()
  return (
    <header className="topnav">
      <Link href="/" className="topnav-logo">
        <div className="topnav-logo-mark">◈</div>
        <div className="topnav-logo-text">Sky<span>Flip</span></div>
      </Link>

      <nav className="topnav-links">
        {NAV.map(({ href, icon, label }) => (
          <Link key={href} href={href} className={`topnav-link${path === href ? ' active' : ''}`}>
            <span className="nav-icon">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="topnav-status">
        <span className="pulse-dot" />
        <span>LIVE</span>
        <span style={{ color: 'var(--muted)' }}>·</span>
        <Clock />
      </div>
    </header>
  )
}
