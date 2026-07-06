import type { ScheduleItem, Subject, Faculty } from "../types";

interface UseConflictParams {
  schedules: ScheduleItem[];
  selectedSectionId: string;
  dragSubjectId: string | null;
  draggedScheduleId: string | null;
  rooms: { id: string; name: string }[];
  subjects: Subject[];
  faculties: Faculty[];
}

type ConflictResult = { conflictType: "room" | "faculty" | "section"; message: string } | null;

export const useConflict = ({
  schedules,
  selectedSectionId,
  dragSubjectId,
  draggedScheduleId,
  rooms,
  subjects,
  faculties
}: UseConflictParams) => {
  const checkConflict = (
    subjectId: string,
    sectionId: string,
    facultyId: string | null,
    roomId: string,
    dayIndex: number,
    startSlot: number,
    durationSlots: number,
    excludeScheduleId?: string
  ): ConflictResult => {
    const endSlot = startSlot + durationSlots;
    if (endSlot > 28) {
      return {
        conflictType: "section",
        message: "The schedule duration exceeds the grid operating hours (9:00 PM)."
      };
    }
    for (const s of schedules) {
      if (excludeScheduleId && s.id === excludeScheduleId) continue;
      const sEnd = s.startSlot + s.durationSlots;
      const overlaps = dayIndex === s.dayIndex && startSlot < sEnd && s.startSlot < endSlot;
      if (overlaps) {
        if (s.sectionId === sectionId) {
          const sub = subjects.find((x) => x.id === s.subjectId);
          return {
            conflictType: "section",
            message: `Section conflict: This section already has a class (${sub?.code ?? ""}) scheduled at this time.`
          };
        }
        if (roomId && roomId !== "online" && roomId !== "field" && s.roomId === roomId) {
          const room = rooms.find((r) => r.id === roomId);
          return {
            conflictType: "room",
            message: `Room conflict: ${room?.name ?? "Selected room"} is already occupied at this time.`
          };
        }
        if (facultyId && s.facultyId === facultyId) {
          const faculty = faculties.find((f) => f.id === facultyId);
          return {
            conflictType: "faculty",
            message: `Faculty conflict: ${faculty?.name ?? "Selected faculty"} is already teaching at this time.`
          };
        }
      }
    }
    return null;
  };

  const checkFacultyConflict = (facultyId: string, scheduleId: string): string | null => {
    const target = schedules.find((s) => s.id === scheduleId);
    if (!target) return null;
    const endSlot = target.startSlot + target.durationSlots;
    for (const s of schedules) {
      if (s.id === scheduleId) continue;
      if (s.facultyId !== facultyId) continue;
      const sEnd = s.startSlot + s.durationSlots;
      const overlaps = target.dayIndex === s.dayIndex && target.startSlot < sEnd && s.startSlot < endSlot;
      if (overlaps) {
        const fac = faculties.find((f) => f.id === facultyId);
        return `Faculty Conflict: ${fac?.name ?? facultyId} is already scheduled in section ${s.sectionName} at ${s.startTime} – ${s.endTime}.`;
      }
    }
    return null;
  };

  const getDragOverConflict = (d: number, t: number): boolean => {
    let dur = 6;
    let subjectId = "";
    let excludeId: string | undefined;

    if (draggedScheduleId) {
      const sched = schedules.find((s) => s.id === draggedScheduleId);
      if (!sched) return false;
      dur = sched.durationSlots;
      subjectId = sched.subjectId;
      excludeId = sched.id;
    } else if (dragSubjectId) {
      const sub = subjects.find((s) => s.id === dragSubjectId);
      if (!sub) return false;
      dur = sub.units * 2;
      subjectId = sub.id;
    } else {
      return false;
    }

    return checkConflict(subjectId, selectedSectionId, null, "", d, t, dur, excludeId) !== null;
  };

  return { checkConflict, checkFacultyConflict, getDragOverConflict };
};
