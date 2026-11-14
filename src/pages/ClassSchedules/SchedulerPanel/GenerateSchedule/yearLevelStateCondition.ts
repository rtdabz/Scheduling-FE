import { CalendarCheck2, Lock } from "lucide-react";
import type { YearLevelScheduleState } from "./yearLevelGenerationEligibility";
import type { SchedulingCondition } from "./SchedulingConditions";

export const sectionsText = (state: YearLevelScheduleState) =>
  `${state.scheduledSectionCount} of ${state.sectionCount} section${state.sectionCount === 1 ? "" : "s"}`;

/**
 * The year level's scheduling state as a Scheduling conditions entry, with the same wording the
 * standalone banner used. Returns null when the year level has no classes yet.
 */
export function yearLevelStateCondition(state: YearLevelScheduleState | null): SchedulingCondition | null {
  if (!state || state.kind === "unscheduled") return null;

  if (state.kind === "locked") {
    return {
      id: "year-level-locked",
      tone: "critical",
      icon: Lock,
      title: "Locked",
      text: `Classes in ${sectionsText(state)} are past drafting (submitted, approved or partly recalled). Recall the whole year level to generate again.`,
    };
  }

  return {
    id: "year-level-scheduled",
    tone: "warning",
    icon: CalendarCheck2,
    title: "Already scheduled",
    text: `${sectionsText(state)} already have classes. Generating again replaces those draft classes when you save the result.`,
  };
}
