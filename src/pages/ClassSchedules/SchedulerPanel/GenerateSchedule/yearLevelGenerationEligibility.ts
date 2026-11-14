import type { ScheduleItem, Section } from "../types";
import { EDITABLE_STATUSES } from "../../../../lib/scheduleStatuses";

export const YEAR_LEVEL_GENERATION_BLOCKED_MESSAGE =
  "This year level includes schedules under review or already approved. Only editable sections can be regenerated.";

export const SECTIONS_GENERATION_BLOCKED_MESSAGE =
  "The selected sections include schedules under review or already approved. Only editable sections can be regenerated.";

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
  return scopedSchedules.every((schedule) => EDITABLE_STATUSES.includes(schedule.status));
}

export type YearLevelScheduleState = {
  kind: "unscheduled" | "scheduled" | "locked";
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
