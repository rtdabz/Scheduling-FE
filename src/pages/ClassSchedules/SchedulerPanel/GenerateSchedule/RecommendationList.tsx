import { useMemo, useState } from "react";
import { CheckCheck, CheckCircle2, ChevronDown, ChevronRight, Settings2, Wrench } from "lucide-react";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
import {
  combineRecommendations,
  groupRecommendations,
  type RecommendationOption,
} from "./recommendationGroups";
import type {
  GenerationAttempt,
  GenerationBottleneck,
  GenerationRecommendation,
} from "./yearLevelGenerationFailure";
import ResolutionDetailsButton from "./ResolutionDetails";
import { resolutionDetailsForRecommendation } from "./resolutionDetailsData";

const NO_ATTEMPTS: GenerationAttempt[] = [];

interface Props {
  recommendations: GenerationRecommendation[];
  /** The run's retry ladder, to mark fixes it already tried alone. */
  attempts?: GenerationAttempt[];
  /** The run's blocking class, listed first and explained by the caller. */
  bottleneck?: GenerationBottleneck | null;
  heading: string;
  busy: boolean;
  /** Absent: the fixes are listed but cannot be applied from here. */
  onApply?: (recommendation: GenerationRecommendation) => void;
  onReviewConstraints?: (sectionId: number | null) => void;
}

/**
 * The generator's recommendations as one list: a row per thing to fix, its
 * alternatives as choices, and an Apply button that names the fix. "Apply
 * all" takes the chosen fix of every row at once. Advice the wizard cannot
 * apply itself follows as short lines.
 */
export default function RecommendationList({
  recommendations,
  attempts = NO_ATTEMPTS,
  bottleneck = null,
  heading,
  busy,
  onApply,
  onReviewConstraints,
}: Props) {
  const { groups, manual, resolved } = useMemo(
    () => groupRecommendations(recommendations, attempts, bottleneck),
    [attempts, bottleneck, recommendations],
  );
  // Chosen option per group, resolved at render time so a new report with
  // other options can never leave a row pointing at one it no longer has.
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const selectedOption = (key: string, options: RecommendationOption[]): RecommendationOption =>
    options.find((option) => option.recommendation.id === chosen[key]) ?? options[0];

  const applyAll = () =>
    onApply?.(combineRecommendations(groups.map((group) => selectedOption(group.key, group.options).recommendation)));

  if (groups.length === 0 && manual.length === 0 && resolved.length === 0) return null;

  return (
    <div>
      {groups.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
              {heading}
              <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">{groups.length}</span>
            </p>
            {onApply && groups.length > 1 && (
              <button
                type="button"
                onClick={applyAll}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#4e0a10] bg-white px-2.5 py-1 text-xs font-black text-[#4e0a10] transition hover:bg-[#4e0a10]/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Apply all ({groups.length})
              </button>
            )}
          </div>

          <ul className="mt-1.5 divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {groups.map((group) => {
              const selected = selectedOption(group.key, group.options);
              return (
                <li key={group.key} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-950">{group.target}</p>
                      {group.reason && (
                        <p className="mt-0.5 text-xs font-semibold leading-snug text-slate-600">{group.reason}</p>
                      )}
                    </div>
                    {onApply && (
                      <button
                        type="button"
                        onClick={() => onApply(selected.recommendation)}
                        disabled={busy}
                        aria-label={`${selected.action} to ${group.target}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-1.5 text-xs font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? <LoadingSpinner className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                        {selected.action}
                      </button>
                    )}
                  </div>

                  {group.options.length > 1 && (
                    <div role="radiogroup" aria-label={`Fixes for ${group.target}`} className="mt-2 flex flex-wrap gap-1.5">
                      {group.options.map((option) => {
                        const active = option === selected;
                        return (
                          <button
                            key={option.recommendation.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setChosen((current) => ({ ...current, [group.key]: option.recommendation.id }))}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-black transition ${
                              active
                                ? "bg-[#4e0a10] text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <p
                    className="mt-1.5 text-[11px] font-semibold leading-snug text-slate-500"
                    title={selected.recommendation.suggested_adjustment || undefined}
                  >
                    {group.options.length === 1 && <span className="font-black text-slate-700">{selected.label}: </span>}
                    {selected.effect}
                    {selected.triedAlone && " Tried alone already; pair it with another fix."}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {manual.length > 0 && (
        <div className={groups.length > 0 ? "mt-3" : ""}>
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Needs a manual change</p>
          <ul className="mt-1.5 grid gap-1.5">
            {manual.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <p className="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-600">
                  <span className="block font-black text-slate-900">
                    {item.title}
                    {item.sectionNames.length > 1 && (
                      <span className="font-bold text-slate-500"> · {item.sectionNames.join(", ")}</span>
                    )}
                  </span>
                  {item.action}
                </p>
                {onReviewConstraints && (
                  <button
                    type="button"
                    onClick={() => onReviewConstraints(item.sectionId)}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Settings2 className="h-3.5 w-3.5" /> Review
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {resolved.length > 0 && (
        <div className={groups.length > 0 || manual.length > 0 ? "mt-3" : ""}>
          <button
            type="button"
            onClick={() => setResolvedOpen((open) => !open)}
            aria-expanded={resolvedOpen}
            className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-emerald-700"
          >
            {resolvedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolved ({resolved.length})
          </button>
          {resolvedOpen && (
            <ul className="mt-1.5 grid gap-1">
              {resolved.map((recommendation) => (
                <li key={recommendation.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  {recommendation.title}
                  <ResolutionDetailsButton details={resolutionDetailsForRecommendation(recommendation)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
