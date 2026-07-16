export interface Subject {
  id: string;
  code: string;
  name: string;
  units: number;
  lectureHours: number;
  labHours: number;
  category: "major" | "gec" | "gee" | "pathfit" | "nstp";
  semester: "1st" | "2nd" | "summer";
  departmentId: number | null;
  yearLevel?: number;
  roomTypeRequired?: string;
}

export interface Section {
  id: string;
  name: string;
  yearLevel: number;
  departmentId?: number;
  numberOfStudents?: number;
}

export interface Faculty {
  id: string;
  name: string;
  employmentType?: "full-time" | "part-time";
  departmentId?: number;
  departmentCode?: string;
  departmentName?: string;
  maxUnits?: number;
}

export interface Room {
  id: string;
  name: string;
  departmentId?: number;
  roomType?: string;
}

export interface ScheduleItem {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectType: "major" | "gec" | "gee" | "pathfit" | "nstp";
  sectionName: string;
  roomName: string;
  day: string;
  startTime: string;
  endTime: string;
  mode: "on-site" | "online" | "field";
  facultyName: string | null;
  facultyId: string | null;
  status:
    | "draft"
    | "completed"
    | "submitted"
    | "approved_by_dean"
    | "rejected_by_dean"
    | "approved"
    | "faculty_assignment"
    | "finalized"
    | "rejected";
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
