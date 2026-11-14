import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeliveryMode, Department, Faculty, Room, RoomType, ScheduleItem, Section, Subject } from "../types";
import { getSubjectTotalSlots } from "../types";
import { getCourseSlotPlan, SLOT_MINUTES } from "../courseSlotPlan";
import { buildPreferredPattern, closingTimeLabel, consecutiveDayCount, fieldEndMinutes, formatTime12h, FULL_DAY_NAMES, gridOpeningMinutes, isFixedSplitPattern, parsePreferredPattern, slotCount, slotMinutes, slotToTime24h } from "../../../../lib/timeGrid";
import { instructorConflictMessage, roomConflictMessage, sectionConflictMessage, type ConflictBooking, type RequestedSlot } from "../../../../lib/conflictMessages";
import { describeWindow, roomGrantFits, windowConflicts } from "../../../../lib/roomRequests";
import { NO_LABORATORY_UNITS_MESSAGE, isLabMeetingRoomType, isMajorWithoutLaboratoryUnits } from "../../../../lib/labRoomPolicy";
import { AVAILABILITY_WARNING_TITLE, availabilityWarningMessage, isOutsideAvailability, minutesOfTime } from "../../../../lib/availabilityWindows";
import { isConfiguredFieldCourse, isFieldSchedulingEligible } from "../schedulingConfigurationEligibility";

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
  return isConfiguredFieldCourse(subject, fieldCourseAssignmentEnabled ? configuredFieldCourseCodes : new Set());
};

export const isLaboratorySubject = (subject: Subject | undefined): boolean => {
  if (!subject) return false;
  if (isMajorWithoutLaboratoryUnits(subject)) return false;

  return subjectHasCategory(subject, "Laboratory")
    || Number(subject.labHours ?? 0) > 0
    || subject.roomTypeRequired === "laboratory";
};

