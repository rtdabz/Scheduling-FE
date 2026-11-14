import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, UserMinus } from "lucide-react";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
import Modal from "../../../../components/ui/Modal";
import { isDepartmentSectionWithdrawable } from "../constants";
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

export default function WithdrawSubmissionModal(props: WithdrawSubmissionModalProps) {
  return props.isOpen ? <WithdrawalChecklist {...props} /> : null;
}

function WithdrawalChecklist({
  sections,
  withdrawalStage,
  isWithdrawing,
  onConfirm,
  onCancel,
}: WithdrawSubmissionModalProps) {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  const selectableSections = useMemo(
    () => sections.filter((section) => isDepartmentSectionWithdrawable(
      section.status,
      section.assignedInstructorBlocks,
      section.facultyAssignmentDone,
    )),
    [sections]
  );
  const selectedIds = selectableSections
    .filter((section) => checkedIds.includes(section.sectionId))
    .map((section) => section.sectionId);

  const releasedInstructorBlocks = useMemo(
    () => selectableSections
      .filter((section) => selectedIds.includes(section.sectionId))
      .reduce((total, section) => total + (section.assignedInstructorBlocks ?? 0), 0),
    [selectableSections, selectedIds]
  );

  const withdrawalDescription = `The selected sections will be pulled back from ${withdrawalStage === "vpaa_review" ? "VPAA" : "Dean"} review and unlocked for revision. Unselected sections remain unchanged. VPAA-approved sections cannot be recalled.`;

  const toggleSection = (sectionId: string) => {
    setCheckedIds((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId]
    );
  };

  const allSectionsSelected = selectableSections.length > 0
    && selectableSections.every((section) => selectedIds.includes(section.sectionId));

  const toggleAllSections = () => {
    setCheckedIds(
      allSectionsSelected
        ? []
        : selectableSections.map((section) => section.sectionId)
    );
  };

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Recall Selected Sections?"
      description={withdrawalDescription}
      eyebrow="Schedule Submission"
      icon={<RotateCcw size={22} />}
      appearance="workflow"
      busy={isWithdrawing}
      closeLabel="Close recall confirmation"
      size="lg"
      bodyClassName="scheduler-dialog-body"
      footer={<>
        <span className="mr-auto text-xs font-medium text-[#71665c]">
          {selectedIds.length} section{selectedIds.length === 1 ? "" : "s"} selected
        </span>
        <button
          type="button"
          onClick={onCancel}
          disabled={isWithdrawing}
          data-autofocus
          className="scheduler-dialog-button"
          data-variant="secondary"
        >
          Keep Submitted
        </button>
        <button
          type="button"
          onClick={() => onConfirm(selectedIds)}
          disabled={selectedIds.length === 0 || isWithdrawing}
          className="scheduler-dialog-button"
          data-variant="primary"
        >
          {isWithdrawing ? <LoadingSpinner className="h-4 w-4" /> : <RotateCcw size={16} />}
          {isWithdrawing ? "Recalling..." : "Recall Selected"}
        </button>
      </>}
    >
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Select only the sections that need changes. All other sections remain unchanged.
      </div>
      {releasedInstructorBlocks > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <UserMinus className="mt-0.5 h-4 w-4 shrink-0" />
          {releasedInstructorBlocks === 1
            ? "1 instructor assignment in the selected sections will be released. Assign it again once the revised schedule is approved."
            : `${releasedInstructorBlocks} instructor assignments in the selected sections will be released. Assign them again once the revised schedule is approved.`}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-[#e8ded4] bg-white">
        <label className="flex cursor-pointer flex-wrap items-center justify-between gap-3 border-b border-[#e8ded4] bg-[#faf7f2] px-4 py-3.5">
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
              className="h-[18px] w-[18px] cursor-pointer accent-[#4e0a10] disabled:cursor-not-allowed"
              aria-label={allSectionsSelected ? "Clear all sections" : "Select all sections"}
            />
          </span>
        </label>
        <div>
          {selectableSections.map((section) => {
            const checked = selectedIds.includes(section.sectionId);
            return (
              <button
                key={section.sectionId}
                type="button"
                onClick={() => toggleSection(section.sectionId)}
                disabled={isWithdrawing}
                aria-pressed={checked}
                className={`flex w-full items-center justify-between gap-3 border-b border-[#f0e9e1] px-4 py-4 text-left last:border-b-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  checked ? "bg-[#4e0a10]/5" : "bg-white hover:bg-[#faf7f2]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-bold text-slate-800">{section.sectionName}</span>
                  <span className="mt-1.5 block text-xs font-medium leading-5 text-slate-500">
                    {section.plottedSubjects}/{section.requiredSubjects} subjects plotted
                    {(section.assignedInstructorBlocks ?? 0) > 0 && (
                      <span className="text-orange-600">
                        {" · "}
                        {section.assignedInstructorBlocks} with instructors
                      </span>
                    )}
                  </span>
                </span>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  checked ? "border-[#4e0a10] bg-[#4e0a10] text-white" : "border-[#d6c8bb] bg-white text-transparent"
                }`}>
                  <CheckCircle2 size={15} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
