import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ClipboardX, Loader2, Pencil, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import { useToast } from "../../../../context/ToastContext";
import { apiErrorMessage } from "../../../../lib/apiError";
import { overloadConfirmationFrom, type OverloadConfirmation } from "../../../../lib/overloadConfirmation";
import OverloadConfirmationModal from "../../../../components/faculty/OverloadConfirmationModal";
import RecommendedOptionList from "../components/RecommendedOptionList";
import { FULL_DAY_NAMES } from "../../../../lib/timeGrid";
import {
  alreadyResolvedFrom,
  conflictRuleLabel,
  describeConflictSchedule,
  fetchConflictRecommendations,
  fetchConflicts,
  fetchResolvedConflicts,
  fetchRuleIssues,
  isReplottable,
  overrideConflict,
  refusalDetails,
  resolutionActionLabel,
  resolutionMethodLabel,
  resolutionStatusLabel,
  ruleIssueLabel,
  resolveConflict,
  reviewConflict,
  type ConflictRecommendation,
  type ConflictResolution,
  type RuleIssue,
  type ConflictRule,
  type ConflictSchedule,
  type ResolutionAction,
  type ResolutionRequest,
  type ScheduleConflict,
} from "../../../../lib/conflicts";

export interface ResolveConflictOption {
  id: number;
  label: string;
}

interface ResolveConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  semesterId: number | null;
  departmentId: number | null;
  rooms: ResolveConflictOption[];
  faculties: ResolveConflictOption[];
  canUpdateSchedule: boolean;
  canAssignInstructor: boolean;
  /**
   * The class the user clicked to get here. Its conflict is selected once the
   * first scan answers, so the badge they clicked and this dialog are one flow
   * rather than two. A row the server reports no conflict for simply leaves the
   * list unselected.
   */
  focusScheduleId?: number | null;
  /**
   * Narrows the list to these rules. Instructor Assignment passes
   * `faculty_conflict`, because that is the only family whose fix -- change who
   * teaches, or let it stand -- belongs on that screen. Left out, every rule is
   * listed.
   */
  rules?: ConflictRule[];
  /** The tab shown first; the caller opens on Resolved when nothing is open. */
  initialTab?: "open" | "resolved";
  /**
   * Opens a class in the Schedule Builder's placement dialog, where its
   * alternatives are offered. Given, the Rule issues tab is shown and each
   * editable issue gets a fix button; left out, the tab is not offered.
   */
  onOpenInBuilder?: (scheduleId: number) => void;
  /** Called after any successful write so the caller reloads. */
  onResolved: () => void;
}

const DELIVERY_MODES = [
  { value: "on-site", label: "On-site" },
  { value: "online", label: "Online" },
  { value: "field", label: "Field" },
];

/** The actions this modal applies itself, in the order the server lists them. */
const APPLIABLE: ResolutionAction[] = [
  "move_schedule",
  "change_room",
  "change_delivery_mode",
  "reassign_instructor",
];

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#4e0a10] focus:outline-none";

const hhmm = (time: string): string => time.slice(0, 5);

/** Green for fixed, amber for allowed to stand, red for back on the open list. */
const RESOLUTION_STATUS_CLASSES: Record<ConflictResolution["status"], string> = {
  resolved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  overridden: "border-amber-200 bg-amber-50 text-amber-800",
  reopened: "border-red-200 bg-red-50 text-red-800",
};

const formatResolvedAt = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

/**
 * The Resolve dialog: what is clashing, which class to change, and how.
 *
 * Everything it can do maps to an action the server already knows how to
 * validate, so nothing here decides whether a fix worked. The server re-scans
 * inside the same transaction as the write; this component only renders what
 * comes back. A refusal is shown with every violation the server named, and the
 * timetable is untouched -- the whole resolution rolled back.
 *
 * Recommended fixes are resolve requests too: each option carries the exact
 * body to send, so Apply and the manual forms share one path.
 */
