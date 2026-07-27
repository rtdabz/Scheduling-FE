import React, { useState, useEffect, useMemo } from "react";
import {
  Filter,
  RefreshCw,
  Clock,
  MapPin,
  User,
  Layers,
  Info,
  Calendar,
  LayoutDashboard,
  List,
  CalendarDays,
  Search,
  Building2,
  Users,
  DoorOpen,
  AlertTriangle,
  BookOpen,
  X
} from "lucide-react";
import api from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import { getCachedData, hasCachedData, setCachedData } from "../../lib/dataCache";

// TypeScript Interfaces
export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface Section {
  id: string;
  name: string;
  departmentId: string;
}

export interface Faculty {
  id: string;
  name: string;
  departmentId: string;
}

export interface Room {
  id: string;
  name: string;
}

export interface Term {
  id: number | string;
  academic_year?: string;
  semester?: string;
}

export interface Schedule {
  id: string;
  sectionId: string;
  sectionName: string;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  subjectCode: string;
  subjectName: string;
  facultyId: string;
  facultyName: string;
  roomId: string;
  roomName: string;
  day: string; // "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
  startTime: string; // e.g. "09:00 AM"
  endTime: string; // e.g. "10:30 AM"
  mode: 'on-site' | 'online' | 'field';
}

interface RawDepartment {
  id: number | string;
  department_name: string;
  department_code: string;
}

interface RawSection {
  id: number | string;
  section_name: string;
  department_id?: number | string | null;
  term_id?: number | string | null;
}

interface RawFaculty {
  id: number | string;
  first_name?: string;
  last_name?: string;
  department_id?: number | string | null;
}

interface RawRoom {
  id: number | string;
  room_code: string;
  building?: string | null;
}

interface RawSchedule {
  id: number | string;
  section_id?: number | string | null;
  department_id?: number | string | null;
  faculty_id?: number | string | null;
  room_id?: number | string | null;
  term_id?: number | string | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: Schedule["mode"];
  section?: { section_name?: string } | null;
  department?: { department_name?: string; department_code?: string } | null;
  subject?: { subject_code?: string; subject_name?: string } | null;
  faculty?: { first_name?: string; last_name?: string } | null;
  room?: { room_code?: string; building?: string | null } | null;
}

interface ScheduleViewerData {
  departments: Department[];
  sections: Section[];
  faculties: Faculty[];
  rooms: Room[];
  schedules: Schedule[];
  activeTerm: Term | null;
}

type ViewMode = "overview" | "list" | "grid";
type SortKey = "department" | "section" | "subject" | "day" | "startTime" | "faculty" | "room";
type SortDirection = "asc" | "desc";
type GroupKey = "department" | "section" | "day" | "faculty" | "room";
type ConflictStatus = "All" | "Conflict" | "No Conflict";
type AssignmentStatus = "All" | "Complete" | "Missing Faculty" | "Missing Room" | "Missing Assignment";

interface ScheduleConflictInfo {
  faculty: boolean;
  room: boolean;
  section: boolean;
}

interface DepartmentSummary {
  department: Department;
  schedules: number;
  sections: number;
  faculty: number;
  rooms: number;
  conflicts: number;
  missingAssignments: number;
}

const dayMapToIndex: Record<string, number> = {
  "Monday": 0, "Mon": 0,
  "Tuesday": 1, "Tue": 1,
  "Wednesday": 2, "Wed": 2,
  "Thursday": 3, "Thu": 3,
  "Friday": 4, "Fri": 4,
  "Saturday": 5, "Sat": 5,
  "Sunday": 6, "Sun": 6
};

const DAYS_MAP = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const timeStrToSlot = (timeStr: string): number => {
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const totalMinutes = hours * 60 + minutes;
  return Math.max(0, Math.floor((totalMinutes - 420) / 30));
};

const slotToTimeStr12h = (slotIndex: number): string => {
  const totalMinutes = 7 * 60 + slotIndex * 30;
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
};


const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Grid configuration
const START_HOUR = 7; // 7:00 AM
const END_HOUR = 21; // 9:00 PM
const VIEWER_SLOT_HEIGHT_PX = 24;

const normalizeDepartmentKey = (code: string, name = "") => {
  const normalizedCode = code.trim().toUpperCase();
  const value = name.toLowerCase();
  if (["IT", "CIT"].includes(normalizedCode) || value.includes("information technology")) return "IT";
  if (["AS", "CAS"].includes(normalizedCode) || value.includes("arts and sciences")) return "AS";
  if (["EDUC", "CED"].includes(normalizedCode) || value.includes("education")) return "EDUC";
  if (["BA", "CBA"].includes(normalizedCode) || value.includes("business")) return "BA";
  if (["HM", "CHM"].includes(normalizedCode) || value.includes("hospitality")) return "HM";
  if (["CM", "MID"].includes(normalizedCode) || value.includes("midwifery")) return "MID";
  if (["CRIM", "CCJ", "CCJPS"].includes(normalizedCode) || value.includes("criminal")) return "CRIM";
  if (["LIS", "CLIS"].includes(normalizedCode) || value.includes("library")) return "LIS";
  return "";
};

// Department styling mapping
const getDeptStyles = (code: string) => {
  switch (normalizeDepartmentKey(code)) {
    case "IT":
      return "bg-blue-50 text-blue-800 border-blue-400 border-l-blue-700 hover:bg-blue-100/60";
    case "AS":
      return "bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]/40 border-l-[#7C3AED] hover:bg-[#7C3AED]/20";
    case "EDUC":
      return "bg-orange-50 text-orange-800 border-orange-400 border-l-orange-600 hover:bg-orange-100/60";
    case "BA":
      return "bg-yellow-50 text-yellow-800 border-yellow-400 border-l-yellow-600 hover:bg-yellow-100/60";
    case "HM":
      return "bg-lime-50 text-lime-800 border-lime-400 border-l-lime-600 hover:bg-lime-100/60";
    case "MID":
      return "bg-green-50 text-green-800 border-green-400 border-l-green-600 hover:bg-green-100/60";
    case "CRIM":
      return "bg-[#4e0a10]/10 text-[#4e0a10] border-[#6b0f1a] border-l-[#4e0a10] hover:bg-[#4e0a10]/15";
    case "LIS":
      return "bg-pink-50 text-pink-800 border-pink-400 border-l-pink-600 hover:bg-pink-100/60";
    default:
      return "bg-purple-50 text-purple-800 border-purple-400 border-l-purple-600 hover:bg-purple-100/60";
  }
};

const getDeptBadgeStyles = (code: string) => {
  switch (normalizeDepartmentKey(code)) {
    case "IT": return "bg-blue-100 text-blue-800 border-blue-200";
    case "AS": return "bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]/30";
    case "EDUC": return "bg-orange-100 text-orange-800 border-orange-200";
    case "BA": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "HM": return "bg-lime-100 text-lime-800 border-lime-200";
    case "MID": return "bg-green-100 text-green-800 border-green-200";
    case "CRIM": return "bg-[#4e0a10]/10 text-[#4e0a10] border-[#6b0f1a]/30";
    case "LIS": return "bg-pink-100 text-pink-800 border-pink-200";
    default: return "bg-purple-100 text-purple-800 border-purple-200";
  }
};

