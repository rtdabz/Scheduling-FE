import React, { useState, useEffect } from "react";
import {
  Calendar,
  Search,
  Check,
  Trash2,
  X,
  BookOpen,
  Info,
  AlertTriangle,
  Clock,
  User,
  MapPin,
  Plus
} from "lucide-react";

// Interfaces
export interface Subject {
  id: string;
  code: string;
  name: string;
  units: number;
  category: "major" | "gec" | "gee" | "pathfit" | "nstp";
}

export interface Section {
  id: string;
  name: string;
}

export interface Faculty {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  name: string;
}

export interface ScheduleItem {
  id: string;
  subjectId: string;
  sectionId: string;
  facultyId: string;
  roomId: string;
  dayIndex: number; // 0 to 5 for Mon-Sat
  startSlot: number; // 0 to 27 (representing 30-min slots from 7:00 AM to 8:30 PM)
  durationSlots: number;
  mode: 'on-site' | 'online' | 'field';
}

interface DropContext {
  subjectId: string;
  dayIndex: number;
  startSlot: number;
  isRescheduling: boolean;
  scheduleId?: string;
}

// Mock Data
const MOCK_SUBJECTS: Subject[] = [
  // GEC (green)
  { id: "ge-101", code: "GE 101", name: "Understanding the Self", units: 3, category: "gec" },
  { id: "ge-102", code: "GE 102", name: "Readings in Philippine History", units: 3, category: "gec" },
  { id: "ge-103", code: "GE 103", name: "The Contemporary World", units: 3, category: "gec" },
  { id: "ge-104", code: "GE 104", name: "Mathematics in the Modern World", units: 3, category: "gec" },
  
  // Major (blue)
  { id: "cs-401", code: "CS 401", name: "Intelligent Systems", units: 3, category: "major" },
  { id: "cs-402", code: "CS 402", name: "Software Engineering", units: 3, category: "major" },
  { id: "cs-403", code: "CS 403", name: "Network Security", units: 3, category: "major" },
  { id: "cs-404", code: "CS 404", name: "Data Science & Analytics", units: 3, category: "major" },
  
  // GEE (purple)
  { id: "gee-101", code: "GEE 101", name: "GE Elective 1 (Environmental Science)", units: 3, category: "gee" },
  { id: "gee-102", code: "GEE 102", name: "GE Elective 2 (Entrepreneurship)", units: 3, category: "gee" },
  
  // PATHFIT (orange)
  { id: "pe-101", code: "PATHFIT 1", name: "Movement Competency Training", units: 2, category: "pathfit" },
  
  // NSTP (yellow)
  { id: "nstp-101", code: "NSTP 1", name: "National Service Training Program 1", units: 3, category: "nstp" }
];

const MOCK_SECTIONS: Section[] = [
  { id: "sec-cit-1", name: "BSCS 4A" },
  { id: "sec-cit-2", name: "BSCS 4B" },
  { id: "sec-cit-3", name: "BSIT 3A" },
  { id: "sec-cas-1", name: "BS-Psych 1A" },
  { id: "sec-cas-2", name: "BS-Psych 2A" }
];

const MOCK_FACULTY: Faculty[] = [
  { id: "fac-1", name: "Dr. Alan Turing" },
  { id: "fac-2", name: "Dr. Grace Hopper" },
  { id: "fac-3", name: "Prof. Ada Lovelace" },
  { id: "fac-4", name: "Dr. Marie Curie" },
  { id: "fac-5", name: "Prof. Albert Einstein" }
];

