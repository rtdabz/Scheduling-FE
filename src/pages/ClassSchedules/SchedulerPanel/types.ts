import { getCourseSlotPlan } from "./courseSlotPlan";

export type CourseCategory = "major" | "minor";
export type SubjectCategory = CourseCategory; // Legacy alias
export type SemesterPeriod = "1st" | "2nd" | "summer";
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
  | "reassignment"
  | "finalized"
  | "rejected"
  | "revision";

/** Workflow stages in which instructor assignment may be changed. */
export const INSTRUCTOR_ASSIGNABLE_STATUSES: ScheduleStatus[] = [
  "approved",
  "faculty_assignment",
  "reassignment",
];

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

export interface Semester {
  id: number;
  academic_year: string;
  semester: SemesterPeriod;
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
  semester: SemesterPeriod;
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
  semester: SemesterPeriod;
  departmentId: number;
  programId?: number | null;
  /**
   * The curriculum this cohort follows. A department mid-transition runs an old
   * and a new curriculum at once, so this cannot be inferred from the
   * department — null means nobody has chosen yet and generation is blocked.
   */
  curriculumId?: number | null;
  curriculumName?: string | null;
  semesterId: number;
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
export type FacultyAdministrativePost = "dean" | "secretary" | "program_head" | "director" | "vpaa";

const ADMINISTRATIVE_POSTS: readonly FacultyAdministrativePost[] = ["dean", "secretary", "program_head", "director", "vpaa"];

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
  /** The account role; printed on the load sheet only when no designation is held. */
  administrativeRole?: FacultyAdministrativePost | null;
  /** Held designations as labels ("Director · Networking Dev't"), printed in section C of the load sheet. */
  designations?: string[];
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
  /** Units already assigned this semester, deduped so a split course counts once. */
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
  /** Set when another department lent this room for the semester: the only windows it may be used in. */
  grantWindows?: RoomGrantWindow[];
}

export interface RoomGrantWindow {
  day: string;
  /** HH:mm, 24-hour. */
  start_time: string;
  end_time: string;
}

export interface ScheduleItem {
  id: string;
  semesterId: number;
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
  /**
   * The instructor was assigned over their own conflict on purpose (double-booked
   * or outside availability). Shown as an override rather than a conflict.
   */
  facultyConflictOverride?: boolean;
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
  /** True only when every schedule row has completed the instructor handoff. */
  facultyAssignmentDone: boolean;
}

/** One department section offered in the shared schedule-action checklist. */
export interface SectionDoneCandidate {
  sectionId: string;
  sectionName: string;
  yearLevel: number;
  requiredSubjects: number;
  plottedSubjects: number;
  /** Schedule row ids affected by the checklist action for this section. */
  scheduleIds: number[];
  isReady: boolean;
  /** Why the section cannot be selected; empty when isReady. */
  blockedReason: string;
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

export interface ApiSemesterRecord {
  id: number;
  academic_year: string;
  semester: SemesterPeriod;
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
  semester: SemesterPeriod;
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
  semester: SemesterPeriod;
  department_id: number;
  program_id?: number | null;
  curriculum_id?: number | null;
  curriculum?: { id: number; name: string; code?: string } | null;
  semester_id: number;
  status?: "active" | "inactive";
  academic_semester?: ApiSemesterRecord | null;
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
  /** Up to three held designations, in their listed order. */
  designations?: { id: number; name: string; label?: string; parent?: { id: number; name: string } | null }[];
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
  grant_windows?: RoomGrantWindow[];
}

export interface ApiScheduleRecord {
  id: number | string;
  semester_id: number | string;
  department_id: number | string;
  course_id: number | string;
  subject_id?: number | string;
  section_id: number | string;
  room_id: number | string | null;
  faculty_id?: number | string | null;
  faculty_assignment_done?: boolean | number;
  faculty_conflict_override?: boolean | number;
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
