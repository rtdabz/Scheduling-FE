import { useState } from "react";
import { AlertTriangle, Ban, ChevronDown, ChevronRight, Hourglass, Settings2 } from "lucide-react";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
import RecommendationList from "./RecommendationList";
import {
  failureStageLabel,
  type GenerationRecommendation,
  type YearLevelGenerationFailure,
} from "./yearLevelGenerationFailure";

interface Props {
  failure: YearLevelGenerationFailure;
  busy: boolean;
  onApplyAndRetry: (recommendation: GenerationRecommendation) => void;
  onReviewConstraints: (sectionId: number | null) => void;
  onCancel: () => void;
  /** Provisional report only: hide it and keep waiting on the search. */
  onKeepSearching?: () => void;
}

const outcomeLabels: Record<string, string> = {
  succeeded: "worked",
  failed: "no timetable",
  skipped_no_time: "skipped, out of time",
  not_applicable: "nothing to change",
};

/**
 * A failed (or still searching) run as one summary: what blocked it in a
 * line, the fixes grouped by what they change, and the run's full evidence
 * folded away under Details. Every part used to be its own banner, and a
 * single failure could stack seven of them.
 */
export default function RecommendedAdjustmentPanel({ failure, busy, onApplyAndRetry, onReviewConstraints, onCancel, onKeepSearching }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const provisional = failure.provisional === true;
  const bottleneck = failure.bottleneck;
  const reviewSectionId = bottleneck?.section_id ?? null;
  // The retry ladder's own first attempt is the configuration as entered.
  const fixesTried = failure.attempts.filter(
    (attempt) => attempt.strategy !== "baseline" && attempt.strategy !== "preflight_pattern" && attempt.outcome === "failed",
  ).length;
  const where = bottleneck?.section_name
    ? `${bottleneck.section_name}${bottleneck.course_code ? ` · ${bottleneck.course_code}` : ""}`
    : null;
  const hasDetails =
    failure.blockingConstraints.length > 0 || failure.attempts.length > 0 || bottleneck !== null;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
      <header className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-slate-950">
                {provisional ? "No timetable yet" : failureStageLabel(failure.stage)}
              </h3>
              {provisional && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-sky-800">
                  <LoadingSpinner className="h-3 w-3" /> Still searching
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-semibold leading-snug text-slate-800">
              {where && <span className="font-black">{where}: </span>}
              {bottleneck?.detected_cause || failure.message}
            </p>
            <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
              {provisional
                ? "Based on the search so far. Applying a fix stops it and generates again."
                : `Nothing was saved.${fixesTried > 0 ? ` The generator already tried ${fixesTried} automatic fix${fixesTried === 1 ? "" : "es"}.` : ""} Apply a fix below to generate again.`}
            </p>
            {hasDetails && (
              <button
                type="button"
                onClick={() => setDetailsOpen((open) => !open)}
                aria-expanded={detailsOpen}
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-black text-amber-800 hover:underline"
              >
                {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Details
              </button>
            )}
          </div>
        </div>

        {detailsOpen && (
          <div className="mt-2 grid gap-2 rounded-lg border border-amber-200 bg-white p-3 text-xs font-semibold leading-relaxed text-slate-600">
            {bottleneck && failure.message !== bottleneck.detected_cause && <p>{failure.message}</p>}
            {failure.blockingConstraints.length > 0 && (
              <ul className="grid gap-1">
                {failure.blockingConstraints.map((constraint, index) => (
                  <li key={`${constraint.code}-${index}`}>
                    <span className="font-black text-rose-700">{constraint.message}</span>
                    {constraint.suggested_action ? ` ${constraint.suggested_action}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {failure.attempts.length > 0 && (
              <p>
                <span className="font-black text-slate-800">Tried: </span>
                {failure.attempts
                  .map((attempt) => `${attempt.label} (${outcomeLabels[attempt.outcome] ?? attempt.outcome})`)
                  .join(" · ")}
              </p>
            )}
            {bottleneck && (
              <p>
                <span className="font-black text-slate-800">Search: </span>
                {bottleneck.iterations.toLocaleString()} steps
                {bottleneck.search_limit_reached ? ", search limit reached" : ""}
              </p>
            )}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {failure.recommendations.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-600">
            No fix can be suggested for this. Review the constraints and free up rooms, days or delivery modes, then
            generate again.
          </p>
        ) : (
          <RecommendationList
            recommendations={failure.recommendations}
            attempts={failure.attempts}
            bottleneck={bottleneck}
            heading="Recommended fixes"
            busy={busy}
            onApply={onApplyAndRetry}
            onReviewConstraints={onReviewConstraints}
          />
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
        {provisional && onKeepSearching && (
          <button
            type="button"
            onClick={onKeepSearching}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Hourglass className="h-4 w-4" /> Keep searching
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Ban className="h-4 w-4" /> {provisional ? "Stop generating" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={() => onReviewConstraints(reviewSectionId)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Settings2 className="h-4 w-4" /> Review Constraints
        </button>
      </footer>
    </section>
  );
}
