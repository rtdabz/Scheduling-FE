import type { NoteRun } from '../../types/curriculum';

export type ImportFormat = 'pdf' | 'csv' | 'xlsx' | 'docx';

export type PlacementTerm = 1 | 2 | 3;

export type CourseCategory = 'major' | 'minor';

export type ExtractionFlag =
  | 'ambiguous_units'
  | 'blank_cell'
  | 'credit_sum_mismatch'
  | 'suspicious_code'
  | 'invalid_number'
  | 'unmapped_term'
  | 'unmapped_year'
  | 'malformed_row'
  | 'merged_cells';

export type Provenance =
  | { kind: 'pdf'; page: number; bbox: [number, number, number, number] }
  | { kind: 'csv'; record: number }
  | { kind: 'xlsx'; sheet: string; row: number }
  | { kind: 'docx'; table: number; row: number };

/** Values exactly as read from the document. Reviewer edits never overwrite these. */
export interface SourceValues {
  code: string;
  title: string;
  lec: number | null;
  lab: number | null;
  tu: number | null;
  prerequisites: string | null;
  raw: string[];
  provenance: Provenance;
  flags: ExtractionFlag[];
}

export interface ExtractedRow {
  year_level: number | null;
  semester: PlacementTerm | null;
  source: SourceValues;
}

export interface ReportedTotals {
  lec: number | null;
  lab: number | null;
  tu: number | null;
}

export interface ExtractedGroup {
  year_level: number;
  semester: PlacementTerm;
  reported: ReportedTotals | null;
}

export type NoteFlag = 'color_unknown' | 'manual';

/** A source note in an import draft. Course scope names the draft row; it becomes the course on import. */
export interface SourceNote {
  id: string;
  /** Text as read from the document, including form blanks. Null for notes typed by the reviewer. */
  source_text: string | null;
  /** Display text: the source with only leading form blanks removed. */
  text: string;
  runs: NoteRun[];
  scope: { level: 'curriculum' } | { level: 'year'; year_level: number } | { level: 'term'; year_level: number; semester: PlacementTerm } | { level: 'course'; row_id: string };
  provenance: Provenance | null;
  flags: NoteFlag[];
}

/** Part of the source the extractor could not read; reviewed instead of silently dropped. */
export interface UnreadRegion {
  reason: 'image' | 'unrecognized_text';
  page?: number;
  bbox?: [number, number, number, number];
  text?: string;
  /** What the reviewer found there: a note they typed in, or none. Unresolved regions block the import. */
  resolution?: 'transcribed' | 'no_note' | null;
}

export interface ExtractedMetadata {
  name: string | null;
  program_text: string | null;
  program_code: string | null;
  cmo_number: string | null;
  cmo_series: number | null;
  effective_school_year: string | null;
  notes: string[];
}

export interface Extraction {
  format: ImportFormat;
  extractor_version: string;
  metadata: ExtractedMetadata;
  groups: ExtractedGroup[];
  rows: ExtractedRow[];
  /** Structured notes; older extractions carry only `metadata.notes` strings. */
  notes?: SourceNote[];
  unread?: UnreadRegion[];
  warnings: string[];
}

export interface DraftRow {
  row_id: string;
  year_level: number | null;
  semester: PlacementTerm | null;
  code: string;
  title: string;
  lecture_units: number | null;
  lab_units: number | null;
  total_units: number | null;
  category: CourseCategory | null;
  /** Reference text exactly as the document gives it; never classified or enforced. */
  prerequisites: string | null;
  code_suggestion: string | null;
  source: SourceValues;
}

export interface DraftMetadata {
  name: string;
  program_id: number | null;
  effective_school_year: string;
  cmo_number: string;
  cmo_series: string;
  description: string;
  notes: string[];
}

export interface DraftSource {
  filename: string;
  format: ImportFormat;
  size_bytes: number;
  sha256: string;
  extractor_version: string;
}

export interface ImportDraft {
  source: DraftSource;
  metadata: DraftMetadata;
  detected: ExtractedMetadata;
  groups: ExtractedGroup[];
  rows: DraftRow[];
  notes: SourceNote[];
  unread: UnreadRegion[];
  warnings: string[];
}

