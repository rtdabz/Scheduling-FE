export type SubjectCategory = "major" | "minor";
export type Semester = "1st" | "2nd" | "summer";
export type YearLevel = 1 | 2 | 3 | 4;
export type RoomType = "lecture" | "laboratory" | "field" | "online";
export type RoomStatus = "available" | "not available";
export type DeliveryMode = "on-site" | "online" | "field";
export type ScheduleStatus =
  | "draft"
  | "completed"
  | "submitted"
  | "approved_by_dean"
  | "rejected_by_dean"
  | "approved"
  | "faculty_assignment"
  | "finalized"
  | "rejected";

export interface Department {
  id: number;
  department_name: string;
  department_code: string;
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

export interface Subject {
  id: string;
  code: string;
  name: string;
  units: number;
  lectureHours: number;
  labHours: number;
  category: SubjectCategory;
  semester: Semester;
  departmentId: number | null;
  yearLevel: YearLevel;
  roomTypeRequired: RoomType;
  status: "active" | "inactive";
}

export interface Section {
  id: string;
  name: string;
  yearLevel: YearLevel;
  semester: Semester;
  departmentId: number;
  termId: number;
  status: "active" | "inactive";
}

export interface Faculty {
  id: string;
  name: string;
  employmentType?: "full-time" | "part-time";
  departmentId?: number;
  departmentCode?: string;
  departmentName?: string;
  maxUnits?: number;
  status?: "active" | "inactive";
}

export interface Room {
  id: string;
  name: string;
  departmentId: number | null;
  roomType: RoomType;
  status: RoomStatus;
}

export interface ScheduleItem {
  id: string;
  termId: number;
  departmentId: number;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectType: SubjectCategory;
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
  status: ScheduleStatus;
  dayIndex: number;
  startSlot: number;
  durationSlots: number;
  sectionId: string;
  roomId: string;
  isHybrid?: boolean;
  preferredPattern?: string | null;
}

export interface DepartmentSectionProgress {
  sectionId: string;
  sectionName: string;
  yearLevel: number;
  requiredSubjects: number;
  plottedSubjects: number;
  status: ScheduleItem["status"];
  isDone: boolean;
  isSelected: boolean;
}

export interface DropContext {
  subjectId: string;
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
}

export interface ApiTermRecord {
  id: number;
  academic_year: string;
  semester: Semester;
  is_active: boolean | number;
  is_enabled?: boolean | number;
}

export interface ApiSubjectRecord {
  id: number | string;
  subject_code: string;
  subject_name: string;
  units: number;
  lecture_hours?: number | null;
  lab_hours?: number | null;
  subject_category: SubjectCategory;
  semester: Semester;
  department_id: number | null;
  year_level: string | number;
  room_type_required: RoomType;
  status?: "active" | "inactive";
}

export interface ApiSectionRecord {
  id: number | string;
  section_name: string;
  year_level: string | number;
  semester: Semester;
  department_id: number;
  term_id: number;
  status?: "active" | "inactive";
}

export interface ApiFacultyRecord {
  id: number | string;
  first_name: string;
  last_name: string;
  employment_type?: "full-time" | "part-time";
  max_units?: number | string | null;
  department_id?: number;
  status?: "active" | "inactive";
  department?: {
    department_code?: string;
    department_name?: string;
  } | null;
}

export interface ApiRoomRecord {
  id: number | string;
  room_code: string;
  building?: string | null;
  room_type: RoomType;
  status: RoomStatus;
  department_id: number | null;
}

export interface ApiScheduleRecord {
  id: number | string;
  term_id: number | string;
  department_id: number | string;
  subject_id: number | string;
  section_id: number | string;
  room_id: number | string;
  faculty_id?: number | string | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: DeliveryMode;
  status: ScheduleStatus;
  is_hybrid?: boolean | number;
  preferred_pattern?: string | null;
  subject?: {
    subject_code?: string;
    subject_name?: string;
    subject_category?: SubjectCategory;
    lecture_hours?: number | string | null;
    lab_hours?: number | string | null;
    units?: number | string | null;
  } | null;
  section?: {
    section_name?: string;
  } | null;
  faculty?: {
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
