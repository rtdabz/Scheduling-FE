import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  MapPin,
  User,
  Layers,
  Info,
  Calendar,
  LayoutDashboard,
  List,
  CalendarDays,
  Building2,
  AlertTriangle,
  BookOpen,
  X,
  Printer,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../../lib/api";
import PrintSchedule from "../ClassSchedules/SchedulerPanel/PrintSchedule";
import { buildInstructorTimetablePdf } from "../ClassSchedules/SchedulerPanel/instructorTimetablePdf";
import type { UserSummary } from "../ClassSchedules/SchedulerPanel/types";
import SearchInput from "../../components/ui/SearchInput";
import Skeleton from "../../components/ui/Skeleton";
import DepartmentOverviewCards, { type OverviewFocus } from "../../components/scheduling/DepartmentOverviewCards";
import SectionOverviewCards from "../../components/scheduling/SectionOverviewCards";
import ScheduleScopeSummary, { type ScopeStats } from "../../components/scheduling/ScheduleScopeSummary";
import ClassSummaryTable from "../../components/scheduling/ClassSummaryTable";
import {
  buildSummaryClasses,
  timeRangeLabel,
  type SummaryClass,
  type SummaryMeeting,
} from "../ClassSchedules/SchedulerPanel/GenerateSchedule/summaryRows";
import { useScheduleOverview } from "../../hooks/useScheduleOverview";
import { getDeptBadgeStyles, getDeptStyles } from "../../lib/departmentTheme";
import { getCachedData, hasCachedData, setCachedData } from "../../lib/dataCache";
import { useLiveRevision } from "../../hooks/useLiveRefresh";
import WeeklyTimetableGrid, { GRID_SLOT_HEIGHT_PX } from "../../components/scheduling/WeeklyTimetableGrid";
import { gridOpeningMinutes, slotCount, slotMinutes, slotToTimeLabel, timeToSlot } from "../../lib/timeGrid";

