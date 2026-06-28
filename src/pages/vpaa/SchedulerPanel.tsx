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
  Plus,
  ChevronDown,
  ChevronRight,
  Users,
  LayoutGrid,
  CheckCircle2,
  CalendarPlus,
  CalendarDays,
  Building2,
  Monitor,
  TreePine,
  Loader2
} from "lucide-react";

// ─── Interfaces ────────────────────────────────────────────────────────────────

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
  subjectCode: string;
  subjectName: string;
  subjectType: "major" | "gec" | "gee" | "pathfit" | "nstp";
  sectionName: string;
  roomName: string;
  day: string;
  startTime: string;
  endTime: string;
  mode: "on-site" | "online" | "field";
  facultyName: string | null;
  facultyId: string | null;
  status:
    | "draft"
    | "submitted"
    | "approved_by_dean"
    | "rejected_by_dean"
    | "approved"
    | "faculty_assignment"
    | "finalized"
    | "rejected";
  dayIndex: number;
  startSlot: number;
  durationSlots: number;
  sectionId: string;
  roomId: string;
}

interface DropContext {
  subjectId: string;
  dayIndex: number;
  startSlot: number;
  isRescheduling: boolean;
  scheduleId?: string;
}

interface FacultyAssignmentPopupState {
  scheduleId: string;
  facultyId: string;
}

