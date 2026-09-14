import type React from "react";
import { useEffect, useRef } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, Clock, MapPin, User, UserCheck, X } from "lucide-react";
import { getCategoryStyles } from "../constants";
import { eligibleFacultiesForSubject, requiredTeachingProgramId } from "../facultyEligibility";
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
  canManageScheduleFaculty: (schedule: ScheduleItem) => boolean;
  getFacultyRestrictionMessage: (schedule: ScheduleItem) => string;
  checkFacultyConflict: (facultyId: string, scheduleId: string) => string | null;
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
  canManageScheduleFaculty,
  getFacultyRestrictionMessage,
  checkFacultyConflict,
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
  const canManageFaculty = canManageScheduleFaculty(schedule);
  const restrictionMessage = getFacultyRestrictionMessage(schedule);
  const assignedTeachingDepartmentLabel = subject?.teachingDepartmentCode
    ? `${subject.teachingDepartmentCode} Only`
    : subject?.teachingDepartmentName
    ? `${subject.teachingDepartmentName} Only`
    : "Assigned Department Only";
  const hasAssignedTeachingDepartment = Boolean(subject?.teachingDepartmentId);
  // Only instructors the save would accept are offered. A major is taught by its
  // own department and, when the course names one, its own program.
  const eligibleFaculties = eligibleFacultiesForSubject(faculties, subject, schedule.departmentId ?? null);
  const requiredProgramId = requiredTeachingProgramId(subject);
  const programRestrictionNote = requiredProgramId === null
    ? null
    : eligibleFaculties.length === 0
      ? `No instructor in the ${subject?.programCode ?? "assigned"} program is available for this major yet — set the program on the instructor's profile first.`
      : `Only ${subject?.programCode ?? "the assigned"} program instructors can teach this major.`;
  const isSameAssignedFaculty = Boolean(schedule.facultyId && facultyAssignmentPopup.facultyId === schedule.facultyId);
  const meetingSchedules = schedules
    .filter((item) =>
      item.semesterId === schedule.semesterId &&
      item.sectionId === schedule.sectionId &&
      item.subjectId === schedule.subjectId
    )
    .sort((left, right) => left.dayIndex - right.dayIndex || left.startSlot - right.startSlot);
  const meetingLabel = (meeting: ScheduleItem) => {
    if (meeting.meetingType === "laboratory") return "Laboratory";
    if (meeting.meetingType === "lecture" && meeting.mode === "online") return "Online Lecture";
    if (meeting.meetingType === "lecture") return "Lecture";
    const laboratorySlots = Number(subject?.labHours ?? 0) * 2;
    if (laboratorySlots > 0 && meeting.durationSlots === laboratorySlots) return "Laboratory";
    return meeting.mode === "online" ? "Online Lecture" : "Session";
  };
  const meetingDuration = (meeting: ScheduleItem) => {
    const durationMinutes = Math.max(0, meeting.durationSlots) * 30;
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    return minutes === 0 ? `${hours} hr${hours === 1 ? "" : "s"}` : `${hours} hr ${minutes} min`;
  };
  const meetingRoom = (meeting: ScheduleItem) => meeting.mode === "online" ? "Online" : meeting.roomName || "Room TBA";
  const shortDay = (day: string) => ({
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thur",
    Friday: "Fri",
    Saturday: "Sat",
    Sunday: "Sun",
  } as Record<string, string>)[day] ?? day.slice(0, 3);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 min-h-screen p-4"
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
                  <div className="min-w-0 sm:col-span-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Sessions</p>
                    <div className="mt-1 space-y-1.5">
                      {meetingSchedules.map((meeting) => (
                        <div key={meeting.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm font-bold text-gray-800">
                          <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#4e0a10]">{meetingLabel(meeting)}</span>
                          <span className="truncate">{shortDay(meeting.day)} {meeting.startTime} - {meeting.endTime}</span>
                          <span className="truncate text-xs font-semibold text-gray-500">{meetingRoom(meeting)} · {meetingDuration(meeting)}</span>
                        </div>
                      ))}
                    </div>
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
              {!canManageFaculty && hasAssignedTeachingDepartment ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {assignedTeachingDepartmentLabel}
                </span>
              ) : schedule.facultyId && (
                <span className="rounded-full bg-[#C9952A]/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[#7a4c08]">
                  Assigned
                </span>
              )}
            </div>

            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <select
                value={facultyAssignmentPopup.facultyId}
                disabled={isSavingFaculty || !canManageFaculty}
                onChange={(event) => handlePopupFacultyChange(event.target.value)}
                className={`w-full appearance-none rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-8 text-sm font-semibold text-gray-700 outline-none transition-all focus:border-[#4e0a10] focus:ring-2 focus:ring-[#4e0a10]/20 ${
                  isSavingFaculty || !canManageFaculty ? "cursor-not-allowed opacity-70" : ""
                }`}
              >
                <option value="">{canManageFaculty ? "Select an instructor" : restrictionMessage}</option>
                {eligibleFaculties.map((faculty) => {
                  const conflict = checkFacultyConflict(faculty.id, schedule.id);
                  return (
                    // A clash can be assigned over on purpose, so it is labelled
                    // rather than disabled.
                    <option key={faculty.id} value={faculty.id}>
                      {conflict ? `${faculty.name} - Conflict` : faculty.name}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {canManageFaculty && programRestrictionNote && (
              <p className="text-xs font-semibold text-[#7a4c08]">{programRestrictionNote}</p>
            )}

            <div className="grid grid-cols-1 gap-2 text-xs text-gray-500">
              {meetingSchedules.map((meeting) => (
                <div key={meeting.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[0.8fr_1fr_1fr]">
                  <div className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <CalendarDays className="w-3.5 h-3.5 shrink-0 text-[#4e0a10]" />
                    <span className="truncate">{shortDay(meeting.day)}</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-[#4e0a10]" />
                    <span className="truncate">{meeting.startTime} - {meeting.endTime}</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-[#4e0a10]" />
                    <span className="truncate">{meetingLabel(meeting)} · {meetingRoom(meeting)} · {meeting.mode === "online" ? "Online" : "Face-to-face"} · {meetingDuration(meeting)}</span>
                  </div>
                </div>
              ))}
            </div>

            {selectedFaculty && (
              <p className="text-xs font-semibold text-gray-500">
                Selected instructor: <span className="text-gray-800">{selectedFaculty.name}</span>
              </p>
            )}

            {!canManageFaculty && (
              <p className="text-xs font-semibold text-slate-500">
                {restrictionMessage} You can view the assignment, but only that department can change the instructor.
              </p>
            )}
          </section>

          {popupConflictWarning && (
            <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl text-orange-800">
              <AlertTriangle className="w-4 h-4 shrink-0 text-orange-600 mt-0.5" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-orange-900">Conflict found</div>
                <div className="text-[10px] font-semibold mt-0.5 leading-relaxed">{popupConflictWarning}</div>
                <div className="text-[10px] font-semibold mt-1 leading-relaxed">
                  You can still assign this instructor. Assign will ask you to confirm.
                </div>
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
              disabled={isSavingFaculty || !canManageFaculty || isSameAssignedFaculty}
              className={`flex-1 px-4 py-2.5 text-white rounded-lg text-sm font-bold shadow-xs transition-colors flex items-center justify-center gap-2 ${
                "bg-[#4e0a10] hover:bg-[#3a0809]"
              } ${
                isSavingFaculty || !canManageFaculty || isSameAssignedFaculty ? "cursor-not-allowed opacity-75" : ""
              }`}
            >
              {isSavingFaculty ? (
                <>
                  <LoadingSpinner className="w-3.5 h-3.5" />
                  Saving...
                </>
              ) : (
                isSameAssignedFaculty ? "Already Assigned" : "Assign Instructor"
              )}
            </button>
            {schedule.facultyId && (
              <button
                type="button"
                onClick={handleRemoveFaculty}
                disabled={isSavingFaculty || !canManageFaculty}
                className={`px-4 py-2.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                  isSavingFaculty || !canManageFaculty ? "cursor-not-allowed opacity-70" : ""
                }`}
              >
                {isSavingFaculty ? <LoadingSpinner className="w-3.5 h-3.5" /> : "Remove"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
import LoadingSpinner from "../../../../components/ui/LoadingSpinner";
