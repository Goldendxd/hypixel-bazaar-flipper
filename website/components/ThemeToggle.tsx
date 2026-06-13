'use client'

import { useEffect, useState } from 'react'

// Reads the theme that the no-flash inline script (in layout.tsx) already
// applied to <html data-theme>, then lets the user flip + persist it.
export default function ThemeToggle() {
  const [dark, setDark] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.getAttribute('data-theme') === 'dark')
    setReady(true)
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    const root = document.documentElement
    if (next) root.setAttribute('data-theme', 'dark')
    else root.removeAttribute('data-theme')
    try { localStorage.setItem('gf_theme', next ? 'dark' : 'light') } catch { /* private mode */ }
  }

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle dark mode"
      suppressHydrationWarning
    >
      <span className="theme-toggle-track">
        <span className="theme-toggle-knob">
          {ready && (dark
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
          )}
        </span>
      </span>
    </button>
  )
}
