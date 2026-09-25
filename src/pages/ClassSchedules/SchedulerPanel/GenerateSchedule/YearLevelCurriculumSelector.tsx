import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookMarked, Check, Loader2 } from "lucide-react";
import { curriculumService } from "../../../../services/curriculum/curriculumService";
import type { Curriculum } from "../../../../types/curriculum";
import { curriculumLifecycleBadge } from "../../../../types/curriculum";
import { useToast } from "../../../../context/ToastContext";
import type { Section } from "../types";
import { getCachedData, hasCachedData, loadCachedData } from "../../../../lib/dataCache";
import { activeCurriculaCacheKey } from "./generatorCache";

interface Props {
  departmentId: number | null;
  semesterId: number | null;
  yearLevel: number;
  /** The active sections of the selected year level. */
  sections: Section[];
  /** Refresh scheduler data so the new assignment reaches every consumer. */
  onApplied: (curriculumId: number) => void | Promise<void>;
  disabled?: boolean;
}

/**
 * Chooses which curriculum a year level follows before its schedule is generated.
 *
 * A department mid-transition teaches its incoming cohort from the new
 * curriculum while the upper years finish on the old one, so the course list a
 * year level is generated from is only well-defined once somebody names a
 * curriculum. The choice is written to the sections rather than held in wizard
 * state, so course lists, teaching assignments and printing all agree with what
 * the generator used.
 */
export default function YearLevelCurriculumSelector({
  departmentId,
  semesterId,
  yearLevel,
  sections,
  onApplied,
  disabled = false,
}: Props) {
  const { toast } = useToast();
  const cacheKey =
    departmentId === null ? null : activeCurriculaCacheKey(departmentId);
  const [curricula, setCurricula] = useState<Curriculum[]>(
    () => (cacheKey ? getCachedData<Curriculum[]>(cacheKey) ?? [] : []),
  );
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);

  useEffect(() => {
    if (departmentId === null || cacheKey === null) {
      setCurricula([]);
      return;
    }

    let cancelled = false;
    // The list a department runs changes rarely, so a cached copy renders the
    // picker immediately and only a cold key shows the spinner.
    const cached = getCachedData<Curriculum[]>(cacheKey);
    if (cached) setCurricula(cached);
    setLoading(!hasCachedData(cacheKey));

    loadCachedData<Curriculum[]>(cacheKey, () =>
      curriculumService.getActiveCurricula(departmentId),
    )
      .then((list) => {
        if (!cancelled) setCurricula(list);
      })
      .catch(() => {
        if (!cancelled && !cached) setCurricula([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, departmentId]);

  // What the sections of this year level currently follow. More than one
  // distinct value is a real state, not an error: a single section can be
  // piloted on the new curriculum ahead of its year level.
  const assignedIds = useMemo(
    () =>
      Array.from(
        new Set(
          sections
            .map((section) => section.curriculumId ?? null)
            .filter((id): id is number => id !== null),
        ),
      ),
    [sections],
  );
  const unassignedCount = useMemo(
    () => sections.filter((section) => (section.curriculumId ?? null) === null).length,
    [sections],
  );
  const isMixed = assignedIds.length > 1;
  const currentId = assignedIds.length === 1 ? assignedIds[0] : null;

  // Reset the pending choice whenever the year level or the stored assignment
  // changes, so the control always opens showing what is actually in effect.
  useEffect(() => {
    setChoice(currentId);
  }, [currentId, yearLevel]);

  const selected = choice ?? currentId;
  const dirty = selected !== null && (selected !== currentId || isMixed || unassignedCount > 0);

  const apply = async () => {
    if (selected === null || departmentId === null || semesterId === null) return;

    setApplying(true);
    try {
      const result = await curriculumService.assignCurriculumToYearLevel({
        semester_id: semesterId,
        department_id: departmentId,
        year_level: yearLevel,
        curriculum_id: selected,
      });
      toast.success("Curriculum Assigned", result.message);
      await onApplied(selected);
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Unable to assign the curriculum.";
      toast.error("Curriculum Not Assigned", message);
    } finally {
      setApplying(false);
    }
  };

  const needsChoice = unassignedCount > 0 || isMixed;

  return (
    <div className="shrink-0">
      <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">
        <span className="flex items-center gap-1.5">
          <BookMarked className="h-3.5 w-3.5" aria-hidden />
          Curriculum
        </span>
        <select
          id="generator-curriculum-select"
          value={selected ?? ""}
          disabled={disabled || loading || applying || curricula.length === 0}
          onChange={(event) =>
            setChoice(event.target.value === "" ? null : Number(event.target.value))
          }
          className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-900 outline-none transition focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/10 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">
            {loading
              ? "Loading curricula…"
              : isMixed
                ? "Mixed — choose one to unify"
                : "Select a curriculum"}
          </option>
          {curricula.map((curriculum) => {
            const badge = curriculumLifecycleBadge(curriculum);
            return (
              <option key={curriculum.id} value={curriculum.id}>
                {curriculum.name}
                {badge ? ` — ${badge.label}` : ""} ({curriculum.effective_school_year})
              </option>
            );
          })}
        </select>
      </label>

      {selected !== null && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {/* The badge is repeated outside the <option> because a select cannot
              render styled markup in its own list. */}
          <SelectedSummary
            curriculum={curricula.find((item) => item.id === selected) ?? null}
          />
          {/* Only offered when there is something to apply; the guided tour
              skips its Apply step while the button is absent. */}
          {dirty || applying ? (
            <button
              id="generator-apply-curriculum"
              type="button"
              onClick={apply}
              disabled={disabled || applying}
              className="h-9 shrink-0 rounded-lg bg-[#4e0a10] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {applying ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Applying
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Apply to year level
                </span>
              )}
            </button>
          ) : (
            <span
              role="status"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              Applied to {sections.length === 1 ? "the section" : `all ${sections.length} sections`}
            </span>
          )}
        </div>
      )}

      {needsChoice && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-xs font-semibold text-amber-900">
            {isMixed
              ? "Sections in this year level follow different curricula. Choose one and apply it before generating."
              : `${unassignedCount} section${unassignedCount === 1 ? "" : "s"} in this year level ${unassignedCount === 1 ? "has" : "have"} no curriculum yet. Choose one and apply it before generating.`}
          </p>
        </div>
      )}

      {!loading && curricula.length === 0 && departmentId !== null && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
          <p className="text-xs font-semibold text-rose-900">
            This department has no active curriculum. Publish one before generating a schedule.
          </p>
        </div>
      )}
    </div>
  );
}

function SelectedSummary({ curriculum }: { curriculum: Curriculum | null }) {
  if (!curriculum) return null;

  const badge = curriculumLifecycleBadge(curriculum);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-slate-600">
        {curriculum.code} · {curriculum.courses_count} courses
      </span>
      {badge && (
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.className}`}
        >
          {badge.label}
        </span>
      )}
    </div>
  );
}
