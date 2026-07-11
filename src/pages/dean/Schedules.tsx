import { useMemo, useState, useEffect } from "react";
import { Calendar, Clock, Layers, MapPin, RefreshCw, User } from "lucide-react";
import api from "../../lib/api";
import Skeleton from "../../components/ui/Skeleton";

interface Section {
  id: string;
  name: string;
  departmentName: string;
}

interface Schedule {
  id: string;
  sectionId: string;
  sectionName: string;
  departmentName: string;
  subjectCode: string;
  subjectName: string;
  subjectType: "major" | "gec" | "gee" | "pathfit" | "nstp";
  facultyName: string | null;
  roomName: string;
  day: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
  startTime: string;
  endTime: string;
  mode: "on-site" | "online" | "field";
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

const getSubjectStyles = (type: Schedule["subjectType"]) => {
  switch (type) {
    case "major":
      return "bg-blue-50 text-blue-800 border-blue-300 border-l-blue-600";
    case "gec":
      return "bg-emerald-50 text-emerald-800 border-emerald-300 border-l-emerald-600";
    case "gee":
      return "bg-purple-50 text-purple-800 border-purple-300 border-l-purple-600";
    case "pathfit":
      return "bg-orange-50 text-orange-800 border-orange-300 border-l-orange-600";
    case "nstp":
      return "bg-yellow-50 text-yellow-800 border-yellow-300 border-l-yellow-600";
    default:
      return "bg-slate-50 text-slate-800 border-slate-300 border-l-slate-600";
  }
};

const getModeBadge = (mode: Schedule["mode"]) => {
  switch (mode) {
    case "on-site":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "online":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "field":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    default:
      return "bg-slate-50 text-slate-700 border border-slate-200";
  }
};

export default function Schedules() {
  const [selectedSectionId, setSelectedSectionId] = useState("All");
  const [selectedMode, setSelectedMode] = useState("All");
  const [sections, setSections] = useState<Section[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const userJson = localStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const userDeptId = user?.department_id;
  const userDeptName = user?.department?.department_name || "College of Information Technology";

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const termRes = await api.get<any>('/terms/active');
        const term = termRes.data;

        const [sectionsRes, schedulesRes] = await Promise.all([
          api.get<any[]>('/sections'),
          api.get<any[]>('/schedules')
        ]);

        let rawSections = sectionsRes.data;
        if (term) {
          rawSections = rawSections.filter((s: any) => Number(s.term_id) === Number(term.id));
        }
        if (userDeptId) {
          rawSections = rawSections.filter((s: any) => Number(s.department_id) === Number(userDeptId));
        }
        const mappedSections = rawSections.map((s: any) => ({
          id: s.id.toString(),
          name: s.section_name,
          departmentName: s.department?.department_name ?? ""
        }));
        setSections(mappedSections);

        let rawSchedules = schedulesRes.data;
        if (term) {
          rawSchedules = rawSchedules.filter((s: any) => Number(s.term_id) === Number(term.id));
        }
        if (userDeptId) {
          rawSchedules = rawSchedules.filter((s: any) => Number(s.department_id) === Number(userDeptId));
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
            departmentName: item.department?.department_name ?? "",
            subjectCode: item.subject?.subject_code ?? "",
            subjectName: item.subject?.subject_name ?? "",
            subjectType: item.subject?.subject_category as any,
            facultyName: item.faculty ? `${item.faculty.first_name} ${item.faculty.last_name}` : null,
            roomName,
            day: DAYS_MAP[dayIndex] || "Mon",
            startTime: slotToTimeStr12h(startSlot),
            endTime: slotToTimeStr12h(endSlot),
            mode: item.mode ?? "on-site"
          };
        });
        setSchedules(mappedSchedules);
      } catch (err) {
        // Safe empty catch block
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [userDeptId]);

  const timeSlots = Array.from({ length: (END_HOUR - START_HOUR) * 2 }, (_, index) => slotToTime(index));

  const filteredSchedules = useMemo(() => {
    return schedules.filter((schedule) => {
      if (selectedSectionId !== "All" && schedule.sectionId !== selectedSectionId) return false;
      if (selectedMode !== "All" && schedule.mode !== selectedMode) return false;
      return true;
    });
  }, [schedules, selectedMode, selectedSectionId]);

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

        <div className="overflow-auto p-4 bg-slate-50/20">
          <div className="min-w-[1100px] bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="grid grid-cols-[88px_repeat(6,minmax(0,1fr))]">
              <div className="h-12 border-r border-b border-slate-200 bg-slate-50/80 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase">
                Time
              </div>
              {DAYS.map((day) => (
                <div key={day} className="h-12 border-r last:border-r-0 border-b border-slate-200 bg-slate-50/80 flex flex-col items-center justify-center">
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
                      className="border-r border-b border-slate-100 bg-slate-50/70 flex items-center justify-center text-[10px] font-bold text-slate-500"
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
                    { id: 'sk-1', dayIndex: 0, startSlot: 2, endSlot: 6, height: 4 * SLOT_HEIGHT_PX, durationSlots: 4 },
                    { id: 'sk-2', dayIndex: 1, startSlot: 8, endSlot: 11, height: 3 * SLOT_HEIGHT_PX, durationSlots: 3 },
                    { id: 'sk-3', dayIndex: 2, startSlot: 4, endSlot: 8, height: 4 * SLOT_HEIGHT_PX, durationSlots: 4 },
                    { id: 'sk-4', dayIndex: 4, startSlot: 12, endSlot: 15, height: 3 * SLOT_HEIGHT_PX, durationSlots: 3 }
                  ].map((sk) => (
                    <div
                      key={sk.id}
                      className="z-10 rounded-xl border border-[#E2D9D0] bg-[#F7F4F0]/80 p-2 box-border overflow-hidden shadow-sm animate-pulse flex flex-col justify-between"
                      style={{
                        gridColumn: sk.dayIndex + 2,
                        gridRow: `${sk.startSlot + 1} / span ${sk.durationSlots}`,
                        height: `${sk.height}px`
                      }}
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
                  filteredSchedules.map((schedule) => {
                  const startSlot = parseTimeToSlot(schedule.startTime);
                  const endSlot = parseTimeToSlot(schedule.endTime);
                  const durationSlots = Math.max(1, endSlot - startSlot);
                  const height = durationSlots * SLOT_HEIGHT_PX;
                  const dayIndex = DAYS.indexOf(schedule.day);
                  const tooltip = `${schedule.subjectName}\nSection: ${schedule.sectionName}\nRoom: ${schedule.roomName}\nFaculty: ${schedule.facultyName ?? "Unassigned"}\nDay: ${schedule.day}\nTime: ${schedule.startTime} – ${schedule.endTime}\nMode: ${schedule.mode === "on-site" ? "On-Site" : schedule.mode === "online" ? "Online" : "Field"}`;

                  return (
                    <div
                      key={schedule.id}
                      title={tooltip}
                      className={`z-10 rounded-xl border border-l-4 p-2 box-border overflow-hidden shadow-sm hover:shadow-md transition-all duration-150 ${getSubjectStyles(schedule.subjectType)}`}
                      style={{
                        gridColumn: dayIndex + 2,
                        gridRow: `${startSlot + 1} / span ${durationSlots}`,
                        height: `${height}px`
                      }}
                    >
                      <div className="flex flex-col h-full justify-between">
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-bold uppercase truncate">{schedule.subjectCode}</span>
                            <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-bold shrink-0 ${getModeBadge(schedule.mode)}`}>
                              {schedule.mode === "on-site" ? "On-Site" : schedule.mode === "online" ? "Online" : "Field"}
                            </span>
                          </div>
                          <div className="text-[10px] font-semibold truncate mt-0.5">{schedule.sectionName}</div>
                        </div>
                        <div className="space-y-0.5 text-[10px] opacity-80">
                          <div className="flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{schedule.roomName}</span>
                          </div>
                          <div className="flex items-center gap-1 truncate">
                            <User className="w-3 h-3 shrink-0" />
                            <span className="truncate">{schedule.facultyName ?? "Unassigned"}</span>
                          </div>
                          <div className="flex items-center gap-1 truncate">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span className="truncate">{schedule.startTime} – {schedule.endTime}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  }))}
              </div>
            </div>
          </div>
        </div>

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
    </div>
  );
}
