'use client'

import { useEffect, useState } from 'react'

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
