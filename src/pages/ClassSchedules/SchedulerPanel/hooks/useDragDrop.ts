import type React from "react";
import { DAYS, slotToTimeStr } from "../constants";
import type { ConflictInfo, DropContext, ScheduleItem, Subject } from "../types";

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
  selectedSectionId: string;
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
}

export const useDragDrop = ({
  schedules,
  selectedSectionId,
  dragSubjectId,
  draggedScheduleId,
  hoveredCell,
  subjects,
  setDragSubjectId,
  setDraggedScheduleId,
  setDragFromCell,
  setHoveredCell,
  setSchedules,
  setDropContext,
  setConflictInfo,
  checkConflict,
  onScheduleRelocated
}: UseDragDropParams) => {
  const handleDragStartFromBank = (e: React.DragEvent, subjectId: string) => {
    setDragSubjectId(subjectId);
    setDraggedScheduleId(null);
    setDragFromCell(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", subjectId);
  };

  const handleDragStartFromCell = (e: React.DragEvent, schedule: ScheduleItem) => {
    setDraggedScheduleId(schedule.id);
    setDragSubjectId(null);
    setDragFromCell(`${schedule.dayIndex}-${schedule.startSlot}`);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", schedule.subjectId);
  };

  const handleDragEnd = () => {
    setDragSubjectId(null);
    setDraggedScheduleId(null);
    setDragFromCell(null);
    setHoveredCell(null);
  };

  const handleDragOver = (e: React.DragEvent, dayIndex: number, timeIndex: number) => {
    e.preventDefault();
    const key = `${dayIndex}-${timeIndex}`;
    if (hoveredCell !== key) setHoveredCell(key);
  };

  const handleDragLeave = () => setHoveredCell(null);

  const handleDrop = (e: React.DragEvent, dayIndex: number, timeIndex: number) => {
    e.preventDefault();
    setHoveredCell(null);
    setConflictInfo(null);

    const subjectId = e.dataTransfer.getData("text/plain") || dragSubjectId;
    if (!subjectId) return;

    if (draggedScheduleId) {
      const sched = schedules.find((s) => s.id === draggedScheduleId);
      if (!sched) return;

      const conflict = checkConflict(
        sched.subjectId,
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
      const sub = subjects.find((s) => s.id === subjectId);
      if (!sub) return;
      setDropContext({ courseId: subjectId, subjectId, dayIndex, startSlot: timeIndex, isRescheduling: false });
      setDragSubjectId(null);
    }
  };

  return {
    handleDragStartFromBank,
    handleDragStartFromCell,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop
  };
};
