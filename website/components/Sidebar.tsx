'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/',               icon: '↕',  label: 'Order Flips'   },
  { href: '/craft',          icon: '⚒',  label: 'Craft Flips'   },
  { href: '/fusion',         icon: '⚗',  label: 'Fusion Flips'  },
  { href: '/forge',          icon: '🔥', label: 'Forge Flips'   },
  { href: '/pets',           icon: '🐾', label: 'Kat Flips'     },
  { href: '/books',          icon: '📖', label: 'Book Flips'    },
  { href: '/mayor',          icon: '👑', label: 'Mayor Flips'   },
  { href: '/craft-weapons',  icon: '⚔',  label: 'Weapon Crafts' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">◈</div>
        <div>
          <div className="sidebar-logo-text">SkyFlip</div>
          <div className="sidebar-logo-sub">HYPIXEL BAZAAR</div>
        </div>
      </div>

      <div className="nav-section">Markets</div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {NAV.map(({ href, icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`nav-item${path === href ? ' active' : ''}`}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
