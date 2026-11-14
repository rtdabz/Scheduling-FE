import { slotToTime24h } from "../../../lib/timeGrid";
import { CALENDAR_DAYS, type CalendarSchedule } from "../../vpaa/calendar/ganttLayout";
import type { Department, ScheduleItem } from "./types";

/** Unsaved rows carry non-numeric ids; give them a stable negative id for the chart. */
const placeholderGanttId = (id: string): number => {
  const hash = id.split("").reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
  return -(Math.abs(hash) + 1);
};

const splitFacultyName = (name: string): { first_name: string; last_name: string } => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { first_name: parts[0] ?? "", last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
};

/** Shape a scheduler row for the shared Gantt chart (MasterGantt). */
export const scheduleItemToCalendar = (item: ScheduleItem, departments: readonly Department[]): CalendarSchedule => {
  const department = departments.find((candidate) => Number(candidate.id) === Number(item.departmentId));
  const numericId = Number(item.id);
  const faculty = item.facultyName ? splitFacultyName(item.facultyName) : null;
  return {
    id: Number.isFinite(numericId) ? numericId : placeholderGanttId(item.id),
    status: item.status,
    day: CALENDAR_DAYS[item.dayIndex] ?? item.day,
    start_time: slotToTime24h(item.startSlot),
    end_time: slotToTime24h(item.startSlot + item.durationSlots),
    meeting_type: item.meetingType ?? "lecture",
    mode: item.mode,
    course_id: Number(item.courseId) || null,
    department_id: Number(item.departmentId) || null,
    department: department ? {
      id: Number(department.id),
      department_name: department.department_name,
      department_code: department.department_code,
      logo: department.logo,
    } : null,
    room_id: item.mode === "on-site" && item.roomId && item.roomId !== "tba" ? Number(item.roomId) || null : null,
    room: item.mode === "on-site" && item.roomName ? { id: Number(item.roomId) || 0, room_code: item.roomName } : null,
    faculty_id: item.facultyId ? Number(item.facultyId) || null : null,
    faculty: faculty ? { id: Number(item.facultyId) || 0, ...faculty } : null,
    section_id: Number(item.sectionId) || null,
    section: { id: Number(item.sectionId) || 0, section_name: item.sectionName, department_id: Number(item.departmentId) },
    course: { course_code: item.courseCode, course_name: item.courseName, units: item.totalUnits },
  };
};
