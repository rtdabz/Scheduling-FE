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
  ClipboardList
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

  // Timetable Calendar Filters and state
  const [calendarDeptFilter, setCalendarDeptFilter] = useState<string>('all');
  const [calendarFilterType, setCalendarFilterType] = useState<'section' | 'faculty' | 'room'>('section');
  const [calendarSearchQuery, setCalendarSearchQuery] = useState<string>('');

  const calendarFilteredSchedules = useMemo(() => {
    // Filter active term first
    const activeTermSchedules = activeTerm?.id
      ? schedules.filter(s => Number(s.term_id) === Number(activeTerm.id))
      : schedules;

    // Filter department first
    let deptSchedules = activeTermSchedules;
    if (calendarDeptFilter !== 'all') {
      deptSchedules = activeTermSchedules.filter(s => Number(s.section?.department_id) === Number(calendarDeptFilter));
    }

    // Filter by search query based on View By type
    if (!calendarSearchQuery.trim()) {
      return deptSchedules;
    }

    const q = calendarSearchQuery.toLowerCase();
    if (calendarFilterType === 'section') {
      return deptSchedules.filter(s => s.section?.section_name?.toLowerCase().includes(q));
    }
    if (calendarFilterType === 'faculty') {
      return deptSchedules.filter(s => {
        const fullName = `${s.faculty?.first_name || ''} ${s.faculty?.last_name || ''}`.toLowerCase();
        return fullName.includes(q);
      });
    }
    if (calendarFilterType === 'room') {
      return deptSchedules.filter(s => {
        const roomName = `${s.room?.room_code || ''} ${s.room?.building || ''}`.toLowerCase();
        return roomName.includes(q);
      });
    }
    return deptSchedules;
  }, [calendarDeptFilter, calendarFilterType, calendarSearchQuery, schedules, activeTerm]);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let slot = 0; slot < 24; slot += 1) { // 24 half-hour slots from 7:00 AM to 7:00 PM
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
    <div className="space-y-5 pb-8 transition-all duration-200 font-sans bg-gray-50/20">
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

      {/* Greeting Banner */}
      <div className="bg-[#5A1220] py-3 px-5 rounded-xl text-white border border-[#5A1220]/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md">
        <div>
          <h1 className="font-sans text-lg font-bold tracking-tight text-white">
            Welcome back, <span className="text-[#F5A623]">{user?.name || 'VPAA Administrator'}</span>
          </h1>
          <p className="text-[#E2D9D0] text-xs mt-1">Vice President for Academic Affairs Executive Dashboard</p>
        </div>
        {activeTerm && (
          <span className="text-xs sm:text-sm bg-white/10 px-4 py-2 rounded-xl text-[#F5A623] font-bold border border-white/5 uppercase tracking-wider">
            {activeTerm.term_name}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-5">
          {/* Skeleton Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm animate-pulse h-[84px] flex flex-col justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-8" />
              </div>
            ))}
          </div>
          {/* Skeleton Widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="h-[340px] rounded-2xl" />
            <Skeleton className="h-[340px] rounded-2xl" />
            <Skeleton className="h-[340px] rounded-2xl" />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary Metric Cards (5 Cards Grid) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Total Departments */}
            <div
              onClick={() => navigate('/departments')}
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Departments</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{departments.length}</span>
                <Building2 className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Total Faculty */}
            <div
              onClick={() => navigate('/faculty')}
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Total Faculty</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{faculties.length}</span>
                <GraduationCap className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Total Subjects */}
            <div
              onClick={() => navigate('/curriculum-view')}
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Courses</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{subjects.length}</span>
                <BookOpen className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Classrooms */}
            <div
              onClick={() => navigate('/rooms')}
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Classrooms</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{rooms.length}</span>
                <DoorOpen className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Schedules */}
            <div
              onClick={() => navigate('/schedules')}
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Schedules</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{totalSchedules}</span>
                <CalendarDays className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>
          </div>

          {/* Top Section Widgets Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Overall Scheduling Progress */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[280px]">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-4">
                  <TrendingUp className="w-5 h-5 text-[#5A1220]" />
                  <span>Overall Scheduling Progress</span>
                </div>

                <div className="space-y-4">
                  {/* Progress Indicator */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-500">Institutional Completion</span>
                      <span className="font-bold text-[#5A1220] text-sm">{overallStats.progressPercent}%</span>
                    </div>
                    <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${overallStats.progressPercent}%` }}
                        className="bg-[#5A1220] h-full transition-all duration-500 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Summary Breakdown counts */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Completed</p>
                      <p className="text-xl font-extrabold text-gray-800 mt-1">{overallStats.approvedCount}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pending</p>
                      <p className="text-xl font-extrabold text-gray-800 mt-1">{overallStats.pendingCount}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Drafts</p>
                      <p className="text-xl font-extrabold text-gray-800 mt-1">{overallStats.draftCount}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Rejected</p>
                      <p className="text-xl font-extrabold text-gray-800 mt-1">{overallStats.rejectedCount}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-150 flex items-center justify-between text-xs text-gray-400">
                <span>Total Sections: {sections.length}</span>
                <span>Active semester overview</span>
              </div>
            </div>

            {/* Faculty Teaching Load Overview */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[280px]">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-4">
                  <GraduationCap className="w-5 h-5 text-[#5A1220]" />
                  <span>Faculty Teaching Load Overview</span>
                </div>

                <div className="space-y-4">
                  {/* Total stats progress lines */}
                  {/* 🟢 Available */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-semibold text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 block" />
                        Available
                      </span>
                      <span>{facultyStats.available} / {facultyStats.total}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${facultyStats.total > 0 ? (facultyStats.available / facultyStats.total) * 100 : 0}%` }}
                        className="bg-emerald-500 h-full rounded-full transition-all"
                      />
                    </div>
                  </div>

                  {/* 🔵 Fully Loaded */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-semibold text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500 block" />
                        Fully Loaded
                      </span>
                      <span>{facultyStats.fullyLoaded} / {facultyStats.total}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${facultyStats.total > 0 ? (facultyStats.fullyLoaded / facultyStats.total) * 100 : 0}%` }}
                        className="bg-blue-500 h-full rounded-full transition-all"
                      />
                    </div>
                  </div>

                  {/* 🔴 Overloaded */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-semibold text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 block" />
                        Overloaded
                      </span>
                      <span>{facultyStats.overloaded} / {facultyStats.total}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${facultyStats.total > 0 ? (facultyStats.overloaded / facultyStats.total) * 100 : 0}%` }}
                        className="bg-red-500 h-full rounded-full transition-all"
                      />
                    </div>
                  </div>

                  {/* 🟣 Pro Bono */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-semibold text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-500 block" />
                        Pro Bono
                      </span>
                      <span>{facultyStats.probono} / {facultyStats.total}</span>
                    </div>
                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${facultyStats.total > 0 ? (facultyStats.probono / facultyStats.total) * 100 : 0}%` }}
                        className="bg-purple-500 h-full rounded-full transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule Approval Queue */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[280px]">
              <div>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5 text-gray-800 font-bold">
                    <CheckSquare className="w-5 h-5 text-[#5A1220]" />
                    <span>Schedule Approval Queue</span>
                  </div>
                  {approvalQueue.length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-650 text-[10px] font-bold border border-red-100">
                      {approvalQueue.length} Awaiting VPAA
                    </span>
                  )}
                </div>

                <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                  {approvalQueue.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center text-center">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-2" />
                      <p className="text-gray-700 font-bold text-xs">Approval Queue Cleared</p>
                      <p className="text-gray-400 text-[11px] mt-0.5">No schedules currently pending VPAA approval.</p>
                    </div>
                  ) : (
                    approvalQueue.slice(0, 3).map((item) => (
                      <div key={item.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex justify-between items-center text-xs">
                        <div className="space-y-0.5">
                          <p className="font-bold text-gray-800">{item.section_name}</p>
                          <p className="text-[10px] text-gray-400">{item.department_code} &bull; {item.submission_date}</p>
                        </div>
                        <button
                          onClick={() => navigate('/schedules/approval')}
                          className="px-3 py-1.5 bg-[#5A1220] hover:bg-[#C9952A] text-white text-[10px] font-bold rounded-lg cursor-pointer transition-all duration-200"
                        >
                          Review Schedule
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {approvalQueue.length > 3 && (
                <div className="mt-4 flex justify-end border-t border-gray-100 pt-3">
                  <button
                    onClick={() => navigate('/schedules/approval')}
                    className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    View entire approval queue &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Institutional Timetable Calendar Section */}
          <div className="space-y-3">
            <h2 className="text-gray-800 font-bold text-lg flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#5A1220]" />
              Institutional Timetable Calendar
            </h2>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-5">
              {/* Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-150 pb-4">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Department Filter */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Department</span>
                    <select
                      value={calendarDeptFilter}
                      onChange={(e) => setCalendarDeptFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded-xl focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] text-xs font-semibold cursor-pointer"
                    >
                      <option value="all">All Departments</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.department_code}</option>
                      ))}
                    </select>
                  </div>

                  {/* Filter Type */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">View By</span>
                    <select
                      value={calendarFilterType}
                      onChange={(e) => {
                        setCalendarFilterType(e.target.value as 'section' | 'faculty' | 'room');
                        setCalendarSearchQuery('');
                      }}
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded-xl focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] text-xs font-semibold cursor-pointer"
                    >
                      <option value="section">Section</option>
                      <option value="faculty">Faculty Member</option>
                      <option value="room">Classroom</option>
                    </select>
                  </div>

                  {/* Search Filter */}
                  <div className="flex flex-col gap-1.5 min-w-[180px]">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Search Item</span>
                    <input
                      type="text"
                      placeholder={`Search ${calendarFilterType}...`}
                      value={calendarSearchQuery}
                      onChange={(e) => setCalendarSearchQuery(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded-xl focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-gray-450 font-semibold bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200/80">
                  Total classes: <span className="font-extrabold text-[#5A1220]">{calendarFilteredSchedules.length}</span>
                </div>
              </div>

              {/* Weekly Timetable Calendar Grid */}
              {calendarFilteredSchedules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-250 bg-gray-50/50 py-12 text-center text-sm text-gray-400 font-medium">
                  No classes scheduled matching the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[1000px] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm relative flex flex-row">
                    {/* Time Column */}
                    <div className="w-20 shrink-0 border-r border-gray-200 bg-gray-50 select-none">
                      <div className="h-10 border-b border-gray-200 bg-gray-100/55 flex items-center justify-center font-bold text-[10px] uppercase text-gray-400">Time</div>
                      {timeSlots.map((slot, index) => (
                        <div key={index} className="h-6 border-b border-gray-100 last:border-b-0 flex items-center justify-center text-[9px] font-semibold text-gray-400">
                          {slot.label.includes(":00") ? <span className="font-bold text-gray-600">{slot.label}</span> : <span className="opacity-30">.</span>}
                        </div>
                      ))}
                    </div>

                    {/* Days Columns */}
                    <div className="flex-1 flex flex-row relative">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => {
                        const daySchedules = calendarFilteredSchedules.filter((schedule) => getShortDay(schedule.day) === day);
                        const layouts = getDayLayouts(daySchedules);
                        return (
                          <div key={day} className="flex-1 border-r border-gray-200 last:border-r-0 relative min-w-[140px]">
                            <div className="h-10 border-b border-gray-200 bg-gray-50 flex flex-col items-center justify-center select-none">
                              <span className="font-bold text-xs text-gray-700 uppercase tracking-wide">{day}</span>
                              <span className="text-[9px] font-bold text-gray-400">{daySchedules.length} {daySchedules.length === 1 ? "Class" : "Classes"}</span>
                            </div>

                            <div className="relative" style={{ height: `${24 * 24}px` }}>
                              {timeSlots.map((_, index) => <div key={index} className="h-6 border-b border-gray-100 last:border-b-0" />)}
                              {daySchedules.map((schedule) => {
                                const startIdx = parseTimeToSlotIndex(schedule.start_time);
                                const endIdx = parseTimeToSlotIndex(schedule.end_time);
                                const top = startIdx * 24;
                                const height = (endIdx - startIdx) * 24;
                                const layout = layouts.find((item) => item.schedule.id === schedule.id);
                                const left = layout ? `${layout.leftPct}%` : "0%";
                                const width = layout ? `${layout.widthPct}%` : "100%";
                                const deptCode = schedule.section?.department?.department_code || "GEN";

                                return (
                                  <div
                                    key={schedule.id}
                                    className={`absolute rounded-md border border-l-4 p-1.5 overflow-hidden text-left flex flex-col justify-between font-sans shadow-sm select-none transition-all ${getDeptStyles(deptCode)}`}
                                    style={{
                                      top: `${top}px`,
                                      height: `${height}px`,
                                      left: left,
                                      width: width,
                                      fontSize: '9px',
                                      lineHeight: '1.2'
                                    }}
                                  >
                                    <div className="min-w-0">
                                      <p className="font-extrabold truncate text-gray-900">{schedule.course?.course_code || schedule.subject?.subject_code || "Course"}</p>
                                      <p className="opacity-80 truncate font-semibold text-gray-700">{schedule.course?.course_name || schedule.subject?.subject_name}</p>
                                    </div>
                                    <div className="mt-1 opacity-80 text-[8px] font-semibold text-gray-655">
                                      <p className="truncate font-bold text-[#5A1220]">{schedule.section?.section_name}</p>
                                      <p className="truncate font-bold text-slate-800">{schedule.faculty ? `${schedule.faculty.first_name} ${schedule.faculty.last_name}` : 'Unassigned'}</p>
                                      <p className="truncate font-bold text-slate-800">{schedule.room?.room_code || 'Unassigned'}</p>
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
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