/** Errors block until the draft is corrected; notices and warnings are facts for the formal review. */
export type IssueSeverity = 'error' | 'notice' | 'warning';

export interface ImportIssue {
  key: string;
  code: string;
  severity: IssueSeverity;
  row_id: string | null;
  field: string | null;
  message: string;
}

/**
 * One line of the review comparison: Course | Field | Original | Will be imported. `draft` is set when a reused
 * course's draft value differs from both the source and the catalog value that is actually kept.
 */
export interface ImportChange {
  row_id: string;
  code: string;
  field: 'code' | 'title' | 'lecture_units' | 'lab_units' | 'total_units' | 'units' | 'placement' | 'row' | 'category';
  original: string;
  draft: string | null;
  imported: string;
  kind: 'correction' | 'unchanged' | 'catalog' | 'category';
  flags: string[];
  /** Differs only by spacing or capitalisation: shown under Information. */
  formatting: boolean;
  note: string | null;
}

export interface ResolvedRow {
  row_id: string;
  code: string;
  title: string;
  year_level: number;
  semester: PlacementTerm;
  lecture_units: number;
  lab_units: number;
  total_credits: number;
  category: CourseCategory | null;
  rule: { id: number | null; match_kind: 'exact' | 'prefix'; match_value: string; category: CourseCategory } | null;
  catalog: { action: 'create' | 'reuse' | 'blocked'; course_id: number | null; course: Record<string, unknown> | null };
  lecture_minutes: number | null;
  laboratory_minutes: number | null;
  weekly_contact_minutes: number | null;
}

export interface GroupSummary {
  year_level: number;
  semester: PlacementTerm;
  reported: ReportedTotals | null;
  calculated: { lec: number; lab: number; tu: number };
  row_count: number;
  declared: boolean;
  matches: boolean | null;
}

export interface ValidationResult {
  valid: boolean;
  fingerprint: string;
  settings_revision: number;
  settings: { lecture_minutes_per_unit: number; laboratory_minutes_per_unit: number };
  /** `code` is the server-assigned internal code preview; the commit may add a suffix if it is taken meanwhile. */
  metadata: { code: string; program_id: number | null };
  counts: { errors: number; notices: number; warnings: number };
  issues: ImportIssue[];
  changes: ImportChange[];
  rows: ResolvedRow[];
  groups: GroupSummary[];
  totals: {
    calculated: { lec: number; lab: number; tu: number };
    reported_sum: { lec: number; lab: number; tu: number } | null;
    row_count: number;
    populated_groups: number;
  };
}

export interface ImportResult {
  curriculum: {
    id: number;
    name: string;
    code: string;
    cmo_number: string | null;
    cmo_series: number | null;
    program_id: number | null;
    effective_school_year: string;
    status: string;
  };
  import_id: number;
  created_count: number;
  reused_count: number;
  rows: Array<{ row_id: string; course_id: number; code: string; action: 'created' | 'reused' }>;
  groups: GroupSummary[];
  totals: ValidationResult['totals'];
  changes?: ImportChange[];
  notices?: ImportIssue[];
  /** Recorded by the server for the single final confirmation. */
  confirmation?: { user_id: number; user_name: string | null; confirmed_at: string; fingerprint: string };
  /** Present only when replaying an import made before reasons were removed. */
  acknowledged?: Record<string, { reason: string; message: string }>;
  replayed: boolean;
}

/** Every rule is an enabled prefix match; the longest matching prefix wins. */
export interface ClassificationRule {
  id?: number;
  match_value: string;
  category: CourseCategory;
  sample_matches?: string[];
}

export interface ImportSettings {
  department_id: number;
  revision: number;
  lecture_minutes_per_unit: number;
  laboratory_minutes_per_unit: number;
  slot_minutes: number;
  max_minutes_per_unit: number;
  can_manage: boolean;
  rules: ClassificationRule[];
  overlaps: Array<{ broader: string; specific: string; broader_category: string; specific_category: string }>;
}
