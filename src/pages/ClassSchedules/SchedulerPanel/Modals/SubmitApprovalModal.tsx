import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, Send, X } from "lucide-react";
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
  confirmSubmitForApproval: () => void;
  cancelSubmitForApproval: () => void;
}

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
  confirmSubmitForApproval,
  cancelSubmitForApproval
}: SubmitApprovalModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isSubmitApprovalModalOpen) return;

    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelSubmitForApproval();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitApprovalModalOpen, cancelSubmitForApproval]);

  if (!isSubmitApprovalModalOpen) return null;

  const sectionName = sections.find((section) => section.id === selectedSectionId)?.name ?? "this section";
  const unplottedCount = Math.max(0, totalSubjects - totalScheduled);
  const completionPercent = departmentTotalSections > 0 ? (departmentDoneSections / departmentTotalSections) * 100 : 0;
  const progressWidthClass = completionPercent >= 100
    ? "w-full"
    : completionPercent >= 75
    ? "w-3/4"
    : completionPercent >= 50
    ? "w-1/2"
    : completionPercent >= 25
    ? "w-1/4"
    : completionPercent > 0
    ? "w-1/6"
    : "w-0";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 min-h-screen p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          cancelSubmitForApproval();
        }
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="submit-approval-title"
        aria-describedby="submit-approval-desc"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="relative bg-gradient-to-br from-[#4e0a10]/5 to-amber-50 px-6 pt-6 pb-5 border-b border-[#4e0a10]/10">
          <button
            type="button"
            onClick={cancelSubmitForApproval}
            aria-label="Close"
            className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 hover:bg-white/70 rounded-full p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-[#4e0a10]/10 border border-[#4e0a10]/15 flex items-center justify-center shrink-0">
              <Send className="w-6 h-6 text-[#4e0a10]" />
            </div>
            <div className="pt-0.5">
              <h3 id="submit-approval-title" className="text-lg font-bold text-gray-900 leading-tight">
                Submit department schedule?
              </h3>
              <p id="submit-approval-desc" className="text-sm text-gray-600 mt-1">
                You are about to send the complete department schedule to the Dean for review.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Sections ready</span>
              <span className="text-sm font-extrabold text-gray-900">
                {departmentDoneSections}/{departmentTotalSections}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                className={`h-full rounded-full bg-[#C9952A] transition-all ${progressWidthClass}`}
              />
            </div>
          </div>

          {departmentReadyToSubmit ? (
            <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-emerald-800">
                All department sections are marked Done. The Dean will review the complete department schedule as one submission.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs font-medium text-amber-800">
                {unplottedCount} subject{unplottedCount !== 1 ? "s" : ""} still appear unplotted for {sectionName}. The department submission may be blocked until every required section is complete.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-500">
              Department checklist
            </div>
            <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {departmentSectionProgress.map((section) => (
                <div key={section.sectionId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{section.sectionName}</p>
                    <p className="text-[11px] text-gray-500">
                      {section.plottedSubjects}/{section.requiredSubjects} subjects plotted
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    section.isDone ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}>
                    {section.isDone ? "Done" : "Not ready"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={cancelSubmitForApproval}
            className="border border-gray-300 rounded-lg px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Review Again
          </button>
          <button
            type="button"
            onClick={confirmSubmitForApproval}
            disabled={!departmentReadyToSubmit}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#4e0a10]/30 focus:ring-offset-1 ${
              departmentReadyToSubmit
                ? "text-white bg-[#4e0a10] hover:bg-[#C9952A] cursor-pointer"
                : "text-gray-400 bg-gray-200 cursor-not-allowed"
            }`}
          >
            <Send className="w-4 h-4" />
            Agree and Submit
          </button>
        </div>
      </div>
    </div>
  );
}
