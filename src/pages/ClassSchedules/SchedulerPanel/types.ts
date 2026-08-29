import { getCourseSlotPlan } from "./courseSlotPlan";

export type CourseCategory = "major" | "minor";
export type SubjectCategory = CourseCategory; // Legacy alias
export type Semester = "1st" | "2nd" | "summer";
export type YearLevel = 1 | 2 | 3 | 4;
export type RoomType = "lecture" | "laboratory" | "field" | "online";
export type RoomStatus = "available" | "not available";
export type DeliveryMode = "on-site" | "online" | "field";
export type WithdrawalStage = "dean_review" | "vpaa_review" | "vpaa_approved";
export type ScheduleStatus =
  | "draft"
  | "completed"
  | "submitted"
  | "approved_by_dean"
  | "conditionally_approved"
  | "rejected_by_dean"
  | "approved"
  | "faculty_assignment"
  | "finalized"
  | "rejected"
  | "revision";

export interface Department {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
  online_slot_limit?: number;
  field_slot_limit?: number;
  /** Defaults to true server-side when null; mirrors RuleEngine's Sunday rule. */
  sunday_online_only_enabled?: boolean | number | null;
}

export interface Term {
  id: number;
  academic_year: string;
  semester: Semester;
  is_active: boolean | number;
  is_enabled?: boolean | number;
}

export interface UserSummary {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  department_id?: number | null;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  units: number;
  lectureHours: number;
  labHours: number;
  category: CourseCategory;
  semester: Semester;
  departmentId: number | null;
  /**
   * College whose instructors may teach this course, mirroring the rule engine's
   * `SchedulingPolicy::assignedTeachingDepartmentId`. A secretary may delegate a
   * non-major to another college — IT owns GEC 101, CAS teaches it — and that
   * override wins. With no override the owner teaches its own GEC subjects, so
   * this is null for a major (own-department and program rules cover those) and
   * for a shared minor open to every department.
   */
  teachingDepartmentId?: number | null;
  teachingDepartmentCode?: string;
  teachingDepartmentName?: string;
  teachingProgramId?: number | null;
  /**
   * Program (major) that owns this course. When set on a major, only instructors
   * of that program may be assigned to it.
   */
  programId?: number | null;
  programCode?: string | null;
  categories?: { id: number | string; name: string; description?: string | null }[];
  yearLevel: YearLevel;
  roomTypeRequired: RoomType;
  status: "active" | "inactive";
}
export type Subject = Course; // Legacy alias

/**
 * Slots a single meeting covering the whole course occupies — the server's
 * `units * 2`. For the lecture/laboratory split convention use
 * `getCourseSlotPlan` from ./courseSlotPlan; conflating the two was audit
 * finding #19.
 */
export const getSubjectTotalSlots = (subject?: { lectureHours?: number; labHours?: number; units?: number } | null): number =>
  getCourseSlotPlan(subject).singleBlockSlots;

export interface Section {
  id: string;
  name: string;
  yearLevel: YearLevel;
  semester: Semester;
  departmentId: number;
  termId: number;
  status: "active" | "inactive";
}

export interface FacultyAvailability {
  id: number;
  faculty_id: number;
  day_index: number;
  start_time: string;
  end_time: string;
}

/**
 * Administrative post a faculty profile holds, mirrored from its linked user
 * account by UserFacultyProfileService. Null for a plain instructor.
 */
export type FacultyAdministrativePost = "dean" | "secretary" | "program_head" | "vpaa";

const ADMINISTRATIVE_POSTS: readonly FacultyAdministrativePost[] = ["dean", "secretary", "program_head", "vpaa"];

/** Narrows the raw `administrative_role` column, which is a free string server-side. */
export const normalizeAdministrativePost = (
  value: string | null | undefined,
): FacultyAdministrativePost | null => {
  const post = (value ?? "").toLowerCase().trim();
  return ADMINISTRATIVE_POSTS.find((known) => known === post) ?? null;
};

