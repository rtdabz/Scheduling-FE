import { DAYS, slotToTimeStr } from "../constants";
import {
  configureTimeGrid,
  DAY_NAME_TO_INDEX,
  slotToTime24h,
  timeToSlot as timeStrToSlot,
} from "../../../../lib/timeGrid";
import type { TimeGridConfigInput } from "../../../../lib/timeGrid";
import type {
  ApiCourseRecord,
  ApiDepartmentRecord,
  ApiFacultyRecord,
  ApiRoomRecord,
  ApiScheduleRecord,
  ApiSectionRecord,
  ApiSubjectRecord,
  ApiTermRecord,
  Department,
  Faculty,
  Room,
  ScheduleItem,
  Section,
  Subject,
  Term,
  UserSummary
} from "../types";
import { normalizeAdministrativePost } from "../types";

export interface SchedulerCacheData {
  rooms: Room[];
  sections: Section[];
  subjects: Subject[];
  faculties: Faculty[];
  activeTerm: Term | null;
  departments: Department[];
  users: UserSummary[];
  schedules: ScheduleItem[];
  fieldCourseAssignmentEnabled: boolean;
  fieldCourseCodes: string[];
}

export interface InitialDataResponse {
  active_term: ApiTermRecord | null;
  rooms: ApiRoomRecord[];
  courses?: ApiCourseRecord[];
  /** Legacy alias; /initial-data no longer sends it. Kept for cached payloads. */
  subjects?: ApiSubjectRecord[];
  faculties: ApiFacultyRecord[];
  sections: ApiSectionRecord[];
  schedules: ApiScheduleRecord[];
  departments: ApiDepartmentRecord[];
  users: UserSummary[];
  field_course_assignment_enabled?: boolean;
  field_course_codes?: string[];
  resource_slot_limits?: { online: number; field: number } | null;
  /** Grid window from schedule_settings; the client used to hardcode it. */
  time_grid?: TimeGridConfigInput | null;
}

/** Re-exported so existing importers keep working; canonical in lib/timeGrid. */
export { slotToTime24h, timeStrToSlot };
export const dayMapToIndex = DAY_NAME_TO_INDEX;

export const normalizeYearLevel = (yearLevel: string | number): Section["yearLevel"] => {
  const year = Number(yearLevel);
  return year === 1 || year === 2 || year === 3 || year === 4 ? year : 1;
};

export const toNumber = (value: number | string | null | undefined): number => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

export const hasUsableSchedulerCache = (data: SchedulerCacheData | undefined): data is SchedulerCacheData => {
  return Boolean(
    data
      && Array.isArray(data.rooms)
      && Array.isArray(data.sections)
      && Array.isArray(data.subjects)
      && Array.isArray(data.faculties)
      && Array.isArray(data.departments)
      && Array.isArray(data.users)
      && Array.isArray(data.schedules)
      && typeof data.fieldCourseAssignmentEnabled === "boolean"
      && Array.isArray(data.fieldCourseCodes)
  );
};

/**
 * A numeric field that may legitimately be 0, so absence and zero stay distinct.
 * Non-numeric junk reads as absent rather than NaN.
 */
