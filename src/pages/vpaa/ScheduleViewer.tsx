import React, { useState } from "react";
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
  subjectCode: string;
  subjectName: string;
  facultyName: string;
  roomName: string;
  day: string; // "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"
  startTime: string; // e.g. "09:00 AM"
  endTime: string; // e.g. "10:30 AM"
  mode: 'on-site' | 'online' | 'field';
}

// Static Mock Data
const MOCK_DEPARTMENTS: Department[] = [
  { id: "dept-cas", name: "College of Arts and Sciences", code: "CAS" },
  { id: "dept-cit", name: "College of Information Technology", code: "CIT" },
  { id: "dept-ced", name: "College of Education", code: "CED" },
  { id: "dept-cba", name: "College of Business Administration", code: "CBA" },
  { id: "dept-chm", name: "College of Hospitality Management", code: "CHM" },
  { id: "dept-clis", name: "College of Library and Information Science", code: "CLIS" },
  { id: "dept-ccjps", name: "College of Criminal Justice and Public Safety", code: "CCJPS" }
];

const MOCK_SECTIONS: Section[] = [
  // CAS
  { id: "sec-cas-1", name: "BS-Psych 1A", departmentId: "dept-cas" },
  { id: "sec-cas-2", name: "BS-Psych 2A", departmentId: "dept-cas" },
  // CIT
  { id: "sec-cit-1", name: "BSCS 4A", departmentId: "dept-cit" },
  { id: "sec-cit-2", name: "BSCS 4B", departmentId: "dept-cit" },
  { id: "sec-cit-3", name: "BSIT 3A", departmentId: "dept-cit" },
  // CED
  { id: "sec-ced-1", name: "BSED 1A", departmentId: "dept-ced" },
  { id: "sec-ced-2", name: "BEED 2A", departmentId: "dept-ced" },
  // CBA
  { id: "sec-cba-1", name: "BSBA 3A", departmentId: "dept-cba" },
  { id: "sec-cba-2", name: "BSBA 4A", departmentId: "dept-cba" },
  // CHM
  { id: "sec-chm-1", name: "BSHM 1A", departmentId: "dept-chm" },
  // CLIS
  { id: "sec-clis-1", name: "BLIS 1A", departmentId: "dept-clis" },
  // CCJPS
  { id: "sec-ccjps-1", name: "BSCrim 1A", departmentId: "dept-ccjps" }
];

const MOCK_FACULTY: Faculty[] = [
  // CAS
  { id: "fac-cas-1", name: "Dr. Marie Curie", departmentId: "dept-cas" },
  { id: "fac-cas-2", name: "Prof. Albert Einstein", departmentId: "dept-cas" },
  // CIT
  { id: "fac-cit-1", name: "Dr. Alan Turing", departmentId: "dept-cit" },
  { id: "fac-cit-2", name: "Dr. Grace Hopper", departmentId: "dept-cit" },
  { id: "fac-cit-3", name: "Prof. Ada Lovelace", departmentId: "dept-cit" },
  // CED
  { id: "fac-ced-1", name: "Dr. Maria Montessori", departmentId: "dept-ced" },
  { id: "fac-ced-2", name: "Prof. John Dewey", departmentId: "dept-ced" },
  // CBA
  { id: "fac-cba-1", name: "Dr. Adam Smith", departmentId: "dept-cba" },
  { id: "fac-cba-2", name: "Prof. John Keynes", departmentId: "dept-cba" },
  // CHM
  { id: "fac-chm-1", name: "Dr. Auguste Escoffier", departmentId: "dept-chm" },
  // CLIS
  { id: "fac-clis-1", name: "Prof. Melvil Dewey", departmentId: "dept-clis" },
  // CCJPS
  { id: "fac-ccjps-1", name: "Dr. Cesare Lombroso", departmentId: "dept-ccjps" }
];

const MOCK_ROOMS: Room[] = [
  { id: "room-lab101", name: "Lab 101" },
  { id: "room-lab102", name: "Lab 102" },
  { id: "room-r301", name: "Room 301" },
  { id: "room-r302", name: "Room 302" },
  { id: "room-avr", name: "AVR Room" },
  { id: "room-gym", name: "Gymnasium" }
];

