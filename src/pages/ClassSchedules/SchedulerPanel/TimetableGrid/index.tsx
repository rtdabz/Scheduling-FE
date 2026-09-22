import React from "react";
import { AlertTriangle, BookOpen, Calendar, DoorOpen, Info, Loader2, MousePointerClick, Trash2, X } from "lucide-react";
import {
  DAYS,
  GRID_HEADER_HEIGHT_PX,
  SLOT_HEIGHT_PX,
  slotToTimeStr
} from "../constants";
import type { ConflictInfo, ScheduleItem, Room, Section, Subject, Semester } from "../types";
import GridCell from "./GridCell";
import ScheduleCard from "./ScheduleCard";
import Skeleton from "../../../../components/ui/Skeleton";
import WeeklyTimetableGrid from "../../../../components/scheduling/WeeklyTimetableGrid";
import { slotCount } from "../../../../lib/timeGrid";
import { buildSubjectIndex, resolveScheduleSubject } from "./subjectResolution";

interface TimetableGridProps {
  sections: Section[];
  rooms: Room[];
  subjects: Subject[];
  activeSemesterText: string;
  activeSemester: Semester | null;
  selectedSectionId: string;
  totalScheduled: number;
  totalSubjects: number;
  isEditable: boolean;
  isPhase2Active: boolean;
  currentStatus: ScheduleItem["status"];
  isFinalizedFacultyEditing?: boolean;
  schedules: ScheduleItem[];
  sectionSchedules: ScheduleItem[];
  hoveredCell: string | null;
  draggedScheduleId: string | null;
  deleteConfirmScheduleId: string | null;
  setDeleteConfirmScheduleId: (id: string | null) => void;
  conflictInfo: ConflictInfo | null;
  setConflictInfo: (value: ConflictInfo | null) => void;
  conflictedMap?: Record<string, { conflictType: "room" | "faculty" | "section"; message: string }>;
  resolvedIds?: ReadonlySet<string>;
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
  isLoading?: boolean;
  isWideView?: boolean;
  handleToggleWideView?: () => void;
  isReadOnlyViewer?: boolean;
  /**
   * Shown over the grid while a save that will replace its rows is in flight,
   * which also keeps the rows about to be replaced from being edited.
   */
  savingMessage?: string | null;
}

/**
 * Timetable grid, in both layouts.
 *
 * `isWideView` used to select between this component and a 323-line copy in
 * WideTimetableGrid.tsx that differed in five places: the scroll container, the
 * grid's minimum width, the course-bank toggle's label and styling, and whether
 * ScheduleCard rendered its wide variant. Those five are now derived here.
 */
