import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CheckSquare, Lock, RotateCcw } from "lucide-react";
import { yearLevelLabel } from "../constants";
import type { SectionDoneCandidate } from "../types";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
import Modal from "../../../../components/ui/Modal";
import { RESET_WARNING } from "../../../../lib/scheduleReset";

export type SectionChecklistVariant = "done" | "finalize" | "reassign" | "clear";

interface MarkSectionsDoneModalProps {
  candidates: SectionDoneCandidate[];
  selectedSectionId: string;
  isMarking: boolean;
  onConfirm: (sectionIds: string[]) => void;
  onCancel: () => void;
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
}> = {
  clear: {
    eyebrow: "Schedule Management",
    title: "Reset schedules",
    description: "Tick the sections whose schedules you want to delete. Sections still being prepared, completed but not submitted, or returned or recalled for revision can be reset.",
    empty: "No sections are available in this department for the active semester.",
    noneReady: "Every section is under review, approved, or waiting to be reopened, so none can be reset.",
    progress: (_done, total) => plural(total, "class"),
    lockNote: (meetings) => `${plural(meetings, "meeting")} to delete`,
    selectAll: "Select all available",
    closeLabel: "Close reset schedules",
    working: "Resetting...",
    confirm: (count) => count > 0 ? `Reset ${count} Section${count === 1 ? "" : "s"}` : "Reset Sections",
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
  },
};

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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const readySections = useMemo(
    () => candidates.filter((candidate) => candidate.isReady),
    [candidates]
  );
  const blockedSections = useMemo(
    () => candidates.filter((candidate) => !candidate.isReady),
    [candidates]
  );

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
    <Modal
      isOpen
      onClose={onCancel}
      title={copy.title}
      description={copy.description}
      eyebrow={copy.eyebrow}
      icon={variant === "clear" ? <RotateCcw size={22} /> : <CheckSquare size={22} />}
      appearance="workflow"
      busy={isMarking}
      closeLabel={copy.closeLabel}
      size="lg"
      bodyClassName="scheduler-dialog-body"
      footer={<>
        <span className="mr-auto text-xs font-medium text-[#71665c]">
          {selectedCandidates.length > 0
            ? `${selectedCandidates.length} section${selectedCandidates.length === 1 ? "" : "s"} · ${selectedSlotCount} meeting${selectedSlotCount === 1 ? "" : "s"}`
            : "Nothing selected"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={isMarking}
          data-autofocus
          className="scheduler-dialog-button"
          data-variant="secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(selectedCandidates.map((candidate) => candidate.sectionId))}
          disabled={selectedCandidates.length === 0 || isMarking}
          className="scheduler-dialog-button"
          data-variant={variant === "clear" ? "danger" : "primary"}
        >
          {isMarking && <LoadingSpinner className="h-4 w-4" />}
          {isMarking ? copy.working : copy.confirm(selectedCandidates.length)}
        </button>
      </>}
    >
      {contextText && <p className="mb-4 text-sm font-medium text-[#71665c]">{contextText}</p>}
      {variant === "clear" && <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{RESET_WARNING} You will review the exact counts before anything is deleted.</p>
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
          <div className="overflow-hidden rounded-xl border border-[#e8ded4] bg-white">
            <label className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-b border-[#e8ded4] bg-[#faf7f2] px-4 py-3.5">
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
                  className="h-[18px] w-[18px] cursor-pointer accent-[#4e0a10] disabled:cursor-not-allowed"
                  aria-label={allReadySelected ? "Deselect all sections" : variant === "clear" ? "Select all available sections" : "Select all ready sections"}
                />
              </span>
            </label>
            <div>
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
                    className={`flex w-full items-center justify-between gap-3 border-b border-[#f0e9e1] px-4 py-4 text-left last:border-b-0 transition-colors disabled:cursor-not-allowed ${
                      !candidate.isReady
                        ? "bg-[#faf8f5] opacity-70"
                        : checked
                          ? "bg-[#4e0a10]/5"
                          : "bg-white hover:bg-[#faf7f2]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="break-words text-sm font-bold text-slate-800">{candidate.sectionName}</span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          {yearLevelLabel(candidate.yearLevel)}
                        </span>
                        {candidate.sectionId === selectedSectionId && (
                          <span className="shrink-0 rounded-full bg-[#4e0a10]/10 px-2 py-0.5 text-[10px] font-bold text-[#4e0a10]">
                            Open
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                        {copy.progress(candidate.plottedSubjects, candidate.requiredSubjects)}
                        {candidate.isReady
                          ? ` · ${copy.lockNote(candidate.scheduleIds.length)}`
                          : ` · ${candidate.blockedReason}`}
                      </span>
                    </span>
                    {candidate.isReady ? (
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                        checked ? "border-[#4e0a10] bg-[#4e0a10] text-white" : "border-[#d6c8bb] bg-white text-transparent"
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
    </Modal>
  );
}
