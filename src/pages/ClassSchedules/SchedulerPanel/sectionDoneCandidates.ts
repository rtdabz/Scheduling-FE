import type { DepartmentSectionProgress, ScheduleItem, SectionDoneCandidate } from "./types";

/** Statuses whose timetable rows are still open for plotting, so still markable done. */
export const SECTION_DONE_ELIGIBLE_STATUSES: ScheduleItem["status"][] = ["draft", "revision"];

/**
 * Builds the checklist behind the bulk "mark sections done" modal: every section
 * of the department that is still being plotted, with the schedule rows that
 * would move to "completed" and the reason a section is not ready yet.
 *
 * Mirrors the single-section Done rule (every required course placed) so bulk
 * and per-section marking can never disagree.
 */
export function buildSectionDoneCandidates(
  departmentSectionProgress: DepartmentSectionProgress[],
  schedules: ScheduleItem[]
): SectionDoneCandidate[] {
  const editableIdsBySection = new Map<string, number[]>();
  schedules.forEach((schedule) => {
    if (!SECTION_DONE_ELIGIBLE_STATUSES.includes(schedule.status)) return;
    const ids = editableIdsBySection.get(schedule.sectionId) ?? [];
    ids.push(Number(schedule.id));
    editableIdsBySection.set(schedule.sectionId, ids);
  });

  return departmentSectionProgress
    .filter((section) => SECTION_DONE_ELIGIBLE_STATUSES.includes(section.status))
    .map((section) => {
      const scheduleIds = editableIdsBySection.get(section.sectionId) ?? [];
      const requiredSubjects = section.requiredSubjects ?? section.requiredCourses;
      const plottedSubjects = section.plottedSubjects ?? section.plottedCourses;
      const remaining = Math.max(0, requiredSubjects - plottedSubjects);
      const isReady = scheduleIds.length > 0 && remaining === 0;

      return {
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        yearLevel: section.yearLevel,
        requiredSubjects,
        plottedSubjects,
        scheduleIds,
        isReady,
        blockedReason: isReady
          ? ""
          : scheduleIds.length === 0
            ? "nothing plotted yet"
            : `${remaining} course${remaining === 1 ? "" : "s"} still unplaced`,
      };
    });
}
