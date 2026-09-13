import type { ScheduleItem, Section } from "../types";

export const YEAR_LEVEL_GENERATION_BLOCKED_MESSAGE =
  "Schedules for this year level have already been plotted. Generation is unavailable unless the entire year level is withdrawn.";

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
