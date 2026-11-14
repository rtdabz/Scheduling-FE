import api from "../../../../lib/api";
import type { ApiScheduleRecord } from "../types";
import {
  normalizeComponentRequiredDays,
  type ComponentRequiredDays,
} from "./courseClassConfig";

/** Normalized pins a run was generated with: section id => course id => days. */
export type ComponentRequiredDaysContext = Record<
  string,
  Record<string, { lecture?: string; laboratory?: string }>
>;

/** One section's map for a generation request; blank components are dropped. */
export function componentRequiredDaysPayload(
  byCourseId: Record<string, ComponentRequiredDays> | undefined,
  include: (courseId: string) => boolean,
): Record<number, Record<string, string>> {
  const payload: Record<number, Record<string, string>> = {};
  for (const [courseId, days] of Object.entries(byCourseId ?? {})) {
    const pinned = normalizeComponentRequiredDays(days);
    if (pinned && include(courseId)) payload[Number(courseId)] = pinned;
  }
  return payload;
}

/**
 * Review and generated-save context: the server rebuilds and checks the
 * pins; an empty context keeps the old request shape.
 */
export function componentRequiredDaysContext(
  context: ComponentRequiredDaysContext | null | undefined,
): { section_configs?: Array<{ section_id: number; component_required_days_by_course_id: Record<number, Record<string, string>> }> } {
  const sectionConfigs = Object.entries(context ?? {})
    .map(([sectionId, byCourseId]) => ({
      section_id: Number(sectionId),
      component_required_days_by_course_id: componentRequiredDaysPayload(byCourseId, () => true),
    }))
    .filter((config) => Object.keys(config.component_required_days_by_course_id).length > 0);
  return sectionConfigs.length > 0 ? { section_configs: sectionConfigs } : {};
}

export type DraftMeeting = {
  meeting_type: "lecture" | "laboratory" | null;
  duration_slots: number;
  modes: string[];
};

export type UnplacedCourse = {
  section_id: number;
  section_name: string;
  course_id: number;
  course_code: string;
  reason: string;
  shape?: "split" | "online_split" | null;
  meetings: DraftMeeting[];
  consecutive_rule?: { day_count: number; preferred_start_day?: string | null; meeting_days?: string[] | null } | null;
};

export type DraftOption = {
  id: string;
  rank: number;
  score: number;
  summary: string;
  label?: string | null;
  reasons: string[];
  rows: ApiScheduleRecord[];
};

export type DraftIssue = {
  key: string;
  kind: "unplaced" | "conflict";
  section_id: number;
  section_name: string;
  course_id: number;
  course_code: string;
  course_name: string;
  problems: string[];
  options: DraftOption[];
};

export const draftClassKey = (
  sectionId: number | string,
  courseId: number | string | undefined,
): string => `${Number(sectionId)}:${Number(courseId)}`;

const rowClassKey = (row: ApiScheduleRecord): string =>
  draftClassKey(row.section_id, row.course_id ?? row.subject_id);

export async function fetchDraftReview({
  semesterId,
  departmentId,
  sectionIds,
  rows,
  unplaced,
  preferredDays,
  componentRequiredDays = null,
}: {
  semesterId: number;
  departmentId: number;
  sectionIds: number[];
  rows: ApiScheduleRecord[];
  unplaced: UnplacedCourse[];
  preferredDays: string[] | null;
  componentRequiredDays?: ComponentRequiredDaysContext | null;
}): Promise<DraftIssue[]> {
  const response = await api.post<{ issues?: DraftIssue[] }>(
    "/schedule-recommendations/draft-review",
    {
      semester_id: semesterId,
      department_id: departmentId,
      section_ids: sectionIds,
      preferred_days: preferredDays,
      rows: rows.map((row) => ({
        semester_id: Number(row.semester_id),
        section_id: Number(row.section_id),
        course_id: Number(row.course_id ?? row.subject_id),
        department_id: Number(row.department_id),
        faculty_id: row.faculty_id ? Number(row.faculty_id) : null,
        room_id: row.mode === "online" ? null : Number(row.room_id) || null,
        day: row.day,
        start_time: row.start_time.slice(0, 5),
        end_time: row.end_time.slice(0, 5),
        mode: row.mode ?? "on-site",
        is_hybrid: Boolean(row.is_hybrid),
        preferred_pattern: row.preferred_pattern ?? null,
        split_group_id: row.split_group_id ?? null,
        meeting_type: row.meeting_type ?? null,
        meeting_index: row.meeting_index ?? null,
      })),
      unplaced: unplaced.map((course) => ({
        section_id: course.section_id,
        course_id: course.course_id,
        reason: course.reason,
        shape: course.shape ?? null,
        meetings: course.meetings,
        ...(course.consecutive_rule ? { consecutive_rule: course.consecutive_rule } : {}),
      })),
      ...componentRequiredDaysContext(componentRequiredDays),
    },
  );

  return Array.isArray(response.data.issues) ? response.data.issues : [];
}

export function draftReviewErrorMessage(error: unknown): string {
  const apiError = error as { response?: { data?: { message?: string } } };
  return (
    apiError.response?.data?.message ??
    "The timetable could not be checked. Check again before saving."
  );
}

export function applyDraftOptions(
  rows: ApiScheduleRecord[],
  chosen: DraftOption[],
): ApiScheduleRecord[] {
  const replaced = new Set<string>();
  const added: ApiScheduleRecord[] = [];
  for (const option of chosen) {
    for (const row of option.rows) {
      replaced.add(rowClassKey(row));
      added.push(row);
    }
  }

  return [...rows.filter((row) => !replaced.has(rowClassKey(row))), ...added];
}

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
};

const rowsClash = (
  left: ApiScheduleRecord,
  right: ApiScheduleRecord,
): boolean => {
  if (left.day !== right.day) return false;
  if (
    toMinutes(left.start_time) >= toMinutes(right.end_time) ||
    toMinutes(right.start_time) >= toMinutes(left.end_time)
  ) {
    return false;
  }
  // Online needs no room and is shared, so only the section and instructor
  // clash there; a room clashes only between two on-site rows.
  return (
    Number(left.section_id) === Number(right.section_id) ||
    (left.mode !== "online" &&
      right.mode !== "online" &&
      Boolean(left.room_id) &&
      Number(left.room_id) === Number(right.room_id)) ||
    (Boolean(left.faculty_id) &&
      Number(left.faculty_id) === Number(right.faculty_id))
  );
};

export function optionsClash(left: DraftOption, right: DraftOption): boolean {
  return left.rows.some((row) =>
    right.rows.some((other) => rowsClash(row, other)),
  );
}

export function pickBestOptions(
  issues: DraftIssue[],
  alreadyChosen: DraftOption[] = [],
): Record<string, string> {
  const taken = [...alreadyChosen];
  const picks: Record<string, string> = {};
  for (const issue of issues) {
    const best = issue.options.find(
      (option) => !taken.some((other) => optionsClash(option, other)),
    );
    if (best) {
      picks[issue.key] = best.id;
      taken.push(best);
    }
  }
  return picks;
}

export function stillUnplaced(
  unplaced: UnplacedCourse[],
  rows: ApiScheduleRecord[],
): UnplacedCourse[] {
  const placed = new Set(rows.map(rowClassKey));
  return unplaced.filter(
    (course) => !placed.has(draftClassKey(course.section_id, course.course_id)),
  );
}
