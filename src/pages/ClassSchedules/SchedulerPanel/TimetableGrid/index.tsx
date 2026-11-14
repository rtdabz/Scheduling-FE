import React from "react";
import { AlertTriangle, BookOpen, CalendarDays, CalendarPlus, DoorOpen, Loader2, MousePointerClick, X } from "lucide-react";
import {
  DAYS,
  SLOT_HEIGHT_PX,
  slotToTimeStr
} from "../constants";
import type { ConflictInfo, ScheduleItem, Room, Section, Subject } from "../types";
import GridCell from "./GridCell";
import ScheduleCard from "./ScheduleCard";
import Skeleton from "../../../../components/ui/Skeleton";
import WeeklyTimetableGrid from "../../../../components/scheduling/WeeklyTimetableGrid";
import { slotCount } from "../../../../lib/timeGrid";
import { TimetableLegend, TimetableTitleBar } from "../../../../components/scheduling/TimetablePanel";
import {
  endsTimeBand,
  TIMETABLE_HEADER_BUTTON,
  TIMETABLE_HEADER_BUTTON_PRESSED,
  TIMETABLE_SWATCH,
} from "../../../../components/scheduling/timetableStyles";
import { buildSubjectIndex, resolveScheduleSubject } from "./subjectResolution";

interface TimetableGridProps {
  sections: Section[];
  rooms: Room[];
  subjects: Subject[];
  activeSemesterText: string;
  selectedSectionId: string;
  isEditable: boolean;
  isPhase2Active: boolean;
  currentStatus: ScheduleItem["status"];
  isFinalizedFacultyEditing?: boolean;
  schedules: ScheduleItem[];
  dragSubjectId?: string | null;
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
  onOpenConflict?: (scheduleId: string) => void;
  savingMessage?: string | null;
}

