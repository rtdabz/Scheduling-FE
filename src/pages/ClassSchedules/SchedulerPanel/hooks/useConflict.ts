import { useMemo } from "react";
import type { Department, Faculty, Room, ScheduleItem, Section, Subject } from "../types";
import { getSubjectTotalSlots } from "../types";

export type ConflictResult = { conflictType: "room" | "faculty" | "section"; message: string } | null;

const getPreferredPatternDayIndexes = (preferredPattern?: string | null): number[] | null => {
  if (!preferredPattern) return null;
  if (preferredPattern === "MW") return [0, 2];
  if (preferredPattern === "TTh") return [1, 3];

  const customMatch = preferredPattern.match(/^days:([0-6])-([0-6])$/);
  if (!customMatch) return null;

  return [Number(customMatch[1]), Number(customMatch[2])];
};

interface UseConflictParams {
  schedules: ScheduleItem[];
  selectedSectionId: string;
  dragSubjectId: string | null;
  draggedScheduleId: string | null;
  rooms: Room[];
  sections: Section[];
  departments: Department[];
  subjects: Subject[];
  faculties: Faculty[];
  fieldCourseAssignmentEnabled?: boolean;
  fieldCourseCodes?: string[];
}

const isLinkedMeetingBlock = (left: ScheduleItem, right: ScheduleItem): boolean => {
  if (left.splitGroupId && right.splitGroupId) {
    return left.splitGroupId === right.splitGroupId;
  }

  const leftMeetingKey = left.meetingType ?? left.meetingIndex ?? null;
  const rightMeetingKey = right.meetingType ?? right.meetingIndex ?? null;
  if (leftMeetingKey === null || rightMeetingKey === null) {
    return false;
  }

  return (
    left.termId === right.termId
    && left.sectionId === right.sectionId
    && (left.courseId ?? left.subjectId) === (right.courseId ?? right.subjectId)
    && left.departmentId === right.departmentId
    && (left.preferredPattern ?? null) === (right.preferredPattern ?? null)
    && leftMeetingKey !== rightMeetingKey
  );
};

const getRoomCapacity = (room: Room | undefined): number => {
  return Math.max(1, Number(room?.maxConcurrentClasses ?? 1) || 1);
};

const getDepartmentRoomCapacity = (
  room: Room | undefined,
  departmentId: number | null,
  departments: Department[]
): number => {
  const department = departments.find((item) => Number(item.id) === Number(departmentId));
  const configuredLimit = room?.roomType === "field"
    ? department?.field_slot_limit
    : room?.roomType === "online"
      ? department?.online_slot_limit
      : null;

  return configuredLimit == null
    ? getRoomCapacity(room)
    : Math.max(1, Number(configuredLimit) || 1);
};

const resolveRoom = (rooms: Room[], roomId: string): Room | undefined => {
  if (roomId === "field") {
    return rooms.find((r) => r.roomType === "field");
  }
  if (roomId === "online") {
    return rooms.find((r) => r.roomType === "online");
  }
  return rooms.find((r) => String(r.id) === String(roomId));
};

const samePhysicalRoom = (leftRoomId: string, rightRoomId: string, rooms: Room[]): boolean => {
  const leftRoom = resolveRoom(rooms, leftRoomId);
  const rightRoom = resolveRoom(rooms, rightRoomId);

  if (leftRoom?.id && rightRoom?.id) {
    return String(leftRoom.id) === String(rightRoom.id);
  }

  return String(leftRoomId) === String(rightRoomId);
};

const exceedsSharedRoomCapacity = (
  schedules: ScheduleItem[],
  dayIndex: number,
  startSlot: number,
  endSlot: number,
  capacity: number,
  excludeIds: string[] = [],
  includeCandidate = true
): boolean => {
  const events: Array<[number, number]> = includeCandidate ? [[startSlot, 1], [endSlot, -1]] : [];

  schedules.forEach((s) => {
    if (excludeIds.includes(s.id)) return;
    if (s.dayIndex !== dayIndex) return;
    const sEnd = s.startSlot + s.durationSlots;
    if (startSlot < sEnd && s.startSlot < endSlot) {
      events.push([s.startSlot, 1], [sEnd, -1]);
    }
  });

  events.sort((left, right) => left[0] - right[0] || left[1] - right[1]);

  let concurrent = 0;
  for (const [, delta] of events) {
    concurrent += delta;
    if (concurrent > capacity) return true;
  }

  return false;
};

