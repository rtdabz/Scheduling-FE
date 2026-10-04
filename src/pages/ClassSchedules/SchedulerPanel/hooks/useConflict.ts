import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeliveryMode, Department, Faculty, Room, RoomType, ScheduleItem, Section, Subject } from "../types";
import { getSubjectTotalSlots } from "../types";
import { getCourseSlotPlan, laboratoryComponentSlots, SLOT_MINUTES, type LaboratoryDurationSettings } from "../courseSlotPlan";
import { buildPreferredPattern, closingTimeLabel, consecutiveDayCount, fieldEndMinutes, formatTime12h, FULL_DAY_NAMES, gridOpeningMinutes, isFixedSplitPattern, parsePreferredPattern, slotCount, slotMinutes, timeToSlotUnclamped } from "../../../../lib/timeGrid";
import { describeWindow, roomGrantFits } from "../../../../lib/roomRequests";
import { isLabMeetingRoomType, labRoomTypes } from "../../../../lib/labRoomPolicy";
import { AVAILABILITY_WARNING_TITLE, availabilityWarningMessage, coveredContinuously } from "../../../../lib/availabilityWindows";

export type ConflictResult = { conflictType: "room" | "faculty" | "section"; message: string; title?: string } | null;

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
  laboratoryDurationSettings?: LaboratoryDurationSettings | null;
  sundayClassesEnabled?: boolean;
}

const SUNDAY_INDEX = 6;

export const sameTimePartner = (
  schedule: ScheduleItem,
  schedules: ScheduleItem[],
  subjects: Subject[]
): ScheduleItem | null => {
  if (!schedule.splitGroupId) return null;
  const group = schedules.filter((item) => item.splitGroupId === schedule.splitGroupId);
  if (group.length !== 2) return null;

  const courseId = String(schedule.courseId ?? schedule.subjectId ?? "");
  const subject = subjects.find((item) => String(item.id) === courseId);
  if (!subject) return null;
  const sameTime = group.some((item) => item.isHybrid)
    ? Number(subject.labHours ?? 0) === 0
    : isFixedSplitPattern(schedule.preferredPattern);

  return sameTime ? group.find((item) => item.id !== schedule.id) ?? null : null;
};

export const isCustomDayPattern = (preferredPattern?: string | null): boolean =>
  /^days:[0-6]-[0-6]$/.test(preferredPattern ?? "");

export const relocatedPairPattern = (
  schedule: ScheduleItem,
  partner: ScheduleItem,
  nextDayIndex: number
): string => {
  const current = parsePreferredPattern(schedule.preferredPattern);
  const movedWasFirst = current === null || current[0] === schedule.dayIndex;

  return movedWasFirst
    ? buildPreferredPattern(nextDayIndex, partner.dayIndex)
    : buildPreferredPattern(partner.dayIndex, nextDayIndex);
};

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
    left.semesterId === right.semesterId
    && left.sectionId === right.sectionId
    && (left.courseId ?? left.subjectId) === (right.courseId ?? right.subjectId)
    && left.departmentId === right.departmentId
    && (left.preferredPattern ?? null) === (right.preferredPattern ?? null)
    && leftMeetingKey !== rightMeetingKey
  );
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

const isRoomTba = (roomId: string | null | undefined): boolean => roomId === "tba" || !roomId;

const samePhysicalRoom = (leftRoomId: string, rightRoomId: string, rooms: Room[]): boolean => {
  const leftRoom = resolveRoom(rooms, leftRoomId);
  const rightRoom = resolveRoom(rooms, rightRoomId);

  if (leftRoom?.id && rightRoom?.id) {
    return String(leftRoom.id) === String(rightRoom.id);
  }

  return String(leftRoomId) === String(rightRoomId);
};

const normalizeCourseCode = (courseCode: string): string =>
  courseCode.trim().replace(/\s+/g, " ").toUpperCase();

const normalizeCategoryName = (categoryName: string): string =>
  categoryName.trim().toLowerCase();

