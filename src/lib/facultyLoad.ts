export type LoadTier = 'basic' | 'overload' | 'beyond_ceiling';

export interface LoadAllowances {
  basicLoad: number;
  overloadUnits: number;
}

export const loadTierForUnits = (allowances: LoadAllowances, units: number): LoadTier => {
  const basic = Math.max(0, allowances.basicLoad);

  if (units <= basic) return 'basic';
  if (units <= basic + Math.max(0, allowances.overloadUnits)) return 'overload';

  return 'beyond_ceiling';
};

export const LOAD_TIER_LABELS: Record<LoadTier, string> = {
  basic: 'Basic Load',
  overload: 'Overload',
  beyond_ceiling: 'Over limit',
};

export const loadTierLabel = (tier: LoadTier): string => LOAD_TIER_LABELS[tier];

export const basicLoadOf = (maxUnits?: number | null, deloadUnits?: number | null): number =>
  Math.max(0, (maxUnits ?? 0) - (deloadUnits ?? 0));

export const LOAD_TIER_BADGE_CLASSES: Record<LoadTier, string> = {
  basic: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overload: 'bg-red-50 text-red-600 border-red-200',
  beyond_ceiling: 'bg-rose-50 text-rose-700 border-rose-200',
};

export interface LoadBands {
  assignedUnits: number;
  maxUnits: number;
  deloadUnits: number;
  overloadUnits: number;
}

export const loadBandsOf = ({ assignedUnits, maxUnits, deloadUnits, overloadUnits }: LoadBands) => {
  const basic = basicLoadOf(maxUnits, deloadUnits);
  const overload = Math.max(0, overloadUnits);
  const assigned = Math.max(0, assignedUnits);
  const ceiling = basic + overload;
  const beyondCeiling = Math.max(0, assigned - ceiling);

  return {
    basic,
    overload,
    beyondCeiling,
    assigned,
    ceiling,
    filled: {
      basic: Math.min(assigned, basic),
      overload: Math.min(Math.max(0, assigned - basic), overload),
    },
  };
};

export type LoadLevel = 'regular' | 'overload' | 'over_limit';

export const loadLevelOf = (load: LoadBands): LoadLevel => {
  const bands = loadBandsOf(load);

  if (bands.assigned > bands.ceiling) return 'over_limit';
  if (bands.overload > 0 && bands.assigned > bands.basic) return 'overload';
  if (bands.basic > 0) return 'regular';
  if (bands.overload > 0) return 'overload';
  return 'regular';
};

export const LOAD_LEVELS: Record<LoadLevel, { label: string; color: string; dot: string }> = {
  regular: { label: 'Regular', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  overload: { label: 'Overload', color: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-400' },
  over_limit: { label: 'Over Limit', color: 'text-rose-700 bg-rose-50 border-rose-200', dot: 'bg-rose-500' },
};

export const UNAVAILABLE_STATUS = { label: 'Unavailable', color: 'text-gray-500 bg-gray-100 border-gray-200', dot: 'bg-gray-400' };
