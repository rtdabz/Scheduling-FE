import type { ScheduleItem, Section, Subject, Faculty, Room } from "./types";

export const MOCK_SUBJECTS: Subject[] = [
  { id: "ge-101", code: "GE 101", name: "Understanding the Self", units: 3, category: "gec" },
  { id: "ge-102", code: "GE 102", name: "Readings in Philippine History", units: 3, category: "gec" },
  { id: "ge-103", code: "GE 103", name: "The Contemporary World", units: 3, category: "gec" },
  { id: "ge-104", code: "GE 104", name: "Mathematics in the Modern World", units: 3, category: "gec" },
  { id: "cs-401", code: "CS 401", name: "Intelligent Systems", units: 3, category: "major" },
  { id: "cs-402", code: "CS 402", name: "Software Engineering", units: 3, category: "major" },
  { id: "cs-403", code: "CS 403", name: "Network Security", units: 3, category: "major" },
  { id: "cs-404", code: "CS 404", name: "Data Science & Analytics", units: 3, category: "major" },
  { id: "gee-101", code: "GEE 101", name: "GE Elective 1 (Environmental Science)", units: 3, category: "gee" },
  { id: "gee-102", code: "GEE 102", name: "GE Elective 2 (Entrepreneurship)", units: 3, category: "gee" },
  { id: "pe-101", code: "PATHFIT 1", name: "Movement Competency Training", units: 2, category: "pathfit" },
  { id: "nstp-101", code: "NSTP 1", name: "National Service Training Program 1", units: 3, category: "nstp" }
];

export const MOCK_SECTIONS: Section[] = [
  { id: "sec-cas-1", name: "BS-Psych 1A", yearLevel: 1 },
  { id: "sec-cas-2", name: "BS-Psych 2A", yearLevel: 2 },
  { id: "sec-cit-3", name: "BSIT 3A", yearLevel: 3 },
  { id: "sec-cit-1", name: "BSCS 4A", yearLevel: 4 },
  { id: "sec-cit-2", name: "BSCS 4B", yearLevel: 4 }
];

// Distinct year levels available for the section filter (ascending).
export const YEAR_LEVELS: number[] = Array.from(
  new Set(MOCK_SECTIONS.map((s) => s.yearLevel))
).sort((a, b) => a - b);

export const yearLevelLabel = (year: number): string => {
  switch (year) {
    case 1: return "1st Year";
    case 2: return "2nd Year";
    case 3: return "3rd Year";
    case 4: return "4th Year";
    default: return `${year}th Year`;
  }
};

// Subject classification for the Major/Minor filter.
// "major" categories are the program core; everything else (GEC/GEE/PATHFIT/NSTP)
// is treated as a "minor" (general-education) subject.
export type SubjectClassification = "all" | "major" | "minor";

export const getSubjectClassification = (
  category: Subject["category"]
): Exclude<SubjectClassification, "all"> => (category === "major" ? "major" : "minor");

export const MOCK_FACULTY: Faculty[] = [
  { id: "fac-1", name: "Dr. Alan Turing" },
  { id: "fac-2", name: "Dr. Grace Hopper" },
  { id: "fac-3", name: "Prof. Ada Lovelace" },
  { id: "fac-4", name: "Dr. Marie Curie" },
  { id: "fac-5", name: "Prof. Albert Einstein" }
];

