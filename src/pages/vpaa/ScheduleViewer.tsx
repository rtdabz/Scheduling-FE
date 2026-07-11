import React, { useState, useEffect } from "react";
import {
  Filter,
  RefreshCw,
  Clock,
  MapPin,
  User,
  Layers,
  Info,
  Calendar
} from "lucide-react";
import api from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

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

export interface Schedule {
  id: string;
  sectionId: string;
  sectionName: string;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  subjectCode: string;
  subjectName: string;
  facultyName: string;
  roomName: string;
  day: string; // "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
  startTime: string; // e.g. "09:00 AM"
  endTime: string; // e.g. "10:30 AM"
  mode: 'on-site' | 'online' | 'field';
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


const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Grid configuration
const START_HOUR = 7; // 7:00 AM
const END_HOUR = 21; // 9:00 PM

// Department styling mapping
const getDeptStyles = (code: string) => {
  switch (code) {
    case "CAS":
      return "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100/60";
    case "CIT":
      return "bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100/60";
    case "CED":
      return "bg-purple-50 text-purple-800 border-purple-300 hover:bg-purple-100/60";
    case "CBA":
      return "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/60";
    case "CHM":
      return "bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100/60";
    case "CLIS":
      return "bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100/60";
    case "CCJPS":
      return "bg-red-50 text-red-800 border-red-300 hover:bg-red-100/60";
    default:
      return "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100/60";
  }
};

const getDeptBadgeStyles = (code: string) => {
  switch (code) {
    case "CAS": return "bg-amber-100 text-amber-800 border-amber-200";
    case "CIT": return "bg-blue-100 text-blue-800 border-blue-200";
    case "CED": return "bg-purple-100 text-purple-800 border-purple-200";
    case "CBA": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "CHM": return "bg-rose-100 text-rose-800 border-rose-200";
    case "CLIS": return "bg-sky-100 text-sky-800 border-sky-200";
    case "CCJPS": return "bg-red-100 text-red-800 border-red-200";
    default: return "bg-slate-100 text-slate-800 border-slate-200";
  }
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
const generateTimeSlots = () => {
  const slots = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour++) {
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;

    slots.push({
      start: `${h12}:00 ${ampm}`,
      end: `${h12}:30 ${ampm}`,
      label: `${h12}:00 ${ampm}`
    });

    const endH = hour + 1;
    const endAmpm = endH >= 12 ? "PM" : "AM";
    const endH12 = endH > 12 ? endH - 12 : endH === 0 ? 12 : endH;

    slots.push({
      start: `${h12}:30 ${ampm}`,
      end: `${endH12}:00 ${endAmpm}`,
      label: `${h12}:30 ${ampm}`
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

export default function ScheduleViewer() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeTerm, setActiveTerm] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters State
  const [selectedDeptId, setSelectedDeptId] = useState<string>("All");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("All");
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>("All");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("All");
  const [selectedMode, setSelectedMode] = useState<string>("All");
  
  // Hover State for tooltips
  const [hoveredScheduleId, setHoveredScheduleId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        // Fetch active term first
        const termRes = await api.get<any>('/terms/active');
        const term = termRes.data;
        setActiveTerm(term);

        // Fetch all other data in parallel
        const [deptsRes, sectionsRes, facultiesRes, roomsRes, schedulesRes] = await Promise.all([
          api.get<any[]>('/departments'),
          api.get<any[]>('/sections'),
          api.get<any[]>('/faculties'),
          api.get<any[]>('/rooms'),
          api.get<any[]>('/schedules')
        ]);

        // Map departments
        const mappedDepts = deptsRes.data.map((d: any) => ({
          id: d.id.toString(),
          name: d.department_name,
          code: d.department_code
        }));
        setDepartments(mappedDepts);

        // Map sections (filtered by active term)
        let rawSections = sectionsRes.data;
        if (term) {
          rawSections = rawSections.filter((s: any) => Number(s.term_id) === Number(term.id));
        }
        const mappedSections = rawSections.map((s: any) => ({
          id: s.id.toString(),
          name: s.section_name,
          departmentId: s.department_id ? s.department_id.toString() : ""
        }));
        setSections(mappedSections);

        // Map faculties
        const mappedFaculties = facultiesRes.data.map((f: any) => ({
          id: f.id.toString(),
          name: `${f.first_name} ${f.last_name}`,
          departmentId: f.department_id ? f.department_id.toString() : ""
        }));
        setFaculties(mappedFaculties);

        // Map rooms
        const mappedRooms = roomsRes.data.map((r: any) => ({
          id: r.id.toString(),
          name: r.room_code + (r.room_name ? ` - ${r.room_name}` : '')
        }));
        setRooms(mappedRooms);

        // Map schedules (filtered by active term)
        let rawSchedules = schedulesRes.data;
        if (term) {
          rawSchedules = rawSchedules.filter((s: any) => Number(s.term_id) === Number(term.id));
        }

        const mappedSchedules: Schedule[] = rawSchedules.map((item: any) => {
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
            sectionId: item.section_id.toString(),
            sectionName: item.section?.section_name ?? "",
            departmentId: item.department_id ? item.department_id.toString() : "",
            departmentName: item.department?.department_name ?? "",
            departmentCode: item.department?.department_code ?? "",
            subjectCode: item.subject?.subject_code ?? "",
            subjectName: item.subject?.subject_name ?? "",
            facultyName: item.faculty ? `${item.faculty.first_name} ${item.faculty.last_name}` : "Unassigned",
            roomName,
            day: DAYS_MAP[dayIndex] || "Mon",
            startTime: slotToTimeStr12h(startSlot),
            endTime: slotToTimeStr12h(endSlot),
            mode: item.mode ?? "on-site"
          };
        });
        setSchedules(mappedSchedules);

      } catch (err) {
        console.error("Failed to load VPAA schedule viewer data", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

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
  };

  // Real-time schedules filtering (AND logic)
  const filteredSchedules = schedules.filter((s) => {
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
    return true;
  });

  const timeSlots = generateTimeSlots();



  return (
    <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden text-slate-800 font-sans min-w-[1200px]">
      {/* ================= FILTER BAR ================= */}
      <div className="bg-slate-50/70 border-b border-slate-200 p-4 flex flex-row items-center justify-between gap-4 select-none">
        <div className="flex flex-row items-center gap-3 flex-1">
          <div className="flex items-center gap-1.5 text-slate-500 font-bold text-xs uppercase tracking-wider pr-2">
            <Filter className="w-4 h-4 text-indigo-600" />
            Filters
          </div>

          {/* Department Filter */}
          <div className="flex-1 max-w-[240px]">
            <select
              value={selectedDeptId}
              onChange={handleDepartmentChange}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all cursor-pointer"
            >
              <option value="All">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.code} - {dept.name}
                </option>
              ))}
            </select>
          </div>