interface ConflictInfo {
  dayIndex: number;
  startSlot: number;
  durationSlots: number;
  message: string;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MOCK_SUBJECTS: Subject[] = [
  { id: "ge-101", code: "GE 101", name: "Understanding the Self", units: 3, category: "gec" },
  { id: "ge-102", code: "GE 102", name: "Readings in Philippine History", units: 3, category: "gec" },
  { id: "ge-103", code: "GE 103", name: "The Contemporary World", units: 3, category: "gec" },
  { id: "ge-104", code: "GE 104", name: "Mathematics in the Modern World", units: 3, category: "gec" },
  { id: "cs-401", code: "CS 401", name: "Intelligent Systems", units: 3, category: "major" },
  { id: "cs-402", code: "CS 402", name: "Software Engineering", units: 3, category: "major" },
  { id: "cs-403", code: "CS 403", name: "Network Security", units: 3, category: "major" },
  { id: "cs-404", code: "CS 404", name: "Data Science & Analytics", units: 3, category: "major" },
  { id: "gee-101", code: "GEE 101", name: "GE Elective 1 (Environmental Science)", units: 3, category: "gee" },
  { id: "gee-102", code: "GEE 102", name: "GE Elective 2 (Entrepreneurship)", units: 3, category: "gee" },
  { id: "pe-101", code: "PATHFIT 1", name: "Movement Competency Training", units: 2, category: "pathfit" },
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

const DEFAULT_SCHEDULES: ScheduleItem[] = [
  {
    id: "sched-1",
    subjectId: "cs-401",
    subjectCode: "CS 401",
    subjectName: "Intelligent Systems",
    subjectType: "major",
    sectionName: "BSCS 4A",
    roomName: "Lab 101",
    day: "Mon",
    startTime: "7:00 AM",
    endTime: "10:00 AM",
    mode: "on-site",
    facultyName: null,
    facultyId: null,
    status: "draft",
    dayIndex: 0,
    startSlot: 0,
    durationSlots: 6,
    sectionId: "sec-cit-1",
    roomId: "room-1"
  },
  {
    id: "sched-2",
    subjectId: "cs-402",
    subjectCode: "CS 402",
    subjectName: "Software Engineering",
    subjectType: "major",
    sectionName: "BSCS 4A",
    roomName: "Lab 102",
    day: "Wed",
    startTime: "9:00 AM",
    endTime: "12:00 PM",
    mode: "on-site",
    facultyName: null,
    facultyId: null,
    status: "draft",
    dayIndex: 2,
    startSlot: 4,
    durationSlots: 6,
    sectionId: "sec-cit-1",
    roomId: "room-2"
  },
  {
    id: "sched-3",
    subjectId: "ge-101",
    subjectCode: "GE 101",
    subjectName: "Understanding the Self",
    subjectType: "gec",
    sectionName: "BSCS 4A",
    roomName: "Room 301",
    day: "Tue",
    startTime: "10:00 AM",
    endTime: "1:00 PM",
    mode: "on-site",
    facultyName: null,
    facultyId: null,
    status: "draft",
    dayIndex: 1,
    startSlot: 6,
    durationSlots: 6,
    sectionId: "sec-cit-1",
    roomId: "room-3"
  },
  {
    id: "sched-4",
    subjectId: "gee-101",
    subjectCode: "GEE 101",
    subjectName: "GE Elective 1 (Environmental Science)",
    subjectType: "gee",
    sectionName: "BSCS 4A",
    roomName: "Room 302",
    day: "Thu",
    startTime: "1:00 PM",
    endTime: "4:00 PM",
    mode: "online",
    facultyName: null,
    facultyId: null,
    status: "draft",
    dayIndex: 3,
    startSlot: 12,
    durationSlots: 6,
    sectionId: "sec-cit-1",
    roomId: "room-4"
  },
  {
    id: "sched-5",
    subjectId: "pe-101",
    subjectCode: "PATHFIT 1",
    subjectName: "Movement Competency Training",
    subjectType: "pathfit",
    sectionName: "BSCS 4A",
    roomName: "Gymnasium",
    day: "Fri",
    startTime: "8:00 AM",
    endTime: "10:00 AM",
    mode: "field",
    facultyName: null,
    facultyId: null,
    status: "draft",
    dayIndex: 4,
    startSlot: 2,
    durationSlots: 4,
    sectionId: "sec-cit-1",
    roomId: "room-6"
  },
  {
    id: "sched-6",
    subjectId: "cs-403",
    subjectCode: "CS 403",
    subjectName: "Network Security",
    subjectType: "major",
    sectionName: "BSCS 4B",
    roomName: "Lab 101",
    day: "Mon",
    startTime: "10:00 AM",
    endTime: "1:00 PM",
    mode: "on-site",
    facultyName: "Dr. Alan Turing",
    facultyId: "fac-1",
    status: "faculty_assignment",
    dayIndex: 0,
    startSlot: 6,
    durationSlots: 6,
    sectionId: "sec-cit-2",
    roomId: "room-1"
  },
  {
    id: "sched-7",
    subjectId: "cs-404",
    subjectCode: "CS 404",
    subjectName: "Data Science & Analytics",
    subjectType: "major",
    sectionName: "BSCS 4B",
    roomName: "Lab 102",
    day: "Wed",
    startTime: "1:00 PM",
    endTime: "4:00 PM",
    mode: "on-site",
    facultyName: null,
    facultyId: null,
    status: "faculty_assignment",
    dayIndex: 2,
    startSlot: 12,
    durationSlots: 6,
    sectionId: "sec-cit-2",
    roomId: "room-2"
  },
  {
    id: "sched-8",
    subjectId: "ge-102",
    subjectCode: "GE 102",
    subjectName: "Readings in Philippine History",
    subjectType: "gec",
    sectionName: "BSCS 4B",
    roomName: "Room 301",
    day: "Fri",
    startTime: "10:00 AM",
    endTime: "1:00 PM",
    mode: "on-site",
    facultyName: null,
    facultyId: null,
    status: "faculty_assignment",
    dayIndex: 4,
    startSlot: 6,
    durationSlots: 6,
    sectionId: "sec-cit-2",
    roomId: "room-3"
  }
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const slotToTimeStr = (slotIndex: number): string => {
  const totalMinutes = 7 * 60 + slotIndex * 30;
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
};

const getCategoryStyles = (category: Subject["category"]) => {
  switch (category) {
    case "major":
      return {
        bg: "bg-blue-50/90",
        text: "text-blue-800",
        border: "border-blue-300",
        badge: "bg-blue-100 text-blue-800 border-blue-200",
        typeBadge: "bg-blue-100 text-blue-800 border-blue-200",
        label: "MAJOR"
      };
    case "gec":
      return {
        bg: "bg-emerald-50/90",
        text: "text-emerald-800",
        border: "border-emerald-300",
        badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
        typeBadge: "bg-emerald-100 text-emerald-800 border-emerald-200",
        label: "GEC"
      };
    case "gee":
      return {
        bg: "bg-purple-50/90",
        text: "text-purple-800",
        border: "border-purple-300",
        badge: "bg-purple-100 text-purple-800 border-purple-200",
        typeBadge: "bg-purple-100 text-purple-800 border-purple-200",
        label: "GEE"
      };
    case "pathfit":
      return {
        bg: "bg-orange-50/90",
        text: "text-orange-800",
        border: "border-orange-300",
        badge: "bg-orange-100 text-orange-800 border-orange-200",
        typeBadge: "bg-orange-100 text-orange-800 border-orange-200",
        label: "PATHFIT"
      };
    case "nstp":
      return {
        bg: "bg-yellow-50/90",
        text: "text-yellow-800",
        border: "border-yellow-300",
        badge: "bg-yellow-100 text-yellow-800 border-yellow-200",
        typeBadge: "bg-yellow-100 text-yellow-800 border-yellow-200",
        label: "NSTP"
      };
    default:
      return {
        bg: "bg-slate-50",
        text: "text-slate-800",
        border: "border-slate-300",
        badge: "bg-slate-100 text-slate-800 border-slate-200",
        typeBadge: "bg-slate-100 text-slate-800 border-slate-200",
        label: "OTHER"
      };
  }
};

const getLeftAccentBorder = (category: Subject["category"]) => {
  switch (category) {
    case "major":   return "border-l-4 border-blue-500";
    case "gec":     return "border-l-4 border-emerald-500";
    case "gee":     return "border-l-4 border-purple-500";
    case "pathfit": return "border-l-4 border-orange-500";
    case "nstp":    return "border-l-4 border-yellow-500";
    default:        return "border-l-4 border-slate-500";
  }
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function SchedulerPanel() {
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [dragSubjectId, setDragSubjectId] = useState<string | null>(null);
  const [draggedScheduleId, setDraggedScheduleId] = useState<string | null>(null);
  const [dragFromCell, setDragFromCell] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const [schedules, setSchedules] = useState<ScheduleItem[]>(DEFAULT_SCHEDULES);
  const [selectedSectionId, setSelectedSectionId] = useState<string>("sec-cit-1");
  const [scheduleStatus, setScheduleStatus] = useState<Record<string, ScheduleItem["status"]>>({
    "sec-cit-1": "draft",
    "sec-cit-2": "faculty_assignment",
    "sec-cit-3": "draft",
    "sec-cas-1": "draft",
    "sec-cas-2": "draft"
  });

  const [dropContext, setDropContext] = useState<DropContext | null>(null);
  const [modalRoomId, setModalRoomId] = useState<string>("");
  const [modalClassMode, setModalClassMode] = useState<"on-site" | "online" | "field">("on-site");
  const [modalValidationError, setModalValidationError] = useState<string>("");
  const [modalConflict, setModalConflict] = useState<string | null>(null);

  const [facultyAssignmentPopup, setFacultyAssignmentPopup] = useState<FacultyAssignmentPopupState | null>(null);
  const [popupValidationError, setPopupValidationError] = useState<string>("");
  const [popupConflictWarning, setPopupConflictWarning] = useState<string>("");

  const [isSectionDropdownOpen, setIsSectionDropdownOpen] = useState(false);
  const [isAssignedListCollapsed, setIsAssignedListCollapsed] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isModalLoading, setIsModalLoading] = useState(false);

  // ── Derived state ───────────────────────────────────────────────────────────

  const currentStatus: ScheduleItem["status"] = selectedSectionId
    ? (scheduleStatus[selectedSectionId] ?? "draft")
    : "draft";

  const isPhase2Active = ["approved", "faculty_assignment", "finalized"].includes(currentStatus);
  const isEditable = currentStatus === "draft";
  const isPhase1Completed = ["approved", "faculty_assignment", "finalized"].includes(currentStatus);
  const isPhase2Completed = currentStatus === "finalized";

  const sectionSchedules = schedules.filter((s) => s.sectionId === selectedSectionId);
  const scheduledSubjectIds = new Set(sectionSchedules.map((s) => s.subjectId));
  const totalSubjects = MOCK_SUBJECTS.length;
  const totalScheduled = new Set(sectionSchedules.map((s) => s.subjectId)).size;

  const totalSlotsCount = sectionSchedules.length;
  const assignedSlotsCount = sectionSchedules.filter((s) => !!s.facultyId).length;
  const unassignedSlotsCount = totalSlotsCount - assignedSlotsCount;

  const dropSubject = dropContext
    ? MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId) ?? null
    : null;
  const dropSubjectIsField =
    dropSubject?.category === "pathfit" || dropSubject?.category === "nstp";

  const listCategories: Subject["category"][] = ["major", "gec", "gee", "pathfit", "nstp"];

  const filteredSubjects = MOCK_SUBJECTS.filter((subject) => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return (
      subject.code.toLowerCase().includes(term) ||
      subject.name.toLowerCase().includes(term)
    );
  });

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const nextPlaced: Record<string, string> = {};
    schedules.forEach((s) => {
      for (let offset = 0; offset < s.durationSlots; offset++) {
        nextPlaced[`${s.dayIndex}-${s.startSlot + offset}`] = s.subjectId;
      }
    });
    setPlaced(nextPlaced);
  }, [schedules]);

  useEffect(() => {
    if (!dropContext) return;
    const subject = MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId);
    const isFieldSubject = subject?.category === "pathfit" || subject?.category === "nstp";
    if (isFieldSubject) {
      setModalClassMode("field");
    } else if (dropContext.isRescheduling && dropContext.scheduleId) {
      const existing = schedules.find((s) => s.id === dropContext.scheduleId);
      if (existing) {
        setModalRoomId(existing.roomId);
        setModalClassMode(existing.mode ?? "on-site");
      }
    } else {
      setModalRoomId("");
      setModalClassMode("on-site");
    }
    setModalValidationError("");
    setModalConflict(null);
  }, [dropContext, schedules]);

  useEffect(() => {
    if (dropContext && modalRoomId) {
      const subject = MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId);
      if (subject) {
        const conflict = checkConflict(
          dropContext.subjectId,
          selectedSectionId,
          null,
          modalRoomId,
          dropContext.dayIndex,
          dropContext.startSlot,
          subject.units * 2,
          dropContext.isRescheduling ? dropContext.scheduleId : undefined
        );
        setModalConflict(conflict ? conflict.message : null);
      }
    } else {
      setModalConflict(null);
    }
  }, [modalRoomId, dropContext]);

  // ── Conflict detection ──────────────────────────────────────────────────────

  const checkConflict = (
    subjectId: string,
    sectionId: string,
    facultyId: string | null,
    roomId: string,
    dayIndex: number,
    startSlot: number,
    durationSlots: number,
    excludeScheduleId?: string
  ): { conflictType: "room" | "faculty" | "section"; message: string } | null => {
    const endSlot = startSlot + durationSlots;
    if (endSlot > 28) {
      return {
        conflictType: "section",
        message: "The schedule duration exceeds the grid operating hours (9:00 PM)."
      };
    }
    for (const s of schedules) {
      if (excludeScheduleId && s.id === excludeScheduleId) continue;
      const sEnd = s.startSlot + s.durationSlots;
      const overlaps = dayIndex === s.dayIndex && startSlot < sEnd && s.startSlot < endSlot;
      if (overlaps) {
        if (s.sectionId === sectionId) {
          const sub = MOCK_SUBJECTS.find((x) => x.id === s.subjectId);
          return {
            conflictType: "section",
            message: `Section conflict: This section already has a class (${sub?.code ?? ""}) scheduled at this time.`
          };
        }
        if (roomId && s.roomId === roomId) {
          const room = MOCK_ROOMS.find((r) => r.id === roomId);
          return {
            conflictType: "room",
            message: `Room conflict: ${room?.name ?? "Selected room"} is already occupied at this time.`
          };
        }
        if (facultyId && s.facultyId === facultyId) {
          const faculty = MOCK_FACULTY.find((f) => f.id === facultyId);
          return {
            conflictType: "faculty",
            message: `Faculty conflict: ${faculty?.name ?? "Selected faculty"} is already teaching at this time.`
          };
        }
      }
    }
    return null;
  };

  const checkFacultyConflict = (facultyId: string, scheduleId: string): string | null => {
    const target = schedules.find((s) => s.id === scheduleId);
    if (!target) return null;
    const endSlot = target.startSlot + target.durationSlots;
    for (const s of schedules) {
      if (s.id === scheduleId) continue;
      if (s.facultyId !== facultyId) continue;
      const sEnd = s.startSlot + s.durationSlots;
      const overlaps = target.dayIndex === s.dayIndex && target.startSlot < sEnd && s.startSlot < endSlot;
      if (overlaps) {
        const fac = MOCK_FACULTY.find((f) => f.id === facultyId);
        return `Faculty Conflict: ${fac?.name ?? facultyId} is already scheduled in section ${s.sectionName} at ${s.startTime} – ${s.endTime}.`;
      }
    }
    return null;
  };

  const getDragOverConflict = (d: number, t: number): boolean => {
    let dur = 6;
    let subjectId = "";
    let excludeId: string | undefined;

    if (draggedScheduleId) {
      const sched = schedules.find((s) => s.id === draggedScheduleId);
      if (!sched) return false;
      dur = sched.durationSlots;
      subjectId = sched.subjectId;
      excludeId = sched.id;
    } else if (dragSubjectId) {
      const sub = MOCK_SUBJECTS.find((s) => s.id === dragSubjectId);
      if (!sub) return false;
      dur = sub.units * 2;
      subjectId = sub.id;
    } else {
      return false;
    }

    return checkConflict(subjectId, selectedSectionId, null, "", d, t, dur, excludeId) !== null;
  };

  const getCurrentTimeOffset = (): number | null => {
    const h = currentTime.getHours();
    const m = currentTime.getMinutes();
    const cur = h * 60 + m;
    const start = 7 * 60;
    const end = 21 * 60;
    if (cur < start || cur > end) return null;
    const pct = (cur - start) / (end - start);
    return 40 + pct * (28 * 48);
  };

  // ── Drag handlers ───────────────────────────────────────────────────────────

  const handleDragStartFromBank = (e: React.DragEvent, subjectId: string) => {
    setDragSubjectId(subjectId);
    setDraggedScheduleId(null);
    setDragFromCell(null);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", subjectId);
  };

  const handleDragStartFromCell = (e: React.DragEvent, schedule: ScheduleItem) => {
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
    const key = `${dayIndex}-${timeIndex}`;
    if (hoveredCell !== key) setHoveredCell(key);
  };

  const handleDragLeave = () => setHoveredCell(null);

  const handleDrop = (e: React.DragEvent, dayIndex: number, timeIndex: number) => {
    e.preventDefault();
    setHoveredCell(null);
    setConflictInfo(null);

    const subjectId = e.dataTransfer.getData("text/plain") || dragSubjectId;
    if (!subjectId) return;

    if (draggedScheduleId) {
      const sched = schedules.find((s) => s.id === draggedScheduleId);
      if (!sched) return;

      const conflict = checkConflict(
        sched.subjectId,
        sched.sectionId,
        null,
        sched.roomId,
        dayIndex,
        timeIndex,
        sched.durationSlots,
        sched.id
      );

      if (conflict) {
        setConflictInfo({ dayIndex, startSlot: timeIndex, durationSlots: sched.durationSlots, message: conflict.message });
        setDraggedScheduleId(null);
        setDragFromCell(null);
        return;
      }

      setSchedules((prev) =>
        prev.map((s) =>
          s.id === draggedScheduleId
            ? {
                ...s,
                dayIndex,
                startSlot: timeIndex,
                day: DAYS[dayIndex],
                startTime: slotToTimeStr(timeIndex),
                endTime: slotToTimeStr(timeIndex + s.durationSlots)
              }
            : s
        )
      );
      setDraggedScheduleId(null);
      setDragFromCell(null);
    } else {
      setDropContext({ subjectId, dayIndex, startSlot: timeIndex, isRescheduling: false });
      setDragSubjectId(null);
    }
  };

  // ── Schedule actions ────────────────────────────────────────────────────────

  const handleConfirmSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dropContext) return;
    if (!modalRoomId) {
      setModalValidationError("Please select a Room before confirming.");
      return;
    }
    const subject = MOCK_SUBJECTS.find((s) => s.id === dropContext.subjectId);
    if (!subject) return;
    const durationSlots = subject.units * 2;
    const conflict = checkConflict(
      dropContext.subjectId, selectedSectionId, null, modalRoomId,
      dropContext.dayIndex, dropContext.startSlot, durationSlots
    );
    if (conflict) {
      setConflictInfo({ dayIndex: dropContext.dayIndex, startSlot: dropContext.startSlot, durationSlots, message: conflict.message });
      setDropContext(null);
      return;
    }
    const room = MOCK_ROOMS.find((r) => r.id === modalRoomId);
    const section = MOCK_SECTIONS.find((s) => s.id === selectedSectionId);
    const newSchedule: ScheduleItem = {
      id: `sched-${Date.now()}`,
      subjectId: dropContext.subjectId,
      subjectCode: subject.code,
      subjectName: subject.name,
      subjectType: subject.category,
      sectionName: section?.name ?? "",
      roomName: room?.name ?? "",
      day: DAYS[dropContext.dayIndex],
      startTime: slotToTimeStr(dropContext.startSlot),
      endTime: slotToTimeStr(dropContext.startSlot + durationSlots),
      mode: modalClassMode,
      facultyName: null,
      facultyId: null,
      status: "draft",
      dayIndex: dropContext.dayIndex,
      startSlot: dropContext.startSlot,
      durationSlots,
      sectionId: selectedSectionId,
      roomId: modalRoomId
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
    if (confirm("Are you sure you want to clear the entire schedule for this section?")) {
      setSchedules((prev) => prev.filter((s) => s.sectionId !== selectedSectionId));
      setConflictInfo(null);
    }
  };

  // ── Status action handlers ──────────────────────────────────────────────────

  const handleSubmitForApproval = () => {
    if (!selectedSectionId) return;
    setScheduleStatus((prev) => ({ ...prev, [selectedSectionId]: "submitted" }));
  };

  const handleResubmit = () => {
    if (!selectedSectionId) return;
    setScheduleStatus((prev) => ({ ...prev, [selectedSectionId]: "draft" }));
  };

  const handleStartFacultyAssignment = () => {
    if (!selectedSectionId) return;
    setScheduleStatus((prev) => ({ ...prev, [selectedSectionId]: "faculty_assignment" }));
  };

  const handleFinalize = () => {
    if (!selectedSectionId) return;
    setScheduleStatus((prev) => ({ ...prev, [selectedSectionId]: "finalized" }));
  };

  // ── Faculty assignment handlers ─────────────────────────────────────────────

  const handlePopupFacultyChange = (fId: string) => {
    if (!facultyAssignmentPopup) return;
    setFacultyAssignmentPopup((prev) => (prev ? { ...prev, facultyId: fId } : null));
    setPopupValidationError("");
    if (fId) {
      const conflict = checkFacultyConflict(fId, facultyAssignmentPopup.scheduleId);
      setPopupConflictWarning(conflict ?? "");
    } else {
      setPopupConflictWarning("");
    }
  };

  const handleAssignFaculty = (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyAssignmentPopup) return;
    const { scheduleId, facultyId } = facultyAssignmentPopup;
    if (!facultyId) {
      setPopupValidationError("Please select a faculty member first.");
      return;
    }
    const fac = MOCK_FACULTY.find((f) => f.id === facultyId);
    if (!fac) return;
    setSchedules((prev) =>
      prev.map((s) => (s.id === scheduleId ? { ...s, facultyId, facultyName: fac.name } : s))
    );
    setFacultyAssignmentPopup(null);
  };

  const handleRemoveFaculty = () => {
    if (!facultyAssignmentPopup) return;
    const { scheduleId } = facultyAssignmentPopup;
    setSchedules((prev) =>
      prev.map((s) => (s.id === scheduleId ? { ...s, facultyId: null, facultyName: null } : s))
    );
    setFacultyAssignmentPopup(null);
  };

  // ── Utility renderers ───────────────────────────────────────────────────────

  const getClassesCountForDay = (dayIdx: number) =>
    sectionSchedules.filter((s) => s.dayIndex === dayIdx).length;

  const toggleCategory = (category: string) =>
    setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] }));

  const renderStatusBadge = (status: ScheduleItem["status"]) => {
    const configs: Record<string, { cls: string; label: string }> = {
      draft:             { cls: "bg-slate-500 text-white",       label: "Draft" },
      submitted:         { cls: "bg-yellow-500 text-white",      label: "Submitted" },
      approved_by_dean:  { cls: "bg-blue-600 text-white",        label: "Approved by Dean" },
      rejected_by_dean:  { cls: "bg-red-600 text-white",         label: "Rejected by Dean" },
      approved:          { cls: "bg-green-600 text-white",       label: "Approved (VPAA)" },
      faculty_assignment:{ cls: "bg-purple-600 text-white",      label: "Faculty Assignment" },
      finalized:         { cls: "bg-emerald-800 text-white",     label: "Finalized" },
      rejected:          { cls: "bg-red-600 text-white",         label: "Rejected" }
    };
    const cfg = configs[status];
    if (!cfg) return null;
    return (
      <span className={`${cfg.cls} px-3 py-1 rounded-full text-xs font-medium`}>
        {cfg.label}
      </span>
    );
  };

  const renderActionButton = () => {
    if (!selectedSectionId) return null;
    switch (currentStatus) {
      case "draft":
        return (
          <button
            onClick={handleSubmitForApproval}
            className="px-4 py-2 bg-[#4e0a10] hover:bg-[#3a0809] text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
          >
            Submit for Approval
          </button>
        );
      case "submitted":
        return (
          <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">
            Pending Approval
          </button>
        );
      case "approved_by_dean":
        return (
          <button disabled className="px-4 py-2 bg-gray-200 text-gray-400 text-sm font-semibold rounded-lg cursor-not-allowed">
            Awaiting VPAA Approval
          </button>
        );
      case "rejected_by_dean":
        return (
          <button
            onClick={handleResubmit}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
          >
            Resubmit to Dean
          </button>
        );
      case "rejected":
        return (
          <button
            onClick={handleResubmit}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
          >
            Resubmit
          </button>
        );
      case "approved":
        return (
          <button
            onClick={handleStartFacultyAssignment}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 cursor-pointer"
          >
            Start Faculty Assignment
          </button>
        );
      case "faculty_assignment": {
        const unassigned = sectionSchedules.filter((s) => !s.facultyId).length;
        const allAssigned = unassigned === 0;
        return (
          <button
            onClick={handleFinalize}
            disabled={!allAssigned}
            title={!allAssigned ? `${unassigned} slot${unassigned !== 1 ? "s" : ""} still need faculty` : undefined}
            className={`px-4 py-2 text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 ${
              allAssigned
                ? "bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {allAssigned ? "Mark as Finalized" : `${unassigned} slots still need faculty`}
          </button>
        );
      }
      case "finalized":
        return (
          <button disabled className="px-4 py-2 bg-emerald-800 text-white text-sm font-semibold rounded-lg cursor-not-allowed opacity-75">
            Schedule Finalized
          </button>
        );
      default:
        return null;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 w-full text-slate-800 antialiased">

      {/* ═══════ TOP BAR ═══════ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white px-6 py-4 border-b border-gray-200 rounded-t-2xl shadow-sm">

        {/* Left — Section selector */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-500 font-medium">Section:</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSectionDropdownOpen(!isSectionDropdownOpen)}
              className="flex items-center justify-between text-sm bg-white border border-gray-300 rounded-lg px-4 py-2 outline-none hover:border-gray-400 focus:ring-2 focus:ring-[#4e0a10]/20 focus:border-[#4e0a10] font-medium gap-2 min-w-[160px] transition-colors"
            >
              <span className="text-gray-800">{MOCK_SECTIONS.find((s) => s.id === selectedSectionId)?.name ?? "-- Choose Section --"}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 ${isSectionDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {isSectionDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                {MOCK_SECTIONS.map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => {
                      setSelectedSectionId(sec.id);
                      setIsSectionDropdownOpen(false);
                      setConflictInfo(null);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      selectedSectionId === sec.id
                        ? "text-[#4e0a10] bg-[#4e0a10]/5 font-semibold"
                        : "text-gray-700 font-normal hover:bg-gray-50"
                    }`}
                  >
                    {sec.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedSectionId && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Active:</span>
              <span className="text-sm font-bold text-amber-800">
                {MOCK_SECTIONS.find((s) => s.id === selectedSectionId)?.name}
              </span>
            </div>
          )}
        </div>

        {/* Center — Phase pills */}
        <div className="flex items-center gap-3 select-none justify-center">

          {/* Phase 1 pill */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-300 ${
            isPhase1Completed
              ? "bg-green-600 text-white border-green-600 shadow-md"
              : "bg-[#4e0a10] text-white border-[#4e0a10] shadow-md"
          }`}>
            {isPhase1Completed ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <LayoutGrid className="w-4 h-4" />
            )}
            <span>Plotting</span>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              isPhase1Completed ? "bg-white/20 text-white" : "bg-white/20 text-white"
            }`}>1</span>
          </div>

          {/* Progress line */}
          <div className="flex items-center gap-0">
            <div className={`w-6 h-0.5 transition-all duration-300 ${
              isPhase2Active ? "bg-green-500" : "bg-gray-200"
            }`} />
            <div className={`w-2 h-2 rounded-full mx-0.5 transition-all duration-300 ${
              isPhase2Active ? "bg-green-500" : "bg-gray-300"
            }`} />
            <div className={`w-6 h-0.5 transition-all duration-300 ${
              isPhase2Active ? "bg-green-500" : "bg-gray-200"
            }`} />
          </div>

          {/* Phase 2 pill */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-300 ${
            isPhase2Completed
              ? "bg-green-600 text-white border-green-600 shadow-md"
              : isPhase2Active
              ? "bg-purple-600 text-white border-purple-600 shadow-md"
              : "bg-white text-gray-400 border-gray-200"
          }`}>
            {isPhase2Completed ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Users className="w-4 h-4" />
            )}
            <span>Faculty Assignment</span>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              isPhase2Active || isPhase2Completed ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
            }`}>2</span>
          </div>
        </div>

        {/* Right — Status badge + action + DEV sim */}
        <div className="flex items-center gap-3 md:ml-auto">
          {/* Status badge */}
          {renderStatusBadge(currentStatus)}

          {/* Action button */}
          {renderActionButton()}

          {/* Divider */}
          <div className="w-px h-7 bg-gray-200 mx-1" />

          {/* DEV SIM dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium">DEV:</span>
            <select
              value={currentStatus}
              onChange={(e) => {
                if (!selectedSectionId) return;
                setScheduleStatus((prev) => ({
                  ...prev,
                  [selectedSectionId]: e.target.value as ScheduleItem["status"]
                }));
              }}
              className="text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-1 font-medium text-gray-600 outline-none hover:border-gray-300 focus:border-[#4e0a10] cursor-pointer transition-colors"
            >
              <option value="draft">draft</option>
              <option value="submitted">submitted</option>
              <option value="approved_by_dean">approved_by_dean</option>
              <option value="rejected_by_dean">rejected_by_dean</option>
              <option value="approved">approved</option>
              <option value="faculty_assignment">faculty_assignment</option>
              <option value="finalized">finalized</option>
              <option value="rejected">rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* ═══════ MAIN CONTAINER ═══════ */}
      <div className="flex flex-col lg:flex-row gap-6 w-full h-[700px] min-h-[600px] overflow-hidden">

        {/* ─── LEFT PANEL ─── */}
        {isPhase2Active && currentStatus !== "approved" ? (

          /* Phase 2 — Faculty panel */
          <div className="w-full lg:w-1/4 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#4e0a10]" />
                Faculty Assignment
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-none">
                Assign instructors to each subject slot
              </p>
            </div>

            {/* Progress bar */}
            <div className="p-4 border-b border-slate-100 shrink-0 space-y-1.5 bg-[#4e0a10]/5">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-[#4e0a10]">Assignment Progress</span>
                <span className="text-slate-600">{assignedSlotsCount} / {totalSlotsCount} Slots</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full transition-all duration-300"
                  style={{ width: `${totalSlotsCount ? (assignedSlotsCount / totalSlotsCount) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Unassigned slots */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Unassigned Slots ({unassignedSlotsCount})
                </h3>
                {sectionSchedules.filter((s) => !s.facultyId).length === 0 ? (
                  <div className="text-center py-4 bg-emerald-50/50 border border-emerald-200 rounded-xl text-emerald-800 text-[11px] font-bold">
                    All instructors assigned!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sectionSchedules.filter((s) => !s.facultyId).map((slot) => {
                      const sub = MOCK_SUBJECTS.find((s) => s.id === slot.subjectId);
                      return (
                        <div key={slot.id} className="border border-slate-200 rounded-xl p-3 bg-white hover:border-[#4e0a10]/30 transition-all flex flex-col gap-2 shadow-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-xs text-slate-800 uppercase">{sub?.code}</span>
                            <span className="text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                              {slot.day} {slot.startTime}
                            </span>
                          </div>
                          <select
                            onChange={(e) => {
                              const facId = e.target.value;
                              if (!facId) return;
                              const fac = MOCK_FACULTY.find((f) => f.id === facId);
                              if (!fac) return;
                              const conflict = checkFacultyConflict(facId, slot.id);
                              if (conflict) {
                                if (confirm(`${conflict}\n\nAssign anyway?`)) {
                                  setSchedules((prev) =>
                                    prev.map((s) => s.id === slot.id ? { ...s, facultyId: facId, facultyName: fac.name } : s)
                                  );
                                }
                              } else {
                                setSchedules((prev) =>
                                  prev.map((s) => s.id === slot.id ? { ...s, facultyId: facId, facultyName: fac.name } : s)
                                );
                              }
                            }}
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold outline-none focus:border-[#4e0a10]"
                          >
                            <option value="">-- Assign Faculty --</option>
                            {MOCK_FACULTY.map((f) => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Assigned slots */}
              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAssignedListCollapsed(!isAssignedListCollapsed)}
                  className="w-full flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 hover:text-slate-700"
                >
                  <span>Assigned Slots ({assignedSlotsCount})</span>
                  {isAssignedListCollapsed
                    ? <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  }
                </button>
                {!isAssignedListCollapsed && (
                  <div className="space-y-2">
                    {sectionSchedules.filter((s) => s.facultyId).length === 0 ? (
                      <div className="text-center py-4 text-slate-400 text-xs">No slots assigned yet</div>
                    ) : (
                      sectionSchedules.filter((s) => s.facultyId).map((slot) => {
                        const sub = MOCK_SUBJECTS.find((s) => s.id === slot.subjectId);
                        return (
                          <div key={slot.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 flex justify-between items-center text-xs shadow-xs">
                            <div>
                              <div className="font-bold text-slate-800 uppercase">{sub?.code}</div>
                              <div className="text-[10px] text-slate-500 font-semibold">{slot.facultyName}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Check className="w-4 h-4 text-emerald-600 stroke-[3.5]" />
                              <button
                                onClick={() =>
                                  setSchedules((prev) =>
                                    prev.map((s) => s.id === slot.id ? { ...s, facultyId: null, facultyName: null } : s)
                                  )
                                }
                                className="text-slate-400 hover:text-rose-600"
                                title="Remove Assignment"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

        ) : (

          /* Phase 1 — Subject bank */
          <div className="w-full lg:w-1/4 min-w-[280px] shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden h-full">

            {/* ── Header (fixed) ── */}
            <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#4e0a10]" />
                <span className="text-base font-semibold text-gray-800">Subject Bank</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Drag subjects onto the timetable
              </p>
              {/* Stats pills */}
              <div className="flex items-center gap-2 mt-2.5">
                <span className="flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
                  <CheckCircle2 className="w-3 h-3" />
                  {totalScheduled} Placed
                </span>
                <span className="bg-gray-100 text-gray-500 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
                  {totalSubjects - totalScheduled} Remaining
                </span>
              </div>
            </div>

            {/* ── Search bar ── */}
            <div className="px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search subjects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all font-medium text-gray-700 placeholder:text-gray-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* ── Scrollable subject list ── */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {!selectedSectionId ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mb-2 stroke-[1.5]" />
                  <p className="text-xs font-semibold text-gray-500">
                    Select a section first to enable scheduling.
                  </p>
                </div>
              ) : (() => {
                const visibleCategories = listCategories.filter((c) =>
                  filteredSubjects.some((s) => s.category === c)
                );

                if (visibleCategories.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-center py-10">
                      <Search className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-sm text-gray-400 font-medium">No subjects found</p>
                      <p className="text-xs text-gray-300 mt-0.5">Try a different keyword</p>
                    </div>
                  );
                }

                const categoryDotColor: Record<Subject["category"], string> = {
                  major:   "bg-blue-500",
                  gec:     "bg-green-500",
                  gee:     "bg-purple-500",
                  pathfit: "bg-orange-500",
                  nstp:    "bg-yellow-500"
                };

                return visibleCategories.map((category, visibleIdx) => {
                  const list = filteredSubjects.filter((s) => s.category === category);
                  const isCollapsed = collapsedCategories[category] === true;
                  const styles = getCategoryStyles(category);
                  const leftBorder = getLeftAccentBorder(category);
                  const dotColor = categoryDotColor[category];

                  return (
                    <div key={category}>
                      {visibleIdx > 0 && <div className="border-t border-gray-100 my-1" />}

                      {/* Category header — sticky */}
                      <div className="sticky top-0 z-10 bg-white">
                        <button
                          type="button"
                          onClick={() => toggleCategory(category)}
                          className="w-full flex items-center justify-between px-1 py-2 rounded-lg hover:bg-gray-50 transition-colors group"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
                            <span className="text-xs font-bold tracking-wider uppercase text-gray-500">
                              {styles.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">
                              {list.length}
                            </span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                            />
                          </div>
                        </button>
                      </div>

                      {/* Subject cards */}
                      {!isCollapsed && (
                        <div className="space-y-2 mb-3 animate-in fade-in slide-in-from-top-1 duration-200">
                          {list.map((subject) => {
                            const isPlaced = scheduledSubjectIds.has(subject.id);
                            const isDragging = dragSubjectId === subject.id;

                            return (
                              <div
                                key={subject.id}
                                draggable={isEditable}
                                onDragStart={(e) => handleDragStartFromBank(e, subject.id)}
                                onDragEnd={handleDragEnd}
                                title={subject.name}
                                className={`bg-white border border-gray-200 rounded-xl p-3 mb-2 select-none transition-all duration-150 ${leftBorder} ${
                                  !isEditable
                                    ? "opacity-60 cursor-not-allowed"
                                    : isPlaced
                                    ? "opacity-60 cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5"
                                    : "cursor-grab active:cursor-grabbing hover:shadow-md hover:-translate-y-0.5"
                                } ${isDragging ? "opacity-50 scale-95 rotate-1 shadow-lg" : ""}`}
                              >
                                {/* Top row: code + badges */}
                                <div className="flex justify-between items-start gap-1">
                                  <span className="text-sm font-bold text-gray-800 uppercase leading-tight">
                                    {subject.code}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isPlaced && (
                                      <span className="flex items-center gap-0.5 text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Placed
                                      </span>
                                    )}
                                    <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">
                                      {subject.units}u
                                    </span>
                                  </div>
                                </div>

                                {/* Middle row: subject name */}
                                <div className="text-xs text-gray-500 mt-1 leading-tight line-clamp-1">
                                  {subject.name}
                                </div>

                                {/* Bottom row: type badge */}
                                <div className="mt-2">
                                  <span className={`text-xs rounded-full px-2 py-0.5 border font-medium inline-block ${styles.typeBadge}`}>
                                    {styles.label}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ─── RIGHT PANEL — Timetable Grid ─── */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full">

          {/* Grid header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50/30 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#4e0a10]" />
                Timetable Grid
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="bg-[#4e0a10]/15 text-[#4e0a10] border border-[#4e0a10]/10 px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase">
                  {selectedSectionId ? (MOCK_SECTIONS.find((s) => s.id === selectedSectionId)?.name ?? "None") : "None"}
                </span>
                <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 rounded-md text-[10px] font-bold">
                  1st Semester AY 2026-2027
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="flex items-center gap-2 text-[11px] font-bold select-none text-slate-500">
                <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">
                  {totalScheduled} Subjects Placed
                </span>
                <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded-lg">
                  {Math.max(0, totalSubjects - totalScheduled)} Unplaced
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearAll}
                disabled={!isEditable || schedules.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 shadow-sm border ${
                  isEditable && schedules.length > 0
                    ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 cursor-pointer"
                    : "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            </div>
          </div>

          {/* Grid scroll area */}
          <div className="flex-1 overflow-auto bg-slate-50/20 relative">
            {!selectedSectionId ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-20">
                <AlertTriangle className="w-12 h-12 text-amber-500 mb-3 animate-bounce" />
                <h3 className="text-sm font-bold text-slate-800">No Section Selected</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs text-center">
                  Please select a section from the top bar dropdown menu to load its timetable grid.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div
                  className="min-w-[900px] border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white relative select-none"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "80px repeat(6, minmax(0, 1fr))",
                    gridTemplateRows: "40px repeat(28, 48px)"
                  }}
                >
                  {/* Real-time line */}
                  {(() => {
                    const top = getCurrentTimeOffset();
                    if (top === null) return null;
                    return (
                      <div
                        className="absolute left-[80px] right-0 border-t-2 border-red-500 z-10 pointer-events-none"
                        style={{ top: `${top}px` }}
                      >
                        <div className="absolute left-0 -top-1 w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm" />
                      </div>
                    );
                  })()}

                  {/* Header — Time cell */}
                  <div
                    className="bg-[#4e0a10]/5 border-r border-b border-slate-200 p-2 font-bold text-[10px] text-[#4e0a10] text-center uppercase tracking-wider select-none flex items-center justify-center sticky top-0 left-0 z-30"
                    style={{ gridColumn: 1, gridRow: 1 }}
                  >
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    Time
                  </div>

                  {/* Header — Day cells */}
                  {DAYS.map((day, dIdx) => (
                    <div
                      key={day}
                      className="bg-[#4e0a10]/5 border-r border-b border-slate-200 p-1.5 font-bold text-xs text-slate-700 text-center uppercase tracking-wider select-none flex flex-col justify-center items-center sticky top-0 z-20"
                      style={{ gridColumn: dIdx + 2, gridRow: 1 }}
                    >
                      <span className="text-slate-800 font-extrabold">{day}</span>
                      <span className="text-[9px] text-slate-500 font-bold mt-0.5 bg-white/60 px-1.5 py-0.5 rounded-full border border-slate-100">
                        {getClassesCountForDay(dIdx)} {getClassesCountForDay(dIdx) === 1 ? "Class" : "Classes"}
                      </span>
                    </div>
                  ))}

                  {/* Body rows */}
                  {Array.from({ length: 28 }).map((_, t) => (
                    <React.Fragment key={`row-${t}`}>
                      {t % 2 === 0 && (
                        <div
                          className="bg-slate-50/90 border-r border-b border-slate-200 text-[9px] font-bold text-slate-500 flex flex-col justify-center items-center select-none sticky left-0 z-10"
                          style={{ gridColumn: 1, gridRow: `${t + 2} / span 2`, padding: "0 4px" }}
                        >
                          <span className="font-extrabold text-slate-600 whitespace-nowrap">
                            {slotToTimeStr(t)}
                          </span>
                        </div>
                      )}

                      {DAYS.map((_, d) => {
                        const cellKey = `${d}-${t}`;
                        const isHovered = hoveredCell === cellKey;
                        const hasConflict = isHovered && getDragOverConflict(d, t);

                        return (
                          <div
                            key={`cell-${d}-${t}`}
                            onDragOver={(e) => isEditable && !isPhase2Active && handleDragOver(e, d, t)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => isEditable && !isPhase2Active && handleDrop(e, d, t)}
                            className={`border-r border-b border-slate-100 transition-all duration-150 relative flex items-center justify-center ${
                              isHovered
                                ? hasConflict
                                  ? "bg-rose-100 ring-2 ring-rose-500/20 ring-inset"
                                  : "bg-blue-50 ring-2 ring-blue-500/20 ring-inset"
                                : "bg-white"
                            }`}
                            style={{ gridColumn: d + 2, gridRow: t + 2 }}
                          >
                            {isHovered && (
                              <span className={`text-[9px] font-extrabold select-none pointer-events-none flex items-center gap-0.5 ${hasConflict ? "text-rose-600" : "text-blue-600"}`}>
                                {hasConflict
                                  ? <><AlertTriangle className="w-2.5 h-2.5" /> Conflict</>
                                  : <><Plus className="w-2.5 h-2.5" /> Place</>
                                }
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}

                  {/* Schedule cards */}
                  {sectionSchedules.map((schedule) => {
                    const subject = MOCK_SUBJECTS.find((s) => s.id === schedule.subjectId);
                    const faculty = MOCK_FACULTY.find((f) => f.id === schedule.facultyId);
                    const room = MOCK_ROOMS.find((r) => r.id === schedule.roomId);
                    if (!subject) return null;

                    const styles = getCategoryStyles(subject.category);
                    const leftBorder = getLeftAccentBorder(subject.category);
                    const isDraggingThis = draggedScheduleId === schedule.id;
                    const hasFaculty = !!schedule.facultyId;

                    const handleCardClick = () => {
                      if (isPhase2Active && currentStatus !== "finalized") {
                        setFacultyAssignmentPopup({
                          scheduleId: schedule.id,
                          facultyId: schedule.facultyId ?? ""
                        });
                        setPopupValidationError("");
                        setPopupConflictWarning("");
                      }
                    };

                    return (
                      <div
                        key={schedule.id}
                        draggable={isEditable && !isPhase2Active}
                        onDragStart={(e) => !isPhase2Active && handleDragStartFromCell(e, schedule)}
                        onDragEnd={handleDragEnd}
                        onClick={handleCardClick}
                        className={`rounded-xl border flex flex-col justify-between relative shadow-xs hover:shadow-md transition-all duration-200 group overflow-hidden ${
                          isDraggingThis ? "opacity-30" : "opacity-100"
                        } ${
                          isPhase2Active
                            ? currentStatus !== "finalized" ? "cursor-pointer hover:scale-[1.01]" : "cursor-default"
                            : isEditable ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"
                        } ${leftBorder} ${
                          isPhase2Active
                            ? hasFaculty
                              ? "border-emerald-500 bg-emerald-50/40 text-emerald-800"
                              : "border-orange-500 animate-pulse bg-orange-50/40 text-orange-800"
                            : `${styles.bg} ${styles.border} ${styles.text}`
                        }`}
                        style={{
                          gridColumn: schedule.dayIndex + 2,
                          gridRow: `${schedule.startSlot + 2} / span ${schedule.durationSlots}`,
                          zIndex: 10,
                          margin: "2px",
                          padding: "8px 10px"
                        }}
                      >
                        {isEditable && !isPhase2Active && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveSchedule(schedule.id); }}
                            className="absolute top-1.5 right-1.5 bg-white border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-full w-4 h-4 flex items-center justify-center shadow transition-all duration-150 opacity-0 group-hover:opacity-100 z-20"
                            title="Remove Schedule"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {isPhase2Active && hasFaculty && (
                          <div className="absolute top-1.5 right-1.5 bg-emerald-600 text-white rounded-full p-0.5 shadow-xs z-20">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap pr-4">
                            <span className="font-bold text-xs uppercase tracking-wide">{subject.code}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold border shrink-0 ${styles.badge}`}>
                              {subject.units}u
                            </span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold border uppercase shrink-0 ${
                              schedule.mode === "on-site"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : schedule.mode === "online"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}>
                              {schedule.mode === "on-site" ? "On-Site" : schedule.mode === "online" ? "Online" : "Field"}
                            </span>
                          </div>
                          <div className="text-xs font-semibold leading-tight mt-1 truncate" title={subject.name}>
                            {subject.name}
                          </div>
                        </div>

                        <div className="pt-1.5 border-t border-current/10 space-y-1">
                          {isPhase2Active && (
                            hasFaculty ? (
                              <div className="text-[10px] font-bold flex items-center gap-1 truncate">
                                <User className="w-3 h-3 shrink-0" />
                                <span className="truncate">{faculty?.name ?? schedule.facultyName}</span>
                              </div>
                            ) : (
                              <div className="text-[10px] font-extrabold text-orange-600 flex items-center gap-1">
                                <Users className="w-3 h-3 shrink-0 text-orange-500 animate-bounce" />
                                <span>Assign Faculty</span>
                              </div>
                            )
                          )}
                          <div className="text-[10px] font-medium opacity-85 flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 shrink-0 opacity-70" />
                            <span>{room?.name ?? schedule.roomName}</span>
                          </div>
                          <div className="text-[10px] font-bold opacity-80 flex items-center gap-1">
                            <Clock className="w-3 h-3 shrink-0 opacity-70" />
                            <span>{schedule.startTime} – {schedule.endTime}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Conflict alert */}
          {conflictInfo && (
            <div className="mx-6 my-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 shrink-0 animate-in slide-in-from-bottom-2 duration-150">
              <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-rose-900">Schedule Conflict Detected</h4>
                <p className="text-[11px] text-rose-700 mt-0.5 font-medium">{conflictInfo.message}</p>
              </div>
              <button onClick={() => setConflictInfo(null)} className="ml-auto text-rose-400 hover:text-rose-600">
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
            {[
              { label: "Major",   color: "bg-blue-50 border-blue-400" },
              { label: "GEC",     color: "bg-emerald-50 border-emerald-400" },
              { label: "GEE",     color: "bg-purple-50 border-purple-400" },
              { label: "PATHFIT", color: "bg-orange-50 border-orange-400" },
              { label: "NSTP",    color: "bg-yellow-50 border-yellow-400" }
            ].map(({ label, color }) => (
              <span key={label} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded border ${color}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════ DROP CONFIRMATION MODAL (Phase 1) ═══════ */}
      {dropContext && dropSubject && (() => {
        const FULL_DAYS: Record<string, string> = {
          Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
          Thu: "Thursday", Fri: "Friday", Sat: "Saturday"
        };
        const dropLeftBorder = getLeftAccentBorder(dropSubject.category);
        const dropStyles = getCategoryStyles(dropSubject.category);
        const hasConflict = !!modalConflict;
        const isDisabled = hasConflict || isModalLoading;

        const handleModalConfirm = (e: React.FormEvent) => {
          e.preventDefault();
          if (!modalRoomId) {
            setModalValidationError("Please select a room.");
            return;
          }
          if (hasConflict) return;
          setIsModalLoading(true);
          setTimeout(() => {
            setIsModalLoading(false);
            handleConfirmSchedule(e);
          }, 500);
        };

        return (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 min-h-screen"
            onClick={(e) => { if (e.target === e.currentTarget) setDropContext(null); }}
          >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto transition-all duration-200 animate-in fade-in zoom-in-95">

              {/* ── Modal header ── */}
              <div className="flex justify-between items-start px-6 pt-6 pb-4 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  <CalendarPlus className="w-5 h-5 text-[#4e0a10] mt-0.5 shrink-0" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 leading-tight">Place Subject</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Confirm placement details below</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDropContext(null)}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full p-1 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── Subject info card ── */}
              <div className={`mx-6 mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 ${dropLeftBorder}`}>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">{dropSubject.code}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 font-medium">
                      {dropSubject.units}u
                    </span>
                    <span className={`text-xs rounded-full px-2 py-0.5 border font-medium ${dropStyles.typeBadge}`}>
                      {dropStyles.label}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">{dropSubject.name}</p>
              </div>

              {/* ── Form ── */}
              <form onSubmit={handleModalConfirm} className="px-6 py-4 space-y-4">

                {/* Placement details — Day + Start Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Day</label>
                    <div className="relative">
                      <CalendarDays className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        readOnly
                        value={FULL_DAYS[DAYS[dropContext.dayIndex]] ?? DAYS[dropContext.dayIndex]}
                        className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Time</label>
                    <div className="relative">
                      <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        readOnly
                        value={slotToTimeStr(dropContext.startSlot)}
                        className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* End Time */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">End Time (Auto-computed)</label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      readOnly
                      value={slotToTimeStr(dropContext.startSlot + dropSubject.units * 2)}
                      className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm bg-gray-50 text-gray-500 cursor-not-allowed outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Based on {dropSubject.units} unit{dropSubject.units !== 1 ? "s" : ""} = {dropSubject.units} hour{dropSubject.units !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Room */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Room <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
                    <select
                      value={modalRoomId}
                      onChange={(e) => { setModalRoomId(e.target.value); setModalValidationError(""); }}
                      className={`w-full appearance-none border rounded-lg pl-9 pr-8 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-amber-400 focus:border-transparent ${
                        modalValidationError && !modalRoomId
                          ? "border-red-400 bg-red-50 text-red-700 focus:ring-red-400"
                          : "border-gray-200 bg-white text-gray-700"
                      }`}
                    >
                      <option value="">Select a room...</option>
                      {MOCK_ROOMS.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  {modalValidationError && !modalRoomId && (
                    <p className="text-xs text-red-500 mt-1">{modalValidationError}</p>
                  )}
                </div>

                {/* Class mode */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Class Mode <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <div className="flex gap-2">
                    {([
                      { value: "on-site" as const, label: "On-Site",  Icon: Building2, selectedCls: "bg-blue-600 text-white border-blue-600" },
                      { value: "online"  as const, label: "Online",   Icon: Monitor,   selectedCls: "bg-green-600 text-white border-green-600" },
                      { value: "field"   as const, label: "Field",    Icon: TreePine,  selectedCls: "bg-orange-600 text-white border-orange-600" }
                    ]).map(({ value: m, label, Icon, selectedCls }) => {
                      const isSelected = modalClassMode === m;
                      const isDisabledMode = dropSubjectIsField && m !== "field";
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={isDisabledMode}
                          onClick={() => setModalClassMode(m)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 border rounded-lg text-sm font-medium transition-all ${
                            isSelected
                              ? selectedCls
                              : isDisabledMode
                              ? "opacity-50 bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                              : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {dropSubjectIsField && (
                    <p className="text-xs text-orange-500 mt-1">Field mode is required for this subject type.</p>
                  )}
                </div>

                {/* Conflict warning */}
                {hasConflict && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <span className="text-sm font-semibold text-red-700">Conflicts Detected</span>
                    </div>
                    <ul className="space-y-1">
                      <li className="flex items-start gap-2 text-xs text-red-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                        {modalConflict}
                      </li>
                    </ul>
                  </div>
                )}
              </form>

              {/* ── Modal footer ── */}
              <div className="flex justify-end gap-3 px-6 pb-6 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setDropContext(null)}
                  className="border border-gray-300 rounded-lg px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => handleModalConfirm(e as unknown as React.FormEvent)}
                  disabled={isDisabled}
                  className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
                    hasConflict
                      ? "border border-red-300 text-red-600 bg-white cursor-not-allowed opacity-75"
                      : isModalLoading
                      ? "bg-[#4e0a10] text-white opacity-75 cursor-not-allowed"
                      : "bg-[#4e0a10] text-white hover:brightness-110 cursor-pointer"
                  }`}
                >
                  {isModalLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Placing...</>
                  ) : hasConflict ? (
                    "Cannot Place — Conflicts Found"
                  ) : (
                    "Place on Timetable"
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════ FACULTY ASSIGNMENT POPUP (Phase 2) ═══════ */}
      {facultyAssignmentPopup && (() => {
        const schedule = schedules.find((s) => s.id === facultyAssignmentPopup.scheduleId);
        if (!schedule) return null;
        const subject = MOCK_SUBJECTS.find((s) => s.id === schedule.subjectId);
        const subStyles = subject ? getCategoryStyles(subject.category) : null;

        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl p-6 w-[400px] max-w-[95vw] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Assign Instructor</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Assign a faculty member to this scheduled subject slot</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFacultyAssignmentPopup(null)}
                  className="text-slate-400 hover:text-slate-600 rounded-full p-1 bg-slate-50 border border-slate-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {subject && subStyles && (
                <div className={`border rounded-xl p-3 flex flex-col gap-1.5 text-[11px] ${subStyles.bg} ${subStyles.border} ${subStyles.text}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-[12px] uppercase">{subject.code}</span>
                    <span className="text-[10px] font-bold bg-white/20 px-1.5 py-0.5 rounded">
                      {schedule.day} {schedule.startTime} – {schedule.endTime}
                    </span>
                  </div>
                  <div className="font-semibold opacity-85 leading-snug">{subject.name}</div>
                  <div className="text-[9px] opacity-75 font-semibold mt-1">
                    Room: {schedule.roomName} | Mode: {schedule.mode}
                  </div>
                </div>
              )}

              <form onSubmit={handleAssignFaculty} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <User className="w-3 h-3 text-[#4e0a10]" />
                    Select Instructor <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={facultyAssignmentPopup.facultyId}
                    onChange={(e) => handlePopupFacultyChange(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#4e0a10] font-semibold transition-colors"
                  >
                    <option value="">-- Choose Faculty --</option>
                    {MOCK_FACULTY.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>

                {popupConflictWarning && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-900">Warning: Conflict Found</div>
                      <div className="text-[10px] font-semibold mt-0.5 leading-relaxed">{popupConflictWarning}</div>
                    </div>
                  </div>
                )}

                {popupValidationError && (
                  <div className="flex items-center gap-1.5 p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[10px] font-semibold">{popupValidationError}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 bg-[#4e0a10] hover:bg-[#3a0809] text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                  >
                    {popupConflictWarning ? "Assign Anyway" : "Assign Faculty"}
                  </button>
                  {schedule.facultyId && (
                    <button
                      type="button"
                      onClick={handleRemoveFaculty}
                      className="px-4 py-2.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-bold transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
