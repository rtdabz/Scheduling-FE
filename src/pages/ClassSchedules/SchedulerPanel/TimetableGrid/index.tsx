import React, { useState, useEffect } from "react";
import { AlertTriangle, Calendar, Clock, DoorOpen, Info, MousePointerClick, Move, Trash2, X } from "lucide-react";
import api from "../../../../lib/api";
import {
  DAYS,
  GRID_HEADER_HEIGHT_PX,
  MOCK_SUBJECTS,
  SLOT_HEIGHT_PX,
  slotToTimeStr
} from "../constants";
import type { ConflictInfo, ScheduleItem, Room, Section } from "../types";
import GridCell from "./GridCell";
import ScheduleCard from "./ScheduleCard";

interface TimetableGridProps {
  sections: Section[];
  rooms: Room[];
  selectedSectionId: string;
  totalScheduled: number;
  totalSubjects: number;
  isEditable: boolean;
  isPhase2Active: boolean;
  currentStatus: ScheduleItem["status"];
  schedules: ScheduleItem[];
  sectionSchedules: ScheduleItem[];
  hoveredCell: string | null;
  draggedScheduleId: string | null;
  deleteConfirmScheduleId: string | null;
  setDeleteConfirmScheduleId: (id: string | null) => void;
  conflictInfo: ConflictInfo | null;
  setConflictInfo: (value: ConflictInfo | null) => void;
  placementSubjectId: string | null;
  movingScheduleId: string | null;
  cancelPlacement: () => void;
  handleCellClick: (d: number, t: number) => void;
  getClassesCountForDay: (dayIdx: number) => number;
  getDragOverConflict: (d: number, t: number) => boolean;
  handleClearAll: () => void;
  setIsRoomViewOpen: (value: boolean) => void;
  handleDragOver: (e: React.DragEvent, d: number, t: number) => void;
  handleDragLeave: () => void;
  handleDrop: (e: React.DragEvent, d: number, t: number) => void;
  handleDragStartFromCell: (e: React.DragEvent, s: ScheduleItem) => void;
  handleDragEnd: () => void;
  handleRemoveSchedule: (id: string) => void;
  handleScheduleCardClick: (id: string) => void;
  handleEditMovingSchedule: () => void;
}

