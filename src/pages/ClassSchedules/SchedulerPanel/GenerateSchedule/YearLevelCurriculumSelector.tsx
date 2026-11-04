import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookMarked, Check, Loader2, X } from "lucide-react";
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
  sections: Section[];
  onApplied: (curriculumId: number) => void | Promise<void>;
  disabled?: boolean;
  /** "section" changes only the one section passed, offering curricula open to its program. */
  scope?: "year_level" | "section";
  /** Section scope: the section already has classes, which must stay in its curriculum. */
  hasClasses?: boolean;
  /** "icon" folds the picker behind an icon button that opens it as a popover. */
  variant?: "field" | "icon";
  /** Year-level scope: apply only to the sections passed, offering curricula open to their shared program. */
  restrictToSections?: boolean;
}

export default function YearLevelCurriculumSelector({
  departmentId,
  semesterId,
  yearLevel,
  sections,
  onApplied,
  disabled = false,
  scope = "year_level",
  hasClasses = false,
  variant = "field",
  restrictToSections = false,
}: Props) {
  const sectionScope = scope === "section";
  const { toast } = useToast();
  const cacheKey =
    departmentId === null ? null : activeCurriculaCacheKey(departmentId);
  const [activeCurricula, setCurricula] = useState<Curriculum[]>(
    () => (cacheKey ? getCachedData<Curriculum[]>(cacheKey) ?? [] : []),
  );
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (departmentId === null || cacheKey === null) {
      setCurricula([]);
      return;
    }

    let cancelled = false;
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
  const sectionKey = sections.map((section) => section.id).join(",");

  // A section only follows a curriculum open to its program, as the server requires.
  const programId = sectionScope || restrictToSections ? sections[0]?.programId ?? null : null;
  const curricula = useMemo(
    () =>
      programId === null
        ? activeCurricula
        : activeCurricula.filter(
            (curriculum) => curriculum.program_id === null || Number(curriculum.program_id) === Number(programId),
          ),
    [activeCurricula, programId],
  );
  // The saved curriculum stays visible even when it is no longer offered.
  const savedUnavailable =
    sectionScope && currentId !== null && !loading && !curricula.some((curriculum) => curriculum.id === currentId);

  useEffect(() => {
    setChoice(currentId);
  }, [currentId, yearLevel, sectionKey]);

  const [openedFor, setOpenedFor] = useState(sectionKey);
  if (openedFor !== sectionKey) {
    setOpenedFor(sectionKey);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selected = choice ?? currentId;
  const dirty = selected !== null && (selected !== currentId || isMixed || unassignedCount > 0);

  const apply = async () => {
    if (selected === null || departmentId === null || semesterId === null) return;

    setApplying(true);
    try {
      if (sectionScope) {
        const section = sections[0];
        if (!section) return;
        await curriculumService.assignCurriculumToSection(section.id, selected);
        const name = curricula.find((curriculum) => curriculum.id === selected)?.name ?? "the selected curriculum";
        toast.success("Curriculum Assigned", `${section.name} now follows "${name}".`);
      } else {
        const result = await curriculumService.assignCurriculumToYearLevel({
          semester_id: semesterId,
          department_id: departmentId,
          year_level: yearLevel,
          curriculum_id: selected,
          ...(restrictToSections ? { section_ids: sections.map((section) => Number(section.id)) } : {}),
        });
        toast.success("Curriculum Assigned", result.message);
      }
      await onApplied(selected);
      setOpen(false);
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

  const picker = (
    <div className="shrink-0">
      <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">
        <span className="flex items-center gap-1.5">
          <BookMarked className="h-3.5 w-3.5" aria-hidden />
          Curriculum
        </span>
        <select
          id={sectionScope ? "schedule-builder-curriculum-select" : "generator-curriculum-select"}
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
          {savedUnavailable && (
            <option value={currentId ?? ""}>
              {sections[0]?.curriculumName ?? "Saved curriculum"} — not available
            </option>
          )}
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
          <SelectedSummary
            curriculum={curricula.find((item) => item.id === selected) ?? null}
          />
          {dirty || applying ? (
            <button
              id={sectionScope ? "schedule-builder-apply-curriculum" : "generator-apply-curriculum"}
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
                  {sectionScope ? "Apply to section" : "Apply to year level"}
                </span>
              )}
            </button>
          ) : (
            <span
              role="status"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              {sectionScope ? "Applied to the section" : "Applied to year level"}
            </span>
          )}
        </div>
      )}

      {sectionScope && hasClasses && dirty && !needsChoice && (
        <p className="mt-2 text-xs font-semibold text-slate-600">
          Plotted classes must belong to the new curriculum. Clear them first if they do not; nothing is removed automatically.
        </p>
      )}

      {needsChoice && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-xs font-semibold text-amber-900">
            {sectionScope
              ? "This section has no curriculum yet. Choose one and apply it to see its courses."
              : isMixed
                ? "Sections in this year level follow different curricula. Choose one and apply it before generating."
                : `${unassignedCount} section${unassignedCount === 1 ? "" : "s"} in this year level ${unassignedCount === 1 ? "has" : "have"} no curriculum yet. Choose one and apply it before generating.`}
          </p>
        </div>
      )}

      {!loading && curricula.length === 0 && departmentId !== null && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
          <p className="text-xs font-semibold text-rose-900">
            {sectionScope
              ? "No active curriculum is available to this section's program."
              : "This department has no active curriculum. Publish one before generating a schedule."}
          </p>
        </div>
      )}
    </div>
  );

  if (variant === "field") return picker;

  const savedName =
    curricula.find((curriculum) => curriculum.id === currentId)?.code ?? sections[0]?.curriculumName ?? null;

  // The popover positions against the nearest positioned ancestor, so it can span the host panel.
  return (
    <div ref={popoverRef} className="shrink-0">
      <button
        id={sectionScope ? "schedule-builder-curriculum-toggle" : "generator-curriculum-toggle"}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={savedName ? `Curriculum: ${savedName}` : "Choose a curriculum"}
        title={savedName ? `Curriculum: ${savedName}` : "Choose a curriculum"}
        className={`relative inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition ${
          open
            ? "border-[#4e0a10] bg-[#4e0a10] text-white"
            : "border-slate-200 bg-white text-slate-600 hover:border-[#4e0a10]/40 hover:text-[#4e0a10]"
        }`}
      >
        <BookMarked className="h-4 w-4" aria-hidden />
        <span>Curriculum</span>
        {needsChoice && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" aria-hidden />
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Curriculum"
          className="absolute inset-x-3 top-full z-30 mt-1 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-2 top-2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {picker}
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
