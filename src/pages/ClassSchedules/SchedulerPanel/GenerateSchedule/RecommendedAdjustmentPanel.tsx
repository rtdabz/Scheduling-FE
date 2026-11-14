import { useState } from "react";
import { AlertTriangle, Ban, ChevronDown, ChevronRight, Hourglass, RefreshCw, Settings2 } from "lucide-react";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
import Modal from "../../../../components/ui/Modal";
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
  onKeepSearching?: () => void;
  onRetry?: () => void;
}

const outcomeLabels: Record<string, string> = {
  succeeded: "worked",
  failed: "no timetable",
  skipped_no_time: "skipped, out of time",
  not_applicable: "nothing to change",
};

export default function RecommendedAdjustmentPanel({ failure, busy, onApplyAndRetry, onReviewConstraints, onCancel, onKeepSearching, onRetry }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const provisional = failure.provisional === true;
  const timedOut = !provisional && failure.searchIncomplete === true;
  const bottleneck = failure.bottleneck;
  const reviewSectionId = bottleneck?.section_id ?? null;
  const fixesTried = failure.attempts.filter(
    (attempt) => attempt.strategy !== "baseline" && attempt.strategy !== "preflight_pattern" && attempt.outcome === "failed",
  ).length;
  const where = bottleneck?.section_name
    ? `${bottleneck.section_name}${bottleneck.course_code ? ` · ${bottleneck.course_code}` : ""}`
    : null;
  const hasDetails =
    failure.blockingConstraints.length > 0 || failure.attempts.length > 0 || bottleneck !== null;

  const title = provisional ? "No timetable yet" : timedOut ? "Search ran out of time" : failureStageLabel(failure.stage);

  return (
    <Modal
      appearance="workflow"
      icon={<AlertTriangle className="h-6 w-6" />}
      eyebrow="Schedule generation"
      isOpen
      onClose={onCancel}
      title={title}
      size="lg"
      busy={busy}
      closeOnOverlayClick={false}
      closeLabel={provisional ? "Close and stop generating" : "Close"}
      footer={(
        <>
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
          {timedOut && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-3 py-1.5 text-sm font-black text-white transition hover:bg-[#34070a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" /> Generate Again
            </button>
          )}
        </>
      )}
    >
      <div className="grid gap-3 px-4 py-4 sm:px-5">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          {provisional && (
            <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-sky-800">
              <LoadingSpinner className="h-3 w-3" /> Still searching
            </span>
          )}
          <p className="text-sm font-semibold leading-snug text-slate-800">
            {where && <span className="font-black">{where}: </span>}
            {bottleneck?.detected_cause || failure.message}
          </p>
          <p className="mt-1 text-xs font-semibold leading-snug text-slate-500">
            {provisional
              ? "Based on the search so far. Applying a fix stops it and generates again."
              : timedOut
              ? "Nothing was saved. This does not mean your settings cannot fit. Generate again with the same settings first, and apply a fix below only if it keeps failing."
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
        </div>

        <div>
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
      </div>
    </Modal>
  );
}
