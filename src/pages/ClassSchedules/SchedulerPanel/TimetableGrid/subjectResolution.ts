import type { ScheduleItem, Subject } from "../types";

export const UNKNOWN_SUBJECT_CODE = "UNKNOWN";

export function buildSubjectIndex(subjects: Subject[]): Map<string, Subject> {
  return new Map(subjects.map((subject) => [String(subject.id), subject]));
}

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
