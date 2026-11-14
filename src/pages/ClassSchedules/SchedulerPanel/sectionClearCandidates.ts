import { resetBlockReason } from "../../../lib/scheduleReset";
import type { ScheduleItem, Section, SectionDoneCandidate } from "./types";

/** Matches the server: Reset deletes sections whose loaded meetings are all editable, including returns. */
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
      const lockReason = resetBlockReason(rows.map((row) => row.status));
      const classCount = new Set(rows.map((row) => row.courseId || row.subjectId || row.courseCode)).size;
      return {
        sectionId: section.id, sectionName: section.name, yearLevel: section.yearLevel,
        requiredSubjects: classCount, plottedSubjects: classCount,
        scheduleIds: rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0),
        isReady: rows.length > 0 && lockReason === null,
        blockedReason: lockReason ?? (rows.length === 0 ? "No schedules to reset" : ""),
      };
    })
    .sort((a, b) => a.yearLevel - b.yearLevel || a.sectionName.localeCompare(b.sectionName));
}
