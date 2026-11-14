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
      className={`inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-black ${
        locked
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex flex-col leading-tight">
        {locked ? "Locked" : "Scheduled"}
        <span className="text-[10px] font-semibold opacity-80">
          {state.scheduledSectionCount}/{state.sectionCount} sections
        </span>
      </span>
    </span>
  );
}
