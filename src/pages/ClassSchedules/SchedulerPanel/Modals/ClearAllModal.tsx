import { useEffect, useRef } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { MOCK_SECTIONS } from "../constants";
import type { ScheduleItem } from "../types";

interface ClearAllModalProps {
  isClearAllModalOpen: boolean;
  selectedSectionId: string;
  sectionSchedules: ScheduleItem[];
  confirmClearAll: () => void;
  cancelClearAll: () => void;
}

export default function ClearAllModal({
  isClearAllModalOpen,
  selectedSectionId,
  sectionSchedules,
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

  const sectionName = MOCK_SECTIONS.find((s) => s.id === selectedSectionId)?.name ?? "this section";
  const classCount = sectionSchedules.length;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 min-h-screen p-4"
      onClick={(e) => { if (e.target === e.currentTarget) cancelClearAll(); }}
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
            aria-label="Close"
            className="absolute right-4 top-4 text-rose-400 hover:text-rose-600 hover:bg-white/70 rounded-full p-1 transition-colors"
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
                Clear entire schedule?
              </h3>
              <p id="clear-all-desc" className="text-sm text-gray-600 mt-1">
                You're about to remove{" "}
                <span className="font-bold text-rose-700">
                  {classCount} class{classCount !== 1 ? "es" : ""}
                </span>{" "}
                from{" "}
                <span className="font-bold text-gray-900">{sectionName}</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs font-medium text-amber-800">
              This action cannot be undone. Every placed class for this section will be
              permanently removed from the timetable.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={cancelClearAll}
            className="border border-gray-300 rounded-lg px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            Keep Schedule
          </button>
          <button
            type="button"
            onClick={confirmClearAll}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-1"
          >
            <Trash2 className="w-4 h-4" />
            Yes, Clear All
          </button>
        </div>
      </div>
    </div>
  );
}
