export type ImportFormat = 'pdf' | 'csv' | 'xlsx' | 'docx';

export type PlacementTerm = 1 | 2 | 3;

export type CourseCategory = 'major' | 'minor';

export type SchedulingBasis = 'weekly' | 'total_hours';

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
  scheduling_basis: SchedulingBasis | null;
  total_hours: number | null;
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
  warnings: string[];
}

export type IssueSeverity = 'error' | 'review' | 'warning';

export interface ImportIssue {
  key: string;
  code: string;
  severity: IssueSeverity;
  row_id: string | null;
  field: string | null;
  message: string;
  acknowledged: boolean;
  reason: string | null;
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
  scheduling_basis: SchedulingBasis;
  total_hours: number | null;
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
  counts: { errors: number; reviews: number; reviews_open: number; warnings: number };
  issues: ImportIssue[];
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
  acknowledged: Record<string, { reason: string; message: string }>;
  replayed: boolean;
}

export interface ClassificationRule {
  id?: number;
  match_kind: 'exact' | 'prefix';
  match_value: string;
  category: CourseCategory;
  enabled: boolean;
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
  overlaps: Array<{ broader: string; specific: string; specific_kind: string; broader_category: string; specific_category: string }>;
}