const MOCK_SCHEDULES: Schedule[] = [
  // CIT (Blue)
  {
    id: "sched-1",
    sectionId: "sec-cit-1",
    sectionName: "BSCS 4A",
    departmentId: "dept-cit",
    departmentName: "College of Information Technology",
    subjectCode: "CS 401",
    subjectName: "Intelligent Systems",
    facultyName: "Dr. Alan Turing",
    roomName: "Lab 101",
    day: "Mon",
    startTime: "09:00 AM",
    endTime: "10:30 AM",
    mode: "on-site"
  },
  {
    id: "sched-2",
    sectionId: "sec-cit-1",
    sectionName: "BSCS 4A",
    departmentId: "dept-cit",
    departmentName: "College of Information Technology",
    subjectCode: "CS 402",
    subjectName: "Software Engineering",
    facultyName: "Dr. Grace Hopper",
    roomName: "Room 301",
    day: "Wed",
    startTime: "09:00 AM",
    endTime: "10:30 AM",
    mode: "online"
  },
  {
    id: "sched-3",
    sectionId: "sec-cit-2",
    sectionName: "BSCS 4B",
    departmentId: "dept-cit",
    departmentName: "College of Information Technology",
    subjectCode: "CS 403",
    subjectName: "Network Security",
    facultyName: "Prof. Ada Lovelace",
    roomName: "Lab 102",
    day: "Tue",
    startTime: "10:30 AM",
    endTime: "12:00 PM",
    mode: "on-site"
  },
  {
    id: "sched-4",
    sectionId: "sec-cit-3",
    sectionName: "BSIT 3A",
    departmentId: "dept-cit",
    departmentName: "College of Information Technology",
    subjectCode: "IT 301",
    subjectName: "Database Administration",
    facultyName: "Dr. Alan Turing",
    roomName: "Lab 101",
    day: "Thu",
    startTime: "01:00 PM",
    endTime: "03:00 PM",
    mode: "on-site"
  },
  
  // CAS (Yellow/Amber)
  {
    id: "sched-5",
    sectionId: "sec-cas-1",
    sectionName: "BS-Psych 1A",
    departmentId: "dept-cas",
    departmentName: "College of Arts and Sciences",
    subjectCode: "GE 101",
    subjectName: "Understanding the Self",
    facultyName: "Dr. Marie Curie",
    roomName: "Room 302",
    day: "Mon",
    startTime: "01:00 PM",
    endTime: "02:30 PM",
    mode: "on-site"
  },
  {
    id: "sched-6",
    sectionId: "sec-cas-1",
    sectionName: "BS-Psych 1A",
    departmentId: "dept-cas",
    departmentName: "College of Arts and Sciences",
    subjectCode: "GE 102",
    subjectName: "Readings in Philippine History",
    facultyName: "Prof. Albert Einstein",
    roomName: "Room 302",
    day: "Wed",
    startTime: "01:00 PM",
    endTime: "02:30 PM",
    mode: "online"
  },
  {
    id: "sched-7",
    sectionId: "sec-cas-2",
    sectionName: "BS-Psych 2A",
    departmentId: "dept-cas",
    departmentName: "College of Arts and Sciences",
    subjectCode: "GE 103",
    subjectName: "The Contemporary World",
    facultyName: "Dr. Marie Curie",
    roomName: "AVR Room",
    day: "Fri",
    startTime: "09:00 AM",
    endTime: "10:30 AM",
    mode: "on-site"
  },
  
  // CED (Purple)
  {
    id: "sched-8",
    sectionId: "sec-ced-1",
    sectionName: "BSED 1A",
    departmentId: "dept-ced",
    departmentName: "College of Education",
    subjectCode: "EDUC 101",
    subjectName: "Child and Adolescent Development",
    facultyName: "Dr. Maria Montessori",
    roomName: "Room 301",
    day: "Tue",
    startTime: "08:30 AM",
    endTime: "10:00 AM",
    mode: "on-site"
  },
  {
    id: "sched-9",
    sectionId: "sec-ced-1",
    sectionName: "BSED 1A",
    departmentId: "dept-ced",
    departmentName: "College of Education",
    subjectCode: "EDUC 102",
    subjectName: "The Teaching Profession",
    facultyName: "Prof. John Dewey",
    roomName: "Room 301",
    day: "Thu",
    startTime: "08:30 AM",
    endTime: "10:00 AM",
    mode: "online"
  },
  
  // CBA (Emerald)
  {
    id: "sched-10",
    sectionId: "sec-cba-1",
    sectionName: "BSBA 3A",
    departmentId: "dept-cba",
    departmentName: "College of Business Administration",
    subjectCode: "ACTG 101",
    subjectName: "Financial Accounting",
    facultyName: "Dr. Adam Smith",
    roomName: "Room 302",
    day: "Mon",
    startTime: "10:30 AM",
    endTime: "12:00 PM",
    mode: "on-site"
  },
  {
    id: "sched-11",
    sectionId: "sec-cba-1",
    sectionName: "BSBA 3A",
    departmentId: "dept-cba",
    departmentName: "College of Business Administration",
    subjectCode: "ACTG 102",
    subjectName: "Managerial Accounting",
    facultyName: "Prof. John Keynes",
    roomName: "Room 302",
    day: "Wed",
    startTime: "10:30 AM",
    endTime: "12:00 PM",
    mode: "online"
  },
  
  // CHM (Rose)
  {
    id: "sched-12",
    sectionId: "sec-chm-1",
    sectionName: "BSHM 1A",
    departmentId: "dept-chm",
    departmentName: "College of Hospitality Management",
    subjectCode: "HM 101",
    subjectName: "Introduction to Hospitality Industry",
    facultyName: "Dr. Auguste Escoffier",
    roomName: "AVR Room",
    day: "Fri",
    startTime: "01:30 PM",
    endTime: "03:30 PM",
    mode: "on-site"
  },
 
  // CLIS (Sky)
  {
    id: "sched-13",
    sectionId: "sec-clis-1",
    sectionName: "BLIS 1A",
    departmentId: "dept-clis",
    departmentName: "College of Library and Information Science",
    subjectCode: "LIS 101",
    subjectName: "Foundations of Library Information Science",
    facultyName: "Prof. Melvil Dewey",
    roomName: "Room 301",
    day: "Sat",
    startTime: "09:00 AM",
    endTime: "12:00 PM",
    mode: "on-site"
  },
 
  // CCJPS (Red)
  {
    id: "sched-14",
    sectionId: "sec-ccjps-1",
    sectionName: "BSCrim 1A",
    departmentId: "dept-ccjps",
    departmentName: "College of Criminal Justice and Public Safety",
    subjectCode: "CRIM 101",
    subjectName: "Introduction to Criminology",
    facultyName: "Dr. Cesare Lombroso",
    roomName: "Gymnasium",
    day: "Tue",
    startTime: "01:30 PM",
    endTime: "03:00 PM",
    mode: "on-site"
  }
];

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
  // Filters State
  const [selectedDeptId, setSelectedDeptId] = useState<string>("All");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("All");
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>("All");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("All");
  const [selectedMode, setSelectedMode] = useState<string>("All");
  
  // Hover State for tooltips
  const [hoveredScheduleId, setHoveredScheduleId] = useState<string | null>(null);

  // Dynamic Options filtering based on department selection
  const filteredSections = MOCK_SECTIONS.filter((sec) => {
    if (selectedDeptId === "All") return true;
    return sec.departmentId === selectedDeptId;
  });

  const filteredFaculty = MOCK_FACULTY.filter((fac) => {
    if (selectedDeptId === "All") return true;
    return fac.departmentId === selectedDeptId;
  });

  // Handle department change - cascading reset logic
  const handleDepartmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deptId = e.target.value;
    setSelectedDeptId(deptId);

    // Reset section filter if the currently selected section does not belong to the new department
    if (deptId !== "All") {
      const activeSec = MOCK_SECTIONS.find((s) => s.id === selectedSectionId);
      if (activeSec && activeSec.departmentId !== deptId) {
        setSelectedSectionId("All");
      }

      // Reset faculty filter if the currently selected faculty does not belong to the new department
      const activeFac = MOCK_FACULTY.find((f) => f.id === selectedFacultyId);
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
  const filteredSchedules = MOCK_SCHEDULES.filter((s) => {
    if (selectedDeptId !== "All" && s.departmentId !== selectedDeptId) {
      return false;
    }
    if (selectedSectionId !== "All" && s.sectionId !== selectedSectionId) {
      return false;
    }
    if (selectedFacultyId !== "All") {
      const facObj = MOCK_FACULTY.find((f) => f.id === selectedFacultyId);
      if (!facObj || s.facultyName !== facObj.name) return false;
    }
    if (selectedRoomId !== "All") {
      const roomObj = MOCK_ROOMS.find((r) => r.id === selectedRoomId);
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
              {MOCK_DEPARTMENTS.map((dept) => (
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
              {MOCK_ROOMS.map((room) => (
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

                    {/* Absolutely Positioned Schedule Cards */}
                    {daySchedules.map((s) => {
                      const startIdx = parseTimeToSlotIndex(s.startTime);
                      const endIdx = parseTimeToSlotIndex(s.endTime);
                      
                      const top = startIdx * 40; // 40px per h-10 row slot
                      const height = (endIdx - startIdx) * 40;
                      
                      const layout = layouts.find((l) => l.schedule.id === s.id);
                      const left = layout ? `${layout.leftPct}%` : "0%";
                      const width = layout ? `${layout.widthPct}%` : "100%";

                      const styleClasses = getDeptStyles(s.departmentId.split("-")[1]?.toUpperCase());
                      const badgeClasses = getDeptBadgeStyles(s.departmentId.split("-")[1]?.toUpperCase());

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
        {MOCK_DEPARTMENTS.map((dept) => (
          <span key={dept.id} className="flex items-center gap-1.5">
            <span className={`w-3.5 h-3.5 rounded-lg border border-slate-300 shrink-0 ${getDeptBadgeStyles(dept.code)}`} />
            {dept.code}
          </span>
        ))}
      </div>

    </div>
  );
}