// TypeScript Interfaces
export interface Department {
  id: string;
  name: string;
  code: string;
  logo?: string | null;
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

export interface Semester {
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
  /** Falls back to the subject code for rows without a course id. */
  courseId: string;
  subjectCode: string;
  subjectName: string;
  facultyId: string;
  facultyName: string;
  roomId: string;
  roomName: string;
  day: string; // "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
  startTime: string; // e.g. "09:00 AM"
  endTime: string; // e.g. "10:30 AM"
  /** 24-hour "HH:MM", what the class table groups and sorts on. */
  startClock: string;
  endClock: string;
  mode: 'on-site' | 'online' | 'field';
  meetingType?: string | null;
  /** Instructor assigned over a conflict on purpose; shown as an override, not a clash. */
  facultyConflictOverride?: boolean;
}

interface RawDepartment {
  id: number | string;
  department_name: string;
  department_code: string;
  logo?: string | null;
}

interface RawSection {
  id: number | string;
  section_name: string;
  department_id?: number | string | null;
  semester_id?: number | string | null;
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
  course_id?: number | string | null;
  subject_id?: number | string | null;
  faculty_id?: number | string | null;
  room_id?: number | string | null;
  semester_id?: number | string | null;
  meeting_type?: string | null;
  faculty_conflict_override?: boolean | number | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: Schedule["mode"];
  section?: { section_name?: string } | null;
  department?: { department_name?: string; department_code?: string } | null;
  course?: { course_code?: string; course_name?: string } | null;
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
  activeSemester: Semester | null;
}

type ViewMode = "overview" | "sections" | "list" | "grid";
type ConflictStatus = "All" | "Conflict" | "No Conflict";
type AssignmentStatus = "All" | "Complete" | "Missing Faculty" | "Missing Room" | "Missing Assignment";

interface ScheduleConflictInfo {
  faculty: boolean;
  room: boolean;
  section: boolean;
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

const DAYS_MAP = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const timeStrToSlot = (timeStr: string): number => {
  return timeToSlot(timeStr);
};

const slotToTimeStr12h = (slotIndex: number): string => {
  return slotToTimeLabel(slotIndex);
};


const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The most rows `/initial-data` will return; asking for more is refused. */
const INITIAL_DATA_SCHEDULE_LIMIT = 2000;

/**
 * One `schedules` row as the viewer needs it. Module scope because two
 * sources feed this screen: the bulk `/initial-data` payload, and a targeted
 * per-section fetch used for the weekly grid.
 */
const mapRawSchedule = (
  item: RawSchedule,
  departments: Department[],
  sectionDepartmentById: Map<string, string>,
): Schedule => {
  const sectionId = item.section_id ? item.section_id.toString() : "";
  const departmentId = item.department_id ? item.department_id.toString() : sectionDepartmentById.get(sectionId) ?? "";
  const department = departments.find((entry) => entry.id === departmentId);
  const mode = (item.mode ?? "on-site").trim().toLowerCase() as Schedule["mode"];
  let roomName = "";
  if (mode === "online") roomName = "Online";
  else if (mode === "field") roomName = "Field";
  else if (item.room) {
    if (item.room.room_code === "ONLINE") roomName = "Online";
    else if (item.room.room_code === "FIELD") roomName = "Field";
    else roomName = item.room.room_code ?? "";
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
    courseId: String(item.course_id ?? item.subject_id ?? item.course?.course_code ?? item.subject?.subject_code ?? ""),
    subjectCode: item.course?.course_code ?? item.subject?.subject_code ?? "",
    subjectName: item.course?.course_name ?? item.subject?.subject_name ?? "",
    facultyId: item.faculty_id ? item.faculty_id.toString() : "",
    facultyName: item.faculty ? `${item.faculty.first_name ?? ""} ${item.faculty.last_name ?? ""}`.trim() : "Unassigned",
    roomId: item.room_id ? item.room_id.toString() : "",
    roomName,
    day: DAYS_MAP[dayIndex] || "Mon",
    startTime: slotToTimeStr12h(startSlot),
    endTime: slotToTimeStr12h(endSlot),
    startClock: item.start_time.slice(0, 5),
    endClock: item.end_time.slice(0, 5),
    mode,
    meetingType: item.meeting_type ?? null,
    facultyConflictOverride: Boolean(item.faculty_conflict_override),
  };
};


/** Aliased to the shared geometry so cards keep matching the rows they sit on. */
const VIEWER_SLOT_HEIGHT_PX = GRID_SLOT_HEIGHT_PX;

const getModeLabel = (mode: Schedule["mode"]) => {
  if (mode === "on-site") return "On-Site";
  if (mode === "online") return "Online";
  return "Field";
};

const isUnassignedFaculty = (schedule: Schedule) => (
  !schedule.facultyName.trim() || schedule.facultyName.trim().toLowerCase() === "unassigned"
);

const isVirtualRoom = (schedule: Schedule) => {
  const mode = schedule.mode?.trim().toLowerCase();
  const room = schedule.roomName.trim().toLowerCase();
  return mode === "online" || mode === "field" || room === "online" || room === "field";
};

const isUnassignedRoom = (schedule: Schedule) => (
  !isVirtualRoom(schedule) && (!schedule.roomName.trim() || schedule.roomName.trim().toLowerCase() === "unassigned")
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
      // A clash both meetings were deliberately assigned over is an override.
      if (
        !isUnassignedFaculty(left)
        && left.facultyId === right.facultyId
        && !(left.facultyConflictOverride && right.facultyConflictOverride)
      ) {
        leftInfo.faculty = true;
        rightInfo.faculty = true;
        hasPairConflict = true;
      }
      if (!isUnassignedRoom(left) && !isVirtualRoom(left) && left.roomId === right.roomId) {
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
  // slotToTimeLabel drops ":00" on the hour ("7 AM", not "7:00 AM"), so the
  // minutes are optional here. Requiring them made every whole-hour time fall
  // through to slot 0, which read as a mutual overlap and raised phantom
  // room/section conflicts on rows that never overlapped.
  const match = timeStr.match(/^(\d+)(?::(\d+))?\s*(AM|PM)$/i);
  if (!match) return 0;
  
  let hour = parseInt(match[1]);
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const ampm = match[3].toUpperCase();

  if (ampm === "PM" && hour !== 12) {
    hour += 12;
  }
  if (ampm === "AM" && hour === 12) {
    hour = 0;
  }

  const slotFraction = minutes >= 30 ? 1 : 0;
  const totalHalfHours = (hour * 2) + slotFraction;
  return Math.max(0, Math.round(((totalHalfHours * 30) - gridOpeningMinutes()) / slotMinutes()));
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
  const scheduleViewerCacheKey = 'page:schedule-viewer:v3';
  const cachedScheduleViewerData = getCachedData<ScheduleViewerData>(scheduleViewerCacheKey);
  const [departments, setDepartments] = useState<Department[]>(cachedScheduleViewerData?.departments ?? []);
  const [sections, setSections] = useState<Section[]>(cachedScheduleViewerData?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cachedScheduleViewerData?.faculties ?? []);
  const [rooms, setRooms] = useState<Room[]>(cachedScheduleViewerData?.rooms ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cachedScheduleViewerData?.schedules ?? []);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(cachedScheduleViewerData?.activeSemester ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(!hasCachedData(scheduleViewerCacheKey));
  const [isScheduleListTruncated, setIsScheduleListTruncated] = useState(false);

  /**
   * Institution-wide counts come from a dedicated aggregate endpoint rather
   * than from the `/initial-data` rows below: that payload is capped, so
   * counting it reports part of the semester as the whole of it.
   */
  const {
    departments: overviewDepartments,
    isLoading: isOverviewLoading,
    error: overviewError,
    refresh: refreshOverview,
  } = useScheduleOverview();

  const [searchParams, setSearchParams] = useSearchParams();
  const [requestedViewMode, setViewMode] = useState<ViewMode>(
    searchParams.get("section") ? "grid" : searchParams.get("dept") ? "sections" : "overview",
  );

  /**
   * The drill-down scope lives in the URL, not in component state. Moving down
   * a level pushes a history entry, so the browser's Back button walks back up
   * the levels instead of leaving the screen; filter tweaks replace the entry.
   */
  const selectedDeptId = searchParams.get("dept") ?? "All";
  const selectedSectionId = searchParams.get("section") ?? "All";
  const setScope = (deptId: string, sectionId: string, { push = false }: { push?: boolean } = {}) => {
    const next = new URLSearchParams(searchParams);
    if (deptId === "All") next.delete("dept");
    else next.set("dept", deptId);
    if (sectionId === "All") next.delete("section");
    else next.set("section", sectionId);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: !push });
    }
  };

  // Filters State
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>("All");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("All");
  const [selectedMode, setSelectedMode] = useState<string>("All");
  const [selectedDay, setSelectedDay] = useState<string>("All");
  const [selectedConflictStatus, setSelectedConflictStatus] = useState<ConflictStatus>("All");
  const [selectedAssignmentStatus, setSelectedAssignmentStatus] = useState<AssignmentStatus>("All");
  const [searchTerm, setSearchTerm] = useState("");
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
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  useEffect(() => {
    api.get<UserSummary[]>('/users').then((res) => {
      if (Array.isArray(res.data)) {
        setUsers(res.data);
      }
    }).catch(() => {});
  }, []);

