'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SECTIONS: Array<{ label: string; items: Array<{ href: string; icon: string; label: string }> }> = [
  {
    label: 'Intelligence',
    items: [
      { href: '/',        icon: '◉',  label: 'Dashboard' },
    ],
  },
  {
    label: 'Markets',
    items: [
      { href: '/orders',         icon: '↕',  label: 'Order Flips'   },
      { href: '/craft',          icon: '⚒',  label: 'Craft Flips'   },
      { href: '/fusion',         icon: '⚗',  label: 'Fusion Flips'  },
      { href: '/forge',          icon: '🔥', label: 'Forge Flips'   },
      { href: '/pets',           icon: '🐾', label: 'Kat Flips'     },
      { href: '/books',          icon: '📖', label: 'Book Flips'    },
      { href: '/mayor',          icon: '👑', label: 'Mayor Flips'   },
      { href: '/craft-weapons',  icon: '⚔',  label: 'Weapon Crafts' },
    ],
  },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">◈</div>
        <div>
          <div className="sidebar-logo-text">SkyFlip</div>
          <div className="sidebar-logo-sub">Trading Terminal</div>
        </div>
      </div>

      {SECTIONS.map(section => (
        <div key={section.label} style={{ marginBottom: 10 }}>
          <div className="nav-section">{section.label}</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {section.items.map(({ href, icon, label }) => (
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
        </div>
      ))}

      <div style={{ marginTop: 'auto', padding: '14px 10px 0', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pulse-dot" />
          <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Live Feed Active
          </span>
        </div>
      </div>
    </aside>
  )
}