export const subjectHasCategory = (subject: Subject | undefined, categoryName: string): boolean =>
  (subject?.categories ?? []).some(
    (category) => normalizeCategoryName(String(category.name ?? "")) === normalizeCategoryName(categoryName)
  );

export const isFieldSubject = (
  subject: Subject | undefined,
  fieldCourseAssignmentEnabled: boolean,
  configuredFieldCourseCodes: Set<string>
): boolean => {
  if (!subject) return false;
  if (subject.roomTypeRequired === "field") return true;
  if (!fieldCourseAssignmentEnabled) return false;

  return configuredFieldCourseCodes.has(normalizeCourseCode(subject.code ?? ""));
};

export const isLaboratorySubject = (subject: Subject | undefined): boolean => {
  if (!subject) return false;

  return subjectHasCategory(subject, "Laboratory")
    || Number(subject.labHours ?? 0) > 0
    || subject.roomTypeRequired === "laboratory";
};

export const requiredRoomTypeForMeeting = (
  subject: Subject | undefined,
  meetingType?: ScheduleItem["meetingType"]
): RoomType | null => {
  if (meetingType) return meetingType;
  if (!subject) return null;
  if (isLaboratorySubject(subject)) return "laboratory";

  return subject.roomTypeRequired ?? null;
};

export const checkFieldEveningWindow = (
  isFieldPlacement: boolean,
  endSlot: number
): ConflictResult => {
  if (!isFieldPlacement) return null;
  if (gridOpeningMinutes() + endSlot * slotMinutes() <= fieldEndMinutes()) return null;

  const fieldEnd = fieldEndMinutes();
  const fieldEndLabel = formatTime12h(`${Math.floor(fieldEnd / 60)}:${String(fieldEnd % 60).padStart(2, "0")}`);
  return {
    conflictType: "section",
    title: "Time Restriction",
    message: `Field courses cannot be scheduled beyond ${fieldEndLabel}.`
  };
};

export const checkRoomGrantWindow = (
  room: Room | undefined,
  dayIndex: number,
  startSlot: number,
  durationSlots: number
): ConflictResult => {
  if (!room?.grantWindows || roomGrantFits(room, dayIndex, startSlot, durationSlots)) return null;

  return {
    conflictType: "room",
    message: `Room access: ${room.name} is borrowed and only usable ${room.grantWindows.map(describeWindow).join(", ")}.`
  };
};

export const resolveDeliveryMode = (roomId: string, rooms: Room[]): DeliveryMode => {
  if (roomId === "online") return "online";
  if (roomId === "field") return "field";

  const room = rooms.find((r) => String(r.id) === String(roomId));
  if (room?.roomType === "online") return "online";
  if (room?.roomType === "field") return "field";

  return "on-site";
};

export const isPartTimeOutsideAvailability = (
  faculty: Faculty | undefined,
  dayIndex: number,
  startSlot: number,
  durationSlots: number
): boolean => {
  if (!faculty) return false;
  if (faculty.employmentType !== "part-time") return false;

  const recorded = faculty.availabilities ?? [];
  if (recorded.length === 0) return false;
  const dayAvailabilities = recorded.filter(
    (a) => Number(a.day_index) === dayIndex
  );
  if (dayAvailabilities.length === 0) return true;

  return !coveredContinuously(
    dayAvailabilities.map((window): [number, number] => [
      timeToSlotUnclamped(window.start_time),
      timeToSlotUnclamped(window.end_time),
    ]),
    startSlot,
    startSlot + durationSlots
  );
};

