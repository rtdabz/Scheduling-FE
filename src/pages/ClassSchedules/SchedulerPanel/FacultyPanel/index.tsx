import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Users, X } from "lucide-react";
import { MOCK_FACULTY, MOCK_SUBJECTS } from "../constants";
import type { ScheduleItem } from "../types";

interface FacultyPanelProps {
  isPhase2Active: boolean;
  currentStatus: ScheduleItem["status"];
  sectionSchedules: ScheduleItem[];
  assignedSlotsCount: number;
  totalSlotsCount: number;
  unassignedSlotsCount: number;
  isAssignedListCollapsed: boolean;
  setIsAssignedListCollapsed: (value: boolean) => void;
  handleInlineFacultyAssign: (slotId: string, facId: string) => void;
  handleRemoveInlineFaculty: (slotId: string) => void;
  checkFacultyConflict: (facultyId: string, scheduleId: string) => string | null;
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
  handleInlineFacultyAssign,
  handleRemoveInlineFaculty,
  checkFacultyConflict
}: FacultyPanelProps) {
  const [openDropdownSlotId, setOpenDropdownSlotId] = useState<string | null>(null);
  const [selectedFacultyBySlot, setSelectedFacultyBySlot] = useState<Record<string, string>>({});
  const [conflictWarningBySlot, setConflictWarningBySlot] = useState<Record<string, string>>({});

  if (!isPhase2Active || currentStatus === "approved") return null;

  const handleFacultySelect = (slotId: string, facultyId: string) => {
    setOpenDropdownSlotId(null);
    setSelectedFacultyBySlot((prev) => ({ ...prev, [slotId]: facultyId }));

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
    handleInlineFacultyAssign(slotId, facultyId);
  };

  return (
    <div className="w-full lg:w-1/4 min-w-[280px] shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
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
          <span className="text-xs font-bold text-slate-600">{assignedSlotsCount} / {totalSlotsCount} Slots</span>
        </div>
        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1.5">
          <div
            className="bg-emerald-600 h-full transition-all duration-300"
            style={{ width: `${totalSlotsCount ? (assignedSlotsCount / totalSlotsCount) * 100 : 0}%` }}
          />
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
        {totalSlotsCount === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Users className="text-gray-300 w-8 h-8" />
            <p className="text-sm text-gray-400 font-medium mt-2">No subjects scheduled yet</p>
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Unassigned Slots ({unassignedSlotsCount})
              </h3>
              {sectionSchedules.filter((s) => !s.facultyId).length === 0 ? (
                <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl py-4 text-center">
                  <CheckCircle2 className="text-emerald-500 w-6 h-6 mx-auto mb-1" />
                  <div className="text-[11px] font-bold text-emerald-800">
                    All instructors assigned!
                  </div>
                </div>
              ) : (
                <div>
                  {sectionSchedules.filter((s) => !s.facultyId).map((slot) => {
                    const sub = MOCK_SUBJECTS.find((s) => s.id === slot.subjectId);
                    const selectedFacultyId = selectedFacultyBySlot[slot.id] ?? "";
                    const selectedFaculty = MOCK_FACULTY.find((f) => f.id === selectedFacultyId);
                    const conflictWarning = conflictWarningBySlot[slot.id] ?? "";

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
                            onClick={() => setOpenDropdownSlotId(openDropdownSlotId === slot.id ? null : slot.id)}
                            className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-50 focus:border-[#4e0a10] outline-none"
                          >
                            <span className="truncate">{selectedFaculty?.name ?? "-- Assign Faculty --"}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${openDropdownSlotId === slot.id ? "rotate-180" : ""}`} />
                          </button>

                          {openDropdownSlotId === slot.id && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-30 py-1 max-h-40 overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => handleFacultySelect(slot.id, "")}
                                className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                              >
                                -- Assign Faculty --
                              </button>
                              {MOCK_FACULTY.map((faculty) => (
                                <button
                                  key={faculty.id}
                                  type="button"
                                  onClick={() => handleFacultySelect(slot.id, faculty.id)}
                                  className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  {faculty.name}
                                </button>
                              ))}
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
                            onClick={() => handleAssignWithWarning(slot.id)}
                            className="bg-[#4e0a10] text-white rounded-lg px-3 py-1.5 text-xs font-bold w-full mt-2 hover:bg-[#3a0809]"
                          >
                            Assign
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3 mt-2">
              <button
                type="button"
                onClick={() => setIsAssignedListCollapsed(!isAssignedListCollapsed)}
                className="w-full flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-700"
              >
                <span>Assigned Slots ({assignedSlotsCount})</span>
                {isAssignedListCollapsed
                  ? <ChevronRight className="w-3.5 h-3.5 text-slate-400 transition-transform duration-200" />
                  : <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform duration-200" />
                }
              </button>

              {!isAssignedListCollapsed && (
                <div className="mt-2">
                  {sectionSchedules.filter((s) => s.facultyId).length === 0 ? (
                    <div className="text-center py-4 text-slate-400 text-xs">No slots assigned yet</div>
                  ) : (
                    sectionSchedules.filter((s) => s.facultyId).map((slot) => {
                      const sub = MOCK_SUBJECTS.find((s) => s.id === slot.subjectId);
                      return (
                        <div key={slot.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 shadow-sm mb-2 flex justify-between items-center">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 uppercase truncate">{sub?.code}</div>
                            <div className="text-[10px] text-slate-500 font-semibold truncate">{slot.facultyName}</div>
                            <div className="text-[10px] text-slate-400 truncate">{slot.day} {slot.startTime}</div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
                            <button
                              type="button"
                              onClick={() => handleRemoveInlineFaculty(slot.id)}
                              className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Remove Assignment"
                            >
                              <X className="w-3.5 h-3.5" />
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
