import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import { useToast } from "../../../../context/ToastContext";
import { apiErrorMessage } from "../../../../lib/apiError";
import {
  alreadyResolvedFrom,
  conflictRuleLabel,
  describeConflictSchedule,
  fetchConflictRecommendations,
  fetchConflicts,
  fetchResolvedConflicts,
  refusalDetails,
  resolutionStatusLabel,
  resolveConflict,
  reviewConflict,
  type ConflictRecommendation,
  type ConflictResolution,
  type ConflictRule,
  type ResolutionRequest,
  type ScheduleConflict,
} from "../../../../lib/conflicts";

interface ResolveConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  semesterId: number | null;
  departmentId: number | null;
  focusScheduleId?: number | null;
  rules?: ConflictRule[];
  initialTab?: "open" | "resolved";
  onResolved: () => void;
}

type ConflictTab = "open" | "resolved";

const RESOLUTION_STATUS_CLASSES: Record<ConflictResolution["status"], string> = {
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  overridden: "border-amber-200 bg-amber-50 text-amber-800",
  reopened: "border-red-200 bg-red-50 text-red-800",
};

const departmentLabel = (name?: string | null, code?: string | null): string | null =>
  name && code ? `${name} (${code})` : name ?? code ?? null;

const otherDepartment = (
  conflict: ScheduleConflict,
  departmentId: number | null,
): { label: string; detail: string } | null => {
  if (departmentId === null) return null;

  if (conflict.rule === "faculty_conflict") {
    const schedule = conflict.schedules.find((row) =>
      row.assigning_department_id != null && Number(row.assigning_department_id) !== departmentId);
    const department = schedule
      ? departmentLabel(schedule.assigning_department_name, schedule.assigning_department_code)
      : null;
    if (schedule && department) {
      return {
        label: schedule.assigning_program_code ? `the ${schedule.assigning_program_code} program of ${department}` : department,
        detail: `${schedule.course_code ?? "This course"} is assigned to them, so only they can change its instructor.`,
      };
    }
  }

  const schedule = conflict.schedules.find((row) =>
    row.department_id != null && Number(row.department_id) !== departmentId);
  const label = schedule ? departmentLabel(schedule.department_name, schedule.department_code) : null;

  return schedule && label
    ? { label, detail: "One of these classes belongs to their department, so the change has to be made there." }
    : null;
};

const formatResolvedAt = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

