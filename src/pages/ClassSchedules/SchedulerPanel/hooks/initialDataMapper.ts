import { heldDesignation } from "../../../../lib/designations";
import { isRevisionStatus, isSubmissionStatus } from "../../../../lib/submissionStatus";
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
  ApiSemesterRecord,
  Department,
  Faculty,
  Room,
  ScheduleItem,
  Section,
  Subject,
  Semester,
  UserSummary
} from "../types";
import { normalizeAdministrativePost } from "../types";

export interface SchedulerCacheData {
  rooms: Room[];
  sections: Section[];
  subjects: Subject[];
  faculties: Faculty[];
  activeSemester: Semester | null;
  departments: Department[];
  users: UserSummary[];
  schedules: ScheduleItem[];
  fieldCourseAssignmentEnabled: boolean;
  fieldCourseCodes: string[];
  schedulingReady: boolean;
  canEditProgramIds?: number[] | null;
  hasDean: boolean;
  schedulesTruncated?: boolean;
}

export interface InitialDataResponse {
  active_semester: ApiSemesterRecord | null;
  rooms: ApiRoomRecord[];
  courses?: ApiCourseRecord[];
  subjects?: ApiSubjectRecord[];
  faculties: ApiFacultyRecord[];
  sections: ApiSectionRecord[];
  schedules: ApiScheduleRecord[];
  schedules_truncated?: boolean;
  departments: ApiDepartmentRecord[];
  scheduling_ready?: boolean;
  can_edit_program_ids?: number[];
  has_dean?: boolean;
  users: UserSummary[];
  field_course_assignment_enabled?: boolean;
  field_course_codes?: string[];
  resource_slot_limits?: { online: number; field: number } | null;
  time_grid?: TimeGridConfigInput | null;
}

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

