'use client'

import { useState } from 'react'
import FlipFinder from '@/components/FlipFinder'
import Sidebar from '@/components/Sidebar'

export default function Home() {
  const [dismissed, setDismissed] = useState(false)

  return (
    <div className="app-shell" style={{ flexDirection: 'column' }}>
      {!dismissed && (
        <div className="warning-banner" style={{ position: 'relative' }}>
          <span>⚠</span>
          <span>Always verify prices in-game — watch for manipulation</span>
          <button
            onClick={() => setDismissed(true)}
            style={{
              position: 'absolute', right: 14,
              background: 'rgba(255,77,77,0.1)',
              border: '1px solid rgba(255,77,77,0.2)',
              color: 'var(--red)', borderRadius: 3, cursor: 'pointer',
              padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700,
            }}
          >DISMISS</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <main className="main-scroll">
          <FlipFinder />
        </main>
      </div>
    </div>
  )
}
