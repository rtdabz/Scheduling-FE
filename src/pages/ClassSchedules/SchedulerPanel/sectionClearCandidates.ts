import type { ScheduleItem, Section, SectionDoneCandidate } from "./types";

/** Matches ScheduleController::REPLACEABLE_BATCH_STATUSES. */
const CLEARABLE_STATUSES: ScheduleItem["status"][] = ["draft", "completed", "revision"];

export function buildSectionClearCandidates(
  sections: Section[], schedules: ScheduleItem[], departmentId: number | null, semesterId: number | null,
): SectionDoneCandidate[] {
  if (departmentId === null || semesterId === null) return [];
  const rowsBySection = new Map<string, ScheduleItem[]>();
  schedules.forEach((schedule) => {
    const rows = rowsBySection.get(schedule.sectionId) ?? [];
    rows.push(schedule);
    rowsBySection.set(schedule.sectionId, rows);
  });
  return sections
    .filter((section) => Number(section.departmentId) === Number(departmentId) && Number(section.semesterId) === Number(semesterId))
    .map((section) => {
      const rows = rowsBySection.get(section.id) ?? [];
      const isLocked = rows.some((row) => !CLEARABLE_STATUSES.includes(row.status));
      const classCount = new Set(rows.map((row) => row.courseId || row.subjectId || row.courseCode)).size;
      return {
        sectionId: section.id, sectionName: section.name, yearLevel: section.yearLevel,
        requiredSubjects: classCount, plottedSubjects: classCount,
        scheduleIds: rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0),
        isReady: rows.length > 0 && !isLocked,
        blockedReason: isLocked ? "Locked for approval or instructor assignment" : rows.length === 0 ? "No loaded meetings to clear" : "",
      };
    })
    .sort((a, b) => a.yearLevel - b.yearLevel || a.sectionName.localeCompare(b.sectionName));
}
