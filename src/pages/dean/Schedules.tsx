import { useMemo, useState } from "react";
import { Calendar, Clock, Layers, MapPin, RefreshCw, User } from "lucide-react";

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

const DEAN_DEPARTMENT = "College of Information Technology";
const DAYS: Schedule["day"][] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MOCK_SECTIONS: Section[] = [
  { id: "sec-cit-1", name: "BSCS 4A", departmentName: "College of Information Technology" },
  { id: "sec-cit-2", name: "BSCS 4B", departmentName: "College of Information Technology" },
  { id: "sec-cit-3", name: "BSIT 3A", departmentName: "College of Information Technology" },
  { id: "sec-cas-1", name: "BS-Psych 1A", departmentName: "College of Arts and Sciences" }
];

const MOCK_SCHEDULES: Schedule[] = [
  { id: "sched-1", sectionId: "sec-cit-1", sectionName: "BSCS 4A", departmentName: "College of Information Technology", subjectCode: "CS 401", subjectName: "Intelligent Systems", subjectType: "major", facultyName: "Dr. Alan Turing", roomName: "Lab 101", day: "Mon", startTime: "7:00 AM", endTime: "10:00 AM", mode: "on-site" },
  { id: "sched-2", sectionId: "sec-cit-1", sectionName: "BSCS 4A", departmentName: "College of Information Technology", subjectCode: "CS 402", subjectName: "Software Engineering", subjectType: "major", facultyName: "Dr. Grace Hopper", roomName: "Lab 102", day: "Wed", startTime: "9:00 AM", endTime: "12:00 PM", mode: "on-site" },
  { id: "sched-3", sectionId: "sec-cit-1", sectionName: "BSCS 4A", departmentName: "College of Information Technology", subjectCode: "GE 101", subjectName: "Understanding the Self", subjectType: "gec", facultyName: "Prof. Ada Lovelace", roomName: "Room 301", day: "Tue", startTime: "10:00 AM", endTime: "1:00 PM", mode: "online" },
  { id: "sched-4", sectionId: "sec-cit-2", sectionName: "BSCS 4B", departmentName: "College of Information Technology", subjectCode: "CS 403", subjectName: "Network Security", subjectType: "major", facultyName: "Dr. Alan Turing", roomName: "Lab 101", day: "Thu", startTime: "1:00 PM", endTime: "4:00 PM", mode: "on-site" },
  { id: "sched-5", sectionId: "sec-cit-3", sectionName: "BSIT 3A", departmentName: "College of Information Technology", subjectCode: "PATHFIT 1", subjectName: "Movement Competency Training", subjectType: "pathfit", facultyName: null, roomName: "Gymnasium", day: "Fri", startTime: "8:00 AM", endTime: "10:00 AM", mode: "field" },
  { id: "sched-6", sectionId: "sec-cas-1", sectionName: "BS-Psych 1A", departmentName: "College of Arts and Sciences", subjectCode: "GE 102", subjectName: "Readings in Philippine History", subjectType: "gec", facultyName: "Dr. Marie Curie", roomName: "Room 302", day: "Mon", startTime: "1:00 PM", endTime: "4:00 PM", mode: "on-site" }
];

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
      return "bg-blue-100 text-blue-700";
    case "online":
      return "bg-green-100 text-green-700";
    case "field":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

export default function Schedules() {
  const [selectedSectionId, setSelectedSectionId] = useState("All");
  const [selectedMode, setSelectedMode] = useState("All");

  const deanSections = MOCK_SECTIONS.filter((section) => section.departmentName === DEAN_DEPARTMENT);
  const timeSlots = Array.from({ length: (END_HOUR - START_HOUR) * 2 }, (_, index) => slotToTime(index));

  const filteredSchedules = useMemo(() => {
    return MOCK_SCHEDULES.filter((schedule) => {
      if (schedule.departmentName !== DEAN_DEPARTMENT) return false;
      if (selectedSectionId !== "All" && schedule.sectionId !== selectedSectionId) return false;
      if (selectedMode !== "All" && schedule.mode !== selectedMode) return false;
      return true;
    });
  }, [selectedMode, selectedSectionId]);

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
              {deanSections.map((section) => (
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

                {filteredSchedules.map((schedule) => {
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
                })}
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
            {DEAN_DEPARTMENT}
          </span>
        </div>
      </div>
    </div>
  );
}
