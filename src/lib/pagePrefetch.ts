import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type PreloadablePage<P> = LazyExoticComponent<ComponentType<P>> & {
  /** Starts the chunk download without rendering the page. Safe to call often. */
  preload: () => void
}

/** What the registry needs of a page: only the ability to warm its chunk. */
type Preloadable = Pick<PreloadablePage<unknown>, 'preload'>

/**
 * React.lazy plus a preload hook. Every page is code-split, so the first click
 * on a menu item pays for its chunk; preloading on hover moves that cost into
 * the time the pointer is already travelling towards the link.
 */
export const lazyPage = <P,>(factory: () => Promise<{ default: ComponentType<P> }>): PreloadablePage<P> => {
  const component = lazy(factory) as PreloadablePage<P>
  let started: Promise<unknown> | null = null

  component.preload = () => {
    // The bundler caches the module, so a repeat call is free; the local guard
    // only keeps a failed prefetch from being retried on every hover.
    started ??= factory().catch(() => {
      started = null
    })
  }

  return component
}

const pagesByPath = new Map<string, Preloadable>()

/** Declared once, in App.tsx, beside the routes these paths belong to. */
export const registerPagePrefetch = (entries: Array<[Preloadable, string[]]>): void => {
  for (const [page, paths] of entries) {
    for (const path of paths) pagesByPath.set(path, page)
  }
}

/**
 * Warms the chunk behind a menu path. An unregistered path simply does
 * nothing: the page still loads on click, just without the head start.
 */
export const prefetchPage = (path: string | undefined): void => {
  if (!path) return
  pagesByPath.get(path)?.preload()
}
