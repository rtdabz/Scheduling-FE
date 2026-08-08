import { useState, useEffect, useMemo } from 'react';
import { useTour } from '../../hooks/useTour';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useNavigate } from 'react-router-dom';
import { useSystemNotifications } from '../../hooks/useSystemNotifications';
import { ActivityFeed } from '../../components/overview';
import {
  Building2,
  Users,
  Layers,
  BookOpen,
  DoorOpen,
  CalendarDays,
  Clock,
  CheckCircle2,
  TrendingUp,
  GraduationCap,
  FileBarChart,
  Download,
  CheckSquare,
  AlertCircle,
  Bell,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Filter,
  SlidersHorizontal,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface Schedule {
  id: number;
  term_id: number;
  section_id: number;
  faculty_id?: number | null;
  subject_id?: number | null;
  room_id?: number | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: 'on-site' | 'online' | 'field';
  status: string;
  updated_at?: string;
  section?: {
    id: number;
    section_name: string;
    department_id: number;
    department?: {
      department_code: string;
      department_name: string;
    } | null;
  } | null;
  faculty?: {
    id: number;
    first_name: string;
    last_name: string;
  } | null;
  room?: {
    id: number;
    room_code: string;
    building?: string | null;
    room_type?: string | null;
  } | null;
  course?: {
    id: number;
    course_code: string;
    course_name: string;
  } | null;
  subject?: {
    id: number;
    subject_code: string;
    subject_name: string;
  } | null;
}

interface Room {
  id: number;
  room_code: string;
  building?: string;
}

interface Section {
  id: number;
  section_name: string;
  department_id: number;
  department?: {
    id: number;
    department_code: string;
    department_name: string;
  } | null;
}

interface Faculty {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  assigned_units?: number;
  probono_units?: number | null;
  department_id: number;
  department?: {
    id: number;
    department_name: string;
    department_code: string;
  } | null;
  status: string;
}

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

interface Subject {
  id: number;
  subject_code: string;
  subject_name: string;
}

interface Term {
  id: number;
  term_name: string;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
}

interface ApprovalItem {
  id: number;
  section_name: string;
  department_code: string;
  department_name: string;
  semester: string;
  submission_date: string;
}

interface StoredUser {
  id?: number;
  name?: string;
  role?: string;
}

interface DashboardData {
  schedules: Schedule[];
  rooms: Room[];
  sections: Section[];
  faculties: Faculty[];
  departments: Department[];
  subjects: Subject[];
  activeTerm: Term | null;
}

interface InitialDataResponse extends Omit<DashboardData, 'activeTerm'> {
  active_term: Term;
}

// ── Weekly Timetable Calendar Helpers ──
const START_HOUR = 7;
const END_HOUR = 21;

const parseTimeToSlotIndex = (timeStr: string): number => {
  if (!timeStr) return 0;
  const match12 = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const ampm = match12[3].toUpperCase();
    if (ampm === "PM" && hour !== 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const totalHalfHours = (hour * 2) + (minutes >= 30 ? 1 : 0);
    return Math.max(0, totalHalfHours - 14); // 7:00 AM starts at slot 14
  }
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    const hour = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const totalHalfHours = (hour * 2) + (minutes >= 30 ? 1 : 0);
    return Math.max(0, totalHalfHours - 14);
  }
  return 0;
};

const getShortDay = (day: string): string => {
  const normalized = day.trim().toLowerCase();
  if (normalized.startsWith("mon")) return "Mon";
  if (normalized.startsWith("tue")) return "Tue";
  if (normalized.startsWith("wed")) return "Wed";
  if (normalized.startsWith("thu")) return "Thu";
  if (normalized.startsWith("fri")) return "Fri";
  if (normalized.startsWith("sat")) return "Sat";
  if (normalized.startsWith("sun")) return "Sun";
  return "Mon";
};

