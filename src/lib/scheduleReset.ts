import api from './api';
import { EDITABLE_STATUSES } from './scheduleStatuses';

/** Server review of a permanent Reset (`POST /schedules/reset/preview`). */
export interface ScheduleResetPreview {
  semester: { id: number; academic_year: string; semester: string };
  sections: { id: number; name: string; year_level: string | number; schedules: number }[];
  counts: {
    schedules: number;
    classes: number;
    meeting_splits: number;
    archived_meeting_splits: number;
    instructor_assignments: number;
    cross_department_instructor_assignments: number;
  };
  token: string;
}

export interface ScheduleResetResult extends ScheduleResetPreview {
  message: string;
  deleted_schedule_ids: number[];
}

export const RESET_WARNING = 'These schedules, meeting splits, and instructor assignments will be permanently deleted. This cannot be undone. Schedule History will remain unchanged.';

/** Reset follows the same editing policy as Generate Again, including returned schedules. */
export const RESET_ELIGIBLE_STATUSES: readonly string[] = EDITABLE_STATUSES;

const VPAA_LOCKED_STATUSES = ['approved', 'faculty_assignment', 'reassignment', 'finalized'];

/**
 * Mirrors the server's ScheduleResetService::statusBlockReason: why a section's loaded statuses keep
 * it out of Reset, or null when every class is editable. The most protected stage wins. The server
 * also checks open-submission membership, which only it can see, and re-checks on confirmation.
 */
export function resetBlockReason(statuses: string[]): string | null {
  const locked = statuses.filter((status) => !RESET_ELIGIBLE_STATUSES.includes(status));
  if (locked.length === 0) return null;
  const has = (set: string[]) => locked.some((status) => set.includes(status));
  if (has(VPAA_LOCKED_STATUSES)) return 'Approved by the VPAA and locked for instructor assignment';
  if (has(['approved_by_dean', 'conditionally_approved'])) return 'Waiting for VPAA review';
  if (has(['submitted'])) return 'Waiting for Dean review';
  return 'Has classes at a stage that cannot be reset';
}

export async function previewScheduleReset(semesterId: number, sectionIds: number[]): Promise<ScheduleResetPreview> {
  const response = await api.post<ScheduleResetPreview>('/schedules/reset/preview', { semester_id: semesterId, section_ids: sectionIds });
  return response.data;
}

export async function confirmScheduleReset(preview: ScheduleResetPreview): Promise<ScheduleResetResult> {
  const response = await api.post<ScheduleResetResult>('/schedules/reset', {
    semester_id: preview.semester.id,
    section_ids: preview.sections.map((section) => section.id),
    expected_token: preview.token,
  });
  return response.data;
}

/** The refreshed review carried by a 409 `reset_target_changed` response, if any. */
export function changedResetPreview(error: unknown): ScheduleResetPreview | null {
  const response = (error as { response?: { status?: number; data?: { code?: string; preview?: ScheduleResetPreview } } })?.response;
  return response?.status === 409 && response.data?.code === 'reset_target_changed' && response.data.preview
    ? response.data.preview
    : null;
}

const plural = (count: number, noun: string, pluralNoun = `${noun}s`) => `${count} ${count === 1 ? noun : pluralNoun}`;

const semesterLabel = ({ academic_year: year, semester }: ScheduleResetPreview['semester']) => {
  const term = semester === 'summer' ? 'Summer' : `${semester} Semester`;
  return `${term}, AY ${year}`;
};

export interface ResetConfirmationSummary {
  changedNote: string | null;
  message: string;
  crossDepartmentNote: string | null;
}

/** The parts of the Reset confirmation dialog, laid out by ResetConfirmationMessage. */
export function resetConfirmationSummary(preview: ScheduleResetPreview, changed = false): ResetConfirmationSummary {
  const { counts } = preview;
  return {
    changedNote: changed ? 'The schedules changed since you reviewed them. These are the updated counts.' : null,
    message: `You are about to reset ${plural(counts.classes, 'class', 'classes')} across `
      + `${plural(preview.sections.length, 'section')} for the ${semesterLabel(preview.semester)}. This action cannot be undone.`,
    crossDepartmentNote: counts.cross_department_instructor_assignments > 0
      ? `${plural(counts.cross_department_instructor_assignments, 'assignment')} by another department will be released, and that department will be notified.`
      : null,
  };
}