export interface Faculty {
  id: string;
  name: string;
  profilePicture?: string | null;
  employmentType?: "full-time" | "part-time";
  /** Printed as designation 1 on the Individual Faculty Load Sheet. */
  administrativeRole?: FacultyAdministrativePost | null;
  departmentId?: number;
  departmentCode?: string;
  departmentName?: string;
  /** Program (major) the instructor belongs to, when recorded. */
  programId?: number | null;
  programCode?: string | null;
  maxUnits?: number;
  /** Units subtracted from maxUnits by an administrative role. */
  deloadUnits?: number;
  /** Allowance the instructor may teach past their Basic Load. */
  overloadUnits?: number;
  /** Further allowance past the overload one, taught unpaid. */
  probonoUnits?: number;
  /** Units already assigned this term, deduped so a split course counts once. */
  assignedUnits?: number;
  /** Basic Load as the server computes it: maxUnits - deloadUnits. */
  requiredUnits?: number;
  /** Basic Load plus both allowances. */
  unitCeiling?: number;
  status?: "active" | "inactive";
  availabilities?: FacultyAvailability[];
}

export interface Room {
  id: string;
  name: string;
  departmentId: number | null;
  roomType: RoomType;
  status: RoomStatus;
  maxConcurrentClasses?: number;
}

export interface ScheduleItem {
  id: string;
  termId: number;
  departmentId: number;
  courseId: string;
  subjectId?: string; // Legacy alias
  courseCode: string;
  subjectCode?: string; // Legacy alias
  courseName: string;
  subjectName?: string; // Legacy alias
  courseType: CourseCategory;
  subjectType?: CourseCategory; // Legacy alias
  lectureUnits: number;
  laboratoryUnits: number;
  totalUnits: number;
  sectionName: string;
  roomName: string;
  day: string;
  startTime: string;
  endTime: string;
  mode: DeliveryMode;
  facultyName: string | null;
  facultyId: string | null;
  facultyAssignmentDone?: boolean;
  status: ScheduleStatus;
  dayIndex: number;
  startSlot: number;
  durationSlots: number;
  sectionId: string;
  roomId: string;
  isHybrid?: boolean;
  preferredPattern?: string | null;
  splitGroupId?: string | null;
  meetingType?: "lecture" | "laboratory" | null;
  meetingIndex?: number;
}

export interface DepartmentSectionProgress {
  sectionId: string;
  sectionName: string;
  yearLevel: number;
  requiredCourses: number;
  requiredSubjects?: number;
  plottedCourses: number;
  plottedSubjects?: number;
  status: ScheduleItem["status"];
  isDone: boolean;
  isSelected: boolean;
  /** Meeting blocks in this section that currently have an instructor. */
  assignedInstructorBlocks: number;
}

export interface DropContext {
  courseId: string;
  subjectId?: string;
  dayIndex: number;
  startSlot: number;
  isRescheduling: boolean;
  scheduleId?: string;
}

export interface FacultyAssignmentPopupState {
  scheduleId: string;
  facultyId: string;
}

export interface ConflictInfo {
  dayIndex: number;
  startSlot: number;
  durationSlots: number;
  message: string;
}

export interface ApiDepartmentRecord {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
  online_slot_limit?: number;
  field_slot_limit?: number;
  sunday_online_only_enabled?: boolean | number | null;
}

export interface ApiTermRecord {
  id: number;
  academic_year: string;
  semester: Semester;
  is_active: boolean | number;
  is_enabled?: boolean | number;
}

