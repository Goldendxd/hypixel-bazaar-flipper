'use client'

import { useState } from 'react'
import Link from 'next/link'
import FlipFinder from '@/components/FlipFinder'

export default function Home() {
  const [dismissed, setDismissed] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {!dismissed && (
        <div className="warning-banner">
          <span style={{ fontSize: 14 }}>⚠</span>
          <span>Always verify prices in-game — watch for manipulation</span>
          <button
            onClick={() => setDismissed(true)}
            style={{
              position: 'absolute', right: 14,
              background: 'rgba(248,113,113,0.15)',
              border: '1px solid rgba(248,113,113,0.25)',
              color: '#fca5a5', borderRadius: 6, cursor: 'pointer',
              padding: '3px 10px', fontSize: '0.75rem', fontWeight: 700,
              letterSpacing: '0.04em',
            }}
          >DISMISS</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside className="sidebar">
          {/* Logo */}
          <div style={{ padding: '6px 8px 20px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, #63b3ed22, #a78bfa22)',
                border: '1px solid rgba(99,179,237,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
              }}>💎</div>
              <div>
                <div className="logo-text">Hypixel Flipper</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginTop: 1, letterSpacing: '0.1em', fontWeight: 600 }}>SKYBLOCK BAZAAR</div>
              </div>
            </div>
          </div>

          <div style={{ fontSize: '0.6rem', color: 'var(--muted)', letterSpacing: '0.12em', fontWeight: 700, padding: '0 14px', marginBottom: 6, textTransform: 'uppercase' }}>Markets</div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Link href="/" className="nav-item active" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 15 }}>📈</span>
              Order Flips
            </Link>
            <Link href="/craft" className="nav-item" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 15 }}>🪓</span>
              Craft Flips
            </Link>
            <Link href="/fusion" className="nav-item" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 15 }}>🧬</span>
              Fusion Flips
            </Link>
            <Link href="/forge" className="nav-item" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 15 }}>🔨</span>
              Forge Flips
            </Link>
          </nav>

          {/* Bottom info */}
          <div style={{ marginTop: 'auto', padding: '0 8px' }}>
            <div style={{
              background: 'rgba(16,245,160,0.05)',
              border: '1px solid rgba(16,245,160,0.12)',
              borderRadius: 10, padding: '10px 12px',
            }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--green)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 4 }}>LIVE DATA</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.5 }}>Refreshes every 60s from Hypixel API</div>
            </div>
          </div>
        </aside>

        <main className="main-scroll">
          <FlipFinder />
        </main>
      </div>
    </div>
  )
}
