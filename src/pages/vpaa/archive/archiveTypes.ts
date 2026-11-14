export const ARCHIVE_TYPES = [
  'users', 'departments', 'programs', 'buildings', 'rooms', 'faculties',
  'designations', 'courses', 'semesters',
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
};

/**
 * Archived records live in the module that owns them. Each module lists only its fixed types;
 * restore authority is unchanged (the archive API stays VPAA-only).
 */
export const ARCHIVE_MODULES = {
  users: { types: ['users'], path: '/users', label: 'Archived accounts' },
  departments: { types: ['departments', 'programs'], path: '/departments', label: 'Archived departments & programs' },
  facilities: { types: ['buildings', 'rooms'], path: '/facilities', label: 'Archived buildings & rooms' },
  instructors: { types: ['faculties'], path: '/instructors', label: 'Archived instructors' },
  designations: { types: ['designations'], path: '/designations', label: 'Archived designations' },
  semesters: { types: ['semesters'], path: '/settings', label: 'Archived semesters' },
  curriculum: { types: ['courses'], path: '/curriculum/archived-courses', label: 'Archived courses' },
} as const satisfies Record<string, { types: readonly ArchiveType[]; path: string; label: string }>;

export type ArchiveModule = keyof typeof ARCHIVE_MODULES;

/** The module that owns an archive type, for redirecting old `/archive?type=` links. */
export const archiveModuleOf = (type: string | null): ArchiveModule | null => (
  (Object.keys(ARCHIVE_MODULES) as ArchiveModule[]).find((module) => (ARCHIVE_MODULES[module].types as readonly string[]).includes(type ?? '')) ?? null
);

/** Query parameter that switches a module page to its archived records. */
export const ARCHIVED_VIEW_PARAM = 'archived';
/** Prefix for the archive listing's own filters inside a module page. */
export const ARCHIVE_PARAM_PREFIX = 'ar_';

const CARRIED_PARAMS = ['q', 'type', 'department', 'program', 'term', 'from', 'to', 'sort', 'page', 'size'];

/** The archive URL a former `/archive?...` link now points to: the owning module's archive. */
export function archiveRedirectTarget(search: string): string {
  const params = new URLSearchParams(search);
  // Schedules have no archive (deletes are permanent); old schedule links open Schedule Approval.
  if (['schedules', 'schedule-splits'].includes(params.get('type') ?? '')) return '/schedules/approval';
  const module = archiveModuleOf(params.get('type')) ?? 'users';
  const { path } = ARCHIVE_MODULES[module];
  const next = new URLSearchParams();
  if (module !== 'curriculum') next.set(ARCHIVED_VIEW_PARAM, '1');
  CARRIED_PARAMS.forEach((name) => {
    const value = params.get(name);
    if (value) next.set(`${ARCHIVE_PARAM_PREFIX}${name}`, value);
  });
  const query = next.toString();
  return query ? `${path}?${query}` : path;
}

/** Types whose records carry a program or term, used to show only relevant filters. */
export const PROGRAM_TYPES: readonly ArchiveType[] = ['users', 'programs', 'buildings', 'rooms', 'faculties', 'courses'];
export const TERM_TYPES: readonly ArchiveType[] = ['semesters'];

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
  restore: { state: 'blocked' | 'clear'; blockers: ArchiveBlocker[] };
}

export interface ArchiveDetail extends ArchiveRecord {
  identity: { label: string; value: string }[];
  outcome: string[];
  provenance: {
    archived_at: string | null;
    recorded: boolean;
    actor: { id: number; name: string | null; username: string | null; role: string | null } | null;
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
  /** Per-type counts for the requested module scope only. */
  counts: Partial<Record<ArchiveType, number>>;
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
