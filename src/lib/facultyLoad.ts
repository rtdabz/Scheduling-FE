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
  /** Ignored: pro bono is no longer granted, it is whatever passes Overload. */
  probonoUnits?: number;
}

export const loadTierForUnits = (allowances: LoadAllowances, units: number): LoadTier => {
  const basic = Math.max(0, allowances.basicLoad);

  if (units <= basic) return 'basic';
  if (units <= basic + Math.max(0, allowances.overloadUnits)) return 'overload';

  // Once the paid allowances are used, every further unit is pro bono -- there
  // is no ceiling past which a load stops being assignable.
  return 'probono';
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
  overload: 'bg-red-50 text-red-600 border-red-200',
  probono: 'bg-slate-100 text-slate-600 border-slate-200',
  beyond_ceiling: 'bg-rose-50 text-rose-700 border-rose-200',
};

/**
 * Assigned units split across the three bands, for the segmented load bar:
 * how much of each band exists, how much is filled, and any excess past the
 * ceiling.
 */
export interface LoadBands {
  assignedUnits: number;
  maxUnits: number;
  deloadUnits: number;
  overloadUnits: number;
  /** Ignored: pro bono is no longer granted, it is whatever passes Overload. */
  probonoUnits?: number;
}

export const loadBandsOf = ({ assignedUnits, maxUnits, deloadUnits, overloadUnits }: LoadBands) => {
  const basic = basicLoadOf(maxUnits, deloadUnits);
  const overload = Math.max(0, overloadUnits);
  const assigned = Math.max(0, assignedUnits);
  // Pro bono is not an allowance anyone grants: it is exactly the units past
  // Basic Load and Overload, so the band is as large as what spills into it.
  const probonoFilled = Math.max(0, assigned - basic - overload);
  const probono = probonoFilled;
  /** Basic Load plus Overload, the most an instructor is expected to carry. */
  const ceiling = basic + overload;

  return {
    basic,
    overload,
    probono,
    assigned,
    ceiling,
    filled: {
      basic: Math.min(assigned, basic),
      overload: Math.min(Math.max(0, assigned - basic), overload),
      probono: probonoFilled,
    },
    /** Kept for callers; always 0 now that nothing is past a ceiling. */
    beyondCeiling: 0,
  };
};

/**
 * The load level an instructor has reached, like levelling up:
 * Regular -> Overload -> Pro Bono.
 *
 * An instructor starts at the first band they were actually granted, so one
 * with no Basic Load and only overload is "Overload" from their first unit,
 * and moves up as their assigned units fill each band. Once Basic Load and
 * Overload are used up, the instructor is Pro Bono.
 */
export type LoadLevel = 'regular' | 'overload' | 'probono';

export const loadLevelOf = (load: LoadBands): LoadLevel => {
  const bands = loadBandsOf(load);

  if (bands.assigned > bands.basic + bands.overload) return 'probono';
  if (bands.overload > 0 && bands.assigned > bands.basic) return 'overload';
  if (bands.basic > 0) return 'regular';
  if (bands.overload > 0) return 'overload';
  return 'regular';
};

export const LOAD_LEVELS: Record<LoadLevel, { label: string; color: string; dot: string }> = {
  regular: { label: 'Regular', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  overload: { label: 'Overload', color: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-400' },
  probono: { label: 'Pro Bono', color: 'text-slate-600 bg-slate-100 border-slate-200', dot: 'bg-slate-400' },
};

/** Shown in place of the load level for an inactive instructor (e.g. a deactivated account). */
export const UNAVAILABLE_STATUS = { label: 'Unavailable', color: 'text-gray-500 bg-gray-100 border-gray-200', dot: 'bg-gray-400' };
