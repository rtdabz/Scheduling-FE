import { CalendarCheck2, Lock } from "lucide-react";
import type { YearLevelScheduleState } from "./yearLevelGenerationEligibility";
import { sectionsText } from "./yearLevelStateCondition";

export function YearLevelStateBadge({
  state,
}: {
  state: YearLevelScheduleState | null;
}) {
  if (!state || state.kind === "unscheduled") return null;

  const locked = state.kind === "locked";
  const Icon = locked ? Lock : CalendarCheck2;
  const detail = locked
    ? `Classes in ${sectionsText(state)} are past drafting. Recall the whole year level to generate again.`
    : `${sectionsText(state)} already have classes. Saving a new result replaces those draft classes.`;

  return (
    <span
      role="status"
      title={detail}
      aria-label={`${locked ? "Locked" : "Already scheduled"}: ${detail}`}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold ${
        locked
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-[#F5A623]/40 bg-[#F5A623]/10 text-[#8A5A12]"
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {locked ? "Locked" : "Scheduled"}
      <span className="font-normal tabular-nums opacity-80">
        {state.scheduledSectionCount}/{state.sectionCount}
      </span>
    </span>
  );
}
