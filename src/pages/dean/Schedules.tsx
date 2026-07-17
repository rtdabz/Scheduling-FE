import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, Calendar, Clock, Info, Layers, MapPin, RefreshCw, User, X } from "lucide-react";
import api from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";
import { getCachedData, hasCachedData, setCachedData } from "../../lib/dataCache";

interface Section {
  id: string;
  name: string;
  departmentName: string;
}

type SubjectCategory = "major" | "gec" | "gee" | "pathfit" | "nstp";

interface Schedule {
  id: string;
  sectionId: string;
  sectionName: string;
  departmentName: string;
  departmentCode: string;
  subjectCode: string;
  subjectName: string;
  subjectCategory: SubjectCategory;
  facultyId: string;
  facultyName: string | null;
  roomId: string;
  roomName: string;
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
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

interface Term {
  id: number | string;
}

interface RawSection {
  id: number | string;
  section_name: string;
  department_id?: number | string | null;
  term_id?: number | string | null;
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
  term_id?: number | string | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: Schedule["mode"];
  section?: {
    section_name?: string;
  } | null;
  department?: {
    department_name?: string;
    department_code?: string;
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
    room_name?: string | null;
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

interface ScheduleLaneLayout {
  schedule: Schedule;
  lane: number;
  laneCount: number;
}

interface OverflowGroup {
  day: Schedule["day"];
  topSlot: number;
  endSlot: number;
  schedules: Schedule[];
  hiddenCount: number;
}

const dayMapToIndex: Record<string, number> = {
  "Monday": 0,
  "Tuesday": 1,
  "Wednesday": 2,
  "Thursday": 3,
  "Friday": 4,
  "Saturday": 5,
  "Sunday": 6
};

const DAYS_MAP: Schedule["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

const DAYS: Schedule["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const START_HOUR = 7;
const END_HOUR = 21;
const SLOT_HEIGHT_PX = 24;

const slotToTime = (slotIndex: number): string => {
  const totalMinutes = START_HOUR * 60 + slotIndex * 30;
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
};

const parseTimeToSlot = (time: string): number => {
  const match = time.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!match) return 0;
  let hour = Number(match[1]);
  const minutes = Number(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return Math.max(0, ((hour * 60 + minutes) - START_HOUR * 60) / 30);
};

const getModeLabel = (mode: Schedule["mode"]) => {
  if (mode === "on-site") return "On-Site";
  if (mode === "online") return "Online";
  return "Field";
};

const normalizeDepartmentKey = (code: string, name: string) => {
  const normalizedCode = code.trim().toUpperCase();
  const value = name.toLowerCase();
  if (value.includes("gee") || value.includes("general education elective")) return "GEE";
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

const getDepartmentCardStyles = (code: string, name: string, category: SubjectCategory) => {
  if (category === "gee") {
    return { container: "border-purple-400 border-l-purple-600 bg-purple-50", text: "text-purple-700" };
  }

  switch (normalizeDepartmentKey(code, name)) {
    case "IT":
      return { container: "border-blue-400 border-l-blue-700 bg-blue-50", text: "text-blue-800" };
    case "AS":
      return { container: "border-red-400 border-l-red-600 bg-red-50", text: "text-red-800" };
    case "EDUC":
      return { container: "border-orange-400 border-l-orange-600 bg-orange-50", text: "text-orange-800" };
    case "BA":
      return { container: "border-yellow-400 border-l-yellow-600 bg-yellow-50", text: "text-yellow-800" };
    case "HM":
      return { container: "border-lime-400 border-l-lime-600 bg-lime-50", text: "text-lime-800" };
    case "MID":
      return { container: "border-green-400 border-l-green-600 bg-green-50", text: "text-green-800" };
    case "CRIM":
      return { container: "border-[#6b0f1a] border-l-[#4e0a10] bg-[#4e0a10]/10", text: "text-[#4e0a10]" };
    case "LIS":
      return { container: "border-pink-400 border-l-pink-600 bg-pink-50", text: "text-pink-800" };
    default:
      return { container: "border-purple-400 border-l-purple-600 bg-purple-50", text: "text-purple-700" };
  }
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

const buildDayLayouts = (daySchedules: Schedule[]) => {
  const sorted = [...daySchedules].sort((left, right) => parseTimeToSlot(left.startTime) - parseTimeToSlot(right.startTime));
  const clusters: Schedule[][] = [];

  sorted.forEach((schedule) => {
    const cluster = clusters.find((items) => items.some((item) => schedulesOverlap(item, schedule)));
    if (cluster) {
      cluster.push(schedule);
    } else {
      clusters.push([schedule]);
    }
  });

  const layouts = new Map<string, ScheduleLaneLayout>();
  const overflowGroups: OverflowGroup[] = [];

  clusters.forEach((cluster) => {
    const lanes: Schedule[][] = [];
    cluster.forEach((schedule) => {
      let laneIndex = 0;
      while (lanes[laneIndex]?.some((item) => schedulesOverlap(item, schedule))) {
        laneIndex += 1;
      }
      lanes[laneIndex] = [...(lanes[laneIndex] ?? []), schedule];
    });

    const laneCount = lanes.length > 3 ? 4 : Math.max(1, lanes.length);
    cluster.forEach((schedule) => {
      const lane = lanes.findIndex((items) => items.some((item) => item.id === schedule.id));
      if (lane < 3) {
        layouts.set(schedule.id, { schedule, lane, laneCount });
      }
    });

    if (lanes.length > 3) {
      const hiddenSchedules = cluster.filter((schedule) => {
        const lane = lanes.findIndex((items) => items.some((item) => item.id === schedule.id));
        return lane >= 3;
      });
      const topSlot = Math.min(...cluster.map((schedule) => parseTimeToSlot(schedule.startTime)));
      const endSlot = Math.max(...cluster.map((schedule) => parseTimeToSlot(schedule.endTime)));
      overflowGroups.push({
        day: cluster[0].day,
        topSlot,
        endSlot,
        schedules: cluster,
        hiddenCount: hiddenSchedules.length,
      });
    }
  });

  return { layouts, overflowGroups };
};

export default function DeanScheduleViewer() {
  const [selectedSectionId, setSelectedSectionId] = useState("All");
  const [selectedMode, setSelectedMode] = useState("All");
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const userDeptId = user?.department_id;
  const userDeptName = user?.department?.department_name || "College of Information Technology";
  const deanSchedulesCacheKey = `page:dean-schedules:${userDeptId ?? 'all'}`;
  const cachedDeanSchedulesData = getCachedData<DeanSchedulesPageData>(deanSchedulesCacheKey);
  const [sections, setSections] = useState<Section[]>(cachedDeanSchedulesData?.sections ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cachedDeanSchedulesData?.schedules ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(deanSchedulesCacheKey));
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [selectedOverflowGroup, setSelectedOverflowGroup] = useState<OverflowGroup | null>(null);

  useEffect(() => {
    if (hasCachedData(deanSchedulesCacheKey)) {
      setIsLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        const termRes = await api.get<Term | null>('/terms/active');
        const term = termRes.data;

        const [sectionsRes, schedulesRes] = await Promise.all([
          api.get<RawSection[]>('/sections'),
          api.get<RawSchedule[]>('/schedules')
        ]);

        let rawSections = sectionsRes.data;
        if (term) {
          rawSections = rawSections.filter((s) => Number(s.term_id) === Number(term.id));
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

        let rawSchedules = schedulesRes.data;
        if (term) {
          rawSchedules = rawSchedules.filter((s) => Number(s.term_id) === Number(term.id));
        }
        if (userDeptId) {
          rawSchedules = rawSchedules.filter((s) => Number(s.department_id) === Number(userDeptId));
        }

        const mappedSchedules: Schedule[] = rawSchedules.map((item) => {
          let roomName = "";
          if (item.room) {
            if (item.room.room_code === "ONLINE") roomName = "Online";
            else if (item.room.room_code === "FIELD") roomName = "Field";
            else roomName = item.room.room_code + (item.room.room_name ? ` - ${item.room.room_name}` : '');
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
            subjectCode: item.subject?.subject_code ?? "",
            subjectName: item.subject?.subject_name ?? "",
            subjectCategory: item.subject?.subject_category ?? "major",
            facultyId: item.faculty_id ? item.faculty_id.toString() : "",
            facultyName: item.faculty ? `${item.faculty.first_name ?? ""} ${item.faculty.last_name ?? ""}`.trim() : null,
            roomId: item.room_id ? item.room_id.toString() : "",
            roomName,
            day: DAYS_MAP[dayIndex] || "Mon",
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
      } catch (err) {
        // Safe empty catch block
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [deanSchedulesCacheKey, userDeptId, userDeptName]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      if (selectedSectionId !== "All" && schedule.sectionId !== selectedSectionId) return false;
      if (selectedMode !== "All" && schedule.mode !== selectedMode) return false;
      return true;
    });
  }, [schedules, selectedMode, selectedSectionId]);

  const conflictMap = useMemo(() => buildConflictMap(filteredSchedules), [filteredSchedules]);

  const gridRange = useMemo(() => {
    if (filteredSchedules.length === 0) {
      return { start: 0, end: 8 };
    }
    const start = Math.max(0, Math.min(...filteredSchedules.map((schedule) => parseTimeToSlot(schedule.startTime))) - 1);
    const end = Math.min((END_HOUR - START_HOUR) * 2, Math.max(...filteredSchedules.map((schedule) => parseTimeToSlot(schedule.endTime))) + 1);
    return { start, end: Math.max(end, start + 4) };
  }, [filteredSchedules]);

  const timeSlots = useMemo(() => (
    Array.from({ length: gridRange.end - gridRange.start }, (_, index) => slotToTime(gridRange.start + index))
  ), [gridRange]);

  const sectionSummaries = useMemo(() => (
    sections.map((section) => {
      const sectionSchedules = schedules.filter((schedule) => (
        schedule.sectionId === section.id && (selectedMode === "All" || schedule.mode === selectedMode)
      ));
      const sectionConflictMap = buildConflictMap(sectionSchedules);
      const conflictLabels = Array.from(new Set(sectionSchedules.flatMap((schedule) => getConflictLabels(sectionConflictMap.get(schedule.id)))));
      return {
        section,
        schedules: sectionSchedules,
        conflictLabels,
      };
    })
  ), [sections, schedules, selectedMode]);

  const handleResetFilters = () => {
    setSelectedSectionId("All");
    setSelectedMode("All");
  };



  return (
    <div>
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Schedules / All Schedules</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">All Schedules</h1>
        <p className="text-muted text-sm mt-1">View class schedules for your department</p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-row items-center justify-between gap-4">
          <div className="flex flex-row items-center gap-3">
            <select
              value={selectedSectionId}
              onChange={(event) => setSelectedSectionId(event.target.value)}
              className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#4e0a10] cursor-pointer"
            >
              <option value="All">All Sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
            <select
              value={selectedMode}
              onChange={(event) => setSelectedMode(event.target.value)}
              className="h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#4e0a10] cursor-pointer"
            >
              <option value="All">All Modes</option>
              <option value="on-site">On-Site</option>
              <option value="online">Online</option>
              <option value="field">Field</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 px-4 h-9 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition-all duration-150 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Filters
          </button>
        </div>

        <div className="border-b border-slate-200 bg-[#C9952A]/10 px-4 py-3 text-sm font-semibold text-[#4e0a10]">
          Simultaneous classes are not necessarily conflicts. Only Faculty Conflict, Room Conflict, or Section Conflict items are marked in red.
        </div>

        {selectedSectionId === "All" ? (
          <div className="p-4 bg-slate-50/20">
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-black text-[#4e0a10]">Section Summary</h2>
                  <p className="text-xs font-semibold text-slate-500">Select a section to open the detailed Weekly Grid.</p>
                </div>
                <span className="text-xs font-bold text-slate-400">{sectionSummaries.length} sections</span>
              </div>
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[0, 1, 2].map((item) => <Skeleton key={item} className="h-14 w-full rounded-xl" />)}
                </div>
              ) : sectionSummaries.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400 italic">No sections found for this department.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sectionSummaries.map((summary) => (
                    <div key={summary.section.id} className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_1.1fr_auto] gap-3 px-4 py-4 text-sm items-center">
                      <p className="font-black text-slate-800">{summary.section.name}</p>
                      <p className="font-semibold text-slate-600">{summary.schedules.length} class{summary.schedules.length === 1 ? "" : "es"}</p>
                      <p className={summary.conflictLabels.length > 0 ? "font-bold text-red-600" : "font-bold text-emerald-700"}>
                        {summary.conflictLabels.length > 0 ? summary.conflictLabels.join(", ") : "No conflicts"}
                      </p>
                      <button
                        type="button"
                        disabled={summary.schedules.length === 0}
                        onClick={() => setSelectedSectionId(summary.section.id)}
                        className="h-10 rounded-xl bg-[#4e0a10] px-4 text-sm font-bold text-[#E8D5C4] hover:bg-[#C9952A] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                      >
                        View timetable
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : (
        <div className="overflow-auto p-4 bg-slate-50/20 max-h-[calc(100vh-260px)]">
          {filteredSchedules.length === 0 && !isLoading ? (
            <div className="min-h-[320px] rounded-2xl border border-dashed border-slate-200 bg-white flex flex-col items-center justify-center text-center p-8">
              <Calendar className="w-10 h-10 text-slate-300 mb-3" />
              <h3 className="text-sm font-black text-slate-700">No schedules match the selected filters.</h3>
              <p className="text-xs font-medium text-slate-400 mt-1">Try another section or class mode.</p>
            </div>
          ) : (
            <div className="min-w-[1100px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-[88px_repeat(6,minmax(0,1fr))]">
                <div className="sticky top-0 left-0 z-30 h-12 border-r border-b border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase">
                  Time
                </div>
                {DAYS.map((day) => (
                  <div key={day} className="sticky top-0 z-20 h-12 border-r last:border-r-0 border-b border-slate-200 bg-slate-50 flex flex-col items-center justify-center">
                    <span className="font-bold text-xs text-slate-700 uppercase">{day}</span>
                    <span className="text-[9px] font-bold text-slate-400">
                      {filteredSchedules.filter((schedule) => schedule.day === day).length} Classes
                    </span>
                  </div>
                ))}

                <div
                  className="col-span-7 grid relative"
                  style={{
                    gridTemplateColumns: "88px repeat(6, minmax(0, 1fr))",
                    gridTemplateRows: `repeat(${timeSlots.length}, ${SLOT_HEIGHT_PX}px)`
                  }}
                >
                  {timeSlots.map((slot, rowIndex) => (
                    <div key={`time-${slot}`} className="contents">
                      <div
                        className="sticky left-0 z-10 border-r border-b border-slate-100 bg-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-500"
                        style={{ gridColumn: 1, gridRow: rowIndex + 1 }}
                      >
                        {slot.includes(":00") ? slot : ""}
                      </div>
                      {DAYS.map((day, dayIndex) => (
                        <div
                          key={`${day}-${slot}`}
                          className="border-r last:border-r-0 border-b border-slate-100 bg-white"
                          style={{ gridColumn: dayIndex + 2, gridRow: rowIndex + 1 }}
                        />
                      ))}
                    </div>
                  ))}

                  {isLoading ? (
                    [
                      { id: 'sk-1', dayIndex: 0, startSlot: 2, height: 4 * SLOT_HEIGHT_PX, durationSlots: 4 },
                      { id: 'sk-2', dayIndex: 1, startSlot: 8, height: 3 * SLOT_HEIGHT_PX, durationSlots: 3 },
                      { id: 'sk-3', dayIndex: 2, startSlot: 4, height: 4 * SLOT_HEIGHT_PX, durationSlots: 4 },
                      { id: 'sk-4', dayIndex: 4, startSlot: 12, height: 3 * SLOT_HEIGHT_PX, durationSlots: 3 }
                    ].map((sk) => (
                      <div
                        key={sk.id}
                        className="rounded-xl border border-[#E2D9D0] bg-[#F7F4F0]/80 p-2 box-border overflow-hidden shadow-sm animate-pulse flex flex-col justify-between"
                        style={{ gridColumn: sk.dayIndex + 2, gridRow: `${sk.startSlot + 1} / span ${sk.durationSlots}`, height: `${sk.height}px` }}
                      >
                        <div className="flex flex-col h-full justify-between">
                          <div className="min-w-0">
                            <Skeleton className="h-3 w-16 mb-1.5" />
                            <Skeleton className="h-2.5 w-10 mb-1" />
                            <Skeleton className="h-2 w-12" />
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <Skeleton className="h-3.5 w-8 rounded-full" />
                            <Skeleton className="h-3.5 w-8 rounded-full" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    DAYS.map((day) => {
                      const daySchedules = filteredSchedules.filter((schedule) => schedule.day === day);
                      const { layouts, overflowGroups } = buildDayLayouts(daySchedules);
                      return (
                        <div key={`cards-${day}`} className="contents">
                          {daySchedules.map((schedule) => {
                            const layout = layouts.get(schedule.id);
                            if (!layout) return null;
                            const startSlot = parseTimeToSlot(schedule.startTime);
                            const endSlot = parseTimeToSlot(schedule.endTime);
                            const durationSlots = Math.max(1, endSlot - startSlot);
                            const height = durationSlots * SLOT_HEIGHT_PX;
                            const dayIndex = DAYS.indexOf(schedule.day);
                            const conflicts = getConflictLabels(conflictMap.get(schedule.id));
                            const laneWidth = 100 / layout.laneCount;
                            const showFullDetails = height >= 96;
                            const showMiddleDetails = height >= 72;
                            const gridStyles = getDepartmentCardStyles(schedule.departmentCode, schedule.departmentName, schedule.subjectCategory);
                            const modeBadgeClass = getGridModeBadgeClass(schedule.mode);

                            return (
                              <button
                                key={schedule.id}
                                type="button"
                                onClick={() => setSelectedSchedule(schedule)}
                                className={`rounded-xl border-2 border-l-4 p-2 box-border overflow-hidden shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-150 text-left ${conflicts.length > 0 ? "bg-red-50 text-red-800 border-red-300 border-l-red-600 ring-2 ring-red-200" : gridStyles.container}`}
                                style={{
                                  gridColumn: dayIndex + 2,
                                  gridRow: `${startSlot - gridRange.start + 1} / span ${durationSlots}`,
                                  height: `${height}px`,
                                  width: `calc(${laneWidth}% - 4px)`,
                                  marginLeft: `calc(${layout.lane * laneWidth}% + 2px)`,
                                }}
                              >
                                <div className="flex flex-col h-full justify-between min-w-0">
                                  <div className="min-w-0">
                                    <div className="flex items-start justify-between gap-1">
                                      <span className={`text-xs font-bold uppercase tracking-wide truncate ${conflicts.length > 0 ? "text-red-700" : gridStyles.text}`}>{schedule.subjectCode}</span>
                                      <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-bold shrink-0 ${conflicts.length > 0 ? "bg-red-100 text-red-700 border border-red-200" : modeBadgeClass}`}>
                                        {getModeLabel(schedule.mode)}
                                      </span>
                                    </div>
                                    <div className="text-[10px] font-semibold truncate mt-0.5">{schedule.sectionName}</div>
                                    {showMiddleDetails && <div className="text-[10px] font-medium truncate mt-0.5 opacity-90">{schedule.subjectName}</div>}
                                    {conflicts.length > 0 && <div className="text-[9px] font-black text-red-700 truncate mt-1">{conflicts.join(", ")}</div>}
                                  </div>
                                  <div className="space-y-0.5 text-[10px] opacity-80 border-t border-white/50 pt-1 mt-1">
                                    <div className="flex items-center gap-1 truncate">
                                      <MapPin className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{schedule.roomName || "Unassigned"}</span>
                                    </div>
                                    {showFullDetails && (
                                      <div className="flex items-center gap-1 truncate">
                                        <User className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{schedule.facultyName ?? "Unassigned"}</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1 truncate">
                                      <Clock className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{schedule.startTime} - {schedule.endTime}</span>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          })}

                          {overflowGroups.map((group) => {
                            const dayIndex = DAYS.indexOf(group.day);
                            return (
                              <button
                                key={`${group.day}-${group.topSlot}-${group.endSlot}`}
                                type="button"
                                onClick={() => setSelectedOverflowGroup(group)}
                                className="rounded-lg border border-[#C9952A]/40 bg-[#C9952A]/10 px-2 text-center text-[10px] font-black text-[#4e0a10] shadow-sm hover:bg-[#C9952A]/20 transition-colors"
                                style={{
                                  gridColumn: dayIndex + 2,
                                  gridRow: group.topSlot - gridRange.start + 1,
                                  height: "22px",
                                  width: "calc(25% - 4px)",
                                  marginLeft: "calc(75% + 2px)",
                                }}
                              >
                                View {group.hiddenCount} classes
                              </button>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
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

      {selectedOverflowGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-[#F7F4F0] p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#C9952A]">{selectedOverflowGroup.day}</p>
                <h3 className="text-lg font-black text-[#4e0a10]">{slotToTime(selectedOverflowGroup.topSlot)} - {slotToTime(selectedOverflowGroup.endSlot)}</h3>
                <p className="mt-1 text-xs font-semibold text-slate-500">All simultaneous classes in this time block.</p>
              </div>
              <button type="button" onClick={() => setSelectedOverflowGroup(null)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
              {selectedOverflowGroup.schedules.map((schedule) => {
                const conflicts = getConflictLabels(conflictMap.get(schedule.id));
                return (
                  <button key={schedule.id} type="button" onClick={() => { setSelectedSchedule(schedule); setSelectedOverflowGroup(null); }} className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left text-xs transition-colors hover:bg-slate-50 md:grid-cols-[1fr_0.7fr_1fr_1fr]">
                    <div className="min-w-0">
                      <p className="font-black text-slate-800">{schedule.subjectCode}</p>
                      <p className="truncate text-slate-500">{schedule.subjectName}</p>
                    </div>
                    <p className="font-semibold text-slate-700">{schedule.sectionName}</p>
                    <p className="truncate text-slate-600">{schedule.roomName || "Unassigned"}</p>
                    <div className="flex flex-wrap gap-1">
                      <span className="truncate text-slate-600">{schedule.facultyName ?? "Unassigned"}</span>
                      {conflicts.map((label) => (
                        <span key={label} className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">{label}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-[#F7F4F0] p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#C9952A]">{selectedSchedule.subjectCode}</p>
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