const timeToSlot = (timeStr: string): number => {
  const parts = timeStr.split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const totalMinutes = hours * 60 + minutes;
  return Math.round((totalMinutes - 420) / 30);
};

const isPartTimeOutsideAvailability = (
  faculty: Faculty | undefined,
  dayIndex: number,
  startSlot: number,
  durationSlots: number
): boolean => {
  if (!faculty) return false;
  if (faculty.employmentType !== "part-time") return false;

  const list = faculty.availabilities ?? [];
  if (list.length === 0) {
    // Fallback: old hardcoded rule if no availabilities are configured
    return dayIndex !== 5 && dayIndex !== 6 && startSlot < 20;
  }

  const dayAvailabilities = list.filter((a) => Number(a.day_index) === dayIndex);
  if (dayAvailabilities.length === 0) return true;

  const attemptStart = startSlot;
  const attemptEnd = startSlot + durationSlots;

  return !dayAvailabilities.some((window) => {
    const windowStart = timeToSlot(window.start_time);
    const windowEnd = timeToSlot(window.end_time);
    return attemptStart >= windowStart && attemptEnd <= windowEnd;
  });
};

export const getConflictedScheduleMap = (
  schedules: ScheduleItem[],
  subjects: Subject[],
  rooms: Room[],
  faculties: Faculty[],
  departments: Department[] = []
): Record<string, NonNullable<ConflictResult>> => {
  const conflictMap: Record<string, NonNullable<ConflictResult>> = {};

  // Build grid slot-occupancy index: [dayIndex][slotIndex]
  const grid: ScheduleItem[][][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => [])
  );

  schedules.forEach((s) => {
    const day = s.dayIndex;
    if (day < 0 || day > 6) return;
    const start = Math.max(0, Math.min(23, s.startSlot));
    const end = Math.max(0, Math.min(24, s.startSlot + s.durationSlots));
    for (let slot = start; slot < end; slot++) {
      grid[day][slot].push(s);
    }
  });

  const comparedPairs = new Set<string>();

  schedules.forEach((s1) => {
    const day = s1.dayIndex;
    if (day < 0 || day > 6) return;
    const start = Math.max(0, Math.min(23, s1.startSlot));
    const end = Math.max(0, Math.min(24, s1.startSlot + s1.durationSlots));
    const sub1 = subjects.find((x) => String(x.id) === String(s1.courseId ?? s1.subjectId));

    for (let slot = start; slot < end; slot++) {
      const candidates = grid[day][slot];
      for (const s2 of candidates) {
        if (s2.id === s1.id) continue;

        // Ensure unique pair key to run checks exactly once per pair
        const pairKey = s1.id < s2.id ? `${s1.id}-${s2.id}` : `${s2.id}-${s1.id}`;
        if (comparedPairs.has(pairKey)) continue;
        comparedPairs.add(pairKey);

        const sub2 = subjects.find((x) => String(x.id) === String(s2.courseId ?? s2.subjectId));

        if (isLinkedMeetingBlock(s1, s2)) {
          continue;
        }

        // 1. Same Section conflict (Time overlap in same section)
        if (s1.sectionId && s1.sectionId === s2.sectionId) {
          const msg1 = `Section conflict: Overlaps with ${s2.courseCode || s2.subjectCode || sub2?.code || "another class"} of section ${s2.sectionName} (${s2.startTime} – ${s2.endTime}).`;
          const msg2 = `Section conflict: Overlaps with ${s1.courseCode || s1.subjectCode || sub1?.code || "another class"} of section ${s1.sectionName} (${s1.startTime} – ${s1.endTime}).`;
          if (!conflictMap[s1.id]) conflictMap[s1.id] = { conflictType: "section", message: msg1 };
          if (!conflictMap[s2.id]) conflictMap[s2.id] = { conflictType: "section", message: msg2 };
        }

        // 2. Room conflict
        if (
          s1.roomId
          && s2.roomId
          && s1.mode !== "online"
          && s2.mode !== "online"
          && samePhysicalRoom(s1.roomId, s2.roomId, rooms)
        ) {
          const room = resolveRoom(rooms, s1.roomId);
          const isSharedField = room?.roomType === "field" || s1.roomId === "field" || s1.mode === "field" || s2.mode === "field";
          const isDifferentFieldDepartment = isSharedField
            && Number(s1.departmentId) !== Number(s2.departmentId);

          if (!isDifferentFieldDepartment) {
            const isSharedCapacityRoom = isSharedField;
            const sharedCapacity = getDepartmentRoomCapacity(room, s1.departmentId, departments);
            const sameRoomSchedules = isSharedCapacityRoom
              ? schedules.filter((item) =>
                  Number(item.departmentId) === Number(s1.departmentId)
                  && item.roomId
                  && samePhysicalRoom(item.roomId, s1.roomId, rooms)
                )
              : schedules;
            const hasRoomConflict = !isSharedCapacityRoom || exceedsSharedRoomCapacity(
              sameRoomSchedules,
              day,
              start,
              end,
              sharedCapacity,
              [],
              false
            );
            if (hasRoomConflict) {
              const roomName = room?.name ?? (isSharedField ? "FIELD" : "Selected room");
              const msg1 = `Room conflict: ${roomName} is already occupied by ${s2.courseCode || s2.subjectCode || sub2?.code || "another class"} of section ${s2.sectionName} (${s2.startTime} – ${s2.endTime}).`;
              const msg2 = `Room conflict: ${roomName} is already occupied by ${s1.courseCode || s1.subjectCode || sub1?.code || "another class"} of section ${s1.sectionName} (${s1.startTime} – ${s1.endTime}).`;
              if (!conflictMap[s1.id]) conflictMap[s1.id] = { conflictType: "room", message: msg1 };
              if (!conflictMap[s2.id]) conflictMap[s2.id] = { conflictType: "room", message: msg2 };
            }
          }
        }

        // 3. Faculty conflict
        if (s1.facultyId && s1.facultyId === s2.facultyId) {
          const faculty = faculties.find((f) => String(f.id) === String(s1.facultyId));
          const facName = faculty?.name ?? "Assigned faculty";
          const msg1 = `Faculty conflict: ${facName} is already teaching ${s2.courseCode || s2.subjectCode || sub2?.code || "another class"} of section ${s2.sectionName} (${s2.startTime} – ${s2.endTime}).`;
          const msg2 = `Faculty conflict: ${facName} is already teaching ${s1.courseCode || s1.subjectCode || sub1?.code || "another class"} of section ${s1.sectionName} (${s1.startTime} – ${s1.endTime}).`;
          if (!conflictMap[s1.id]) conflictMap[s1.id] = { conflictType: "faculty", message: msg1 };
          if (!conflictMap[s2.id]) conflictMap[s2.id] = { conflictType: "faculty", message: msg2 };
        }
      }
    }
  });

  return conflictMap;
};

