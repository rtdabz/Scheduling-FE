import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldAlert } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import { useToast } from "../../../../context/ToastContext";
import { apiErrorMessage } from "../../../../lib/apiError";
import { FULL_DAY_NAMES } from "../../../../lib/timeGrid";
import {
  alreadyResolvedFrom,
  conflictRuleLabel,
  describeConflictSchedule,
  fetchConflicts,
  isReplottable,
  overrideConflict,
  refusalDetails,
  resolutionActionLabel,
  resolveConflict,
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

/**
 * The Resolve dialog: what is clashing, which class to change, and how.
 *
 * Everything it can do maps to an action the server already knows how to
 * validate, so nothing here decides whether a fix worked. The server re-scans
 * inside the same transaction as the write; this component only renders what
 * comes back. A refusal is shown with every violation the server named, and the
 * timetable is untouched -- the whole resolution rolled back.
 *
 * Recommendation-based resolution is not duplicated here either. When the
 * server offers `apply_recommendation` the dialog says so and sends the user to
 * the generator, which keeps the existing preview -> accept plan contract.
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
    } catch (err) {
      if (signal?.aborted) return;
      setConflicts([]);
      toast.error("Conflicts", apiErrorMessage(err, "Could not load the conflict list."));
    }
  }, [departmentId, focusScheduleId, rules, semesterId, toast]);

  // The dialog is mounted only while it is open, so one scan on mount is the
  // whole of its loading: every later list comes back with a write's response.
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    return () => controller.abort();
  }, [load]);

  const pick = (conflict: ScheduleConflict) => {
    const editable = conflict.schedules.find(isReplottable) ?? conflict.schedules[0];
    setSelectedId(conflict.id);
    setTargetId(editable.id);
    setAction(null);
    setForm(null);
    setReason("");
    setViolations([]);
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
      onResolved();
      toast.info("Conflicts", "That conflict is already resolved. The list has been refreshed.");
      return;
    }

    const details = refusalDetails(err);
    setViolations(details);
    toast.error("Conflicts", details[0] ?? apiErrorMessage(err, fallback));
  };

  const submit = async () => {
    if (!selected || !form) return;
    setIsSubmitting(true);
    setViolations([]);
    try {
      settle(await resolveConflict(selected.id, {
        ...form,
        reason: reason.trim() || undefined,
        // The dialog has already shown the clash being resolved; a second
        // prompt about the instructor's load would be asking twice.
        confirm_overload: form.action === "reassign_instructor" ? true : undefined,
      }));
    } catch (err) {
      handleFailure(err, "That change was refused, so nothing was saved.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
          {action === "request_override" ? (
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
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Suggested actions</h3>
          {!selected || !target ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Choose a conflict to see what can be done about it.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
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
                      option === "apply_recommendation"
                      || (APPLIABLE.includes(option) && !allowed(option))
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
                    title={option === "apply_recommendation"
                      ? "Close this dialog and use Generate — a recommendation is previewed and accepted there."
                      : undefined}
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
    </Modal>
  );
}
