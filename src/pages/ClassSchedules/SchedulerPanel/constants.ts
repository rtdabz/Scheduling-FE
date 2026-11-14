import type { ScheduleItem, Subject } from "./types";
import { FULL_DAY_NAMES, slotToTimeLabel } from "../../../lib/timeGrid";
import {
  GRID_HEADER_HEIGHT_PX as SHARED_GRID_HEADER_HEIGHT_PX,
  GRID_SLOT_HEIGHT_PX,
} from "../../../components/scheduling/WeeklyTimetableGrid";

export const DAYS: string[] = [...FULL_DAY_NAMES];

export const INSTRUCTOR_ASSIGNED_STATUSES: ScheduleItem["status"][] = [
  "approved",
  "faculty_assignment",
  "reassignment",
  "finalized"
];

/**
 * Only submissions still awaiting the Dean or the VPAA can be recalled. VPAA approval is final:
 * approved, faculty-assignment, reassignment and finalized classes are never recallable.
 */
export const DEPARTMENT_WITHDRAWABLE_STATUSES: ScheduleItem["status"][] = [
  "submitted",
  "approved_by_dean",
  "conditionally_approved",
];

export const isDepartmentSectionWithdrawable = (
  status: ScheduleItem["status"],
  _assignedInstructorBlocks = 0,
  _facultyAssignmentDone = false,
): boolean => DEPARTMENT_WITHDRAWABLE_STATUSES.includes(status);

export const yearLevelLabel = (year: number): string => {
  switch (year) {
    case 1: return "1st Year";
    case 2: return "2nd Year";
    case 3: return "3rd Year";
    case 4: return "4th Year";
    default: return `${year}th Year`;
  }
};

export type SubjectClassification = "all" | "major" | "minor";

export const getSubjectClassification = (
  category: Subject["category"]
): Exclude<SubjectClassification, "all"> => (category === "major" ? "major" : "minor");

export const SLOT_HEIGHT_PX = GRID_SLOT_HEIGHT_PX;
export const GRID_HEADER_HEIGHT_PX = SHARED_GRID_HEADER_HEIGHT_PX;

/** @deprecated Prefer importing slotToTimeLabel from lib/timeGrid directly. */
export const slotToTimeStr = slotToTimeLabel;

export const getLeftAccentBorder = (category: Subject["category"]) => {
  switch (category) {
    case "major": return "border-l-4 border-[#4e0a10]";
    case "minor": return "border-l-4 border-[#c9952a]";
    default: return "border-l-4 border-[#c9952a]";
  }
};

export const getGridCardStyles = (category: Subject["category"]) => {
  switch (category) {
    case "major":
      return {
        container: "border-rose-200/70 border-l-[#4e0a10] bg-rose-50/50 hover:bg-rose-50/80 hover:border-rose-300/70",
        text: "text-[#4e0a10] font-extrabold",
        badgeText: "text-[#4e0a10] bg-[#4e0a10]/10 border border-[#4e0a10]/20"
      };
    case "minor":
      return {
        container: "border-amber-200/70 border-l-[#c9952a] bg-amber-50/50 hover:bg-amber-50/80 hover:border-amber-300/70",
        text: "text-amber-900 font-extrabold",
        badgeText: "text-[#c9952a] bg-[#c9952a]/10 border border-[#c9952a]/20"
      };
    default:
      return {
        container: "border-slate-200 border-l-slate-600 bg-slate-50/50 hover:bg-slate-50",
        text: "text-slate-900 font-extrabold",
        badgeText: "text-slate-700 bg-slate-100 border border-slate-200"
      };
  }
};

export const getGridModeBadgeClass = (mode: ScheduleItem["mode"]) => {
  switch (mode) {
    case "on-site": return "bg-blue-50 text-blue-700 border border-blue-200/40";
    case "online": return "bg-emerald-50 text-emerald-700 border border-emerald-200/40";
    case "field": return "bg-amber-50 text-amber-700 border border-amber-200/40";
    default: return "bg-slate-50 text-slate-700 border border-slate-200/40";
  }
};
