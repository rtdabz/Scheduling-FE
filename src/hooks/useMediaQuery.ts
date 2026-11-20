import { useSyncExternalStore } from 'react'

/** Live `matchMedia` result; re-renders when the query starts or stops matching (resize, zoom). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/**
 * Viewport width from which the expanded 288px sidebar sits beside the page instead of over it.
 * Below this (compact laptops at 1024–1279px, tablets) pinning it would leave the page 700px or less,
 * so it collapses to the 64px rail and opens as an overlay. Keep in step with `SIDEBAR_PIN_QUERY` users.
 */
export const SIDEBAR_PIN_QUERY = '(min-width: 1280px)'