export default function TimetableGrid({
  sections,
  rooms,
  selectedSectionId,
  totalScheduled,
  totalSubjects,
  isEditable,
  isPhase2Active,
  currentStatus,
  schedules,
  sectionSchedules,
  hoveredCell,
  draggedScheduleId,
  deleteConfirmScheduleId,
  setDeleteConfirmScheduleId,
  conflictInfo,
  setConflictInfo,
  placementSubjectId,
  movingScheduleId,
  cancelPlacement,
  handleCellClick,
  getClassesCountForDay,
  getDragOverConflict,
  handleClearAll,
  setIsRoomViewOpen,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleDragStartFromCell,
  handleDragEnd,
  handleRemoveSchedule,
  handleScheduleCardClick,
  handleEditMovingSchedule
}: TimetableGridProps) {
  const [activeTermText, setActiveTermText] = useState("1st Semester AY 2026-2027");

  useEffect(() => {
    const fetchActiveTerm = async () => {
      try {
        const res = await api.get<{ semester: string; academic_year: string }>('/terms/active');
        if (res.data && res.data.semester && res.data.academic_year) {
          const semMap: Record<string, string> = {
            '1st': '1st Semester',
            '2nd': '2nd Semester',
            'summer': 'Summer'
          };
          const sem = semMap[res.data.semester] || res.data.semester;
          setActiveTermText(`${sem} AY ${res.data.academic_year}`);
        }
      } catch {
        // Fallback to default
      }
    };
    fetchActiveTerm();
  }, []);

  const isPlacementMode = !!(placementSubjectId || movingScheduleId);
  const placementLabel = placementSubjectId
    ? MOCK_SUBJECTS.find((s) => s.id === placementSubjectId)?.code ?? "subject"
    : movingScheduleId
    ? schedules.find((s) => s.id === movingScheduleId)?.subjectCode ?? "class"
    : "";

  return (
    <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/30 shrink-0">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#4e0a10]" />
            Timetable Grid
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="bg-[#4e0a10]/15 text-[#4e0a10] border border-[#4e0a10]/10 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase">
              {selectedSectionId ? (sections.find((s) => s.id === selectedSectionId)?.name ?? "None") : "None"}
            </span>
            <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 rounded-md text-[10px] font-bold">
              {activeTermText}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2 text-[11px] font-bold select-none text-slate-500">
            <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">
              {totalScheduled} Subjects Placed
            </span>
            <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded-lg">
              {Math.max(0, totalSubjects - totalScheduled)} Unplaced
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsRoomViewOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 shadow-sm border bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 cursor-pointer"
          >
            <DoorOpen className="w-3.5 h-3.5" />
            Room View
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={!isEditable || schedules.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 shadow-sm border ${
              isEditable && schedules.length > 0
                ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 cursor-pointer"
                : "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50/20 relative">
        {isPlacementMode && (
          <div className="sticky top-0 z-40 mx-3 mt-3 mb-1 flex items-center gap-2.5 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 shadow-sm">
            {movingScheduleId ? <Move className="w-5 h-5 text-blue-700 shrink-0" /> : <MousePointerClick className="w-5 h-5 text-blue-700 shrink-0" />}
            <p className="text-sm font-semibold text-blue-900">
              {movingScheduleId ? "Moving" : "Placing"}{" "}
              <span className="font-extrabold">{placementLabel}</span>
              {" "}— now click an empty time slot in the grid.
            </p>
            <div className="ml-auto flex items-center gap-2">
              {movingScheduleId && (
                <button
                  type="button"
                  onClick={handleEditMovingSchedule}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={cancelPlacement}
                className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        )}
        {!selectedSectionId ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-20">
            <AlertTriangle className="w-12 h-12 text-amber-500 mb-3 animate-bounce" />
            <h3 className="text-sm font-bold text-slate-800">No Section Selected</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs text-center">
              Please select a section from the top bar dropdown menu to load its timetable grid.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div
              className="min-w-[900px] border border-black rounded-xl overflow-hidden shadow-sm bg-white relative select-none"
              style={{
                display: "grid",
                gridTemplateColumns: "80px repeat(6, minmax(0, 1fr))",
                gridTemplateRows: `${GRID_HEADER_HEIGHT_PX}px repeat(28, ${SLOT_HEIGHT_PX}px)`
              }}
            >
              <div
                className="bg-[#4e0a10]/5 border-r border-b border-black p-2 font-bold text-[10px] text-[#4e0a10] text-center uppercase tracking-wider select-none flex items-center justify-center sticky top-0 left-0 z-30"
                style={{ gridColumn: 1, gridRow: 1 }}
              >
                <Clock className="w-3.5 h-3.5 mr-1" />
                Time
              </div>

              {DAYS.map((day, dIdx) => (
                <div
                  key={day}
                  className="bg-[#4e0a10]/5 border-r border-b border-black p-1.5 font-bold text-xs text-slate-700 text-center uppercase tracking-wider select-none flex flex-col justify-center items-center sticky top-0 z-20"
                  style={{ gridColumn: dIdx + 2, gridRow: 1 }}
                >
                  <span className="text-slate-800 font-extrabold">{day}</span>
                  <span className="text-[9px] text-black font-bold mt-0.5 bg-white/60 px-1.5 py-0.5 rounded-full border border-black">
                    {getClassesCountForDay(dIdx)} {getClassesCountForDay(dIdx) === 1 ? "Class" : "Classes"}
                  </span>
                </div>
              ))}

              {Array.from({ length: 28 }).map((_, t) => (
                <React.Fragment key={`row-${t}`}>
                  {t % 2 === 0 && (
                    <div
                      className="h-[48px] bg-slate-50/90 border-r border-b border-black text-[9px] font-bold text-slate-500 flex flex-col justify-center items-center select-none sticky left-0 z-10 px-1"
                      style={{ gridColumn: 1, gridRow: `${t + 2} / span 2` }}
                    >
                      <span className="font-extrabold text-slate-600 whitespace-nowrap">
                        {slotToTimeStr(t)}
                      </span>
                    </div>
                  )}

                  {DAYS.map((_, d) => {
                    const cellKey = `${d}-${t}`;
                    const isHovered = hoveredCell === cellKey;
                    const hasConflict = isHovered && getDragOverConflict(d, t);

                    return (
                      <GridCell
                        key={`cell-${d}-${t}`}
                        dayIndex={d}
                        timeIndex={t}
                        isHovered={isHovered}
                        hasConflict={hasConflict}
                        isEditable={isEditable}
                        isPhase2Active={isPhase2Active}
                        isPlacementMode={isPlacementMode}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onCellClick={handleCellClick}
                      />
                    );
                  })}
                </React.Fragment>
              ))}

              {sectionSchedules.map((schedule) => {
                const subject = MOCK_SUBJECTS.find((s) => s.id === schedule.subjectId);
                if (!subject) return null;
                return (
                  <ScheduleCard
                    key={schedule.id}
                    rooms={rooms}
                    schedule={schedule}
                    subject={subject}
                    isEditable={isEditable}
                    isPhase2Active={isPhase2Active}
                    currentStatus={currentStatus}
                    draggedScheduleId={draggedScheduleId}
                    isMoving={movingScheduleId === schedule.id}
                    deleteConfirmScheduleId={deleteConfirmScheduleId}
                    setDeleteConfirmScheduleId={setDeleteConfirmScheduleId}
                    onDragStart={handleDragStartFromCell}
                    onDragEnd={handleDragEnd}
                    onDelete={handleRemoveSchedule}
                    onCardClick={handleScheduleCardClick}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {conflictInfo && (
        <div className="mx-6 my-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 shrink-0 animate-in slide-in-from-bottom-2 duration-150">
          <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-rose-900">Schedule Conflict Detected</h4>
            <p className="text-[11px] text-rose-700 mt-0.5 font-medium">{conflictInfo.message}</p>
          </div>
          <button onClick={() => setConflictInfo(null)} className="ml-auto text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 shrink-0">
        <span className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          Categories:
        </span>
        {[
          { label: "Major", color: "bg-blue-50 border-blue-400" },
          { label: "GEC", color: "bg-emerald-50 border-emerald-400" },
          { label: "GEE", color: "bg-purple-50 border-purple-400" },
          { label: "PATHFIT", color: "bg-orange-50 border-orange-400" },
          { label: "NSTP", color: "bg-yellow-50 border-yellow-400" }
        ].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded border ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