export const useConflict = ({
  schedules,
  selectedSectionId,
  dragSubjectId,
  draggedScheduleId,
  rooms,
  sections,
  departments,
  subjects,
  faculties,
  fieldCourseAssignmentEnabled = false,
  fieldCourseCodes = []
}: UseConflictParams) => {
  const conflictedMap = useMemo(
    () => getConflictedScheduleMap(schedules, subjects, rooms, faculties, departments),
    [schedules, subjects, rooms, faculties, departments]
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
      const faculty = faculties.find((f) => String(f.id) === String(facultyId));
      if (isPartTimeOutsideAvailability(faculty, dayIndex, startSlot, durationSlots)) {
        return {
          conflictType: "faculty",
          message: `Part-time availability: The assignment falls outside the availability window for ${faculty?.name ?? "Selected faculty"}.`
        };
      }
    }

    // Room-type compatibility check
    const subject = subjects.find((s) => String(s.id) === String(subjectId));
    const candidateDepartmentId = sections.find((section) => String(section.id) === String(sectionId))?.departmentId
      ?? schedules.find((schedule) => String(schedule.sectionId) === String(sectionId))?.departmentId
      ?? subject?.departmentId
      ?? null;
    const configuredFieldCourseCodes = new Set(
      fieldCourseCodes.map((code) => code.trim().toUpperCase()).filter(Boolean)
    );
    const subjectRequiresField =
      subject?.roomTypeRequired === "field"
      || (
        fieldCourseAssignmentEnabled
        && !!subject?.code
        && configuredFieldCourseCodes.has(subject.code.trim().toUpperCase())
      );
    const isOnlinePlacement = roomId === "online";
    if (roomId && !isOnlinePlacement) {
      const room = resolveRoom(rooms, roomId);
      if (room?.roomType === "online") {
        return {
          conflictType: "room",
          message: `Room type mismatch: ${subject?.code ?? "This class"} must use a physical lecture or laboratory room for on-site delivery.`
        };
      }
      if (room?.roomType === "field" && !subjectRequiresField) {
        return {
          conflictType: "room",
          message: `Room type mismatch: ${subject?.code ?? "This class"} must use FIELD only when the course requires field delivery.`
        };
      }

      const isMajorOrMinor = subject?.category === "major" || subject?.category === "minor";
      const isSplit = !!preferredPattern;
      if (!isSplit || !isMajorOrMinor) {
        if (
          room?.roomType
          && subject?.roomTypeRequired
          && room.roomType !== subject.roomTypeRequired
          && !(room.roomType === "field" && subjectRequiresField)
        ) {
          return {
            conflictType: "room",
            message: `Room type mismatch: ${subject.code} requires a '${subject.roomTypeRequired}' room, but '${room.name}' is a '${room.roomType}' room.`
          };
        }
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
        if (roomId && !isOnlinePlacement && samePhysicalRoom(s.roomId, roomId, rooms)) {
          const room = resolveRoom(rooms, roomId);
          const isSharedField = room?.roomType === "field" || roomId === "field" || subjectRequiresField;
          const isSharedOnline = room?.roomType === "online" || roomId === "online";
          const isSharedCapacityRoom = isSharedField || isSharedOnline;
          const isDifferentFieldDepartment = isSharedField
            && candidateDepartmentId !== null
            && Number(s.departmentId) !== Number(candidateDepartmentId);

          if (!isDifferentFieldDepartment) {
            const sharedCapacity = getDepartmentRoomCapacity(room, candidateDepartmentId, departments);
            const sameRoomSchedules = isSharedCapacityRoom
              ? schedules.filter((item) =>
                  Number(item.departmentId) === Number(candidateDepartmentId)
                  && item.roomId
                  && samePhysicalRoom(item.roomId, roomId, rooms)
                )
              : schedules;
            const hasRoomConflict = !isSharedCapacityRoom || exceedsSharedRoomCapacity(
              sameRoomSchedules,
              dayIndex,
              startSlot,
              endSlot,
              sharedCapacity,
              excludeScheduleId ? (Array.isArray(excludeScheduleId) ? excludeScheduleId : [excludeScheduleId]) : []
            );
            if (hasRoomConflict) {
              return {
                conflictType: "room",
                message: isSharedCapacityRoom
                  ? `Room capacity conflict: ${room?.name ?? "Selected room"} is already at this department's shared capacity (${sharedCapacity} concurrent classes).`
                  : `Room conflict: ${room?.name ?? "Selected room"} is already occupied at this time by ${s.courseCode || s.subjectCode || "another class"} of section ${s.sectionName}.`
              };
            }
          }
        }
        if (facultyId && s.facultyId === facultyId) {
          const faculty = faculties.find((f) => String(f.id) === String(facultyId));
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
    const targetFaculty = faculties.find((f) => String(f.id) === String(facultyId));
    if (isPartTimeOutsideAvailability(targetFaculty, target.dayIndex, target.startSlot, target.durationSlots)) {
      return `Part-time availability: The assignment falls outside the availability window for ${targetFaculty?.name ?? facultyId}.`;
    }

    const endSlot = target.startSlot + target.durationSlots;
    for (const s of schedules) {
      if (s.id === scheduleId) continue;
      if (isLinkedMeetingBlock(target, s)) continue;
      if (s.facultyId !== facultyId) continue;
      const sEnd = s.startSlot + s.durationSlots;
      const overlaps = target.dayIndex === s.dayIndex && target.startSlot < sEnd && s.startSlot < endSlot;
      if (overlaps) {
        const fac = faculties.find((f) => String(f.id) === String(facultyId));
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
      const sub = subjects.find((s) => String(s.id) === String(dragSubjectId));
      if (!sub) return false;
      dur = getSubjectTotalSlots(sub);
      subjectId = String(sub.id);
    } else {
      return false;
    }

    return checkConflict(subjectId, selectedSectionId, null, "", d, t, dur, excludeId, prefPattern) !== null;
  };

  return { checkConflict, checkFacultyConflict, getDragOverConflict, conflictedMap };
};
