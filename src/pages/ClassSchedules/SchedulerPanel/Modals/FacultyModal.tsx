import type React from "react";
import { useEffect, useRef } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, Clock, Loader2, MapPin, User, UserCheck, X } from "lucide-react";
import { getCategoryStyles } from "../constants";
import type { FacultyAssignmentPopupState, ScheduleItem, Subject, Faculty } from "../types";

interface FacultyModalProps {
  facultyAssignmentPopup: FacultyAssignmentPopupState | null;
  facultyActionSlotId: string | null;
  schedules: ScheduleItem[];
  popupConflictWarning: string;
  popupValidationError: string;
  setFacultyAssignmentPopup: (value: FacultyAssignmentPopupState | null) => void;
  handlePopupFacultyChange: (facultyId: string) => void;
  handleAssignFaculty: (e: React.FormEvent) => void;
  handleRemoveFaculty: () => void;
  subjects: Subject[];
  faculties: Faculty[];
}

export default function FacultyModal({
  facultyAssignmentPopup,
  facultyActionSlotId,
  schedules,
  popupConflictWarning,
  popupValidationError,
  setFacultyAssignmentPopup,
  handlePopupFacultyChange,
  handleAssignFaculty,
  handleRemoveFaculty,
  subjects,
  faculties
}: FacultyModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!facultyAssignmentPopup) return;

    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFacultyAssignmentPopup(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [facultyAssignmentPopup, setFacultyAssignmentPopup]);

  if (!facultyAssignmentPopup) return null;

  const schedule = schedules.find((item) => item.id === facultyAssignmentPopup.scheduleId);
  if (!schedule) return null;

  const subject = subjects.find((item) => item.id === schedule.subjectId);
  const subStyles = subject ? getCategoryStyles(subject.category) : null;
  const isSavingFaculty = facultyActionSlotId === schedule.id;
  const selectedFaculty = faculties.find((faculty) => faculty.id === facultyAssignmentPopup.facultyId);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 min-h-screen p-4"
      onClick={(event) => { if (event.target === event.currentTarget) setFacultyAssignmentPopup(null); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="faculty-modal-title"
        aria-describedby="faculty-modal-desc"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[34rem] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex justify-between items-start px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start gap-3">
            <UserCheck className="w-5 h-5 text-[#4e0a10] mt-0.5 shrink-0" />
            <div>
              <h3 id="faculty-modal-title" className="text-lg font-semibold text-gray-800 leading-tight">Assign Instructor</h3>
              <p id="faculty-modal-desc" className="text-sm text-gray-500 mt-0.5">
                Choose the eligible instructor for this scheduled subject.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setFacultyAssignmentPopup(null)}
            aria-label="Close instructor assignment dialog"
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleAssignFaculty} className="px-5 py-4 space-y-4">
          {subject && subStyles && (
            <section className="rounded-xl border border-[#4e0a10]/10 bg-[#4e0a10]/5 px-4 py-3">
              <div className="flex flex-col gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-extrabold text-gray-900">{subject.code}</p>
                    <span className="text-xs bg-white text-gray-600 rounded-full border border-gray-200 px-2 py-0.5 font-bold">
                      {subject.units} units
                    </span>
                    <span className={`text-xs rounded-full px-2 py-0.5 border font-bold ${subStyles.typeBadge}`}>
                      {subStyles.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-500" title={subject.name}>{subject.name}</p>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#4e0a10]/10 pt-3 sm:grid-cols-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Section</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-gray-800">{schedule.sectionName}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Schedule</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-gray-800">{schedule.day}</p>
                    <p className="text-xs text-gray-500">{schedule.startTime} - {schedule.endTime}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Room</p>
                    <p className="mt-0.5 truncate text-sm font-bold text-gray-800">{schedule.roomName}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Delivery</p>
                    <p className="mt-0.5 truncate text-sm font-bold capitalize text-gray-800">{schedule.mode.replace("-", " ")}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-gray-100 bg-white p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                Eligible Instructor
              </label>
              {schedule.facultyId && (
                <span className="rounded-full bg-[#C9952A]/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[#7a4c08]">
                  Assigned
                </span>
              )}
            </div>

            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <select
                value={facultyAssignmentPopup.facultyId}
                disabled={isSavingFaculty}
                onChange={(event) => handlePopupFacultyChange(event.target.value)}
                className={`w-full appearance-none rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-8 text-sm font-semibold text-gray-700 outline-none transition-all focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/20 ${
                  isSavingFaculty ? "cursor-not-allowed opacity-70" : ""
                }`}
              >
                <option value="">Select an instructor</option>
                {faculties.map((faculty) => (
                  <option key={faculty.id} value={faculty.id}>{faculty.name}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs text-gray-500 sm:grid-cols-3">
              <div className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <CalendarDays className="w-3.5 h-3.5 shrink-0 text-[#4e0a10]" />
                <span className="truncate">{schedule.day}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <Clock className="w-3.5 h-3.5 shrink-0 text-[#4e0a10]" />
                <span className="truncate">{schedule.startTime} - {schedule.endTime}</span>
              </div>
              <div className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-[#4e0a10]" />
                <span className="truncate">{schedule.roomName}</span>
              </div>
            </div>

            {selectedFaculty && (
              <p className="text-xs font-semibold text-gray-500">
                Selected instructor: <span className="text-gray-800">{selectedFaculty.name}</span>
              </p>
            )}
          </section>

          {popupConflictWarning && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900">Warning: Conflict Found</div>
                <div className="text-[10px] font-semibold mt-0.5 leading-relaxed">{popupConflictWarning}</div>
              </div>
            </div>
          )}

          {popupValidationError && (
            <div className="flex items-center gap-1.5 p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[10px] font-semibold">{popupValidationError}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isSavingFaculty}
              className={`flex-1 px-4 py-2.5 bg-[#4e0a10] hover:bg-[#3a0809] text-white rounded-lg text-sm font-bold shadow-xs transition-colors flex items-center justify-center gap-2 ${
                isSavingFaculty ? "cursor-not-allowed opacity-75" : ""
              }`}
            >
              {isSavingFaculty ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                popupConflictWarning ? "Assign Anyway" : "Assign Instructor"
              )}
            </button>
            {schedule.facultyId && (
              <button
                type="button"
                onClick={handleRemoveFaculty}
                disabled={isSavingFaculty}
                className={`px-4 py-2.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                  isSavingFaculty ? "cursor-not-allowed opacity-70" : ""
                }`}
              >
                {isSavingFaculty ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Remove"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
