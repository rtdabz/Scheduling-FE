import type { LoadTier } from './overloadConfirmation';

export interface LoadAllowances {
  basicLoad: number;
  overloadUnits: number;
  probonoUnits?: number;
}

export const loadTierForUnits = (allowances: LoadAllowances, units: number): LoadTier => {
  const basic = Math.max(0, allowances.basicLoad);

  if (units <= basic) return 'basic';
  if (units <= basic + Math.max(0, allowances.overloadUnits)) return 'overload';

  return 'probono';
};

export const LOAD_TIER_LABELS: Record<LoadTier, string> = {
  basic: 'Basic Load',
  overload: 'Overload',
  probono: 'Pro-bono',
  beyond_ceiling: 'Beyond ceiling',
};

export const loadTierLabel = (tier: LoadTier): string => LOAD_TIER_LABELS[tier];

export const basicLoadOf = (maxUnits?: number | null, deloadUnits?: number | null): number =>
  Math.max(0, (maxUnits ?? 0) - (deloadUnits ?? 0));

export const LOAD_TIER_BADGE_CLASSES: Record<LoadTier, string> = {
  basic: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overload: 'bg-red-50 text-red-600 border-red-200',
  probono: 'bg-slate-100 text-slate-600 border-slate-200',
  beyond_ceiling: 'bg-rose-50 text-rose-700 border-rose-200',
};

export interface LoadBands {
  assignedUnits: number;
  maxUnits: number;
  deloadUnits: number;
  overloadUnits: number;
  probonoUnits?: number;
}

export const loadBandsOf = ({ assignedUnits, maxUnits, deloadUnits, overloadUnits }: LoadBands) => {
  const basic = basicLoadOf(maxUnits, deloadUnits);
  const overload = Math.max(0, overloadUnits);
  const assigned = Math.max(0, assignedUnits);
  const probonoFilled = Math.max(0, assigned - basic - overload);
  const probono = probonoFilled;
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
    beyondCeiling: 0,
  };
};

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

export const UNAVAILABLE_STATUS = { label: 'Unavailable', color: 'text-gray-500 bg-gray-100 border-gray-200', dot: 'bg-gray-400' };
