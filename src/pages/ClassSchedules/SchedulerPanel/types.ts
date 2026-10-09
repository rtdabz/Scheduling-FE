import { getCourseSlotPlan } from "./courseSlotPlan";
import type { RevisionStatus, SubmissionStatus } from "../../../lib/submissionStatus";

export type CourseCategory = "major" | "minor";
export type SubjectCategory = CourseCategory;
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
  sunday_online_only_enabled?: boolean | number | null;
  scheduling_profile?: 'standard' | 'laboratory_enabled';
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
  program_id?: number | null;
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
  teachingDepartmentId?: number | null;
  teachingDepartmentCode?: string;
  teachingDepartmentName?: string;
  teachingProgramId?: number | null;
  delegatedOnly?: boolean;
  programId?: number | null;
  programCode?: string | null;
  categories?: { id: number | string; name: string; description?: string | null }[];
  yearLevel: YearLevel;
  roomTypeRequired: RoomType;
  status: "active" | "inactive";
}
export type Subject = Course;

export const getSubjectTotalSlots = (subject?: { lectureHours?: number; labHours?: number; units?: number } | null): number =>
  getCourseSlotPlan(subject).singleBlockSlots;

export interface Section {
  id: string;
  name: string;
  yearLevel: YearLevel;
  semester: SemesterPeriod;
  departmentId: number;
  programId?: number | null;
  programCode?: string | null;
  programName?: string | null;
  programMajor?: string | null;
  curriculumId?: number | null;
  curriculumName?: string | null;
  semesterId: number;
  status: "active" | "inactive";
  submissionStatus?: SubmissionStatus;
  revisionStatus?: RevisionStatus;
}

export interface FacultyAvailability {
  id: number;
  faculty_id: number;
  day_index: number;
  start_time: string;
  end_time: string;
}

export type FacultyAdministrativePost = "dean" | "secretary" | "program_head" | "vpaa";

const ADMINISTRATIVE_POSTS: readonly FacultyAdministrativePost[] = ["dean", "secretary", "program_head", "vpaa"];

export const normalizeAdministrativePost = (
  value: string | null | undefined,
): FacultyAdministrativePost | null => {
  const post = (value ?? "").toLowerCase().trim();
  return ADMINISTRATIVE_POSTS.find((known) => known === post) ?? null;
};

export interface HeldDesignation {
  label: string;
  deloadUnits: number;
}

export interface Faculty {
  id: string;
  name: string;
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  suffix?: string | null;
  profilePicture?: string | null;
  employmentType?: "full-time" | "part-time";
  administrativeRole?: FacultyAdministrativePost | null;
  designations?: HeldDesignation[];
  departmentId?: number;
  departmentCode?: string;
  departmentName?: string;
  programId?: number | null;
  programCode?: string | null;
  maxUnits?: number;
  deloadUnits?: number;
  overloadUnits?: number;
  assignedUnits?: number;
  requiredUnits?: number;
  unitCeiling?: number;
  status?: "active" | "inactive";
  availabilities?: FacultyAvailability[];
}

export interface Room {
  id: string;
  name: string;
  building?: string | null;
  departmentId: number | null;
  roomType: RoomType;
  status: RoomStatus;
  allowLectureUsage?: boolean;
  grantWindows?: RoomGrantWindow[];
}

export interface RoomGrantWindow {
  day: string;
  start_time: string;
  end_time: string;
}

export interface ScheduleItem {
  id: string;
  semesterId: number;
  departmentId: number;
  courseId: string;
  subjectId?: string;
  courseCode: string;
  subjectCode?: string;
  courseName: string;
  subjectName?: string;
  courseType: CourseCategory;
  subjectType?: CourseCategory;
  lectureUnits: number;
  laboratoryUnits: number;
  totalUnits: number;
  sectionName: string;
  programCode?: string | null;
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
  assignedInstructorBlocks: number;
  facultyAssignmentDone: boolean;
}

export interface SectionDoneCandidate {
  sectionId: string;
  sectionName: string;
  yearLevel: number;
  requiredSubjects: number;
  plottedSubjects: number;
  scheduleIds: number[];
  isReady: boolean;
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
  title?: string;
}

export interface ApiDepartmentRecord {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
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
  department?: {
    department_code?: string;
    department_name?: string;
  } | null;
  teaching_department_id?: number | null;
  teaching_department?: {
    department_code?: string;
    department_name?: string;
  } | null;
  teaching_program_id?: number | null;
  delegated_only?: boolean;
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
export type ApiSubjectRecord = ApiCourseRecord;

export interface ApiSectionRecord {
  id: number | string;
  section_name: string;
  year_level: string | number;
  semester: SemesterPeriod;
  department_id: number;
  program_id?: number | null;
  program?: { id: number; code?: string | null; name?: string; major?: string | null } | null;
  curriculum_id?: number | null;
  curriculum?: { id: number; name: string; code?: string } | null;
  semester_id: number;
  status?: "active" | "inactive";
  academic_semester?: ApiSemesterRecord | null;
  submission_status?: string;
  revision_status?: string;
}

export interface ApiFacultyRecord {
  id: number | string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  employment_type?: "full-time" | "part-time";
  administrative_role?: FacultyAdministrativePost | string | null;
  max_units?: number | string | null;
  deload_units?: number | string | null;
  overload_units?: number | string | null;
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
  designations?: {
    id: number;
    name: string;
    label?: string;
    parent?: { id: number; name: string } | null;
    deload_units?: number | null;
  }[];
}

export interface ApiRoomRecord {
  id: number | string;
  room_code: string;
  building?: string | null;
  room_type: RoomType;
  allow_lecture_usage?: boolean;
  status: RoomStatus;
  department_id: number | null;
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
    program?: { code?: string | null } | null;
  } | null;
  program?: { code?: string | null } | null;
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
