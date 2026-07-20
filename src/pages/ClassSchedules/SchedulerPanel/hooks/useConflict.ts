import type { Faculty, Room, ScheduleItem, Subject } from "../types";

const getPreferredPatternDayIndexes = (preferredPattern?: string | null): number[] | null => {
  if (!preferredPattern) return null;
  if (preferredPattern === "MW") return [0, 2];
  if (preferredPattern === "TTh") return [1, 3];

  const customMatch = preferredPattern.match(/^days:([0-5])-([0-5])$/);
  if (!customMatch) return null;

  return [Number(customMatch[1]), Number(customMatch[2])];
};

interface UseConflictParams {
  schedules: ScheduleItem[];
  selectedSectionId: string;
  dragSubjectId: string | null;
  draggedScheduleId: string | null;
  rooms: Room[];
  subjects: Subject[];
  faculties: Faculty[];
}

type ConflictResult = { conflictType: "room" | "faculty" | "section"; message: string } | null;

const isLinkedMeetingBlock = (left: ScheduleItem, right: ScheduleItem): boolean => (
  left.termId === right.termId
  && left.sectionId === right.sectionId
  && left.subjectId === right.subjectId
  && left.departmentId === right.departmentId
  && (left.preferredPattern ?? null) === (right.preferredPattern ?? null)
);

const isPartTimeOutsideAvailability = (faculty: Faculty | undefined, dayIndex: number, startSlot: number): boolean => (
  faculty?.employmentType === "part-time" && dayIndex !== 5 && startSlot < 20
);

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
    excludeScheduleId?: string | string[],
    preferredPattern?: string | null
  ): ConflictResult => {
    const allowedDays = getPreferredPatternDayIndexes(preferredPattern);
    if (allowedDays && !allowedDays.includes(dayIndex)) {
      return {
        conflictType: "section",
        message: "Meeting pattern conflict: This class can only be scheduled on the selected meeting days."
      };
    }

    const endSlot = startSlot + durationSlots;
    if (endSlot > 28) {
      return {
        conflictType: "section",
        message: "The schedule duration exceeds the grid operating hours (9:00 PM)."
      };
    }

    if (facultyId) {
      const faculty = faculties.find((f) => f.id === facultyId);
      if (isPartTimeOutsideAvailability(faculty, dayIndex, startSlot)) {
        return {
          conflictType: "faculty",
          message: `Part-time availability: ${faculty?.name ?? "Selected faculty"} can only teach from 5:00 PM onward on weekdays or any time on Saturdays.`
        };
      }
    }

    // Room-type compatibility check
    if (roomId && roomId !== "online" && roomId !== "field") {
      const room = rooms.find((r) => r.id === roomId);
      const subject = subjects.find((s) => s.id === subjectId);
      if (room?.roomType && subject?.roomTypeRequired && room.roomType !== subject.roomTypeRequired) {
        return {
          conflictType: "room",
          message: `Room type mismatch: ${subject.code} requires a '${subject.roomTypeRequired}' room, but '${room.name}' is a '${room.roomType}' room.`
        };
      }
    }
    for (const s of schedules) {
      if (excludeScheduleId) {
        const excludes = Array.isArray(excludeScheduleId) ? excludeScheduleId : [excludeScheduleId];
        if (excludes.includes(s.id)) continue;
      }
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
    const targetFaculty = faculties.find((f) => f.id === facultyId);
    if (isPartTimeOutsideAvailability(targetFaculty, target.dayIndex, target.startSlot)) {
      return `Part-time availability: ${targetFaculty?.name ?? facultyId} can only teach from 5:00 PM onward on weekdays or any time on Saturdays.`;
    }

    const endSlot = target.startSlot + target.durationSlots;
    for (const s of schedules) {
      if (s.id === scheduleId) continue;
      if (isLinkedMeetingBlock(target, s)) continue;
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
    let prefPattern: string | null = null;

    if (draggedScheduleId) {
      const sched = schedules.find((s) => s.id === draggedScheduleId);
      if (!sched) return false;
      dur = sched.durationSlots;
      subjectId = sched.subjectId;
      excludeId = sched.id;
      prefPattern = sched.preferredPattern ?? null;
    } else if (dragSubjectId) {
      const sub = subjects.find((s) => s.id === dragSubjectId);
      if (!sub) return false;
      dur = sub.units * 2;
      subjectId = sub.id;
    } else {
      return false;
    }

    return checkConflict(subjectId, selectedSectionId, null, "", d, t, dur, excludeId, prefPattern) !== null;
  };

  return { checkConflict, checkFacultyConflict, getDragOverConflict };
};
