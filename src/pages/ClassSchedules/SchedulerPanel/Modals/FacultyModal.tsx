import type React from "react";
import { AlertTriangle, User, X } from "lucide-react";
import { getCategoryStyles, MOCK_FACULTY, MOCK_SUBJECTS } from "../constants";
import type { FacultyAssignmentPopupState, ScheduleItem } from "../types";

interface FacultyModalProps {
  facultyAssignmentPopup: FacultyAssignmentPopupState | null;
  schedules: ScheduleItem[];
  popupConflictWarning: string;
  popupValidationError: string;
  setFacultyAssignmentPopup: (value: FacultyAssignmentPopupState | null) => void;
  handlePopupFacultyChange: (facultyId: string) => void;
  handleAssignFaculty: (e: React.FormEvent) => void;
  handleRemoveFaculty: () => void;
}

export default function FacultyModal({
  facultyAssignmentPopup,
  schedules,
  popupConflictWarning,
  popupValidationError,
  setFacultyAssignmentPopup,
  handlePopupFacultyChange,
  handleAssignFaculty,
  handleRemoveFaculty
}: FacultyModalProps) {
  if (!facultyAssignmentPopup) return null;
  const schedule = schedules.find((s) => s.id === facultyAssignmentPopup.scheduleId);
  if (!schedule) return null;
  const subject = MOCK_SUBJECTS.find((s) => s.id === schedule.subjectId);
  const subStyles = subject ? getCategoryStyles(subject.category) : null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl p-6 w-[400px] max-w-[95vw] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Assign Instructor</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Assign a faculty member to this scheduled subject slot</p>
          </div>
          <button
            type="button"
            onClick={() => setFacultyAssignmentPopup(null)}
            className="text-slate-400 hover:text-slate-600 rounded-full p-1 bg-slate-50 border border-slate-100 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {subject && subStyles && (
          <div className={`border rounded-xl p-3 flex flex-col gap-1.5 text-[11px] ${subStyles.bg} ${subStyles.border} ${subStyles.text}`}>
            <div className="flex justify-between items-center">
              <span className="font-extrabold text-[12px] uppercase">{subject.code}</span>
              <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded">
                {schedule.day} {schedule.startTime} – {schedule.endTime}
              </span>
            </div>
            <div className="font-semibold opacity-85 leading-snug">{subject.name}</div>
            <div className="text-[9px] opacity-75 font-semibold mt-1">
              Room: {schedule.roomName} | Mode: {schedule.mode}
            </div>
          </div>
        )}

        <form onSubmit={handleAssignFaculty} className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <User className="w-3 h-3 text-[#4e0a10]" />
              Select Instructor <span className="text-rose-500">*</span>
            </label>
            <select
              value={facultyAssignmentPopup.facultyId}
              onChange={(e) => handlePopupFacultyChange(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#4e0a10] font-semibold transition-colors"
            >
              <option value="">-- Choose Faculty --</option>
              {MOCK_FACULTY.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

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
              className="flex-1 px-4 py-2.5 bg-[#4e0a10] hover:bg-[#3a0809] text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              {popupConflictWarning ? "Assign Anyway" : "Assign Faculty"}
            </button>
            {schedule.facultyId && (
              <button
                type="button"
                onClick={handleRemoveFaculty}
                className="px-4 py-2.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-bold transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
