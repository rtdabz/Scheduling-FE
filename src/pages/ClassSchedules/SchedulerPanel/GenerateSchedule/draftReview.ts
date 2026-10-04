import api from "../../../../lib/api";
import type { ApiScheduleRecord } from "../types";

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
}: {
  semesterId: number;
  departmentId: number;
  sectionIds: number[];
  rows: ApiScheduleRecord[];
  unplaced: UnplacedCourse[];
  preferredDays: string[] | null;
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
      })),
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
  const leftOnline = left.mode === "online";
  const rightOnline = right.mode === "online";
  return (
    Number(left.section_id) === Number(right.section_id) ||
    (!leftOnline &&
      !rightOnline &&
      Boolean(left.room_id) &&
      Number(left.room_id) === Number(right.room_id)) ||
    (Boolean(left.faculty_id) &&
      Number(left.faculty_id) === Number(right.faculty_id)) ||
    (leftOnline &&
      rightOnline &&
      Number(left.course_id ?? left.subject_id) ===
        Number(right.course_id ?? right.subject_id))
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