const numberOrUndefined = (value: number | string | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Days already reported as unrecognized, so a malformed payload warns once per
 * value instead of once per schedule row.
 */
const warnedUnknownDays = new Set<string>();

/**
 * Client mirror of `SchedulingPolicy::isCasServiceCourse`. A GEC subject is a
 * service course taught by the college that owns it, which is what makes its
 * owner the teaching department below.
 */
const isGecServiceCourse = (course: ApiCourseRecord | ApiSubjectRecord): boolean => (
  (course.course_code ?? course.subject_code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").startsWith("GEC")
  || (course.categories ?? []).some((category) => category.name.toLowerCase() === "gec")
);

export const mapApiScheduleToItem = (item: ApiScheduleRecord): ScheduleItem => {
  // An unrecognized day used to become Monday silently, which moved a class to a
  // day nobody chose. It still has to resolve to a grid row, but it says so.
  const rawDay = String(item.day ?? "");
  const resolvedDayIndex = dayMapToIndex[rawDay] ?? dayMapToIndex[rawDay.trim()];
  const dayIndex = resolvedDayIndex ?? 0;
  if (resolvedDayIndex === undefined && !warnedUnknownDays.has(rawDay)) {
    warnedUnknownDays.add(rawDay);
    console.warn(`[scheduler] Unrecognized schedule day "${rawDay}"; falling back to ${DAYS[0]}.`);
  }
  const startSlot = timeStrToSlot(item.start_time);
  const endSlot = timeStrToSlot(item.end_time);
  const durationSlots = endSlot - startSlot;
  const courseId = item.course_id?.toString() ?? item.subject_id?.toString() ?? "";
  const sectionId = item.section_id?.toString() ?? "";
  const fallbackId = [
    item.term_id ?? "term",
    sectionId || "section",
    courseId || "course",
    item.day ?? "day",
    item.start_time ?? "start",
    item.end_time ?? "end",
    item.meeting_type ?? "meeting",
    item.meeting_index ?? "index",
  ].join(":");

  let roomName = "";
  if (item.room) {
    if (item.room.room_code === "ONLINE") roomName = "Online";
    else if (item.room.room_code === "FIELD") roomName = "Field";
    else roomName = item.room.room_code ?? "";
  }
  if (!roomName && item.mode === "online") roomName = "Online";
  if (!roomName && item.mode === "field") roomName = "Field";
  if (!roomName && item.mode === "on-site" && item.room_id == null) roomName = "Room TBA";

  let roomIdStr = item.room_id == null ? "" : item.room_id.toString();
  if (item.room?.room_code === "ONLINE" || (item.room_id == null && item.mode === "online")) roomIdStr = "online";
  else if (item.room?.room_code === "FIELD") roomIdStr = "field";
  else if (item.room_id == null && item.mode === "on-site") roomIdStr = "tba";

  const courseCode = item.course?.course_code ?? item.subject?.course_code ?? item.subject?.subject_code ?? "";
  const courseName = item.course?.course_name ?? item.subject?.course_name ?? item.subject?.subject_name ?? "";
  const courseType = item.course?.course_category ?? item.subject?.course_category ?? item.subject?.subject_category ?? "major";

  return {
    id: item.id?.toString() ?? fallbackId,
    termId: Number(item.term_id),
    departmentId: Number(item.department_id),
    courseId,
    subjectId: courseId,
    courseCode,
    subjectCode: courseCode,
    courseName,
    subjectName: courseName,
    courseType,
    subjectType: courseType,
    lectureUnits: toNumber(item.course?.lecture_hours ?? item.subject?.lecture_hours),
    laboratoryUnits: toNumber(item.course?.lab_hours ?? item.subject?.lab_hours),
    totalUnits: toNumber(item.course?.units ?? item.subject?.units),
    sectionName: item.section?.section_name ?? "",
    roomName,
    // Long names throughout: DAYS is FULL_DAY_NAMES, so a short fallback would
    // put a foreign value into a long-name domain.
    day: DAYS[dayIndex] ?? DAYS[0],
    startTime: slotToTimeStr(startSlot),
    endTime: slotToTimeStr(endSlot),
    mode: item.mode ?? "on-site",
    // Some schedule endpoints return the eager-loaded faculty relation while
    // omitting/normalizing the scalar foreign key. Prefer the FK, but fall back
    // to the relation so a successful assignment is visible immediately.
    facultyName: item.faculty
      ? `${item.faculty.first_name ?? ""} ${item.faculty.last_name ?? ""}`.trim()
      : null,
    facultyId: (item.faculty_id ?? item.faculty?.id) != null
      ? String(item.faculty_id ?? item.faculty?.id)
      : null,
    facultyAssignmentDone: Boolean(item.faculty_assignment_done),
    status: item.status,
    dayIndex,
    startSlot,
    durationSlots,
    sectionId,
    roomId: roomIdStr,
    isHybrid: !!item.is_hybrid,
    preferredPattern: item.preferred_pattern ?? null,
    splitGroupId: item.split_group_id ?? null,
    meetingType: item.meeting_type ?? null,
    meetingIndex: item.meeting_index ?? 1
  };
};

/**
 * Keep the current section when it belongs to the saved result; otherwise move
 * the timetable to the first generated section so a successful save is visible.
 */
export const generatedScheduleSectionId = (
  currentSectionId: string,
  schedules: ScheduleItem[],
): string => {
  const generatedSectionIds = new Set(
    schedules.map((schedule) => schedule.sectionId).filter(Boolean),
  );

  if (generatedSectionIds.has(currentSectionId)) {
    return currentSectionId;
  }

  return schedules.find((schedule) => Boolean(schedule.sectionId))?.sectionId
    ?? currentSectionId;
};

/**
 * Single mapper for the `/initial-data` payload.
 *
 * Both the mount effect and refreshData() go through this. They previously kept
 * hand-copied mappers that had drifted: refreshData dropped faculty
 * `availabilities` (silently downgrading part-time conflict detection to the
 * hardcoded fallback in useConflict) and used a looser section filter that
 * admitted sections from other academic years.
 */
export const mapInitialData = (
  initialData: InitialDataResponse,
  options: { isVpaa: boolean; userDepartmentId?: number | null },
): SchedulerCacheData => {
  // Applied before anything is mapped: every slot conversion below reads it.
  configureTimeGrid(initialData.time_grid);

  let apiRooms = initialData.rooms;
  if (!options.isVpaa && options.userDepartmentId) {
    apiRooms = apiRooms.filter(
      (r) => r.department_id === null || Number(r.department_id) === Number(options.userDepartmentId)
    );
  }

  // maxConcurrentClasses stays the room's own column. It used to be overwritten
  // with the *requesting* department's slot limit, which then served as the
  // fallback capacity when judging another department's use of the same shared
  // room (audit finding #39). Per-department limits live on `departments` and are
  // resolved per check in useConflict.
  const mappedRooms = apiRooms.map((r): Room => ({
    id: r.id.toString(),
    name: r.room_code,
    departmentId: r.department_id,
    roomType: r.room_type,
    status: r.status,
    maxConcurrentClasses: Number(r.max_concurrent_classes ?? 1) || 1
  }));

  const rawCourses = initialData.courses ?? initialData.subjects ?? [];
  const mappedSubjects = rawCourses.map((s): Subject => {
    // A secretary can delegate a non-major to another college, and that override
    // decides who teaches it. With no override a GEC subject is taught by the
    // college that offers it, and anything else — a major, or a shared minor such
    // as PATH FIT — carries no teaching college: majors are held to their own
    // department and program instead, and a shared minor is open to every
    // department by design.
    const delegatedTo = s.teaching_department_id ?? null;
    const servesOwnCollege = delegatedTo === null && isGecServiceCourse(s) && s.department_id !== null;
    // Whichever college the two branches above landed on, so the labels cannot
    // drift from the id the eligibility check reads.
    const teachingDepartment = delegatedTo !== null ? s.teaching_department : (servesOwnCollege ? s.department : null);

    return {
      id: s.id.toString(),
      code: s.course_code ?? s.subject_code ?? "",
      name: s.course_name ?? s.subject_name ?? "",
      units: toNumber(s.units),
      lectureHours: toNumber(s.lecture_hours),
      labHours: toNumber(s.lab_hours),
      category: ((s.course_category ?? s.subject_category) as string) === "major" ? "major" : "minor",
      semester: s.semester,
      departmentId: s.department_id ?? null,
      programId: s.program_id ?? null,
      teachingProgramId: s.teaching_program_id ?? null,
      programCode: s.program?.code ?? null,
      teachingDepartmentId: delegatedTo ?? (servesOwnCollege ? s.department_id : null),
      teachingDepartmentCode: teachingDepartment?.department_code,
      teachingDepartmentName: teachingDepartment?.department_name,
      categories: s.categories ?? [],
      yearLevel: normalizeYearLevel(s.year_level),
      roomTypeRequired: s.room_type_required,
      status: s.status ?? "active"
    };
  });

  const mappedFaculties = initialData.faculties.map((f): Faculty => ({
    id: f.id.toString(),
    name: `${f.first_name} ${f.last_name}`,
    profilePicture: f.profile_picture ?? null,
    employmentType: f.employment_type,
    administrativeRole: normalizeAdministrativePost(f.administrative_role),
    departmentId: f.department_id,
    departmentCode: f.department?.department_code,
    departmentName: f.department?.department_name,
    programId: f.program_id ?? null,
    programCode: f.program?.code ?? null,
    maxUnits: f.max_units ? Number(f.max_units) : undefined,
    // Zero is a real allowance, so these coerce rather than falling back:
    // treating 0 as "unknown" would make the Auto-Assign labels invent room the
    // instructor does not have.
    deloadUnits: numberOrUndefined(f.deload_units),
    overloadUnits: numberOrUndefined(f.overload_units),
    probonoUnits: numberOrUndefined(f.probono_units),
    assignedUnits: numberOrUndefined(f.assigned_units),
    requiredUnits: numberOrUndefined(f.required_units),
    unitCeiling: numberOrUndefined(f.unit_ceiling),
    status: f.status,
    availabilities: f.availabilities
  }));

  const term = initialData.active_term;

  // Sections must match the active term by id, or by semester *and* academic
  // year. Matching on semester alone leaks sections from other academic years.
  const filteredSections = initialData.sections
    .filter((s) => {
      if (!term) return true;
      if (s.term_id && Number(s.term_id) === Number(term.id)) return true;
      return !!(term.semester && s.semester === term.semester && s.term?.academic_year === term.academic_year);
    })
    .map((s): Section => ({
      id: s.id.toString(),
      name: s.section_name,
      yearLevel: normalizeYearLevel(s.year_level),
      semester: s.semester,
      departmentId: s.department_id,
      termId: Number(s.term_id),
      status: s.status ?? "active"
    }));

  const filteredSchedules = initialData.schedules
    .filter((item) => !term || Number(item.term_id) === Number(term.id))
    .map(mapApiScheduleToItem);

  return {
    rooms: mappedRooms,
    subjects: mappedSubjects,
    faculties: mappedFaculties,
    activeTerm: term,
    departments: initialData.departments,
    users: initialData.users,
    sections: filteredSections,
    schedules: filteredSchedules,
    fieldCourseAssignmentEnabled: !!initialData.field_course_assignment_enabled,
    fieldCourseCodes: initialData.field_course_codes ?? [],
  };
};