const getModeLabel = (mode: Schedule["mode"]) => {
  if (mode === "on-site") return "On-Site";
  if (mode === "online") return "Online";
  return "Field";
};

const getDayOrder = (day: string) => DAYS_MAP.indexOf(day);

const isUnassignedFaculty = (schedule: Schedule) => (
  !schedule.facultyName.trim() || schedule.facultyName.trim().toLowerCase() === "unassigned"
);

const isUnassignedRoom = (schedule: Schedule) => (
  !schedule.roomName.trim() || schedule.roomName.trim().toLowerCase() === "unassigned"
);

const schedulesOverlap = (left: Schedule, right: Schedule) => {
  if (left.day !== right.day) return false;
  const leftStart = parseTimeToSlotIndex(left.startTime);
  const leftEnd = parseTimeToSlotIndex(left.endTime);
  const rightStart = parseTimeToSlotIndex(right.startTime);
  const rightEnd = parseTimeToSlotIndex(right.endTime);
  return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
};

const buildConflictMap = (items: Schedule[]) => {
  const map = new Map<string, ScheduleConflictInfo>();
  let conflictPairs = 0;

  items.forEach((item) => {
    map.set(item.id, { faculty: false, room: false, section: false });
  });

  for (let index = 0; index < items.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < items.length; compareIndex += 1) {
      const left = items[index];
      const right = items[compareIndex];
      if (!schedulesOverlap(left, right)) continue;

      const leftInfo = map.get(left.id);
      const rightInfo = map.get(right.id);
      if (!leftInfo || !rightInfo) continue;

      let hasPairConflict = false;
      if (left.sectionId && left.sectionId === right.sectionId) {
        leftInfo.section = true;
        rightInfo.section = true;
        hasPairConflict = true;
      }
      if (!isUnassignedFaculty(left) && left.facultyId === right.facultyId) {
        leftInfo.faculty = true;
        rightInfo.faculty = true;
        hasPairConflict = true;
      }
      if (!isUnassignedRoom(left) && left.roomId === right.roomId && left.roomName !== "Online" && left.roomName !== "Field") {
        leftInfo.room = true;
        rightInfo.room = true;
        hasPairConflict = true;
      }
      if (hasPairConflict) conflictPairs += 1;
    }
  }

  return { map, conflictPairs };
};

const getConflictLabels = (info?: ScheduleConflictInfo) => {
  if (!info) return [];
  return [
    info.faculty ? "Faculty Conflict" : "",
    info.room ? "Room Conflict" : "",
    info.section ? "Section Conflict" : "",
  ].filter(Boolean);
};

// Parse time string e.g. "09:30 AM" to half-hour slot index starting from 7:00 AM
const parseTimeToSlotIndex = (timeStr: string): number => {
  const match = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return 0;
  
  let hour = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();

  if (ampm === "PM" && hour !== 12) {
    hour += 12;
  }
  if (ampm === "AM" && hour === 12) {
    hour = 0;
  }

  const slotFraction = minutes >= 30 ? 1 : 0;
  const totalHalfHours = (hour * 2) + slotFraction;
  const startHalfHours = START_HOUR * 2;

  return Math.max(0, totalHalfHours - startHalfHours);
};

// Generates time slot structures for grid row labeling
const generateTimeSlots = (startSlot = 0, endSlot = (END_HOUR - START_HOUR) * 2) => {
  const slots = [];
  for (let slot = startSlot; slot < endSlot; slot += 1) {
    slots.push({
      start: slotToTimeStr12h(slot),
      end: slotToTimeStr12h(slot + 1),
      label: slotToTimeStr12h(slot)
    });
  }
  return slots;
};

// Intersect/overlap layouts analyzer
interface LayoutItem {
  schedule: Schedule;
  leftPct: number;
  widthPct: number;
}

const getDayLayouts = (daySchedules: Schedule[]): LayoutItem[] => {
  const sorted = [...daySchedules].sort((a, b) => {
    const aStart = parseTimeToSlotIndex(a.startTime);
    const bStart = parseTimeToSlotIndex(b.startTime);
    if (aStart !== bStart) return aStart - bStart;
    return (
      (parseTimeToSlotIndex(b.endTime) - parseTimeToSlotIndex(b.startTime)) -
      (parseTimeToSlotIndex(a.endTime) - parseTimeToSlotIndex(a.startTime))
    );
  });

  const layouts: LayoutItem[] = [];
  const clusters: Schedule[][] = [];

  for (const s of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const overlaps = cluster.some((c) => {
        const sStart = parseTimeToSlotIndex(s.startTime);
        const sEnd = parseTimeToSlotIndex(s.endTime);
        const cStart = parseTimeToSlotIndex(c.startTime);
        const cEnd = parseTimeToSlotIndex(c.endTime);
        return Math.max(sStart, cStart) < Math.min(sEnd, cEnd);
      });
      if (overlaps) {
        cluster.push(s);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push([s]);
    }
  }

  for (const cluster of clusters) {
    const columns: Schedule[][] = [];
    for (const s of cluster) {
      let colIdx = 0;
      while (true) {
        if (!columns[colIdx]) {
          columns[colIdx] = [s];
          break;
        }
        const overlaps = columns[colIdx].some((c) => {
          const sStart = parseTimeToSlotIndex(s.startTime);
          const sEnd = parseTimeToSlotIndex(s.endTime);
          const cStart = parseTimeToSlotIndex(c.startTime);
          const cEnd = parseTimeToSlotIndex(c.endTime);
          return Math.max(sStart, cStart) < Math.min(sEnd, cEnd);
        });
        if (!overlaps) {
          columns[colIdx].push(s);
          break;
        }
        colIdx++;
      }
    }

    const colCount = columns.length;
    for (let colIdx = 0; colIdx < colCount; colIdx++) {
      for (const s of columns[colIdx]) {
        layouts.push({
          schedule: s,
          leftPct: (colIdx / colCount) * 100,
          widthPct: 100 / colCount
        });
      }
    }
  }

  return layouts;
};

