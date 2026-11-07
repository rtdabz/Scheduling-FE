import { compactCode, editDistance, isSuspiciousCode, normalizeCode, TERM_LABELS, termOrder, YEAR_LABELS } from './normalize';
import { plainNote } from './notes';
import { prerequisiteTokens, type KnownCode } from './prerequisites';
import type { DraftMetadata, DraftRow, DraftSource, Extraction, ImportDraft, PlacementTerm } from './types';

const finite = (value: number | null): number | null => (value === null || Number.isNaN(value) ? null : value);

const codeSuggestion = (code: string, candidates: string[]): string | null => {
  if (!isSuspiciousCode(code)) return null;
  const digits = code.match(/(\d+)\s*$/)?.[1];
  const compact = compactCode(code);
  const match = candidates.find((candidate) => candidate.match(/(\d+)\s*$/)?.[1] === digits
    && compactCode(candidate) !== compact
    && editDistance(compactCode(candidate), compact) <= 2);
  return match ? normalizeCode(match).replace(/^([A-Z/]+)(\d)/, '$1 $2') : null;
};

export const buildDraft = (extraction: Extraction, source: Omit<DraftSource, 'extractor_version' | 'format'>): ImportDraft => {
  const known: KnownCode[] = extraction.rows.map((row, index) => ({ row_id: `r${index + 1}`, code: row.source.code }));
  const knownCompact = new Set(known.map((entry) => compactCode(entry.code)));
  const unmatchedTokens = extraction.rows
    .flatMap((row) => (row.source.prerequisites ? prerequisiteTokens(row.source.prerequisites, known) : []))
    .filter((token) => !knownCompact.has(compactCode(token)));

  const rows: DraftRow[] = extraction.rows.map((row, index) => {
    return {
      row_id: `r${index + 1}`,
      year_level: row.year_level,
      semester: row.semester,
      code: row.source.code,
      title: row.source.title,
      lecture_units: finite(row.source.lec),
      lab_units: finite(row.source.lab),
      total_units: finite(row.source.tu),
      category: null,
      prerequisites: row.source.prerequisites,
      code_suggestion: codeSuggestion(row.source.code, unmatchedTokens),
      source: row.source,
    };
  });

  const detected = extraction.metadata;
  return {
    source: { ...source, format: extraction.format, extractor_version: extraction.extractor_version },
    metadata: {
      name: detected.name ?? '',
      program_id: null,
      effective_school_year: detected.effective_school_year ?? '',
      cmo_number: detected.cmo_number ?? '',
      cmo_series: detected.cmo_series === null ? '' : String(detected.cmo_series),
      description: '',
      notes: detected.notes,
    },
    detected,
    groups: extraction.groups,
    rows,
    // Older extractions carried notes as plain strings: kept with no colour or place, never invented ones.
    notes: extraction.notes ?? detected.notes.map((text, index) => plainNote(`n${index + 1}`, [text], null, { level: 'curriculum' }, 'none')),
    unread: extraction.unread ?? [],
    warnings: extraction.warnings,
  };
};

export interface LocalProblem {
  row_id: string | null;
  field: string;
  message: string;
}

/** Problems that make the draft unsendable. Everything else is the server's canonical validation. */
export const localProblems = (draft: ImportDraft): LocalProblem[] => {
  const problems: LocalProblem[] = [];
  if (draft.rows.length === 0) problems.push({ row_id: null, field: 'rows', message: 'The draft has no course rows. Choose another file or mapping.' });
  if (!draft.metadata.name.trim()) problems.push({ row_id: null, field: 'metadata.name', message: 'Enter the curriculum name.' });
  if (!draft.metadata.effective_school_year.trim()) problems.push({ row_id: null, field: 'metadata.effective_school_year', message: 'Enter the effective school year from the source.' });
  if (draft.metadata.cmo_series.trim() && !/^\d{4}$/.test(draft.metadata.cmo_series.trim())) {
    problems.push({ row_id: null, field: 'metadata.cmo_series', message: 'CMO series must be a four-digit year.' });
  }
  // The CMO pair names the import code; the server rejects half of it the same way.
  if (!draft.metadata.cmo_number.trim() !== !draft.metadata.cmo_series.trim()) {
    const missing = draft.metadata.cmo_number.trim() ? 'series' : 'number';
    problems.push({ row_id: null, field: `metadata.cmo_${missing}`, message: `Enter the CMO ${missing} too, or clear both CMO fields.` });
  }

  for (const row of draft.rows) {
    const label = row.code || row.row_id;
    if (row.year_level === null) problems.push({ row_id: row.row_id, field: 'year_level', message: `${label}: choose the year level.` });
    if (row.semester === null) problems.push({ row_id: row.row_id, field: 'semester', message: `${label}: choose the term.` });
    if (!row.code.trim()) problems.push({ row_id: row.row_id, field: 'code', message: `Row ${row.row_id}: enter the course code.` });
    if (!row.title.trim()) problems.push({ row_id: row.row_id, field: 'title', message: `${label}: enter the course title.` });
    for (const [field, value] of [['lecture_units', row.lecture_units], ['lab_units', row.lab_units], ['total_units', row.total_units]] as const) {
      if (value === null) problems.push({ row_id: row.row_id, field, message: `${label}: ${field.replace('_', ' ')} is blank. Enter the reviewed value; blank is not zero.` });
      else if (!Number.isInteger(value) || value < 0) problems.push({ row_id: row.row_id, field, message: `${label}: ${field.replace('_', ' ')} must be a whole number of credits.` });
    }
  }
  return problems;
};

