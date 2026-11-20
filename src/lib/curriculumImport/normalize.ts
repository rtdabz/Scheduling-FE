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
  FIRST: 1, '1ST': 1, ONE: 1, '1': 1, I: 1,
  SECOND: 2, '2ND': 2, TWO: 2, '2': 2, II: 2,
  THIRD: 3, '3RD': 3, THREE: 3, '3': 3, III: 3,
  FOURTH: 4, '4TH': 4, FOUR: 4, '4': 4, IV: 4,
};

/** `FIRST YEAR`, `F I R S T  Y E A R`, `1st Year Level`, `Year 1`, `Year II`, `I Year`. */
export const yearHeading = (text: string): number | null => {
  const collapsed = collapseHeading(text).replace(/[.:]+$/, '');
  const before = collapsed.match(/^(FIRST|SECOND|THIRD|FOURTH|1ST|2ND|3RD|4TH|IV|III|II|I|[1-4])-?YEAR(LEVEL)?$/);
  if (before) return YEAR_WORDS[before[1]];
  const after = collapsed.match(/^YEAR(LEVEL)?-?(IV|III|II|I|[1-4])$/);
  return after ? YEAR_WORDS[after[2]] : null;
};

export const isSummerHeading = (text: string): boolean => /^(SUMMER|MIDYEAR|MID-YEAR|SUMMERTERM|MIDYEARTERM|SUMMERCLASS)$/.test(collapseHeading(text).replace(/[.:]+$/, ''));

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

/** A term label: `First Semester`, `1st Sem.`, `First Term`, `Semester 2`, `2nd Trimester`, `Summer`, `Midyear`. */
export const termOf = (text: string): PlacementTerm | null => {
  const collapsed = collapseHeading(text).replace(/[.:]+$/, '');
  const word = '(SEM|SEMESTER|TERM|TRIMESTER|TRI)';
  if (new RegExp(`^(FIRST|1ST)${word}$|^${word}-?(1|I|ONE)$`).test(collapsed)) return 1;
  if (new RegExp(`^(SECOND|2ND)${word}$|^${word}-?(2|II|TWO)$`).test(collapsed)) return 2;
  if (/^(SUMMER|SUMMERTERM|SUMMERCLASS|MIDYEAR|MIDYEARTERM|MID-YEAR)$/.test(collapsed)) return 3;
  return null;
};

/**
 * Departments label the course-code column differently: `Course Code`, `Subj Code`, `Subject Code`, `Subjects`,
 * `Course No.`, `Code`. Matching is on the whole cell, so a title column such as `Descriptive Title` never matches.
 */
export const isCodeHeader = (text: string): boolean => {
  const key = text.toLowerCase().replace(/[^a-z#]/g, '');
  return /^(course|courses|subj|subject|subjects)?(code|codes|no|number|num|#)$/.test(key) || /^(subj|subject|subjects|course|courses)$/.test(key);
};

/** Lecture, laboratory, and total credit headers, in the wordings departments use. */
export const isLecHeader = (text: string): boolean => /^lec(t|ture)?\.?(\s*(units?|hrs?|hours?|credits?))?$/i.test(text.trim());
export const isLabHeader = (text: string): boolean => /^lab(oratory)?\.?(\s*(units?|hrs?|hours?|credits?))?$/i.test(text.trim());
export const isTotalHeader = (text: string): boolean =>
  /^(tu|t\.u\.?|units?|total|total\s*units?|credits?|credit\s*units?|total\s*credits?|no\.?\s*of\s*units)$/i.test(text.trim());
export const isPrerequisiteHeader = (text: string): boolean => /^(pre-?req|pre-?requisites?|requisites?)/i.test(text.trim());

/** A cell that reads as a course code: a letter prefix and a number (`IT 101`, `GEC 01`, `EDUC101`, `PE 1`). */
export const looksLikeCode = (text: string): boolean => /^[A-Za-z][A-Za-z.&-]{0,9}\s*-?\s*\d{1,4}[A-Za-z]?(\s*[A-Za-z0-9]{1,3})?$/.test(text.trim());

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
