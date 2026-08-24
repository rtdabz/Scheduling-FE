import { useCallback, useMemo } from "react";
import type { DeliveryMode, Department, Faculty, Room, RoomType, ScheduleItem, Section, Subject } from "../types";
import { getSubjectTotalSlots } from "../types";
import { closingTimeLabel, parsePreferredPattern, slotCount, timeToSlotUnclamped } from "../../../../lib/timeGrid";

export type ConflictResult = { conflictType: "room" | "faculty" | "section"; message: string } | null;

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

/**
 * Server default for an unset online/field slot limit.
 *
 * DepartmentResourceSlotLimitService falls back to 3. The client used to fall back
 * to the room's own `max_concurrent_classes`, which is usually 1, so a department
 * with no configured limit saw a capacity conflict on the second concurrent class
 * while the server would have accepted three (audit finding #39).
 */
const DEFAULT_SHARED_SLOT_LIMIT = 3;

const getRoomCapacity = (room: Room | undefined): number => {
  return Math.max(1, Number(room?.maxConcurrentClasses ?? 1) || 1);
};

const getDepartmentRoomCapacity = (
  room: Room | undefined,
  departmentId: number | null,
  departments: Department[]
): number => {
  const isSharedCapacityRoom = room?.roomType === "field" || room?.roomType === "online";
  if (!isSharedCapacityRoom) {
    return getRoomCapacity(room);
  }

  const department = departments.find((item) => Number(item.id) === Number(departmentId));
  const configuredLimit = room?.roomType === "field"
    ? department?.field_slot_limit
    : department?.online_slot_limit;

  return configuredLimit == null
    ? DEFAULT_SHARED_SLOT_LIMIT
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

const isRoomTba = (roomId: string | null | undefined): boolean => roomId === "tba" || !roomId;

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

// ---------------------------------------------------------------------------
// Day/category rules — client mirror of RuleEngine::checkDayCategoryConstraint
// and RuleEngine::checkSectionOnlineLimit.
//
// These used to exist only server-side, so the placement modal reported
// "Placement is ready to be added" for placements the save then rejected with a
// 422. Keep this block in step with RuleEngine when the server rules change.
// ---------------------------------------------------------------------------

/** Mon–Fri. Non-NSTP field courses (PATHFIT and similar). */
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4];
/** Mon–Sat. Minor courses (GEC, GEE and similar). */
const WEEKDAY_AND_SATURDAY_INDEXES = [0, 1, 2, 3, 4, 5];
const SUNDAY_INDEX = 6;
/** Mirrors RuleEngine::checkSectionOnlineLimit. */
const SECTION_ONLINE_COURSE_LIMIT = 5;
const NSTP_KEYWORDS = ["NSTP", "ROTC", "CWTS", "LTS"];

const normalizeCourseCode = (courseCode: string): string =>
  courseCode.trim().replace(/\s+/g, " ").toUpperCase();

const normalizeCategoryName = (categoryName: string): string =>
  categoryName.trim().toLowerCase();

export const subjectHasCategory = (subject: Subject | undefined, categoryName: string): boolean =>
  (subject?.categories ?? []).some(
    (category) => normalizeCategoryName(String(category.name ?? "")) === normalizeCategoryName(categoryName)
  );

/**
 * Mirrors SchedulingPolicy::isNstpCourse. The server also treats a course
 * category of nstp/rotc/cwts/lts as NSTP, but the client narrows category to
 * "major" | "minor", so code and name keywords are the discriminator here.
 */
export const isNstpSubject = (subject: Subject | undefined): boolean => {
  if (!subject) return false;
  const code = (subject.code ?? "").toUpperCase();
  const name = (subject.name ?? "").toUpperCase();

  return NSTP_KEYWORDS.some((keyword) => code.includes(keyword) || name.includes(keyword));
};

/** Mirrors SchedulingPolicy::isFieldCourse. */
export const isFieldSubject = (
  subject: Subject | undefined,
  fieldCourseAssignmentEnabled: boolean,
  configuredFieldCourseCodes: Set<string>
): boolean => {
  if (!subject) return false;
  if (subjectHasCategory(subject, "Field")) return true;
  if (subject.roomTypeRequired === "field") return true;
  if (isNstpSubject(subject)) return true;
  if (!fieldCourseAssignmentEnabled) return false;

  return configuredFieldCourseCodes.has(normalizeCourseCode(subject.code ?? ""));
};

/** Mirrors SchedulingPolicy::isLaboratoryCourse. */
export const isLaboratorySubject = (subject: Subject | undefined): boolean => {
  if (!subject) return false;

  return subjectHasCategory(subject, "Laboratory")
    || Number(subject.labHours ?? 0) > 0
    || subject.roomTypeRequired === "laboratory";
};

