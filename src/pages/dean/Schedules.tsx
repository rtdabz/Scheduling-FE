import { useMemo, useState, useEffect } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { AlertTriangle, Calendar, GanttChart, Info, Layers, List, MapPin, RefreshCw, User, X } from "lucide-react";
import api from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import DataTable from "../../components/ui/DataTable";
import SearchInput from "../../components/ui/SearchInput";
import { getCachedData, hasCachedData, setCachedData } from "../../lib/dataCache";
import { useLiveRevision } from "../../hooks/useLiveRefresh";
import MasterGantt from "../vpaa/calendar/MasterGantt";
import {
  buildGanttDays,
  buildTimeWindow,
  findOverlaps,
  type CalendarSchedule,
  type GroupBy,
  type StandardHours,
} from "../vpaa/calendar/ganttLayout";
import type { ZoomLevel } from "../vpaa/calendar/ganttPresentation";
import { gridOpeningMinutes, slotCount, slotMinutes, slotToTimeLabel, timeToSlot } from "../../lib/timeGrid";

interface Section {
  id: string;
  name: string;
  departmentName: string;
}

type SubjectCategory = "major" | "minor";

interface Schedule {
  id: string;
  sectionId: string;
  sectionName: string;
  departmentName: string;
  departmentCode: string;
  subjectCode: string;
  subjectName: string;
  subjectCategory: SubjectCategory;
  meetingType?: "lecture" | "laboratory" | null;
  facultyId: string;
  facultyName: string | null;
  roomId: string;
  roomName: string;
  day: "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
  startTime: string;
  endTime: string;
  mode: "on-site" | "online" | "field";
}

interface StoredUser {
  department_id?: number | string;
  department?: {
    department_name?: string;
  };
}

interface Semester {
  id: number | string;
}

interface RawSection {
  id: number | string;
  section_name: string;
  department_id?: number | string | null;
  semester_id?: number | string | null;
  department?: {
    department_name?: string;
    department_code?: string;
  } | null;
}

interface RawSchedule {
  id: number | string;
  section_id?: number | string | null;
  department_id?: number | string | null;
  faculty_id?: number | string | null;
  room_id?: number | string | null;
  semester_id?: number | string | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: Schedule["mode"];
  meeting_type?: "lecture" | "laboratory" | null;
  section?: {
    section_name?: string;
  } | null;
  department?: {
    department_name?: string;
    department_code?: string;
  } | null;
  course?: {
    course_code?: string;
    course_name?: string;
    course_category?: SubjectCategory;
  } | null;
  subject?: {
    subject_code?: string;
    subject_name?: string;
    subject_category?: SubjectCategory;
  } | null;
  faculty?: {
    first_name?: string;
    last_name?: string;
  } | null;
  room?: {
    room_code?: string;
    building?: string | null;
  } | null;
}

interface DeanSchedulesPageData {
  sections: Section[];
  schedules: Schedule[];
}

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

const DAYS_MAP: Schedule["day"][] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const timeStrToSlot = (timeStr: string): number => {
  return timeToSlot(timeStr);
};

const slotToTimeStr12h = (slotIndex: number): string => {
  return slotToTimeLabel(slotIndex);
};

const DAYS: Schedule["day"][] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const parseTimeToSlot = (time: string): number => {
  // slotToTimeLabel drops ":00" on the hour ("7 AM", not "7:00 AM"), so the
  // minutes are optional here. Requiring them made every whole-hour time fall
  // through to slot 0, which read as a mutual overlap and raised phantom
  // room/section conflicts on rows that never overlapped.
  const match = time.match(/^(\d+)(?::(\d+))?\s*(AM|PM)$/i);
  if (!match) return 0;
  let hour = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return Math.max(0, ((hour * 60 + minutes) - gridOpeningMinutes()) / slotMinutes());
};

const getModeLabel = (mode: Schedule["mode"]) => {
  if (mode === "on-site") return "On-Site";
  if (mode === "online") return "Online";
  return "Field";
};

