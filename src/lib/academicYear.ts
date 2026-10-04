export interface AcademicYearParts {
  start: string;
  end: string;
}

const YEAR_PAIR = /^(\d{4})\s*-\s*(\d{4})$/;

export const sanitizeYearInput = (value: string): string => value.replace(/\D/g, '').slice(0, 4);

export const splitAcademicYear = (value?: string | null): AcademicYearParts => {
  const trimmed = (value ?? '').trim();
  const pair = YEAR_PAIR.exec(trimmed);
  if (pair) return { start: pair[1], end: pair[2] };

  const [first = '', second = ''] = trimmed.split('-');
  return { start: sanitizeYearInput(first), end: sanitizeYearInput(second) };
};

export const joinAcademicYear = ({ start, end }: AcademicYearParts): string => {
  const from = start.trim();
  const to = end.trim();
  return from && to ? `${from}-${to}` : '';
};

export const followingYear = (start: string): string => {
  const from = start.trim();
  return /^\d{4}$/.test(from) ? String(Number(from) + 1) : '';
};

export const isCompleteAcademicYear = (parts: AcademicYearParts): boolean =>
  /^\d{4}$/.test(parts.start.trim()) && /^\d{4}$/.test(parts.end.trim());

export const isValidAcademicYear = (parts: AcademicYearParts): boolean => {
  if (!isCompleteAcademicYear(parts)) return false;
  return Number(parts.end.trim()) === Number(parts.start.trim()) + 1;
};

export const academicYearError = (parts: AcademicYearParts): string | null => {
  const from = parts.start.trim();
  const to = parts.end.trim();
  if (!from && !to) return null;
  if (!/^\d{4}$/.test(from)) return 'Starting year must be four digits.';
  if (!/^\d{4}$/.test(to)) return 'End year must be four digits.';
  if (Number(to) !== Number(from) + 1) return `End year must be ${followingYear(from)}.`;
  return null;
};
