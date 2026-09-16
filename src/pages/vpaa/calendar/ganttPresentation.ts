import type { CSSProperties } from 'react';
import type { OverlapEntry } from './ganttLayout';

/** Visual constants and labels shared by the Gantt chart, its legend and the page. */

export type ZoomLevel = 'fit' | 'normal' | 'wide';
export type Density = 'comfortable' | 'compact';

/** Fixed zoom scales; fit uses the viewport, with this fallback before measurement. */
export const ZOOM_PX_PER_HOUR: Record<ZoomLevel, number> = { fit: 64, normal: 132, wide: 220 };

/** Diagonal hatch layered over the department tint to mark a laboratory session. */
export const LAB_PATTERN: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgba(15, 23, 42, 0.07) 0 5px, transparent 5px 11px)',
};

/** "Overlaps 2 classes on room, instructor" -- empty when the meeting overlaps nothing. */
export const overlapSummary = (entries: readonly OverlapEntry[] | undefined): string => {
  if (!entries?.length) return '';
  const kinds = new Set(entries.flatMap((entry) => entry.kinds));
  const noun = entries.length === 1 ? 'class' : 'classes';
  return `Overlaps ${entries.length} ${noun} on ${[...kinds].join(', ')}`;
};

/** Hatch for the part of the axis outside the standard scheduling hours. */
export const OFF_HOURS_PATTERN: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(45deg, rgba(100, 116, 139, 0.10) 0 4px, transparent 4px 9px)',
};
