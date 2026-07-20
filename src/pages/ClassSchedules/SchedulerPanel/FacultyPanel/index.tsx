import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, Loader2, MapPin, UserMinus, Users } from "lucide-react";
import type { ScheduleItem, Subject, Faculty } from "../types";
import Skeleton from "../../../../components/ui/Skeleton";
import SearchField from "../components/SearchField";

interface FacultyPanelProps {
  isPhase2Active: boolean;
  currentStatus: ScheduleItem["status"];
  sectionSchedules: ScheduleItem[];
  assignedSlotsCount: number;
  totalSlotsCount: number;
  unassignedSlotsCount: number;
  isAssignedListCollapsed: boolean;
  setIsAssignedListCollapsed: (value: boolean) => void;
  facultyActionSlotId: string | null;
  handleInlineFacultyAssign: (slotId: string, facId: string) => void;
  handleRemoveInlineFaculty: (slotId: string) => void;
  checkFacultyConflict: (facultyId: string, scheduleId: string) => string | null;
  canManageScheduleFaculty: (schedule: ScheduleItem) => boolean;
  subjects: Subject[];
  faculties: Faculty[];
  isLoading?: boolean;
}

export default function FacultyPanel({
  isPhase2Active,
  currentStatus,
  sectionSchedules,
  assignedSlotsCount,
  totalSlotsCount,
  unassignedSlotsCount,
  isAssignedListCollapsed,
  setIsAssignedListCollapsed,
  facultyActionSlotId,
  handleInlineFacultyAssign,
  handleRemoveInlineFaculty,
  checkFacultyConflict,
  canManageScheduleFaculty,
  subjects,
  faculties,
  isLoading = false
}: FacultyPanelProps) {
  const [openDropdownSlotId, setOpenDropdownSlotId] = useState<string | null>(null);
  const [selectedFacultyBySlot, setSelectedFacultyBySlot] = useState<Record<string, string>>({});
  const [conflictWarningBySlot, setConflictWarningBySlot] = useState<Record<string, string>>({});
  const [facultySearchBySlot, setFacultySearchBySlot] = useState<Record<string, string>>({});

  const subjectById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects]
  );
  const facultyById = useMemo(
    () => new Map(faculties.map((faculty) => [faculty.id, faculty])),
    [faculties]
  );
  const unassignedSchedules = useMemo(
    () => sectionSchedules.filter((schedule) => !schedule.facultyId),
    [sectionSchedules]
  );
  const assignedSchedules = useMemo(
    () => sectionSchedules.filter((schedule) => schedule.facultyId),
    [sectionSchedules]
  );

  if (!isPhase2Active || currentStatus === "approved") return null;

  const handleFacultySelect = (slotId: string, facultyId: string) => {
    setOpenDropdownSlotId(null);
    if (facultyActionSlotId === slotId) return;
    setSelectedFacultyBySlot((prev) => ({ ...prev, [slotId]: facultyId }));
    setFacultySearchBySlot((prev) => ({ ...prev, [slotId]: "" }));

    if (!facultyId) {
      setConflictWarningBySlot((prev) => ({ ...prev, [slotId]: "" }));
      return;
    }

    const conflict = checkFacultyConflict(facultyId, slotId);
    if (conflict) {
      setConflictWarningBySlot((prev) => ({ ...prev, [slotId]: conflict }));
      return;
    }

    setConflictWarningBySlot((prev) => ({ ...prev, [slotId]: "" }));
    handleInlineFacultyAssign(slotId, facultyId);
  };

  const handleAssignWithWarning = (slotId: string) => {
    const facultyId = selectedFacultyBySlot[slotId];
    if (!facultyId) return;
    if (conflictWarningBySlot[slotId]) return;
    if (facultyActionSlotId === slotId) return;
    handleInlineFacultyAssign(slotId, facultyId);
  };

  return (
    <div className="w-full lg:w-1/4 min-w-[280px] shrink-0 bg-white border-r border-gray-200 flex flex-col h-full font-sans">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-[#4e0a10]" />
          <h2 className="text-sm font-bold text-slate-900">Faculty Assignment</h2>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Assign instructors to each subject slot
        </p>
      </div>

      <div className="p-4 border-b border-slate-100 bg-[#4e0a10]/5 shrink-0">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-[#4e0a10]">Assignment Progress</span>
          <span className="text-xs font-bold text-slate-600">{assignedSlotsCount} of {totalSlotsCount} slots</span>
        </div>
        <div className="flex w-full gap-0.5 h-2 rounded-full overflow-hidden mt-1.5" aria-label={`${assignedSlotsCount} of ${totalSlotsCount} slots assigned`}>
          {Array.from({ length: totalSlotsCount }).map((_, index) => (
            <span
              key={`assignment-progress-${index}`}
              className={`h-full flex-1 first:rounded-l-full last:rounded-r-full ${index < assignedSlotsCount ? "bg-emerald-600" : "bg-slate-200"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
            {assignedSlotsCount} Assigned
          </span>
          <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-orange-50 text-orange-700 border border-orange-200">
            {unassignedSlotsCount} Unassigned
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={`sk-faculty-${idx}`} className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm mb-2 animate-pulse">
              <div className="flex justify-between items-center">
                <div className="min-w-0 flex-1 pr-4">
                  <Skeleton className="h-4 w-20 mb-1.5" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <Skeleton className="h-8 w-full mt-3 rounded-lg" />
            </div>
          ))
        ) : totalSlotsCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Users className="text-gray-300 w-8 h-8" />
            <p className="text-sm text-gray-400 font-medium mt-2">No subjects scheduled yet</p>
          </div>
        ) : (
          <>
            <div>
              {unassignedSchedules.length === 0 ? (
                <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                  <CheckCircle2 className="text-emerald-600 w-5 h-5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-emerald-800">All subject slots are assigned</p>
                    <p className="text-[10px] text-emerald-700 mt-0.5">Faculty assignment is complete for this section.</p>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Needs Faculty ({unassignedSlotsCount})
                  </h3>
                  {unassignedSchedules.map((slot) => {
                    const sub = subjectById.get(slot.subjectId);
                    const selectedFacultyId = selectedFacultyBySlot[slot.id] ?? "";
                    const selectedFaculty = facultyById.get(selectedFacultyId);
                    const conflictWarning = conflictWarningBySlot[slot.id] ?? "";
                    const facultySearch = facultySearchBySlot[slot.id] ?? "";
                    const isSavingSlot = facultyActionSlotId === slot.id;
                    const canManageFaculty = canManageScheduleFaculty(slot);
                    const filteredFaculties = faculties.filter((faculty) =>
                      faculty.name.toLowerCase().includes(facultySearch.trim().toLowerCase())
                    );

                    return (
                      <div key={slot.id} className="border border-slate-200 rounded-xl p-3 bg-white hover:border-[#4e0a10]/30 transition-all shadow-sm mb-2">
                        <div className="flex justify-between items-center">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 uppercase truncate">{sub?.code}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub?.name}</div>
                          </div>
                          <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {slot.day} {slot.startTime}
                          </span>
                        </div>

                        <div className="relative mt-2">
                          <button
                            type="button"
                            disabled={isSavingSlot || !canManageFaculty}
                            onClick={() => setOpenDropdownSlotId(openDropdownSlotId === slot.id ? null : slot.id)}
                            aria-haspopup="listbox"
                            aria-expanded={openDropdownSlotId === slot.id}
                            className={`w-full flex items-center justify-between border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 focus:border-[#4e0a10] outline-none ${
                              isSavingSlot || !canManageFaculty ? "cursor-not-allowed opacity-70" : ""
                            }`}
                          >
                            <span className="truncate">{canManageFaculty ? selectedFaculty?.name ?? "-- Assign Faculty --" : "CAS assignment only"}</span>
                            {isSavingSlot ? (
                              <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                            ) : (
                              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${openDropdownSlotId === slot.id ? "rotate-180" : ""}`} />
                            )}
                          </button>

                          {openDropdownSlotId === slot.id && canManageFaculty && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-30 overflow-hidden">
                              <div className="p-2 border-b border-slate-100">
                                <SearchField
                                  value={facultySearch}
                                  onChange={(value) => setFacultySearchBySlot((prev) => ({ ...prev, [slot.id]: value }))}
                                  placeholder="Search faculty..."
                                  clearLabel="Clear faculty search"
                                  inputClassName="py-1.5 rounded-md font-semibold text-slate-600 focus:border-[#4e0a10] focus:ring-[#4e0a10]/10"
                                />
                              </div>
                              <div role="listbox" aria-label="Available faculty" className="py-1 max-h-44 overflow-y-auto">
                                <button
                                  type="button"
                                  onClick={() => handleFacultySelect(slot.id, "")}
                                  role="option"
                                  aria-selected={!selectedFacultyId}
                                  className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                                >
                                  -- Assign Faculty --
                                </button>
                                {filteredFaculties.length === 0 ? (
                                  <p className="px-2.5 py-2 text-xs font-semibold text-slate-400">
                                    No faculty found.
                                  </p>
                                ) : (
                                  filteredFaculties.map((faculty) => {
                                    const facultyConflict = checkFacultyConflict(faculty.id, slot.id);
                                    return (
                                      <button
                                        key={faculty.id}
                                        type="button"
                                        disabled={Boolean(facultyConflict)}
                                        onClick={() => handleFacultySelect(slot.id, faculty.id)}
                                        role="option"
                                        aria-selected={selectedFacultyId === faculty.id}
                                        title={facultyConflict ?? undefined}
                                        className={`w-full px-2.5 py-1.5 text-left text-xs font-semibold ${
                                          facultyConflict
                                            ? "cursor-not-allowed bg-slate-50 text-slate-400"
                                            : "text-slate-600 hover:bg-slate-50"
                                        }`}
                                      >
                                        <span className="flex items-center justify-between gap-2">
                                          <span className="truncate">{faculty.name}</span>
                                          {facultyConflict && (
                                            <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                                              Already scheduled
                                            </span>
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {conflictWarning && (
                          <div className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{conflictWarning}</span>
                          </div>
                        )}

                        {selectedFacultyId && conflictWarning && (
                          <button
                            type="button"
                            disabled={isSavingSlot || Boolean(conflictWarning)}
                            onClick={() => handleAssignWithWarning(slot.id)}
                            className={`bg-[#4e0a10] text-white rounded-lg px-3 py-1.5 text-xs font-bold w-full mt-2 hover:bg-[#3a0809] flex items-center justify-center gap-2 ${
                              isSavingSlot || conflictWarning ? "cursor-not-allowed opacity-75" : ""
                            }`}
                          >
                            {isSavingSlot ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              "Assign"
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 mt-3">
              <button
                type="button"
                onClick={() => setIsAssignedListCollapsed(!isAssignedListCollapsed)}
                className="w-full flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-700"
              >
                <span>Assigned Faculty ({assignedSlotsCount})</span>
                {isAssignedListCollapsed
                  ? <ChevronRight className="w-3.5 h-3.5 text-slate-400 transition-transform duration-200" />
                  : <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform duration-200" />
                }
              </button>

              {!isAssignedListCollapsed && (
                <div className="mt-2">
                  {assignedSchedules.length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-xs">No slots assigned yet</div>
                  ) : (
                    assignedSchedules.map((slot) => {
                      const sub = subjectById.get(slot.subjectId);
                      const isSavingSlot = facultyActionSlotId === slot.id;
                      const canManageFaculty = canManageScheduleFaculty(slot);
                      return (
                        <div key={slot.id} className="group border border-slate-200 rounded-xl px-3 py-2.5 bg-white shadow-sm mb-2 flex justify-between items-center gap-3 hover:border-[#4e0a10]/25 hover:shadow transition-all">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5 min-w-0">
                              <div className="text-xs font-bold text-slate-900 uppercase shrink-0">{sub?.code}</div>
                              <div className="text-[10px] text-slate-400 truncate">{sub?.name}</div>
                            </div>
                            <div className="text-[11px] text-[#4e0a10] font-semibold truncate mt-0.5">{slot.facultyName}</div>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[10px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <CalendarClock className="w-3 h-3 text-slate-400" />
                                {slot.day} · {slot.startTime}–{slot.endTime}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {slot.roomName}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <button
                              type="button"
                              disabled={isSavingSlot || !canManageFaculty}
                              onClick={() => handleRemoveInlineFaculty(slot.id)}
                              aria-label={`Remove faculty assignment from ${sub?.code ?? "slot"}`}
                              className={`rounded-lg p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ${
                                isSavingSlot || !canManageFaculty ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                              }`}
                              title={canManageFaculty ? "Unassign faculty" : "Only CAS can remove GEC instructors"}
                            >
                              {isSavingSlot ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <UserMinus className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
