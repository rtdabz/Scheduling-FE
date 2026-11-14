import { AlertTriangle, CheckCircle2, LockKeyhole, Send } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
import type { DepartmentSectionProgress, Section } from "../types";

interface SubmitApprovalModalProps {
  sections: Section[];
  isSubmitApprovalModalOpen: boolean;
  selectedSectionId: string;
  totalScheduled: number;
  totalSubjects: number;
  departmentSectionProgress: DepartmentSectionProgress[];
  departmentTotalSections: number;
  departmentDoneSections: number;
  departmentReadyToSubmit: boolean;
  departmentCorrectionsRequired?: boolean;
  confirmSubmitForApproval: () => void;
  cancelSubmitForApproval: () => void;
  isSubmittingSchedule?: boolean;
}

const isProtected = (section: DepartmentSectionProgress) => [
  "submitted", "approved_by_dean", "conditionally_approved", "approved",
  "faculty_assignment", "reassignment", "finalized",
].includes(section.status);

export default function SubmitApprovalModal({
  sections,
  isSubmitApprovalModalOpen,
  selectedSectionId,
  totalScheduled,
  totalSubjects,
  departmentSectionProgress,
  departmentTotalSections,
  departmentDoneSections,
  departmentReadyToSubmit,
  departmentCorrectionsRequired = false,
  confirmSubmitForApproval,
  cancelSubmitForApproval,
  isSubmittingSchedule = false,
}: SubmitApprovalModalProps) {
  const sectionName = sections.find((section) => section.id === selectedSectionId)?.name ?? "this section";
  const unplottedCount = Math.max(0, totalSubjects - totalScheduled);
  const completionPercent = departmentTotalSections > 0
    ? Math.min(100, Math.max(0, (departmentDoneSections / departmentTotalSections) * 100))
    : 0;
  const submittingCount = departmentSectionProgress.filter((section) => section.isDone && !isProtected(section)).length;
  const protectedCount = departmentSectionProgress.filter(isProtected).length;

  return (
    <Modal
      isOpen={isSubmitApprovalModalOpen}
      onClose={cancelSubmitForApproval}
      appearance="workflow"
      role="alertdialog"
      title="Submit schedule?"
      eyebrow="Schedule submission"
      description="Review your department's sections before sending them to the Dean."
      icon={<Send size={21} />}
      busy={isSubmittingSchedule}
      closeLabel="Close submission review"
      className="max-w-[640px]"
      bodyClassName="scheduler-dialog-body"
      footer={
        <>
          <button type="button" data-autofocus onClick={cancelSubmitForApproval}
            disabled={isSubmittingSchedule} className="scheduler-dialog-button">
            Review Again
          </button>
          <button type="button" onClick={confirmSubmitForApproval}
            disabled={!departmentReadyToSubmit || isSubmittingSchedule}
            className="scheduler-dialog-button" data-variant="primary">
            {isSubmittingSchedule ? <LoadingSpinner className="h-4 w-4" /> : <Send size={16} />}
            {isSubmittingSchedule ? "Submitting..." : "Submit to Dean"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-[#e8e1d9] bg-[#faf8f5] p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#71665e]">Department readiness</p>
              <p className="mt-1 flex items-baseline gap-1.5 text-[#291a19]">
                <span className="text-3xl font-semibold tabular-nums tracking-tight">{departmentDoneSections}</span>
                <span className="text-sm text-[#71665e]">of {departmentTotalSections} sections done</span>
              </p>
            </div>
            <span className={`scheduler-dialog-badge ${departmentReadyToSubmit ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
              {departmentReadyToSubmit ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {departmentReadyToSubmit ? "Ready for review" : "Action needed"}
            </span>
          </div>
          <div className="scheduler-readiness-track mt-4" role="progressbar" aria-label="Department sections done"
            aria-valuemin={0} aria-valuemax={departmentTotalSections || 1} aria-valuenow={Math.min(departmentDoneSections, departmentTotalSections)}
            aria-valuetext={`${departmentDoneSections} of ${departmentTotalSections} sections done`}>
            <div className="scheduler-readiness-fill" style={{ width: `${completionPercent}%` }} />
          </div>
        </div>

        {departmentReadyToSubmit ? (
          <div className="scheduler-dialog-notice border-emerald-200 bg-emerald-50 text-emerald-900">
            <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">{submittingCount} section{submittingCount === 1 ? "" : "s"} will be sent for review</p>
              <p className="mt-0.5">Completed sections in the current revision will be submitted, including unchanged timetables. Sections already under review, approved, or finalized keep their current workflow status.</p>
            </div>
          </div>
        ) : departmentCorrectionsRequired ? (
          <div className="scheduler-dialog-notice border-amber-200 bg-amber-50 text-amber-900">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Save the needed timetable corrections</p>
              <p className="mt-0.5">No timetable corrections have been saved for this returned schedule. Correct the sections identified in the rejection feedback using Generate Schedule or Manual Plotting. Other sections may keep their existing timetables.</p>
            </div>
          </div>
        ) : (
          <div className="scheduler-dialog-notice border-amber-200 bg-amber-50 text-amber-900">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Finish the required sections before submitting</p>
              <p className="mt-0.5">Every section in the current revision must be fully plotted.
                {unplottedCount > 0 && ` ${sectionName} still has ${unplottedCount} unplotted subject${unplottedCount === 1 ? "." : "s."}`}
              </p>
            </div>
          </div>
        )}

        <section aria-label="Department workflow status" className="scheduler-dialog-panel">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8e1d9] bg-[#faf8f5] px-4 py-3">
            <h3 className="font-sans text-xs font-semibold text-[#4e443c]">Department workflow status</h3>
            <span className="text-[11px] text-[#71665e]">{departmentSectionProgress.length} sections</span>
          </div>
          <ul className="scheduler-dialog-list">
            {departmentSectionProgress.map((section) => {
              const protectedSection = isProtected(section);
              const willSubmit = section.isDone && !protectedSection;
              const unchangedReturn = sections.some((item) => item.id === section.sectionId
                && item.submissionStatus === "rejected" && item.revisionStatus === "initial");
              const statusLabel = protectedSection ? section.status === "finalized" ? "Finalized" : "Unchanged"
                : willSubmit ? unchangedReturn ? "Will submit unchanged" : "Will submit" : "Not ready";
              return (
                <li key={section.sectionId} className="scheduler-dialog-row">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-[#291a19]">{section.sectionName}</p>
                    <p className="mt-1 text-xs text-[#71665e]">{section.plottedSubjects ?? section.plottedCourses}/{section.requiredSubjects ?? section.requiredCourses} subjects plotted</p>
                  </div>
                  <span className={`scheduler-dialog-badge ${willSubmit ? "bg-emerald-50 text-emerald-800" : protectedSection ? "bg-[#f1ede8] text-[#625a54]" : "bg-amber-50 text-amber-800"}`}>
                    {willSubmit ? <CheckCircle2 size={12} /> : protectedSection ? <LockKeyhole size={12} /> : <AlertTriangle size={12} />}
                    {statusLabel}
                  </span>
                </li>
              );
            })}
            {departmentSectionProgress.length === 0 && <li className="px-4 py-6 text-center text-sm text-[#71665e]">No sections are available for submission.</li>}
          </ul>
        </section>
        {protectedCount > 0 && <p className="flex items-start gap-2 text-xs leading-5 text-[#71665e]"><LockKeyhole size={14} className="mt-0.5 shrink-0" />{protectedCount} protected section{protectedCount === 1 ? " keeps its" : "s keep their"} current workflow status.</p>}
      </div>
    </Modal>
  );
}
