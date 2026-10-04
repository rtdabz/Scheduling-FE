import type { CSSProperties } from 'react';
import type { OverlapEntry } from './ganttLayout';

export type ZoomLevel = 'fit' | 'normal' | 'wide';
export type Density = 'comfortable' | 'compact';

export const ZOOM_PX_PER_HOUR: Record<ZoomLevel, number> = { fit: 64, normal: 132, wide: 220 };

export const LAB_PATTERN: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(15, 23, 42, 0.07) 0 5px, transparent 5px 11px)',
};

export const overlapSummary = (entries: readonly OverlapEntry[] | undefined): string => {
  if (!entries?.length) return '';
  const kinds = new Set(entries.flatMap((entry) => entry.kinds));
  const noun = entries.length === 1 ? 'class' : 'classes';
  return `Overlaps ${entries.length} ${noun} on ${[...kinds].join(', ')}`;
};

export const OFF_HOURS_PATTERN: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(45deg, rgba(100, 116, 139, 0.10) 0 4px, transparent 4px 9px)',
};