export const MOCK_ROOMS: Room[] = [
  { id: "room-1", name: "Lab 101" },
  { id: "room-2", name: "Lab 102" },
  { id: "room-3", name: "Room 301" },
  { id: "room-4", name: "Room 302" },
  { id: "room-5", name: "AVR Room" },
  { id: "room-6", name: "Gymnasium" }
];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DEFAULT_SCHEDULES: ScheduleItem[] = [
  { id: "sched-1", subjectId: "cs-401", subjectCode: "CS 401", subjectName: "Intelligent Systems", subjectType: "major", sectionName: "BSCS 4A", roomName: "Lab 101", day: "Mon", startTime: "7:00 AM", endTime: "10:00 AM", mode: "on-site", facultyName: null, facultyId: null, status: "draft", dayIndex: 0, startSlot: 0, durationSlots: 6, sectionId: "sec-cit-1", roomId: "room-1" },
  { id: "sched-2", subjectId: "cs-402", subjectCode: "CS 402", subjectName: "Software Engineering", subjectType: "major", sectionName: "BSCS 4A", roomName: "Lab 102", day: "Wed", startTime: "9:00 AM", endTime: "12:00 PM", mode: "on-site", facultyName: null, facultyId: null, status: "draft", dayIndex: 2, startSlot: 4, durationSlots: 6, sectionId: "sec-cit-1", roomId: "room-2" },
  { id: "sched-3", subjectId: "ge-101", subjectCode: "GE 101", subjectName: "Understanding the Self", subjectType: "gec", sectionName: "BSCS 4A", roomName: "Room 301", day: "Tue", startTime: "10:00 AM", endTime: "1:00 PM", mode: "on-site", facultyName: null, facultyId: null, status: "draft", dayIndex: 1, startSlot: 6, durationSlots: 6, sectionId: "sec-cit-1", roomId: "room-3" },
  { id: "sched-4", subjectId: "gee-101", subjectCode: "GEE 101", subjectName: "GE Elective 1 (Environmental Science)", subjectType: "gee", sectionName: "BSCS 4A", roomName: "Room 302", day: "Thu", startTime: "1:00 PM", endTime: "4:00 PM", mode: "online", facultyName: null, facultyId: null, status: "draft", dayIndex: 3, startSlot: 12, durationSlots: 6, sectionId: "sec-cit-1", roomId: "room-4" },
  { id: "sched-5", subjectId: "pe-101", subjectCode: "PATHFIT 1", subjectName: "Movement Competency Training", subjectType: "pathfit", sectionName: "BSCS 4A", roomName: "Gymnasium", day: "Fri", startTime: "8:00 AM", endTime: "10:00 AM", mode: "field", facultyName: null, facultyId: null, status: "draft", dayIndex: 4, startSlot: 2, durationSlots: 4, sectionId: "sec-cit-1", roomId: "room-6" },
  { id: "sched-6", subjectId: "cs-403", subjectCode: "CS 403", subjectName: "Network Security", subjectType: "major", sectionName: "BSCS 4B", roomName: "Lab 101", day: "Mon", startTime: "10:00 AM", endTime: "1:00 PM", mode: "on-site", facultyName: "Dr. Alan Turing", facultyId: "fac-1", status: "faculty_assignment", dayIndex: 0, startSlot: 6, durationSlots: 6, sectionId: "sec-cit-2", roomId: "room-1" },
  { id: "sched-7", subjectId: "cs-404", subjectCode: "CS 404", subjectName: "Data Science & Analytics", subjectType: "major", sectionName: "BSCS 4B", roomName: "Lab 102", day: "Wed", startTime: "1:00 PM", endTime: "4:00 PM", mode: "on-site", facultyName: null, facultyId: null, status: "faculty_assignment", dayIndex: 2, startSlot: 12, durationSlots: 6, sectionId: "sec-cit-2", roomId: "room-2" },
  { id: "sched-8", subjectId: "ge-102", subjectCode: "GE 102", subjectName: "Readings in Philippine History", subjectType: "gec", sectionName: "BSCS 4B", roomName: "Room 301", day: "Fri", startTime: "10:00 AM", endTime: "1:00 PM", mode: "on-site", facultyName: null, facultyId: null, status: "faculty_assignment", dayIndex: 4, startSlot: 6, durationSlots: 6, sectionId: "sec-cit-2", roomId: "room-3" }
];

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
    case "gec": return { bg: "bg-emerald-50/90", text: "text-emerald-800", border: "border-emerald-300", badge: "bg-emerald-100 text-emerald-800 border-emerald-200", typeBadge: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "GEC" };
    case "gee": return { bg: "bg-purple-50/90", text: "text-purple-800", border: "border-purple-300", badge: "bg-purple-100 text-purple-800 border-purple-200", typeBadge: "bg-purple-100 text-purple-800 border-purple-200", label: "GEE" };
    case "pathfit": return { bg: "bg-orange-50/90", text: "text-orange-800", border: "border-orange-300", badge: "bg-orange-100 text-orange-800 border-orange-200", typeBadge: "bg-orange-100 text-orange-800 border-orange-200", label: "PATHFIT" };
    case "nstp": return { bg: "bg-yellow-50/90", text: "text-yellow-800", border: "border-yellow-300", badge: "bg-yellow-100 text-yellow-800 border-yellow-200", typeBadge: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "NSTP" };
    default: return { bg: "bg-slate-50", text: "text-slate-800", border: "border-slate-300", badge: "bg-slate-100 text-slate-800 border-slate-200", typeBadge: "bg-slate-100 text-slate-800 border-slate-200", label: "OTHER" };
  }
};

export const getLeftAccentBorder = (category: Subject["category"]) => {
  switch (category) {
    case "major": return "border-l-4 border-blue-500";
    case "gec": return "border-l-4 border-emerald-500";
    case "gee": return "border-l-4 border-purple-500";
    case "pathfit": return "border-l-4 border-orange-500";
    case "nstp": return "border-l-4 border-yellow-500";
    default: return "border-l-4 border-slate-500";
  }
};

export const getGridCardStyles = (category: Subject["category"]) => {
  switch (category) {
    case "major": return { container: "border-blue-400 border-l-blue-600 bg-blue-50", text: "text-blue-700", badgeText: "text-blue-700" };
    case "gec": return { container: "border-green-400 border-l-green-600 bg-green-50", text: "text-green-700", badgeText: "text-green-700" };
    case "gee": return { container: "border-purple-400 border-l-purple-600 bg-purple-50", text: "text-purple-700", badgeText: "text-purple-700" };
    case "pathfit": return { container: "border-orange-400 border-l-orange-600 bg-orange-50", text: "text-orange-700", badgeText: "text-orange-700" };
    case "nstp": return { container: "border-yellow-400 border-l-yellow-600 bg-yellow-50", text: "text-yellow-700", badgeText: "text-yellow-700" };
    default: return { container: "border-slate-400 border-l-slate-600 bg-slate-50", text: "text-slate-700", badgeText: "text-slate-700" };
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