export default function TimetableGrid({
  sections,
  rooms,
  subjects,
  activeSemesterText,
  selectedSectionId,
  isEditable,
  isPhase2Active,
  currentStatus,
  isFinalizedFacultyEditing = false,
  sectionSchedules,
  hoveredCell,
  draggedScheduleId,
  dragSubjectId = null,
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
  onOpenConflict,
  savingMessage = null,
}: TimetableGridProps) {
  const isPlacementMode = !!(placementSubjectId || movingScheduleId);
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
  const canPlot = isEditable && !isPhase2Active;
  const isDragging = Boolean(dragSubjectId || draggedScheduleId);
  const showEmptyHint = !isLoading && Boolean(selectedSectionId) && sectionSchedules.length === 0 && !isPlacementMode && !isDragging;
  const placementLabel = placementSubjectId
    ? subjectsById.get(String(placementSubjectId))?.code ?? "subject"
    : "";
  return (
    <div id="schedule-builder-timetable" className="flex min-w-0 flex-1 flex-col overflow-clip rounded-xl border border-slate-200 bg-white">
      <TimetableTitleBar
        isLoading={isLoading}
        highlight={selectedSectionName}
        detail={activeSemesterText}
        actions={!isReadOnlyViewer && (
          <>
            {!isFacultyAssignment && (isLoading ? <Skeleton className="h-9 w-32 rounded-lg" /> : (
              <button
                id="schedule-builder-course-bank-toggle"
                type="button"
                onClick={handleToggleWideView}
                aria-pressed={!isWideView}
                title={isWideView ? "Show the Manual Plotting panel" : "Hide the Manual Plotting panel"}
                className={`${TIMETABLE_HEADER_BUTTON} ${isWideView ? "" : TIMETABLE_HEADER_BUTTON_PRESSED}`}
              >
                <BookOpen className={`h-3.5 w-3.5 ${isWideView ? "" : "text-[#F5C842]"}`} />
                Manual Plotting
              </button>
            ))}
            {isLoading ? <Skeleton className="h-9 w-28 rounded-lg" /> : (
              <button
                type="button"
                onClick={() => setIsRoomViewOpen(true)}
                className={TIMETABLE_HEADER_BUTTON}
              >
                <DoorOpen className="h-3.5 w-3.5" />
                View Schedule
              </button>
            )}
          </>
        )}
      />

      <div
        className="relative flex min-h-[24rem] flex-1 flex-col bg-white"
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
        {placementSubjectId && !movingScheduleId && (
          <div role="status" className="flex shrink-0 items-center gap-2 border-b border-[#c9952a]/40 bg-[#fdf6e7] px-4 py-1.5">
            <MousePointerClick className="h-4 w-4 shrink-0 text-[#8a5a12]" />
            <p className="min-w-0 text-xs font-medium text-[#5c3d0c]">
              Plotting <span className="font-bold text-[#4e0a10]">{placementLabel}</span>
              {" "}— click an available time slot in the grid.
            </p>
            <button
              type="button"
              onClick={cancelPlacement}
              className="ml-auto flex h-7 shrink-0 items-center gap-1 rounded-md border border-[#c9952a]/50 bg-white px-2.5 text-xs font-semibold text-[#5c3d0c] transition-colors hover:bg-[#c9952a]/10 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        )}
        {!selectedSectionId && !isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center bg-[#faf7f3] px-6 py-16 text-center">
            <CalendarDays className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <h3 className="mt-3 text-sm font-semibold text-slate-700">No section selected</h3>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              Choose a section in the workspace header to load its timetable.
            </p>
          </div>
        ) : (
          // Desktop fits all seven days with no horizontal overflow. Below `lg` the grid keeps a
          // readable minimum width and this body scrolls sideways instead of crushing the days.
          <div className="flex flex-col max-lg:overflow-x-auto">
            <WeeklyTimetableGrid
              days={DAYS}
              slotCount={timetableSlotCount}
              rowTemplate={`repeat(${timetableSlotCount}, ${SLOT_HEIGHT_PX}px)`}
              minWidth={0}
              className="shrink-0 max-lg:!min-w-[760px]"
              isLoading={isLoading}
              stickyHeader={false}
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
                    endsBand={endsTimeBand(t)}
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
                    className="z-10 rounded-lg border border-[#E2D9D0] bg-[#F7F4F0]/80 p-2 box-border overflow-hidden animate-pulse flex flex-col justify-between h-full"
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
                      onOpenConflict={onOpenConflict}
                      isWideView={isWideView}
                      isReadOnlyViewer={isReadOnlyViewer}
                    />
                  );
                })
              )}
            </WeeklyTimetableGrid>
          </div>
        )}
        {showEmptyHint && (
          <div className="pointer-events-none absolute inset-x-0 top-28 z-10 flex justify-center px-4">
            <div className="flex max-w-sm items-start gap-3 rounded-lg border border-slate-200 bg-white/95 px-4 py-3">
              <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-slate-700">No subjects plotted yet</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {canPlot
                    ? "Select a subject in Manual Plotting, then click a time slot — or drag it onto the grid."
                    : "This section has no classes on the timetable."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {conflictInfo && (
        <div
          role="alert"
          className="fixed left-1/2 top-4 z-50 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 animate-in items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 shadow-lg slide-in-from-top-2 duration-150"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-xs font-bold text-rose-900">{conflictInfo.title ?? "Schedule Conflict Detected"}</h4>
            <p className="text-[11px] text-rose-700 mt-0.5 font-medium">{conflictInfo.message}</p>
          </div>
          <button onClick={() => setConflictInfo(null)} className="ml-auto text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <TimetableLegend
        groups={[
          {
            label: "Subjects",
            items: [
              { label: "Major", swatch: TIMETABLE_SWATCH.major },
              { label: "Minor", swatch: TIMETABLE_SWATCH.minor },
            ],
          },
          {
            label: "Slots",
            items: canPlot
              ? [
                  { label: "Available", swatch: TIMETABLE_SWATCH.available },
                  { label: "Placement target", swatch: TIMETABLE_SWATCH.target },
                  { label: "Selected", swatch: TIMETABLE_SWATCH.selected },
                  { label: "Conflict", swatch: TIMETABLE_SWATCH.conflict },
                ]
              : [],
          },
        ]}
      />
    </div>
  );
}
