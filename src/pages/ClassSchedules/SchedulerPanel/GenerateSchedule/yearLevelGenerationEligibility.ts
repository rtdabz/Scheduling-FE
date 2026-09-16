import type { ScheduleItem, Section } from "../types";

export const YEAR_LEVEL_GENERATION_BLOCKED_MESSAGE =
  "Schedules for this year level have already been plotted. Generation is unavailable unless the entire year level is recalled.";

const PLOTTING_STATUSES = new Set<ScheduleItem["status"]>(["draft", "completed"]);

export function canGenerateYearLevel(
  sections: Section[],
  schedules: ScheduleItem[],
  semesterId: number | string | null,
): boolean {
  if (sections.length === 0) return false;

  const sectionIds = new Set(sections.map((section) => String(section.id)));
  const schedulesBySection = new Map<string, ScheduleItem[]>();

  for (const schedule of schedules) {
    const sectionId = String(schedule.sectionId);
    if (!sectionIds.has(sectionId) || (semesterId !== null && Number(schedule.semesterId) !== Number(semesterId))) continue;
    schedulesBySection.set(sectionId, [...(schedulesBySection.get(sectionId) ?? []), schedule]);
  }

  if (schedulesBySection.size === 0) return true;

  const scopedSchedules = [...schedulesBySection.values()].flat();
  if (!scopedSchedules.some((schedule) => schedule.status === "revision")) {
    return scopedSchedules.every((schedule) => PLOTTING_STATUSES.has(schedule.status));
  }

  return sections.every((section) => {
    const sectionSchedules = schedulesBySection.get(String(section.id)) ?? [];
    return sectionSchedules.length > 0 && sectionSchedules.every((schedule) => schedule.status === "revision");
  });
}

/**
 * - `unscheduled`: no section of the year level has a class yet.
 * - `scheduled`: classes exist but are still editable; generating again and
 *   saving replaces them.
 * - `locked`: classes have moved past plotting (submitted, approved, or only
 *   partly recalled), so generation is refused.
 */
export type YearLevelScheduleState = {
  kind: "unscheduled" | "scheduled" | "locked";
  /** Sections of the year level that already have at least one class. */
  scheduledSectionCount: number;
  sectionCount: number;
};

export function getYearLevelScheduleState(
  sections: Section[],
  schedules: ScheduleItem[],
  semesterId: number | string | null,
): YearLevelScheduleState {
  const sectionIds = new Set(sections.map((section) => String(section.id)));
  const scheduledSectionIds = new Set(
    schedules
      .filter(
        (schedule) =>
          sectionIds.has(String(schedule.sectionId)) &&
          (semesterId === null || Number(schedule.semesterId) === Number(semesterId)),
      )
      .map((schedule) => String(schedule.sectionId)),
  );
  const base = {
    scheduledSectionCount: scheduledSectionIds.size,
    sectionCount: sections.length,
  };

  if (scheduledSectionIds.size === 0) return { kind: "unscheduled", ...base };

  return {
    kind: canGenerateYearLevel(sections, schedules, semesterId) ? "scheduled" : "locked",
    ...base,
  };
}