  const liveRevision = useLiveRevision(['schedules', 'sections', 'rooms', 'departments']);

  useEffect(() => {
    const loadData = async () => {
      const hasCache = hasCachedData(scheduleViewerCacheKey);
      try {
        setIsLoading(!hasCache && liveRevision === 0);
        const response = await api.get<{
          active_semester: Semester | null;
          departments: RawDepartment[];
          sections: RawSection[];
          faculties: RawFaculty[];
          rooms: RawRoom[];
          schedules: RawSchedule[];
        }>(`/initial-data?schedule_limit=${INITIAL_DATA_SCHEDULE_LIMIT}`);
        const semester = response.data.active_semester;
        setActiveSemester(semester);

        // Map departments
        const mappedDepts = response.data.departments.map((d) => ({
          id: d.id.toString(),
          name: d.department_name,
          code: d.department_code,
          logo: d.logo,
        }));
        setDepartments(mappedDepts);

        // Map sections (filtered by active semester)
        let rawSections = response.data.sections;
        if (semester) {
          rawSections = rawSections.filter((s) => s.semester_id == null || Number(s.semester_id) === Number(semester.id));
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
          name: r.room_code
        }));
        setRooms(mappedRooms);

        // Map schedules (filtered by active semester)
        let rawSchedules = response.data.schedules;
        if (semester) {
          rawSchedules = rawSchedules.filter((s) => s.semester_id == null || Number(s.semester_id) === Number(semester.id));
        }

        const mappedSchedules: Schedule[] = rawSchedules.map(
          (item) => mapRawSchedule(item, mappedDepts, sectionDepartmentById),
        );
        setSchedules(mappedSchedules);
        // The endpoint caps this payload. The aggregate counts above are
        // unaffected, but the flat list below would silently show part of the
        // semester as all of it, so say so instead.
        setIsScheduleListTruncated(rawSchedules.length >= INITIAL_DATA_SCHEDULE_LIMIT);
        setCachedData<ScheduleViewerData>(scheduleViewerCacheKey, {
          departments: mappedDepts,
          sections: mappedSections,
          faculties: mappedFaculties,
          rooms: mappedRooms,
          schedules: mappedSchedules,
          activeSemester: semester,
        });

      } catch {
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [scheduleViewerCacheKey, liveRevision]);

  /**
   * The bulk payload above is capped, so a section opened from the drill-down
   * is not guaranteed to have all of its meetings in it. Fetch that one
   * section's rows directly and merge them in, so the weekly grid always shows
   * the whole week rather than whichever part of it arrived.
   */
  useEffect(() => {
    if (selectedSectionId === "All") return;

    let cancelled = false;

    const loadSection = async () => {
      try {
        const response = await api.get<RawSchedule[]>(`/schedules/section/${selectedSectionId}`);
        if (cancelled) return;

        const sectionDepartmentById = new Map(sections.map((section) => [section.id, section.departmentId]));
        const rows = response.data
          .filter((row) => activeSemester == null || row.semester_id == null || Number(row.semester_id) === Number(activeSemester.id))
          .map((row) => mapRawSchedule(row, departments, sectionDepartmentById));

        setSchedules((current) => {
          const fetchedIds = new Set(rows.map((row) => row.id));
          const untouched = current.filter(
            (row) => row.sectionId !== selectedSectionId && !fetchedIds.has(row.id),
          );
          return [...untouched, ...rows];
        });
      } catch {
        // The bulk payload already loaded is a usable fallback; failing here
        // should not blank out a grid the user is looking at.
      }
    };

    void loadSection();

    return () => {
      cancelled = true;
    };
  }, [selectedSectionId, sections, departments, activeSemester]);

  // Dynamic Options filtering based on department selection
  const filteredSections = sections.filter((sec) => {
    if (selectedDeptId === "All") return true;
    return sec.departmentId === selectedDeptId;
  });

  const filteredFaculty = faculties.filter((fac) => {
    if (selectedDeptId === "All") return true;
    return fac.departmentId === selectedDeptId;
  });

  /**
   * The three levels of the drill-down, as explicit moves rather than something
   * inferred from whichever filter changed last. The level a filter change used
   * to imply was set in three different places, which is what made it hard to
   * tell what the screen would show next.
   */
  /**
   * One focus at a time ("conflicts", "missing faculty", "missing room"),
   * shared by every level. It is set from the summary cards or a department
   * chip, and deliberately survives moving between levels, so filtering for
   * conflicts and then opening a department still shows only its conflicts.
   */
  const focus: OverviewFocus | null = selectedConflictStatus === "Conflict"
    ? "conflicts"
    : selectedAssignmentStatus === "Missing Faculty"
    ? "missing-faculty"
    : selectedAssignmentStatus === "Missing Room"
    ? "missing-room"
    : null;

  const setFocus = (next: OverviewFocus | null) => {
    setSelectedConflictStatus(next === "conflicts" ? "Conflict" : "All");
    setSelectedAssignmentStatus(
      next === "missing-faculty" ? "Missing Faculty" : next === "missing-room" ? "Missing Room" : "All",
    );
  };

  const openInstitution = () => {
    setScope("All", "All", { push: true });
    setCurrentPage(1);
    setViewMode("overview");
  };

  const openDepartment = (departmentId: number | string, nextFocus?: OverviewFocus) => {
    setScope(String(departmentId), "All", { push: true });
    setCurrentPage(1);
    // A chip carries the reason it was clicked, so the level below opens on
    // what the user was pointing at instead of everything.
    if (nextFocus !== undefined) setFocus(nextFocus);
    setViewMode("sections");
  };

  const openSection = (sectionId: number | string) => {
    const id = String(sectionId);
    // Record the section's department too, so the breadcrumb and Back always
    // have a level to return to, however the section was reached.
    const departmentId = sections.find((section) => section.id === id)?.departmentId || selectedDeptId;
    setScope(departmentId, id, { push: true });
    setCurrentPage(1);
    setViewMode("grid");
  };

  // Handle department change - cascading reset logic
  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deptId = e.target.value;
    setCurrentPage(1);

    // Reset section filter if the currently selected section does not belong to the new department
    const activeSec = sections.find((s) => s.id === selectedSectionId);
    const keepSection = deptId !== "All" && activeSec?.departmentId === deptId;
    setScope(deptId, keepSection ? selectedSectionId : "All");

    if (deptId !== "All") {
      // Reset faculty filter if the currently selected faculty does not belong to the new department
      const activeFac = faculties.find((f) => f.id === selectedFacultyId);
      if (activeFac && activeFac.departmentId !== deptId) {
        setSelectedFacultyId("All");
      }
    }
  };

