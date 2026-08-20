/**
 * Academic years are stored as one 'YYYY-YYYY' string, but are edited as a
 * starting year and an end year. These helpers move between the two forms and
 * keep the "must be consecutive" rule in one place.
 */
export interface AcademicYearParts {
  start: string;
  end: string;
}

const YEAR_PAIR = /^(\d{4})\s*-\s*(\d{4})$/;

/** Digits only, at most four -- what a year field may contain while typing. */
export const sanitizeYearInput = (value: string): string => value.replace(/\D/g, '').slice(0, 4);

/** Splits a stored value; a partial or malformed one yields what can be salvaged. */
export const splitAcademicYear = (value?: string | null): AcademicYearParts => {
  const trimmed = (value ?? '').trim();
  const pair = YEAR_PAIR.exec(trimmed);
  if (pair) return { start: pair[1], end: pair[2] };

  const [first = '', second = ''] = trimmed.split('-');
  return { start: sanitizeYearInput(first), end: sanitizeYearInput(second) };
};

/** '' until both halves are filled, so a half-typed year is never saved. */
export const joinAcademicYear = ({ start, end }: AcademicYearParts): string => {
  const from = start.trim();
  const to = end.trim();
  return from && to ? `${from}-${to}` : '';
};

/** The year that follows a complete starting year, for auto-filling the end. */
export const followingYear = (start: string): string => {
  const from = start.trim();
  return /^\d{4}$/.test(from) ? String(Number(from) + 1) : '';
};

export const isCompleteAcademicYear = (parts: AcademicYearParts): boolean =>
  /^\d{4}$/.test(parts.start.trim()) && /^\d{4}$/.test(parts.end.trim());

/** Valid means two four-digit years, the second one right after the first. */
export const isValidAcademicYear = (parts: AcademicYearParts): boolean => {
  if (!isCompleteAcademicYear(parts)) return false;
  return Number(parts.end.trim()) === Number(parts.start.trim()) + 1;
};

/** Why a pair is unusable, or null when it is fine. Empty reads as untouched. */
export const academicYearError = (parts: AcademicYearParts): string | null => {
  const from = parts.start.trim();
  const to = parts.end.trim();
  if (!from && !to) return null;
  if (!/^\d{4}$/.test(from)) return 'Starting year must be four digits.';
  if (!/^\d{4}$/.test(to)) return 'End year must be four digits.';
  if (Number(to) !== Number(from) + 1) return `End year must be ${followingYear(from)}.`;
  return null;
};
