import type { ScheduleItem, Subject } from "./types";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
export const GRID_HEADER_HEIGHT_PX = 40;

export const slotToTimeStr = (slotIndex: number): string => {
  const totalMinutes = 7 * 60 + slotIndex * 30;
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
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
    case "major": return { container: "border-blue-400 border-l-blue-600 bg-blue-50", text: "text-blue-700", badgeText: "text-blue-700" };
    case "minor": return { container: "border-purple-400 border-l-purple-600 bg-purple-50", text: "text-purple-700", badgeText: "text-purple-700" };
    default: return { container: "border-purple-400 border-l-purple-600 bg-purple-50", text: "text-purple-700", badgeText: "text-purple-700" };
  }
};

export const getGridModeBadgeClass = (mode: ScheduleItem["mode"]) => {
  switch (mode) {
    case "on-site": return "bg-blue-100 text-blue-700";
    case "online": return "bg-green-100 text-green-700";
    case "field": return "bg-orange-100 text-orange-700";
    default: return "bg-slate-100 text-slate-700";
  }
};
