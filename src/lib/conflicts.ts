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
  | 'request_override'
  | 'apply_recommendation';

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
  action: Exclude<ResolutionAction, 'request_override' | 'apply_recommendation'>;
  schedule_id: number;
  day?: string;
  start_time?: string;
  end_time?: string;
  room_id?: number | null;
  faculty_id?: number | null;
  mode?: string;
  reason?: string;
  confirm_overload?: boolean;
}

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
    case 'apply_recommendation':
      return 'Generate a recommendation';
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
