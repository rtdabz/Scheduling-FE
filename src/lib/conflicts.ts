import api from './api';

/**
 * The conflict inbox and the resolution workflow behind it.
 *
 * Conflicts are derived by the server on every read, so a conflict's id is its
 * content -- `rule:lowScheduleId:highScheduleId` -- and not a row in a table.
 * That matters to the client in one way: a conflict the user is looking at may
 * already be gone by the time they act on it, and the server answers 409 rather
 * than pretending the resolution worked.
 *
 * Nothing here decides whether a conflict is resolved. The server re-scans
 * inside the same transaction as the write and refuses anything that leaves the
 * clash in place, so `resolveConflict` either returns the new open list or
 * throws.
 */

export type ConflictRule =
  | 'section_conflict'
  | 'room_conflict'
  | 'faculty_conflict'
  | 'subject_section_time_conflict';

export type ResolutionAction =
  | 'move_schedule'
  | 'change_room'
  | 'change_delivery_mode'
  | 'reassign_instructor'
  | 'request_override';

export interface ConflictSchedule {
  id: number;
  semester_id: number;
  section_id: number | null;
  course_id: number | null;
  faculty_id: number | null;
  room_id: number | null;
  department_id: number | null;
  day: string;
  start_time: string;
  end_time: string;
  mode: string;
  status: string;
  course_code: string | null;
  course_name: string | null;
  section_name: string | null;
  room_code: string | null;
  faculty_name: string | null;
}

export interface ScheduleConflict {
  id: string;
  rule: ConflictRule;
  semester_id: number;
  day: string;
  overlap_start: string;
  overlap_end: string;
  message: string;
  resolution_options: ResolutionAction[];
  /** Always two rows, lower schedule id first. */
  schedules: [ConflictSchedule, ConflictSchedule];
}

export interface ResolutionOutcome {
  conflict_id: string;
  status: 'resolved' | 'overridden';
  affected_schedule_ids: number[];
  history_version_id: number;
  semester_id: number;
  remaining_conflicts: ScheduleConflict[];
}

export interface ResolutionRequest {
  action: Exclude<ResolutionAction, 'request_override'>;
  schedule_id: number;
  day?: string;
  start_time?: string;
  end_time?: string;
  room_id?: number | null;
  faculty_id?: number | null;
  mode?: string;
  reason?: string;
  confirm_overload?: boolean;
  /** A ranked recommendation applied as offered, or a change the user entered. */
  source?: 'manual' | 'recommendation';
}

/**
 * How one conflict ended, from `/conflicts/resolved`. Read back from the audit
 * trail, so it is history: `reopened` means a fresh scan finds the same clash
 * again and it is back on the open list.
 */
export interface ConflictResolution {
  key: string;
  conflict_id: string;
  rule: ConflictRule | string;
  /** Empty for entries recorded before the message was stored. */
  message: string;
  day: string | null;
  overlap_start: string | null;
  overlap_end: string | null;
  method: 'recommended' | 'manual' | 'overridden';
  source: 'conflict_inbox' | 'schedule_generator' | 'schedule_builder';
  status: 'resolved' | 'overridden' | 'reopened';
  resolved_at: string | null;
  resolved_by: string | null;
  reason: string | null;
  affected_schedule_ids: number[];
}

/**
 * One ranked fix from `/conflicts/{id}/recommendations`. The server has already
 * checked it against the Rule Engine and left out anything the caller may not
 * apply, so `payload` goes to `resolveConflict` as it is -- one click.
 */
export interface ConflictRecommendation {
  rank: number;
  action: ResolutionRequest['action'];
  schedule_id: number;
  summary: string;
  /** Why it ranks where it does: "Same day and time", "Keeps its room", … */
  reasons?: string[];
  score: number;
  day?: string;
  start_time?: string;
  end_time?: string;
  mode?: string;
  room_id?: number | null;
  room_code?: string;
  faculty_id?: number;
  faculty_name?: string;
  projected_units?: number;
  /** Assigning this instructor pushes them past their Basic Load. */
  requires_overload_confirmation?: boolean;
  payload: ResolutionRequest;
}

export const resolutionMethodLabel = (resolution: ConflictResolution): string => {
  if (resolution.method === 'overridden') return 'Allowed to stand';
  if (resolution.method === 'manual') {
    return resolution.source === 'schedule_builder' ? 'Moved in Schedule Builder' : 'Manual change';
  }

  return resolution.source === 'schedule_generator' ? 'Recommendation (Generate)' : 'Recommended fix';
};

export const resolutionStatusLabel = (status: ConflictResolution['status']): string => {
  switch (status) {
    case 'overridden':
      return 'Allowed';
    case 'reopened':
      return 'Reopened';
    default:
      return 'Resolved';
  }
};

