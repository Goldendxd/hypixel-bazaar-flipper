'use client'

import { useState } from 'react'
import FlipFinder from '@/components/FlipFinder'

export default function Home() {
  const [dismissed, setDismissed] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Warning banner */}
      {!dismissed && (
        <div style={{
          background: '#c0392b',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '10px 16px',
          fontSize: '0.82rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
          flexShrink: 0,
          position: 'relative',
        }}>
          <span>⚠️</span>
          <span>ALWAYS DOUBLE CHECK THE INGAME PRICES FOR PRICE MANIPULATION AND IF THEY ARE UP TO DATE</span>
          <button
            onClick={() => setDismissed(true)}
            style={{
              position: 'absolute', right: 12,
              background: 'rgba(255,255,255,0.2)', border: 'none',
              color: '#fff', borderRadius: 4, cursor: 'pointer',
              padding: '2px 8px', fontSize: '0.85rem',
            }}
          >✕</button>
        </div>
      )}

      {/* App shell: sidebar + main */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{
          width: 220,
          background: 'var(--sidebar)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 12px',
          gap: 4,
          flexShrink: 0,
        }}>
          {/* Logo */}
          <div style={{ padding: '4px 8px 20px', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>💎</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#8ab4e8' }}>Flip Finder</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--muted)', marginTop: 1 }}>HYPIXEL SKYBLOCK</div>
              </div>
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="nav-item active">
              <span style={{ fontSize: 16 }}>📈</span>
              Flips
            </div>
            <div className="nav-item">
              <span style={{ fontSize: 16 }}>⭐</span>
              Whitelist
            </div>
            <div className="nav-item">
              <span style={{ fontSize: 16 }}>🚫</span>
              Blacklist
            </div>
            <div className="nav-item">
              <span style={{ fontSize: 16 }}>🧬</span>
              Mutations
            </div>
          </nav>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          <FlipFinder />
        </main>
      </div>
    </div>
  )
}
