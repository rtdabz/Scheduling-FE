import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export type PreloadablePage<P> = LazyExoticComponent<ComponentType<P>> & {
  preload: () => void
}

type Preloadable = Pick<PreloadablePage<unknown>, 'preload'>

export const lazyPage = <P,>(factory: () => Promise<{ default: ComponentType<P> }>): PreloadablePage<P> => {
  const component = lazy(factory) as PreloadablePage<P>
  let started: Promise<unknown> | null = null

  component.preload = () => {
    started ??= factory().catch(() => {
      started = null
    })
  }

  return component
}

const pagesByPath = new Map<string, Preloadable>()

export const registerPagePrefetch = (entries: Array<[Preloadable, string[]]>): void => {
  for (const [page, paths] of entries) {
    for (const path of paths) pagesByPath.set(path, page)
  }
}

export const prefetchPage = (path: string | undefined): void => {
  if (!path) return
  pagesByPath.get(path)?.preload()
}