const MOCK_ROOMS: Room[] = [
  { id: "room-1", name: "Lab 101" },
  { id: "room-2", name: "Lab 102" },
  { id: "room-3", name: "Room 301" },
  { id: "room-4", name: "Room 302" },
  { id: "room-5", name: "AVR Room" },
  { id: "room-6", name: "Gymnasium" }
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Helper to convert slot index to time string
const slotToTimeStr = (slotIndex: number): string => {
  const totalMinutes = 7 * 60 + slotIndex * 30;
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
};

// Colors mapping
const getCategoryStyles = (category: Subject["category"]) => {
  switch (category) {
    case "major":
      return {
        bg: "bg-blue-50/90 hover:bg-blue-100/50",
        text: "text-blue-800",
        border: "border-blue-300",
        badge: "bg-blue-100 text-blue-800 border-blue-200"
      };
    case "gec":
      return {
        bg: "bg-emerald-50/90 hover:bg-emerald-100/50",
        text: "text-emerald-800",
        border: "border-emerald-300",
        badge: "bg-emerald-100 text-emerald-800 border-emerald-200"
      };
    case "gee":
      return {
        bg: "bg-purple-50/90 hover:bg-purple-100/50",
        text: "text-purple-800",
        border: "border-purple-300",
        badge: "bg-purple-100 text-purple-800 border-purple-200"
      };
    case "pathfit":
      return {
        bg: "bg-orange-50/90 hover:bg-orange-100/50",
        text: "text-orange-800",
        border: "border-orange-300",
        badge: "bg-orange-100 text-orange-800 border-orange-200"
      };
    case "nstp":
      return {
        bg: "bg-yellow-50/90 hover:bg-yellow-100/50",
        text: "text-yellow-800",
        border: "border-yellow-300",
        badge: "bg-yellow-100 text-yellow-800 border-yellow-200"
      };
    default:
      return {
        bg: "bg-slate-50",
        text: "text-slate-800",
        border: "border-slate-300",
        badge: "bg-slate-100 text-slate-800 border-slate-200"
      };
  }
};

// Initial Mock Schedules
const DEFAULT_SCHEDULES: ScheduleItem[] = [
  {
    id: "sched-1",
    subjectId: "cs-401",
    sectionId: "sec-cit-1",
    facultyId: "fac-1",
    roomId: "room-1",
    dayIndex: 0, // Mon
    startSlot: 4, // 9:00 AM
    durationSlots: 6, // 3 units = 3 hours = 6 slots
    mode: 'on-site'
  },
  {
    id: "sched-2",
    subjectId: "cs-402",
    sectionId: "sec-cit-1",
    facultyId: "fac-2",
    roomId: "room-3",
    dayIndex: 2, // Wed
    startSlot: 4, // 9:00 AM
    durationSlots: 6, // 3 units = 3 hours = 6 slots
    mode: 'online'
  }
];

export default function SchedulerPanel() {
  // Required states (retained and extended)
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [dragSubjectId, setDragSubjectId] = useState<string | null>(null);
  const [dragFromCell, setDragFromCell] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // New features states
  const [schedules, setSchedules] = useState<ScheduleItem[]>(DEFAULT_SCHEDULES);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("sec-cit-1");
  const [scheduleStatus, setScheduleStatus] = useState<Record<string, "draft" | "submitted" | "approved_by_dean" | "rejected_by_dean" | "approved" | "rejected">>({
    "sec-cit-1": "draft",
    "sec-cit-2": "draft",
    "sec-cit-3": "draft",
    "sec-cas-1": "draft",
    "sec-cas-2": "draft"
  });
  const [preAssignments, setPreAssignments] = useState<Record<string, { facultyId?: string; roomId?: string }>>({});
  
  // Modal drop state
  const [dropContext, setDropContext] = useState<DropContext | null>(null);
  const [modalFacultyId, setModalFacultyId] = useState<string>("");
  const [modalRoomId, setModalRoomId] = useState<string>("");
  const [modalClassMode, setModalClassMode] = useState<'on-site' | 'online' | 'field'>("on-site");

  // Dragging schedule card state
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);

  // Conflict UI state
  const [conflictInfo, setConflictInfo] = useState<{
    dayIndex: number;
    startSlot: number;
    durationSlots: number;
    message: string;
  } | null>(null);

  // Active section status
  const currentStatus = selectedSectionId ? (scheduleStatus[selectedSectionId] || "draft") : "draft";
  const isEditable = currentStatus === "draft";

  // Pre-fill dropdowns and class mode when dropContext updates
  useEffect(() => {
    if (dropContext) {
      const subject = MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId);
      const isFieldSubject = subject?.category === "pathfit" || subject?.category === "nstp";

      if (isFieldSubject) {
        setModalClassMode("field");
      } else {
        if (dropContext.isRescheduling && dropContext.scheduleId) {
          const existing = schedules.find((s) => s.id === dropContext.scheduleId);
          if (existing) {
            setModalFacultyId(existing.facultyId);
            setModalRoomId(existing.roomId);
            setModalClassMode(existing.mode || "on-site");
          }
        } else {
          const pre = preAssignments[dropContext.subjectId];
          setModalFacultyId(pre?.facultyId || "");
          setModalRoomId(pre?.roomId || "");
          setModalClassMode("on-site");
        }
      }
    }
  }, [dropContext, preAssignments, schedules]);

  // Synchronize the required 'placed' state for backward compatibility / inspection
  useEffect(() => {
    const nextPlaced: Record<string, string> = {};
    schedules.forEach((s) => {
      for (let offset = 0; offset < s.durationSlots; offset++) {
        const key = `${s.dayIndex}-${s.startSlot + offset}`;
        nextPlaced[key] = s.subjectId;
      }
    });
    setPlaced(nextPlaced);
  }, [schedules]);

  // Filter subjects based on query
  const filteredSubjects = MOCK_SUBJECTS.filter((subject) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      subject.code.toLowerCase().includes(term) ||
      subject.name.toLowerCase().includes(term)
    );
  });

  // Calculate statistics
  const totalSubjects = MOCK_SUBJECTS.length;
  const scheduledSubjectIds = new Set(schedules.map((s) => s.subjectId));
  const totalScheduled = scheduledSubjectIds.size;

  // Conflict Checker
  const checkConflict = (
    subjectId: string,
    sectionId: string,
    facultyId: string,
    roomId: string,
    dayIndex: number,
    startSlot: number,
    durationSlots: number,
    excludeScheduleId?: string
  ): { conflictType: "room" | "faculty" | "section"; message: string } | null => {
    const endSlot = startSlot + durationSlots;

    // Boundary check
    if (endSlot > 28) {
      return {
        conflictType: "section",
        message: "The schedule duration exceeds the grid operating hours (9:00 PM)."
      };
    }

    for (const s of schedules) {
      if (excludeScheduleId && s.id === excludeScheduleId) continue;

      const sEnd = s.startSlot + s.durationSlots;
      // Overlap condition: start1 < end2 && start2 < end1
      const overlaps = dayIndex === s.dayIndex && startSlot < sEnd && s.startSlot < endSlot;

      if (overlaps) {
        // 1. Same section conflict
        if (s.sectionId === sectionId) {
          const subject = MOCK_SUBJECTS.find((sub) => sub.id === s.subjectId);
          return {
            conflictType: "section",
            message: `Section conflict: This section already has a class (${subject?.code || ""}) scheduled at this time.`
          };
        }

        // 2. Same faculty conflict
        if (s.facultyId === facultyId) {
          const faculty = MOCK_FACULTY.find((f) => f.id === facultyId);
          return {
            conflictType: "faculty",
            message: `Faculty conflict: ${faculty?.name || "Selected faculty"} is already teaching a class in another section at this time.`
          };
        }

        // 3. Same room conflict
        if (s.roomId === roomId) {
          const room = MOCK_ROOMS.find((r) => r.id === roomId);
          return {
            conflictType: "room",
            message: `Room conflict: ${room?.name || "Selected room"} is already occupied at this time.`
          };
        }
      }
    }

    return null;
  };

  // Drag and Drop handlers
  const handleDragStartFromBank = (e: React.DragEvent, subjectId: string) => {
    setDragSubjectId(subjectId);
    setDraggedScheduleId(null);
    setDragFromCell(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", subjectId);
  };

  const handleDragStartFromCell = (
    e: React.DragEvent,
    schedule: ScheduleItem
  ) => {
    setDraggedScheduleId(schedule.id);
    setDragSubjectId(null);
    setDragFromCell(`${schedule.dayIndex}-${schedule.startSlot}`);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", schedule.subjectId);
  };

  const handleDragEnd = () => {
    setDragSubjectId(null);
    setDraggedScheduleId(null);
    setDragFromCell(null);
    setHoveredCell(null);
  };

  const handleDragOver = (e: React.DragEvent, dayIndex: number, timeIndex: number) => {
    e.preventDefault();
    const cellKey = `${dayIndex}-${timeIndex}`;
    if (hoveredCell !== cellKey) {
      setHoveredCell(cellKey);
    }
  };

  const handleDragLeave = () => {
    setHoveredCell(null);
  };

  const handleDrop = (e: React.DragEvent, dayIndex: number, timeIndex: number) => {
    e.preventDefault();
    setHoveredCell(null);
    setConflictInfo(null);

    const subjectId = e.dataTransfer.getData("text/plain") || dragSubjectId;
    if (!subjectId) return;

    if (draggedScheduleId) {
      // Rescheduling existing schedule
      const sched = schedules.find((s) => s.id === draggedScheduleId);
      if (!sched) return;

      const durationSlots = sched.durationSlots;

      // Run conflict check for rescheduled slot
      const conflict = checkConflict(
        sched.subjectId,
        sched.sectionId,
        sched.facultyId,
        sched.roomId,
        dayIndex,
        timeIndex,
        durationSlots,
        sched.id
      );

      if (conflict) {
        setConflictInfo({
          dayIndex,
          startSlot: timeIndex,
          durationSlots,
          message: conflict.message
        });
        setDraggedScheduleId(null);
        setDragFromCell(null);
        return;
      }

      // No conflict, move schedule
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === draggedScheduleId
            ? { ...s, dayIndex, startSlot: timeIndex }
            : s
        )
      );

      setDraggedScheduleId(null);
      setDragFromCell(null);
    } else {
      // Dropping new subject from bank
      setDropContext({
        subjectId,
        dayIndex,
        startSlot: timeIndex,
        isRescheduling: false
      });
      setDragSubjectId(null);
    }
  };

  const handleConfirmSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dropContext) return;

    if (!modalFacultyId || !modalRoomId) {
      alert("Please select both Faculty and Room.");
      return;
    }

    const subject = MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId);
    if (!subject) return;

    const durationSlots = subject.units * 2;

    // Run conflict check
    const conflict = checkConflict(
      dropContext.subjectId,
      selectedSectionId,
      modalFacultyId,
      modalRoomId,
      dropContext.dayIndex,
      dropContext.startSlot,
      durationSlots
    );

    if (conflict) {
      setConflictInfo({
        dayIndex: dropContext.dayIndex,
        startSlot: dropContext.startSlot,
        durationSlots,
        message: conflict.message
      });
      setDropContext(null);
      return;
    }

    // Save schedule
    const newSchedule: ScheduleItem = {
      id: `sched-${Date.now()}`,
      subjectId: dropContext.subjectId,
      sectionId: selectedSectionId,
      facultyId: modalFacultyId,
      roomId: modalRoomId,
      dayIndex: dropContext.dayIndex,
      startSlot: dropContext.startSlot,
      durationSlots,
      mode: modalClassMode
    };

    setSchedules((prev) => [...prev, newSchedule]);
    setDropContext(null);
    setConflictInfo(null);
  };

  const handleRemoveSchedule = (scheduleId: string) => {
    if (!isEditable) return;
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    setConflictInfo(null);
  };

  const handleClearAll = () => {
    if (!isEditable) return;
    if (confirm("Are you sure you want to clear the entire schedule for all sections?")) {
      setSchedules([]);
      setConflictInfo(null);
    }
  };

  const handlePreAssign = (subjectId: string, field: "facultyId" | "roomId", value: string) => {
    setPreAssignments((prev) => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        [field]: value
      }
    }));
  };

  const handleSubmitForApproval = () => {
    if (!selectedSectionId) return;
    setScheduleStatus((prev) => ({
      ...prev,
      [selectedSectionId]: "submitted"
    }));
  };

  const handleStatusChange = (sectionId: string, status: any) => {
    setScheduleStatus((prev) => ({
      ...prev,
      [sectionId]: status
    }));
  };

  const getClassesCountForDay = (dayIdx: number) => {
    return schedules.filter(
      (s) => s.sectionId === selectedSectionId && s.dayIndex === dayIdx
    ).length;
  };

  // Helper to render beautiful status badges
  const renderStatusBadge = (status: typeof currentStatus) => {
    switch (status) {
      case "draft":
        return (
          <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            Draft
          </span>
        );
      case "submitted":
        return (
          <span className="bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            Submitted
          </span>
        );
      case "approved_by_dean":
        return (
          <span className="bg-green-100 text-green-800 border border-green-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            Approved by Dean
          </span>
        );
      case "rejected_by_dean":
        return (
          <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            Rejected by Dean
          </span>
        );
      case "approved":
        return (
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            Approved (VPAA)
          </span>
        );
      case "rejected":
        return (
          <span className="bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
            Rejected (VPAA)
          </span>
        );
      default:
        return null;
    }
  };

  // Pre-calculated stats for Left Panel
  const listCategories: Subject["category"][] = ["major", "gec", "gee", "pathfit", "nstp"];

  const sectionSchedules = schedules.filter((s) => s.sectionId === selectedSectionId);

  return (
    <div className="flex flex-col gap-6 w-full text-slate-800 antialiased">
      {/* ================= TOP BAR ================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-2xl shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Select Section:
            </span>
            <select
              value={selectedSectionId}
              onChange={(e) => {
                setSelectedSectionId(e.target.value);
                setConflictInfo(null);
              }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold"
            >
              <option value="">-- Choose Section --</option>
              {MOCK_SECTIONS.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>

          {selectedSectionId && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-xl">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Active:</span>
              <span className="text-xs font-extrabold text-slate-800">
                {MOCK_SECTIONS.find((s) => s.id === selectedSectionId)?.name}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 md:ml-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            {renderStatusBadge(currentStatus)}
          </div>

          <button
            onClick={handleSubmitForApproval}
            disabled={!selectedSectionId || currentStatus !== "draft"}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-150 shadow-sm ${
              selectedSectionId && currentStatus === "draft"
                ? "bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow"
                : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
            }`}
          >
            Submit for Approval
          </button>

          {/* Dev Mode simulation toggle */}
          {selectedSectionId && (
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Dev SIM:</span>
              <select
                value={currentStatus}
                onChange={(e) => handleStatusChange(selectedSectionId, e.target.value)}
                className="text-[10px] bg-transparent outline-none font-bold text-slate-600 border-none p-0 cursor-pointer"
              >
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="approved_by_dean">Approved by Dean</option>
                <option value="rejected_by_dean">Rejected by Dean</option>
                <option value="approved">Approved (VPAA)</option>
                <option value="rejected">Rejected (VPAA)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ================= MAIN CONTAINER ================= */}
      <div className="flex flex-col lg:flex-row gap-6 w-full h-[700px] min-h-[600px] overflow-hidden">
        
        {/* LEFT PANEL: Subject Bank */}
        <div className="w-full lg:w-1/4 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Subjects
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-none">
              Drag subjects to place on timetable
            </p>
          </div>

          {/* Search Box */}
          <div className="p-3 border-b border-slate-100 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search subjects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium"
              />
            </div>
          </div>

          {/* Collapsible Subject List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {!selectedSectionId ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <AlertTriangle className="w-8 h-8 text-amber-500 mb-2 stroke-[1.5]" />
                <p className="text-xs font-semibold text-slate-500">
                  Select a section first to enable scheduling.
                </p>
              </div>
            ) : (
              listCategories.map((category) => {
                const list = filteredSubjects.filter((s) => s.category === category);
                if (list.length === 0) return null;

                return (
                  <div key={category} className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {category}
                      </span>
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold">
                        {list.length}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {list.map((subject) => {
                        const isPlaced = scheduledSubjectIds.has(subject.id);
                        const styles = getCategoryStyles(subject.category);

                        return (
                          <div
                            key={subject.id}
                            draggable={isEditable}
                            onDragStart={(e) => handleDragStartFromBank(e, subject.id)}
                            onDragEnd={handleDragEnd}
                            className={`group border rounded-xl p-2.5 transition-all duration-200 select-none ${
                              !isEditable
                                ? "opacity-75 cursor-not-allowed bg-slate-50"
                                : isPlaced
                                ? `cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 opacity-60 bg-slate-50/80 border-slate-200`
                                : `cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5 ${styles.bg} ${styles.border} ${styles.text}`
                            }`}
                          >
                            <div className="flex justify-between items-start gap-1">
                              <span className="font-extrabold text-[11px] uppercase tracking-wide truncate">
                                {subject.code}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {isPlaced && (
                                  <span className="flex items-center justify-center bg-emerald-100 text-emerald-800 border border-emerald-200 rounded px-1 text-[8px] font-bold">
                                    <Check className="w-2.5 h-2.5 mr-0.5 stroke-[3]" />
                                    Placed
                                  </span>
                                )}
                                <span
                                  className={`text-[9px] px-1 rounded font-bold border shrink-0 ${
                                    isPlaced
                                      ? "bg-slate-200 text-slate-600 border-slate-300"
                                      : styles.badge
                                  }`}
                                >
                                  {subject.units}u
                                </span>
                              </div>
                            </div>
                            <div className="text-[10px] font-semibold leading-tight mt-1 truncate">
                              {subject.name}
                            </div>

                            {/* Pre-assignment selection dropdowns */}
                            <div className="mt-2 pt-2 border-t border-slate-100 flex gap-1">
                              <select
                                value={preAssignments[subject.id]?.facultyId || ""}
                                onChange={(e) => handlePreAssign(subject.id, "facultyId", e.target.value)}
                                className="flex-1 text-[9px] bg-slate-50 border border-slate-200 rounded px-1 py-0.5 outline-none focus:border-indigo-500 max-w-[50%] font-semibold"
                                disabled={!isEditable}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="">Faculty...</option>
                                {MOCK_FACULTY.map((f) => (
                                  <option key={f.id} value={f.id}>
                                    {f.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={preAssignments[subject.id]?.roomId || ""}
                                onChange={(e) => handlePreAssign(subject.id, "roomId", e.target.value)}
                                className="flex-1 text-[9px] bg-slate-50 border border-slate-200 rounded px-1 py-0.5 outline-none focus:border-indigo-500 max-w-[50%] font-semibold"
                                disabled={!isEditable}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="">Room...</option>
                                {MOCK_ROOMS.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}

            {selectedSectionId && filteredSubjects.length === 0 && (
              <div className="text-center py-6 text-slate-400 text-xs">
                No subjects found
              </div>
            )}
          </div>

          {/* Footer stats */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs font-semibold text-slate-500 select-none shrink-0">
            <span>Scheduled Subjects</span>
            <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[10px]">
              {totalScheduled} of {totalSubjects} placed
            </span>
          </div>
        </div>

        {/* RIGHT PANEL: Timetable Grid */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
          {/* Header bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-3.5 border-b border-slate-200 bg-slate-50/30 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Timetable Grid
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-semibold">
                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                  Section: {selectedSectionId ? (MOCK_SECTIONS.find((s) => s.id === selectedSectionId)?.name || "None") : "None"}
                </span>
                <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                  1st Semester, AY 2026-2027
                </span>
              </div>
            </div>

            <button
              onClick={handleClearAll}
              disabled={!isEditable || schedules.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition-all duration-150 shadow-sm ${
                isEditable && schedules.length > 0
                  ? "hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                  : "opacity-50 cursor-not-allowed"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </button>
          </div>

          {/* Grid Scroll Container */}
          <div className="flex-1 overflow-auto bg-slate-50/20 p-4 relative">
            {!selectedSectionId ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-20">
                <AlertTriangle className="w-12 h-12 text-amber-500 mb-3 animate-bounce" />
                <h3 className="text-sm font-bold text-slate-800">No Section Selected</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs text-center">
                  Please select a section from the top bar dropdown menu to load its timetable grid and edit scheduled classes.
                </p>
              </div>
            ) : (
              <div
                className="min-w-[900px] border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white relative select-none"
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px repeat(6, minmax(0, 1fr))",
                  gridTemplateRows: "42px repeat(28, 48px)" // Header row + 28 rows of 48px
                }}
              >
                {/* 1. HEADER ROW */}
                <div
                  className="bg-slate-50/80 border-r border-b border-slate-200 p-2 font-bold text-[10px] text-slate-500 text-center uppercase tracking-wider select-none flex items-center justify-center"
                  style={{ gridColumn: 1, gridRow: 1 }}
                >
                  Time
                </div>

                {DAYS.map((day, dIdx) => (
                  <div
                    key={day}
                    className="bg-slate-50/80 border-r border-b border-slate-200 p-1 font-bold text-xs text-slate-700 text-center uppercase tracking-wider select-none flex flex-col justify-center items-center"
                    style={{ gridColumn: dIdx + 2, gridRow: 1 }}
                  >
                    <span className="text-slate-800 font-extrabold">{day}</span>
                    <span className="text-[9px] text-slate-500 font-bold mt-0.5 bg-slate-100 px-1.5 py-0.5 rounded-full">
                      {getClassesCountForDay(dIdx)} {getClassesCountForDay(dIdx) === 1 ? "Class" : "Classes"}
                    </span>
                  </div>
                ))}

                {/* 2. BACKGROUND CELL GRID */}
                {Array.from({ length: 28 }).map((_, t) => {
                  return (
                    <React.Fragment key={`row-${t}`}>
                      {/* Hourly Time labels on column 1 */}
                      {t % 2 === 0 && (
                        <div
                          className="bg-slate-50/30 border-r border-b border-slate-200 p-1 text-[10px] font-semibold text-slate-500 flex flex-col justify-center items-center select-none"
                          style={{
                            gridColumn: 1,
                            gridRow: `${t + 2} / span 2`
                          }}
                        >
                          <span className="font-extrabold text-slate-700 text-[10px]">
                            {slotToTimeStr(t)}
                          </span>
                        </div>
                      )}

                      {/* Day cells for slot t */}
                      {DAYS.map((_, d) => {
                        const cellKey = `${d}-${t}`;
                        const isHovered = hoveredCell === cellKey;
                        const isConflict = conflictInfo && 
                          conflictInfo.dayIndex === d && 
                          t >= conflictInfo.startSlot && 
                          t < conflictInfo.startSlot + conflictInfo.durationSlots;

                        return (
                          <div
                            key={`cell-${d}-${t}`}
                            onDragOver={(e) => isEditable && handleDragOver(e, d, t)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => isEditable && handleDrop(e, d, t)}
                            className={`border-r border-b border-slate-200 transition-all duration-150 relative flex items-center justify-center ${
                              isHovered
                                ? isConflict
                                  ? "bg-rose-100 ring-2 ring-rose-500/20 ring-inset"
                                  : "bg-indigo-100 ring-2 ring-indigo-500/20 ring-inset"
                                : isConflict
                                ? "bg-rose-50 border-rose-200"
                                : "bg-white hover:bg-slate-50/30"
                            }`}
                            style={{
                              gridColumn: d + 2,
                              gridRow: t + 2
                            }}
                          >
                            {!isHovered && !isConflict && (
                              <span className="opacity-0 hover:opacity-100 text-[9px] text-indigo-400 font-extrabold select-none pointer-events-none transition-opacity duration-150">
                                + Add
                              </span>
                            )}
                            {isHovered && (
                              <span className={`text-[9px] font-extrabold select-none pointer-events-none ${isConflict ? "text-rose-600" : "text-indigo-600"}`}>
                                {isConflict ? "Conflict" : "Place"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {/* 3. SCHEDULE OVERLAY CARDS */}
                {sectionSchedules.map((schedule) => {
                  const subject = MOCK_SUBJECTS.find((s) => s.id === schedule.subjectId);
                  const faculty = MOCK_FACULTY.find((f) => f.id === schedule.facultyId);
                  const room = MOCK_ROOMS.find((r) => r.id === schedule.roomId);

                  if (!subject) return null;

                  const styles = getCategoryStyles(subject.category);
                  const isDraggingThis = draggedScheduleId === schedule.id;

                  return (
                    <div
                      key={schedule.id}
                      draggable={isEditable}
                      onDragStart={(e) => handleDragStartFromCell(e, schedule)}
                      onDragEnd={handleDragEnd}
                      className={`rounded-xl border p-2 flex flex-col justify-between relative shadow-xs hover:shadow transition-all duration-200 group ${
                        isDraggingThis ? "opacity-30" : "opacity-100"
                      } ${isEditable ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"} ${styles.bg} ${styles.border} ${styles.text}`}
                      style={{
                        gridColumn: schedule.dayIndex + 2,
                        gridRow: `${schedule.startSlot + 2} / span ${schedule.durationSlots}`,
                        zIndex: 10,
                        margin: "2.5px",
                        overflow: "hidden"
                      }}
                    >
                      {/* Delete button */}
                      {isEditable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveSchedule(schedule.id);
                          }}
                          className="absolute top-1.5 right-1.5 bg-white border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-full w-4.5 h-4.5 flex items-center justify-center text-xs font-semibold shadow transition-all duration-150 opacity-0 group-hover:opacity-100 z-20"
                          title="Remove Schedule"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}

                      <div className="flex flex-col h-full justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-1">
                            <span className="font-extrabold text-[10px] uppercase tracking-wide truncate">
                              {subject.code}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`text-[8px] px-1 rounded font-bold border ${styles.badge}`}>
                                {subject.units}u
                              </span>
                              <span className={`text-[8px] px-1 rounded font-bold border uppercase ${
                                schedule.mode === 'on-site'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : schedule.mode === 'online'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-705 border-amber-200'
                              }`}>
                                {schedule.mode === 'on-site' ? 'On-Site' : schedule.mode === 'online' ? 'Online' : 'Field'}
                              </span>
                            </div>
                          </div>
                          <div className="text-[9px] font-bold leading-tight mt-0.5 truncate" title={subject.name}>
                            {subject.name}
                          </div>
                        </div>

                        <div className="mt-1 space-y-0.5">
                          {faculty && (
                            <div className="text-[8px] font-medium opacity-80 flex items-center gap-1 truncate">
                              <span className="font-extrabold">Fac:</span> {faculty.name}
                            </div>
                          )}
                          {room && (
                            <div className="text-[8px] font-medium opacity-80 flex items-center gap-1">
                              <span className="font-extrabold">Room:</span> {room.name}
                            </div>
                          )}
                        </div>

                        <div className="text-[8px] font-extrabold uppercase tracking-wider opacity-60 mt-1 flex justify-between items-center border-t border-slate-200/50 pt-1 shrink-0">
                          <span>{subject.category}</span>
                          <span className="font-bold">
                            {slotToTimeStr(schedule.startSlot)} - {slotToTimeStr(schedule.startSlot + schedule.durationSlots)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conflict Error Message Display */}
          {conflictInfo && (
            <div className="mx-6 my-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 shrink-0">
              <AlertTriangle className="w-4.5 h-4.5 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-rose-900">Schedule Conflict Detected</h4>
                <p className="text-[11px] text-rose-700 mt-0.5 font-medium">
                  {conflictInfo.message}
                </p>
              </div>
              <button
                onClick={() => setConflictInfo(null)}
                className="ml-auto text-rose-400 hover:text-rose-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Legend */}
          <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 shrink-0">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              Categories:
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-400"></span>
              Major
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-50 border border-emerald-400"></span>
              GEC
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-purple-50 border border-purple-400"></span>
              GEE
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-orange-50 border border-orange-400"></span>
              PATHFIT
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-yellow-50 border border-yellow-400"></span>
              NSTP
            </span>
          </div>
        </div>
      </div>

      {/* ================= INLINE CONFIRMATION MODAL ================= */}
      {dropContext && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl p-5 w-80 max-w-sm flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Schedule Details</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Confirm assignments to place the subject
                </p>
              </div>
              <button
                onClick={() => setDropContext(null)}
                className="text-slate-400 hover:text-slate-600 rounded-full p-1 bg-slate-50 border border-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 flex flex-col gap-1 text-[11px] text-indigo-900">
              <div className="flex justify-between font-bold">
                <span>Subject:</span>
                <span>
                  {MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId)?.code}
                </span>
              </div>
              <div className="truncate font-semibold text-indigo-700/80">
                {MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId)?.name}
              </div>
              <div className="flex justify-between font-bold mt-1 pt-1 border-t border-indigo-100">
                <span>Day & Start:</span>
                <span className="text-slate-700">
                  {DAYS[dropContext.dayIndex]}, {slotToTimeStr(dropContext.startSlot)}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Duration / End:</span>
                <span className="text-slate-700">
                  {MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId)?.units}h /{" "}
                  {slotToTimeStr(
                    dropContext.startSlot +
                      (MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId)?.units || 0) * 2
                  )}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmSchedule} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Select Faculty
                </label>
                <select
                  value={modalFacultyId}
                  onChange={(e) => setModalFacultyId(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 font-semibold"
                  required
                >
                  <option value="">-- Select Faculty --</option>
                  {MOCK_FACULTY.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Select Room
                </label>
                <select
                  value={modalRoomId}
                  onChange={(e) => setModalRoomId(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-indigo-500 font-semibold"
                  required
                >
                  <option value="">-- Select Room --</option>
                  {MOCK_ROOMS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Class Mode
                </label>
                <div className="flex gap-2">
                  {(['on-site', 'online', 'field'] as const).map((m) => {
                    const subject = MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId);
                    const isFieldSubject = subject?.category === "pathfit" || subject?.category === "nstp";
                    
                    const isSelected = modalClassMode === m;
                    const isDisabled = isFieldSubject && m !== 'field';

                    return (
                      <button
                        key={m}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setModalClassMode(m)}
                        className={`flex-1 py-1.5 border rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#4e0a10] border-[#4e0a10] text-[#E8D5C4]'
                            : isDisabled
                            ? 'opacity-40 bg-gray-100 text-gray-450 border-gray-200 cursor-not-allowed'
                            : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50/50'
                        }`}
                      >
                        {m === 'on-site' ? 'On-Site' : m === 'online' ? 'Online' : 'Field'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2.5 mt-4">
                <button
                  type="button"
                  onClick={() => setDropContext(null)}
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
