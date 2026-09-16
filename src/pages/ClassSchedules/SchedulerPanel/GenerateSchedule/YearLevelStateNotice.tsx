import { CalendarCheck2, Lock } from "lucide-react";
import type { YearLevelScheduleState } from "./yearLevelGenerationEligibility";

const sectionsText = (state: YearLevelScheduleState) =>
  `${state.scheduledSectionCount} of ${state.sectionCount} section${state.sectionCount === 1 ? "" : "s"}`;

/**
 * Compact pill that sits beside the year-level picker. The full explanation
 * lives in its tooltip, so the picker row stays one line wide where it fits.
 */
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

/**
 * Says up front that a year level was already generated, so running the
 * generator again is a deliberate choice rather than a surprise on save.
 * Renders nothing for a year level that has no classes yet.
 */
export default function YearLevelStateNotice({
  state,
  className = "mt-3",
}: {
  state: YearLevelScheduleState | null;
  className?: string;
}) {
  if (!state || state.kind === "unscheduled") return null;

  if (state.kind === "locked") {
    return (
      <div
        role="status"
        className={`${className} flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-rose-800`}
      >
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-black">Locked</p>
          <p className="text-[11px] font-semibold leading-snug">
            Classes in {sectionsText(state)} are past drafting (submitted, approved or
            partly recalled). Recall the whole year level to generate again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className={`${className} flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900`}
    >
      <CalendarCheck2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-black">Already scheduled</p>
        <p className="text-[11px] font-semibold leading-snug">
          {sectionsText(state)} already have classes. Generating again replaces those
          draft classes when you save the result.
        </p>
      </div>
    </div>
  );
}
