import type React from "react";
import { AlertTriangle, Building2, CalendarDays, CalendarPlus, ChevronDown, Clock, Loader2, MapPin, Monitor, TreePine, X } from "lucide-react";
import { DAYS, getCategoryStyles, getLeftAccentBorder, MOCK_ROOMS, slotToTimeStr } from "../constants";
import type { DropContext, Subject } from "../types";

interface DropModalProps {
  dropContext: DropContext | null;
  dropSubject: Subject | null;
  dropSubjectIsField: boolean;
  modalRoomId: string;
  setModalRoomId: (value: string) => void;
  modalClassMode: "on-site" | "online" | "field";
  setModalClassMode: (value: "on-site" | "online" | "field") => void;
  modalIsHybrid: boolean;
  setModalIsHybrid: (value: boolean) => void;
  modalPreferredPattern: "MW" | "TTh" | null;
  setModalPreferredPattern: (value: "MW" | "TTh" | null) => void;
  modalValidationError: string;
  setModalValidationError: (value: string) => void;
  modalConflict: string | null;
  isModalLoading: boolean;
  setDropContext: (value: DropContext | null) => void;
  handleModalConfirm: (e: React.FormEvent) => void;
}

export default function DropModal({
  dropContext,
  dropSubject,
  dropSubjectIsField,
  modalRoomId,
  setModalRoomId,
  modalClassMode,
  setModalClassMode,
  modalIsHybrid,
  setModalIsHybrid,
  modalPreferredPattern,
  setModalPreferredPattern,
  modalValidationError,
  setModalValidationError,
  modalConflict,
  isModalLoading,
  setDropContext,
  handleModalConfirm
}: DropModalProps) {
  if (!dropContext || !dropSubject) return null;

  const FULL_DAYS: Record<string, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
    Thu: "Thursday", Fri: "Friday", Sat: "Saturday"
  };
  const dropLeftBorder = getLeftAccentBorder(dropSubject.category);
  const dropStyles = getCategoryStyles(dropSubject.category);
  const hasConflict = !!modalConflict;
  const isDisabled = hasConflict || isModalLoading;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 min-h-screen"
      onClick={(e) => { if (e.target === e.currentTarget) setDropContext(null); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto transition-all duration-200 animate-in fade-in zoom-in-95">
        <div className="flex justify-between items-start px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <CalendarPlus className="w-5 h-5 text-[#4e0a10] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-gray-800 leading-tight">Place Subject</h3>
              <p className="text-xs text-gray-400 mt-0.5">Confirm placement details below</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDropContext(null)}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`mx-6 mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 ${dropLeftBorder}`}>
          <div className="flex justify-between items-start gap-2">
            <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">{dropSubject.code}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 font-medium">
                {dropSubject.units}u
              </span>
              <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${dropStyles.typeBadge}`}>
                {dropStyles.label}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-1">{dropSubject.name}</p>
        </div>

        <form onSubmit={handleModalConfirm} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Day</label>
              <div className="relative">
                <CalendarDays className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  readOnly
                  value={FULL_DAYS[DAYS[dropContext.dayIndex]] ?? DAYS[dropContext.dayIndex]}
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Time</label>
              <div className="relative">
                <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  readOnly
                  value={slotToTimeStr(dropContext.startSlot)}
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">End Time (Auto-computed)</label>
            <div className="relative">
              <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                readOnly
                value={slotToTimeStr(dropContext.startSlot + dropSubject.units * 2)}
                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Based on {dropSubject.units} unit{dropSubject.units !== 1 ? "s" : ""} = {dropSubject.units} hour{dropSubject.units !== 1 ? "s" : ""}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Room <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              {modalClassMode === "on-site" ? (
                <>
                  <select
                    value={modalRoomId}
                    onChange={(e) => { setModalRoomId(e.target.value); setModalValidationError(""); }}
                    className={`w-full appearance-none border rounded-lg pl-9 pr-8 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-amber-400 focus:border-transparent ${
                      modalValidationError && !modalRoomId
                        ? "border-red-400 bg-red-50 text-red-700 focus:ring-red-400"
                        : "border-gray-200 bg-white text-gray-700"
                    }`}
                  >
                    <option value="">Select a room...</option>
                    {MOCK_ROOMS.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </>
              ) : (
                <input
                  type="text"
                  readOnly
                  value={modalClassMode === "online" ? "Online" : "Field"}
                  className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none font-medium capitalize"
                />
              )}
            </div>
            {modalClassMode === "on-site" && modalValidationError && !modalRoomId && (
              <p className="text-xs text-red-500 mt-1">{modalValidationError}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Class Mode <span className="text-red-500 ml-0.5">*</span>
            </label>
            <div className="flex gap-2">
              {([
                { value: "on-site" as const, label: "On-Site", Icon: Building2, selectedCls: "bg-blue-600 text-white border-blue-600" },
                { value: "online" as const, label: "Online", Icon: Monitor, selectedCls: "bg-green-600 text-white border-green-600" },
                { value: "field" as const, label: "Field", Icon: TreePine, selectedCls: "bg-orange-600 text-white border-orange-600" }
              ]).map(({ value: m, label, Icon, selectedCls }) => {
                const isSelected = modalClassMode === m;
                const isDisabledMode = dropSubjectIsField && m !== "field";
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={isDisabledMode}
                    onClick={() => setModalClassMode(m)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 border rounded-lg text-sm font-medium transition-all ${
                      isSelected
                        ? selectedCls
                        : isDisabledMode
                        ? "opacity-50 bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
            {dropSubjectIsField && (
              <p className="text-xs text-orange-500 mt-1">Field mode is required for this subject type.</p>
            )}
          </div>

          <div className="flex items-center justify-between p-3 border border-gray-200 rounded-xl bg-gray-50/50">
            <span className="text-xs font-semibold text-gray-700">Hybrid (On-site & Online)</span>
            <button
              type="button"
              onClick={() => setModalIsHybrid(!modalIsHybrid)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                modalIsHybrid ? "bg-[#4e0a10]" : "bg-gray-200"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  modalIsHybrid ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Preferred Meeting Pattern
            </label>
            <div className="flex gap-2">
              {([
                { value: null, label: "None" },
                { value: "MW" as const, label: "MW (Mon–Wed)" },
                { value: "TTh" as const, label: "TTh (Tue–Thu)" }
              ]).map(({ value: p, label }) => {
                const isSelected = modalPreferredPattern === p;
                return (
                  <button
                    key={String(p)}
                    type="button"
                    onClick={() => setModalPreferredPattern(p)}
                    className={`flex-1 py-2 border rounded-lg text-xs font-semibold transition-all ${
                      isSelected
                        ? "bg-[#4e0a10] text-white border-[#4e0a10]"
                        : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {hasConflict && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-sm font-semibold text-red-700">Conflicts Detected</span>
              </div>
              <ul className="space-y-1">
                <li className="flex items-start gap-2 text-xs text-red-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                  {modalConflict}
                </li>
              </ul>
            </div>
          )}
        </form>

        <div className="flex justify-end gap-3 px-6 pb-6 pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setDropContext(null)}
            className="border border-gray-300 rounded-lg px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => handleModalConfirm(e as unknown as React.FormEvent)}
            disabled={isDisabled}
            className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
              hasConflict
                ? "border border-red-300 text-red-600 bg-white cursor-not-allowed opacity-75"
                : isModalLoading
                ? "bg-[#4e0a10] text-white opacity-75 cursor-not-allowed"
                : "bg-[#4e0a10] text-white hover:brightness-110 cursor-pointer"
            }`}
          >
            {isModalLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Placing...</>
            ) : hasConflict ? (
              "Cannot Place — Conflicts Found"
            ) : (
              "Place on Timetable"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