export const requiredRoomTypeForMeeting = (
  subject: Subject | undefined,
  meetingType?: ScheduleItem["meetingType"] | "field"
): RoomType | null => {
  if (isMajorWithoutLaboratoryUnits(subject)) return "lecture";
  if (meetingType === "field" && subject && !isFieldSchedulingEligible(subject)) return "laboratory";
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

const slotWindow = (dayIndex: number, startSlot: number, durationSlots: number) => ({
  day: FULL_DAY_NAMES[dayIndex] ?? "",
  start_time: slotToTime24h(startSlot),
  end_time: slotToTime24h(startSlot + durationSlots),
});

/**
 * The owner's own room during time it has lent out under an approved request. The loan
 * stays reserved even while the owner revises a recalled timetable, mirroring the server's
 * refusal, and the message suggests the nearest free time in this room or another free room.
 */
export const checkRoomLentWindow = (
  room: Room | undefined,
  rooms: Room[],
  schedules: ScheduleItem[],
  dayIndex: number,
  startSlot: number,
  durationSlots: number,
  excludeScheduleId?: string | string[]
): ConflictResult => {
  if (!room?.lentWindows?.length) return null;
  const lent = windowConflicts(slotWindow(dayIndex, startSlot, durationSlots), room.lentWindows)[0];
  if (!lent) return null;

  const excluded = new Set(excludeScheduleId === undefined ? [] : [excludeScheduleId].flat());
  const isFree = (candidate: Room, start: number): boolean => {
    const window = slotWindow(dayIndex, start, durationSlots);
    return windowConflicts(window, candidate.lentWindows ?? []).length === 0
      && roomGrantFits(candidate, dayIndex, start, durationSlots)
      && !schedules.some((s) => !excluded.has(s.id)
        && String(s.roomId) === String(candidate.id)
        && s.dayIndex === dayIndex
        && s.startSlot < start + durationSlots
        && start < s.startSlot + s.durationSlots);
  };

  const lastStart = slotCount() - durationSlots;
  const sameRoomStart = Array.from({ length: Math.max(0, lastStart + 1) }, (_, slot) => slot)
    .filter((slot) => isFree(room, slot))
    .sort((a, b) => Math.abs(a - startSlot) - Math.abs(b - startSlot) || a - b)[0];
  const otherRooms = rooms
    .filter((candidate) => String(candidate.id) !== String(room.id)
      && candidate.roomType === room.roomType
      && (candidate.status ?? "available") === "available"
      && isFree(candidate, startSlot))
    .slice(0, 2)
    .map((candidate) => candidate.name);

  const suggestions = [
    ...(sameRoomStart === undefined ? [] : [`${describeWindow(slotWindow(dayIndex, sameRoomStart, durationSlots)).slice(4)} in ${room.name}`]),
    ...(otherRooms.length ? [`${otherRooms.join(" or ")} at this time`] : []),
  ];

  return {
    conflictType: "room",
    title: "Reserved for Borrowing",
    message: `Room ${room.name} is lent to ${lent.borrower ?? "another department"} on ${describeWindow(lent)} under an approved room request, so this time stays reserved. `
      + (suggestions.length ? `Try ${suggestions.join(", or ")}.` : "Choose another time or room."),
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

/**
 * The instructor's availability is the employment type's default week plus any
 * added windows; a meeting must fit inside it. Mirrors the backend rule.
 */
export const isOutsideFacultyAvailability = (
  faculty: Faculty | undefined,
  dayIndex: number,
  startSlot: number,
  durationSlots: number
): boolean => isOutsideAvailability(faculty, {
  dayIndex,
  startMinutes: minutesOfTime(slotToTime24h(startSlot)),
  endMinutes: minutesOfTime(slotToTime24h(startSlot + durationSlots)),
});

/** The time a schedule occupies, as the conflict wording quotes it. */
const slotOf = (dayIndex: number, startSlot: number, durationSlots: number): RequestedSlot => ({
  day: FULL_DAY_NAMES[dayIndex] ?? "",
  start: slotToTime24h(startSlot),
  end: slotToTime24h(startSlot + durationSlots),
});

/** The class already holding a resource, read from its schedule record. */
const bookingOf = (schedule: ScheduleItem, departments: Department[], fallbackCode?: string): ConflictBooking => ({
  department: departments.find((department) => Number(department.id) === Number(schedule.departmentId))?.department_code ?? null,
  course: schedule.courseCode || schedule.subjectCode || fallbackCode || null,
  section: schedule.sectionName || null,
  start: slotToTime24h(schedule.startSlot),
  end: slotToTime24h(schedule.startSlot + schedule.durationSlots),
});

export const getConflictedScheduleMap = (
  schedules: ScheduleItem[],
  subjects: Subject[],
  rooms: Room[],
  faculties: Faculty[],
  departments: Department[] = []
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
          const msg1 = sectionConflictMessage(s1.sectionName, slotOf(s1.dayIndex, s1.startSlot, s1.durationSlots), bookingOf(s2, departments, sub2?.code));
          const msg2 = sectionConflictMessage(s2.sectionName, slotOf(s2.dayIndex, s2.startSlot, s2.durationSlots), bookingOf(s1, departments, sub1?.code));
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
            const roomName = room?.name ?? null;
            const msg1 = roomConflictMessage(roomName, slotOf(s1.dayIndex, s1.startSlot, s1.durationSlots), bookingOf(s2, departments, sub2?.code));
            const msg2 = roomConflictMessage(roomName, slotOf(s2.dayIndex, s2.startSlot, s2.durationSlots), bookingOf(s1, departments, sub1?.code));
            if (!conflictMap[s1.id]) conflictMap[s1.id] = { conflictType: "room", message: msg1 };
            if (!conflictMap[s2.id]) conflictMap[s2.id] = { conflictType: "room", message: msg2 };
          }
        }

        if (s1.facultyId && s1.facultyId === s2.facultyId) {
          const faculty = faculties.find((f) => String(f.id) === String(s1.facultyId));
          const facName = faculty?.name ?? null;
          const msg1 = instructorConflictMessage(facName, slotOf(s1.dayIndex, s1.startSlot, s1.durationSlots), bookingOf(s2, departments, sub2?.code));
          const msg2 = instructorConflictMessage(facName, slotOf(s2.dayIndex, s2.startSlot, s2.durationSlots), bookingOf(s1, departments, sub1?.code));
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
  sundayClassesEnabled = true,
}: UseConflictParams) => {
  const conflictedMap = useMemo(
    () => getConflictedScheduleMap(schedules, subjects, rooms, faculties, departments),
    [schedules, subjects, rooms, faculties, departments]
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
    preferredPattern?: string | null,
    /** The day count when the candidate is one day of a Consecutive Days run. */
    runDayCount?: number | null
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
      if (isOutsideFacultyAvailability(faculty, dayIndex, startSlot, durationSlots)) {
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

    if (subject && deliveryMode === "field" && !isFieldSchedulingEligible(subject)) {
      return { conflictType: "room", message: "Courses with laboratory requirements cannot use Field placement. Choose a laboratory room or Room TBA." };
    }

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
      const lentWindowConflict = checkRoomLentWindow(room, rooms, schedules, dayIndex, startSlot, durationSlots, excludeScheduleId);
      if (lentWindowConflict) {
        return lentWindowConflict;
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
          && !(requiredRoomType === "laboratory" && isLabMeetingRoomType(room.roomType))
        ) {
          return {
            conflictType: "room",
            message: requiredRoomType === "lecture" && room.roomType === "laboratory" && isMajorWithoutLaboratoryUnits(subject)
              ? NO_LABORATORY_UNITS_MESSAGE
              : requiredRoomType === "laboratory"
              ? `Room type mismatch: ${subject?.code ?? "This class"} has a laboratory component, so it must be scheduled in a laboratory room (or Room TBA), but '${room.name}' is a '${room.roomType}' room.`
              : `Room type mismatch: ${subject?.code ?? "This class"} requires a '${requiredRoomType}' room, but '${room.name}' is a '${room.roomType}' room.`
          };
        }
      }
    }
    if (subject) {
      const ceilingSlots = getCourseSlotPlan(subject).totalSlots;
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
        // A Consecutive Days run repeats the course's time once per linked day, as the server allows.
        const linkedRunDays = runDayCount
          ? Math.min(runDayCount, 1 + kept.filter((s) => Boolean(s.splitGroupId) && consecutiveDayCount(s.preferredPattern) !== null).length)
          : 1;
        const allowedSlots = Math.max(ceilingSlots * linkedRunDays, Math.min(longest, slotCount()));
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
            message: sectionConflictMessage(
              sections.find((section) => String(section.id) === String(sectionId))?.name ?? s.sectionName,
              slotOf(dayIndex, startSlot, durationSlots),
              bookingOf(s, departments)
            )
          };
        }
        if (!isTbaPlacement && !isOnlinePlacement && !isRoomTba(s.roomId) && samePhysicalRoom(s.roomId, roomId, rooms)) {
          const room = resolveRoom(rooms, roomId);
          const isSharedRoom = room?.roomType === "field" || roomId === "field"
            || room?.roomType === "online" || roomId === "online";

          if (!isSharedRoom) {
            return {
              conflictType: "room",
              message: roomConflictMessage(room?.name, slotOf(dayIndex, startSlot, durationSlots), bookingOf(s, departments))
            };
          }
        }
        if (facultyId && s.facultyId === facultyId) {
          const faculty = faculties.find((f) => String(f.id) === String(facultyId));
          return {
            conflictType: "faculty",
            message: instructorConflictMessage(faculty?.name, slotOf(dayIndex, startSlot, durationSlots), bookingOf(s, departments))
          };
        }
      }
    }
    return null;
  }, [faculties, subjects, sections, schedules, rooms, departments, fieldCourseAssignmentEnabled, fieldCourseCodes, sundayClassesEnabled]);

  const checkFacultyConflict = useCallback((facultyId: string, scheduleId: string): string | null => {
    const target = schedules.find((s) => s.id === scheduleId);
    if (!target) return null;
    const targetFaculty = faculties.find((f) => String(f.id) === String(facultyId));
    if (isOutsideFacultyAvailability(targetFaculty, target.dayIndex, target.startSlot, target.durationSlots)) {
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
        return instructorConflictMessage(
          fac?.name,
          slotOf(target.dayIndex, target.startSlot, target.durationSlots),
          bookingOf(s, departments)
        );
      }
    }
    return null;
  }, [schedules, faculties, departments]);

  const checkMoveConflict = useCallback((scheduleId: string, dayIndex: number, startSlot: number): ConflictResult => {
    const schedule = schedules.find((item) => item.id === scheduleId);
    if (!schedule) return null;
    const courseId = String(schedule.courseId ?? schedule.subjectId ?? "");
    const courseLabel = schedule.courseCode || schedule.subjectCode || "This course";

    if (schedule.splitGroupId && consecutiveDayCount(schedule.preferredPattern) !== null) {
      const run = schedules.filter((item) => item.splitGroupId === schedule.splitGroupId);
      const conflict = checkConflict(
        courseId, schedule.sectionId, schedule.facultyId ?? null, schedule.roomId,
        dayIndex, startSlot, schedule.durationSlots, schedule.id, schedule.preferredPattern,
        consecutiveDayCount(schedule.preferredPattern)
      );
      if (conflict) return conflict;
      if (run.some((item) => item.id !== schedule.id && item.dayIndex === dayIndex)) {
        return {
          conflictType: "section",
          message: `${courseLabel} already has a consecutive meeting on ${FULL_DAY_NAMES[dayIndex]}. Its meetings must be on different days.`,
        };
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
