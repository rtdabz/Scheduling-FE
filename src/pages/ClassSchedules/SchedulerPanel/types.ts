export interface Subject {
  id: string;
  code: string;
  name: string;
  units: number;
  category: "major" | "gec" | "gee" | "pathfit" | "nstp";
}

export interface Section {
  id: string;
  name: string;
}

export interface Faculty {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
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
