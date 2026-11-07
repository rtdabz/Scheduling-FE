import type { PlacementTerm } from './types';

/** Element ids of the Preview sheet's sections, shared by its year navigation and the issue links. */
export const yearSectionId = (year: number) => `import-sheet-year-${year}`;
export const termSectionId = (year: number, term: PlacementTerm) => `import-sheet-term-${year}-${term}`;
export const UNASSIGNED_SECTION_ID = 'import-sheet-unassigned';

/**
 * How a course row or term table looks while `highlight` marks it: a gold tint and outline that fades when the mark
 * is removed. Important so it shows over a row's error tint.
 */
export const HIGHLIGHT_CLASSES = 'transition-[background-color,outline-color] duration-700 outline outline-2 -outline-offset-2 outline-transparent data-[highlight]:!bg-accent/20 data-[highlight]:!outline-accent data-[highlight]:!-outline-offset-2';

const highlightTimers = new WeakMap<HTMLElement, number>();

/** Marks an element the reader was sent to, so it stands out among its neighbours, then lets the mark fade. */
export const highlight = (element: HTMLElement | null, ms = 2600) => {
  if (!element) return;
  window.clearTimeout(highlightTimers.get(element));
  element.setAttribute('data-highlight', 'true');
  highlightTimers.set(element, window.setTimeout(() => element.removeAttribute('data-highlight'), ms));
};

/** Scrolls a section into view and moves focus to it, so keyboard and screen reader users land there too. */
export const jumpTo = (id: string) => {
  const element = document.getElementById(id);
  if (!element) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  element.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  element.focus({ preventScroll: true });
};

/** Jumps to a term's table and highlights it. */
export const showTerm = (id: string) => {
  jumpTo(id);
  highlight(document.getElementById(id));
};