          {/* Section Filter */}
          <div className="flex-1 max-w-[200px]">
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all cursor-pointer"
            >
              <option value="All">All Sections</option>
              {filteredSections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>

          {/* Faculty Filter */}
          <div className="flex-1 max-w-[220px]">
            <select
              value={selectedFacultyId}
              onChange={(e) => setSelectedFacultyId(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all cursor-pointer"
            >
              <option value="All">All Faculty</option>
              {filteredFaculty.map((fac) => (
                <option key={fac.id} value={fac.id}>
                  {fac.name}
                </option>
              ))}
            </select>
          </div>

          {/* Room Filter */}
          <div className="flex-1 max-w-[180px]">
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all cursor-pointer"
            >
              <option value="All">All Rooms</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
            {(['All', 'on-site', 'online', 'field'] as const).map((m) => {
              const isSelected = selectedMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMode(m)}
                  className={`px-3.5 h-8 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#4e0a10] text-[#E8D5C4] shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m === 'All' ? 'All Modes' : m === 'on-site' ? 'On-Site' : m === 'online' ? 'Online' : 'Field'}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleResetFilters}
          className="flex items-center gap-1.5 px-4 h-9 bg-white border border-slate-200 hover:bg-slate-50 active:scale-[0.98] text-slate-600 rounded-xl text-xs font-semibold transition-all duration-150 shadow-sm shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reset Filters
        </button>
      </div>

      {/* ================= MAIN WEEKLY TIMETABLE GRID ================= */}
      <div className="overflow-x-auto bg-slate-50/20 p-4">
        <div className="min-w-[1120px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm relative flex flex-row">
          
          {/* Time Column (Sticky labels) */}
          <div className="w-24 shrink-0 border-r border-slate-200 bg-slate-50/70 select-none">
            {/* Corner header */}
            <div className="h-12 border-b border-slate-200 bg-slate-50/80 flex items-center justify-center font-bold text-[10px] uppercase text-slate-400">
              Time
            </div>
            {timeSlots.map((slot, index) => {
              // Display labels on full hours, show subtle bullet on half hours
              const isFullHour = slot.label.includes(":00");
              return (
                <div
                  key={index}
                  className="h-10 border-b border-slate-100 last:border-b-0 flex items-center justify-center text-[10px] font-semibold text-slate-400"
                >
                  {isFullHour ? (
                    <span className="font-bold text-slate-500">{slot.label}</span>
                  ) : (
                    <span className="opacity-30">•</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Days Columns */}
          <div className="flex-1 flex flex-row relative">
            {DAYS.map((day) => {
              const daySchedules = filteredSchedules.filter((s) => s.day === day);
              const layouts = getDayLayouts(daySchedules);

              return (
                <div
                  key={day}
                  className="flex-1 border-r border-slate-200 last:border-r-0 relative min-w-[150px]"
                >
                  {/* Day Header */}
                  <div className="h-12 border-b border-slate-200 bg-slate-50/80 flex flex-col items-center justify-center select-none">
                    <span className="font-bold text-xs text-slate-700 uppercase tracking-wide">
                      {day}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">
                      {daySchedules.length} {daySchedules.length === 1 ? "Class" : "Classes"}
                    </span>
                  </div>

                  {/* Empty cell guidelines */}
                  <div className="relative">
                    {timeSlots.map((_, index) => (
                      <div
                        key={index}
                        className="h-10 border-b border-slate-100 last:border-b-0"
                      />
                    ))}

                    {isLoading ? (
                      (
                        {
                          'Monday': [{ startIdx: 2, endIdx: 6 }],
                          'Wednesday': [{ startIdx: 4, endIdx: 8 }],
                          'Friday': [{ startIdx: 10, endIdx: 14 }]
                        } as Record<string, { startIdx: number; endIdx: number }[]>
                      )[day]?.map((sk, idx) => {
                        const top = sk.startIdx * 40;
                        const height = (sk.endIdx - sk.startIdx) * 40;
                        return (
                          <div
                            key={`sk-card-${idx}`}
                            className="absolute border border-[#E2D9D0] bg-[#F7F4F0]/85 p-2 flex flex-col justify-between select-none rounded-xl shadow-sm animate-pulse"
                            style={{
                              top: `${top + 2}px`,
                              height: `${height - 4}px`,
                              left: '2px',
                              width: 'calc(100% - 4px)',
                              zIndex: 10
                            }}
                          >
                            <div className="flex flex-col h-full justify-between overflow-hidden">
                              <div>
                                <Skeleton className="h-3 w-16 mb-1.5" />
                                <Skeleton className="h-2.5 w-full mb-1" />
                                <Skeleton className="h-2 w-12" />
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                <Skeleton className="h-3.5 w-10 rounded-full" />
                                <Skeleton className="h-3.5 w-10 rounded-full" />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : daySchedules.map((s) => {
                      const startIdx = parseTimeToSlotIndex(s.startTime);
                      const endIdx = parseTimeToSlotIndex(s.endTime);
                      
                      const top = startIdx * 40; // 40px per h-10 row slot
                      const height = (endIdx - startIdx) * 40;
                      
                      const layout = layouts.find((l) => l.schedule.id === s.id);
                      const left = layout ? `${layout.leftPct}%` : "0%";
                      const width = layout ? `${layout.widthPct}%` : "100%";

                      const styleClasses = getDeptStyles(s.departmentCode);
                      const badgeClasses = getDeptBadgeStyles(s.departmentCode);

                      const isHovered = hoveredScheduleId === s.id;

                      return (
                        <div
                          key={s.id}
                          className={`absolute border p-2 flex flex-col justify-between transition-all duration-200 select-none group rounded-xl shadow-sm hover:shadow-md cursor-default ${styleClasses}`}
                          onMouseEnter={() => setHoveredScheduleId(s.id)}
                          onMouseLeave={() => setHoveredScheduleId(null)}
                          style={{
                            top: `${top + 2}px`,
                            height: `${height - 4}px`,
                            left: `calc(${left} + 2px)`,
                            width: `calc(${width} - 4px)`,
                            zIndex: isHovered ? 50 : 10
                          }}
                        >
                          <div className="flex flex-col h-full justify-between overflow-hidden">
                            <div>
                              <div className="flex justify-between items-start gap-1">
                                <span className="font-extrabold text-[10px] tracking-wide leading-none truncate">
                                  {s.subjectCode}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className={`text-[8px] px-1 rounded font-extrabold border ${badgeClasses}`}>
                                    {s.sectionName}
                                  </span>
                                  <span className={`text-[8px] px-1 rounded font-bold border uppercase ${
                                    s.mode === 'on-site'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : s.mode === 'online'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-amber-50 text-amber-705 border-amber-200'
                                  }`}>
                                    {s.mode === 'on-site' ? 'On-Site' : s.mode === 'online' ? 'Online' : 'Field'}
                                  </span>
                                </div>
                              </div>
                              <div className="text-[9px] font-medium leading-tight mt-0.5 truncate opacity-90">
                                {s.subjectName}
                              </div>
                            </div>

                            <div className="mt-0.5 space-y-0.5">
                              <div className="text-[8px] font-bold opacity-75 flex items-center gap-0.5 truncate">
                                <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                                <span>{s.roomName}</span>
                              </div>
                              <div className="text-[8px] font-bold opacity-75 flex items-center gap-0.5 truncate">
                                <User className="w-2.5 h-2.5 flex-shrink-0" />
                                <span>{s.facultyName}</span>
                              </div>
                            </div>
                          </div>

                          {/* ================= HOVER TOOLTIP CARD ================= */}
                          {isHovered && (
                            <div className="absolute left-full top-0 ml-2 w-64 bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-slate-200 text-slate-800 z-50 animate-fadeInUp pointer-events-none">
                              <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                  <span className="font-extrabold text-xs text-slate-900 tracking-wider">
                                    {s.subjectCode}
                                  </span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${badgeClasses}`}>
                                    {s.departmentName.split(" ").slice(2).join(" ") || s.departmentName}
                                  </span>
                                </div>
                                
                                <h3 className="font-bold text-sm text-slate-900 leading-tight">
                                  {s.subjectName}
                                </h3>

                                <hr className="border-slate-100 my-0.5" />

                                <div className="space-y-1.5 text-xs">
                                  <div className="flex items-center gap-2 text-slate-600">
                                    <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span className="font-semibold">Section: </span>
                                    <span className="font-medium text-slate-800">{s.sectionName}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-slate-600">
                                    <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span className="font-semibold">Faculty: </span>
                                    <span className="font-medium text-slate-800">{s.facultyName}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-slate-600">
                                    <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span className="font-semibold">Room: </span>
                                    <span className="font-medium text-slate-800">{s.roomName}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-slate-600">
                                    <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span className="font-semibold">Day: </span>
                                    <span className="font-medium text-slate-800">{s.day}day</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-slate-600">
                                    <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                    <span className="font-semibold">Time: </span>
                                    <span className="font-medium text-slate-800">
                                      {s.startTime} - {s.endTime}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* ================= COLOR LEGEND ================= */}
      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 select-none">
        <span className="flex items-center gap-1.5 mr-2">
          <Info className="w-4 h-4 text-slate-400 animate-pulse" />
          Department Color Legend:
        </span>
        {departments.map((dept) => (
          <span key={dept.id} className="flex items-center gap-1.5">
            <span className={`w-3.5 h-3.5 rounded-lg border border-slate-300 shrink-0 ${getDeptBadgeStyles(dept.code)}`} />
            {dept.code}
          </span>
        ))}
      </div>

    </div>
  );
}
