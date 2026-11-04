import type { NoteRun } from '../../types/curriculum';
import type { NoteFlag, Provenance, SourceNote } from './types';

/** One character of source text with the colour it was printed in (null: none or unknown). */
export interface NoteChar {
  ch: string;
  color: string | null;
}

/** How much colour the source format can tell us. CSV has none; mammoth/read-excel-file drop it. */
export type ColorSupport = 'read' | 'none' | 'unknown';

/** Lines that open a note: "Note", "NB", "Reminder", "Important", or a footnote mark. */
export const NOTE_START = /^(notes?\b|n\.?\s?b\.?(?=[\s:])|reminders?\b|important\b|[*†‡])/i;

/**
 * Form furniture printed at the foot of curriculum sheets: bare labels, optionally followed by blanks to fill.
 * Only whole labels match, so a sentence such as "Approved by the Board, 2020." is never skipped.
 */
export const FORM_FURNITURE = /^(evaluation details|evaluators?|school year|date|signature|prepared by|approved by|noted by|checked by|recommending approval|registrar)\s*[:._\s]*$/i;

export const DEFAULT_TEXT_COLOR = '#000000';

const HEX = /^#[0-9a-f]{6}$/i;

/** A colour safe to render, or null: never passes document-supplied CSS through. */
export const safeColor = (color: string | null | undefined): string | null => (color && HEX.test(color) ? color.toUpperCase() : null);

/** Display text the server accepts for a source note: only leading form blanks go, then surrounding space. */
export const noteDisplay = (source: string): string => source.replace(/^[\s_]+/u, '').trim();

const codePoints = (text: string) => [...text];

const mergeRuns = (chars: NoteChar[]): NoteRun[] => {
  const runs: NoteRun[] = [];
  for (const { color } of chars) {
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.length += 1;
    else runs.push({ length: 1, color });
  }
  return runs;
};

/**
 * Builds a note from its source lines. Lines join with line breaks, exactly as laid out; the display text
 * drops only leading form blanks and surrounding whitespace, and the colour runs follow those characters.
 */
export const buildNote = (id: string, lines: NoteChar[][], provenance: Provenance | null, scope: SourceNote['scope'], support: ColorSupport): SourceNote => {
  const chars: NoteChar[] = lines.flatMap((line, index) => (index === 0 ? line : [{ ch: '\n', color: line[0]?.color ?? null }, ...line]));
  const source = chars.map((char) => char.ch).join('');
  let start = 0;
  while (start < chars.length && /[\s_]/u.test(chars[start].ch)) start += 1;
  let end = chars.length;
  while (end > start && /\s/u.test(chars[end - 1].ch)) end -= 1;
  const kept = chars.slice(start, end).map((char) => ({ ch: char.ch, color: support === 'read' ? safeColor(char.color) : null }));
  const flags: NoteFlag[] = support === 'unknown' || (support === 'read' && kept.some((char) => char.color === null && char.ch.trim() !== '')) ? ['color_unknown'] : [];
  return { id, source_text: source, text: kept.map((char) => char.ch).join(''), runs: mergeRuns(kept), scope, provenance, flags };
};

/** A note from plain text lines, for formats that carry no colour per character. */
export const plainNote = (id: string, lines: string[], provenance: Provenance | null, scope: SourceNote['scope'], support: Exclude<ColorSupport, 'read'>): SourceNote =>
  buildNote(id, lines.map((line) => codePoints(line).map((ch) => ({ ch, color: null }))), provenance, scope, support);

/** Splits note text into coloured segments for rendering, following the runs' code-point lengths. */
export const noteSegments = (note: { text: string; runs: NoteRun[] }): { text: string; color: string | null }[] => {
  const chars = codePoints(note.text);
  const segments: { text: string; color: string | null }[] = [];
  let offset = 0;
  for (const run of note.runs) {
    if (offset >= chars.length) break;
    segments.push({ text: chars.slice(offset, offset + run.length).join(''), color: safeColor(run.color) });
    offset += run.length;
  }
  // Text the runs do not cover keeps the default colour rather than disappearing.
  if (offset < chars.length) segments.push({ text: chars.slice(offset).join(''), color: null });
  return segments;
};

const YEAR_NAMES = ['First Year', 'Second Year', 'Third Year', 'Fourth Year'];
const TERM_NAMES = ['First Semester', 'Second Semester', 'Summer'];

type ScopedNote = { scope: { level: string; year_level?: number; semester?: number; course_id?: number; row_id?: string } };

/** Where a note is shown, in words. Course notes name their course when the caller knows it. */
export const noteScopeLabel = (scope: ScopedNote['scope'], courseLabel?: string | null): string => {
  if (scope.level === 'year' && scope.year_level) return YEAR_NAMES[scope.year_level - 1] ?? `Year ${scope.year_level}`;
  if (scope.level === 'term' && scope.year_level && scope.semester) return `${YEAR_NAMES[scope.year_level - 1] ?? `Year ${scope.year_level}`}, ${TERM_NAMES[scope.semester - 1] ?? `Term ${scope.semester}`}`;
  if (scope.level === 'course') return courseLabel ? `Course ${courseLabel}` : 'A course';
  return 'Whole curriculum';
};

/**
 * Notes that belong with one year and term: the year's own notes, that term's notes, and notes on courses
 * shown there (by course id for saved curricula, row id for drafts). Whole-curriculum notes are shown apart.
 */
export const notesForTerm = <T extends ScopedNote>(notes: T[], year: number, semester: number, courseKeys: Set<number | string>): T[] => notes.filter(({ scope }) => (
  (scope.level === 'year' && scope.year_level === year)
  || (scope.level === 'term' && scope.year_level === year && scope.semester === semester)
  || (scope.level === 'course' && (courseKeys.has(scope.course_id as number) || courseKeys.has(scope.row_id as string)))
));
