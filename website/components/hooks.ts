'use client'

import { useEffect, useRef, useState } from 'react'

// Debounce a fast-changing value (search inputs) to avoid re-filtering
// large lists on every keystroke.
export function useDebounced<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

// Returns true once the element scrolls into view (fires once, then unobserves).
export function useInView<T extends HTMLElement = HTMLDivElement>(rootMargin = '0px 0px -10% 0px') {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) { setInView(true); obs.disconnect() }
      },
      { rootMargin, threshold: 0.08 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [inView, rootMargin])
  return { ref, inView }
}
