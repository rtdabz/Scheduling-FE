/**
 * One colour per college, shared by the timeline blocks, the legend and the
 * detail modal so a department reads the same everywhere on the page.
 *
 * Class names are written out in full because Tailwind only generates classes
 * it can find verbatim in the source.
 */
export interface DepartmentTone {
  /** Block fill, border and text. */
  block: string;
  /** Solid left accent bar on a block. */
  accent: string;
  /** Legend dot. */
  swatch: string;
  /** Small solid chip, e.g. the department code in the detail modal. */
  badge: string;
}

const TONES: Record<string, DepartmentTone> = {
  IT: { block: 'bg-blue-50 border-blue-200 text-blue-950 hover:bg-blue-100', accent: 'bg-blue-600', swatch: 'bg-blue-600', badge: 'bg-blue-600 text-white' },
  AS: { block: 'bg-purple-50 border-purple-200 text-purple-950 hover:bg-purple-100', accent: 'bg-purple-600', swatch: 'bg-purple-600', badge: 'bg-purple-600 text-white' },
  EDUC: { block: 'bg-orange-50 border-orange-200 text-orange-950 hover:bg-orange-100', accent: 'bg-orange-500', swatch: 'bg-orange-500', badge: 'bg-orange-600 text-white' },
  BA: { block: 'bg-yellow-50 border-yellow-300 text-yellow-950 hover:bg-yellow-100', accent: 'bg-yellow-500', swatch: 'bg-yellow-500', badge: 'bg-yellow-600 text-white' },
  HM: { block: 'bg-lime-50 border-lime-300 text-lime-950 hover:bg-lime-100', accent: 'bg-lime-600', swatch: 'bg-lime-600', badge: 'bg-lime-700 text-white' },
  MID: { block: 'bg-emerald-50 border-emerald-200 text-emerald-950 hover:bg-emerald-100', accent: 'bg-emerald-600', swatch: 'bg-emerald-600', badge: 'bg-emerald-600 text-white' },
  CRIM: { block: 'bg-[#5A1220]/5 border-[#5A1220]/25 text-[#3d080c] hover:bg-[#5A1220]/10', accent: 'bg-[#5A1220]', swatch: 'bg-[#5A1220]', badge: 'bg-[#5A1220] text-white' },
  LIS: { block: 'bg-pink-50 border-pink-200 text-pink-950 hover:bg-pink-100', accent: 'bg-pink-600', swatch: 'bg-pink-600', badge: 'bg-pink-600 text-white' },
};

const FALLBACK: DepartmentTone = {
  block: 'bg-slate-50 border-slate-300 text-slate-900 hover:bg-slate-100',
  accent: 'bg-slate-500',
  swatch: 'bg-slate-500',
  badge: 'bg-slate-600 text-white',
};

/** Collapses the several codes a college has gone by onto one palette key. */
export const departmentKey = (code?: string | null, name?: string | null): string => {
  const normalizedCode = (code ?? '').trim().toUpperCase();
  const value = (name ?? code ?? '').toLowerCase();
  if (['IT', 'CIT', 'BSIT'].includes(normalizedCode) || value.includes('information technology') || value.includes('computing')) return 'IT';
  if (['AS', 'CAS'].includes(normalizedCode) || value.includes('arts and sciences')) return 'AS';
  if (['EDUC', 'CED', 'COE'].includes(normalizedCode) || value.includes('education')) return 'EDUC';
  if (['BA', 'CBA', 'CBM'].includes(normalizedCode) || value.includes('business')) return 'BA';
  if (['HM', 'CHM'].includes(normalizedCode) || value.includes('hospitality')) return 'HM';
  if (['CM', 'MID'].includes(normalizedCode) || value.includes('midwifery')) return 'MID';
  if (['CRIM', 'CCJ', 'CCJPS'].includes(normalizedCode) || value.includes('criminal')) return 'CRIM';
  if (['LIS', 'CLIS'].includes(normalizedCode) || value.includes('library')) return 'LIS';
  return '';
};

export const departmentTone = (code?: string | null, name?: string | null): DepartmentTone =>
  TONES[departmentKey(code, name)] ?? FALLBACK;