const getGridModeBadgeClass = (mode: Schedule["mode"]) => {
  switch (mode) {
    case "on-site":
      return "bg-blue-100 text-blue-700";
    case "online":
      return "bg-green-100 text-green-700";
    case "field":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const isAssignedFaculty = (schedule: Schedule) => (
  !!schedule.facultyName?.trim() && schedule.facultyName.trim().toLowerCase() !== "unassigned"
);

const isAssignedRoom = (schedule: Schedule) => (
  !!schedule.roomName.trim() && schedule.roomName.trim().toLowerCase() !== "unassigned"
);

const schedulesOverlap = (left: Schedule, right: Schedule) => {
  if (left.day !== right.day) return false;
  const leftStart = parseTimeToSlot(left.startTime);
  const leftEnd = parseTimeToSlot(left.endTime);
  const rightStart = parseTimeToSlot(right.startTime);
  const rightEnd = parseTimeToSlot(right.endTime);
  return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
};

const buildConflictMap = (items: Schedule[]) => {
  const map = new Map<string, ScheduleConflictInfo>();
  items.forEach((item) => map.set(item.id, { faculty: false, room: false, section: false }));

  for (let index = 0; index < items.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < items.length; compareIndex += 1) {
      const left = items[index];
      const right = items[compareIndex];
      if (!schedulesOverlap(left, right)) continue;

      const leftInfo = map.get(left.id);
      const rightInfo = map.get(right.id);
      if (!leftInfo || !rightInfo) continue;

      if (left.sectionId && left.sectionId === right.sectionId) {
        leftInfo.section = true;
        rightInfo.section = true;
      }
      if (isAssignedFaculty(left) && left.facultyId && left.facultyId === right.facultyId) {
        leftInfo.faculty = true;
        rightInfo.faculty = true;
      }
      if (
        isAssignedRoom(left)
        && left.roomId
        && left.roomId === right.roomId
        && left.roomName !== "Online"
        && left.roomName !== "Field"
      ) {
        leftInfo.room = true;
        rightInfo.room = true;
      }
    }
  }

  return map;
};

const getConflictLabels = (info?: ScheduleConflictInfo) => {
  if (!info) return [];
  return [
    info.faculty ? "Faculty Conflict" : "",
    info.room ? "Room Conflict" : "",
    info.section ? "Section Conflict" : "",
  ].filter(Boolean);
};

/** Day first, then start time: the order a week is read in. */
const scheduleSortKey = (schedule: Schedule) => DAYS.indexOf(schedule.day) * 10_000 + parseTimeToSlot(schedule.startTime);

type ViewMode = "table" | "grid";

/** "1:30 PM" -> "13:30", the shape the shared Gantt reads. */
const to24h = (label: string): string => {
  const match = label.match(/^(\d+)(?::(\d+))?\s*(AM|PM)$/i);
  if (!match) return "";
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(Number(match[2] ?? 0)).padStart(2, "0")}`;
};

const toNumberOrNull = (value: string): number | null => (value ? Number(value) : null);

/** Maps this page's rows onto the calendar shape so the VPAA Gantt renders them as-is. */
const toCalendarSchedule = (schedule: Schedule): CalendarSchedule => {
  const [firstName, ...rest] = (schedule.facultyName ?? "").split(" ");
  return {
    id: Number(schedule.id),
    day: schedule.day,
    start_time: to24h(schedule.startTime),
    end_time: to24h(schedule.endTime),
    meeting_type: schedule.meetingType ?? null,
    mode: schedule.mode,
    // The Gantt colours each bar from the department code/name (IT is blue),
    // the same palette as the VPAA calendar. The id is not read for colour.
    department: { id: 0, department_code: schedule.departmentCode, department_name: schedule.departmentName },
    room_id: toNumberOrNull(schedule.roomId),
    room: schedule.roomId ? { id: Number(schedule.roomId), room_code: schedule.roomName } : null,
    faculty_id: toNumberOrNull(schedule.facultyId),
    faculty: schedule.facultyId && schedule.facultyName
      ? { id: Number(schedule.facultyId), first_name: firstName, last_name: rest.join(" ") }
      : null,
    section_id: toNumberOrNull(schedule.sectionId),
    section: schedule.sectionId ? { id: Number(schedule.sectionId), section_name: schedule.sectionName } : null,
    course: { course_code: schedule.subjectCode, course_name: schedule.subjectName },
  };
};

/** The configured teaching day, as every other timetable in the system uses. */
const currentStandardHours = (): StandardHours => ({
  opening: gridOpeningMinutes(),
  closing: gridOpeningMinutes() + slotCount() * slotMinutes(),
  slotMinutes: slotMinutes(),
});

export default function DeanScheduleViewer() {
  const [selectedSectionId, setSelectedSectionId] = useState("All");
  const [selectedMode, setSelectedMode] = useState("All");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [searchTerm, setSearchTerm] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const userDeptId = user?.department_id;
  const userDeptName = user?.department?.department_name || "College of Information Technology";
  const deanSchedulesCacheKey = `page:dean-schedules:${userDeptId ?? 'all'}`;
  const cachedDeanSchedulesData = getCachedData<DeanSchedulesPageData>(deanSchedulesCacheKey);
  const [sections, setSections] = useState<Section[]>(cachedDeanSchedulesData?.sections ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cachedDeanSchedulesData?.schedules ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(deanSchedulesCacheKey));
  const liveRevision = useLiveRevision(['schedules', 'sections', 'approvals']);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  useEffect(() => {
    if (liveRevision === 0 && hasCachedData(deanSchedulesCacheKey)) {
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        if (liveRevision === 0) setIsLoading(true);
        const response = await api.get<{
          active_semester: Semester | null;
          sections: RawSection[];
          schedules: RawSchedule[];
        }>('/initial-data');
        const semester = response.data.active_semester;

        let rawSections = response.data.sections;
        if (semester) {
          rawSections = rawSections.filter((s) => Number(s.semester_id) === Number(semester.id));
        }
        if (userDeptId) {
          rawSections = rawSections.filter((s) => Number(s.department_id) === Number(userDeptId));
        }
        const mappedSections = rawSections.map((s) => ({
            id: s.id.toString(),
            name: s.section_name,
            departmentName: s.department?.department_name ?? ""
        }));
        setSections(mappedSections);

        let rawSchedules = response.data.schedules;
        if (semester) {
          rawSchedules = rawSchedules.filter((s) => Number(s.semester_id) === Number(semester.id));
        }
        if (userDeptId) {
          rawSchedules = rawSchedules.filter((s) => Number(s.department_id) === Number(userDeptId));
        }

        const mappedSchedules: Schedule[] = rawSchedules.map((item) => {
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
            sectionId: item.section_id ? item.section_id.toString() : "",
            sectionName: item.section?.section_name ?? "",
            departmentName: item.department?.department_name ?? userDeptName,
            departmentCode: item.department?.department_code ?? "",
            subjectCode: item.course?.course_code ?? item.subject?.subject_code ?? "",
            subjectName: item.course?.course_name ?? item.subject?.subject_name ?? "",
            subjectCategory: (item.course?.course_category ?? item.subject?.subject_category ?? "major") as SubjectCategory,
            meetingType: item.meeting_type ?? null,
            facultyId: item.faculty_id ? item.faculty_id.toString() : "",
            facultyName: item.faculty ? `${item.faculty.first_name ?? ""} ${item.faculty.last_name ?? ""}`.trim() : null,
            roomId: item.room_id ? item.room_id.toString() : "",
            roomName,
            day: DAYS_MAP[dayIndex] || "Monday",
            startTime: slotToTimeStr12h(startSlot),
            endTime: slotToTimeStr12h(endSlot),
            mode: item.mode ?? "on-site"
          };
        });
        setSchedules(mappedSchedules);
        setCachedData<DeanSchedulesPageData>(deanSchedulesCacheKey, {
          sections: mappedSections,
          schedules: mappedSchedules,
        });
      } catch {
        // Safe empty catch block
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [deanSchedulesCacheKey, userDeptId, userDeptName, liveRevision]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      if (selectedSectionId !== "All" && schedule.sectionId !== selectedSectionId) return false;
      if (selectedMode !== "All" && schedule.mode !== selectedMode) return false;
      return true;
    });
  }, [schedules, selectedMode, selectedSectionId]);

  // Built over the whole department, not the filtered view: a faculty or room
  // clash with a class in another section is still a clash when that section
  // is filtered out.
  const conflictMap = useMemo(() => buildConflictMap(schedules), [schedules]);

  const tableRows = useMemo(
    () => [...filteredSchedules].sort((left, right) => scheduleSortKey(left) - scheduleSortKey(right)),
    [filteredSchedules],
  );

  const columns = useMemo<ColumnDef<Schedule>[]>(() => [
    {
      id: "course",
      header: "Course",
      accessorFn: (row) => `${row.subjectCode} ${row.subjectName}`,
      cell: ({ row }) => {
        const schedule = row.original;
        const showMeetingType = schedule.subjectCategory === "major" && !!schedule.meetingType;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-black text-slate-800">{schedule.subjectCode}</span>
              {showMeetingType && (
                <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${schedule.meetingType === "laboratory" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
                  {schedule.meetingType === "laboratory" ? "Lab" : "Lec"}
                </span>
              )}
            </div>
            <p className="max-w-[260px] truncate text-[11px] font-medium text-slate-500" title={schedule.subjectName}>{schedule.subjectName}</p>
          </div>
        );
      },
    },
    { id: "section", header: "Section", accessorFn: (row) => row.sectionName || "Unassigned" },
    {
      id: "schedule",
      header: "Day & Time",
      accessorFn: (row) => `${row.day} ${row.startTime} - ${row.endTime}`,
      sortingFn: (left, right) => scheduleSortKey(left.original) - scheduleSortKey(right.original),
      cell: ({ row }) => (
        <div>
          <p className="font-bold text-slate-800">{row.original.day}</p>
          <p className="text-[11px] font-medium text-slate-500">{row.original.startTime} - {row.original.endTime}</p>
        </div>
      ),
    },
    { id: "room", header: "Room", accessorFn: (row) => row.roomName || "Unassigned" },
    { id: "faculty", header: "Faculty", accessorFn: (row) => row.facultyName || "Unassigned" },
    {
      id: "mode",
      header: "Mode",
      accessorFn: (row) => getModeLabel(row.mode),
      cell: ({ row }) => (
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getGridModeBadgeClass(row.original.mode)}`}>
          {getModeLabel(row.original.mode)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => getConflictLabels(conflictMap.get(row.id)).join(", ") || "No conflict",
      cell: ({ row }) => {
        const labels = getConflictLabels(conflictMap.get(row.original.id));
        return labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <span key={label} className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">{label}</span>
            ))}
          </div>
        ) : (
          <span className="text-[11px] font-bold text-emerald-700">No conflict</span>
        );
      },
    },
  ], [conflictMap]);

  const table = useReactTable<Schedule>({
    data: tableRows,
    columns,
    state: { globalFilter: searchTerm, sorting, pagination },
    onGlobalFilterChange: setSearchTerm,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const resetPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));
  const showGrid = viewMode === "grid";

  // Gantt view: the filtered rows laid out as a weekly timeline.
  const [ganttGroupBy, setGanttGroupBy] = useState<GroupBy>("none");
  const [ganttZoom, setGanttZoom] = useState<ZoomLevel>("fit");
  const [collapsedGanttDays, setCollapsedGanttDays] = useState<ReadonlySet<number>>(new Set());
  const [ganttNow] = useState(() => new Date());
  const scheduleById = useMemo(() => new Map(schedules.map((schedule) => [Number(schedule.id), schedule])), [schedules]);
  // Department-wide, like conflictMap, so a clash with another section is still outlined.
  const ganttOverlaps = useMemo(() => findOverlaps(schedules.map(toCalendarSchedule)), [schedules]);
  const ganttSchedules = useMemo(() => filteredSchedules.map(toCalendarSchedule), [filteredSchedules]);
  const ganttVisibleDays = useMemo(
    () => (filteredSchedules.some((schedule) => schedule.day === "Sunday") ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5]),
    [filteredSchedules],
  );
  const ganttStandardHours = useMemo(currentStandardHours, []);
  const ganttDays = useMemo(
    () => buildGanttDays(ganttSchedules, ganttGroupBy, ganttVisibleDays),
    [ganttSchedules, ganttGroupBy, ganttVisibleDays],
  );
  const ganttTimeWindow = useMemo(() => buildTimeWindow(ganttStandardHours, ganttSchedules), [ganttStandardHours, ganttSchedules]);

  const handleResetFilters = () => {
    setSelectedSectionId("All");
    setSelectedMode("All");
    setSearchTerm("");
    setSorting([]);
    setViewMode("table");
    resetPage();
  };


  return (
    <div id="schedules-page">
      <div id="schedules-list" className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
            <SearchInput
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); resetPage(); }}
              placeholder="Search course, section, room, faculty..."
              containerClassName="relative w-full sm:w-72"
              className="!py-2 !text-xs"
            />
            <select
              value={selectedSectionId}
              onChange={(event) => { setSelectedSectionId(event.target.value); resetPage(); }}
              className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#4e0a10] cursor-pointer"
            >
              <option value="All">All Sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
            <select
              value={selectedMode}
              onChange={(event) => { setSelectedMode(event.target.value); resetPage(); }}
              className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#4e0a10] cursor-pointer"
            >
              <option value="All">All Modes</option>
              <option value="on-site">On-Site</option>
              <option value="online">Online</option>
              <option value="field">Field</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex h-9 rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm" role="group" aria-label="View">
              {([
                { value: "table", label: "Table", icon: List },
                { value: "grid", label: "Gantt", icon: GanttChart },
              ] as const).map(({ value, label, icon: Icon }) => {
                const active = value === "table" ? !showGrid : showGrid;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setViewMode(value)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${active ? "bg-[#4e0a10] text-[#E8D5C4]" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 px-4 h-9 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition-all duration-150 shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-[#C9952A]/10 px-4 py-2.5 text-xs font-semibold text-[#4e0a10]">
          Simultaneous classes are not necessarily conflicts. Only Faculty, Room, or Section conflicts are marked in red.
        </div>

        {!showGrid ? (
          <DataTable
            table={table}
            isLoading={isLoading}
            variant="embedded"
            totalLabel="classes"
            ariaLabel="Department schedules"
            emptyTitle="No schedules match the selected filters."
            emptyDescription="Try another search, section, or class mode."
            onRowClick={setSelectedSchedule}
            rowClassName={(row) => (getConflictLabels(conflictMap.get(row.id)).length > 0 ? "!bg-red-50/60" : "")}
          />
        ) : isLoading ? (
          <div className="p-4"><Skeleton className="h-[420px] w-full rounded-xl" /></div>
        ) : filteredSchedules.length === 0 ? (
          <div className="m-4 min-h-[320px] rounded-2xl border border-dashed border-slate-200 bg-white flex flex-col items-center justify-center text-center p-8">
            <Calendar className="w-10 h-10 text-slate-300 mb-3" />
            <h3 className="text-sm font-black text-slate-700">No schedules match the selected filters.</h3>
            <p className="text-xs font-medium text-slate-400 mt-1">Try another section or class mode.</p>
          </div>
        ) : (
          <section aria-label="Gantt timeline" className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-black text-[#4e0a10]">Gantt timeline</h2>
              <select
                aria-label="Timeline rows"
                value={ganttGroupBy}
                onChange={(event) => setGanttGroupBy(event.target.value as GroupBy)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
              >
                <option value="none">Day only</option>
                <option value="room">By room</option>
                <option value="instructor">By instructor</option>
                <option value="section">By section</option>
              </select>
              <select
                aria-label="Timeline zoom"
                value={ganttZoom}
                onChange={(event) => setGanttZoom(event.target.value as ZoomLevel)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
              >
                <option value="fit">Fit</option>
                <option value="normal">1×</option>
                <option value="wide">2×</option>
              </select>
              <span className="ml-auto text-xs font-semibold text-slate-500">Select a class for details.</span>
            </div>
            <MasterGantt
              days={ganttDays}
              timeWindow={ganttTimeWindow}
              standardHours={ganttStandardHours}
              groupBy={ganttGroupBy}
              zoom={ganttZoom}
              density="comfortable"
              overlaps={ganttOverlaps}
              collapsedDays={collapsedGanttDays}
              onToggleDay={(day) => setCollapsedGanttDays((current) => {
                const next = new Set(current);
                if (next.has(day)) next.delete(day);
                else next.add(day);
                return next;
              })}
              onSelect={(calendarSchedule) => {
                const schedule = scheduleById.get(calendarSchedule.id);
                if (schedule) setSelectedSchedule(schedule);
              }}
              now={ganttNow}
              className="h-[420px] min-h-[260px]"
            />
          </section>
        )}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-slate-400" />
            Read-only department schedule
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            {userDeptName}
          </span>
        </div>
      </div>

      {selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-[#F7F4F0] p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-black uppercase tracking-wider text-[#C9952A]">{selectedSchedule.subjectCode}</p>
                  {selectedSchedule.subjectCategory === "major" && selectedSchedule.meetingType && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                      selectedSchedule.meetingType === "laboratory"
                        ? "border-violet-200 bg-violet-50 text-violet-700"
                        : "border-sky-200 bg-sky-50 text-sky-700"
                    }`}>
                      {selectedSchedule.meetingType === "laboratory" ? "Lab" : "Lec"}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-black leading-tight text-[#4e0a10]">{selectedSchedule.subjectName}</h3>
              </div>
              <button type="button" onClick={() => setSelectedSchedule(null)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              {[
                { icon: Layers, label: "Section", value: selectedSchedule.sectionName },
                { icon: MapPin, label: "Room", value: selectedSchedule.roomName || "Unassigned" },
                { icon: User, label: "Faculty", value: selectedSchedule.facultyName ?? "Unassigned" },
                { icon: Calendar, label: "Schedule", value: `${selectedSchedule.day}, ${selectedSchedule.startTime} - ${selectedSchedule.endTime}` },
                { icon: Info, label: "Mode", value: getModeLabel(selectedSchedule.mode) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#C9952A]" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="font-semibold text-slate-700">{value}</p>
                  </div>
                </div>
              ))}
              {getConflictLabels(conflictMap.get(selectedSchedule.id)).length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-600">
                  <div className="mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    Confirmed conflict
                  </div>
                  {getConflictLabels(conflictMap.get(selectedSchedule.id)).join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