/**
 * Classes whose saved conflict stayed fixed, for the green flag on the
 * timetable: both sides of the clash (named in its id, `rule:low:high`) and
 * any class the fix changed. Both, because both left the conflict -- the page
 * flags both the moment it happens, and a reload has to show the same.
 * Reopened entries are left out -- that clash is back -- and so are overrides,
 * whose amber flag follows the live override mark instead. Ids of classes a
 * plan replaced simply match nothing on the grid.
 */
export const resolvedScheduleIds = (resolutions: ConflictResolution[]): Set<string> => {
  const ids = new Set<string>();
  resolutions.forEach((entry) => {
    if (entry.status !== 'resolved') return;
    entry.conflict_id.split(':').slice(1).forEach((id) => {
      if (/^\d+$/.test(id)) ids.add(id);
    });
    entry.affected_schedule_ids.forEach((id) => ids.add(String(id)));
  });

  return ids;
};

/**
 * A saved class that no longer satisfies a rule on its own, from
 * `/conflicts/rule-issues`: its room was taken out of service, its instructor
 * deactivated, operating hours narrowed, and so on. Derived on every read.
 */
export interface RuleIssue {
  id: string;
  rule: string;
  message: string;
  schedule: ConflictSchedule;
}

/** A short heading for the rules a saved class most often drifts out of. */
export const ruleIssueLabel = (rule: string): string => {
  switch (rule) {
    case 'room_availability':
      return 'Room not available';
    case 'room_type_match':
      return 'Wrong room type';
    case 'faculty_active':
      return 'Instructor inactive';
    case 'part_time_faculty_availability':
      return 'Outside instructor availability';
    case 'operating_hours':
    case 'field_evening_window':
      return 'Outside operating hours';
    case 'sunday_classes':
      return 'Sunday classes not allowed';
    case 'forced_course_day':
    case 'preferred_pattern':
      return 'Required day not met';
    case 'class_duration':
      return 'Class length changed';
    case 'delivery_mode':
      return 'Delivery mode not allowed';
    default:
      return 'Rule no longer met';
  }
};

/** Which kinds of saved conflict a class is in, for a per-row badge. */
export interface ConflictFlags {
  faculty: boolean;
  room: boolean;
  section: boolean;
  online: boolean;
}

/**
 * Per-class flags from the server's conflict scan, keyed by schedule id.
 *
 * Read-only screens badge rows from this instead of re-deriving clashes in
 * the browser: the server already leaves out instructor clashes allowed to
 * stand, catches clashes with other departments' classes, and knows which
 * rooms are shared -- a local check got all three wrong.
 */
export const conflictFlagsBySchedule = (conflicts: ScheduleConflict[]): Map<string, ConflictFlags> => {
  const flags = new Map<string, ConflictFlags>();
  conflicts.forEach((conflict) => {
    conflict.schedules.forEach((schedule) => {
      const key = String(schedule.id);
      const entry = flags.get(key) ?? { faculty: false, room: false, section: false, online: false };
      if (conflict.rule === 'faculty_conflict') entry.faculty = true;
      if (conflict.rule === 'room_conflict') entry.room = true;
      if (conflict.rule === 'section_conflict') entry.section = true;
      if (conflict.rule === 'subject_section_time_conflict') entry.online = true;
      flags.set(key, entry);
    });
  });

  return flags;
};

/** Statuses whose timetable placement may still be edited. */
const EDITABLE_STATUSES = ['draft', 'completed', 'revision'];

export const isReplottable = (schedule: ConflictSchedule): boolean =>
  EDITABLE_STATUSES.includes(schedule.status);

/** Plain-language label for each rule, for headings and filters. */
export const conflictRuleLabel = (rule: ConflictRule | string): string => {
  switch (rule) {
    case 'section_conflict':
      return 'Section double-booked';
    case 'room_conflict':
      return 'Room double-booked';
    case 'faculty_conflict':
      return 'Instructor double-booked';
    case 'subject_section_time_conflict':
      return 'One online class, two sections';
    default:
      return 'Conflict';
  }
};

export const resolutionActionLabel = (action: ResolutionAction | string): string => {
  switch (action) {
    case 'move_schedule':
      return 'Move to another day or time';
    case 'change_room':
      return 'Move to another room';
    case 'change_delivery_mode':
      return 'Change the delivery mode';
    case 'reassign_instructor':
      return 'Reassign the instructor';
    case 'request_override':
      return 'Allow it to stand, with a reason';
    default:
      return action;
  }
};

