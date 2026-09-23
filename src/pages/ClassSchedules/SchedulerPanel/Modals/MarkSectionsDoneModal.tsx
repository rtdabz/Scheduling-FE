import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CheckSquare, Lock, RotateCcw, X } from "lucide-react";
import { yearLevelLabel } from "../constants";
import type { SectionDoneCandidate } from "../types";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";

export type SectionChecklistVariant = "done" | "finalize" | "reassign" | "clear";

interface MarkSectionsDoneModalProps {
  candidates: SectionDoneCandidate[];
  selectedSectionId: string;
  isMarking: boolean;
  onConfirm: (sectionIds: string[]) => void;
  onCancel: () => void;
  /**
   * "done" locks plotting, "finalize" locks instructor assignment, "reassign"
   * reopens finalized assignments. Same checklist in every case.
   */
  variant?: SectionChecklistVariant;
  contextText?: string;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : word.endsWith("s") ? "es" : "s"}`;

const COPY: Record<SectionChecklistVariant, {
  eyebrow: string;
  title: string;
  description: string;
  empty: string;
  noneReady: string;
  progress: (done: number, total: number) => string;
  lockNote: (meetings: number) => string;
  selectAll: string;
  closeLabel: string;
  working: string;
  confirm: (count: number) => string;
  /**
   * Which sections start ticked. Locking actions pre-check every ready section;
   * reopening one only pre-checks the section that is open, so unlocking the
   * whole department is never a single click.
   */
  preselect: "ready" | "open";
}> = {
  clear: {
    eyebrow: "Schedule Management",
    title: "Reset section schedules",
    description: "Tick the sections whose schedules you want to reset. Only the selected sections will be affected.",
    empty: "No sections are available in this department for the active semester.",
    noneReady: "No section has a working schedule that can be reset.",
    progress: (_done, total) => plural(total, "class"),
    lockNote: (meetings) => `${plural(meetings, "loaded meeting")} to remove`,
    selectAll: "Select all available",
    closeLabel: "Close reset schedules",
    working: "Resetting...",
    confirm: (count) => count > 0 ? `Reset ${count} Section${count === 1 ? "" : "s"}` : "Reset Sections",
    preselect: "open",
  },
  done: {
    eyebrow: "Department Readiness",
    title: "Mark sections done",
    description: "Tick every section you have finished plotting. Marking a section done locks its timetable so the department schedule can be submitted.",
    empty: "Every section in this department is already done or locked for approval.",
    noneReady: "No section is fully plotted yet. Finish placing the remaining courses before marking a section done.",
    progress: (done, total) => `${done}/${total} courses plotted`,
    lockNote: (meetings) => `${plural(meetings, "meeting")} will be locked`,
    selectAll: "Select all ready",
    closeLabel: "Close mark sections done",
    working: "Marking...",
    confirm: (count) => (count > 0 ? `Mark ${count} Done` : "Mark Done"),
    preselect: "ready",
  },
  finalize: {
    eyebrow: "Instructor Assignment",
    title: "Finalize sections",
    description: "Tick every section whose classes all have an instructor. Finalizing locks its instructor assignments; use Reassignment on a section to reopen it.",
    empty: "No section in this department is waiting to be finalized.",
    noneReady: "No section is ready yet. Assign an instructor to every class, and a room to every on-site laboratory class, before finalizing.",
    progress: (done, total) => `${done}/${total} classes have an instructor`,
    lockNote: (meetings) => `${plural(meetings, "meeting")} will be finalized`,
    selectAll: "Select all ready",
    closeLabel: "Close finalize sections",
    working: "Finalizing...",
    confirm: (count) => (count > 0 ? `Finalize ${count}` : "Finalize"),
    preselect: "ready",
  },
  reassign: {
    eyebrow: "Instructor Assignment",
    title: "Reassign sections",
    description: "Tick every finalized section whose instructors need to change. Reassignment reopens instructor assignment only; the timetable itself stays locked. Finalize the section again when you are done.",
    empty: "No section in this department has been finalized.",
    noneReady: "No finalized section can be reopened right now.",
    progress: (_done, total) => `${plural(total, "class")} finalized`,
    lockNote: (meetings) => `${plural(meetings, "meeting")} will reopen for reassignment`,
    selectAll: "Select all finalized",
    closeLabel: "Close reassign sections",
    working: "Unlocking...",
    confirm: (count) => (count > 0 ? `Reassign ${count}` : "Reassign"),
    preselect: "open",
  },
};

const readyIdsOf = (candidates: SectionDoneCandidate[]): string[] =>
  candidates.filter((candidate) => candidate.isReady).map((candidate) => candidate.sectionId);

/**
 * Bulk replacement for walking every section and clicking Done -- or Finalize --
 * one at a time. Ready sections are pre-checked; blocked ones stay visible
 * (disabled) with the reason, so the remaining work is obvious without leaving
 * the modal.
 */
export default function MarkSectionsDoneModal({
  candidates,
  selectedSectionId,
  isMarking,
  onConfirm,
  onCancel,
  variant = "done",
  contextText,
}: MarkSectionsDoneModalProps) {
  const copy = COPY[variant];
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (variant !== "clear") return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();
    return () => previousFocus?.focus();
  }, [variant]);
  // The modal is mounted only while open, so the ready sections are pre-checked
  // once on mount instead of being resynced from an effect.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => (
    COPY[variant].preselect === "open"
      ? readyIdsOf(candidates).filter((id) => id === selectedSectionId)
      : readyIdsOf(candidates)
  ));

  const readySections = useMemo(
    () => candidates.filter((candidate) => candidate.isReady),
    [candidates]
  );
  const blockedSections = useMemo(
    () => candidates.filter((candidate) => !candidate.isReady),
    [candidates]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isMarking) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMarking, onCancel]);

  const toggleSection = (sectionId: string) => {
    setSelectedIds((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId]
    );
  };

  const allReadySelected = readySections.length > 0
    && readySections.every((candidate) => selectedIds.includes(candidate.sectionId));

  const toggleAllSections = () => {
    setSelectedIds(allReadySelected ? [] : readySections.map((candidate) => candidate.sectionId));
  };

  const selectedCandidates = readySections.filter((candidate) => selectedIds.includes(candidate.sectionId));
  const selectedSlotCount = selectedCandidates
    .reduce((total, candidate) => total + candidate.scheduleIds.length, 0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-sections-done-title"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        style={{ borderRadius: 10 }}
      >
        <div className="flex items-start gap-4 px-5 pb-4 pt-5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center border ${variant === "clear" ? "border-rose-100 bg-rose-50 text-rose-600" : "border-emerald-100 bg-emerald-50 text-emerald-600"}`} style={{ borderRadius: 8 }}>
            {variant === "clear" ? <RotateCcw size={20} /> : <CheckSquare size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b0f1a]">{copy.eyebrow}</p>
            <h3 id="mark-sections-done-title" className="mt-1 text-base font-bold leading-6 text-slate-950">{copy.title}</h3>
            {contextText && <p className="mt-1 text-xs font-medium text-slate-500">{contextText}</p>}
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {copy.description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isMarking}
            className="flex h-8 w-8 items-center justify-center bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            style={{ borderRadius: 8 }}
            aria-label={copy.closeLabel}
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 pb-5">
          {variant === "clear" && <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Resetting removes working schedules from the selected sections, including meetings beyond this preview. They cannot be restored from the Archive. Schedule history is retained.</p>
          </div>}
          {candidates.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              {copy.empty}
            </div>
          ) : (
            <>
              {readySections.length === 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {copy.noneReady}
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="text-xs font-bold text-slate-700">
                    {allReadySelected ? "Deselect all" : copy.selectAll}
                  </span>
                  <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    {selectedCandidates.length} of {readySections.length} selected
                    <input
                      type="checkbox"
                      checked={allReadySelected}
                      onChange={toggleAllSections}
                      disabled={isMarking || readySections.length === 0}
                      className="h-4 w-4 cursor-pointer accent-[#4e0a10] disabled:cursor-not-allowed"
                      aria-label={allReadySelected ? "Deselect all sections" : variant === "clear" ? "Select all available sections" : "Select all ready sections"}
                    />
                  </span>
                </label>
                <div className="max-h-72 overflow-y-auto">
                  {[...readySections, ...blockedSections].map((candidate) => {
                    const checked = selectedIds.includes(candidate.sectionId);
                    const remaining = Math.max(0, candidate.requiredSubjects - candidate.plottedSubjects);
                    return (
                      <button
                        key={candidate.sectionId}
                        type="button"
                        onClick={() => candidate.isReady && toggleSection(candidate.sectionId)}
                        disabled={isMarking || !candidate.isReady}
                        aria-pressed={checked}
                        className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 transition-colors disabled:cursor-not-allowed ${
                          !candidate.isReady
                            ? "bg-slate-50/60 opacity-70"
                            : checked
                              ? "bg-[#4e0a10]/5"
                              : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-slate-800">{candidate.sectionName}</span>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              {yearLevelLabel(candidate.yearLevel)}
                            </span>
                            {candidate.sectionId === selectedSectionId && (
                              <span className="shrink-0 rounded-full bg-[#4e0a10]/10 px-2 py-0.5 text-[10px] font-bold text-[#4e0a10]">
                                Open
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                            {copy.progress(candidate.plottedSubjects, candidate.requiredSubjects)}
                            {candidate.isReady
                              ? ` · ${copy.lockNote(candidate.scheduleIds.length)}`
                              : ` · ${candidate.blockedReason}`}
                          </span>
                        </span>
                        {candidate.isReady ? (
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                            checked ? "border-[#4e0a10] bg-[#4e0a10] text-white" : "border-slate-300 bg-white text-transparent"
                          }`}>
                            <CheckCircle2 size={15} />
                          </span>
                        ) : (
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-slate-400"
                            title={variant === "done" && remaining > 0 ? `${remaining} course${remaining === 1 ? "" : "s"} still unplaced` : candidate.blockedReason}
                          >
                            <Lock size={13} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <span className="text-[11px] font-medium text-slate-500">
            {selectedCandidates.length > 0
              ? `${selectedCandidates.length} section${selectedCandidates.length === 1 ? "" : "s"} · ${selectedSlotCount} meeting${selectedSlotCount === 1 ? "" : "s"}`
              : "Nothing selected"}
          </span>
          <span className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={isMarking}
              ref={cancelButtonRef}
              className="border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50"
              style={{ borderRadius: 8 }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selectedCandidates.map((candidate) => candidate.sectionId))}
              disabled={selectedCandidates.length === 0 || isMarking}
              className="inline-flex items-center gap-2 bg-[#4e0a10] px-5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#3a0809] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderRadius: 8 }}
            >
              {isMarking && <LoadingSpinner className="h-4 w-4" />}
              {isMarking ? copy.working : copy.confirm(selectedCandidates.length)}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
