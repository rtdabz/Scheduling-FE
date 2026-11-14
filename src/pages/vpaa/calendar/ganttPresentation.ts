import type { CSSProperties } from 'react';
import type { OverlapEntry } from './ganttLayout';

export type ZoomLevel = 'fit' | 'normal' | 'wide';
export type Density = 'comfortable' | 'compact';

export const ZOOM_PX_PER_HOUR: Record<ZoomLevel, number> = { fit: 64, normal: 132, wide: 220 };

export const LAB_PATTERN: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(26, 20, 16, 0.06) 0 1.5px, transparent 1.5px 7px)',
};

export const overlapSummary = (entries: readonly OverlapEntry[] | undefined): string => {
  if (!entries?.length) return '';
  const kinds = new Set(entries.flatMap((entry) => entry.kinds));
  const noun = entries.length === 1 ? 'class' : 'classes';
  return `Overlaps ${entries.length} ${noun} on ${[...kinds].join(', ')}`;
};

export const OFF_HOURS_PATTERN: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(45deg, rgba(122, 110, 103, 0.09) 0 1.5px, transparent 1.5px 8px)',
};