/**
 * Room type an on-site meeting must use.
 *
 * Mirrors the `requiredRoomType` derivation in RuleEngine::checkRoomTypeMatch:
 * an explicit meeting type wins, and otherwise a course with a laboratory
 * component needs a laboratory room *regardless of what `room_type_required`
 * says*. The client used to read `roomTypeRequired` on its own, so an unsplit
 * lecture-plus-laboratory course was offered — and pre-assigned — a plain
 * classroom that the save then rejected.
 */
export const requiredRoomTypeForMeeting = (
  subject: Subject | undefined,
  meetingType?: ScheduleItem["meetingType"]
): RoomType | null => {
  if (meetingType) return meetingType;
  if (!subject) return null;
  if (isLaboratorySubject(subject)) return "laboratory";

  return subject.roomTypeRequired ?? null;
};

const isSundayOnlineOnlyEnabled = (
  departments: Department[],
  departmentId: number | null
): boolean => {
  const department = departments.find((item) => Number(item.id) === Number(departmentId));
  const configured = department?.sunday_online_only_enabled;

  // Server default is true when the column is null.
  return configured == null ? true : Boolean(configured);
};

/** Mirrors RuleEngine::checkDayCategoryConstraint. */
export const checkDayCategoryConstraint = (
  subject: Subject | undefined,
  dayIndex: number,
  mode: DeliveryMode,
  departmentId: number | null,
  departments: Department[],
  fieldCourseAssignmentEnabled: boolean,
  configuredFieldCourseCodes: Set<string>
): ConflictResult => {
  if (!subject) return null;

  // NSTP/ROTC/CWTS/LTS may use any day, Monday through Sunday.
  if (isNstpSubject(subject)) return null;

  if (isFieldSubject(subject, fieldCourseAssignmentEnabled, configuredFieldCourseCodes)) {
    return WEEKDAY_INDEXES.includes(dayIndex)
      ? null
      : {
          conflictType: "section",
          message: `Day restriction: ${subject.code || "Field courses"} must be scheduled Monday through Friday.`
        };
  }

  if (subject.category === "minor") {
    return WEEKDAY_AND_SATURDAY_INDEXES.includes(dayIndex)
      ? null
      : {
          conflictType: "section",
          message: `Day restriction: ${subject.code || "Minor courses"} (GEC, GEE and similar) must be scheduled Monday through Saturday.`
        };
  }

  // Major courses: any day Mon–Sat; Sunday requires online delivery.
  if (
    dayIndex === SUNDAY_INDEX
    && mode !== "online"
    && isSundayOnlineOnlyEnabled(departments, departmentId)
  ) {
    return {
      conflictType: "section",
      message: `Day restriction: ${subject.code || "Major courses"} scheduled on Sunday must use online delivery mode.`
    };
  }

  return null;
};

/** Mirrors RuleEngine::checkSectionOnlineLimit. */
export const checkSectionOnlineLimit = (
  schedules: ScheduleItem[],
  sectionId: string,
  excludeIds: string[]
): ConflictResult => {
  // An existing schedule that is already online is not adding a new online
  // course to the section.
  if (excludeIds.length > 0) {
    const alreadyOnline = schedules.some(
      (item) => excludeIds.includes(item.id) && item.mode === "online"
    );
    if (alreadyOnline) return null;
  }

  const onlineCourseIds = new Set(
    schedules
      .filter((item) =>
        String(item.sectionId) === String(sectionId)
        && item.mode === "online"
        && !excludeIds.includes(item.id)
      )
      .map((item) => String(item.courseId ?? item.subjectId ?? ""))
      .filter(Boolean)
  );

  return onlineCourseIds.size >= SECTION_ONLINE_COURSE_LIMIT
    ? {
        conflictType: "section",
        message: `Online limit: this section already has ${SECTION_ONLINE_COURSE_LIMIT} online courses, which is the maximum allowed.`
      }
    : null;
};