const numberOrUndefined = (value: number | string | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const warnedUnknownDays = new Set<string>();

const isGecServiceCourse = (course: ApiCourseRecord | ApiSubjectRecord): boolean => (
  (course.course_code ?? course.subject_code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").startsWith("GEC")
  || (course.categories ?? []).some((category) => category.name.toLowerCase() === "gec")
);

export const mapApiScheduleToItem = (item: ApiScheduleRecord): ScheduleItem => {
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
    item.semester_id ?? "semester",
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
    semesterId: Number(item.semester_id),
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
    programCode: (item.section?.program ?? item.program)?.code ?? null,
    roomName,
    day: DAYS[dayIndex] ?? DAYS[0],
    startTime: slotToTimeStr(startSlot),
    endTime: slotToTimeStr(endSlot),
    mode: item.mode ?? "on-site",
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

export const mapApiCourse = (s: ApiCourseRecord): Subject => {
  const delegatedTo = s.teaching_department_id ?? null;
  const servesOwnCollege = delegatedTo === null && isGecServiceCourse(s) && s.department_id !== null;
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
    delegatedOnly: Boolean(s.delegated_only),
    programCode: s.program?.code ?? null,
    teachingDepartmentId: delegatedTo ?? (servesOwnCollege ? s.department_id : null),
    teachingDepartmentCode: teachingDepartment?.department_code,
    teachingDepartmentName: teachingDepartment?.department_name,
    categories: s.categories ?? [],
    yearLevel: normalizeYearLevel(s.year_level),
    roomTypeRequired: s.room_type_required,
    status: s.status ?? "active"
  };
};

export const mapApiFaculty = (f: InitialDataResponse["faculties"][number]): Faculty => ({
  id: f.id.toString(),
  name: `${f.first_name} ${f.last_name}`,
  firstName: f.first_name,
  middleName: f.middle_name ?? null,
  lastName: f.last_name,
  suffix: f.suffix ?? null,
  profilePicture: f.profile_picture ?? null,
  employmentType: f.employment_type,
  administrativeRole: normalizeAdministrativePost(f.administrative_role),
  designations: (f.designations ?? []).map(heldDesignation),
  departmentId: f.department_id,
  departmentCode: f.department?.department_code,
  departmentName: f.department?.department_name,
  programId: f.program_id ?? null,
  programCode: f.program?.code ?? null,
  maxUnits: numberOrUndefined(f.max_units),
  deloadUnits: numberOrUndefined(f.deload_units),
  overloadUnits: numberOrUndefined(f.overload_units),
  assignedUnits: numberOrUndefined(f.assigned_units),
  requiredUnits: numberOrUndefined(f.required_units),
  unitCeiling: numberOrUndefined(f.unit_ceiling),
  status: f.status,
  availabilities: f.availabilities
});

export const mapApiSections = (
  sections: ApiSectionRecord[],
  semester: ApiSemesterRecord | null,
): Section[] =>
  sections
    .filter((s) => {
      if (!semester) return true;
      if (s.semester_id && Number(s.semester_id) === Number(semester.id)) return true;
      return !!(semester.semester && s.semester === semester.semester && s.academic_semester?.academic_year === semester.academic_year);
    })
    .map((s): Section => ({
      id: s.id.toString(),
      name: s.section_name,
      yearLevel: normalizeYearLevel(s.year_level),
      semester: s.semester,
      departmentId: s.department_id,
      programId: s.program_id == null ? null : Number(s.program_id),
      programCode: s.program?.code ?? null,
      programName: s.program?.name ?? null,
      programMajor: s.program?.major ?? null,
      curriculumId: s.curriculum_id == null ? null : Number(s.curriculum_id),
      curriculumName: s.curriculum?.name ?? null,
      semesterId: Number(s.semester_id),
      status: s.status ?? "active",
      submissionStatus: isSubmissionStatus(s.submission_status) ? s.submission_status : "draft",
      revisionStatus: isRevisionStatus(s.revision_status) ? s.revision_status : "initial",
    }));

export const mapInitialData = (
  initialData: InitialDataResponse,
  options: { isVpaa: boolean; userDepartmentId?: number | null },
): SchedulerCacheData => {
  configureTimeGrid(initialData.time_grid);

  let apiRooms = initialData.rooms;
  if (!options.isVpaa && options.userDepartmentId) {
    apiRooms = apiRooms.filter(
      (r) => r.department_id === null
        || Number(r.department_id) === Number(options.userDepartmentId)
        || (r.grant_windows?.length ?? 0) > 0
    );
  }
  apiRooms = [...apiRooms].sort(
    (a, b) => Number((a.grant_windows?.length ?? 0) > 0) - Number((b.grant_windows?.length ?? 0) > 0)
  );

  const mappedRooms = apiRooms.map((r): Room => ({
    id: r.id.toString(),
    name: r.room_code,
    building: r.building,
    departmentId: r.department_id,
    roomType: r.room_type,
    status: r.status,
    ...(r.allow_lecture_usage ? { allowLectureUsage: true } : {}),
    ...(r.grant_windows?.length ? { grantWindows: r.grant_windows } : {}),
  }));

  const rawCourses = initialData.courses ?? initialData.subjects ?? [];
  const mappedSubjects = rawCourses.map(mapApiCourse);

  const mappedFaculties = initialData.faculties.map(mapApiFaculty);

  const semester = initialData.active_semester;
  const filteredSections = mapApiSections(initialData.sections, semester);

  const filteredSchedules = initialData.schedules
    .filter((item) => !semester || Number(item.semester_id) === Number(semester.id))
    .map(mapApiScheduleToItem);

  return {
    rooms: mappedRooms,
    subjects: mappedSubjects,
    faculties: mappedFaculties,
    activeSemester: semester,
    departments: initialData.departments,
    users: initialData.users,
    sections: filteredSections,
    schedules: filteredSchedules,
    fieldCourseAssignmentEnabled: !!initialData.field_course_assignment_enabled,
    fieldCourseCodes: initialData.field_course_codes ?? [],
    schedulingReady: initialData.scheduling_ready !== false,
    canEditProgramIds: initialData.can_edit_program_ids?.map(Number) ?? null,
    hasDean: initialData.has_dean !== false,
    schedulesTruncated: initialData.schedules_truncated === true,
  };
};
