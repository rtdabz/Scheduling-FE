import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Ban, Check, Settings2, Wrench } from "lucide-react";
import {
  describeAdjustment,
  failureStageLabel,
  impactLabels,
  isApplicableRecommendation,
  recommendationTarget,
  type GenerationRecommendation,
  type YearLevelGenerationFailure,
} from "./yearLevelGenerationFailure";
import ResolutionDetailsButton from "./ResolutionDetails";
import { resolutionDetailsForRecommendation } from "./resolutionDetailsData";

interface Props {
  failure: YearLevelGenerationFailure;
  busy: boolean;
  onApplyAndRetry: (recommendation: GenerationRecommendation) => void;
  onReviewConstraints: (sectionId: number | null) => void;
  onCancel: () => void;
}

const impactTone: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-rose-100 text-rose-700",
};

const outcomeLabels: Record<string, string> = {
  succeeded: "worked",
  failed: "no timetable",
  skipped_no_time: "skipped, out of time",
  not_applicable: "nothing to change",
};

export default function RecommendedAdjustmentPanel({ failure, busy, onApplyAndRetry, onReviewConstraints, onCancel }: Props) {
  const applicable = useMemo(
    () => failure.recommendations.filter(isApplicableRecommendation),
    [failure.recommendations],
  );
  const advisoryRecommendations = useMemo(
    () => failure.recommendations.filter((recommendation) => recommendation.adjustments.length === 0 && !recommendation.resolved && recommendation.status !== "resolved"),
    [failure.recommendations],
  );
  const resolvedRecommendations = useMemo(
    () => failure.recommendations.filter((recommendation) => recommendation.resolved || recommendation.status === "resolved"),
    [failure.recommendations],
  );
  // Resolved at render time rather than synced through an effect, so a report
  // that arrives with a different set of recommendations cannot leave the panel
  // pointing at one that is no longer offered.
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = applicable.find((recommendation) => recommendation.id === selectedId) ?? applicable[0] ?? null;
  const reviewSectionId = selected?.section_id ?? failure.bottleneck?.section_id ?? null;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
      <header className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">
              Recommended Adjustment &middot; {failureStageLabel(failure.stage)}
            </p>
            <h3 className="mt-0.5 text-base font-black text-slate-950">
              {failure.bottleneck?.section_name
                ? `${failure.bottleneck.section_name}${failure.bottleneck.course_code ? ` / ${failure.bottleneck.course_code}` : ""} could not be scheduled`
                : "The year level could not be scheduled"}
            </h3>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{failure.message}</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
              Nothing was saved. Pick an automatic adjustment below, or review a manual recommendation and change the constraints yourself.
            </p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {failure.bottleneck && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Detected cause</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{failure.bottleneck.detected_cause}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag label={`Section: ${failure.bottleneck.section_name || "—"}`} />
              {failure.bottleneck.course_code && <Tag label={`Course: ${failure.bottleneck.course_code}`} />}
              <Tag label={`Iterations: ${failure.bottleneck.iterations.toLocaleString()}`} />
              {failure.bottleneck.search_limit_reached && <Tag label="Search limit reached" />}
            </div>
          </div>
        )}

        {failure.blockingConstraints.length > 0 && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-rose-700">Blocking constraints</p>
            <ul className="mt-1.5 grid gap-1.5">
              {failure.blockingConstraints.map((constraint, index) => (
                <li key={`${constraint.code}-${index}`} className="text-xs font-semibold leading-relaxed text-slate-700">
                  <span className="font-black text-rose-700">{constraint.message}</span>
                  {constraint.suggested_action ? ` ${constraint.suggested_action}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Suggested adjustments</p>
          {applicable.length === 0 && advisoryRecommendations.length === 0 ? (
            <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-600">
              No recommendation is available for this failure. Review the constraints and free up rooms, patterns, or delivery
              modes before generating again.
            </div>
          ) : (
            <>
              {applicable.length > 0 && (
                <ul className="mt-1.5 grid gap-2">
                  {applicable.map((recommendation) => {
                    const active = recommendation.id === selected?.id;
                    return (
                      <li key={recommendation.id}>
                        <label
                          className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${active ? "border-[#4e0a10] bg-[#4e0a10]/5" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                        >
                          <input
                            type="radio"
                            name="recommended-adjustment"
                            checked={active}
                            onChange={() => setSelectedId(recommendation.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 border-slate-300 text-[#4e0a10]"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-black text-slate-950">{recommendation.title}</p>
                              {(recommendation.resolved || recommendation.status === "resolved") && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">Resolved</span>
                              )}
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${impactTone[recommendation.impact] ?? "bg-slate-100 text-slate-600"}`}>
                                {impactLabels[recommendation.impact] ?? recommendation.impact}
                              </span>
                            </div>
                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{recommendation.suggested_adjustment}</p>
                            <ul className="mt-1.5 grid gap-1">
                              {recommendation.adjustments.map((adjustment, index) => (
                                <li key={`${recommendation.id}-${index}`} className="flex items-start gap-1.5 text-[11px] font-bold text-slate-500">
                                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span>{describeAdjustment(adjustment)}</span>
                                </li>
                              ))}
                            </ul>
                            {active && (
                              <button
                                type="button"
                                onClick={() => onApplyAndRetry(recommendation)}
                                disabled={busy}
                                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-1.5 text-xs font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busy ? <LoadingSpinner className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                                Apply this to {recommendationTarget(recommendation)}
                              </button>
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {advisoryRecommendations.length > 0 && (
                <div className={`${applicable.length > 0 ? "mt-3" : "mt-1.5"} rounded-lg border border-sky-200 bg-sky-50/60 p-3`}>
                  <p className="text-[11px] font-black uppercase tracking-wide text-sky-700">Manual recommendations</p>
                  <ul className="mt-1.5 grid gap-2">
                    {advisoryRecommendations.map((recommendation) => (
                      <li key={recommendation.id} className="rounded-lg border border-sky-100 bg-white p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-slate-950">{recommendation.title}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${impactTone[recommendation.impact] ?? "bg-slate-100 text-slate-600"}`}>
                            {impactLabels[recommendation.impact] ?? recommendation.impact}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-600">{recommendation.detected_cause}</p>
                        <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{recommendation.suggested_adjustment}</p>
                        <button
                          type="button"
                          onClick={() => onReviewConstraints(recommendation.section_id ?? reviewSectionId)}
                          disabled={busy}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-sky-800 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Settings2 className="h-3.5 w-3.5" /> Review Constraints
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {resolvedRecommendations.length > 0 && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Resolved recommendations</p>
            <ul className="mt-1.5 grid gap-2">
              {resolvedRecommendations.map((recommendation) => (
                <li key={`resolved-${recommendation.id}`} className="rounded-lg border border-emerald-100 bg-white p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black text-slate-900">{recommendation.title}</p>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">Resolved</span>
                    <ResolutionDetailsButton details={resolutionDetailsForRecommendation(recommendation)} />
                  </div>
                  {recommendation.suggested_adjustment && (
                    <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-600">{recommendation.suggested_adjustment}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {failure.attempts.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Already tried by the generator</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {failure.attempts.map((attempt, index) => (
                <li key={`${attempt.strategy}-${index}`} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                  {attempt.label} &middot; {outcomeLabels[attempt.outcome] ?? attempt.outcome}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11px] font-bold text-slate-500">
          {selected
            ? `Applying updates ${selected.adjustments.length} setting${selected.adjustments.length === 1 ? "" : "s"} in the generator and generates again.`
            : advisoryRecommendations.length > 0
              ? "Review a manual recommendation above, update the constraints, then generate again."
            : "No automatic adjustment is available for this failure."}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Ban className="h-4 w-4" /> Cancel
          </button>
          <button
            type="button"
            onClick={() => onReviewConstraints(reviewSectionId)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Settings2 className="h-4 w-4" /> Review Constraints
          </button>
        </div>
      </footer>
    </section>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
      <Check className="h-3 w-3 text-slate-400" />
      {label}
    </span>
  );
}

import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