export default function ResolveConflictModal({
  isOpen,
  onClose,
  semesterId,
  departmentId,
  rooms,
  faculties,
  canUpdateSchedule,
  canAssignInstructor,
  focusScheduleId = null,
  rules,
  initialTab = "open",
  onOpenInBuilder,
  onResolved,
}: ResolveConflictModalProps) {
  const { toast } = useToast();
  // null until the first scan answers. Kept as a sentinel rather than a second
  // `isLoading` flag so the opening effect never writes state synchronously.
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [action, setAction] = useState<ResolutionAction | null>(null);
  const [form, setForm] = useState<ResolutionRequest | null>(null);
  const [reason, setReason] = useState("");
  const [violations, setViolations] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The server's pro bono question for a reassignment, asked before anything is
  // written. Answering No sends nothing, so the conflict stays exactly as it was.
  const [overloadPrompt, setOverloadPrompt] = useState<{
    confirmation: OverloadConfirmation;
    request: ResolutionRequest;
  } | null>(null);
  // Ranked fixes for the selected conflict, tagged with the conflict they were
  // asked for so a late answer for an earlier selection is simply not shown.
  // `options: null` while the request is in flight.
  const [recommendations, setRecommendations] = useState<{
    conflictId: string;
    options: ConflictRecommendation[] | null;
  } | null>(null);
  const [applyingRank, setApplyingRank] = useState<number | null>(null);
  const [tab, setTab] = useState<"open" | "resolved" | "issues">(initialTab);
  // null until the Rule issues tab is first opened: it re-runs every rule on
  // every class, so it is read when asked for rather than with the list.
  const [ruleIssues, setRuleIssues] = useState<RuleIssue[] | null>(null);
  // null until the Resolved tab is first opened, and again after any write so
  // the next visit reads the new entry rather than a stale list.
  const [resolutions, setResolutions] = useState<ConflictResolution[] | null>(null);

  // Filtered where the list is read rather than where it is stored, so a write
  // that answers with the whole open set does not have to know about the filter.
  const open = useMemo(
    () => (conflicts ?? []).filter((conflict) => !rules || rules.includes(conflict.rule)),
    [conflicts, rules],
  );
  // Derived, so a conflict someone else resolved simply stops being selected
  // and the panel falls back to its placeholder.
  const selected = useMemo(
    () => open.find((conflict) => conflict.id === selectedId) ?? null,
    [open, selectedId],
  );
  const target = useMemo<ConflictSchedule | null>(
    () => selected?.schedules.find((schedule) => schedule.id === targetId) ?? null,
    [selected, targetId],
  );

  /**
   * Scan, and -- when the dialog was opened from a class on the timetable --
   * land on that class's conflict.
   *
   * The selection belongs to the scan rather than to a separate effect: it
   * happens once, on the list this dialog opened with, so a later write that
   * replaces the list cannot drag the user back to where they came in.
   */
  const loadRecommendations = useCallback(async (conflictId: string) => {
    setRecommendations({ conflictId, options: null });
    let options: ConflictRecommendation[] = [];
    try {
      options = await fetchConflictRecommendations(conflictId);
    } catch {
      // A failed or stale (404) lookup leaves the manual fixes, which are
      // always there; it is not worth an error toast on top of the conflict.
    }
    setRecommendations((current) =>
      current?.conflictId === conflictId ? { conflictId, options } : current);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const scanned = await fetchConflicts({ semesterId, departmentId, signal });
      if (signal?.aborted) return;
      setConflicts(scanned);

      if (focusScheduleId === null) return;
      const match = scanned.find((conflict) =>
        (!rules || rules.includes(conflict.rule))
        && conflict.schedules.some((schedule) => schedule.id === focusScheduleId));
      if (!match) return;

      const clicked = match.schedules.find((schedule) => schedule.id === focusScheduleId);
      const editable = clicked && isReplottable(clicked)
        ? clicked
        : match.schedules.find(isReplottable) ?? match.schedules[0];
      setSelectedId(match.id);
      setTargetId(editable.id);
      void loadRecommendations(match.id);
    } catch (err) {
      if (signal?.aborted) return;
      setConflicts([]);
      toast.error("Conflicts", apiErrorMessage(err, "Could not load the conflict list."));
    }
  }, [departmentId, focusScheduleId, loadRecommendations, rules, semesterId, toast]);

  // The dialog is mounted only while it is open, so one scan on mount is the
  // whole of its loading: every later list comes back with a write's response.
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    return () => controller.abort();
  }, [load]);

  const loadResolutions = async () => {
    try {
      setResolutions(await fetchResolvedConflicts({ semesterId, departmentId }));
    } catch (err) {
      setResolutions([]);
      toast.error("Conflicts", apiErrorMessage(err, "Could not load the resolved conflicts."));
    }
  };

  const loadRuleIssues = async () => {
    try {
      setRuleIssues(await fetchRuleIssues({ semesterId, departmentId }));
    } catch (err) {
      setRuleIssues([]);
      toast.error("Conflicts", apiErrorMessage(err, "Could not check the timetable's rules."));
    }
  };

  const showTab = (next: "open" | "resolved" | "issues") => {
    setTab(next);
    if (next === "resolved" && resolutions === null) void loadResolutions();
    if (next === "issues" && ruleIssues === null) void loadRuleIssues();
  };

  const tabs = onOpenInBuilder
    ? (["open", "resolved", "issues"] as const)
    : (["open", "resolved"] as const);

  // Filtered like the open list, so Instructor Assignment sees only its rule.
  const shownResolutions = useMemo(
    () => (resolutions ?? []).filter((entry) => !rules || rules.includes(entry.rule as ConflictRule)),
    [resolutions, rules],
  );

  const pick = (conflict: ScheduleConflict) => {
    const editable = conflict.schedules.find(isReplottable) ?? conflict.schedules[0];
    setSelectedId(conflict.id);
    setTargetId(editable.id);
    void reviewConflict(conflict.id);
    setAction(null);
    setForm(null);
    setReason("");
    setViolations([]);
    void loadRecommendations(conflict.id);
  };

  const chooseAction = (next: ResolutionAction, schedule: ConflictSchedule) => {
    setAction(next);
    setViolations([]);
    setForm(next === "move_schedule"
      ? {
        action: "move_schedule",
        schedule_id: schedule.id,
        day: schedule.day,
        start_time: hhmm(schedule.start_time),
        end_time: hhmm(schedule.end_time),
      }
      : next === "change_room"
        ? { action: "change_room", schedule_id: schedule.id, room_id: schedule.room_id }
        : next === "change_delivery_mode"
          ? { action: "change_delivery_mode", schedule_id: schedule.id, mode: schedule.mode }
          : { action: "reassign_instructor", schedule_id: schedule.id, faculty_id: schedule.faculty_id });
  };

  // Every write answers with the open list, so the panel is replaced rather
  // than re-fetched, and a 409 means someone else already fixed it.
  const settle = (outcome: { status: string; remaining_conflicts: ScheduleConflict[] }) => {
    setConflicts(outcome.remaining_conflicts);
    setSelectedId(null);
    setTargetId(null);
    setAction(null);
    setForm(null);
    setReason("");
    setViolations([]);
    setRecommendations(null);
    setResolutions(null);
    onResolved();
    toast.success(
      "Conflicts",
      outcome.status === "overridden"
        ? "The conflict was allowed to stand, with your reason on the record."
        : "The conflict is resolved and the change is saved.",
    );
  };

  const handleFailure = (err: unknown, fallback: string) => {
    const stillOpen = alreadyResolvedFrom(err);
    if (stillOpen !== null) {
      setConflicts(stillOpen);
      setSelectedId(null);
      setAction(null);
      setForm(null);
      setRecommendations(null);
      setResolutions(null);
      onResolved();
      toast.info("Conflicts", "That conflict is already resolved. The list has been refreshed.");
      return;
    }

    const details = refusalDetails(err);
    setViolations(details);
    toast.error("Conflicts", details[0] ?? apiErrorMessage(err, fallback));
  };

  /**
   * One path for a manual fix and a recommended one: both are a resolve request,
   * and both answer the pro bono question the same way.
   */
  const send = async (request: ResolutionRequest, confirmOverload = false) => {
    if (!selected) return;
    setIsSubmitting(true);
    setViolations([]);
    try {
      settle(await resolveConflict(selected.id, {
        ...request,
        reason: reason.trim() || undefined,
        // Only after the user has seen the pro bono question: resolving the
        // clash is not consent to push the instructor past their Basic Load.
        confirm_overload: confirmOverload || undefined,
      }));
      setOverloadPrompt(null);
    } catch (err) {
      const confirmation = overloadConfirmationFrom(err);
      if (confirmation !== null) {
        setOverloadPrompt({ confirmation, request });
        return;
      }
      setOverloadPrompt(null);
      handleFailure(err, "That change was refused, so nothing was saved.");
    } finally {
      setIsSubmitting(false);
      setApplyingRank(null);
    }
  };

  const submit = () => {
    if (form) void send(form);
  };

  const applyRecommendation = (option: ConflictRecommendation) => {
    setApplyingRank(option.rank);
    setAction(null);
    setForm(null);
    void send({ ...option.payload, source: "recommendation" });
  };

  const shownRecommendations = recommendations !== null && recommendations.conflictId === selectedId
    ? recommendations.options
    : null;

  const submitOverride = async () => {
    if (!selected || reason.trim().length < 3) return;
    setIsSubmitting(true);
    setViolations([]);
    try {
      settle(await overrideConflict(selected.id, reason.trim()));
    } catch (err) {
      handleFailure(err, "The override was refused.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const allowed = (option: ResolutionAction): boolean =>
    option === "reassign_instructor" ? canAssignInstructor : canUpdateSchedule;

  const canSubmit = form !== null
    && !isSubmitting
    && (form.action !== "reassign_instructor" || form.faculty_id !== undefined)
    && (form.action !== "move_schedule" || Boolean(form.day && form.start_time && form.end_time));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Resolve schedule conflicts"
      description="Every fix is checked against the saved timetable before it is kept. If the conflict is still there afterwards, nothing is saved."
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            Close
          </button>
          {tab !== "open" ? null : action === "request_override" ? (
            <button
              type="button"
              onClick={submitOverride}
              disabled={isSubmitting || reason.trim().length < 3}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              Allow it to stand
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-2 text-xs font-bold text-white hover:bg-[#3a0809] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Apply and re-check
            </button>
          )}
        </>
      }
    >
      <div className="flex gap-1 border-b border-slate-200 px-4 pt-3 sm:px-5" role="tablist">
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => showTab(name)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-bold transition-colors ${
              tab === name
                ? "border-[#4e0a10] text-[#4e0a10]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {name === "open"
              ? `Open${conflicts !== null ? ` (${open.length})` : ""}`
              : name === "resolved"
                ? `Resolved${resolutions !== null ? ` (${shownResolutions.length})` : ""}`
                : `Rule issues${ruleIssues !== null ? ` (${ruleIssues.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "issues" ? (
        <section className="p-4 sm:p-5">
          <p className="mb-3 text-[11px] font-semibold text-slate-500">
            Saved classes that passed every rule when they were placed but no longer do, because the data a rule
            reads has changed since: a room taken out of service, an instructor's availability, operating hours.
          </p>
          {ruleIssues === null ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking every class against the current rules…
            </p>
          ) : ruleIssues.length === 0 ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-xs font-semibold text-emerald-800">
              Every saved class still meets the scheduling rules.
            </p>
          ) : (
            <ul className="space-y-2">
              {ruleIssues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2.5">
                  <ClipboardX className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase tracking-wide text-amber-800">{ruleIssueLabel(issue.rule)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-700">{issue.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{describeConflictSchedule(issue.schedule)}</p>
                    {!isReplottable(issue.schedule) && (
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-slate-400">
                        Locked at {issue.schedule.status.replace(/_/g, " ")} — recall it to move the class
                      </p>
                    )}
                  </div>
                  {onOpenInBuilder && isReplottable(issue.schedule) && (
                    <button
                      type="button"
                      onClick={() => onOpenInBuilder(issue.schedule.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#4e0a10] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#3a0809]"
                    >
                      <Pencil className="h-3 w-3" />
                      Fix in Schedule Builder
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : tab === "resolved" ? (
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${RESOLUTION_STATUS_CLASSES[entry.status]}`}>
                      {entry.status === "reopened"
                        ? <RotateCcw className="h-3 w-3" />
                        : entry.status === "overridden"
                          ? <ShieldAlert className="h-3 w-3" />
                          : <CheckCircle2 className="h-3 w-3" />}
                      {resolutionStatusLabel(entry.status)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {resolutionMethodLabel(entry)}
                    </span>
                    <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                      {conflictRuleLabel(entry.rule)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    {entry.message || conflictRuleLabel(entry.rule)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {[formatResolvedAt(entry.resolved_at), entry.resolved_by ? `by ${entry.resolved_by}` : null]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                  {entry.reason && (
                    <p className="mt-1 text-[11px] italic text-slate-600">“{entry.reason}”</p>
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
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] sm:p-5">
        <section className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">
            Open conflicts{open.length > 0 ? ` (${open.length})` : ""}
          </h3>
          {conflicts === null ? (
            <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning the timetable…
            </p>
          ) : open.length === 0 ? (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-xs font-semibold text-emerald-800">
              {rules?.length === 1 && rules[0] === "faculty_conflict"
                ? "No instructor is double-booked this semester."
                : "No conflicts in this semester."}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {open.map((conflict) => (
                <li key={conflict.id}>
                  <button
                    type="button"
                    onClick={() => pick(conflict)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      conflict.id === selectedId
                        ? "border-[#4e0a10] bg-[#4e0a10]/5"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-red-700">
                      <AlertTriangle className="h-3 w-3" />
                      {conflictRuleLabel(conflict.rule)}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-slate-700">{conflict.message}</span>
                    {conflict.schedules.map((schedule) => (
                      <span key={schedule.id} className="mt-1 block text-[11px] text-slate-500">
                        {describeConflictSchedule(schedule)}
                      </span>
                    ))}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Fix this conflict</h3>
          {!selected || !target ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Choose a conflict to see what can be done about it.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <Sparkles className="h-3 w-3" /> Recommended fixes
                </p>
                {shownRecommendations === null ? (
                  <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin" /> Finding conflict-free options…
                  </p>
                ) : shownRecommendations.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500">
                    No automatic fix was found. Choose a change manually below.
                  </p>
                ) : (
                  <RecommendedOptionList
                    label="Recommended fixes"
                    isBusy={isSubmitting}
                    busyKey={applyingRank === null ? null : String(applyingRank)}
                    items={shownRecommendations.map((option) => ({
                      key: String(option.rank),
                      body: (
                        <>
                          <p className="text-xs font-semibold text-slate-700">{option.summary}</p>
                          {option.reasons && option.reasons.length > 0 && (
                            <p className="mt-0.5 text-[10px] font-medium text-slate-500">{option.reasons.join(" · ")}</p>
                          )}
                        </>
                      ),
                      tag: option.requires_overload_confirmation ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          Over Basic Load
                        </span>
                      ) : null,
                    }))}
                    onApply={(key) => {
                      const option = shownRecommendations.find((candidate) => String(candidate.rank) === key);
                      if (option) applyRecommendation(option);
                    }}
                  />
                )}
              </div>

              <p className="border-t border-slate-200 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Or choose a change manually
              </p>

              <fieldset className="space-y-1.5">
                <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Class to change</legend>
                {selected.schedules.map((schedule) => (
                  <label
                    key={schedule.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold ${
                      schedule.id === targetId ? "border-[#4e0a10] bg-white" : "border-slate-200 bg-white"
                    } ${isReplottable(schedule) ? "text-slate-700" : "text-slate-400"}`}
                  >
                    <input
                      type="radio"
                      name="conflict-target"
                      checked={schedule.id === targetId}
                      onChange={() => {
                        setTargetId(schedule.id);
                        setAction(null);
                        setForm(null);
                      }}
                    />
                    <span className="min-w-0">
                      {describeConflictSchedule(schedule)}
                      {!isReplottable(schedule) && (
                        <span className="mt-0.5 block text-[10px] font-bold uppercase text-amber-700">
                          Locked at {schedule.status.replace(/_/g, " ")} — only its instructor can change here
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="flex flex-wrap gap-1.5">
                {selected.resolution_options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={
                      (APPLIABLE.includes(option) && !allowed(option))
                      || (option === "request_override" && !canAssignInstructor)
                    }
                    onClick={() => {
                      if (option === "request_override") {
                        setAction("request_override");
                        setForm(null);
                        setViolations([]);
                        return;
                      }
                      if (APPLIABLE.includes(option)) chooseAction(option, target);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      action === option
                        ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {resolutionActionLabel(option)}
                  </button>
                ))}
              </div>

              {form?.action === "move_schedule" && (
                <div className="grid grid-cols-3 gap-2">
                  <label className="col-span-3 sm:col-span-1">
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">Day</span>
                    <select className={fieldClass} value={form.day ?? ""} onChange={(event) => setForm({ ...form, day: event.target.value })}>
                      {FULL_DAY_NAMES.map((day) => <option key={day} value={day}>{day}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">Start</span>
                    <input type="time" className={fieldClass} value={form.start_time ?? ""} onChange={(event) => setForm({ ...form, start_time: event.target.value })} />
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-bold text-slate-600">End</span>
                    <input type="time" className={fieldClass} value={form.end_time ?? ""} onChange={(event) => setForm({ ...form, end_time: event.target.value })} />
                  </label>
                </div>
              )}

              {form?.action === "change_room" && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-slate-600">Room</span>
                  <select
                    className={fieldClass}
                    value={form.room_id ?? ""}
                    onChange={(event) => setForm({ ...form, room_id: event.target.value === "" ? null : Number(event.target.value) })}
                  >
                    <option value="">No room</option>
                    {rooms.map((room) => <option key={room.id} value={room.id}>{room.label}</option>)}
                  </select>
                </label>
              )}

              {form?.action === "change_delivery_mode" && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-slate-600">Delivery mode</span>
                  <select className={fieldClass} value={form.mode ?? ""} onChange={(event) => setForm({ ...form, mode: event.target.value })}>
                    {DELIVERY_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                  </select>
                </label>
              )}

              {form?.action === "reassign_instructor" && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-slate-600">Instructor</span>
                  <select
                    className={fieldClass}
                    value={form.faculty_id ?? ""}
                    onChange={(event) => setForm({ ...form, faculty_id: event.target.value === "" ? null : Number(event.target.value) })}
                  >
                    <option value="">No instructor</option>
                    {faculties.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.label}</option>)}
                  </select>
                </label>
              )}

              {(form !== null || action === "request_override") && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold text-slate-600">
                    Reason{action === "request_override" ? " (required)" : " (optional)"}
                  </span>
                  <textarea
                    rows={2}
                    className={fieldClass}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={action === "request_override"
                      ? "Why this clash is allowed to stand."
                      : "Recorded with the change in the schedule history."}
                  />
                </label>
              )}

              {action === "request_override" && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                  Both meetings stay where they are and are marked as approved together. The mark is dropped
                  the moment either one changes instructor, day or time.
                </p>
              )}

              {violations.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  {violations.map((violation) => (
                    <li key={violation} className="text-[11px] font-semibold text-red-800">{violation}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
      )}

      {overloadPrompt && (
        <OverloadConfirmationModal
          confirmation={overloadPrompt.confirmation}
          isSaving={isSubmitting}
          onConfirm={() => void send(overloadPrompt.request, true)}
          onCancel={() => !isSubmitting && setOverloadPrompt(null)}
        />
      )}
    </Modal>
  );
}
