/**
 * The load bands, for display only.
 *
 * Whether a prompt appears is decided entirely by the server — see
 * `overloadConfirmation.ts`. This exists so a picker can *label* an instructor
 * who is already in overload before the user commits, and its boundaries are
 * tested against the same edges as `SchedulingPolicy::facultyLoadTier()` so the
 * badge cannot quietly disagree with the gate.
 */

import type { LoadTier } from './overloadConfirmation';

export interface LoadAllowances {
  /** max_units - deload_units. */
  basicLoad: number;
  overloadUnits: number;
  probonoUnits: number;
}

export const loadTierForUnits = (allowances: LoadAllowances, units: number): LoadTier => {
  const basic = Math.max(0, allowances.basicLoad);

  if (units <= basic) return 'basic';
  if (units <= basic + Math.max(0, allowances.overloadUnits)) return 'overload';
  if (units <= basic + Math.max(0, allowances.overloadUnits) + Math.max(0, allowances.probonoUnits)) {
    return 'probono';
  }

  return 'beyond_ceiling';
};

export const LOAD_TIER_LABELS: Record<LoadTier, string> = {
  basic: 'Basic Load',
  overload: 'Overload',
  probono: 'Pro-bono',
  beyond_ceiling: 'Beyond ceiling',
};

export const loadTierLabel = (tier: LoadTier): string => LOAD_TIER_LABELS[tier];

/** Basic Load is the maximum an instructor was given, less whatever was deloaded. */
export const basicLoadOf = (maxUnits?: number | null, deloadUnits?: number | null): number =>
  Math.max(0, (maxUnits ?? 0) - (deloadUnits ?? 0));

/**
 * Tailwind classes per band, so the badge reads the same everywhere it appears.
 */
export const LOAD_TIER_BADGE_CLASSES: Record<LoadTier, string> = {
  basic: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overload: 'bg-amber-50 text-amber-700 border-amber-200',
  probono: 'bg-sky-50 text-sky-700 border-sky-200',
  beyond_ceiling: 'bg-rose-50 text-rose-700 border-rose-200',
};
