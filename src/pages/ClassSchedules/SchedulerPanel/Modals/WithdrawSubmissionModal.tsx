import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, UserMinus, X } from "lucide-react";
import type { DepartmentSectionProgress, WithdrawalStage } from "../types";

interface WithdrawSubmissionModalProps {
  isOpen: boolean;
  sections: DepartmentSectionProgress[];
  selectedSectionId: string;
  withdrawalStage: WithdrawalStage;
  isWithdrawing: boolean;
  onConfirm: (sectionIds: string[]) => void;
  onCancel: () => void;
}

export default function WithdrawSubmissionModal({
  isOpen,
  sections,
  selectedSectionId,
  withdrawalStage,
  isWithdrawing,
  onConfirm,
  onCancel,
}: WithdrawSubmissionModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectableSections = useMemo(
    () => sections.filter((section) => ["submitted", "approved_by_dean", "approved", "faculty_assignment"].includes(section.status)),
    [sections]
  );

  // Unlocking a section for revision releases its instructor assignments: the
  // schedule they were made against is about to change, and assignment is only
  // valid once the schedule is VPAA-approved again.
  const releasedInstructorBlocks = useMemo(
    () => selectableSections
      .filter((section) => selectedIds.includes(section.sectionId))
      .reduce((total, section) => total + (section.assignedInstructorBlocks ?? 0), 0),
    [selectableSections, selectedIds]
  );

  useEffect(() => {
    if (!isOpen) return;
    const selectedSectionIsWithdrawable = selectableSections.some(
      (section) => section.sectionId === selectedSectionId
    );
    setSelectedIds(selectedSectionIsWithdrawable ? [selectedSectionId] : []);
  }, [isOpen, selectedSectionId, selectableSections]);

  if (!isOpen) return null;

  const withdrawalDescription = withdrawalStage === "vpaa_approved"
    ? "VPAA approval will be revoked. Sections you select below will be unlocked for revision; unselected sections will return to Done."
    : `The department submission will be pulled back from ${withdrawalStage === "vpaa_review" ? "VPAA" : "Dean"} review. Sections you select below will be unlocked for revision; unselected sections remain Done.`;

  const toggleSection = (sectionId: string) => {
    setSelectedIds((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId]
    );
  };

  const allSectionsSelected = selectableSections.length > 0
    && selectableSections.every((section) => selectedIds.includes(section.sectionId));

  const toggleAllSections = () => {
    setSelectedIds(
      allSectionsSelected
        ? []
        : selectableSections.map((section) => section.sectionId)
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="flex w-full max-w-2xl flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200" style={{ borderRadius: 10 }}>
        <div className="flex items-start gap-4 px-5 pb-4 pt-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border bg-amber-50 text-amber-600 border-amber-100" style={{ borderRadius: 8 }}>
            <RotateCcw size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b0f1a]">Schedule Submission</p>
            <h3 className="mt-1 text-base font-bold leading-6 text-slate-950">Withdraw Selected Sections?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {withdrawalDescription}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isWithdrawing}
            className="flex h-8 w-8 items-center justify-center bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            style={{ borderRadius: 8 }}
            aria-label="Close withdrawal confirmation"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5">
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Select only the sections that need changes. All other sections will stay completed.
          </div>
          {releasedInstructorBlocks > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-800">
              <UserMinus className="mt-0.5 h-4 w-4 shrink-0" />
              {releasedInstructorBlocks === 1
                ? "1 instructor assignment in the selected sections will be released and must be made again after re-approval."
                : `${releasedInstructorBlocks} instructor assignments in the selected sections will be released and must be made again after re-approval.`}
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <span className="text-xs font-bold text-slate-700">
                {allSectionsSelected ? "Clear all" : "Select all"}
              </span>
              <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
                {selectedIds.length} of {selectableSections.length} selected
                <input
                  type="checkbox"
                  checked={allSectionsSelected}
                  onChange={toggleAllSections}
                  disabled={isWithdrawing || selectableSections.length === 0}
                  className="h-4 w-4 cursor-pointer accent-[#4e0a10] disabled:cursor-not-allowed"
                  aria-label={allSectionsSelected ? "Clear all sections" : "Select all sections"}
                />
              </span>
            </label>
            <div className="max-h-72 overflow-y-auto">
              {selectableSections.map((section) => {
                const checked = selectedIds.includes(section.sectionId);
                return (
                  <button
                    key={section.sectionId}
                    type="button"
                    onClick={() => toggleSection(section.sectionId)}
                    disabled={isWithdrawing}
                    className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      checked ? "bg-[#4e0a10]/5" : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{section.sectionName}</span>
                      <span className="mt-0.5 block text-xs font-medium text-slate-500">
                        {section.plottedSubjects}/{section.requiredSubjects} subjects plotted
                        {(section.assignedInstructorBlocks ?? 0) > 0 && (
                          <span className="text-orange-600">
                            {" · "}
                            {section.assignedInstructorBlocks} with instructors
                          </span>
                        )}
                      </span>
                    </span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                      checked ? "border-[#4e0a10] bg-[#4e0a10] text-white" : "border-slate-300 bg-white text-transparent"
                    }`}>
                      <CheckCircle2 size={15} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isWithdrawing}
            className="border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50"
            style={{ borderRadius: 8 }}
          >
            {withdrawalStage === "vpaa_approved" ? "Keep VPAA Approval" : "Keep Submitted"}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedIds)}
            disabled={selectedIds.length === 0 || isWithdrawing}
            className="inline-flex items-center gap-2 bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderRadius: 8 }}
          >
            {isWithdrawing && <Loader2 className="h-4 w-4 animate-spin" />}
            {isWithdrawing ? "Withdrawing..." : "Withdraw Selected"}
          </button>
        </div>
      </div>
    </div>
  );
}
