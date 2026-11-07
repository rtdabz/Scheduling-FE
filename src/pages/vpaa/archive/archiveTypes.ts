export const ARCHIVE_TYPES = [
  'users', 'departments', 'programs', 'buildings', 'rooms', 'faculties',
  'designations', 'courses', 'semesters', 'schedules', 'schedule-splits',
] as const;

export type ArchiveType = (typeof ARCHIVE_TYPES)[number];

export const ARCHIVE_TYPE_LABELS: Record<ArchiveType, string> = {
  users: 'Accounts',
  departments: 'Departments',
  programs: 'Programs',
  buildings: 'Buildings',
  rooms: 'Rooms',
  faculties: 'Instructors',
  designations: 'Designations',
  courses: 'Courses',
  semesters: 'Semesters',
  schedules: 'Class schedules',
  'schedule-splits': 'Meeting splits',
};

/** Types whose records carry a program or term, used to show only relevant filters. */
export const PROGRAM_TYPES: readonly ArchiveType[] = ['users', 'programs', 'buildings', 'rooms', 'faculties', 'courses', 'schedules', 'schedule-splits'];
export const TERM_TYPES: readonly ArchiveType[] = ['semesters', 'schedules', 'schedule-splits'];

export interface ArchiveRef {
  type: ArchiveType;
  id: number;
  label: string;
  archived?: boolean;
}

export interface ArchiveBlocker {
  code: 'archived_parent' | 'role_occupied' | 'unique_conflict' | 'inactive_semester' | 'missing_parent' | 'approval_stage' | string;
  message: string;
  record?: ArchiveRef;
}

export interface ArchiveContext {
  department: { id: number; code: string; name: string; archived: boolean } | null;
  program: { id: number; code: string; name: string | null; archived: boolean } | null;
  term: { id: number; label: string; active: boolean; archived: boolean } | null;
}

export interface ArchiveStatus {
  label: string;
  tone: 'active' | 'inactive' | 'neutral';
}

export interface ArchiveRecord {
  key: string;
  id: number;
  type: ArchiveType;
  type_label: string;
  label: string;
  subtitle: string | null;
  context: ArchiveContext;
  status: ArchiveStatus | null;
  deleted_at: string;
  restore: { state: 'blocked' | 'validation' | 'clear'; blockers: ArchiveBlocker[] };
}

export interface ArchiveDetail extends ArchiveRecord {
  identity: { label: string; value: string }[];
  outcome: string[];
  provenance: {
    archived_at: string | null;
    recorded: boolean;
    actor: { id: number; name: string; username: string; role: string } | null;
    event: string | null;
    note: string | null;
    reason: string | null;
  };
  /** `restores` marks linked records this restore brings back with the selected one. */
  linked: (ArchiveRef & { relation: string; restores: boolean })[];
  archived_dependents?: Partial<Record<ArchiveType, number>>;
}

export interface ArchiveOptions {
  departments: { id: number; code: string; name: string; archived: boolean }[];
  programs: { id: number; department_id: number; code: string; name: string | null; archived: boolean }[];
  semesters: { id: number; label: string; active: boolean; archived: boolean }[];
}

export interface ArchivePage {
  data: ArchiveRecord[];
  meta: { current_page: number; per_page: number; total: number; last_page: number; from: number; to: number };
  counts: Record<ArchiveType, number>;
  total_archived: number;
  options: ArchiveOptions;
  checked_at: string;
}

export interface RestoreResult {
  message: string;
  already_restored: boolean;
  restored: { type: ArchiveType; id: number; label: string; status: ArchiveStatus | null; outcome: string[] }[];
  affected_count: number;
}

export interface RestoreFailure {
  message: string;
  code?: string;
  blockers?: ArchiveBlocker[];
  violations?: { rule?: string; message: string }[];
}

export const formatArchiveDate = (value: string | null | undefined): string => (value
  ? new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
  : 'Unknown');

export const contextParts = (context: ArchiveContext): string[] => [
  context.department ? `${context.department.code}${context.department.archived ? ' (archived)' : ''}` : null,
  context.program ? `${context.program.code}${context.program.archived ? ' (archived)' : ''}` : null,
  context.term ? `${context.term.label}${context.term.archived ? ' (archived)' : ''}` : null,
].filter((part): part is string => part !== null);