  const handleResetFilters = () => {
    setScope("All", "All");
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

  const { map: conflictMap } = useMemo(() => buildConflictMap(schedules), [schedules]);

  const hasGridScope = selectedSectionId !== "All" || selectedFacultyId !== "All" || selectedRoomId !== "All";
  /**
   * The view actually shown. The drill-down level is derived from the scope
   * (which lives in the URL and can change under the screen via browser
   * Back/Forward), so the breadcrumb never names a level the content is not
   * showing. The flat list and a faculty or room grid are views the user
   * chose, so those requests are honoured as long as they still make sense.
   */
  const drillViewMode: ViewMode = selectedSectionId !== "All" ? "grid" : selectedDeptId !== "All" ? "sections" : "overview";
  const viewMode: ViewMode = requestedViewMode === "list" || (requestedViewMode === "grid" && hasGridScope)
    ? requestedViewMode
    : drillViewMode;
  const isFlatView = viewMode === "list" || viewMode === "grid";

  /** One level up from wherever the screen is. Null at the top. */
  const goBack = viewMode === "list"
    ? () => setViewMode(drillViewMode)
    : viewMode === "grid" && selectedSectionId === "All"
    ? () => setViewMode("list")
    : selectedSectionId !== "All"
    ? () => (selectedDeptId !== "All" ? openDepartment(selectedDeptId) : openInstitution())
    : selectedDeptId !== "All"
    ? openInstitution
    : null;

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDeptId, selectedSectionId, selectedFacultyId, selectedRoomId, selectedMode, selectedDay, selectedConflictStatus, selectedAssignmentStatus, searchTerm]);

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

  const selectedDepartment = useMemo(
    () => overviewDepartments.find((department) => String(department.department_id) === selectedDeptId),
    [overviewDepartments, selectedDeptId],
  );

  const selectedSectionOverview = useMemo(
    () => selectedSectionId === "All"
      ? undefined
      : overviewDepartments.flatMap((department) => department.sections).find((section) => String(section.id) === selectedSectionId),
    [overviewDepartments, selectedSectionId],
  );

  const selectedSectionName = selectedSectionOverview?.code
    ?? sections.find((section) => section.id === selectedSectionId)?.name
    ?? "Section";

  /**
   * The summary follows the breadcrumb: all departments, then the opened
   * department, then the opened section. It used to show institution totals
   * at every level, so drilling in never changed a single number.
   */
  const scopeLevel: "institution" | "department" | "section" = selectedSectionId !== "All"
    ? "section"
    : selectedDeptId !== "All" ? "department" : "institution";

  const scopeStats = useMemo<ScopeStats | null>(() => {
    if (scopeLevel === "section") {
      const section = selectedSectionOverview;
      if (!section) return null;
      return {
        sectionsScheduled: section.meetings > 0 ? 1 : 0,
        sectionsTotal: 1,
        classes: section.classes,
        meetings: section.meetings,
        unassignedFaculty: section.unassigned_faculty,
        unassignedRooms: section.unassigned_rooms,
        conflicts: section.conflicts,
        status: section.meetings > 0 ? section.status : undefined,
      };
    }

    const scoped = scopeLevel === "department"
      ? (selectedDepartment ? [selectedDepartment] : [])
      : overviewDepartments;
    if (scoped.length === 0) return null;

    return scoped.reduce<ScopeStats>((sum, department) => ({
      sectionsScheduled: sum.sectionsScheduled + department.sections_scheduled,
      sectionsTotal: sum.sectionsTotal + department.sections_total,
      classes: sum.classes + department.classes,
      meetings: sum.meetings + department.meetings,
      unassignedFaculty: sum.unassignedFaculty + department.unassigned_faculty,
      unassignedRooms: sum.unassignedRooms + department.unassigned_rooms,
      conflicts: {
        faculty: sum.conflicts.faculty + department.conflicts.faculty,
        overridden: (sum.conflicts.overridden ?? 0) + (department.conflicts.overridden ?? 0),
        room: sum.conflicts.room + department.conflicts.room,
        section: sum.conflicts.section + department.conflicts.section,
        total: sum.conflicts.total + department.conflicts.total,
      },
    }), {
      sectionsScheduled: 0,
      sectionsTotal: 0,
      classes: 0,
      meetings: 0,
      unassignedFaculty: 0,
      unassignedRooms: 0,
      conflicts: { faculty: 0, room: 0, section: 0, total: 0, overridden: 0 },
    });
  }, [scopeLevel, selectedSectionOverview, selectedDepartment, overviewDepartments]);