export const getConflictedScheduleMap = (
  schedules: ScheduleItem[],
  subjects: Subject[],
  rooms: Room[],
  faculties: Faculty[]
): Record<string, NonNullable<ConflictResult>> => {
  const conflictMap: Record<string, NonNullable<ConflictResult>> = {};

  const subjectsById = new Map(subjects.map((subject) => [String(subject.id), subject]));
  const resolvedRoomCache = new Map<string, Room | undefined>();
  const resolveRoomCached = (roomId: string): Room | undefined => {
    if (!resolvedRoomCache.has(roomId)) {
      resolvedRoomCache.set(roomId, resolveRoom(rooms, roomId));
    }

    return resolvedRoomCache.get(roomId);
  };
  const physicalRoomKey = (roomId: string): string =>
    String(resolveRoomCached(roomId)?.id ?? roomId);
  const subjectFor = (schedule: ScheduleItem): Subject | undefined =>
    subjectsById.get(String(schedule.courseId ?? schedule.subjectId));

  const grid: ScheduleItem[][][] = Array.from({ length: 7 }, () =>
    Array.from({ length: slotCount() }, () => [])
  );

  schedules.forEach((s) => {
    const day = s.dayIndex;
    if (day < 0 || day > 6) return;
    const start = Math.max(0, Math.min(slotCount() - 1, s.startSlot));
    const end = Math.max(0, Math.min(slotCount(), s.startSlot + s.durationSlots));
    for (let slot = start; slot < end; slot++) {
      grid[day][slot].push(s);
    }
  });

  const comparedPairs = new Set<string>();

  schedules.forEach((s1) => {
    const day = s1.dayIndex;
    if (day < 0 || day > 6) return;
    const start = Math.max(0, Math.min(slotCount() - 1, s1.startSlot));
    const end = Math.max(0, Math.min(slotCount(), s1.startSlot + s1.durationSlots));
    const sub1 = subjectFor(s1);

    for (let slot = start; slot < end; slot++) {
      const candidates = grid[day][slot];
      for (const s2 of candidates) {
        if (s2.id === s1.id) continue;

        const pairKey = s1.id < s2.id ? `${s1.id}-${s2.id}` : `${s2.id}-${s1.id}`;
        if (comparedPairs.has(pairKey)) continue;
        comparedPairs.add(pairKey);

        const sub2 = subjectFor(s2);

        if (isLinkedMeetingBlock(s1, s2)) {
          continue;
        }

        if (s1.sectionId && s1.sectionId === s2.sectionId) {
          const msg1 = `Section conflict: Overlaps with ${s2.courseCode || s2.subjectCode || sub2?.code || "another class"} of section ${s2.sectionName} (${s2.startTime} – ${s2.endTime}).`;
          const msg2 = `Section conflict: Overlaps with ${s1.courseCode || s1.subjectCode || sub1?.code || "another class"} of section ${s1.sectionName} (${s1.startTime} – ${s1.endTime}).`;
          if (!conflictMap[s1.id]) conflictMap[s1.id] = { conflictType: "section", message: msg1 };
          if (!conflictMap[s2.id]) conflictMap[s2.id] = { conflictType: "section", message: msg2 };
        }

        if (
          !isRoomTba(s1.roomId)
          && !isRoomTba(s2.roomId)
          && s1.mode !== "online"
          && s2.mode !== "online"
          && physicalRoomKey(s1.roomId) === physicalRoomKey(s2.roomId)
        ) {
          const room = resolveRoomCached(s1.roomId);
          const isSharedField = room?.roomType === "field" || s1.roomId === "field" || s1.mode === "field" || s2.mode === "field";
          if (!isSharedField) {
            const roomName = room?.name ?? "Selected room";
            const msg1 = `Room conflict: ${roomName} is already occupied by ${s2.courseCode || s2.subjectCode || sub2?.code || "another class"} of section ${s2.sectionName} (${s2.startTime} – ${s2.endTime}).`;
            const msg2 = `Room conflict: ${roomName} is already occupied by ${s1.courseCode || s1.subjectCode || sub1?.code || "another class"} of section ${s1.sectionName} (${s1.startTime} – ${s1.endTime}).`;
            if (!conflictMap[s1.id]) conflictMap[s1.id] = { conflictType: "room", message: msg1 };
            if (!conflictMap[s2.id]) conflictMap[s2.id] = { conflictType: "room", message: msg2 };
          }
        }

        if (
          s1.facultyId
          && s1.facultyId === s2.facultyId
          && !(s1.facultyConflictOverride && s2.facultyConflictOverride)
        ) {
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
  fieldCourseCodes = [],
  laboratoryDurationSettings = null,
  sundayClassesEnabled = true,
}: UseConflictParams) => {
  const conflictedMap = useMemo(
    () => getConflictedScheduleMap(schedules, subjects, rooms, faculties),
    [schedules, subjects, rooms, faculties]
  );

  const [resolvedIds, setResolvedIds] = useState<ReadonlySet<string>>(() => new Set());
  const previousConflictedRef = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const now = new Set(Object.keys(conflictedMap));
    const before = previousConflictedRef.current;
    previousConflictedRef.current = now;
    const existing = new Set(schedules.map((s) => s.id));
    setResolvedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => { if (!now.has(id) && existing.has(id)) next.add(id); });
      before?.forEach((id) => { if (!now.has(id) && existing.has(id)) next.add(id); });
      if (next.size === prev.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  }, [conflictedMap, schedules]);

  const checkConflict = useCallback((
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
    if (!sundayClassesEnabled && dayIndex === SUNDAY_INDEX) {
      return {
        conflictType: "section",
        title: "Day Restriction",
        message: "Sunday classes are disabled for this department.",
      };
    }

    const allowedDays = parsePreferredPattern(preferredPattern);
    if (allowedDays && !allowedDays.includes(dayIndex)) {
      return {
        conflictType: "section",
        message: "Meeting pattern conflict: This class can only be scheduled on the selected meeting days."
      };
    }

    const endSlot = startSlot + durationSlots;
    if (endSlot > slotCount()) {
      return {
        conflictType: "section",
        title: "Time Restriction",
        message: `The schedule must end by ${formatTime12h(closingTimeLabel())}.`
      };
    }

    if (facultyId) {
      const faculty = faculties.find((f) => String(f.id) === String(facultyId));
      if (isPartTimeOutsideAvailability(faculty, dayIndex, startSlot, durationSlots)) {
        return {
          conflictType: "faculty",
          title: AVAILABILITY_WARNING_TITLE,
          message: availabilityWarningMessage(faculty?.name ?? "the selected instructor")
        };
      }
    }

    const subject = subjects.find((s) => String(s.id) === String(subjectId));
    const configuredFieldCourseCodes = new Set(
      fieldCourseCodes.map((code) => normalizeCourseCode(code)).filter(Boolean)
    );
    const subjectRequiresField = isFieldSubject(
      subject,
      fieldCourseAssignmentEnabled,
      configuredFieldCourseCodes
    );
    const isOnlinePlacement = roomId === "online";
    const isTbaPlacement = isRoomTba(roomId);
    const deliveryMode = resolveDeliveryMode(roomId, rooms);

    const isFieldPlacement = deliveryMode === "field" || subjectRequiresField;

    const fieldWindowConflict = checkFieldEveningWindow(isFieldPlacement, endSlot);
    if (fieldWindowConflict) {
      return fieldWindowConflict;
    }

    if (!isTbaPlacement && !isOnlinePlacement) {
      const room = resolveRoom(rooms, roomId);
      const grantWindowConflict = checkRoomGrantWindow(room, dayIndex, startSlot, durationSlots);
      if (grantWindowConflict) {
        return grantWindowConflict;
      }
      if (room && room.status && room.status !== "available") {
        return {
          conflictType: "room",
          message: `Room ${room.name} is not available for scheduling.`
        };
      }
      if (room?.roomType === "online") {
        return {
          conflictType: "room",
          message: `Room type mismatch: ${subject?.code ?? "This class"} must use a physical lecture or laboratory room for on-site delivery.`
        };
      }
      if (room?.roomType === "field" && !isFieldPlacement) {
        return {
          conflictType: "room",
          message: `Room type mismatch: ${subject?.code ?? "This class"} must use FIELD only when the meeting uses field delivery.`
        };
      }

      const hasLectureAndLabComponents =
        Number(subject?.lectureHours ?? 0) > 0 && Number(subject?.labHours ?? 0) > 0;
      const isSplitWithMixedComponents = !!preferredPattern && hasLectureAndLabComponents;
      const requiredRoomType = requiredRoomTypeForMeeting(subject);

      if (!isSplitWithMixedComponents) {
        if (
          room?.roomType
          && requiredRoomType
          && room.roomType !== requiredRoomType
          && !(room.roomType === "field" && isFieldPlacement)
          && !(requiredRoomType === "lecture" && room.roomType === "laboratory")
          && !(requiredRoomType === "laboratory" && isLabMeetingRoomType(room.roomType))
        ) {
          return {
            conflictType: "room",
            message: requiredRoomType === "laboratory"
              ? `Room type mismatch: ${subject?.code ?? "This class"} has a laboratory component, so it must be scheduled in a ${labRoomTypes().map((type) => type === "lecture" ? "classroom" : "laboratory room").join(" or ")}, but '${room.name}' is a '${room.roomType}' room.`
              : `Room type mismatch: ${subject?.code ?? "This class"} requires a '${requiredRoomType}' room, but '${room.name}' is a '${room.roomType}' room.`
          };
        }
      }
    }
    if (subject) {
      const plan = getCourseSlotPlan(subject);
      const ceilingSlots = Math.max(
        plan.singleBlockSlots,
        plan.lectureSlots + (Number(subject.labHours ?? 0) > 0 ? laboratoryComponentSlots(subject, laboratoryDurationSettings) : 0)
      );
      if (ceilingSlots > 0) {
        const ignored = excludeScheduleId
          ? new Set(Array.isArray(excludeScheduleId) ? excludeScheduleId : [excludeScheduleId])
          : null;
        const sameCourse = schedules.filter((s) =>
          String(s.sectionId) === String(sectionId)
          && String(s.courseId ?? s.subjectId ?? "") === String(subjectId)
        );
        const before = sameCourse.reduce((sum, s) => sum + s.durationSlots, 0);
        const kept = sameCourse.filter((s) => !ignored?.has(s.id));
        const total = kept.reduce((sum, s) => sum + s.durationSlots, 0) + durationSlots;
        const longest = Math.max(durationSlots, ...kept.map((s) => s.durationSlots));
        const allowedSlots = Math.max(ceilingSlots, Math.min(longest, slotCount()));
        if (total > allowedSlots && total > before) {
          const hours = (slots: number) => `${slots * SLOT_MINUTES / 60} ${slots * SLOT_MINUTES === 60 ? "hour" : "hours"}`;
          return {
            conflictType: "section",
            message: `${subject.code ?? "This class"} would meet ${hours(total)} a week for this section, but the course carries at most ${hours(allowedSlots)}.`
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
        if (
          deliveryMode === "online"
          && s.mode === "online"
          && String(s.courseId ?? s.subjectId ?? "") === String(subjectId)
        ) {
          return {
            conflictType: "section",
            message: `Online course conflict: ${s.courseCode || s.subjectCode || "This course"} is already running online for section ${s.sectionName} at this time.`
          };
        }
        if (!isTbaPlacement && !isOnlinePlacement && !isRoomTba(s.roomId) && samePhysicalRoom(s.roomId, roomId, rooms)) {
          const room = resolveRoom(rooms, roomId);
          const isSharedRoom = room?.roomType === "field" || roomId === "field"
            || room?.roomType === "online" || roomId === "online";

          if (!isSharedRoom) {
            return {
              conflictType: "room",
              message: `Room conflict: ${room?.name ?? "Selected room"} is already occupied at this time by ${s.courseCode || s.subjectCode || "another class"} of section ${s.sectionName}.`
            };
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
  }, [faculties, subjects, sections, schedules, rooms, departments, fieldCourseAssignmentEnabled, fieldCourseCodes, laboratoryDurationSettings, sundayClassesEnabled]);

  const checkFacultyConflict = useCallback((facultyId: string, scheduleId: string): string | null => {
    const target = schedules.find((s) => s.id === scheduleId);
    if (!target) return null;
    const targetFaculty = faculties.find((f) => String(f.id) === String(facultyId));
    if (isPartTimeOutsideAvailability(targetFaculty, target.dayIndex, target.startSlot, target.durationSlots)) {
      return availabilityWarningMessage(targetFaculty?.name ?? "the selected instructor");
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
  }, [schedules, faculties]);

  const checkMoveConflict = useCallback((scheduleId: string, dayIndex: number, startSlot: number): ConflictResult => {
    const schedule = schedules.find((item) => item.id === scheduleId);
    if (!schedule) return null;
    const courseId = String(schedule.courseId ?? schedule.subjectId ?? "");
    const courseLabel = schedule.courseCode || schedule.subjectCode || "This course";

    if (schedule.splitGroupId && consecutiveDayCount(schedule.preferredPattern) !== null) {
      const run = schedules.filter((item) => item.splitGroupId === schedule.splitGroupId);
      const shift = dayIndex - schedule.dayIndex;
      if (run.some((item) => item.dayIndex + shift < 0 || item.dayIndex + shift >= FULL_DAY_NAMES.length)) {
        return {
          conflictType: "section",
          message: `${courseLabel}: moving the run there would push it past the end of the week.`,
        };
      }
      const runIds = run.map((item) => item.id);
      const ordered = [schedule, ...run.filter((item) => item.id !== schedule.id)];
      for (const item of ordered) {
        const conflict = checkConflict(
          courseId, item.sectionId, item.facultyId ?? null, item.roomId,
          item.dayIndex + shift, startSlot, item.durationSlots, runIds, null
        );
        if (conflict) return { ...conflict, message: `${FULL_DAY_NAMES[item.dayIndex + shift]}: ${conflict.message}` };
      }
      return null;
    }

    const groupPartner = schedule.splitGroupId
      ? schedules.find((item) => item.splitGroupId === schedule.splitGroupId && item.id !== schedule.id) ?? null
      : null;
    if (groupPartner && groupPartner.dayIndex === dayIndex) {
      return {
        conflictType: "section",
        title: "Split Schedule Restriction",
        message: `${courseLabel} cannot have both split meetings on ${FULL_DAY_NAMES[dayIndex]}. They must be on different days.`,
      };
    }

    const partner = sameTimePartner(schedule, schedules, subjects);

    const movePattern = groupPartner && isCustomDayPattern(schedule.preferredPattern)
      ? relocatedPairPattern(schedule, groupPartner, dayIndex)
      : schedule.preferredPattern;

    const movingIds = partner ? [schedule.id, partner.id] : [schedule.id];
    const own = checkConflict(
      courseId, schedule.sectionId, schedule.facultyId ?? null, schedule.roomId,
      dayIndex, startSlot, schedule.durationSlots, movingIds, movePattern
    );
    if (own || !partner || partner.startSlot === startSlot) return own;

    const partnerConflict = checkConflict(
      String(partner.courseId ?? partner.subjectId ?? ""), partner.sectionId, partner.facultyId ?? null, partner.roomId,
      partner.dayIndex, startSlot, partner.durationSlots, movingIds, partner.preferredPattern
    );

    return partnerConflict
      ? { ...partnerConflict, message: `Paired ${FULL_DAY_NAMES[partner.dayIndex]} meeting: ${partnerConflict.message}` }
      : null;
  }, [schedules, subjects, checkConflict]);

  const getDragOverConflict = useCallback((d: number, t: number): boolean => {
    if (draggedScheduleId) {
      return checkMoveConflict(draggedScheduleId, d, t) !== null;
    }
    if (!dragSubjectId) return false;

    const sub = subjects.find((s) => String(s.id) === String(dragSubjectId));
    if (!sub) return false;

    return checkConflict(String(sub.id), selectedSectionId, null, "", d, t, getSubjectTotalSlots(sub), undefined, null) !== null;
  }, [draggedScheduleId, dragSubjectId, subjects, selectedSectionId, checkConflict, checkMoveConflict]);

  return { checkConflict, checkMoveConflict, checkFacultyConflict, getDragOverConflict, conflictedMap, resolvedIds };
};