export default function ResolveConflictModal({
  isOpen,
  onClose,
  semesterId,
  departmentId,
  focusScheduleId = null,
  rules,
  initialTab = "open",
  onResolved,
}: ResolveConflictModalProps) {
  const { toast } = useToast();
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [violations, setViolations] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recommendations, setRecommendations] = useState<{
    conflictId: string;
    options: ConflictRecommendation[] | null;
  } | null>(null);
  const [applyingRank, setApplyingRank] = useState<number | null>(null);
  const [tab, setTab] = useState<ConflictTab>(initialTab);
  const [resolutions, setResolutions] = useState<ConflictResolution[] | null>(null);

  const open = useMemo(
    () => (conflicts ?? []).filter((conflict) => !rules || rules.includes(conflict.rule)),
    [conflicts, rules],
  );
  const selected = useMemo(
    () => open.find((conflict) => conflict.id === selectedId) ?? null,
    [open, selectedId],
  );
  const selectedIndex = selected === null ? -1 : open.findIndex((conflict) => conflict.id === selected.id);

  const shownResolutions = useMemo(
    () => (resolutions ?? []).filter((entry) => !rules || rules.includes(entry.rule as ConflictRule)),
    [resolutions, rules],
  );

  const loadRecommendations = useCallback(async (conflictId: string) => {
    setRecommendations({ conflictId, options: null });
    let options: ConflictRecommendation[] = [];
    try {
      options = await fetchConflictRecommendations(conflictId);
    } catch {
    }
    setRecommendations((current) =>
      current?.conflictId === conflictId ? { conflictId, options } : current);
  }, []);

  const loadResolutions = useCallback(async (signal?: AbortSignal) => {
    try {
      const entries = await fetchResolvedConflicts({ semesterId, departmentId, signal });
      if (!signal?.aborted) setResolutions(entries);
    } catch (err) {
      if (signal?.aborted) return;
      setResolutions((current) => current ?? []);
      toast.error("Conflicts", apiErrorMessage(err, "Could not load the resolved conflicts."));
    }
  }, [departmentId, semesterId, toast]);

  const select = useCallback((conflict: ScheduleConflict) => {
    setSelectedId(conflict.id);
    setViolations([]);
    void loadRecommendations(conflict.id);
  }, [loadRecommendations]);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const scanned = await fetchConflicts({ semesterId, departmentId, signal });
      if (signal?.aborted) return;
      setConflicts(scanned);

      const shown = scanned.filter((conflict) => !rules || rules.includes(conflict.rule));
      const match = (focusScheduleId === null
        ? undefined
        : shown.find((conflict) => conflict.schedules.some((schedule) => schedule.id === focusScheduleId)))
        ?? shown[0];
      if (match) select(match);
    } catch (err) {
      if (signal?.aborted) return;
      setConflicts([]);
      toast.error("Conflicts", apiErrorMessage(err, "Could not load the conflict list."));
    }
  }, [departmentId, focusScheduleId, rules, select, semesterId, toast]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    void loadResolutions(controller.signal);

    return () => controller.abort();
  }, [load, loadResolutions]);

  const pick = (conflict: ScheduleConflict) => {
    void reviewConflict(conflict.id);
    select(conflict);
  };

  const replaceOpen = (remaining: ScheduleConflict[]) => {
    setConflicts(remaining);
    setSelectedId(null);
    setRecommendations(null);
    setViolations([]);
    onResolved();
    void loadResolutions();
    const shown = remaining.filter((conflict) => !rules || rules.includes(conflict.rule));
    const later = new Set(open.slice(selectedIndex + 1).map((conflict) => conflict.id));
    const next = shown.find((conflict) => later.has(conflict.id))
      ?? shown[Math.min(Math.max(selectedIndex, 0), shown.length - 1)];
    if (next) select(next);
  };

  const send = async (request: ResolutionRequest) => {
    if (!selected) return;
    setIsSubmitting(true);
    setViolations([]);
    try {
      const outcome = await resolveConflict(selected.id, request);
      replaceOpen(outcome.remaining_conflicts);
      toast.success("Conflicts", "The conflict is resolved and the change is saved.");
    } catch (err) {
      const stillOpen = alreadyResolvedFrom(err);
      if (stillOpen !== null) {
        replaceOpen(stillOpen);
        toast.info("Conflicts", "That conflict is already resolved. The list has been refreshed.");
        return;
      }

      const details = refusalDetails(err);
      setViolations(details);
      toast.error("Conflicts", details[0] ?? apiErrorMessage(err, "That change was refused, so nothing was saved."));
    } finally {
      setIsSubmitting(false);
      setApplyingRank(null);
    }
  };

  const applyRecommendation = (option: ConflictRecommendation) => {
    setApplyingRank(option.rank);
    void send({ ...option.payload, source: "recommendation" });
  };

  const shownRecommendations = recommendations !== null && recommendations.conflictId === selectedId
    ? recommendations.options
    : null;

  const tabs: ConflictTab[] = ["open", "resolved"];
  const owner = selected ? otherDepartment(selected, departmentId) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Resolve schedule conflicts"
      description="Every fix is checked against the saved timetable before it is kept. If the conflict is still there afterwards, nothing is saved."
      footer={
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
          Close
        </button>
      }
    >
      <div className="flex gap-1 border-b border-slate-200 px-4 pt-3 sm:px-5" role="tablist">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-bold transition-colors ${
              tab === name
                ? "border-[#4e0a10] text-[#4e0a10]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {name === "open"
              ? `Open${conflicts !== null ? ` (${open.length})` : ""}`
              : `Resolved${resolutions !== null ? ` (${shownResolutions.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "resolved" ? (
        <section className="p-4 sm:p-5">
          {resolutions === null ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading resolved conflicts…
            </p>
          ) : shownResolutions.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-xs font-semibold text-slate-500">
              No conflicts have been resolved this semester yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {shownResolutions.map((entry) => (
                <li key={entry.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${RESOLUTION_STATUS_CLASSES[entry.status]}`}>
                      {entry.status === "reopened"
                        ? <RotateCcw className="h-3 w-3" />
                        : entry.status === "overridden"
                          ? <ShieldAlert className="h-3 w-3" />
                          : <CheckCircle2 className="h-3 w-3" />}
                      {resolutionStatusLabel(entry.status)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {[formatResolvedAt(entry.resolved_at), entry.resolved_by ? `by ${entry.resolved_by}` : null]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600">
                    <span className="font-bold text-slate-800">Conflict: </span>
                    {entry.message || conflictRuleLabel(entry.rule)}
                  </p>
                  {entry.fix && (
                    <p className="mt-0.5 text-xs text-slate-600">
                      <span className="font-bold text-slate-800">Fix: </span>
                      {entry.fix}
                    </p>
                  )}
                  {entry.reason && (
                    <p className="mt-0.5 text-xs text-slate-600">
                      <span className="font-bold text-slate-800">Reason: </span>
                      {entry.reason}
                    </p>
                  )}
                  {entry.status === "reopened" && (
                    <p className="mt-1 text-[11px] font-semibold text-red-700">
                      This clash is back on the timetable. Fix it from the Open tab.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="space-y-3 p-4 sm:p-5">
          {conflicts === null ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning the timetable…
            </p>
          ) : open.length === 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-xs font-semibold text-emerald-800">
              {rules?.length === 1 && rules[0] === "faculty_conflict"
                ? "No instructor is double-booked this semester."
                : "No conflicts in this semester."}
            </p>
          ) : !selected ? (
            <button
              type="button"
              onClick={() => pick(open[0])}
              className="rounded-lg bg-[#4e0a10] px-3 py-2 text-xs font-bold text-white hover:bg-[#3a0809]"
            >
              Show the first conflict
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => pick(open[selectedIndex - 1])}
                  disabled={selectedIndex <= 0 || isSubmitting}
                  aria-label="Previous conflict"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Conflict {selectedIndex + 1} of {open.length}
                </p>
                <button
                  type="button"
                  onClick={() => pick(open[selectedIndex + 1])}
                  disabled={selectedIndex >= open.length - 1 || isSubmitting}
                  aria-label="Next conflict"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-lg border border-red-200 bg-white px-3 py-2.5">
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-red-700">
                  <AlertTriangle className="h-3 w-3" />
                  {conflictRuleLabel(selected.rule)}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{selected.message}</p>
                <div className="mt-2 grid gap-1">
                  {selected.schedules.map((schedule) => (
                    <p key={schedule.id} className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                      {describeConflictSchedule(schedule)}
                    </p>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <Sparkles className="h-3 w-3" /> Recommended fixes
                </p>
                {shownRecommendations === null ? (
                  <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Finding conflict-free options…
                  </p>
                ) : shownRecommendations.length === 0 ? (
                  owner ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-bold text-amber-900">Contact {owner.label} to fix this conflict.</p>
                      <p className="mt-0.5 text-[11px] font-medium text-amber-800">{owner.detail}</p>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500">
                      No placement suggestion is available here. Review the timetable in Schedule Builder or choose an instructor manually in Instructor Assignment.
                    </p>
                  )
                ) : (
                  <ol className="space-y-1.5" aria-label="Recommended fixes">
                    {shownRecommendations.slice(0, 3).map((option, index) => (
                      <li key={option.rank} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4e0a10] text-[11px] font-black text-white">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800">{option.summary}</p>
                          {option.reasons && option.reasons.length > 0 && (
                            <p className="mt-0.5 text-[10px] font-medium text-slate-500">{option.reasons.join(" · ")}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => applyRecommendation(option)}
                          disabled={isSubmitting}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 text-xs font-bold text-white hover:bg-[#3a0809] disabled:opacity-60"
                        >
                          {isSubmitting && applyingRank === option.rank && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Apply
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {violations.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  {violations.map((violation) => (
                    <li key={violation} className="text-[11px] font-semibold text-red-800">{violation}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
