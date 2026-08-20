import type React from "react";
import { useCallback } from "react";
import { DAYS, slotToTimeStr } from "../constants";
import type { ConflictInfo, DropContext, ScheduleItem, Subject, Term } from "../types";

type CheckConflict = (
  subjectId: string,
  sectionId: string,
  facultyId: string | null,
  roomId: string,
  dayIndex: number,
  startSlot: number,
  durationSlots: number,
  excludeScheduleId?: string | string[],
  preferredPattern?: string | null
) => { conflictType: "room" | "faculty" | "section"; message: string } | null;

interface UseDragDropParams {
  schedules: ScheduleItem[];
  dragSubjectId: string | null;
  draggedScheduleId: string | null;
  hoveredCell: string | null;
  subjects: Subject[];
  setDragSubjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setDraggedScheduleId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragFromCell: React.Dispatch<React.SetStateAction<string | null>>;
  setHoveredCell: React.Dispatch<React.SetStateAction<string | null>>;
  setSchedules: React.Dispatch<React.SetStateAction<ScheduleItem[]>>;
  setDropContext: React.Dispatch<React.SetStateAction<DropContext | null>>;
  setConflictInfo: React.Dispatch<React.SetStateAction<ConflictInfo | null>>;
  checkConflict: CheckConflict;
  onScheduleRelocated?: (scheduleId: string, dayIndex: number, timeIndex: number) => void;
  activeTerm: Term | null;
}

/**
 * Drag-and-drop handlers for the timetable grid.
 *
 * Every handler is memoized: handleDragOver and handleDrop are passed to all 168
 * memoized GridCells, so an unstable identity here re-renders the entire grid on
 * each cell the pointer crosses.
 *
 * handleDragOver deliberately excludes `hoveredCell` from its dependencies and
 * reads it through a functional setState instead — depending on it would rebuild
 * the callback on every hover, which is the problem being fixed.
 */
export const useDragDrop = ({
  schedules,
  dragSubjectId,
  draggedScheduleId,
  subjects,
  setDragSubjectId,
  setDraggedScheduleId,
  setDragFromCell,
  setHoveredCell,
  setSchedules,
  setDropContext,
  setConflictInfo,
  checkConflict,
  onScheduleRelocated,
  activeTerm
}: UseDragDropParams) => {
  const isSummerTerm = activeTerm?.semester === "summer";

  const handleDragStartFromBank = useCallback((e: React.DragEvent, subjectId: string) => {
    setDragSubjectId(subjectId);
    setDraggedScheduleId(null);
    setDragFromCell(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", subjectId);
  }, [setDragSubjectId, setDraggedScheduleId, setDragFromCell]);

  const handleDragStartFromCell = useCallback((e: React.DragEvent, schedule: ScheduleItem) => {
    setDraggedScheduleId(schedule.id);
    setDragSubjectId(null);
    setDragFromCell(`${schedule.dayIndex}-${schedule.startSlot}`);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", schedule.courseId ?? schedule.subjectId ?? "");
  }, [setDraggedScheduleId, setDragSubjectId, setDragFromCell]);

  const handleDragEnd = useCallback(() => {
    setDragSubjectId(null);
    setDraggedScheduleId(null);
    setDragFromCell(null);
    setHoveredCell(null);
  }, [setDragSubjectId, setDraggedScheduleId, setDragFromCell, setHoveredCell]);

  const handleDragOver = useCallback((e: React.DragEvent, dayIndex: number, timeIndex: number) => {
    e.preventDefault();
    if (isSummerTerm && dayIndex >= 5) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    const key = `${dayIndex}-${timeIndex}`;
    setHoveredCell((current) => (current === key ? current : key));
  }, [isSummerTerm, setHoveredCell]);

  const handleDragLeave = useCallback(() => setHoveredCell(null), [setHoveredCell]);

  const handleDrop = useCallback((e: React.DragEvent, dayIndex: number, timeIndex: number) => {
    e.preventDefault();
    setHoveredCell(null);
    setConflictInfo(null);

    if (isSummerTerm && dayIndex >= 5) return;

    if (draggedScheduleId) {
      const sched = schedules.find((s) => s.id === draggedScheduleId);
      if (!sched) return;

      const conflict = checkConflict(
        sched.courseId ?? sched.subjectId ?? "",
        sched.sectionId,
        null,
        sched.roomId,
        dayIndex,
        timeIndex,
        sched.durationSlots,
        sched.id,
        sched.preferredPattern
      );

      if (conflict) {
        setConflictInfo({ dayIndex, startSlot: timeIndex, durationSlots: sched.durationSlots, message: conflict.message });
        setDraggedScheduleId(null);
        setDragFromCell(null);
        return;
      }

      if (onScheduleRelocated) {
        onScheduleRelocated(draggedScheduleId, dayIndex, timeIndex);
      } else {
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === draggedScheduleId
              ? {
                  ...s,
                  dayIndex,
                  startSlot: timeIndex,
                  day: DAYS[dayIndex],
                  startTime: slotToTimeStr(timeIndex),
                  endTime: slotToTimeStr(timeIndex + s.durationSlots)
                }
              : s
          )
        );
      }
      setDraggedScheduleId(null);
      setDragFromCell(null);
    } else {
      const subjectId = e.dataTransfer.getData("text/plain") || dragSubjectId;
      if (!subjectId) return;
      const sub = subjects.find((s) => String(s.id) === String(subjectId));
      if (!sub) return;
      setDropContext({ courseId: subjectId, subjectId, dayIndex, startSlot: timeIndex, isRescheduling: false });
      setDragSubjectId(null);
    }
  }, [
    isSummerTerm,
    draggedScheduleId,
    dragSubjectId,
    schedules,
    subjects,
    checkConflict,
    onScheduleRelocated,
    setHoveredCell,
    setConflictInfo,
    setDraggedScheduleId,
    setDragFromCell,
    setSchedules,
    setDropContext,
    setDragSubjectId
  ]);

  return {
    handleDragStartFromBank,
    handleDragStartFromCell,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
};