export default function VpaaScheduleViewer() {
  const scheduleViewerCacheKey = 'page:schedule-viewer:v2';
  const cachedScheduleViewerData = getCachedData<ScheduleViewerData>(scheduleViewerCacheKey);
  const [departments, setDepartments] = useState<Department[]>(cachedScheduleViewerData?.departments ?? []);
  const [sections, setSections] = useState<Section[]>(cachedScheduleViewerData?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cachedScheduleViewerData?.faculties ?? []);
  const [rooms, setRooms] = useState<Room[]>(cachedScheduleViewerData?.rooms ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cachedScheduleViewerData?.schedules ?? []);
  const [activeTerm, setActiveTerm] = useState<Term | null>(cachedScheduleViewerData?.activeTerm ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(!hasCachedData(scheduleViewerCacheKey));
  const [viewMode, setViewMode] = useState<ViewMode>("overview");

  // Filters State
  const [selectedDeptId, setSelectedDeptId] = useState<string>("All");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("All");
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>("All");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("All");
  const [selectedMode, setSelectedMode] = useState<string>("All");
  const [selectedDay, setSelectedDay] = useState<string>("All");
  const [selectedConflictStatus, setSelectedConflictStatus] = useState<ConflictStatus>("All");
  const [selectedAssignmentStatus, setSelectedAssignmentStatus] = useState<AssignmentStatus>("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("department");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [groupKey, setGroupKey] = useState<GroupKey>("department");
  const [currentPage, setCurrentPage] = useState(1);
  const [isMoreFiltersOpen, setIsMoreFiltersOpen] = useState(false);
  
  const activeExtraFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedFacultyId !== "All") count++;
    if (selectedRoomId !== "All") count++;
    if (selectedDay !== "All") count++;
    if (selectedConflictStatus !== "All") count++;
    if (selectedAssignmentStatus !== "All") count++;
    return count;
  }, [selectedFacultyId, selectedRoomId, selectedDay, selectedConflictStatus, selectedAssignmentStatus]);
  
  // Detail State
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  useEffect(() => {
    const loadData = async () => {
      const hasCache = hasCachedData(scheduleViewerCacheKey);
      try {
        setIsLoading(!hasCache);
        const response = await api.get<{
          active_term: Term | null;
          departments: RawDepartment[];
          sections: RawSection[];
          faculties: RawFaculty[];
          rooms: RawRoom[];
          schedules: RawSchedule[];
        }>('/initial-data');
        const term = response.data.active_term;
        setActiveTerm(term);

        // Map departments
        const mappedDepts = response.data.departments.map((d) => ({
          id: d.id.toString(),
          name: d.department_name,
          code: d.department_code
        }));
        setDepartments(mappedDepts);

        // Map sections (filtered by active term)
        let rawSections = response.data.sections;
        if (term) {
          rawSections = rawSections.filter((s) => s.term_id == null || Number(s.term_id) === Number(term.id));
        }
        const mappedSections = rawSections.map((s) => ({
          id: s.id.toString(),
          name: s.section_name,
          departmentId: s.department_id ? s.department_id.toString() : ""
        }));
        const sectionDepartmentById = new Map(mappedSections.map((section) => [section.id, section.departmentId]));
        setSections(mappedSections);

        // Map faculties
        const mappedFaculties = response.data.faculties.map((f) => ({
          id: f.id.toString(),
          name: `${f.first_name ?? ""} ${f.last_name ?? ""}`.trim(),
          departmentId: f.department_id ? f.department_id.toString() : ""
        }));
        setFaculties(mappedFaculties);

        // Map rooms
        const mappedRooms = response.data.rooms.map((r) => ({
          id: r.id.toString(),
          name: r.room_code + (r.building ? ` - ${r.building}` : '')
        }));
        setRooms(mappedRooms);

        // Map schedules (filtered by active term)
        let rawSchedules = response.data.schedules;
        if (term) {
          rawSchedules = rawSchedules.filter((s) => s.term_id == null || Number(s.term_id) === Number(term.id));
        }

        const mappedSchedules: Schedule[] = rawSchedules.map((item) => {
          const sectionId = item.section_id ? item.section_id.toString() : "";
          const departmentId = item.department_id ? item.department_id.toString() : sectionDepartmentById.get(sectionId) ?? "";
          const department = mappedDepts.find((dept) => dept.id === departmentId);
          let roomName = "";
          if (item.room) {
            if (item.room.room_code === "ONLINE") roomName = "Online";
            else if (item.room.room_code === "FIELD") roomName = "Field";
            else roomName = item.room.room_code + (item.room.building ? ` - ${item.room.building}` : '');
          }

          const dayIndex = dayMapToIndex[item.day] ?? 0;
          const startSlot = timeStrToSlot(item.start_time);
          const endSlot = timeStrToSlot(item.end_time);
          return {
            id: item.id.toString(),
            sectionId,
            sectionName: item.section?.section_name ?? "",
            departmentId,
            departmentName: item.department?.department_name ?? department?.name ?? "",
            departmentCode: item.department?.department_code ?? department?.code ?? "",
            subjectCode: item.subject?.subject_code ?? "",
            subjectName: item.subject?.subject_name ?? "",
            facultyId: item.faculty_id ? item.faculty_id.toString() : "",
            facultyName: item.faculty ? `${item.faculty.first_name ?? ""} ${item.faculty.last_name ?? ""}`.trim() : "Unassigned",
            roomId: item.room_id ? item.room_id.toString() : "",
            roomName,
            day: DAYS_MAP[dayIndex] || "Mon",
            startTime: slotToTimeStr12h(startSlot),
            endTime: slotToTimeStr12h(endSlot),
            mode: item.mode ?? "on-site"
          };
        });
        setSchedules(mappedSchedules);
        setCachedData<ScheduleViewerData>(scheduleViewerCacheKey, {
          departments: mappedDepts,
          sections: mappedSections,
          faculties: mappedFaculties,
          rooms: mappedRooms,
          schedules: mappedSchedules,
          activeTerm: term,
        });

      } catch {
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [scheduleViewerCacheKey]);

  // Dynamic Options filtering based on department selection
  const filteredSections = sections.filter((sec) => {
    if (selectedDeptId === "All") return true;
    return sec.departmentId === selectedDeptId;
  });

  const filteredFaculty = faculties.filter((fac) => {
    if (selectedDeptId === "All") return true;
    return fac.departmentId === selectedDeptId;
  });

  // Handle department change - cascading reset logic
  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deptId = e.target.value;
    setSelectedDeptId(deptId);
    setCurrentPage(1);
    setViewMode(deptId === "All" ? "overview" : "list");

    // Reset section filter if the currently selected section does not belong to the new department
    if (deptId !== "All") {
      const activeSec = sections.find((s) => s.id === selectedSectionId);
      if (activeSec && activeSec.departmentId !== deptId) {
        setSelectedSectionId("All");
      }

      // Reset faculty filter if the currently selected faculty does not belong to the new department
      const activeFac = faculties.find((f) => f.id === selectedFacultyId);
      if (activeFac && activeFac.departmentId !== deptId) {
        setSelectedFacultyId("All");
      }
    }
  };

  const handleResetFilters = () => {
    setSelectedDeptId("All");
    setSelectedSectionId("All");
    setSelectedFacultyId("All");
    setSelectedRoomId("All");
    setSelectedMode("All");
    setSelectedDay("All");
    setSelectedConflictStatus("All");
    setSelectedAssignmentStatus("All");
    setSearchTerm("");
    setCurrentPage(1);
    setIsMoreFiltersOpen(false);
    setViewMode("overview");
  };

  const { map: conflictMap, conflictPairs } = useMemo(() => buildConflictMap(schedules), [schedules]);

  const hasDepartmentOnlyScope = selectedDeptId !== "All" && selectedSectionId === "All" && selectedFacultyId === "All" && selectedRoomId === "All";
  const hasGridScope = selectedSectionId !== "All" || selectedFacultyId !== "All" || selectedRoomId !== "All";

  useEffect(() => {
    if (viewMode === "grid" && !hasGridScope) {
      setViewMode(selectedDeptId !== "All" ? "list" : "overview");
    }
  }, [hasGridScope, selectedDeptId, viewMode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDeptId, selectedSectionId, selectedFacultyId, selectedRoomId, selectedMode, selectedDay, selectedConflictStatus, selectedAssignmentStatus, searchTerm, sortKey, sortDirection, groupKey]);

  const filteredSchedules = useMemo(() => schedules.filter((s) => {
    if (selectedDeptId !== "All" && s.departmentId !== selectedDeptId) {
      return false;
    }
    if (selectedSectionId !== "All" && s.sectionId !== selectedSectionId) {
      return false;
    }
    if (selectedFacultyId !== "All") {
      const facObj = faculties.find((f) => f.id === selectedFacultyId);
      if (!facObj || s.facultyName !== facObj.name) return false;
    }
    if (selectedRoomId !== "All") {
      const roomObj = rooms.find((r) => r.id === selectedRoomId);
      if (!roomObj || s.roomName !== roomObj.name) return false;
    }
    if (selectedMode !== "All" && s.mode !== selectedMode) {
      return false;
    }
    if (selectedDay !== "All" && s.day !== selectedDay) {
      return false;
    }
    const conflictLabels = getConflictLabels(conflictMap.get(s.id));
    if (selectedConflictStatus === "Conflict" && conflictLabels.length === 0) {
      return false;
    }
    if (selectedConflictStatus === "No Conflict" && conflictLabels.length > 0) {
      return false;
    }
    const missingFaculty = isUnassignedFaculty(s);
    const missingRoom = isUnassignedRoom(s);
    if (selectedAssignmentStatus === "Complete" && (missingFaculty || missingRoom)) {
      return false;
    }
    if (selectedAssignmentStatus === "Missing Faculty" && !missingFaculty) {
      return false;
    }
    if (selectedAssignmentStatus === "Missing Room" && !missingRoom) {
      return false;
    }
    if (selectedAssignmentStatus === "Missing Assignment" && !missingFaculty && !missingRoom) {
      return false;
    }
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (normalizedSearch) {
      const haystack = [
        s.subjectCode,
        s.subjectName,
        s.departmentName,
        s.departmentCode,
        s.sectionName,
        s.facultyName,
        s.roomName,
        s.day,
        s.startTime,
        s.endTime,
        getModeLabel(s.mode)
      ].join(" ").toLowerCase();
      if (!haystack.includes(normalizedSearch)) return false;
    }
    return true;
  }), [
    schedules,
    selectedDeptId,
    selectedSectionId,
    selectedFacultyId,
    selectedRoomId,
    selectedMode,
    selectedDay,
    selectedConflictStatus,
    selectedAssignmentStatus,
    searchTerm,
    faculties,
    rooms,
    conflictMap
  ]);

  const overviewStats = useMemo(() => ({
    schedules: schedules.length,
    departments: departments.length,
    sections: sections.length,
    faculty: faculties.length,
    rooms: rooms.length,
    unassignedFaculty: schedules.filter(isUnassignedFaculty).length,
    unassignedRooms: schedules.filter(isUnassignedRoom).length,
    conflicts: conflictPairs
  }), [schedules, departments, sections, faculties, rooms, conflictPairs]);

  const departmentSummaries = useMemo<DepartmentSummary[]>(() => departments.map((department) => {
    const departmentSchedules = schedules.filter((schedule) => schedule.departmentId === department.id);
    const departmentSections = new Set(departmentSchedules.map((schedule) => schedule.sectionId).filter(Boolean)).size;
    const departmentFaculty = new Set(departmentSchedules.map((schedule) => schedule.facultyId).filter(Boolean)).size;
    const departmentRooms = new Set(departmentSchedules.map((schedule) => schedule.roomId).filter(Boolean)).size;
    const departmentConflicts = departmentSchedules.filter((schedule) => getConflictLabels(conflictMap.get(schedule.id)).length > 0).length;
    const missingAssignments = departmentSchedules.filter((schedule) => isUnassignedFaculty(schedule) || isUnassignedRoom(schedule)).length;

    return {
      department,
      schedules: departmentSchedules.length,
      sections: departmentSections,
      faculty: departmentFaculty,
      rooms: departmentRooms,
      conflicts: departmentConflicts,
      missingAssignments
    };
  }).sort((left, right) => right.schedules - left.schedules), [departments, schedules, conflictMap]);

  const sortedSchedules = useMemo(() => {
    const sorted = [...filteredSchedules].sort((left, right) => {
      const getValue = (schedule: Schedule) => {
        switch (sortKey) {
          case "department": return schedule.departmentCode || schedule.departmentName;
          case "section": return schedule.sectionName;
          case "subject": return `${schedule.subjectCode} ${schedule.subjectName}`;
          case "day": return `${getDayOrder(schedule.day)} ${schedule.startTime}`;
          case "startTime": return `${getDayOrder(schedule.day)} ${parseTimeToSlotIndex(schedule.startTime)}`;
          case "faculty": return schedule.facultyName;
          case "room": return schedule.roomName;
          default: return schedule.departmentName;
        }
      };
      const leftValue = getValue(left);
      const rightValue = getValue(right);
      return sortDirection === "asc"
        ? leftValue.localeCompare(rightValue)
        : rightValue.localeCompare(leftValue);
    });
    return sorted;
  }, [filteredSchedules, sortKey, sortDirection]);

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(sortedSchedules.length / pageSize));
  const paginatedSchedules = sortedSchedules.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const groupedSchedules = useMemo(() => {
    const groups = new Map<string, Schedule[]>();
    paginatedSchedules.forEach((schedule) => {
      const label = groupKey === "department"
        ? `${schedule.departmentCode || "Department"} - ${schedule.departmentName || "Unassigned Department"}`
        : groupKey === "section"
        ? schedule.sectionName || "Unassigned Section"
        : groupKey === "day"
        ? schedule.day
        : groupKey === "faculty"
        ? schedule.facultyName
        : schedule.roomName || "Unassigned Room";
      groups.set(label, [...(groups.get(label) ?? []), schedule]);
    });
    return Array.from(groups.entries());
  }, [paginatedSchedules, groupKey]);

  const sectionSummaries = useMemo(() => {
    if (selectedDeptId === "All") return [];
    return filteredSections.map((section) => {
      const sectionSchedules = schedules.filter((schedule) => schedule.sectionId === section.id);
      const conflictCount = sectionSchedules.filter((schedule) => getConflictLabels(conflictMap.get(schedule.id)).length > 0).length;
      const missingAssignments = sectionSchedules.filter((schedule) => isUnassignedFaculty(schedule) || isUnassignedRoom(schedule)).length;
      const status = sectionSchedules.length === 0
        ? "No classes scheduled"
        : conflictCount > 0
        ? `${conflictCount} conflict${conflictCount === 1 ? "" : "s"}`
        : missingAssignments > 0
        ? `${missingAssignments} class${missingAssignments === 1 ? "" : "es"} missing assignment`
        : "Fully assigned";

      return {
        section,
        schedules: sectionSchedules.length,
        conflictCount,
        missingAssignments,
        status
      };
    });
  }, [filteredSections, schedules, selectedDeptId, conflictMap, searchTerm]);

  const activeFilterChips = [
    selectedDeptId !== "All" ? departments.find((dept) => dept.id === selectedDeptId)?.code ?? "Department" : "",
    selectedSectionId !== "All" ? sections.find((section) => section.id === selectedSectionId)?.name ?? "Section" : "",
    selectedFacultyId !== "All" ? faculties.find((faculty) => faculty.id === selectedFacultyId)?.name ?? "Faculty" : "",
    selectedRoomId !== "All" ? rooms.find((room) => room.id === selectedRoomId)?.name ?? "Room" : "",
    selectedMode !== "All" ? getModeLabel(selectedMode as Schedule["mode"]) : "",
    selectedDay !== "All" ? selectedDay : "",
    selectedConflictStatus !== "All" ? selectedConflictStatus : "",
    selectedAssignmentStatus !== "All" ? selectedAssignmentStatus : "",
    searchTerm.trim() ? `Search: ${searchTerm.trim()}` : "",
  ].filter(Boolean);

  const gridRange = useMemo(() => {
    if (filteredSchedules.length === 0) return { start: 0, end: 8 };
    const starts = filteredSchedules.map((schedule) => parseTimeToSlotIndex(schedule.startTime));
    const ends = filteredSchedules.map((schedule) => parseTimeToSlotIndex(schedule.endTime));
    const start = Math.max(0, Math.min(...starts) - 1);
    const end = Math.min((END_HOUR - START_HOUR) * 2, Math.max(...ends) + 1);
    return { start, end: Math.max(end, start + 4) };
  }, [filteredSchedules]);

  const timeSlots = useMemo(() => generateTimeSlots(gridRange.start, gridRange.end), [gridRange]);



  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-md shadow-slate-100/50 overflow-hidden text-slate-800 font-sans relative">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#4e0a10] via-[#C9952A] to-[#4e0a10]" />
      
      <div className="bg-slate-50/70 border-b border-slate-200 p-5 space-y-4 pt-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-extrabold text-[#4e0a10] tracking-tight font-display">All Schedules</h2>
              {activeTerm && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#C9952A]/10 text-[#4e0a10] border border-[#C9952A]/20">
                  {activeTerm.semester ? `${activeTerm.semester} Sem` : ""} {activeTerm.academic_year ?? "Active Term"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              Institution-wide schedule monitoring, conflict detection, and department management dashboard.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/80 shadow-inner w-fit">
            {(["overview", "list", "grid"] as ViewMode[]).map((mode) => {
              const isDisabled = mode === "grid" && !hasGridScope;
              const Icon = mode === "overview" ? LayoutDashboard : mode === "list" ? List : CalendarDays;
              const label = mode === "overview" ? "Overview" : mode === "list" ? "Schedule List" : "Weekly Grid";
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && setViewMode(mode)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                    viewMode === mode
                      ? "bg-[#4e0a10] text-[#E8D5C4] shadow-md scale-[1.02]"
                      : isDisabled
                      ? "text-slate-300 cursor-not-allowed opacity-50"
                      : "text-slate-600 hover:text-[#4e0a10] hover:bg-white/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 select-none">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input 
              value={searchTerm} 
              onChange={(event) => setSearchTerm(event.target.value)} 
              placeholder="Search subject, section, faculty, room..." 
              className="w-full h-11 pl-10 pr-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none transition-all focus:border-[#C9952A] focus:ring-1 focus:ring-[#C9952A]/30" 
            />
          </div>

          <select 
            value={selectedDeptId} 
            onChange={handleDepartmentChange} 
            className="h-11 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none transition-all focus:border-[#C9952A] cursor-pointer"
          >
            <option value="All">All Departments</option>
            {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.code} - {dept.name}</option>)}
          </select>

          <select 
            value={selectedSectionId} 
            onChange={(event) => { setSelectedSectionId(event.target.value); setViewMode(event.target.value === "All" ? (selectedDeptId === "All" ? "overview" : "list") : "grid"); }} 
            className="h-11 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none transition-all focus:border-[#C9952A] cursor-pointer"
          >
            <option value="All">All Sections</option>
            {filteredSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>

          <button 
            type="button" 
            onClick={() => setIsMoreFiltersOpen((value) => !value)} 
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition-all duration-150 cursor-pointer ${
              isMoreFiltersOpen || activeExtraFiltersCount > 0
                ? "border-[#4e0a10] bg-[#4e0a10]/5 text-[#4e0a10]"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Filter className={`w-4 h-4 ${isMoreFiltersOpen || activeExtraFiltersCount > 0 ? "text-[#4e0a10]" : "text-[#C9952A]"}`} />
            <span>More Filters</span>
            {activeExtraFiltersCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4e0a10] text-[10px] font-black text-white ml-0.5">
                {activeExtraFiltersCount}
              </span>
            )}
          </button>
        </div>

        {isMoreFiltersOpen && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 shadow-inner">
            <select 
              value={selectedFacultyId} 
              onChange={(event) => { setSelectedFacultyId(event.target.value); if (event.target.value !== "All") setViewMode("grid"); }} 
              className="h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none focus:border-[#C9952A] cursor-pointer"
            >
              <option value="All">All Faculty</option>
              {filteredFaculty.map((faculty) => <option key={faculty.id} value={faculty.id}>{faculty.name}</option>)}
            </select>
            
            <select 
              value={selectedRoomId} 
              onChange={(event) => { setSelectedRoomId(event.target.value); if (event.target.value !== "All") setViewMode("grid"); }} 
              className="h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none focus:border-[#C9952A] cursor-pointer"
            >
              <option value="All">All Rooms</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
            
            <select 
              value={selectedDay} 
              onChange={(event) => setSelectedDay(event.target.value)} 
              className="h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none focus:border-[#C9952A] cursor-pointer"
            >
              <option value="All">All Days</option>
              {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
            
            <select 
              value={selectedConflictStatus} 
              onChange={(event) => setSelectedConflictStatus(event.target.value as ConflictStatus)} 
              className="h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none focus:border-[#C9952A] cursor-pointer"
            >
              <option value="All">All Conflicts</option>
              <option value="Conflict">With Conflict</option>
              <option value="No Conflict">No Conflict</option>
            </select>
            
            <select 
              value={selectedAssignmentStatus} 
              onChange={(event) => setSelectedAssignmentStatus(event.target.value as AssignmentStatus)} 
              className="h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none focus:border-[#C9952A] cursor-pointer"
            >
              <option value="All">All Assignments</option>
              <option value="Complete">Complete</option>
              <option value="Missing Faculty">Missing Faculty</option>
              <option value="Missing Room">Missing Room</option>
              <option value="Missing Assignment">Missing Assignment</option>
            </select>
            
            <button 
              onClick={handleResetFilters} 
              className="inline-flex items-center justify-center gap-2 px-4 h-10 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-semibold transition-all shadow-sm cursor-pointer hover:text-[#4e0a10]"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
          </div>
        )}
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <Filter className="w-3.5 h-3.5 text-[#C9952A]" />
              {filteredSchedules.length} result{filteredSchedules.length === 1 ? "" : "s"}
            </span>
            {activeFilterChips.map((chip) => (
              <span key={chip} className="rounded-full bg-[#4e0a10]/5 border border-[#4e0a10]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#4e0a10]">
                {chip}
              </span>
            ))}
          </div>
          
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 w-fit">
            {(["All", "on-site", "online", "field"] as const).map((mode) => (
              <button 
                key={mode} 
                type="button" 
                onClick={() => setSelectedMode(mode)} 
                className={`px-3 h-8 rounded-lg text-[10px] font-bold transition-all ${
                  selectedMode === mode 
                    ? "bg-[#4e0a10] text-[#E8D5C4] shadow-sm" 
                    : "text-slate-600 hover:bg-white/50"
                }`}
              >
                {mode === "All" ? "All Modes" : getModeLabel(mode)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === "overview" && (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            {[
              { icon: Calendar, label: "Schedules", value: overviewStats.schedules, type: "normal" },
              { icon: Building2, label: "Departments", value: overviewStats.departments, type: "normal" },
              { icon: Layers, label: "Sections", value: overviewStats.sections, type: "normal" },
              { icon: Users, label: "Faculty", value: overviewStats.faculty, type: "normal" },
              { icon: DoorOpen, label: "Rooms", value: overviewStats.rooms, type: "normal" },
              { icon: User, label: "No Faculty", value: overviewStats.unassignedFaculty, type: "warning" },
              { icon: MapPin, label: "No Room", value: overviewStats.unassignedRooms, type: "warning" },
              { icon: AlertTriangle, label: "Conflicts", value: overviewStats.conflicts, type: "danger" },
            ].map(({ icon: Icon, label, value, type }) => {
              let cardStyles = "bg-white border border-slate-200/80 text-slate-800 hover:border-slate-300";
              let textStyles = "text-[#4e0a10]";
              let iconStyles = "text-[#C9952A]";
              
              if (type === "warning" && value > 0) {
                cardStyles = "bg-amber-50/30 border border-amber-200 text-amber-900 hover:border-amber-300 hover:bg-amber-50/60";
                textStyles = "text-amber-700";
                iconStyles = "text-amber-500";
              } else if (type === "danger" && value > 0) {
                cardStyles = "bg-rose-50/30 border border-rose-200 text-rose-900 hover:border-rose-300 hover:bg-rose-50/60";
                textStyles = "text-rose-700";
                iconStyles = "text-rose-500 animate-bounce";
              }
              
              return (
                <div
                  key={label}
                  className={`rounded-2xl px-4 py-3.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between min-h-[90px] ${cardStyles}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                    <Icon className={`w-4 h-4 ${iconStyles}`} />
                  </div>
                  <p className={`text-2xl font-black leading-tight mt-2 ${textStyles}`}>{value}</p>
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200/85 bg-white overflow-hidden shadow-sm">
            <div className="bg-slate-50/80 px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-800">Department Summaries</h3>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Monitoring Overview</span>
            </div>
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2].map((item) => (
                  <Skeleton key={item} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : departmentSummaries.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400 italic">No department schedules found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs font-sans">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      <th className="px-5 py-3">Department</th>
                      <th className="px-4 py-3 text-center">Schedules</th>
                      <th className="px-4 py-3 text-center">Sections</th>
                      <th className="px-4 py-3 text-center">Faculty</th>
                      <th className="px-4 py-3 text-center">Rooms</th>
                      <th className="px-4 py-3 text-center">Conflicts</th>
                      <th className="px-4 py-3 text-center">Missing</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                    {departmentSummaries.map((summary) => (
                      <tr key={summary.department.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5 font-sans">
                          <p className="font-extrabold text-[#4e0a10] text-sm">
                            {summary.department.code}
                          </p>
                          <p className="text-slate-400 text-[11px] font-semibold truncate max-w-xs md:max-w-md">
                            {summary.department.name}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-center font-bold text-slate-800">
                          {summary.schedules}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {summary.sections}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {summary.faculty}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {summary.rooms}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {summary.conflicts > 0 ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100 font-bold">
                              {summary.conflicts}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-semibold">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {summary.missingAssignments > 0 ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-bold">
                              {summary.missingAssignments}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-semibold">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDeptId(summary.department.id);
                              setViewMode("list");
                            }}
                            className="inline-flex items-center justify-center rounded-xl bg-[#4e0a10] hover:bg-[#C9952A] text-white px-3.5 py-1.5 text-xs font-bold shadow-sm transition-all duration-150 cursor-pointer"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === "list" && (
        <div className="p-5 space-y-4 font-sans">
          {hasDepartmentOnlyScope ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm">
              <div className="bg-slate-50/80 px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-[#4e0a10] tracking-tight">Section Timetables</h3>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">Choose a class section below to view its complete weekly schedule grid.</p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  {sectionSummaries.length} section{sectionSummaries.length === 1 ? "" : "s"}
                </span>
              </div>
              {isLoading ? (
                <div className="p-4 space-y-2">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-16 w-full rounded-xl" />)}</div>
              ) : sectionSummaries.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400 italic">This department has no section schedules.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sectionSummaries.map((summary) => {
                    let badgeClass = "bg-slate-100 text-slate-600 border-slate-200";
                    if (summary.status === "Fully assigned") badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-100";
                    else if (summary.status.includes("missing")) badgeClass = "bg-amber-50 text-amber-700 border-amber-100";
                    else if (summary.status.includes("conflict")) badgeClass = "bg-rose-50 text-rose-700 border-rose-100";
                    
                    return (
                      <div key={summary.section.id} className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_1.2fr_auto] gap-3 px-5 py-4 text-sm items-center hover:bg-slate-50/40 transition-colors">
                        <div>
                          <p className="font-extrabold text-slate-800 text-base">{summary.section.name}</p>
                        </div>
                        <p className="font-semibold text-slate-500">{summary.schedules} class{summary.schedules === 1 ? "" : "es"}</p>
                        <div>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeClass}`}>
                            {summary.status}
                          </span>
                        </div>
                        <button 
                          type="button" 
                          disabled={summary.schedules === 0} 
                          onClick={() => { setSelectedSectionId(summary.section.id); setViewMode("grid"); }} 
                          className="h-9 px-4 rounded-xl bg-[#4e0a10] hover:bg-[#C9952A] text-xs font-bold text-white shadow-sm transition-all duration-150 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
                        >
                          View timetable
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select 
                    value={groupKey} 
                    onChange={(event) => setGroupKey(event.target.value as GroupKey)} 
                    className="h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none focus:border-[#C9952A] cursor-pointer"
                  >
                    <option value="department">Group by Department</option>
                    <option value="section">Group by Section</option>
                    <option value="day">Group by Day</option>
                    <option value="faculty">Group by Faculty</option>
                    <option value="room">Group by Room</option>
                  </select>
                  
                  <select 
                    value={sortKey} 
                    onChange={(event) => setSortKey(event.target.value as SortKey)} 
                    className="h-10 px-3 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-sm font-semibold outline-none focus:border-[#C9952A] cursor-pointer"
                  >
                    <option value="department">Sort Department</option>
                    <option value="section">Sort Section</option>
                    <option value="subject">Sort Subject</option>
                    <option value="day">Sort Day</option>
                    <option value="startTime">Sort Start Time</option>
                    <option value="faculty">Sort Faculty</option>
                    <option value="room">Sort Room</option>
                  </select>
                  
                  <button 
                    type="button" 
                    onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")} 
                    className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-sm font-bold shadow-sm cursor-pointer transition-all duration-150"
                  >
                    {sortDirection === "asc" ? "Ascending" : "Descending"}
                  </button>
                </div>
                <p className="text-xs font-bold text-slate-400">Page {currentPage} of {pageCount}</p>
              </div>
              
              {groupKey === "section" && (
                <div className="rounded-xl border border-[#C9952A]/20 bg-[#F7F4F0] px-4 py-2.5 text-xs font-semibold text-[#4e0a10]">
                  Each section group contains the different subjects scheduled for that same section.
                </div>
              )}
              
              <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm">
                <div className={`hidden md:grid grid-cols-1 ${groupKey === "section" ? "md:grid-cols-[1.2fr_1.1fr_1fr_1fr_0.7fr]" : "md:grid-cols-[1.2fr_1.1fr_0.8fr_1fr_1fr_0.7fr]"} gap-2 px-5 py-3 bg-slate-50/80 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-400`}>
                  <div>Subject</div>
                  <div>Schedule / Time</div>
                  {groupKey !== "section" && <div>Section</div>}
                  <div>Faculty</div>
                  <div>Room</div>
                  <div className="text-right">Dept / Status</div>
                </div>
                
                {isLoading ? (
                  <div className="p-4 space-y-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full rounded-xl" />)}</div>
                ) : groupedSchedules.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-400 italic">No schedules match the selected filters.</div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {groupedSchedules.map(([group, groupSchedules]) => (
                      <div key={group}>
                        <div className="bg-slate-50/40 px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-extrabold text-[#4e0a10]">{group}</p>
                            {groupKey === "section" && <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Subjects scheduled for this section</p>}
                          </div>
                          <span className="inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                            {groupSchedules.length} class{groupSchedules.length === 1 ? "" : "es"}
                          </span>
                        </div>
                        <div className="divide-y divide-slate-100 font-medium">
                          {groupSchedules.map((schedule) => {
                            const conflicts = getConflictLabels(conflictMap.get(schedule.id));
                            const isUnassignedFac = isUnassignedFaculty(schedule);
                            const isUnassignedRm = isUnassignedRoom(schedule);
                            
                            return (
                              <button 
                                key={schedule.id} 
                                type="button" 
                                onClick={() => setSelectedSchedule(schedule)} 
                                className={`w-full text-left grid grid-cols-1 ${
                                  groupKey === "section" 
                                    ? "md:grid-cols-[1.2fr_1.1fr_1fr_1fr_0.7fr]" 
                                    : "md:grid-cols-[1.2fr_1.1fr_0.8fr_1fr_1fr_0.7fr]"
                                } gap-2 px-5 py-3.5 text-xs items-center hover:bg-slate-50/60 transition-colors cursor-pointer`}
                              >
                                <div className="min-w-0">
                                  <p className="font-extrabold text-[#4e0a10] text-sm truncate">{schedule.subjectCode || "Subject"}</p>
                                  <p className="text-slate-400 font-semibold text-[11px] truncate mt-0.5">{schedule.subjectName || "Untitled subject"}</p>
                                </div>
                                <div className="text-slate-700 font-bold">
                                  <p>{schedule.day}</p>
                                  <p className="text-slate-400 font-medium text-[11px] mt-0.5">{schedule.startTime} - {schedule.endTime}</p>
                                </div>
                                {groupKey !== "section" && (
                                  <p className="text-slate-700 font-semibold truncate bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md w-fit text-[11px]">
                                    {schedule.sectionName || "Unassigned"}
                                  </p>
                                )}
                                <p className={isUnassignedFac ? "font-bold text-amber-600 italic bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md w-fit text-[11px]" : "text-slate-700 font-semibold truncate"}>
                                  {schedule.facultyName}
                                </p>
                                <p className={isUnassignedRm ? "font-bold text-amber-600 italic bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-md w-fit text-[11px]" : "text-slate-700 font-semibold truncate"}>
                                  {schedule.roomName || "Unassigned"}
                                </p>
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getDeptBadgeStyles(schedule.departmentCode)}`}>
                                    {schedule.departmentCode || "TCC"}
                                  </span>
                                  {conflicts.length > 0 && (
                                    <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                                      Conflict
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <button 
                  type="button" 
                  disabled={currentPage === 1} 
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} 
                  className="px-4 h-10 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-sm font-bold text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
                >
                  Previous
                </button>
                <button 
                  type="button" 
                  disabled={currentPage === pageCount} 
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} 
                  className="px-4 h-10 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-sm font-bold text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {viewMode === "grid" && (
        <div className="bg-slate-50/20 p-5 space-y-4 font-sans">
          <div className="rounded-xl border border-[#C9952A]/25 bg-[#C9952A]/5 px-4 py-3 text-xs font-semibold text-[#4e0a10] flex items-start gap-2.5 shadow-sm">
            <Info className="w-4 h-4 text-[#C9952A] shrink-0 mt-0.5" />
            <p>
              Simultaneous classes are not necessarily conflicts. Only <strong className="text-red-700 font-extrabold">Faculty Conflict</strong>, <strong className="text-red-700 font-extrabold">Room Conflict</strong>, or <strong className="text-red-700 font-extrabold">Section Conflict</strong> items are marked in red.
            </p>
          </div>

          {!hasGridScope ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h4 className="font-extrabold text-slate-700 text-sm">No Grid Scope Active</h4>
              <p className="text-xs font-medium text-slate-400 mt-1 max-w-xs mx-auto">Select a department section, faculty member, or room from the filters before opening the Weekly Grid.</p>
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h4 className="font-extrabold text-slate-700 text-sm">No Schedules Found</h4>
              <p className="text-xs font-medium text-slate-400 mt-1">No schedules match this grid scope.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm bg-white">
              <div className="min-w-[1120px] bg-white relative flex flex-row">
                <div className="w-24 shrink-0 border-r border-slate-200 bg-slate-50/70 select-none">
                  <div className="h-12 border-b border-slate-200 bg-slate-50/90 flex items-center justify-center font-extrabold text-xs uppercase text-slate-500 tracking-wider">Time</div>
                  {timeSlots.map((slot, index) => (
                    <div key={index} className="h-6 border-b border-slate-100 last:border-b-0 flex items-center justify-center text-[10px] font-semibold text-slate-400">
                      {slot.label.includes(":00") ? <span className="font-bold text-slate-600">{slot.label}</span> : <span className="opacity-30">.</span>}
                    </div>
                  ))}
                </div>

                <div className="flex-1 flex flex-row relative">
                  {DAYS.map((day) => {
                    const daySchedules = filteredSchedules.filter((schedule) => schedule.day === day);
                    const layouts = getDayLayouts(daySchedules);
                    return (
                      <div key={day} className="flex-1 border-r border-slate-200 last:border-r-0 relative min-w-[150px]">
                        <div className="h-12 border-b border-slate-200 bg-slate-50/90 flex flex-col items-center justify-center select-none py-1">
                          <span className="font-extrabold text-xs text-slate-700 uppercase tracking-wider">{day}</span>
                          <span className="text-[9px] font-bold text-slate-400 mt-0.5">{daySchedules.length} {daySchedules.length === 1 ? "Class" : "Classes"}</span>
                        </div>

                        <div className="relative">
                          {timeSlots.map((_, index) => <div key={index} className="h-6 border-b border-slate-100 last:border-b-0" />)}
                          {daySchedules.map((schedule) => {
                            const startIdx = parseTimeToSlotIndex(schedule.startTime);
                            const endIdx = parseTimeToSlotIndex(schedule.endTime);
                            const top = (startIdx - gridRange.start) * VIEWER_SLOT_HEIGHT_PX;
                            const height = (endIdx - startIdx) * VIEWER_SLOT_HEIGHT_PX;
                            const layout = layouts.find((item) => item.schedule.id === schedule.id);
                            const left = layout ? `${layout.leftPct}%` : "0%";
                            const width = layout ? `${layout.widthPct}%` : "100%";
                            const conflicts = getConflictLabels(conflictMap.get(schedule.id));
                            const showBottomRow = height > 80;
                            return (
                              <button
                                key={schedule.id}
                                type="button"
                                onClick={() => setSelectedSchedule(schedule)}
                                title={`${schedule.subjectCode}: ${schedule.subjectName}\nSection: ${schedule.sectionName || "Unassigned"}\nInstructor: ${schedule.facultyName}\nRoom: ${schedule.roomName || "Unassigned"}\nTime: ${schedule.day}, ${schedule.startTime} – ${schedule.endTime}`}
                                className={`absolute border-2 border-l-4 p-2.5 flex flex-col justify-between text-left select-none rounded-xl shadow-sm hover:shadow-md hover:scale-[1.02] hover:-translate-y-0.5 transition-all overflow-hidden box-border leading-snug cursor-pointer ${
                                  conflicts.length > 0 
                                    ? "border-red-300 border-l-red-600 bg-red-50 text-red-800 ring-2 ring-red-200" 
                                    : getDeptStyles(schedule.departmentCode)
                                }`}
                                style={{ top: `${top + 2}px`, height: `${height - 4}px`, left: `calc(${left} + 2px)`, width: `calc(${width} - 4px)`, zIndex: 10 }}
                              >
                                <div className="min-w-0 w-full">
                                  <div className="flex items-center justify-between gap-1 w-full">
                                    <span className="font-extrabold text-xs tracking-wider leading-none truncate max-w-[65%]">{schedule.subjectCode || "Subject"}</span>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-black border shrink-0 ${
                                      conflicts.length > 0 
                                        ? "bg-red-100 text-red-700 border-red-200" 
                                        : getDeptBadgeStyles(schedule.departmentCode)
                                    }`}>{schedule.sectionName || "Section"}</span>
                                  </div>
                                  <p className="text-[10px] font-semibold leading-tight mt-1 truncate opacity-90">{schedule.subjectName || "Untitled subject"}</p>
                                  {conflicts.length > 0 && (
                                    <div className="mt-1 flex items-center gap-1 text-[9px] font-extrabold text-red-700 bg-red-100/50 border border-red-200 px-1 rounded w-fit max-w-full truncate">
                                      <AlertTriangle className="w-2.5 h-2.5 shrink-0 text-red-600" />
                                      <span className="truncate">{conflicts.join(", ")}</span>
                                    </div>
                                  )}
                                </div>
                                {showBottomRow && (
                                  <div className="mt-1 space-y-0.5 border-t border-slate-200/40 pt-1 w-full text-[9px] font-bold opacity-75">
                                    <p className="truncate flex items-center gap-1">
                                      <MapPin className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                      <span>{schedule.roomName || "Unassigned"}</span>
                                    </p>
                                    <p className="truncate flex items-center gap-1">
                                      <User className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                      <span>{schedule.facultyName}</span>
                                    </p>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="px-6 py-4 border-t border-slate-200/80 bg-slate-50/80 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 select-none">
        <span className="flex items-center gap-1.5 mr-2 text-slate-400">
          <Info className="w-4 h-4" />
          Department Color Legend:
        </span>
        {departments.map((dept) => (
          <span key={dept.id} className="flex items-center gap-1.5 bg-white border border-slate-200/60 rounded-full px-2.5 py-0.5 shadow-sm">
            <span className={`w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0 ${getDeptBadgeStyles(dept.code).split(' ')[0]}`} />
            <span className="text-slate-600 font-bold text-[11px]">{dept.code}</span>
          </span>
        ))}
      </div>

      {selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xl w-full max-w-md overflow-hidden relative font-sans">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#4e0a10] to-[#C9952A]" />
            
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 pt-6 bg-slate-50/50">
              <div>
                <p className="text-[10px] font-extrabold text-[#C9952A] uppercase tracking-widest">{selectedSchedule.subjectCode}</p>
                <h3 className="text-lg font-black text-[#4e0a10] leading-snug mt-0.5">{selectedSchedule.subjectName || "Untitled subject"}</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedSchedule(null)} 
                className="rounded-xl p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4 text-xs font-medium text-slate-600">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                {[
                  { icon: Building2, label: "Department", value: `${selectedSchedule.departmentCode} - ${selectedSchedule.departmentName}` },
                  { icon: Layers, label: "Section", value: selectedSchedule.sectionName || "Unassigned Section" },
                  { icon: User, label: "Faculty", value: selectedSchedule.facultyName },
                  { icon: MapPin, label: "Room", value: selectedSchedule.roomName || "Unassigned Room" },
                  { icon: Calendar, label: "Schedule", value: `${selectedSchedule.day}, ${selectedSchedule.startTime} - ${selectedSchedule.endTime}` },
                  { icon: BookOpen, label: "Class Mode", value: getModeLabel(selectedSchedule.mode) }
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex gap-2.5 items-start">
                    <Icon className="w-4 h-4 text-[#C9952A] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                      <p className="font-bold text-slate-700 text-[11px] leading-tight mt-0.5 break-words">{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {getConflictLabels(conflictMap.get(selectedSchedule.id)).length > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs font-bold text-rose-700 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold uppercase text-[9px] tracking-wider text-rose-800">Conflict Detected</p>
                    <p className="mt-0.5 leading-snug">{getConflictLabels(conflictMap.get(selectedSchedule.id)).join(", ")}</p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button 
                type="button" 
                onClick={() => setSelectedSchedule(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-white text-xs font-bold text-slate-500 hover:text-slate-700 shadow-sm transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}