/** A row counts toward a year/term only with a year the curriculum has and a known term. */
export const isPlaced = (row: Pick<DraftRow, 'year_level' | 'semester'>): row is DraftRow & { year_level: number; semester: PlacementTerm } =>
  row.year_level !== null && row.year_level in YEAR_LABELS && row.semester !== null && row.semester in TERM_LABELS;

/**
 * Local preview of the server's CMO-based import code (CMO-25-2015). Only the server assigns the code and its
 * collision suffix; null means the program/year fallback applies or the pair is incomplete.
 */
export const proposedImportCode = (metadata: Pick<DraftMetadata, 'cmo_number' | 'cmo_series'>): string | null => {
  const segment = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const number = segment(metadata.cmo_number);
  const series = metadata.cmo_series.trim();
  return number && /^\d{4}$/.test(series) ? `CMO-${number}-${series}` : null;
};

export interface GroupTotals {
  year_level: number;
  semester: PlacementTerm;
  label: string;
  row_count: number;
  calculated: { lec: number; lab: number; tu: number };
  reported: { lec: number | null; lab: number | null; tu: number | null } | null;
}

/** Totals per (year, term) recomputed from the current reviewed rows, so edits and moves update both groups immediately. */
export const groupTotals = (draft: ImportDraft): GroupTotals[] => {
  const groups = new Map<string, GroupTotals>();
  const ensure = (year: number, semester: PlacementTerm) => {
    const key = `${year}-${semester}`;
    if (!groups.has(key)) {
      groups.set(key, {
        year_level: year,
        semester,
        label: `Year ${year} · ${TERM_LABELS[semester]}`,
        row_count: 0,
        calculated: { lec: 0, lab: 0, tu: 0 },
        reported: draft.groups.find((group) => group.year_level === year && group.semester === semester)?.reported ?? null,
      });
    }
    return groups.get(key)!;
  };

  draft.groups.forEach((group) => ensure(group.year_level, group.semester));
  for (const row of draft.rows) {
    if (row.year_level === null || row.semester === null) continue;
    const group = ensure(row.year_level, row.semester);
    group.row_count += 1;
    group.calculated.lec += row.lecture_units ?? 0;
    group.calculated.lab += row.lab_units ?? 0;
    group.calculated.tu += row.total_units ?? 0;
  }
  return [...groups.values()].sort((a, b) => termOrder(a.year_level, a.semester) - termOrder(b.year_level, b.semester));
};

export interface GroupAttention {
  errors: number;
  notices: number;
}

/** Spoken summary of a group's findings, e.g. "2 with errors, 1 notice". */
export const attentionLabel = (value: GroupAttention | undefined) => [
  value?.errors ? `${value.errors} with errors` : null,
  value?.notices ? `${value.notices} notice${value.notices === 1 ? '' : 's'}` : null,
].filter(Boolean).join(', ');

/** Values the reviewer must fix by hand: blanks, missing placement, or units that do not add up. */
export const rowHasProblem = (row: DraftRow): boolean => !row.code.trim() || !row.title.trim() || !row.year_level || !row.semester
  || row.lecture_units === null || row.lab_units === null || row.total_units === null
  || row.lecture_units + row.lab_units !== row.total_units;

export const totalsDiffer = (group: GroupTotals) => !!group.reported
  && (group.reported.lec !== group.calculated.lec || group.reported.lab !== group.calculated.lab || group.reported.tu !== group.calculated.tu);

export const groupKey = (year: number, term: PlacementTerm) => `${year}-${term}`;

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

export interface PayloadOptions {
  requestKey?: string;
  fingerprint?: string;
  expectedSettingsRevision?: number;
  /** Set only on commit: the single confirmation of the reviewed outcome named by `fingerprint`. */
  confirmed?: boolean;
}

export const toPayload = (draft: ImportDraft, options: PayloadOptions) => ({
  ...(options.requestKey ? { request_key: options.requestKey } : {}),
  ...(options.fingerprint ? { fingerprint: options.fingerprint } : {}),
  ...(options.expectedSettingsRevision ? { expected_settings_revision: options.expectedSettingsRevision } : {}),
  ...(options.confirmed ? { confirmed: true } : {}),
  source: draft.unread.length > 0 ? { ...draft.source, unread: draft.unread } : draft.source,
  metadata: {
    name: draft.metadata.name.trim(),
    program_id: draft.metadata.program_id,
    effective_school_year: draft.metadata.effective_school_year.trim(),
    cmo_number: blankToNull(draft.metadata.cmo_number),
    cmo_series: blankToNull(draft.metadata.cmo_series) === null ? null : Number(draft.metadata.cmo_series),
    description: blankToNull(draft.metadata.description),
    // Plain text for the import record, as before; the structured notes below are what is saved.
    notes: draft.notes.map((note) => note.text),
  },
  notes: draft.notes,
  groups: draft.groups,
  rows: draft.rows.map((row) => ({
    row_id: row.row_id,
    year_level: row.year_level,
    semester: row.semester,
    code: row.code,
    title: row.title,
    lecture_units: row.lecture_units,
    lab_units: row.lab_units,
    total_units: row.total_units,
    category: row.category,
    prerequisites: row.prerequisites,
    source: {
      code: row.source.code,
      title: row.source.title,
      lec: row.source.lec === null || Number.isNaN(row.source.lec) ? null : row.source.lec,
      lab: row.source.lab === null || Number.isNaN(row.source.lab) ? null : row.source.lab,
      tu: row.source.tu === null || Number.isNaN(row.source.tu) ? null : row.source.tu,
      prerequisites: row.source.prerequisites,
      flags: row.source.flags,
      provenance: { ...row.source.provenance, raw: row.source.raw },
    },
  })),
});

export type ImportPayload = ReturnType<typeof toPayload>;
