import type { ScheduleItem, Subject } from "./types";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

export const SLOT_HEIGHT_PX = 19;
export const GRID_HEADER_HEIGHT_PX = 34;

export const slotToTimeStr = (slotIndex: number): string => {
  const totalMinutes = 7 * 60 + slotIndex * 30;
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return minutes === 0 ? `${hours} ${ampm}` : `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
};

export const getCategoryStyles = (category: Subject["category"]) => {
  switch (category) {
    case "major": return { bg: "bg-blue-50/90", text: "text-blue-800", border: "border-blue-300", badge: "bg-blue-100 text-blue-800 border-blue-200", typeBadge: "bg-blue-100 text-blue-800 border-blue-200", label: "MAJOR" };
    case "minor": return { bg: "bg-purple-50/90", text: "text-purple-800", border: "border-purple-300", badge: "bg-purple-100 text-purple-800 border-purple-200", typeBadge: "bg-purple-100 text-purple-800 border-purple-200", label: "MINOR" };
    default: return { bg: "bg-slate-50", text: "text-slate-800", border: "border-slate-300", badge: "bg-slate-100 text-slate-800 border-slate-200", typeBadge: "bg-slate-100 text-slate-800 border-slate-200", label: "MINOR" };
  }
};

export const getLeftAccentBorder = (category: Subject["category"]) => {
  switch (category) {
    case "major": return "border-l-4 border-blue-500";
    case "minor": return "border-l-4 border-purple-500";
    default: return "border-l-4 border-purple-500";
  }
};

export const getGridCardStyles = (category: Subject["category"]) => {
  switch (category) {
    case "major":
      return {
        container: "border-blue-200/80 border-l-blue-600 bg-gradient-to-br from-blue-50 to-blue-100/30 shadow-sm hover:shadow hover:border-blue-300/80",
        text: "text-blue-900 font-extrabold",
        badgeText: "text-blue-700 bg-blue-100/80 border border-blue-200/40"
      };
    case "minor":
      return {
        container: "border-purple-200/80 border-l-purple-600 bg-gradient-to-br from-purple-50 to-purple-100/30 shadow-sm hover:shadow hover:border-purple-300/80",
        text: "text-purple-900 font-extrabold",
        badgeText: "text-purple-700 bg-purple-100/80 border border-purple-200/40"
      };
    default:
      return {
        container: "border-slate-200/80 border-l-slate-600 bg-gradient-to-br from-slate-50 to-slate-100/30 shadow-sm hover:shadow hover:border-slate-300/80",
        text: "text-slate-900 font-extrabold",
        badgeText: "text-slate-700 bg-slate-100/80 border border-slate-200/40"
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
