import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CheckSquare, Lock, X } from "lucide-react";
import { yearLevelLabel } from "../constants";
import type { SectionDoneCandidate } from "../types";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";

interface MarkSectionsDoneModalProps {
  candidates: SectionDoneCandidate[];
  selectedSectionId: string;
  isMarking: boolean;
  onConfirm: (sectionIds: string[]) => void;
  onCancel: () => void;
}

const readyIdsOf = (candidates: SectionDoneCandidate[]): string[] =>
  candidates.filter((candidate) => candidate.isReady).map((candidate) => candidate.sectionId);

/**
 * Bulk replacement for walking every section and clicking Done one at a time.
 * Ready sections are pre-checked; blocked ones stay visible (disabled) so the
 * remaining plotting work is obvious without leaving the modal.
 */
export default function MarkSectionsDoneModal({
  candidates,
  selectedSectionId,
  isMarking,
  onConfirm,
  onCancel,
}: MarkSectionsDoneModalProps) {
  // The modal is mounted only while open, so the ready sections are pre-checked
  // once on mount instead of being resynced from an effect.
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readyIdsOf(candidates));

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

  const selectedSlotCount = candidates
    .filter((candidate) => selectedIds.includes(candidate.sectionId))
    .reduce((total, candidate) => total + candidate.scheduleIds.length, 0);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-sections-done-title"
        className="flex w-full max-w-2xl flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        style={{ borderRadius: 10 }}
      >
        <div className="flex items-start gap-4 px-5 pb-4 pt-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-emerald-100 bg-emerald-50 text-emerald-600" style={{ borderRadius: 8 }}>
            <CheckSquare size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b0f1a]">Department Readiness</p>
            <h3 id="mark-sections-done-title" className="mt-1 text-base font-bold leading-6 text-slate-950">Mark sections done</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Tick every section you have finished plotting. Marking a section done locks its timetable so the department schedule can be submitted.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isMarking}
            className="flex h-8 w-8 items-center justify-center bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            style={{ borderRadius: 8 }}
            aria-label="Close mark sections done"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5">
          {candidates.length === 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-medium text-slate-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              Every section in this department is already done or locked for approval.
            </div>
          ) : (
            <>
              {readySections.length === 0 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  No section is fully plotted yet. Finish placing the remaining courses before marking a section done.
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <span className="text-xs font-bold text-slate-700">
                    {allReadySelected ? "Clear all" : "Select all ready"}
                  </span>
                  <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    {selectedIds.length} of {readySections.length} selected
                    <input
                      type="checkbox"
                      checked={allReadySelected}
                      onChange={toggleAllSections}
                      disabled={isMarking || readySections.length === 0}
                      className="h-4 w-4 cursor-pointer accent-[#4e0a10] disabled:cursor-not-allowed"
                      aria-label={allReadySelected ? "Clear all sections" : "Select all ready sections"}
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
                            {candidate.plottedSubjects}/{candidate.requiredSubjects} courses plotted
                            {candidate.isReady
                              ? ` · ${candidate.scheduleIds.length} meeting${candidate.scheduleIds.length === 1 ? "" : "s"} will be locked`
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
                            title={remaining > 0 ? `${remaining} course${remaining === 1 ? "" : "s"} still unplaced` : candidate.blockedReason}
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

        <div className="flex items-center justify-between gap-2.5 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <span className="text-[11px] font-medium text-slate-500">
            {selectedIds.length > 0
              ? `${selectedIds.length} section${selectedIds.length === 1 ? "" : "s"} · ${selectedSlotCount} meeting${selectedSlotCount === 1 ? "" : "s"}`
              : "Nothing selected"}
          </span>
          <span className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={isMarking}
              className="border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50"
              style={{ borderRadius: 8 }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirm(selectedIds)}
              disabled={selectedIds.length === 0 || isMarking}
              className="inline-flex items-center gap-2 bg-[#4e0a10] px-5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#3a0809] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderRadius: 8 }}
            >
              {isMarking && <LoadingSpinner className="h-4 w-4" />}
              {isMarking ? "Marking..." : selectedIds.length > 0 ? `Mark ${selectedIds.length} Done` : "Mark Done"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
