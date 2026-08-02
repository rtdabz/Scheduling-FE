import { useMemo } from "react";
import type { Faculty, Room, ScheduleItem, Subject } from "../types";
import { getSubjectTotalSlots } from "../types";

export type ConflictResult = { conflictType: "room" | "faculty" | "section"; message: string } | null;

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

const isLinkedMeetingBlock = (left: ScheduleItem, right: ScheduleItem): boolean => (
  left.termId === right.termId
  && left.sectionId === right.sectionId
  && (left.courseId ?? left.subjectId) === (right.courseId ?? right.subjectId)
  && left.departmentId === right.departmentId
  && (left.preferredPattern ?? null) === (right.preferredPattern ?? null)
);

const isPartTimeOutsideAvailability = (faculty: Faculty | undefined, dayIndex: number, startSlot: number): boolean => (
  faculty?.employmentType === "part-time" && dayIndex !== 5 && dayIndex !== 6 && startSlot < 20
);

export const getConflictedScheduleMap = (
  schedules: ScheduleItem[],
  subjects: Subject[],
  rooms: Room[],
  faculties: Faculty[]
): Record<string, NonNullable<ConflictResult>> => {
  const conflictMap: Record<string, NonNullable<ConflictResult>> = {};

  for (let i = 0; i < schedules.length; i++) {
    const s1 = schedules[i];
    const s1End = s1.startSlot + s1.durationSlots;
    const sub1 = subjects.find((x) => x.id === (s1.courseId ?? s1.subjectId));

    for (let j = i + 1; j < schedules.length; j++) {
      const s2 = schedules[j];
      const s2End = s2.startSlot + s2.durationSlots;

      // Check if on same day and time ranges overlap
      const overlaps = s1.dayIndex === s2.dayIndex && s1.startSlot < s2End && s2.startSlot < s1End;
      if (!overlaps) continue;

      const sub2 = subjects.find((x) => x.id === (s2.courseId ?? s2.subjectId));

      // 1. Same Section conflict (Time overlap in same section)
      if (s1.sectionId && s1.sectionId === s2.sectionId) {
        const msg1 = `Section conflict: Overlaps with ${s2.courseCode || s2.subjectCode || sub2?.code || "another class"} of section ${s2.sectionName} (${s2.startTime} – ${s2.endTime}).`;
        const msg2 = `Section conflict: Overlaps with ${s1.courseCode || s1.subjectCode || sub1?.code || "another class"} of section ${s1.sectionName} (${s1.startTime} – ${s1.endTime}).`;
        if (!conflictMap[s1.id]) conflictMap[s1.id] = { conflictType: "section", message: msg1 };
        if (!conflictMap[s2.id]) conflictMap[s2.id] = { conflictType: "section", message: msg2 };
      }

      // 2. Room conflict
      if (s1.roomId && s1.roomId !== "online" && s1.roomId !== "field" && s1.roomId === s2.roomId) {
        const room = rooms.find((r) => r.id === s1.roomId);
        const roomName = room?.name ?? "Selected room";
        const msg1 = `Room conflict: ${roomName} is already occupied by ${s2.courseCode || s2.subjectCode || sub2?.code || "another class"} of section ${s2.sectionName} (${s2.startTime} – ${s2.endTime}).`;
        const msg2 = `Room conflict: ${roomName} is already occupied by ${s1.courseCode || s1.subjectCode || sub1?.code || "another class"} of section ${s1.sectionName} (${s1.startTime} – ${s1.endTime}).`;
        if (!conflictMap[s1.id]) conflictMap[s1.id] = { conflictType: "room", message: msg1 };
        if (!conflictMap[s2.id]) conflictMap[s2.id] = { conflictType: "room", message: msg2 };
      }

      // 3. Faculty conflict
      if (s1.facultyId && s1.facultyId === s2.facultyId) {
        const faculty = faculties.find((f) => f.id === s1.facultyId);
        const facName = faculty?.name ?? "Assigned faculty";
        const msg1 = `Faculty conflict: ${facName} is already teaching ${s2.courseCode || s2.subjectCode || sub2?.code || "another class"} of section ${s2.sectionName} (${s2.startTime} – ${s2.endTime}).`;
        const msg2 = `Faculty conflict: ${facName} is already teaching ${s1.courseCode || s1.subjectCode || sub1?.code || "another class"} of section ${s1.sectionName} (${s1.startTime} – ${s1.endTime}).`;
        if (!conflictMap[s1.id]) conflictMap[s1.id] = { conflictType: "faculty", message: msg1 };
        if (!conflictMap[s2.id]) conflictMap[s2.id] = { conflictType: "faculty", message: msg2 };
      }
    }
  }

  return conflictMap;
};

export const useConflict = ({
  schedules,
  selectedSectionId,
  dragSubjectId,
  draggedScheduleId,
  rooms,
  subjects,
  faculties
}: UseConflictParams) => {
  const conflictedMap = useMemo(
    () => getConflictedScheduleMap(schedules, subjects, rooms, faculties),
    [schedules, subjects, rooms, faculties]
  );

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
    if (endSlot > 24) {
      return {
        conflictType: "section",
        message: "The schedule duration exceeds the grid operating hours (7:00 PM)."
      };
    }

    if (facultyId) {
      const faculty = faculties.find((f) => f.id === facultyId);
      if (isPartTimeOutsideAvailability(faculty, dayIndex, startSlot)) {
        return {
          conflictType: "faculty",
          message: `Part-time availability: ${faculty?.name ?? "Selected faculty"} can only teach from 5:00 PM onward on weekdays or any time on Saturdays or Sundays.`
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
          return {
            conflictType: "section",
            message: `Section conflict: This section already has a class (${s.courseCode || s.subjectCode || "another class"}) scheduled at this time.`
          };
        }
        if (roomId && roomId !== "online" && roomId !== "field" && s.roomId === roomId) {
          const room = rooms.find((r) => r.id === roomId);
          return {
            conflictType: "room",
            message: `Room conflict: ${room?.name ?? "Selected room"} is already occupied at this time by ${s.courseCode || s.subjectCode || "another class"} of section ${s.sectionName}.`
          };
        }
        if (facultyId && s.facultyId === facultyId) {
          const faculty = faculties.find((f) => f.id === facultyId);
          return {
            conflictType: "faculty",
            message: `Faculty conflict: ${faculty?.name ?? "Selected faculty"} is already teaching ${s.courseCode || s.subjectCode || "another class"} of section ${s.sectionName} at this time.`
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
      return `Part-time availability: ${targetFaculty?.name ?? facultyId} can only teach from 5:00 PM onward on weekdays or any time on Saturdays or Sundays.`;
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
        return `Faculty Conflict: ${fac?.name ?? facultyId} is already scheduled in section ${s.sectionName} for ${s.courseCode || s.subjectCode || "another course"} at ${s.startTime} – ${s.endTime}.`;
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
      subjectId = sched.courseId ?? sched.subjectId ?? "";
      excludeId = sched.id;
      prefPattern = sched.preferredPattern ?? null;
    } else if (dragSubjectId) {
      const sub = subjects.find((s) => s.id === dragSubjectId);
      if (!sub) return false;
      dur = getSubjectTotalSlots(sub);
      subjectId = sub.id;
    } else {
      return false;
    }

    return checkConflict(subjectId, selectedSectionId, null, "", d, t, dur, excludeId, prefPattern) !== null;
  };

  return { checkConflict, checkFacultyConflict, getDragOverConflict, conflictedMap };
};
