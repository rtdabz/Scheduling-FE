import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
import { useEffect, useRef } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import type { ScheduleItem, Section } from "../types";

interface ClearAllModalProps {
  sections: Section[];
  isClearAllModalOpen: boolean;
  isClearingAll?: boolean;
  selectedSectionId: string;
  schedules: ScheduleItem[];
  sectionSchedules: ScheduleItem[];
  activeTermText: string;
  confirmClearAll: (scope?: "section" | "all") => void;
  cancelClearAll: () => void;
}

export default function ClearAllModal({
  sections,
  isClearAllModalOpen,
  isClearingAll = false,
  selectedSectionId,
  schedules,
  sectionSchedules,
  activeTermText,
  confirmClearAll,
  cancelClearAll
}: ClearAllModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Move focus to the safe (Cancel) action and close on Escape.
  useEffect(() => {
    if (!isClearAllModalOpen) return;
    cancelButtonRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelClearAll();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isClearAllModalOpen, cancelClearAll]);

  if (!isClearAllModalOpen) return null;

  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name ?? "this section";
  const selectedDepartmentId = sections.find((s) => s.id === selectedSectionId)?.departmentId ?? null;
  const departmentSectionIds = new Set(
    sections
      .filter((section) => selectedDepartmentId === null || Number(section.departmentId) === Number(selectedDepartmentId))
      .map((section) => section.id)
  );
  const sectionClassCount = sectionSchedules.length;
  const allClassCount = schedules.filter((schedule) => departmentSectionIds.has(schedule.sectionId)).length;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 min-h-screen p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isClearingAll) cancelClearAll(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-all-title"
        aria-describedby="clear-all-desc"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Accent header with a soft red gradient wash */}
        <div className="relative bg-gradient-to-br from-rose-50 to-red-50 px-6 pt-6 pb-5 border-b border-rose-100">
          <button
            type="button"
            onClick={cancelClearAll}
            disabled={isClearingAll}
            aria-label="Close"
            className="absolute right-4 top-4 text-rose-400 hover:text-rose-600 hover:bg-white/70 rounded-full p-1 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <span className="absolute inset-0 rounded-full bg-rose-400/30 animate-ping motion-reduce:hidden" />
              <div className="relative w-12 h-12 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
            </div>
            <div className="pt-0.5">
              <h3 id="clear-all-title" className="text-lg font-bold text-gray-900 leading-tight">
                Clear schedules?
              </h3>
              <p id="clear-all-desc" className="text-sm text-gray-600 mt-1">
                Choose whether to clear only{" "}
                <span className="font-bold text-gray-900">{sectionName}</span>{" "}
                or the entire loaded schedule{activeTermText ? ` for ${activeTermText}` : ""}.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-6 py-5">
          <button
            type="button"
            onClick={() => confirmClearAll("section")}
            disabled={isClearingAll || sectionClassCount === 0}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-rose-200 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>
              <span className="block text-sm font-bold text-slate-900">Clear current section</span>
              <span className="mt-0.5 block text-xs font-medium text-slate-500">
                Remove {sectionClassCount} class{sectionClassCount !== 1 ? "es" : ""} from {sectionName}.
              </span>
            </span>
            <Trash2 className="h-4 w-4 shrink-0 text-rose-600" />
          </button>
          <button
            type="button"
            onClick={() => confirmClearAll("all")}
            disabled={isClearingAll || allClassCount === 0}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>
                <span className="block text-sm font-bold text-rose-800">Clear entire schedule</span>
                <span className="mt-0.5 block text-xs font-medium text-rose-700">
                Remove all {allClassCount} loaded class{allClassCount !== 1 ? "es" : ""} for this department.
              </span>
            </span>
            {isClearingAll ? <LoadingSpinner className="h-4 w-4 shrink-0 text-rose-600" /> : <Trash2 className="h-4 w-4 shrink-0 text-rose-600" />}
          </button>
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs font-medium text-amber-800">
              Cleared classes are archived and can be restored by the VPAA from the Archive.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={cancelClearAll}
            disabled={isClearingAll}
            className="border border-gray-300 rounded-lg px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
          >
            Keep Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
