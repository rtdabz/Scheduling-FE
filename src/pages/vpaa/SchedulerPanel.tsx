import React, { useState, useEffect } from "react";
import { 
  Calendar, 
  User, 
  MapPin, 
  Layers, 
  Clock, 
  Plus, 
  AlertTriangle, 
  Filter, 
  BookOpen 
} from "lucide-react";

// TypeScript Interfaces
export interface Section {
  id: string;
  name: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  units: number;
}

export interface Faculty {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
}

export interface Schedule {
  id: string;
  sectionId: string;
  subjectCode: string;
  subjectName: string;
  facultyName: string;
  roomName: string;
  day: string;
  startTime: string;
  endTime: string;
}

// Time Constants
const TIMES = [
  "7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM",
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM",
  "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM",
  "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM", "6:00 PM", "6:30 PM",
  "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM", "9:00 PM"
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Helper to convert time string to index
const timeToIndex = (time: string) => TIMES.indexOf(time);

export default function SchedulerPanel() {
  // --- Static Mock Data ---
  const sections: Section[] = [
    { id: "s1", name: "BSCS 4A" },
    { id: "s2", name: "BSCS 4B" },
    { id: "s3", name: "BSIT 3A" },
    { id: "s4", name: "BSIT 3B" }
  ];

  const subjects: Subject[] = [
    { id: "sub1", code: "CS401", name: "Intelligent Systems", units: 3 },
    { id: "sub2", code: "CS402", name: "Software Engineering", units: 3 },
    { id: "sub3", code: "CS403", name: "Network Security", units: 3 },
    { id: "sub4", code: "IT301", name: "Database Administration", units: 3 },
    { id: "sub5", code: "GE101", name: "Understanding the Self", units: 3 }
  ];

  const faculty: Faculty[] = [
    { id: "f1", name: "Dr. Alan Turing" },
    { id: "f2", name: "Dr. Grace Hopper" },
    { id: "f3", name: "Prof. Ada Lovelace" },
    { id: "f4", name: "Dr. John von Neumann" }
  ];

  const rooms: Room[] = [
    { id: "r1", name: "Lab 101" },
    { id: "r2", name: "Lab 102" },
    { id: "r3", name: "Room 301" },
    { id: "r4", name: "Room 302" }
  ];

  // --- Initial Schedules State ---
  const [schedules, setSchedules] = useState<Schedule[]>([
    {
      id: "init1",
      sectionId: "s1",
      subjectCode: "CS401",
      subjectName: "Intelligent Systems",
      facultyName: "Dr. Alan Turing",
      roomName: "Lab 101",
      day: "Mon",
      startTime: "9:00 AM",
      endTime: "10:30 AM"
    },
    {
      id: "init2",
      sectionId: "s1",
      subjectCode: "CS401",
      subjectName: "Intelligent Systems",
      facultyName: "Dr. Alan Turing",
      roomName: "Lab 101",
      day: "Wed",
      startTime: "9:00 AM",
      endTime: "10:30 AM"
    },
    {
      id: "init3",
      sectionId: "s1",
      subjectCode: "CS402",
      subjectName: "Software Engineering",
      facultyName: "Dr. Grace Hopper",
      roomName: "Room 301",
      day: "Mon",
      startTime: "1:00 PM",
      endTime: "2:30 PM"
    },
    {
      id: "init4",
      sectionId: "s2",
      subjectCode: "CS403",
      subjectName: "Network Security",
      facultyName: "Prof. Ada Lovelace",
      roomName: "Lab 102",
      day: "Tue",
      startTime: "10:00 AM",
      endTime: "11:30 AM"
    },
    {
      id: "init5",
      sectionId: "s3",
      subjectCode: "IT301",
      subjectName: "Database Administration",
      facultyName: "Dr. John von Neumann",
      roomName: "Room 302",
      day: "Wed",
      startTime: "2:00 PM",
      endTime: "4:00 PM"
    }
  ]);

  // --- Form State (Left Panel) ---
  const [selectedSectionId, setSelectedSectionId] = useState(sections[0]?.id || "");
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.id || "");
  const [selectedFacultyId, setSelectedFacultyId] = useState(faculty[0]?.id || "");
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id || "");
  
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("9:00 AM");
  const [endTime, setEndTime] = useState("10:30 AM");

  // --- Grid View Filter State (Right Panel) ---
  const [filterType, setFilterType] = useState<"All" | "Section" | "Faculty" | "Room">("Section");
  const [filterValue, setFilterValue] = useState(sections[0]?.id || "");

  // --- Drag and Drop States ---
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<{ day: string; time: string } | null>(null);
  const [conflictCell, setConflictCell] = useState<{ day: string; time: string } | null>(null);

  // Sync right-panel filter value with left panel selected section when filterType is "Section"
  useEffect(() => {
    if (filterType === "Section") {
      setFilterValue(selectedSectionId);
    }
  }, [selectedSectionId, filterType]);

  // Handle filter changes
  const handleFilterTypeChange = (type: "All" | "Section" | "Faculty" | "Room") => {
    setFilterType(type);
    if (type === "All") {
      setFilterValue("");
    } else if (type === "Section") {
      setFilterValue(selectedSectionId || sections[0]?.id || "");
    } else if (type === "Faculty") {
      setFilterValue(selectedFacultyId || faculty[0]?.name || "");
    } else if (type === "Room") {
      setFilterValue(selectedRoomId || rooms[0]?.name || "");
    }
  };

  // Helper to resolve section name
  const getSectionName = (id: string) => {
    const sec = sections.find(s => s.id === id);
    return sec ? sec.name : id;
  };

  // Dynamically filter end times to be after selected start time
  const getFilteredEndTimes = () => {
    const startIdx = timeToIndex(startTime);
    if (startIdx === -1) return TIMES.slice(1);
    return TIMES.slice(startIdx + 1);
  };

  // Adjust end time if start time becomes equal or greater
  const handleStartTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStart = e.target.value;
    setStartTime(newStart);
    
    const newStartIdx = timeToIndex(newStart);
    const currentEndIdx = timeToIndex(endTime);
    
    if (newStartIdx >= currentEndIdx) {
      // Set end time to 1.5 hours after by default (3 slots)
      const nextIdx = Math.min(newStartIdx + 3, TIMES.length - 1);
      setEndTime(TIMES[nextIdx]);
    }
  };

  // Check for conflicts
  const checkConflict = (
    day: string,
    startT: string,
    endT: string,
    room: string,
    facName: string,
    secId: string,
    existingSchedules: Schedule[]
  ): string | null => {
    const startIdx = timeToIndex(startT);
    const endIdx = timeToIndex(endT);

    for (const s of existingSchedules) {
      if (s.day !== day) continue;

      const sStart = timeToIndex(s.startTime);
      const sEnd = timeToIndex(s.endTime);

      // Check overlap: max of starts < min of ends
      if (Math.max(startIdx, sStart) < Math.min(endIdx, sEnd)) {
        if (s.roomName === room) {
          return `Room "${room}" is already reserved for ${s.subjectCode} (${getSectionName(s.sectionId)}) on ${day} at ${s.startTime}-${s.endTime}.`;
        }
        if (s.facultyName === facName) {
          return `Faculty member "${facName}" is already teaching ${s.subjectCode} (${getSectionName(s.sectionId)}) on ${day} at ${s.startTime}-${s.endTime}.`;
        }
        if (s.sectionId === secId) {
          return `Section "${getSectionName(secId)}" already has a class scheduled (${s.subjectCode}) on ${day} at ${s.startTime}-${s.endTime}.`;
        }
      }
    }
    return null;
  };

  // Add Schedule Handler
  const handleAddSchedule = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedDays.length === 0) {
      alert("Please select at least one day.");
      return;
    }

    const startIdx = timeToIndex(startTime);
    const endIdx = timeToIndex(endTime);

    if (startIdx >= endIdx) {
      alert("End time must be after the start time.");
      return;
    }

    const subject = subjects.find(s => s.id === selectedSubjectId);
    const fMember = faculty.find(f => f.id === selectedFacultyId);
    const room = rooms.find(r => r.id === selectedRoomId);

    if (!subject || !fMember || !room) {
      alert("Invalid selection details.");
      return;
    }

    // Accumulate schedules to add and perform validation
    const schedulesToAdd: Schedule[] = [];
    
    for (const day of selectedDays) {
      const conflictMsg = checkConflict(
        day,
        startTime,
        endTime,
        room.name,
        fMember.name,
        selectedSectionId,
        schedules
      );

      if (conflictMsg) {
        alert(`Failed to add schedule for ${day}:\n${conflictMsg}`);
        return; // Halt entire operation to maintain consistency
      }

      schedulesToAdd.push({
        id: `sched_${Date.now()}_${day}`,
        sectionId: selectedSectionId,
        subjectCode: subject.code,
        subjectName: subject.name,
        facultyName: fMember.name,
        roomName: room.name,
        day,
        startTime,
        endTime
      });
    }

    setSchedules(prev => [...prev, ...schedulesToAdd]);
    setSelectedDays([]); // Reset day checkboxes after successful add
    
    // Switch filter to the section we just added to so we can see it
    setFilterType("Section");
    setFilterValue(selectedSectionId);
  };

  // Delete Schedule Handler
  const handleDeleteSchedule = (id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
  };

  // Day Checkbox toggle helper
  const handleDayToggle = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  // Filter schedules based on Right Panel filters
  const filteredSchedules = schedules.filter(s => {
    if (filterType === "All") return true;
    if (filterType === "Section") return s.sectionId === filterValue;
    if (filterType === "Faculty") return s.facultyName === filterValue;
    if (filterType === "Room") return s.roomName === filterValue;
    return true;
  });

  // Color options for subjects
  const colors = [
    "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100/80 hover:border-indigo-300",
    "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100/80 hover:border-emerald-300",
    "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/80 hover:border-amber-300",
    "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100/80 hover:border-rose-300",
    "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100/80 hover:border-violet-300",
    "bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100/80 hover:border-sky-300",
    "bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100/80 hover:border-teal-300"
  ];

  const getCardColor = (subjectCode: string) => {
    let hash = 0;
    for (let i = 0; i < subjectCode.length; i++) {
      hash = subjectCode.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  };

  // --- HTML5 Drag & Drop Logic ---

  const handleDragStart = (e: React.DragEvent, scheduleId: string) => {
    setDraggedScheduleId(scheduleId);
    e.dataTransfer.setData("text/plain", scheduleId);
    // Visual feedback setting for dragging
    e.dataTransfer.effectAllowed = "move";
  };

  // Pre-calculate conflict checks on the fly for cell hovering
  const getDragOverStatus = (day: string, time: string): "none" | "valid" | "invalid" => {
    if (!draggedScheduleId) return "none";
    const dragged = schedules.find(s => s.id === draggedScheduleId);
    if (!dragged) return "none";

    const duration = timeToIndex(dragged.endTime) - timeToIndex(dragged.startTime);
    const targetStartIdx = timeToIndex(time);
    const targetEndIdx = targetStartIdx + duration;

    // Out of bounds validation (goes past 9:00 PM)
    if (targetEndIdx > 28) return "invalid";

    const targetEndTime = TIMES[targetEndIdx];
    const otherSchedules = schedules.filter(s => s.id !== dragged.id);

    const conflict = checkConflict(
      day,
      time,
      targetEndTime,
      dragged.roomName,
      dragged.facultyName,
      dragged.sectionId,
      otherSchedules
    );

    return conflict ? "invalid" : "valid";
  };

  const handleDrop = (e: React.DragEvent, targetDay: string, targetStartTime: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggedScheduleId;
    setDraggedScheduleId(null);
    setDragOverCell(null);

    if (!id) return;

    const schedule = schedules.find(s => s.id === id);
    if (!schedule) return;

    // Calculate new endTime based on duration
    const startIdx = timeToIndex(schedule.startTime);
    const endIdx = timeToIndex(schedule.endTime);
    const duration = endIdx - startIdx;

    const targetStartIdx = timeToIndex(targetStartTime);
    const targetEndIdx = targetStartIdx + duration;

    if (targetEndIdx > 28) {
      alert("Error: Drop location would extend past the 9:00 PM closing time.");
      flashConflictCell(targetDay, targetStartTime);
      return;
    }

    const targetEndTime = TIMES[targetEndIdx];
    const otherSchedules = schedules.filter(s => s.id !== id);

    const conflictMsg = checkConflict(
      targetDay,
      targetStartTime,
      targetEndTime,
      schedule.roomName,
      schedule.facultyName,
      schedule.sectionId,
      otherSchedules
    );

    if (conflictMsg) {
      alert(`Conflict Detected! Cannot drop here.\n\n${conflictMsg}`);
      flashConflictCell(targetDay, targetStartTime);
      return;
    }

    // Update state
    setSchedules(prev => prev.map(s => {
      if (s.id === id) {
        return {
          ...s,
          day: targetDay,
          startTime: targetStartTime,
          endTime: targetEndTime
        };
      }
      return s;
    }));
  };

  const flashConflictCell = (day: string, time: string) => {
    setConflictCell({ day, time });
    setTimeout(() => {
      setConflictCell(null);
    }, 1200);
  };

  // --- Overlap Detection Engine for rendering simultaneous schedules side by side ---
  
  interface CardLayout {
    schedule: Schedule;
    leftPct: number;
    widthPct: number;
  }

  const getDayLayouts = (daySchedules: Schedule[]): CardLayout[] => {
    const sorted = [...daySchedules].sort((a, b) => {
      const aStart = timeToIndex(a.startTime);
      const bStart = timeToIndex(b.startTime);
      if (aStart !== bStart) return aStart - bStart;
      return (timeToIndex(b.endTime) - timeToIndex(b.startTime)) - (timeToIndex(a.endTime) - timeToIndex(a.startTime));
    });

    const layouts: CardLayout[] = [];
    const clusters: Schedule[][] = [];

    // Group overlapping cards into temporal clusters
    for (const s of sorted) {
      let placed = false;
      for (const cluster of clusters) {
        const overlaps = cluster.some(c => {
          const sStart = timeToIndex(s.startTime);
          const sEnd = timeToIndex(s.endTime);
          const cStart = timeToIndex(c.startTime);
          const cEnd = timeToIndex(c.endTime);
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

    // Layout cards inside each cluster as sub-columns
    for (const cluster of clusters) {
      const columns: Schedule[][] = [];
      for (const s of cluster) {
        let colIdx = 0;
        while (true) {
          if (!columns[colIdx]) {
            columns[colIdx] = [s];
            break;
          }
          const overlaps = columns[colIdx].some(c => {
            const sStart = timeToIndex(s.startTime);
            const sEnd = timeToIndex(s.endTime);
            const cStart = timeToIndex(c.startTime);
            const cEnd = timeToIndex(c.endTime);
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

  // Background cell slots to render (excluding the final end time slot)
  const TIME_SLOTS = TIMES.slice(0, -1);

  return (
    <div className="flex flex-row gap-6 w-full min-w-[1200px] text-slate-800 antialiased select-none">
      
      {/* ================= LEFT PANEL: Add Schedule Form ================= */}
      <div className="w-1/3 flex-none bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-6">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
              <Calendar className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold font-display text-slate-900">Add Schedule</h2>
          </div>

          <form onSubmit={handleAddSchedule} className="space-y-4">
            
            {/* Section Selection */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                <Layers className="w-3.5 h-3.5" /> Section
              </label>
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl text-sm focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 outline-none transition-all cursor-pointer font-medium"
              >
                {sections.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Subject Selection */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                <BookOpen className="w-3.5 h-3.5" /> Subject
              </label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl text-sm focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 outline-none transition-all cursor-pointer font-medium"
              >
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.code} - {s.name} ({s.units} Units)
                  </option>
                ))}
              </select>
            </div>

            {/* Faculty Selection */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                <User className="w-3.5 h-3.5" /> Faculty
              </label>
              <select
                value={selectedFacultyId}
                onChange={(e) => setSelectedFacultyId(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl text-sm focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 outline-none transition-all cursor-pointer font-medium"
              >
                {faculty.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            {/* Room Selection */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                <MapPin className="w-3.5 h-3.5" /> Room
              </label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full h-11 px-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl text-sm focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 outline-none transition-all cursor-pointer font-medium"
              >
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Day Selection (Checkbox Group) */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                <Calendar className="w-3.5 h-3.5" /> Days
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DAYS.map(day => {
                  const isChecked = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleDayToggle(day)}
                      className={`h-10 text-xs font-semibold rounded-xl border transition-all ${
                        isChecked 
                          ? "bg-slate-900 border-slate-900 text-white shadow-sm"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Selections */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  <Clock className="w-3.5 h-3.5" /> Start Time
                </label>
                <select
                  value={startTime}
                  onChange={handleStartTimeChange}
                  className="w-full h-11 px-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl text-sm focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 outline-none transition-all cursor-pointer font-medium"
                >
                  {TIMES.slice(0, -1).map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  <Clock className="w-3.5 h-3.5" /> End Time
                </label>
                <select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-xl text-sm focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 outline-none transition-all cursor-pointer font-medium"
                >
                  {getFilteredEndTimes().map(time => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-12 bg-[#C9952A] hover:bg-[#B38020] active:scale-[0.98] text-white font-bold rounded-xl shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 mt-6"
            >
              <Plus className="w-4 h-4" /> Add to Schedule
            </button>

          </form>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200/60 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-slate-500 font-medium">
            <strong>Conflict Prevention System:</strong> The system locks rooms and faculty in real-time. Native HTML5 drag-and-drop handles automatic schedule rescheduling. Drops that overlap or violate locks are safely blocked.
          </p>
        </div>
      </div>

      {/* ================= RIGHT PANEL: Timetable Grid ================= */}
      <div className="w-2/3 flex-none flex flex-col bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        
        {/* Right Panel Header: Filters & Views */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/60">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="font-bold text-sm text-slate-700 uppercase tracking-wide">Filter View</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Filter Type Radio Tabs */}
            <div className="flex bg-slate-100/90 rounded-xl p-1 border border-slate-200/50">
              {(["All", "Section", "Faculty", "Room"] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleFilterTypeChange(type)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    filterType === type 
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200/30"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Filter Value Dropdown */}
            {filterType !== "All" && (
              <select
                value={filterValue}
                onChange={(e) => setFilterValue(e.target.value)}
                className="h-9 px-3 bg-white border border-slate-200 text-slate-800 rounded-xl text-xs focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 outline-none font-semibold shadow-sm hover:bg-slate-50/50 transition-all cursor-pointer"
              >
                {filterType === "Section" && sections.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {filterType === "Faculty" && faculty.map(f => (
                  <option key={f.id} value={f.name}>{f.name}</option>
                ))}
                {filterType === "Room" && rooms.map(r => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Timetable Grid Container */}
        <div className="flex flex-row overflow-x-auto select-none bg-slate-50/40">
          
          {/* Time scale column */}
          <div className="flex-none w-20 border-r border-slate-200/80 bg-slate-50/80 select-none">
            {/* Header placeholder */}
            <div className="h-12 border-b border-slate-200 bg-slate-50/80 flex items-center justify-center font-bold text-xs uppercase text-slate-400">
              Time
            </div>
            
            {/* Hour slot indicators */}
            {TIME_SLOTS.map((time) => (
              <div 
                key={time} 
                className="h-10 flex items-center justify-center border-b border-slate-200/40 text-[10px] font-bold text-slate-400"
              >
                {/* Display every hour slot fully, half-hours with dots or smaller labels */}
                {time.endsWith(":00 AM") || time.endsWith(":00 PM") ? (
                  <span>{time.replace(" AM", "").replace(" PM", "")} <span className="text-[8px] opacity-75">{time.slice(-2)}</span></span>
                ) : (
                  <span className="opacity-40">•</span>
                )}
              </div>
            ))}
          </div>

          {/* Days Grid Columns */}
          <div className="flex-1 flex flex-row min-w-[720px] relative">
            {DAYS.map(day => {
              const daySchedules = filteredSchedules.filter(s => s.day === day);
              const layouts = getDayLayouts(daySchedules);

              return (
                <div key={day} className="flex-1 relative border-r border-slate-200/80 last:border-r-0 min-w-[120px]">
                  
                  {/* Day Header */}
                  <div className="h-12 border-b border-slate-200 bg-slate-50/80 flex flex-col items-center justify-center select-none">
                    <span className="font-bold text-sm text-slate-800">{day}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                      {daySchedules.length} {daySchedules.length === 1 ? "Class" : "Classes"}
                    </span>
                  </div>

                  {/* Grid interactive cells */}
                  {TIME_SLOTS.map(slot => {
                    const dragStatus = getDragOverStatus(day, slot);
                    const isHovered = dragOverCell && dragOverCell.day === day && dragOverCell.time === slot;

                    let cellStyle = "bg-white border-b border-slate-100 hover:bg-slate-50/50";
                    if (isHovered) {
                      if (dragStatus === "invalid") {
                        cellStyle = "bg-red-50 border-b border-red-100 ring-2 ring-red-500 ring-inset z-20";
                      } else if (dragStatus === "valid") {
                        cellStyle = "bg-emerald-50 border-b border-emerald-100 ring-2 ring-emerald-500 ring-inset z-20";
                      }
                    } else if (conflictCell && conflictCell.day === day && conflictCell.time === slot) {
                      cellStyle = "bg-red-100 border-b border-red-200 z-10";
                    }

                    return (
                      <div
                        key={slot}
                        className={`h-10 transition-colors duration-100 cursor-cell relative ${cellStyle}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (!dragOverCell || dragOverCell.day !== day || dragOverCell.time !== slot) {
                            setDragOverCell({ day, time: slot });
                          }
                        }}
                        onDragLeave={() => {
                          setDragOverCell(null);
                        }}
                        onDrop={(e) => {
                          handleDrop(e, day, slot);
                        }}
                      />
                    );
                  })}

                  {/* Absolutely Positioned Class Cards */}
                  {daySchedules.map(s => {
                    const startIdx = timeToIndex(s.startTime);
                    const endIdx = timeToIndex(s.endTime);
                    const top = startIdx * 40 + 48; // 48px is the header height
                    const height = (endIdx - startIdx) * 40;
                    const cardColor = getCardColor(s.subjectCode);

                    // Find corresponding layout calculations
                    const layout = layouts.find(l => l.schedule.id === s.id);
                    const left = layout ? `calc(${layout.leftPct}% + 3px)` : "3px";
                    const width = layout ? `calc(${layout.widthPct}% - 6px)` : "calc(100% - 6px)";

                    return (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, s.id)}
                        onDragEnd={() => setDraggedScheduleId(null)}
                        className={`absolute rounded-xl p-2.5 border shadow-sm flex flex-col justify-between transition-all duration-200 cursor-grab active:cursor-grabbing hover:shadow-md group ${cardColor}`}
                        style={{
                          top: `${top + 3}px`,
                          height: `${height - 6}px`,
                          left,
                          width,
                          zIndex: draggedScheduleId === s.id ? 50 : 30
                        }}
                      >
                        <div className="flex flex-col h-full justify-between overflow-hidden">
                          <div>
                            {/* Card Top Title & Delete */}
                            <div className="flex items-start justify-between">
                              <span className="font-extrabold text-xs tracking-wide leading-tight truncate">
                                {s.subjectCode}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSchedule(s.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 hover:bg-white text-slate-800 rounded-full w-4.5 h-4.5 flex items-center justify-center text-[10px] font-bold shadow-sm border border-slate-200/40"
                                title="Delete Schedule"
                              >
                                &times;
                              </button>
                            </div>
                            
                            {/* Subject Title */}
                            <div className="font-semibold text-[9.5px] leading-tight mt-0.5 truncate opacity-90">
                              {s.subjectName}
                            </div>
                          </div>

                          {/* Card Details Footer */}
                          <div className="mt-1 space-y-0.5">
                            <div className="text-[8.5px] leading-none font-bold opacity-80 flex items-center gap-0.5 truncate">
                              <Layers className="w-2.5 h-2.5 flex-shrink-0" />
                              <span>{getSectionName(s.sectionId)}</span>
                            </div>
                            <div className="text-[8.5px] leading-none font-bold opacity-80 flex items-center gap-0.5 truncate">
                              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                              <span>{s.roomName}</span>
                            </div>
                            <div className="text-[8.5px] leading-none font-extrabold opacity-95 flex items-center gap-0.5 truncate">
                              <User className="w-2.5 h-2.5 flex-shrink-0" />
                              <span>{s.facultyName}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                </div>
              );
            })}
          </div>

        </div>
      </div>
      
    </div>
  );
}