/**
 * Delivery mode implied by a room selection. checkConflict callers pass room ids
 * rather than a mode, and the scheduler represents virtual rooms with the
 * sentinel ids "online" and "field".
 */
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

  // Mirrors RuleEngine's part_time_faculty_availability: the meeting has to fit
  // inside a recorded window for that day. No window for the day - including the
  // case of no windows at all - is outside availability, so an unrecorded
  // part-timer shows as blocked here exactly as the server refuses them. The old
  // guess of "weekday mornings only" offered slots the server then rejected.
  const dayAvailabilities = (faculty.availabilities ?? []).filter(
    (a) => Number(a.day_index) === dayIndex
  );
  if (dayAvailabilities.length === 0) return true;

  const attemptStart = startSlot;
  const attemptEnd = startSlot + durationSlots;

  return !dayAvailabilities.some((window) => {
    const windowStart = timeToSlotUnclamped(window.start_time);
    const windowEnd = timeToSlotUnclamped(window.end_time);
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

  // Indexes built once. These lookups used to run inside the pair loop —
  // `subjects.find` twice per pair, `rooms.find` twice more via samePhysicalRoom,
  // and a full `schedules.filter` per shared-room pair — which made this the
  // most expensive computation in the module for a VPAA session holding every
  // department's schedules.
  const subjectsById = new Map(subjects.map((subject) => [String(subject.id), subject]));
  const resolvedRoomCache = new Map<string, Room | undefined>();
  const resolveRoomCached = (roomId: string): Room | undefined => {
    if (!resolvedRoomCache.has(roomId)) {
      resolvedRoomCache.set(roomId, resolveRoom(rooms, roomId));
    }

    return resolvedRoomCache.get(roomId);
  };
  // Equivalent to samePhysicalRoom: two ids share a room when their resolved
  // records match, falling back to the raw id when a record cannot be resolved.
  const physicalRoomKey = (roomId: string): string =>
    String(resolveRoomCached(roomId)?.id ?? roomId);
  const subjectFor = (schedule: ScheduleItem): Subject | undefined =>
    subjectsById.get(String(schedule.courseId ?? schedule.subjectId));

  const schedulesByRoomAndDepartment = new Map<string, ScheduleItem[]>();
  schedules.forEach((item) => {
    if (isRoomTba(item.roomId)) return;
    const key = `${physicalRoomKey(item.roomId)}::${Number(item.departmentId)}`;
    const bucket = schedulesByRoomAndDepartment.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      schedulesByRoomAndDepartment.set(key, [item]);
    }
  });

  // Build grid slot-occupancy index: [dayIndex][slotIndex]
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

        // Ensure unique pair key to run checks exactly once per pair
        const pairKey = s1.id < s2.id ? `${s1.id}-${s2.id}` : `${s2.id}-${s1.id}`;
        if (comparedPairs.has(pairKey)) continue;
        comparedPairs.add(pairKey);

        const sub2 = subjectFor(s2);

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
          !isRoomTba(s1.roomId)
          && !isRoomTba(s2.roomId)
          && s1.mode !== "online"
          && s2.mode !== "online"
          && physicalRoomKey(s1.roomId) === physicalRoomKey(s2.roomId)
        ) {
          const room = resolveRoomCached(s1.roomId);
          const isSharedField = room?.roomType === "field" || s1.roomId === "field" || s1.mode === "field" || s2.mode === "field";
          const isDifferentFieldDepartment = isSharedField
            && Number(s1.departmentId) !== Number(s2.departmentId);

          if (!isDifferentFieldDepartment) {
            const isSharedCapacityRoom = isSharedField;
            const sharedCapacity = getDepartmentRoomCapacity(room, s1.departmentId, departments);
            const sameRoomSchedules = isSharedCapacityRoom
              ? schedulesByRoomAndDepartment.get(`${physicalRoomKey(s1.roomId)}::${Number(s1.departmentId)}`) ?? []
              : schedules;
            // Each pair is evaluated once, at the first slot where they overlap.
            // Measuring concurrency across s1's whole span counted classes in
            // hours where these two do not actually overlap — a false positive.
            const overlapStart = Math.max(start, Math.max(0, Math.min(slotCount() - 1, s2.startSlot)));
            const overlapEnd = Math.min(end, Math.max(0, Math.min(slotCount(), s2.startSlot + s2.durationSlots)));
            const hasRoomConflict = !isSharedCapacityRoom || exceedsSharedRoomCapacity(
              sameRoomSchedules,
              day,
              overlapStart,
              overlapEnd,
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

  // Memoized so React.memo on GridCell (168 instances) and ScheduleCard is
  // not defeated by a new function identity on every parent render.
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
        message: `The schedule duration exceeds the grid operating hours (${closingTimeLabel()}).`
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
    const excludeIdList = excludeScheduleId
      ? (Array.isArray(excludeScheduleId) ? excludeScheduleId : [excludeScheduleId])
      : [];

    // Day/category rules (Mon–Fri field, Mon–Sat minor, Sunday-online majors).
    // Enforced server-side by RuleEngine::checkDayCategoryConstraint; without
    // them the modal reported a valid placement that the save then rejected.
    const dayCategoryConflict = checkDayCategoryConstraint(
      subject,
      dayIndex,
      deliveryMode,
      candidateDepartmentId,
      departments,
      fieldCourseAssignmentEnabled,
      configuredFieldCourseCodes
    );
    if (dayCategoryConflict) {
      return dayCategoryConflict;
    }

    if (deliveryMode === "online") {
      const onlineLimitConflict = checkSectionOnlineLimit(schedules, sectionId, excludeIdList);
      if (onlineLimitConflict) {
        return onlineLimitConflict;
      }
    }

    if (!isTbaPlacement && !isOnlinePlacement) {
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

      // Room-type parity with RuleEngine::checkRoomTypeMatch.
      //
      // The exemption below only applies to a split of a course that genuinely
      // has both lecture and laboratory hours: the two meetings need different
      // room types and checkConflict is not told which meeting it is validating,
      // so either physical room type has to be accepted. It used to apply to
      // every split of a major or minor course — which is every course — so
      // room-type validation was effectively disabled for all split schedules.
      const hasLectureAndLabComponents =
        Number(subject?.lectureHours ?? 0) > 0 && Number(subject?.labHours ?? 0) > 0;
      const isSplitWithMixedComponents = !!preferredPattern && hasLectureAndLabComponents;
      const requiredRoomType = requiredRoomTypeForMeeting(subject);

      if (!isSplitWithMixedComponents) {
        if (
          room?.roomType
          && requiredRoomType
          && room.roomType !== requiredRoomType
          && !(room.roomType === "field" && subjectRequiresField)
          // A course with no laboratory component may fall back to a
          // lecture-capable lab room, matching RuleEngine::canUseLaboratoryForLecture.
          && !(requiredRoomType === "lecture" && room.roomType === "laboratory")
        ) {
          return {
            conflictType: "room",
            message: requiredRoomType === "laboratory"
              ? `Room type mismatch: ${subject?.code ?? "This class"} has a laboratory component, so it must be scheduled in a laboratory room, but '${room.name}' is a '${room.roomType}' room.`
              : `Room type mismatch: ${subject?.code ?? "This class"} requires a '${requiredRoomType}' room, but '${room.name}' is a '${room.roomType}' room.`
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
        if (!isTbaPlacement && !isOnlinePlacement && !isRoomTba(s.roomId) && samePhysicalRoom(s.roomId, roomId, rooms)) {
          const room = resolveRoom(rooms, roomId);
          // Shared capacity is a property of the room, not of the course. Keying
          // it off the subject would apply the department FIELD limit to ordinary
          // lecture rooms whenever the course merely *may* use a field room.
          const isSharedField = room?.roomType === "field" || roomId === "field";
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
  }, [faculties, subjects, sections, schedules, rooms, departments, fieldCourseAssignmentEnabled, fieldCourseCodes]);

  const checkFacultyConflict = useCallback((facultyId: string, scheduleId: string): string | null => {
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
  }, [schedules, faculties]);

  const getDragOverConflict = useCallback((d: number, t: number): boolean => {
    // Every branch either assigns all of these or returns, so no placeholder
    // initial values are needed.
    let dur: number;
    let subjectId: string;
    let excludeId: string | undefined;
    let prefPattern: string | null;
    // Relocating a card keeps its room, so the preview can judge room-type and
    // room-capacity rules too. Passing "" skipped both, and the cell showed a
    // "Place" hint for a drop the modal then rejected on a room conflict.
    let roomId: string;

    if (draggedScheduleId) {
      const sched = schedules.find((s) => s.id === draggedScheduleId);
      if (!sched) return false;
      dur = sched.durationSlots;
      subjectId = sched.courseId ?? sched.subjectId ?? "";
      excludeId = sched.id;
      prefPattern = sched.preferredPattern ?? null;
      roomId = sched.roomId ?? "";
    } else if (dragSubjectId) {
      const sub = subjects.find((s) => String(s.id) === String(dragSubjectId));
      if (!sub) return false;
      dur = getSubjectTotalSlots(sub);
      subjectId = String(sub.id);
      excludeId = undefined;
      prefPattern = null;
      // A new placement has no room yet; the room is chosen in the modal.
      roomId = "";
    } else {
      return false;
    }

    return checkConflict(subjectId, selectedSectionId, null, roomId, d, t, dur, excludeId, prefPattern) !== null;
  }, [draggedScheduleId, dragSubjectId, schedules, subjects, selectedSectionId, checkConflict]);

  return { checkConflict, checkFacultyConflict, getDragOverConflict, conflictedMap };
};
