import type { ScheduleItem, Subject } from "../types";

/**
 * Resolves the course a schedule row renders as.
 *
 * A schedule can outlive its course. `/initial-data` returns only the courses on
 * the department's *active* curriculum — and an empty collection when no
 * curriculum is active — so an archived course, or a deactivated curriculum,
 * leaves the row in `schedules` with nothing in `subjects` to match it.
 *
 * The grid used to `return null` for that case. The row still occupied its slot,
 * still generated section and room conflicts, and still counted toward the
 * per-day class count, so the user saw an empty cell that refused every
 * placement with an unexplained conflict. Rendering a degraded card instead
 * keeps the slot visible and deletable.
 */
export const UNKNOWN_SUBJECT_CODE = "UNKNOWN";

export function buildSubjectIndex(subjects: Subject[]): Map<string, Subject> {
  return new Map(subjects.map((subject) => [String(subject.id), subject]));
}

/** An inert stand-in: no hours, no units, inactive, so nothing derives work from it. */
export function placeholderSubject(subjectId: string): Subject {
  return {
    id: subjectId,
    code: UNKNOWN_SUBJECT_CODE,
    name: `Unknown course (#${subjectId}) — no longer in the active curriculum`,
    units: 0,
    lectureHours: 0,
    labHours: 0,
    category: "minor",
    semester: "1st",
    departmentId: null,
    yearLevel: 1,
    roomTypeRequired: "lecture",
    status: "inactive",
  };
}

export function resolveScheduleSubject(
  schedule: Pick<ScheduleItem, "subjectId">,
  subjectsById: Map<string, Subject>,
): { subject: Subject; isPlaceholder: boolean } {
  const subject = subjectsById.get(String(schedule.subjectId));

  return subject
    ? { subject, isPlaceholder: false }
    : { subject: placeholderSubject(String(schedule.subjectId)), isPlaceholder: true };
}
