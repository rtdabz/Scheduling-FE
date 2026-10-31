import type { PlacementTerm } from './types';

export const TERM_LABELS: Record<PlacementTerm, string> = {
  1: 'First Semester',
  2: 'Second Semester',
  3: 'Summer',
};

export const YEAR_LABELS: Record<number, string> = {
  1: 'First Year',
  2: 'Second Year',
  3: 'Third Year',
  4: 'Fourth Year',
};

/** Matching key only: trims, collapses whitespace, uppercases. The original string is always kept separately. */
export const normalizeCode = (code: string): string => code.replace(/\s+/g, ' ').trim().toUpperCase();

export const compactCode = (code: string): string => normalizeCode(code).replace(/\s+/g, '');

/** Collapses `S U M M E R` style spacing for heading recognition only. */
export const collapseHeading = (text: string): string => text.replace(/[\s_]+/g, '').toUpperCase();

const YEAR_WORDS: Record<string, number> = {
  FIRST: 1, '1ST': 1, ONE: 1,
  SECOND: 2, '2ND': 2, TWO: 2,
  THIRD: 3, '3RD': 3, THREE: 3,
  FOURTH: 4, '4TH': 4, FOUR: 4,
};

export const yearHeading = (text: string): number | null => {
  const collapsed = collapseHeading(text);
  const match = collapsed.match(/^(FIRST|SECOND|THIRD|FOURTH|1ST|2ND|3RD|4TH)YEAR(LEVEL)?$/);
  return match ? YEAR_WORDS[match[1]] : null;
};

export const isSummerHeading = (text: string): boolean => /^(SUMMER|MIDYEAR|SUMMERTERM)$/.test(collapseHeading(text));

export const parseYearLevel = (value: unknown): number | null => {
  const text = String(value ?? '').trim();
  if (text === '') return null;
  if (/^[1-4]$/.test(text)) return Number(text);
  const collapsed = collapseHeading(text).replace(/YEAR(LEVEL)?$/, '');
  return YEAR_WORDS[collapsed] ?? null;
};

/** Reads a term label; never infers a term from position, code, or the active semester. */
export const parseTerm = (value: unknown): PlacementTerm | null => {
  const text = collapseHeading(String(value ?? ''));
  if (text === '') return null;
  if (/^(1|1ST|FIRST)(SEM|SEMESTER|TERM)?$/.test(text)) return 1;
  if (/^(2|2ND|SECOND)(SEM|SEMESTER|TERM)?$/.test(text)) return 2;
  if (/^(3|SUMMER|SUMMERTERM|MIDYEAR)$/.test(text)) return 3;
  return null;
};

export const termOf = (text: string): PlacementTerm | null => {
  const collapsed = collapseHeading(text);
  if (/^(FIRST|1ST)SEM(ESTER)?$/.test(collapsed)) return 1;
  if (/^(SECOND|2ND)SEM(ESTER)?$/.test(collapsed)) return 2;
  if (/^SUMMER(TERM)?$/.test(collapsed)) return 3;
  return null;
};

/** Strict numeric cell parse: blank is null, anything that is not a plain number is NaN. */
export const parseCredit = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  const text = String(value).trim();
  if (text === '') return null;
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : Number.NaN;
};

/** Underscore runs are fill-in blanks on the printed form, not part of the course code. */
export const stripFormBlanks = (text: string): string => text.replace(/^[\s_]+/, '').replace(/\s+/g, ' ').trim();

/**
 * Flags look-alike characters without changing them: a digit inside the letter prefix (`I1 125`)
 * or a stray lowercase letter in an otherwise capitalized word (`FITt`, `FiIT`).
 */
export const isSuspiciousCode = (code: string): boolean => {
  const words = code.trim().split(/\s+/);
  if (words.length > 1 && /[A-Za-z]/.test(words[0]) && /\d/.test(words[0]) && /^\d+$/.test(words[words.length - 1])) return true;
  return words.some((word) => {
    const upper = (word.match(/[A-Z]/g) ?? []).length;
    return upper >= 2 && /[a-z]/.test(word);
  });
};

export const editDistance = (a: string, b: string): number => {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
};

export const termOrder = (year: number, term: number): number => year * 10 + term;
