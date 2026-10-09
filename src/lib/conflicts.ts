import api from './api';
import { formatTime12h } from './timeGrid';

export type ConflictRule =
  | 'section_conflict'
  | 'room_conflict'
  | 'faculty_conflict'
  | 'subject_section_time_conflict';

export type ResolutionAction =
  | 'move_schedule'
  | 'change_room'
  | 'change_delivery_mode'
  | 'reassign_instructor';

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
  department_code?: string | null;
  department_name?: string | null;
  assigning_department_id?: number | null;
  assigning_department_code?: string | null;
  assigning_department_name?: string | null;
  assigning_program_id?: number | null;
  assigning_program_code?: string | null;
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
  schedules: [ConflictSchedule, ConflictSchedule];
}

export interface ResolutionOutcome {
  conflict_id: string;
  status: 'resolved';
  affected_schedule_ids: number[];
  history_version_id: number;
  semester_id: number;
  remaining_conflicts: ScheduleConflict[];
}

export interface ResolutionRequest {
  action: ResolutionAction;
  schedule_id: number;
  day?: string;
  start_time?: string;
  end_time?: string;
  room_id?: number | null;
  faculty_id?: number | null;
  mode?: string;
  reason?: string;
  source?: 'manual' | 'recommendation';
}

export interface ConflictResolution {
  key: string;
  conflict_id: string;
  rule: ConflictRule | string;
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
  fix?: string | null;
}

export interface ConflictRecommendation {
  rank: number;
  action: ResolutionRequest['action'];
  schedule_id: number;
  summary: string;
  reasons?: string[];
  score: number;
  day?: string;
  start_time?: string;
  end_time?: string;
  mode?: string;
  room_id?: number | null;
  room_code?: string;
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

export interface RuleIssue {
  id: string;
  rule: string;
  message: string;
  schedule: ConflictSchedule;
}

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

export interface ConflictFlags {
  faculty: boolean;
  room: boolean;
  section: boolean;
  online: boolean;
}

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

const EDITABLE_STATUSES = ['draft', 'completed', 'revision'];

export const isReplottable = (schedule: ConflictSchedule): boolean =>
  EDITABLE_STATUSES.includes(schedule.status);

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
    default:
      return action;
  }
};

export const describeConflictSchedule = (schedule: ConflictSchedule): string =>
  [
    [schedule.course_code, schedule.section_name].filter(Boolean).join(' — ') || `Class #${schedule.id}`,
    `${schedule.day} ${formatTime12h(schedule.start_time)} - ${formatTime12h(schedule.end_time)}`,
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

export const fetchConflictRecommendations = async (
  conflictId: string,
  params: { limit?: number; signal?: AbortSignal } = {},
): Promise<ConflictRecommendation[]> => {
  const response = await api.get<{ options?: ConflictRecommendation[] }>(
    `/conflicts/${encodeURIComponent(conflictId)}/recommendations`,
    { signal: params.signal, params: { limit: params.limit } },
  );

  // Older servers may still return ranked instructor replacements during rollout.
  return (response.data.options ?? []).filter((option) =>
    option.action !== 'reassign_instructor' && option.payload.action !== 'reassign_instructor');
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

export const alreadyResolvedFrom = (err: unknown): ScheduleConflict[] | null => {
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (!response || response.status !== 409) return null;

  const conflicts = (response.data as { conflicts?: unknown })?.conflicts;

  return Array.isArray(conflicts) ? (conflicts as ScheduleConflict[]) : [];
};

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

export const reviewConflict = async (conflictId: string): Promise<void> => {
  try {
    await api.post(`/conflicts/${encodeURIComponent(conflictId)}/review`);
  } catch {
  }
};