export interface ApiCourseRecord {
  id: number | string;
  course_code: string;
  subject_code?: string;
  course_name: string;
  subject_name?: string;
  units: number;
  lecture_hours?: number | null;
  lab_hours?: number | null;
  course_category: CourseCategory;
  subject_category?: CourseCategory;
  semester: Semester;
  department_id: number | null;
  /** Eager-loaded owner, used to label the college that teaches a GEC subject. */
  department?: {
    department_code?: string;
    department_name?: string;
  } | null;
  /**
   * College another one delegated this course to, when it is not the owner.
   * Null on the common course — see `Course.teachingDepartmentId` for the
   * fallback the mapper applies then.
   */
  teaching_department_id?: number | null;
  teaching_department?: {
    department_code?: string;
    department_name?: string;
  } | null;
  teaching_program_id?: number | null;
  program_id?: number | null;
  program?: {
    id?: number | string;
    code?: string;
    name?: string;
  } | null;
  categories?: { id: number | string; name: string; description?: string | null }[];
  year_level: string | number;
  room_type_required: RoomType;
  status?: "active" | "inactive";
}
export type ApiSubjectRecord = ApiCourseRecord; // Legacy alias

export interface ApiSectionRecord {
  id: number | string;
  section_name: string;
  year_level: string | number;
  semester: Semester;
  department_id: number;
  term_id: number;
  status?: "active" | "inactive";
  term?: ApiTermRecord | null;
}

export interface ApiFacultyRecord {
  id: number | string;
  first_name: string;
  last_name: string;
  employment_type?: "full-time" | "part-time";
  administrative_role?: FacultyAdministrativePost | string | null;
  max_units?: number | string | null;
  // The load fields /initial-data adds via FacultyLoadService::get(); raw
  // columns arrive as strings from some drivers, hence the union.
  deload_units?: number | string | null;
  overload_units?: number | string | null;
  probono_units?: number | string | null;
  assigned_units?: number | string | null;
  required_units?: number | string | null;
  unit_ceiling?: number | string | null;
  department_id?: number;
  program_id?: number | null;
  program?: {
    id?: number | string;
    code?: string;
    name?: string;
  } | null;
  status?: "active" | "inactive";
  profile_picture?: string | null;
  department?: {
    department_code?: string;
    department_name?: string;
  } | null;
  availabilities?: FacultyAvailability[];
}

export interface ApiRoomRecord {
  id: number | string;
  room_code: string;
  building?: string | null;
  room_type: RoomType;
  allow_lecture_usage?: boolean;
  status: RoomStatus;
  department_id: number | null;
  max_concurrent_classes?: number | string | null;
}

export interface ApiScheduleRecord {
  id: number | string;
  term_id: number | string;
  department_id: number | string;
  course_id: number | string;
  subject_id?: number | string;
  section_id: number | string;
  room_id: number | string | null;
  faculty_id?: number | string | null;
  faculty_assignment_done?: boolean | number;
  day: string;
  start_time: string;
  end_time: string;
  mode?: DeliveryMode;
  status: ScheduleStatus;
  is_hybrid?: boolean | number;
  preferred_pattern?: string | null;
  split_group_id?: string | null;
  meeting_type?: "lecture" | "laboratory" | null;
  meeting_index?: number;
  course?: {
    course_code?: string;
    subject_code?: string;
    course_name?: string;
    subject_name?: string;
    course_category?: CourseCategory;
    subject_category?: CourseCategory;
    lecture_hours?: number | string | null;
    lab_hours?: number | string | null;
    units?: number | string | null;
    room_type_required?: RoomType;
    categories?: { id: number | string; name: string; description?: string | null }[];
  } | null;
  subject?: {
    course_code?: string;
    subject_code?: string;
    course_name?: string;
    subject_name?: string;
    course_category?: CourseCategory;
    subject_category?: CourseCategory;
    lecture_hours?: number | string | null;
    lab_hours?: number | string | null;
    units?: number | string | null;
    room_type_required?: RoomType;
    categories?: { id: number | string; name: string; description?: string | null }[];
  } | null;
  section?: {
    section_name?: string;
  } | null;
  faculty?: {
    id?: number | string;
    first_name?: string;
    last_name?: string;
  } | null;
  room?: {
    room_code?: string;
    building?: string | null;
  } | null;
}

export interface ApiViolation {
  message?: string;
}