const normalizeDepartmentKey = (code: string, name = "") => {
  const normalizedCode = code.trim().toUpperCase();
  const value = name.toLowerCase();
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

const getDeptStyles = (code: string) => {
  switch (normalizeDepartmentKey(code)) {
    case "IT":
      return "bg-blue-50 text-blue-800 border-blue-200 border-l-blue-600 hover:bg-blue-100/60";
    case "AS":
      return "bg-purple-50 text-purple-800 border-purple-200 border-l-purple-600 hover:bg-purple-100/60";
    case "EDUC":
      return "bg-orange-50 text-orange-855 border-orange-250 border-l-orange-500 hover:bg-orange-100/60";
    case "BA":
      return "bg-yellow-50/50 text-yellow-850 border-yellow-300 border-l-yellow-600 hover:bg-yellow-100/60";
    case "HM":
      return "bg-lime-50 text-lime-850 border-lime-300 border-l-lime-600 hover:bg-lime-100/60";
    case "MID":
      return "bg-emerald-50 text-emerald-850 border-emerald-300 border-l-emerald-600 hover:bg-emerald-100/60";
    case "CRIM":
      return "bg-[#5A1220]/5 text-[#5A1220] border-[#5A1220]/20 border-l-[#5A1220] hover:bg-[#5A1220]/10";
    case "LIS":
      return "bg-pink-50 text-pink-850 border-pink-300 border-l-pink-600 hover:bg-pink-100/60";
    default:
      return "bg-gray-50 text-gray-800 border-gray-300 border-l-gray-500 hover:bg-gray-100/60";
  }
};

const getClassType = (schedule: Schedule): 'Lecture' | 'Laboratory' => {
  // Check if room is a laboratory
  const roomType = schedule.room?.room_type?.toLowerCase() || '';
  if (roomType.includes('lab') || roomType.includes('laboratory')) {
    return 'Laboratory';
  }
  const roomCode = schedule.room?.room_code?.toLowerCase() || '';
  if (roomCode.includes('lab')) {
    return 'Laboratory';
  }
  
  // Check if subject code ends with 'L' or contains 'Lab'
  const subCode = schedule.subject?.subject_code?.toUpperCase() || '';
  if (subCode.endsWith('L') || subCode.includes('LAB') || subCode.includes('-L')) {
    return 'Laboratory';
  }
  
  const subName = schedule.subject?.subject_name?.toLowerCase() || '';
  if (subName.includes('laboratory') || subName.includes(' lab')) {
    return 'Laboratory';
  }
  
  return 'Lecture';
};

const getBuildingColor = (buildingName: string) => {
  const normalized = (buildingName || 'Main').trim().toUpperCase();
  const colors: Record<string, string> = {
    'MAIN': 'bg-rose-50 text-rose-800 border-rose-200 border-l-rose-600 hover:bg-rose-100/60',
    'IT BUILDING': 'bg-cyan-50 text-cyan-800 border-cyan-200 border-l-cyan-600 hover:bg-cyan-100/60',
    'ENG BUILDING': 'bg-teal-50 text-teal-800 border-teal-200 border-l-teal-600 hover:bg-teal-100/60',
    'SCIENCE': 'bg-amber-50 text-amber-800 border-amber-200 border-l-amber-600 hover:bg-amber-100/60',
    'ANNEX': 'bg-violet-50 text-violet-800 border-violet-200 border-l-violet-600 hover:bg-violet-100/60',
    'GYM': 'bg-emerald-50 text-emerald-800 border-emerald-200 border-l-emerald-600 hover:bg-emerald-100/60',
  };
  
  if (colors[normalized]) return colors[normalized];
  
  // Simple hash for dynamic fallback colors
  const hash = normalized.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
  const colorKeys = Object.keys(colors);
  const selectedKey = colorKeys[hash % colorKeys.length];
  return colors[selectedKey];
};

interface AvailabilityBlock {
  startSlot: number;
  endSlot: number;
  status: 'occupied' | 'available' | 'no-schedule';
  schedule?: Schedule;
}

const getDayAvailabilityBlocks = (
  daySchedules: Schedule[],
  filterRoom: string,
  filterBuilding: string
): AvailabilityBlock[] => {
  const blocks: AvailabilityBlock[] = [];
  let currentBlock: AvailabilityBlock | null = null;

  for (let t = 0; t < 25; t++) {
    let status: 'occupied' | 'available' | 'no-schedule' = 'available';
    let matchingSchedule: Schedule | undefined = undefined;

    // Check if slot is occupied
    const activeSchedulesInSlot = daySchedules.filter(s => {
      const start = parseTimeToSlotIndex(s.start_time);
      const end = parseTimeToSlotIndex(s.end_time);
      return t >= start && t < end;
    });

    if (activeSchedulesInSlot.length > 0) {
      status = 'occupied';
      matchingSchedule = activeSchedulesInSlot[0];
    } else {
      if (filterRoom === 'all' && filterBuilding === 'all') {
        status = 'no-schedule';
      } else {
        status = 'available';
      }
    }

    if (!currentBlock) {
      currentBlock = {
        startSlot: t,
        endSlot: t + 1,
        status,
        schedule: matchingSchedule
      };
    } else if (
      currentBlock.status === status &&
      (!matchingSchedule || currentBlock.schedule?.id === matchingSchedule.id)
    ) {
      currentBlock.endSlot = t + 1;
    } else {
      blocks.push(currentBlock);
      currentBlock = {
        startSlot: t,
        endSlot: t + 1,
        status,
        schedule: matchingSchedule
      };
    }
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
};

interface LayoutItem {
  schedule: Schedule;
  leftPct: number;
  widthPct: number;
}

const getDayLayouts = (daySchedules: Schedule[]): LayoutItem[] => {
  const sorted = [...daySchedules].sort((a, b) => {
    const aStart = parseTimeToSlotIndex(a.start_time);
    const bStart = parseTimeToSlotIndex(b.start_time);
    if (aStart !== bStart) return aStart - bStart;
    return (
      (parseTimeToSlotIndex(b.end_time) - parseTimeToSlotIndex(b.start_time)) -
      (parseTimeToSlotIndex(a.end_time) - parseTimeToSlotIndex(a.start_time))
    );
  });

  const layouts: LayoutItem[] = [];
  const clusters: Schedule[][] = [];

  for (const s of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const overlaps = cluster.some((c) => {
        const sStart = parseTimeToSlotIndex(s.start_time);
        const sEnd = parseTimeToSlotIndex(s.end_time);
        const cStart = parseTimeToSlotIndex(c.start_time);
        const cEnd = parseTimeToSlotIndex(c.end_time);
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
        const overlapsCol = columns[colIdx].some((c) => {
          const sStart = parseTimeToSlotIndex(s.start_time);
          const sEnd = parseTimeToSlotIndex(s.end_time);
          const cStart = parseTimeToSlotIndex(c.start_time);
          const cEnd = parseTimeToSlotIndex(c.end_time);
          return Math.max(sStart, cStart) < Math.min(sEnd, cEnd);
        });
        if (!overlapsCol) {
          columns[colIdx].push(s);
          break;
        }
        colIdx += 1;
      }
    }
    const colCount = columns.length;
    columns.forEach((col, colIdx) => {
      col.forEach((s) => {
        layouts.push({
          schedule: s,
          leftPct: (colIdx / colCount) * 100,
          widthPct: (1 / colCount) * 100,
        });
      });
    });
  }

  return layouts;
};

export default function VpaaDashboardPage() {
  useTour();
  const { toast } = useToast();
  const navigate = useNavigate();

  // User
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const dashboardCacheKey = `dashboard:${user?.role ?? 'vpaa'}:${user?.id ?? 'current'}`;
  const cachedDashboardData = getCachedData<DashboardData>(dashboardCacheKey);
  const [isLoading, setIsLoading] = useState(!hasCachedData(dashboardCacheKey));

  // States
  const [schedules, setSchedules] = useState<Schedule[]>(cachedDashboardData?.schedules ?? []);
  const [rooms, setRooms] = useState<Room[]>(cachedDashboardData?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cachedDashboardData?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cachedDashboardData?.faculties ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedDashboardData?.departments ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cachedDashboardData?.subjects ?? []);
  const [activeTerm, setActiveTerm] = useState<Term | null>(cachedDashboardData?.activeTerm ?? null);
  const { feedItems: notificationItems, unreadCount, markAllAsRead } = useSystemNotifications();

  // Timetable Calendar Filters and state (Essential only)
  const daysOfWeek = useMemo(() => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], []);
  const todayShort = useMemo(() => daysOfWeek[new Date().getDay()], [daysOfWeek]);
  const [filterDept, setFilterDept] = useState<string>('all');
  const [filterDay, setFilterDay] = useState<string>(todayShort);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Lock background body scroll when fullscreen calendar is open
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // Time slots mapping definition
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let slot = 0; slot < 25; slot += 1) { // 25 half-hour slots from 7:00 AM to 7:30 PM (ends at 7:00 PM label)
      const totalMinutes = 7 * 60 + slot * 30;
      let hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const ampm = hours >= 12 ? "PM" : "AM";
      if (hours > 12) hours -= 12;
      if (hours === 0) hours = 12;
      slots.push({
        label: `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`,
      });
    }
    return slots;
  }, []);

  // Main calendar filter function
  const calendarFilteredSchedules = useMemo(() => {
    const activeTermSchedules = activeTerm?.id
      ? schedules.filter(s => Number(s.term_id) === Number(activeTerm.id))
      : schedules;

    // Filter department
    let deptSchedules = activeTermSchedules;
    if (filterDept !== 'all') {
      deptSchedules = activeTermSchedules.filter(s => Number(s.section?.department_id) === Number(filterDept));
    }

    // Filter day
    if (filterDay !== 'all') {
      deptSchedules = deptSchedules.filter(s => getShortDay(s.day) === filterDay);
    }

    // Filter by search query (Universal Search)
    if (!searchQuery.trim()) {
      return deptSchedules;
    }

    const q = searchQuery.toLowerCase();
    return deptSchedules.filter(s => {
      const sectionName = s.section?.section_name?.toLowerCase() || '';
      const courseCode = s.course?.course_code?.toLowerCase() || '';
      const courseName = s.course?.course_name?.toLowerCase() || '';
      const facultyName = s.faculty
        ? `${s.faculty.first_name} ${s.faculty.last_name}`.toLowerCase()
        : '';
      const roomCode = s.room?.room_code?.toLowerCase() || '';
      const building = s.room?.building?.toLowerCase() || '';

      return sectionName.includes(q) ||
             courseCode.includes(q) ||
             courseName.includes(q) ||
             facultyName.includes(q) ||
             roomCode.includes(q) ||
             building.includes(q);
    });
  }, [filterDept, filterDay, searchQuery, schedules, activeTerm]);

  // ── Calculated Summary Metrics ──
  const totalClassesCount = calendarFilteredSchedules.length;
  
  const roomsInUseCount = useMemo(() => {
    const usedRoomIds = new Set(calendarFilteredSchedules.map(s => s.room_id).filter(Boolean));
    return usedRoomIds.size;
  }, [calendarFilteredSchedules]);

  const availableRoomsCount = useMemo(() => {
    return Math.max(0, rooms.length - roomsInUseCount);
  }, [rooms, roomsInUseCount]);

  // Current time states for indicator line
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const currentDayName = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[now.getDay()];
  }, [now]);

  const currentDayTimeTop = useMemo(() => {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const startMinutes = 7 * 60; // 7:00 AM
    const elapsed = totalMinutes - startMinutes;
    if (elapsed < 0 || elapsed > 12 * 60) return null; // Outside 7:00 AM - 7:00 PM
    return elapsed * 0.8; // 600px height / 720 minutes = 0.8px per minute
  }, [now]);



  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const shouldShowSkeleton = !hasCachedData(dashboardCacheKey);
      try {
        setIsLoading(shouldShowSkeleton);
        const data = await loadCachedData<DashboardData>(dashboardCacheKey, async () => {
          const response = await api.get<InitialDataResponse>('/initial-data');

          return {
            schedules: response.data.schedules,
            rooms: response.data.rooms,
            sections: response.data.sections,
            faculties: response.data.faculties,
            departments: response.data.departments,
            subjects: response.data.subjects,
            activeTerm: response.data.active_term,
          };
        });

        if (!active) return;
        setSchedules(data.schedules);
        setRooms(data.rooms);
        setSections(data.sections);
        setFaculties(data.faculties);
        setDepartments(data.departments);
        setSubjects(data.subjects);
        setActiveTerm(data.activeTerm);
      } catch {
        toast.error('Error', 'Failed to load dashboard data.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [dashboardCacheKey, toast]);

  // ── 1. Grouped Schedule Status Map ──
  const scheduleStatusMap = useMemo(() => {
    const map = new Map<number, { status: string; updated_at?: string }>();
    schedules.forEach(s => {
      const matchesActiveTerm = !activeTerm?.id || Number(s.term_id) === Number(activeTerm.id);
      if (matchesActiveTerm && !map.has(s.section_id)) {
        map.set(s.section_id, { status: s.status, updated_at: s.updated_at });
      }
    });
    return map;
  }, [activeTerm?.id, schedules]);

  const totalSchedules = useMemo(() => {
    if (!activeTerm?.id) return schedules.length;
    return schedules.filter(schedule => Number(schedule.term_id) === Number(activeTerm.id)).length;
  }, [activeTerm?.id, schedules]);

  // ── 2. Summary Metric Calculations ──
  const summaryMetrics = useMemo(() => {
    let pendingDean = 0;
    let pendingVpaa = 0;
    let approved = 0;

    scheduleStatusMap.forEach((val) => {
      if (val.status === 'submitted') {
        pendingDean++;
      } else if (val.status === 'approved_by_dean') {
        pendingVpaa++;
      } else if (val.status === 'approved') {
        approved++;
      }
    });

    return {
      pendingDean,
      pendingVpaa,
      approved
    };
  }, [scheduleStatusMap]);

  // ── 3. Department Progress Status Overview ──
  const departmentStats = useMemo(() => {
    return departments.map(dept => {
      const deptSections = sections.filter(sec => Number(sec.department_id) === Number(dept.id));
      let completedCount = 0;
      let pendingCount = 0;

      deptSections.forEach(sec => {
        const val = scheduleStatusMap.get(sec.id);
        if (val) {
          if (val.status === 'approved') {
            completedCount++;
          } else if (val.status === 'submitted' || val.status === 'approved_by_dean') {
            pendingCount++;
          }
        }
      });

      const totalSections = deptSections.length;
      const progressPercent = totalSections > 0 ? Math.round((completedCount / totalSections) * 100) : 0;

      let approvalStatus = 'Draft';
      if (completedCount === totalSections && totalSections > 0) {
        approvalStatus = 'VPAA Approved';
      } else if (pendingCount > 0) {
        approvalStatus = 'Pending Review';
      } else if (completedCount > 0) {
        approvalStatus = 'Partially Approved';
      }

      return {
        id: dept.id,
        department_name: dept.department_name,
        department_code: dept.department_code,
        sectionsCount: totalSections,
        completedCount,
        pendingCount,
        approvalStatus,
        progressPercent
      };
    });
  }, [departments, sections, scheduleStatusMap]);

  // ── 4. Overall Progress Statistics ──
  const overallStats = useMemo(() => {
    let draftCount = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    sections.forEach(sec => {
      const val = scheduleStatusMap.get(sec.id);
      if (val) {
        if (val.status === 'approved') {
          approvedCount++;
        } else if (val.status === 'submitted' || val.status === 'approved_by_dean') {
          pendingCount++;
        } else if (val.status === 'rejected' || val.status === 'rejected_by_dean') {
          rejectedCount++;
        } else {
          draftCount++;
        }
      } else {
        draftCount++;
      }
    });

    const totalSectionsCount = sections.length;
    const progressPercent = totalSectionsCount > 0
      ? Math.round((approvedCount / totalSectionsCount) * 100)
      : 0;

    return {
      draftCount,
      pendingCount,
      approvedCount,
      rejectedCount,
      progressPercent
    };
  }, [sections, scheduleStatusMap]);

  // ── 5. Faculty Load Distribution Counts ──
  const facultyStats = useMemo(() => {
    let total = faculties.length;
    let available = 0;
    let fullyLoaded = 0;
    let overloaded = 0;
    let probono = 0;

    faculties.forEach(f => {
      const assigned = f.assigned_units || 0;
      const max = f.max_units || 21;
      const pct = max > 0 ? (assigned / max) * 100 : 0;

      if (pct > 100) {
        overloaded++;
      } else if (pct === 100) {
        fullyLoaded++;
      } else {
        available++;
      }
      
      // Pro Bono tracking (custom workload indicators mapped previously)
      const isProBono = f.probono_units !== undefined && f.probono_units !== null && Number(f.probono_units) > 0;
      if (isProBono) {
        probono++;
      }
    });

    return { total, available, fullyLoaded, overloaded, probono };
  }, [faculties]);

  // ── 6. Schedule Approval Queue ──
  const approvalQueue = useMemo(() => {
    const queue: ApprovalItem[] = [];
    sections.forEach(sec => {
      const val = scheduleStatusMap.get(sec.id);
      if (val && val.status === 'approved_by_dean') {
        const submissionDate = val.updated_at
          ? new Date(val.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Just now';

        queue.push({
          id: sec.id,
          section_name: sec.section_name,
          department_code: sec.department?.department_code || 'N/A',
          department_name: sec.department?.department_name || 'N/A',
          semester: activeTerm?.semester ? `${activeTerm.semester.toUpperCase()} SEM` : '1st Sem',
          submission_date: submissionDate
        });
      }
    });
    return queue;
  }, [sections, scheduleStatusMap, activeTerm]);

  // ── Export Mock Event Handlers ──
  const handleExportSchedules = () => {
    toast.success('Export Successful', 'Academic schedules exported successfully as CSV.');
  };

  const handleExportFacultyLoad = () => {
    toast.success('Export Successful', 'Faculty teaching load progress report exported as PDF.');
  };

  return (
    <div className="space-y-5 pb-8 font-sans min-h-screen bg-[#F7F4F0]">
      {/* Breadcrumbs Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-muted text-xs tracking-wider uppercase">Home / Dashboard</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#1f2937]">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Institution-wide overview of scheduling activity and approval progress.</p>
        </div>
        {activeTerm && (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-bold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active Term: {activeTerm.term_name}
          </div>
        )}
      </div>

      {/* Notice Banner */}
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
        approvalQueue.length > 0
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}>
        <Bell className={`h-5 w-5 flex-shrink-0 ${approvalQueue.length > 0 ? 'text-amber-600' : 'text-emerald-500'}`} />
        <span>
          {approvalQueue.length > 0
            ? `${approvalQueue.length} schedule${approvalQueue.length === 1 ? '' : 's'} awaiting VPAA attention.`
            : 'All clear — no action items require attention right now.'}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-5">
          {/* Skeleton Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white p-4 rounded-2xl border border-gray-150 shadow-sm animate-pulse h-[84px] flex flex-col justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-8" />
              </div>
            ))}
          </div>
          {/* Skeleton Widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-[400px] rounded-2xl" />
            <Skeleton className="h-[400px] rounded-2xl" />
          </div>
        </div>
      ) : (
        /* Main Dashboard Grid matching layout diagram */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
          
          {/* ═══════════════════════════════════════════════════════════
              LEFT COLUMN: 2x2 CARDS -> TABLE (TIMETABLE)
             ═══════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-6 space-y-4 flex flex-col h-full">
            
            {/* 1. 2x2 CARDS Grid (4 Cards) */}
            <div className="grid grid-cols-2 gap-3.5">
              {/* Card 1: Departments */}
              <div
                onClick={() => navigate('/departments')}
                className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer min-h-[90px]"
              >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Departments</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-gray-900">{departments.length}</span>
                  <Building2 className="w-4.5 h-4.5 text-[#5A1220]/70" />
                </div>
              </div>

              {/* Card 2: Faculty */}
              <div
                onClick={() => navigate('/faculty')}
                className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer min-h-[90px]"
              >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Total Faculty</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-gray-900">{faculties.length}</span>
                  <GraduationCap className="w-4.5 h-4.5 text-[#5A1220]/70" />
                </div>
              </div>

              {/* Card 3: Courses */}
              <div
                onClick={() => navigate('/curriculum-view')}
                className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer min-h-[90px]"
              >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Courses</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-gray-900">{subjects.length}</span>
                  <BookOpen className="w-4.5 h-4.5 text-[#5A1220]/70" />
                </div>
              </div>

              {/* Card 4: Classrooms */}
              <div
                onClick={() => navigate('/rooms')}
                className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer min-h-[90px]"
              >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Classrooms</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-gray-900">{rooms.length}</span>
                  <DoorOpen className="w-4.5 h-4.5 text-[#5A1220]/70" />
                </div>
              </div>
            </div>

            {/* 2. TABLE: Overall Department Schedule Timetable */}
            <div className={`${
              isFullscreen
                ? 'fixed inset-0 z-[99999] bg-white p-6 flex flex-col overflow-hidden w-screen h-screen'
                : 'bg-white p-5 rounded-2xl border border-gray-200 shadow-sm font-sans flex-1 flex flex-col justify-between'
            }`}>
              
              {/* Table Header Controls */}
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 border-b border-gray-150 pb-3">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4.5 h-4.5 text-[#5A1220]" />
                    <h2 className="text-gray-850 font-bold text-base leading-none">
                      Institutional Timetable Calendar
                    </h2>
                  </div>
                  
                  {/* Action Filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Department Filter */}
                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-xl shadow-sm">
                      <span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider">Dept</span>
                      <select
                        value={filterDept}
                        onChange={(e) => setFilterDept(e.target.value)}
                        className="border-none text-gray-700 bg-transparent text-xs font-semibold focus:ring-0 cursor-pointer p-0 pr-5"
                      >
                        <option value="all">All Departments</option>
                        {departments.map((dept) => (
                          <option key={dept.id} value={dept.id}>{dept.department_code}</option>
                        ))}
                      </select>
                    </div>

                    {/* Day Filter */}
                    <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-xl shadow-sm">
                      <span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider">Day</span>
                      <select
                        value={filterDay}
                        onChange={(e) => setFilterDay(e.target.value)}
                        className="border-none text-gray-700 bg-transparent text-xs font-semibold focus:ring-0 cursor-pointer p-0 pr-5"
                      >
                        <option value="all">All Days</option>
                        <option value="Sun">Sunday</option>
                        <option value="Mon">Monday</option>
                        <option value="Tue">Tuesday</option>
                        <option value="Wed">Wednesday</option>
                        <option value="Thu">Thursday</option>
                        <option value="Fri">Friday</option>
                        <option value="Sat">Saturday</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Search Bar & Screen Controls */}
                <div className="flex items-center gap-2 w-full lg:w-auto relative">
                  <div className="relative flex-1 lg:w-48 lg:flex-none">
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-2.5 py-1.5 pl-8 border border-gray-300 text-gray-700 bg-white rounded-xl focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] text-xs font-semibold shadow-sm transition-all"
                    />
                    <Filter className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
                  </div>

                  {/* Full Window Toggle Button */}
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-1.5 text-gray-700 hover:text-[#5A1220] hover:bg-gray-100 rounded-xl transition-all cursor-pointer border border-gray-200 bg-white shadow-sm flex items-center justify-center shrink-0"
                    title={isFullscreen ? "Exit Full Window" : "Full Window View"}
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>

                  {/* Reset Button */}
                  {(filterDept !== 'all' || filterDay !== todayShort || searchQuery !== '') && (
                    <button
                      onClick={() => {
                        setFilterDept('all');
                        setFilterDay(todayShort);
                        setSearchQuery('');
                      }}
                      className="p-1.5 text-gray-555 hover:text-[#5A1220] hover:bg-red-50 hover:border-red-200 rounded-xl transition-all cursor-pointer border border-gray-200 bg-white shadow-sm flex items-center justify-center shrink-0"
                      title="Reset Filters"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Compact Metrics Strip */}
              <div className="flex items-center justify-between text-xs py-2 px-1 border-b border-gray-100 text-gray-500 font-semibold">
                <div className="flex items-center gap-4">
                  <span>Classes: <strong className="text-[#5A1220]">{totalClassesCount}</strong></span>
                  <span>Rooms in Use: <strong className="text-slate-800">{roomsInUseCount}</strong></span>
                  <span>Available Rooms: <strong className="text-emerald-600">{availableRoomsCount}</strong></span>
                </div>
                <span className="text-[10px] text-gray-400">7:00 AM &ndash; 7:00 PM</span>
              </div>

              {/* Timetable Grid (Sunday to Saturday, 7:00 AM - 7:00 PM, 30-min slots) */}
              <div className={`mt-3 ${isFullscreen ? 'flex-1 overflow-hidden flex flex-col' : 'flex-1 flex flex-col min-h-0'}`}>
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-inner flex-1 flex flex-col">
                  <div className={`min-w-[600px] bg-white relative flex flex-row scrollbar-thin ${
                    isFullscreen 
                      ? 'flex-1 overflow-y-auto' 
                      : 'h-[580px] overflow-y-hidden'
                  }`}>
                    {/* Time Column */}
                    <div className="w-16 shrink-0 sticky left-0 z-20 bg-gray-50 select-none border-r border-gray-200">
                      <div className="sticky top-0 left-0 z-40 h-9 border-b border-gray-200 bg-gray-100 flex items-center justify-center font-extrabold text-[9px] uppercase tracking-wider text-gray-500">
                        Time
                      </div>
                      {timeSlots.map((slot, index) => (
                        <div
                          key={index}
                          className="h-6 border-b border-gray-100 last:border-b-0 flex items-center justify-center text-[8px] font-semibold text-gray-400 bg-gray-50/90"
                        >
                          {slot.label.includes(":00") ? (
                            <span className="font-bold text-gray-600">{slot.label}</span>
                          ) : (
                            <span className="text-gray-400 font-medium">{slot.label}</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Day Columns (Sunday to Saturday) */}
                    <div className="flex-1 flex flex-row relative">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                        .filter(day => filterDay === 'all' || getShortDay(day) === filterDay)
                        .map((day) => {
                          const daySchedules = calendarFilteredSchedules.filter(
                            (schedule) => getShortDay(schedule.day) === day
                          );
                          const isToday = day === currentDayName;
                          const layouts = getDayLayouts(daySchedules);

                          return (
                            <div
                              key={day}
                              className={`flex-1 border-r border-gray-200 last:border-r-0 relative min-w-[130px] transition-colors duration-250 ${
                                isToday ? 'bg-red-500/[0.015]' : ''
                              }`}
                            >
                              {/* Sticky Day Column Header */}
                              <div
                                className={`sticky top-0 z-10 h-9 border-b border-gray-200 flex flex-col items-center justify-center select-none ${
                                  isToday
                                    ? 'bg-red-50/95 text-[#5A1220] font-black border-b-2 border-b-red-500 shadow-sm'
                                    : 'bg-gray-50 text-gray-700'
                                }`}
                              >
                                <span className="font-bold text-xs uppercase tracking-wider">{day}</span>
                                <span className="text-[7.5px] font-extrabold opacity-75">
                                  {daySchedules.length} {daySchedules.length === 1 ? "Class" : "Classes"}
                                </span>
                              </div>

                              {/* Column Body Grid */}
                              <div className="relative" style={{ height: `${timeSlots.length * 24}px` }}>
                                {timeSlots.map((_, index) => (
                                  <div key={index} className="h-6 border-b border-gray-100 last:border-b-0" />
                                ))}

                                {/* Google Calendar Time Indicator Line */}
                                {isToday && currentDayTimeTop !== null && (
                                  <div
                                    className="absolute left-0 right-0 border-t-2 border-red-500 z-15 pointer-events-none flex items-center"
                                    style={{ top: `${currentDayTimeTop}px` }}
                                  >
                                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-sm" />
                                  </div>
                                )}

                                {/* Rendering Schedule Cards */}
                                {daySchedules.map((schedule) => {
                                  const startIdx = parseTimeToSlotIndex(schedule.start_time);
                                  const endIdx = parseTimeToSlotIndex(schedule.end_time);
                                  const top = startIdx * 24;
                                  const height = (endIdx - startIdx) * 24;
                                  const layout = layouts.find((item) => item.schedule.id === schedule.id);
                                  
                                  const left = layout ? `${layout.leftPct}%` : "0%";
                                  const width = layout ? `${layout.widthPct}%` : "100%";
                                  const deptCode = schedule.section?.department?.department_code || "GEN";
                                  const isLab = getClassType(schedule) === 'Laboratory';

                                  return (
                                    <div
                                      key={schedule.id}
                                      className={`group absolute rounded-lg border border-l-3 p-1.5 overflow-hidden text-left flex flex-col justify-between font-sans shadow-sm select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:z-25 ${getDeptStyles(deptCode)}`}
                                      style={{
                                        top: `${top + 2}px`,
                                        height: `${height - 4}px`,
                                        left: `calc(${left} + 1px)`,
                                        width: `calc(${width} - 2px)`,
                                        fontSize: '8.5px',
                                        lineHeight: '1.2'
                                      }}
                                    >
                                      {/* Header */}
                                      <div className="min-w-0 flex items-center justify-between gap-1">
                                        <p className="font-black truncate text-gray-900">
                                          {schedule.course?.course_code || schedule.subject?.subject_code || "Class"}
                                        </p>
                                        <span className={`px-1 rounded-[3px] text-[7px] font-black uppercase ${
                                          isLab
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-slate-100 text-slate-700'
                                        }`}>
                                          {isLab ? 'LAB' : 'LEC'}
                                        </span>
                                      </div>

                                      {/* Details Body */}
                                      <div className="mt-0.5 flex-1 flex flex-col justify-end opacity-85 text-[7.5px] font-bold text-gray-500 space-y-0.5">
                                        <p className="truncate font-black text-[#5A1220]">{schedule.section?.section_name}</p>
                                        <p className="truncate text-slate-800">
                                          {schedule.faculty ? `${schedule.faculty.first_name[0]}. ${schedule.faculty.last_name}` : 'TBA'}
                                        </p>
                                      </div>

                                      {/* Hover Popover */}
                                      <div className={`absolute hidden group-hover:flex flex-col gap-2 z-40 w-64 bg-slate-900 text-white rounded-xl shadow-2xl p-3.5 font-sans text-xs pointer-events-none select-none border border-slate-700 ${
                                        ['Thu', 'Fri', 'Sat'].includes(day) ? 'right-full mr-2 top-0' : 'left-full ml-2 top-0'
                                      }`}>
                                        <div className="flex items-center justify-between border-b border-gray-700 pb-1">
                                          <span className="font-bold text-[#F5A623]">
                                            {schedule.course?.course_code || schedule.subject?.subject_code}
                                          </span>
                                          <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded font-semibold uppercase">
                                            {schedule.mode || 'Lecture'}
                                          </span>
                                        </div>
                                        <p className="font-bold text-gray-100 text-xs">
                                          {schedule.course?.course_name || schedule.subject?.subject_name || 'Subject'}
                                        </p>
                                        <div className="space-y-1 text-gray-300 text-[10px] border-t border-gray-700 pt-1.5">
                                          <div className="flex justify-between">
                                            <span className="text-gray-400">Instructor:</span>
                                            <span className="font-bold text-white">
                                              {schedule.faculty ? `${schedule.faculty.first_name} ${schedule.faculty.last_name}` : 'Unassigned'}
                                            </span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-400">Section:</span>
                                            <span className="font-bold text-white">{schedule.section?.section_name}</span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-400">Room:</span>
                                            <span className="font-bold text-white">
                                              {schedule.room?.building || 'Main'} &bull; {schedule.room?.room_code || 'Unassigned'}
                                            </span>
                                          </div>
                                          <div className="flex justify-between">
                                            <span className="text-gray-400">Time:</span>
                                            <span className="font-bold text-[#F5A623]">{schedule.start_time} - {schedule.end_time}</span>
                                          </div>
                                        </div>
                                      </div>
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
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              RIGHT COLUMN: 2 PIE CHARTS -> DETAILS NOTE -> BAR CHART
             ═══════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-6 space-y-4 flex flex-col h-full font-sans">
            
            {/* 1. 2 PIE CHARTS Side-by-Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              
              {/* PIE CHART 1: Schedule Status Distribution */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between font-sans">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                  <h3 className="font-sans font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-[#5A1220]" />
                    Schedule Status
                  </h3>
                  <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                    Total: {sections.length}
                  </span>
                </div>

                {/* Interactive Donut Visualization */}
                <div className="flex items-center justify-center my-3 relative">
                  <svg className="w-28 h-28 -rotate-90 transform" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f5f9" strokeWidth="11" />
                    {(() => {
                      const total = sections.length || 1;
                      const data = [
                        { count: overallStats.approvedCount, color: '#10B981' },
                        { count: overallStats.pendingCount, color: '#F59E0B' },
                        { count: overallStats.draftCount, color: '#94A3B8' },
                        { count: overallStats.rejectedCount, color: '#F43F5E' },
                      ];
                      let cumulative = 0;
                      const circumference = 2 * Math.PI * 38;

                      return data.map((item, idx) => {
                        if (item.count <= 0) return null;
                        const pct = (item.count / total) * 100;
                        const dashArray = `${(pct / 100) * circumference} ${circumference}`;
                        const dashOffset = -((cumulative / 100) * circumference);
                        cumulative += pct;

                        return (
                          <circle
                            key={idx}
                            cx="50"
                            cy="50"
                            r="38"
                            fill="transparent"
                            stroke={item.color}
                            strokeWidth="11"
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                            className="transition-all duration-500"
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-sans">
                    <span className="text-2xl font-black text-gray-900 leading-none">{sections.length}</span>
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">Schedules</span>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 font-sans">
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-gray-50/70 border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-[11px]">Approved</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-1.5 py-0.2 bg-white rounded shadow-2xs border border-gray-200/50">
                      {overallStats.approvedCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-gray-50/70 border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-[11px]">Pending</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-1.5 py-0.2 bg-white rounded shadow-2xs border border-gray-200/50">
                      {overallStats.pendingCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-gray-50/70 border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                      <span className="font-semibold text-gray-600 text-[11px]">Drafts</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-1.5 py-0.2 bg-white rounded shadow-2xs border border-gray-200/50">
                      {overallStats.draftCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-gray-50/70 border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-[11px]">Rejected</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-1.5 py-0.2 bg-white rounded shadow-2xs border border-gray-200/50">
                      {overallStats.rejectedCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* PIE CHART 2: Faculty Load Distribution */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between font-sans">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                  <h3 className="font-sans font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-[#5A1220]" />
                    Faculty Load
                  </h3>
                  <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">
                    Total: {faculties.length}
                  </span>
                </div>

                {/* Interactive Donut Visualization */}
                <div className="flex items-center justify-center my-3 relative">
                  <svg className="w-28 h-28 -rotate-90 transform" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f5f9" strokeWidth="11" />
                    {(() => {
                      const total = faculties.length || 1;
                      const data = [
                        { count: facultyStats.available, color: '#10B981' },
                        { count: facultyStats.fullyLoaded, color: '#3B82F6' },
                        { count: facultyStats.overloaded, color: '#EF4444' },
                        { count: facultyStats.probono, color: '#A855F7' },
                      ];
                      let cumulative = 0;
                      const circumference = 2 * Math.PI * 38;

                      return data.map((item, idx) => {
                        if (item.count <= 0) return null;
                        const pct = (item.count / total) * 100;
                        const dashArray = `${(pct / 100) * circumference} ${circumference}`;
                        const dashOffset = -((cumulative / 100) * circumference);
                        cumulative += pct;

                        return (
                          <circle
                            key={idx}
                            cx="50"
                            cy="50"
                            r="38"
                            fill="transparent"
                            stroke={item.color}
                            strokeWidth="11"
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                            className="transition-all duration-500"
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-sans">
                    <span className="text-2xl font-black text-gray-900 leading-none">{faculties.length}</span>
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">Faculty</span>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 font-sans">
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-gray-50/70 border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-[11px]">Available</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-1.5 py-0.2 bg-white rounded shadow-2xs border border-gray-200/50">
                      {facultyStats.available}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-gray-50/70 border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-[11px]">Loaded</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-1.5 py-0.2 bg-white rounded shadow-2xs border border-gray-200/50">
                      {facultyStats.fullyLoaded}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-gray-50/70 border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-[11px]">Overload</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-1.5 py-0.2 bg-white rounded shadow-2xs border border-gray-200/50">
                      {facultyStats.overloaded}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-gray-50/70 border border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-[11px]">Pro Bono</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-1.5 py-0.2 bg-white rounded shadow-2xs border border-gray-200/50">
                      {facultyStats.probono}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. DETAILS NOTE (Wide Strip Card) */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50/60 p-3.5 rounded-2xl border border-amber-200/80 shadow-sm flex items-start gap-3">
              <div className="p-1.5 rounded-xl bg-amber-500/10 text-amber-800 shrink-0 mt-0.5">
                <Bell className="w-4.5 h-4.5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-xs text-amber-950 uppercase tracking-wider">Executive Scheduling Notice</h4>
                  <span className="text-[10px] font-extrabold text-amber-800 bg-amber-200/60 px-2 py-0.5 rounded-full">
                    {activeTerm ? activeTerm.term_name : 'Active Term'}
                  </span>
                </div>
                <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                  {approvalQueue.length > 0
                    ? `${approvalQueue.length} department schedule${approvalQueue.length === 1 ? '' : 's'} are currently awaiting VPAA final review and endorsement. Cross-department room capacities and faculty unit loads are monitored in real time.`
                    : 'All submitted department schedules have been reviewed and approved. Academic timetable operations are running normally.'}
                </p>
                {approvalQueue.length > 0 && (
                  <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-amber-200/60">
                    <span className="text-[10.5px] font-semibold text-amber-900">
                      Pending: <strong>{approvalQueue.map(q => q.section_name).slice(0, 3).join(', ')}{approvalQueue.length > 3 ? '...' : ''}</strong>
                    </span>
                    <button
                      onClick={() => navigate('/schedules/approval')}
                      className="px-2.5 py-1 bg-[#5A1220] hover:bg-[#410b15] text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Review Queue &rarr;
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 3. BAR CHART: Department Progress Comparison (Fits all departments without scrolling) */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 mb-3">
                  <div>
                    <h3 className="font-sans font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#5A1220]" />
                      Department Scheduling Progress
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Section readiness & approval completion by department</p>
                  </div>
                  <span className="text-xs font-black text-[#5A1220] bg-red-50 px-2.5 py-1 rounded-xl border border-red-100">
                    {overallStats.progressPercent}% Institutional
                  </span>
                </div>

                {/* All Departments Fitted Cleanly - No Scrollbar */}
                <div className="space-y-2">
                  {departmentStats.map((dept) => {
                    const isCompleted = dept.progressPercent === 100;
                    return (
                      <div key={dept.id} className="space-y-1 pb-1.5 border-b border-gray-100 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-gray-900 w-14 text-xs">{dept.department_code}</span>
                            <span className="text-[11px] text-gray-500 truncate max-w-[180px]">{dept.department_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400">{dept.completedCount}/{dept.sectionsCount} Sections</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                              isCompleted
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {dept.progressPercent}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${dept.progressPercent}%` }}
                            className={`h-full rounded-full transition-all duration-500 ${
                              isCompleted ? 'bg-emerald-500' : 'bg-[#5A1220]'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 pt-3 mt-3 flex items-center justify-between text-[11px] text-gray-400">
                <span>Active Departments: {departments.length}</span>
                <button
                  onClick={() => navigate('/departments')}
                  className="font-bold text-[#5A1220] hover:underline cursor-pointer"
                >
                  Manage Departments &rarr;
                </button>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