export default function TimetableGrid({
  sections,
  rooms,
  subjects,
  activeSemesterText,
  activeSemester,
  selectedSectionId,
  totalScheduled,
  totalSubjects,
  isEditable,
  isPhase2Active,
  currentStatus,
  isFinalizedFacultyEditing = false,
  schedules,
  sectionSchedules,
  hoveredCell,
  draggedScheduleId,
  deleteConfirmScheduleId,
  setDeleteConfirmScheduleId,
  conflictInfo,
  setConflictInfo,
  conflictedMap,
  resolvedIds,
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
  handleEditMovingSchedule,
  isLoading = false,
  isWideView = false,
  handleToggleWideView,
  isReadOnlyViewer = false,
  savingMessage = null,
}: TimetableGridProps) {
  const isPlacementMode = !!(placementSubjectId || movingScheduleId);
  const isSummerSemester = activeSemester?.semester === "summer";
  const isFacultyAssignment = ["approved", "faculty_assignment", "reassignment"].includes(currentStatus);
  const subjectsById = React.useMemo(() => buildSubjectIndex(subjects), [subjects]);
  const timetableSlotCount = React.useMemo(
    () => Math.max(
      slotCount(),
      ...sectionSchedules.map((schedule) => schedule.startSlot + schedule.durationSlots),
    ),
    [sectionSchedules],
  );
  const selectedSectionName = selectedSectionId
    ? sections.find((s) => s.id === selectedSectionId)?.name ?? "No section"
    : "No section selected";
  const unplacedSubjects = Math.max(0, totalSubjects - totalScheduled);
  const placedPercent = totalSubjects > 0 ? Math.min(100, Math.round((totalScheduled / totalSubjects) * 100)) : 0;
  const gridToolButtonClass = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold shadow-sm transition-colors cursor-pointer";
  const placementLabel = placementSubjectId
    ? subjectsById.get(String(placementSubjectId))?.code ?? "subject"
    : "";
  return (
    <div id="schedule-builder-timetable" className="flex min-h-[48rem] min-w-0 flex-1 flex-col overflow-visible rounded-2xl border border-slate-200/80 bg-white shadow-md lg:h-auto lg:min-h-0">
      <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200/80 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/[0.07] text-[#4e0a10]">
            <Calendar className="h-4 w-4" />
          </span>
          <div className="min-w-0 leading-tight">
            <h2 className="text-sm font-black text-slate-900">Timetable Grid</h2>
            {isLoading ? (
              <Skeleton className="mt-1 h-3 w-48" />
            ) : (
              <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                <span className="font-bold text-[#4e0a10]">{selectedSectionName}</span>
                <span aria-hidden="true" className="text-slate-300">•</span>
                <span className="font-medium">{activeSemesterText}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {isLoading ? <Skeleton className="h-9 w-36 rounded-lg" /> : (
            <div
              className="flex h-9 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 select-none"
              title={`${totalScheduled} placed, ${unplacedSubjects} unplaced`}
            >
              <span className="text-xs font-bold text-slate-700">
                {totalScheduled}<span className="text-slate-400">/{totalSubjects}</span> placed
              </span>
              <span
                className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Subjects placed"
                aria-valuemin={0}
                aria-valuemax={totalSubjects}
                aria-valuenow={totalScheduled}
              >
                <span
                  className={`block h-full rounded-full transition-all duration-300 ${unplacedSubjects === 0 && totalSubjects > 0 ? "bg-emerald-500" : "bg-[#c9952a]"}`}
                  style={{ width: `${placedPercent}%` }}
                />
              </span>
              {unplacedSubjects > 0 && (
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  {unplacedSubjects} left
                </span>
              )}
            </div>
          )}

          {!isReadOnlyViewer && (
            <>
              <span aria-hidden="true" className="mx-0.5 hidden h-6 w-px bg-slate-200 sm:block" />
              {!isFacultyAssignment && (isLoading ? <Skeleton className="h-9 w-32 rounded-lg" /> : (
                <button
                  id="schedule-builder-course-bank-toggle"
                  type="button"
                  onClick={handleToggleWideView}
                  aria-pressed={!isWideView}
                  className={`${gridToolButtonClass} ${
                    isWideView
                      ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      : "border-[#4e0a10]/20 bg-[#4e0a10]/[0.07] text-[#4e0a10] hover:bg-[#4e0a10]/10"
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  {isWideView ? "Show Course Bank" : "Hide Course Bank"}
                </button>
              ))}
              {isLoading ? <Skeleton className="h-9 w-28 rounded-lg" /> : (
                <button
                  type="button"
                  onClick={() => setIsRoomViewOpen(true)}
                  className={`${gridToolButtonClass} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`}
                >
                  <DoorOpen className="h-3.5 w-3.5" />
                  Room View
                </button>
              )}
              {isLoading ? <Skeleton className="h-9 w-24 rounded-lg" /> : (
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={!isEditable || schedules.length === 0}
                  className={`${gridToolButtonClass} border-slate-200 bg-white text-red-700 hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:border-slate-200 disabled:hover:bg-white`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div
        className="relative flex min-h-[30rem] flex-1 flex-col overflow-hidden bg-slate-50/80 lg:min-h-0"
        aria-busy={savingMessage ? true : undefined}
      >
        {savingMessage && (
          <div
            role="status"
            className="absolute inset-0 z-50 flex items-start justify-center bg-white/60 pt-24"
          >
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-lg">
              <Loader2 className="h-4 w-4 animate-spin text-[#4e0a10]" />
              {savingMessage}
            </div>
          </div>
        )}
        {/* A selected card carries its own Edit / Remove tooltip; the banner is
            only for a course armed from the Course Bank, which has no card yet. */}
        {placementSubjectId && !movingScheduleId && (
          <div className="sticky top-0 z-40 mx-2 mt-1.5 mb-1 flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 shadow-sm">
            <MousePointerClick className="w-5 h-5 text-blue-700 shrink-0" />
            <p className="text-sm font-semibold text-blue-900">
              Placing <span className="font-extrabold">{placementLabel}</span>
              {" "}— now click an empty time slot in the grid.
            </p>
            <div className="ml-auto flex items-center gap-2">
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
        {!selectedSectionId && !isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-20">
            <AlertTriangle className="w-12 h-12 text-amber-500 mb-3 animate-bounce" />
            <h3 className="text-sm font-bold text-slate-800">No Section Selected</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-xs text-center">
              Please select a section from the top bar dropdown menu to load its timetable grid.
            </p>
          </div>
        ) : (
          <div className={`${isWideView ? "overflow-hidden" : "overflow-auto"} flex min-h-0 flex-1 flex-col p-2 sm:p-4`}>
            <WeeklyTimetableGrid
              days={DAYS}
              slotCount={timetableSlotCount}
              headerHeight={GRID_HEADER_HEIGHT_PX}
              rowTemplate={`repeat(${timetableSlotCount}, ${SLOT_HEIGHT_PX}px)`}
              minWidth={isWideView ? 0 : 900}
              // Never `flex-1`: the rows are fixed pixels, so growing the grid
              // past their total only paints blank space inside its border when
              // the row is stretched by a taller Course Bank.
              className="shrink-0"
              isLoading={isLoading}
              disabledDayIndexes={isSummerSemester ? [5, 6] : []}
              getTimeLabel={slotToTimeStr}
              getDayCount={getClassesCountForDay}
              renderCell={isLoading ? undefined : (d, t) => {
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
                    isSummerDisabled={isSummerSemester && d >= 5}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onCellClick={handleCellClick}
                  />
                );
              }}
            >
              {isLoading ? (
                [
                  { id: 'sk-grid-1', dayIndex: 0, startSlot: 2, durationSlots: 4 },
                  { id: 'sk-grid-2', dayIndex: 2, startSlot: 6, durationSlots: 3 },
                  { id: 'sk-grid-3', dayIndex: 4, startSlot: 10, durationSlots: 4 }
                ].map((sk) => (
                  <div
                    key={sk.id}
                    className="z-10 rounded-xl border border-[#E2D9D0] bg-[#F7F4F0]/80 p-2 box-border overflow-hidden shadow-sm animate-pulse flex flex-col justify-between h-full"
                    style={{
                      gridColumn: sk.dayIndex + 2,
                      gridRow: `${sk.startSlot + 2} / span ${sk.durationSlots}`
                    }}
                  >
                    <div className="flex flex-col h-full justify-between">
                      <div>
                        <Skeleton className="h-3 w-16 mb-1.5" />
                        <Skeleton className="h-2.5 w-24 mb-1" />
                        <Skeleton className="h-2 w-12" />
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <Skeleton className="h-3.5 w-12 rounded-full" />
                        <Skeleton className="h-3.5 w-12 rounded-full" />
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                sectionSchedules.map((schedule) => {
                  // A course missing from `subjects` still holds its slot, so the
                  // card is rendered degraded rather than dropped.
                  const { subject } = resolveScheduleSubject(schedule, subjectsById);
                  return (
                    <ScheduleCard
                      key={schedule.id}
                      rooms={rooms}
                      schedule={schedule}
                      subject={subject}
                      conflict={conflictedMap?.[schedule.id] ?? null}
                      isResolved={!conflictedMap?.[schedule.id] && !!resolvedIds?.has(schedule.id)}
                      isEditable={isEditable}
                      isPhase2Active={isPhase2Active}
                      currentStatus={currentStatus}
                      isFinalizedFacultyEditing={isFinalizedFacultyEditing}
                      draggedScheduleId={draggedScheduleId}
                      isMoving={movingScheduleId === schedule.id}
                      deleteConfirmScheduleId={deleteConfirmScheduleId}
                      setDeleteConfirmScheduleId={setDeleteConfirmScheduleId}
                      onDragStart={handleDragStartFromCell}
                      onDragEnd={handleDragEnd}
                      onDelete={handleRemoveSchedule}
                      onCardClick={handleScheduleCardClick}
                      onEdit={handleEditMovingSchedule}
                      isWideView={isWideView}
                      isReadOnlyViewer={isReadOnlyViewer}
                    />
                  );
                })
              )}
            </WeeklyTimetableGrid>
          </div>
        )}
      </div>

      {conflictInfo && (
        <div className="mx-3 my-3 flex shrink-0 animate-in items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 slide-in-from-bottom-2 duration-150 sm:mx-6">
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

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/50 px-3 py-3 text-xs font-semibold text-slate-500 sm:gap-4 sm:px-6">
        <span className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-slate-400" />
          Categories:
        </span>
        {[
          { label: "Major", color: "bg-rose-50 border-[#4e0a10]" },
          { label: "Minor", color: "bg-amber-50 border-[#c9952a]" }
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
