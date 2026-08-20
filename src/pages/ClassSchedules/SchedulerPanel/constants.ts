import type { ScheduleItem, Subject } from "./types";
import { FULL_DAY_NAMES, slotToTimeLabel } from "../../../lib/timeGrid";

export const DAYS: string[] = [...FULL_DAY_NAMES];

/**
 * Statuses at which an instructor assignment counts as real — the client half of
 * `SchedulingPolicy::INSTRUCTOR_ASSIGNED_STATUSES`. A row that fell back to
 * draft, completed or revision is no longer an approved assignment, so it must
 * not appear as teaching load.
 */
export const INSTRUCTOR_ASSIGNED_STATUSES: ScheduleItem["status"][] = [
  "approved",
  "faculty_assignment",
  "finalized"
];

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

export const SLOT_HEIGHT_PX = 24;
export const GRID_HEADER_HEIGHT_PX = 48;

/** @deprecated Prefer importing slotToTimeLabel from lib/timeGrid directly. */
export const slotToTimeStr = slotToTimeLabel;

export const getCategoryStyles = (category: Subject["category"]) => {
  switch (category) {
    case "major": return { bg: "bg-rose-50/80", text: "text-[#4e0a10]", border: "border-rose-200", badge: "bg-[#4e0a10]/10 text-[#4e0a10] border-[#4e0a10]/20", typeBadge: "bg-[#4e0a10]/10 text-[#4e0a10] border-[#4e0a10]/20", label: "MAJOR" };
    case "minor": return { bg: "bg-amber-50/80", text: "text-amber-800", border: "border-amber-200", badge: "bg-[#c9952a]/10 text-[#c9952a] border-[#c9952a]/20", typeBadge: "bg-[#c9952a]/10 text-[#c9952a] border-[#c9952a]/20", label: "MINOR" };
    default: return { bg: "bg-slate-50", text: "text-slate-800", border: "border-slate-300", badge: "bg-slate-100 text-slate-800 border-slate-200", typeBadge: "bg-slate-100 text-slate-800 border-slate-200", label: "MINOR" };
  }
};

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
        container: "border-rose-100/80 border-l-[#4e0a10] bg-rose-50/40 shadow-sm hover:shadow-md hover:bg-rose-50/70 hover:border-rose-200/80",
        text: "text-[#4e0a10] font-extrabold",
        badgeText: "text-[#4e0a10] bg-[#4e0a10]/10 border border-[#4e0a10]/20"
      };
    case "minor":
      return {
        container: "border-amber-100/80 border-l-[#c9952a] bg-amber-50/40 shadow-sm hover:shadow-md hover:bg-amber-50/70 hover:border-amber-200/80",
        text: "text-amber-900 font-extrabold",
        badgeText: "text-[#c9952a] bg-[#c9952a]/10 border border-[#c9952a]/20"
      };
    default:
      return {
        container: "border-slate-100 border-l-slate-600 bg-slate-50/30 shadow-sm hover:shadow-md",
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