/** A short "CS 101 — BSIT 1A, Mon 08:00-09:00" for one side of a conflict. */
export const describeConflictSchedule = (schedule: ConflictSchedule): string =>
  [
    [schedule.course_code, schedule.section_name].filter(Boolean).join(' — ') || `Class #${schedule.id}`,
    `${schedule.day} ${schedule.start_time.slice(0, 5)}-${schedule.end_time.slice(0, 5)}`,
    schedule.room_code ?? (schedule.mode === 'online' ? 'Online' : 'No room'),
    schedule.faculty_name ?? 'No instructor',
  ].join(' · ');

export const fetchConflicts = async (params: {
  semesterId?: number | null;
  departmentId?: number | null;
  sectionId?: number | null;
  signal?: AbortSignal;
}): Promise<ScheduleConflict[]> => {
  const response = await api.get<{ conflicts: ScheduleConflict[] }>('/conflicts', {
    signal: params.signal,
    params: {
      semester_id: params.semesterId ?? undefined,
      department_id: params.departmentId ?? undefined,
      section_id: params.sectionId ?? undefined,
    },
  });

  return response.data.conflicts ?? [];
};

/**
 * Ranked fixes for one open conflict. A 404 means the conflict is already gone;
 * the caller treats that like any other stale selection.
 */
export const fetchConflictRecommendations = async (
  conflictId: string,
  params: { limit?: number; signal?: AbortSignal } = {},
): Promise<ConflictRecommendation[]> => {
  const response = await api.get<{ options?: ConflictRecommendation[] }>(
    `/conflicts/${encodeURIComponent(conflictId)}/recommendations`,
    { signal: params.signal, params: { limit: params.limit } },
  );

  return response.data.options ?? [];
};

export const fetchResolvedConflicts = async (params: {
  semesterId?: number | null;
  departmentId?: number | null;
  sectionId?: number | null;
  signal?: AbortSignal;
}): Promise<ConflictResolution[]> => {
  const response = await api.get<{ resolutions?: ConflictResolution[] }>('/conflicts/resolved', {
    signal: params.signal,
    params: {
      semester_id: params.semesterId ?? undefined,
      department_id: params.departmentId ?? undefined,
      section_id: params.sectionId ?? undefined,
    },
  });

  return response.data.resolutions ?? [];
};

export const fetchRuleIssues = async (params: {
  semesterId?: number | null;
  departmentId?: number | null;
  sectionId?: number | null;
  signal?: AbortSignal;
}): Promise<RuleIssue[]> => {
  const response = await api.get<{ issues?: RuleIssue[] }>('/conflicts/rule-issues', {
    signal: params.signal,
    params: {
      semester_id: params.semesterId ?? undefined,
      department_id: params.departmentId ?? undefined,
      section_id: params.sectionId ?? undefined,
    },
  });

  return response.data.issues ?? [];
};

export const resolveConflict = async (
  conflictId: string,
  request: ResolutionRequest,
): Promise<ResolutionOutcome> => {
  const response = await api.post<ResolutionOutcome>(
    `/conflicts/${encodeURIComponent(conflictId)}/resolve`,
    request,
  );

  return response.data;
};

export const overrideConflict = async (
  conflictId: string,
  reason: string,
): Promise<ResolutionOutcome> => {
  const response = await api.post<ResolutionOutcome>(
    `/conflicts/${encodeURIComponent(conflictId)}/override`,
    { reason, confirm: true },
  );

  return response.data;
};

/**
 * The server's 409: the conflict was fixed by someone else, or by an earlier
 * action in this session, before this request arrived. Not an error to show as
 * a failure -- the list simply needs replacing with what came back.
 */
export const alreadyResolvedFrom = (err: unknown): ScheduleConflict[] | null => {
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (!response || response.status !== 409) return null;

  const conflicts = (response.data as { conflicts?: unknown })?.conflicts;

  return Array.isArray(conflicts) ? (conflicts as ScheduleConflict[]) : [];
};

/** Every violation message a 422 refusal carried, de-duplicated. */
export const refusalDetails = (err: unknown): string[] => {
  const violations = (err as { response?: { data?: { violations?: unknown } } })?.response?.data?.violations;
  if (!Array.isArray(violations)) return [];

  return [...new Set(
    violations
      .map((violation) => (violation as { message?: unknown })?.message)
      .filter((message): message is string => typeof message === 'string' && message.trim() !== '')
      .map((message) => message.trim()),
  )];
};

/** Log that a user opened and reviewed conflict details. */
export const reviewConflict = async (conflictId: string): Promise<void> => {
  try {
    await api.post(`/conflicts/${encodeURIComponent(conflictId)}/review`);
  } catch {
    // Non-blocking audit ping
  }
};