  const scopeLabel = scopeLevel === "section"
    ? selectedSectionName
    : scopeLevel === "department"
    ? (selectedDepartment ? `${selectedDepartment.code} · ${selectedDepartment.name}` : "Department")
    : "All departments";

  const focusDescription = focus === "conflicts"
    ? "with conflicts"
    : focus === "missing-faculty"
    ? "with meetings missing a faculty"
    : focus === "missing-room"
    ? "with meetings missing a room"
    : "";

  const departmentLogos = useMemo(
    () => Object.fromEntries(departments.map((department) => [department.id, department.logo])),
    [departments],
  );

  const visibleDepartments = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return overviewDepartments.filter((department) => {
      if (focus === "conflicts" && department.conflicts.total === 0) return false;
      if (focus === "missing-faculty" && department.unassigned_faculty === 0) return false;
      if (focus === "missing-room" && department.unassigned_rooms === 0) return false;
      if (search && !`${department.code} ${department.name}`.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [overviewDepartments, searchTerm, focus]);

  /**
   * The section level honours the chip that was clicked to reach it, and the
   * search box, so arriving from "3 conflicts" shows those three sections
   * rather than the whole department again.
   */
  const visibleSections = useMemo(() => {
    const all = selectedDepartment?.sections ?? [];
    const search = searchTerm.trim().toLowerCase();

    return all.filter((section) => {
      if (selectedConflictStatus === "Conflict" && section.conflicts.total === 0) return false;
      if (selectedConflictStatus === "No Conflict" && section.conflicts.total > 0) return false;
      if (selectedAssignmentStatus === "Missing Faculty" && section.unassigned_faculty === 0) return false;
      if (selectedAssignmentStatus === "Missing Room" && section.unassigned_rooms === 0) return false;
      if (selectedAssignmentStatus === "Missing Assignment" && section.unassigned_faculty === 0 && section.unassigned_rooms === 0) return false;
      if (selectedAssignmentStatus === "Complete" && (section.unassigned_faculty > 0 || section.unassigned_rooms > 0)) return false;
      if (search && !section.code.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [selectedDepartment, selectedConflictStatus, selectedAssignmentStatus, searchTerm]);

  /**
   * The list shows one row per class, the same table as the generator's
   * Schedule Summary. A class matches when any of its meetings passes the
   * filters and is then shown whole: hiding its other days would misstate when
   * the class actually meets.
   */
  const listClasses = useMemo<SummaryClass[]>(() => {
    const classKeyOf = (schedule: Schedule) => `${schedule.sectionId}|${schedule.courseId}`;
    const matching = new Set(filteredSchedules.map(classKeyOf));

    const meetings = schedules
      .filter((schedule) => matching.has(classKeyOf(schedule)))
      .map((schedule): SummaryMeeting => ({
        id: schedule.id,
        sectionId: schedule.sectionId,
        sectionName: schedule.sectionName || "Unassigned section",
        courseId: schedule.courseId,
        courseCode: schedule.subjectCode || "Subject",
        courseName: schedule.subjectName || "Untitled subject",
        day: schedule.day,
        start: schedule.startClock,
        end: schedule.endClock,
        mode: schedule.mode,
        room: isVirtualRoom(schedule) ? getModeLabel(schedule.mode) : (schedule.roomName || "Unassigned"),
        meeting: schedule.meetingType ?? "",
        faculty: isUnassignedFaculty(schedule) ? "Unassigned" : schedule.facultyName,
      }));

    return buildSummaryClasses(meetings);
  }, [filteredSchedules, schedules]);

  const scheduleById = useMemo(() => new Map(schedules.map((schedule) => [schedule.id, schedule])), [schedules]);

  const conflictLabelsOfClass = (item: SummaryClass) => Array.from(new Set(
    item.parts.flatMap((part) => part.ids.flatMap((id) => getConflictLabels(conflictMap.get(id)))),
  ));

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(listClasses.length / pageSize));
  const paginatedClasses = listClasses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /** Every meeting of the class the detail modal is open on. */
  const selectedClassParts = useMemo(() => {
    if (!selectedSchedule) return [];
    const siblings = schedules.filter((schedule) => (
      schedule.sectionId === selectedSchedule.sectionId && schedule.courseId === selectedSchedule.courseId
    ));
    return buildSummaryClasses(siblings.map((schedule): SummaryMeeting => ({
      sectionId: schedule.sectionId,
      sectionName: schedule.sectionName,
      courseId: schedule.courseId,
      courseCode: schedule.subjectCode,
      courseName: schedule.subjectName,
      day: schedule.day,
      start: schedule.startClock,
      end: schedule.endClock,
      mode: schedule.mode,
      room: isVirtualRoom(schedule) ? getModeLabel(schedule.mode) : (schedule.roomName || "Unassigned"),
      meeting: schedule.meetingType ?? "",
      faculty: isUnassignedFaculty(schedule) ? "Unassigned" : schedule.facultyName,
    })))[0]?.parts ?? [];
  }, [schedules, selectedSchedule]);

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

  /**
   * Every timetable in the system shows the same 7:00 AM-8:30 PM window. This
   * screen used to crop the grid to the extent of whatever was filtered in, so
   * the same class sat at a different height depending on the filter and did
   * not line up with the builder it was scheduled on.
   */
  const gridRange = useMemo(() => {
    const latestEnd = filteredSchedules.reduce(
      (max, schedule) => Math.max(max, parseTimeToSlotIndex(schedule.endTime)),
      0,
    );
    return { start: 0, end: Math.max(slotCount(), latestEnd) };
  }, [filteredSchedules]);

  const pdfSections = useMemo(() => {
    let targetSections = sections;
    if (selectedSectionId !== "All") {
      targetSections = sections.filter((s) => s.id === selectedSectionId);
    } else if (selectedDeptId !== "All") {
      targetSections = sections.filter((s) => s.departmentId === selectedDeptId);
    }
    return targetSections.map((sec) => ({
      id: String(sec.id),
      name: sec.name || "Section",
      yearLevel: 1 as const,
      semester: (activeSemester?.semester || "1st") as any,
      departmentId: Number(sec.departmentId || 0),
      semesterId: Number(activeSemester?.id || 0),
    }));
  }, [sections, selectedSectionId, selectedDeptId, activeSemester]);

  const pdfSchedules = useMemo(() => {
    return filteredSchedules.map((sch) => ({
      id: String(sch.id),
      sectionId: String(sch.sectionId),
      sectionName: sch.sectionName,
      subjectCode: sch.subjectCode,
      subjectName: sch.subjectName,
      day: sch.day as any,
      startTime: sch.startTime,
      endTime: sch.endTime,
      facultyName: sch.facultyName,
      roomName: sch.roomName,
      mode: sch.mode,
      meetingType: sch.meetingType,
      status: "finalized",
    }));
  }, [filteredSchedules]);

  const pdfDepartments = useMemo(() => {
    return departments.map((dept) => ({
      id: Number(dept.id),
      logo: dept.logo || null,
    }));
  }, [departments]);

  const handlePrintTimetable = async () => {
    let printTitle = "MASTER CLASS TIMETABLE";
    let activeDeptId = selectedDeptId;

    if (selectedFacultyId !== "All") {
      const faculty = faculties.find((f) => f.id === selectedFacultyId);
      printTitle = `INSTRUCTOR: ${(faculty?.name || "Instructor").toUpperCase()}`;
      if (faculty?.departmentId) activeDeptId = faculty.departmentId;
    } else if (selectedSectionId !== "All") {
      const sec = sections.find((s) => s.id === selectedSectionId);
      printTitle = `SECTION: ${(sec?.name || "Section").toUpperCase()}`;
      if (sec?.departmentId) activeDeptId = sec.departmentId;
    } else if (selectedRoomId !== "All") {
      const rm = rooms.find((r) => r.id === selectedRoomId);
      printTitle = `ROOM: ${(rm?.name || "Room").toUpperCase()}`;
    } else if (selectedDeptId !== "All") {
      const dept = departments.find((d) => d.id === selectedDeptId);
      printTitle = `DEPARTMENT: ${(dept?.name || "Department").toUpperCase()}`;
    }

    const dept = departments.find((d) => d.id === activeDeptId);

    const blob = await buildInstructorTimetablePdf({
      title: printTitle,
      departmentCode: dept?.code || "",
      departmentName: dept?.name || "",
      departmentLogo: dept?.logo || null,
      schedules: pdfSchedules,
      activeSemester,
    });
    window.open(URL.createObjectURL(blob), "_blank");
  };

  const summary = (
    <ScheduleScopeSummary
      scopeLabel={scopeLabel}
      level={scopeLevel}
      stats={scopeStats}
      isLoading={isOverviewLoading}
      focus={focus}
      onFocusChange={setFocus}
    />
  );

  const focusBadge = focus ? (
    <button
      type="button"
      onClick={() => setFocus(null)}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#4e0a10]/20 bg-[#4e0a10]/5 px-3 py-1 text-xs font-bold text-[#4e0a10] hover:bg-[#4e0a10]/10 cursor-pointer"
    >
      Filtered: {focusDescription.replace(/^with /, "")}
      <X className="w-3.5 h-3.5" />
    </button>
  ) : null;

  /** A filter that matches nothing must still offer a way out, not a blank page. */
  const focusEmptyState = (noun: string) => (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <p className="text-sm font-bold text-slate-600">No {noun} {focusDescription}.</p>
      <button
        type="button"
        onClick={() => setFocus(null)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-[#4e0a10] shadow-sm hover:bg-slate-50 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
        Clear filter
      </button>
    </div>
  );



  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200/80 shadow-md shadow-slate-100/50 overflow-hidden text-slate-800 font-sans relative">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#4e0a10] via-[#C9952A] to-[#4e0a10]" />
      
      <div className="bg-slate-50/70 border-b border-slate-200 p-5 space-y-4 pt-6">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {goBack && (
              <button
                type="button"
                onClick={goBack}
                className="mt-0.5 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:border-[#4e0a10]/30 hover:text-[#4e0a10] cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              {activeSemester && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#C9952A]/10 text-[#4e0a10] border border-[#C9952A]/20">
                  {activeSemester.semester ? `${activeSemester.semester} Sem` : ""} {activeSemester.academic_year ?? "Active Semester"}
                </span>
              )}
            </div>
            {/*
              * The breadcrumb is the level indicator. It replaces having to
              * read the filter selects to work out how deep the screen is.
              */}
            <nav aria-label="Breadcrumb" className="mt-1.5 flex flex-wrap items-center gap-1 text-xs font-bold">
              {/* Earlier levels are links (underlined on hover); the current level is plain text. */}
              {scopeLevel === "institution" ? (
                <span aria-current="page" className="rounded-lg px-2 py-1 text-[#4e0a10]">All departments</span>
              ) : (
                <button
                  type="button"
                  onClick={openInstitution}
                  className="rounded-lg px-2 py-1 text-slate-500 underline-offset-2 transition-colors hover:bg-white hover:text-[#4e0a10] hover:underline cursor-pointer"
                >
                  All departments
                </button>
              )}

              {selectedDeptId !== "All" && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  {scopeLevel === "department" ? (
                    <span aria-current="page" className="rounded-lg px-2 py-1 text-[#4e0a10]">
                      {selectedDepartment?.code ?? departments.find((dept) => dept.id === selectedDeptId)?.code ?? "Department"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openDepartment(selectedDeptId)}
                      className="rounded-lg px-2 py-1 text-slate-500 underline-offset-2 transition-colors hover:bg-white hover:text-[#4e0a10] hover:underline cursor-pointer"
                    >
                      {selectedDepartment?.code ?? departments.find((dept) => dept.id === selectedDeptId)?.code ?? "Department"}
                    </button>
                  )}
                </>
              )}

              {selectedSectionId !== "All" && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span aria-current="page" className="rounded-lg px-2 py-1 text-[#4e0a10]">
                    {selectedSectionName}
                  </span>
                </>
              )}
            </nav>
            <p className="mt-0.5 px-2 text-[11px] font-semibold text-slate-400">
              {viewMode === "list"
                ? "Every meeting in this scope as a list. Click a row for details."
                : viewMode === "grid"
                ? "Weekly timetable. Click a class for details."
                : scopeLevel === "department"
                ? "Pick a section to open its weekly timetable."
                : "Pick a department to see its sections."}
            </p>
          </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                    onClick={() => {
                      if (isDisabled) return;
                      if (mode === "overview" && selectedSectionId !== "All") {
                        openDepartment(selectedDeptId);
                        return;
                      }
                      setViewMode(mode === "overview" ? drillViewMode : mode);
                    }}
                    title={isDisabled ? "Open a section first (or pick a faculty or room in Schedule List)" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
                      viewMode === mode || (mode === "overview" && viewMode === "sections")
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

            <button
              type="button"
              onClick={() => void handlePrintTimetable()}
              title="Print timetable for current view scope"
              aria-label="Print Timetable"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition-all hover:border-[#4e0a10]/30 hover:bg-[#4e0a10]/5 hover:text-[#4e0a10] cursor-pointer"
            >
              <Printer className="w-4 h-4 text-[#4e0a10]" />
              <span>Print Timetable</span>
            </button>
          </div>
        </div>

        <div className={`grid gap-3 select-none ${isFlatView ? "grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_auto]" : "grid-cols-1"}`}>
          <SearchInput
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={isFlatView ? "Search subject, section, faculty, room..." : "Search departments and sections..."}
            containerClassName="relative"
          />

          {/*
            * Picking a department from a select duplicates clicking its card,
            * and the rest of these narrow the flat list rather than the cards,
            * so the drill-down levels keep only the search box.
            */}
          {isFlatView && (
            <>
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
            onChange={(event) => {
              if (event.target.value === "All") {
                setScope(selectedDeptId, "All");
              } else {
                openSection(event.target.value);
              }
            }}
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
            </>
          )}
        </div>

        {isFlatView && isMoreFiltersOpen && (
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
        
        {isFlatView && (
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
        )}
      </div>

      {(viewMode === "overview" || viewMode === "sections") && (
        <div className="p-5 space-y-5">
          {overviewError && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs font-bold text-amber-800">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                {overviewError} The figures below may be out of date.
              </span>
              <button
                type="button"
                onClick={refreshOverview}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-50 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          )}

          {summary}

          {viewMode === "overview" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    {focus ? `Departments ${focusDescription}` : "Departments"}
                  </h3>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">
                    Click a department to see its sections. Departments needing attention are listed first.
                  </p>
                </div>
                {focusBadge}
              </div>
              {focus && !isOverviewLoading && visibleDepartments.length === 0 ? (
                focusEmptyState("departments")
              ) : (
                <DepartmentOverviewCards
                  departments={visibleDepartments}
                  departmentLogos={departmentLogos}
                  isLoading={isOverviewLoading && overviewDepartments.length === 0}
                  onOpen={openDepartment}
                />
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    {selectedDepartment ? `${selectedDepartment.code} sections` : "Sections"}
                    {focus ? ` ${focusDescription}` : ""}
                  </h3>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">
                    Click a section to open its weekly timetable.
                  </p>
                </div>
                {focus ? focusBadge : (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                    {selectedDepartment?.sections.length ?? 0} section{(selectedDepartment?.sections.length ?? 0) === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {focus && selectedDepartment && visibleSections.length === 0 ? (
                focusEmptyState("sections")
              ) : (
                <SectionOverviewCards
                  sections={visibleSections}
                  isLoading={isOverviewLoading && !selectedDepartment}
                  onOpen={openSection}
                />
              )}
            </div>
          )}
        </div>
      )}

      {viewMode === "list" && (
        <div className="p-5 space-y-4 font-sans">
          {isScheduleListTruncated && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs font-bold text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p>
                This list shows the {INITIAL_DATA_SCHEDULE_LIMIT.toLocaleString()} most recent meetings of the semester, not all of
                them. Narrow it with a department, section or search to be sure you are seeing everything.
                The counts above cover the whole semester.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-500">
              {listClasses.length} class{listClasses.length === 1 ? "" : "es"} · split and hybrid meetings share one row
            </p>
            <p className="text-xs font-bold text-slate-400">Page {currentPage} of {pageCount}</p>
          </div>

          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full rounded-xl" />)}</div>
          ) : (
            <ClassSummaryTable
              classes={paginatedClasses}
              showFaculty
              sortable={false}
              className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm"
              emptyMessage="No schedules match the selected filters."
              onRowClick={(item) => {
                const firstId = item.parts[0]?.ids[0];
                const schedule = firstId ? scheduleById.get(firstId) : undefined;
                if (schedule) setSelectedSchedule(schedule);
              }}
              isRowFlagged={(item) => conflictLabelsOfClass(item).length > 0}
              renderSection={(item) => {
                const departmentCode = item.parts[0]?.ids[0] ? scheduleById.get(item.parts[0].ids[0])?.departmentCode : undefined;
                return (
                  <>
                    <span className="block">{item.sectionName}</span>
                    {selectedDeptId === "All" && departmentCode && (
                      <span className={`mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase ${getDeptBadgeStyles(departmentCode)}`}>
                        {departmentCode}
                      </span>
                    )}
                  </>
                );
              }}
              renderCourseExtras={(item) => (
                <>
                  {conflictLabelsOfClass(item).map((label) => (
                    <span key={label} className="mr-1 mt-1 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-rose-700">
                      {label}
                    </span>
                  ))}
                </>
              )}
            />
          )}

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
        </div>
      )}
      {viewMode === "grid" && (
        <div className="bg-slate-50/20 p-5 space-y-4 font-sans">
          {selectedSectionId !== "All" && summary}
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
          ) : filteredSchedules.length === 0 && focus ? (
            focusEmptyState("meetings in the loaded timetable")
          ) : filteredSchedules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-400">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h4 className="font-extrabold text-slate-700 text-sm">No Schedules Found</h4>
              <p className="text-xs font-medium text-slate-400 mt-1">No schedules match this grid scope.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <WeeklyTimetableGrid
                days={DAYS}
                slotCount={gridRange.end - gridRange.start}
                startSlot={gridRange.start}
                minWidth={1120}
                getTimeLabel={slotToTimeStr12h}
                getDayCount={(dayIndex) => filteredSchedules.filter((schedule) => schedule.day === DAYS[dayIndex]).length}
              >
                  {DAYS.map((day, dayIndex) => {
                    const daySchedules = filteredSchedules.filter((schedule) => schedule.day === day);
                    const layouts = getDayLayouts(daySchedules);
                    return (
                      <React.Fragment key={day}>
                          {daySchedules.map((schedule) => {
                            const startIdx = parseTimeToSlotIndex(schedule.startTime);
                            const endIdx = parseTimeToSlotIndex(schedule.endTime);
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
                                className={`z-10 border-2 border-l-4 p-2.5 flex flex-col justify-between text-left select-none rounded-xl shadow-sm hover:shadow-md hover:scale-[1.02] hover:-translate-y-0.5 transition-all overflow-hidden box-border leading-snug cursor-pointer ${
                                  conflicts.length > 0 
                                    ? "border-red-300 border-l-red-600 bg-red-50 text-red-800 ring-2 ring-red-200" 
                                    : getDeptStyles(schedule.departmentCode)
                                }`}
                                style={{
                                  gridColumn: dayIndex + 2,
                                  gridRow: `${startIdx - gridRange.start + 2} / span ${Math.max(1, endIdx - startIdx)}`,
                                  height: `${Math.max(VIEWER_SLOT_HEIGHT_PX, height) - 4}px`,
                                  marginTop: "2px",
                                  marginLeft: `calc(${left} + 2px)`,
                                  width: `calc(${width} - 4px)`,
                                }}
                              >
                                <div className="min-w-0 w-full">
                                  <div className="flex items-center justify-between gap-1 w-full">
                                    <span className="font-extrabold text-xs tracking-wider leading-none truncate max-w-[65%] flex items-center gap-1">
                                      <span>{schedule.subjectCode || "Subject"}</span>
                                      {schedule.meetingType && (
                                        <span className="text-[8px] bg-slate-200/80 text-slate-800 border border-slate-300 rounded px-1 font-black shrink-0">
                                          {schedule.meetingType === 'laboratory' ? 'Lab' : 'Lec'}
                                        </span>
                                      )}
                                    </span>
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
                      </React.Fragment>
                    );
                  })}
              </WeeklyTimetableGrid>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55">
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
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                      <p className="font-bold text-slate-700 text-[11px] leading-tight mt-0.5 break-words">{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {selectedClassParts.length > 1 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">All meetings of this class</p>
                  <ul className="mt-1.5 space-y-1">
                    {selectedClassParts.map((part, index) => (
                      <li key={index} className="text-[11px] font-bold text-slate-700">
                        {part.dayLabel} · {timeRangeLabel(part.start, part.end)}
                        {part.meeting && <span className="ml-1 text-[10px] uppercase text-slate-400">{part.meeting === "laboratory" ? "Lab" : "Lec"}</span>}
                        <span className="font-semibold text-slate-500"> · {part.room} · {part.faculty}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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

      <PrintSchedule
        sections={pdfSections}
        departments={pdfDepartments}
        users={users}
        isPrintModalOpen={isPrintModalOpen}
        setIsPrintModalOpen={setIsPrintModalOpen}
        allSchedules={pdfSchedules}
        selectedSectionId={selectedSectionId !== "All" ? selectedSectionId : (pdfSections[0]?.id ?? "")}
        activeSemester={activeSemester}
        printAllSections={selectedSectionId === "All"}
      />
    </div>
  );
}






