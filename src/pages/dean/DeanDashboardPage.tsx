import { useState, useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useNavigate } from 'react-router-dom';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { useSystemNotifications } from '../../hooks/useSystemNotifications';

import {
  Users,
  Layers,
  BookOpen,
  CalendarDays,
  Clock,
  CheckCircle2,
  TrendingUp,
  GraduationCap,
  ClipboardList,
  AlertTriangle,
  FileBarChart,
  CheckSquare,
  DoorOpen,
  AlertCircle,
  Bell,
  Building2,
  RotateCcw,
  Maximize2,
  Minimize2,
  Filter
} from 'lucide-react';

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

interface Subject {
  id: number;
  subject_code: string;
  subject_name: string;
  department_id?: number | null;
}

interface Schedule {
  id: number;
  term_id: number;
  section_id: number;
  faculty_id?: number | null;
  room_id?: number | null;
  department_id?: number | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: string;
  status: string;
  updated_at?: string;
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
  faculty?: {
    id: number;
    first_name: string;
    last_name: string;
  } | null;
  room?: {
    id: number;
    room_code: string;
    building?: string;
  } | null;
  section?: {
    id: number;
    section_name: string;
    department_id: number;
    department?: {
      id: number;
      department_code: string;
      department_name: string;
    } | null;
  } | null;
  department?: {
    id: number;
    department_code: string;
    department_name: string;
  } | null;
}

interface Term {
  id: number;
  term_name: string;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
}

interface QueueItem {
  id: number;
  section_name: string;
  department_code: string;
  semester: string;
  submission_date: string;
  status: string;
}

interface StoredUser {
  id?: number;
  name?: string;
  department_id?: number;
  role?: string;
}

interface DashboardData {
  faculties: Faculty[];
  rooms: Room[];
  sections: Section[];
  subjects: Subject[];
  schedules: Schedule[];
  activeTerm: Term | null;
}

interface InitialDataResponse extends Omit<DashboardData, 'activeTerm'> {
  active_term: Term;
}

export default function DeanDashboardPage() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // User info
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const dashboardCacheKey = `dashboard:${user?.role ?? 'dean'}:${user?.id ?? user?.department_id ?? 'current'}`;
  const cachedDashboardData = getCachedData<DashboardData>(dashboardCacheKey);
  const [isLoading, setIsLoading] = useState(!hasCachedData(dashboardCacheKey));

  // States
  const [faculties, setFaculties] = useState<Faculty[]>(cachedDashboardData?.faculties ?? []);
  const [rooms, setRooms] = useState<Room[]>(cachedDashboardData?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cachedDashboardData?.sections ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cachedDashboardData?.subjects ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cachedDashboardData?.schedules ?? []);
  const [activeTerm, setActiveTerm] = useState<Term | null>(cachedDashboardData?.activeTerm ?? null);

  // Timetable Calendar Filters and state for Dean's Department
  const daysOfWeek = useMemo(() => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], []);
  const todayShort = useMemo(() => daysOfWeek[new Date().getDay()], [daysOfWeek]);
  const [filterDay, setFilterDay] = useState<string>('all');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

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
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

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

  const parseTimeToSlotIndex = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(" ");
    if (parts.length < 2) return 0;
    const [time, modifier] = parts;
    let [hours, minutes] = time.split(":").map(Number);
    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    const totalMinutes = hours * 60 + minutes;
    const startMinutes = 7 * 60;
    return Math.max(0, (totalMinutes - startMinutes) / 30);
  };

  const getShortDay = (dayStr: string) => {
    if (!dayStr) return "";
    const clean = dayStr.trim().toLowerCase();
    if (clean.startsWith("sun")) return "Sun";
    if (clean.startsWith("mon")) return "Mon";
    if (clean.startsWith("tue")) return "Tue";
    if (clean.startsWith("wed")) return "Wed";
    if (clean.startsWith("thu")) return "Thu";
    if (clean.startsWith("fri")) return "Fri";
    if (clean.startsWith("sat")) return "Sat";
    return "";
  };

  const getDeptStyles = (deptCode: string) => {
    const upper = (deptCode || "").toUpperCase();
    if (upper === "CIT" || upper === "IT") return "bg-red-50 text-red-950 border-red-200 border-l-red-600 hover:bg-red-100/80";
    if (upper === "CAS") return "bg-amber-50 text-amber-950 border-amber-200 border-l-amber-600 hover:bg-amber-100/80";
    if (upper === "CBA") return "bg-emerald-50 text-emerald-950 border-emerald-200 border-l-emerald-600 hover:bg-emerald-100/80";
    if (upper === "CCJPS" || upper === "CRIM") return "bg-blue-50 text-blue-950 border-blue-200 border-l-blue-600 hover:bg-blue-100/80";
    if (upper === "CED") return "bg-purple-50 text-purple-950 border-purple-200 border-l-purple-600 hover:bg-purple-100/80";
    if (upper === "CHM") return "bg-rose-50 text-rose-950 border-rose-200 border-l-rose-600 hover:bg-rose-100/80";
    return "bg-slate-50 text-slate-900 border-slate-200 border-l-slate-600 hover:bg-slate-100/80";
  };

  const getDayLayouts = (daySchedules: Schedule[]) => {
    const slots = daySchedules.map(s => ({
      ...s,
      startIdx: parseTimeToSlotIndex(s.start_time),
      endIdx: parseTimeToSlotIndex(s.end_time)
    }));

    const layouts: { [key: number]: { col: number; totalCols: number } } = {};
    for (let i = 0; i < slots.length; i++) {
      const cur = slots[i];
      let col = 0;
      let totalCols = 1;
      const overlaps: typeof slots = [];

      for (let j = 0; j < slots.length; j++) {
        if (i === j) continue;
        const other = slots[j];
        if (cur.startIdx < other.endIdx && cur.endIdx > other.startIdx) {
          overlaps.push(other);
        }
      }

      const assignedCols = new Set<number>();
      for (const ov of overlaps) {
        if (layouts[ov.id]) {
          assignedCols.add(layouts[ov.id].col);
        }
      }

      while (assignedCols.has(col)) {
        col++;
      }

      totalCols = Math.max(overlaps.length + 1, col + 1);
      layouts[cur.id] = { col, totalCols };
    }

    return layouts;
  };

  // Calendar filtered schedules: scoped exclusively to dean's own department
  const calendarFilteredSchedules = useMemo(() => {
    const activeTermSchedules = activeTerm?.id
      ? schedules.filter(s => Number(s.term_id) === Number(activeTerm.id))
      : schedules;

    let deptSchedules = activeTermSchedules;
    if (user?.department_id) {
      deptSchedules = activeTermSchedules.filter(s => {
        const secDept = s.section?.department_id;
        const schedDept = s.department?.id;
        return (secDept && Number(secDept) === Number(user.department_id)) ||
               (schedDept && Number(schedDept) === Number(user.department_id)) ||
               Number(s.department_id) === Number(user.department_id);
      });
    }

    if (filterDay !== 'all') {
      deptSchedules = deptSchedules.filter(s => getShortDay(s.day) === filterDay);
    }

    if (!searchQuery.trim()) {
      return deptSchedules;
    }

    const q = searchQuery.toLowerCase();
    return deptSchedules.filter(s => {
      const sectionName = s.section?.section_name?.toLowerCase() || '';
      const courseCode = s.course?.course_code?.toLowerCase() || '';
      const courseName = s.course?.course_name?.toLowerCase() || '';
      const subjectCode = s.subject?.subject_code?.toLowerCase() || '';
      const subjectName = s.subject?.subject_name?.toLowerCase() || '';
      const facultyName = s.faculty
        ? `${s.faculty.first_name} ${s.faculty.last_name}`.toLowerCase()
        : '';
      const roomCode = s.room?.room_code?.toLowerCase() || '';
      const building = s.room?.building?.toLowerCase() || '';

      return sectionName.includes(q) ||
             courseCode.includes(q) ||
             courseName.includes(q) ||
             subjectCode.includes(q) ||
             subjectName.includes(q) ||
             facultyName.includes(q) ||
             roomCode.includes(q) ||
             building.includes(q);
    });
  }, [schedules, activeTerm, user?.department_id, filterDay, searchQuery]);

  // Rooms utilized by department schedules
  const deptRoomsCount = useMemo(() => {
    const roomIds = new Set<number>();
    schedules.forEach(s => {
      const sec = sections.find(x => x.id === s.section_id);
      const matchesActiveTerm = !activeTerm?.id || Number(s.term_id) === Number(activeTerm.id);
      if (matchesActiveTerm && sec && user?.department_id && Number(sec.department_id) === Number(user.department_id) && s.room_id) {
        roomIds.add(s.room_id);
      }
    });
    return roomIds.size;
  }, [activeTerm?.id, schedules, sections, user?.department_id]);

  const calendarTotalClasses = calendarFilteredSchedules.length;
  const calendarRoomsInUse = useMemo(() => {
    const used = new Set(calendarFilteredSchedules.map(s => s.room_id).filter(Boolean));
    return used.size;
  }, [calendarFilteredSchedules]);
  const calendarAvailableRooms = useMemo(() => {
    return Math.max(0, deptRoomsCount - calendarRoomsInUse);
  }, [deptRoomsCount, calendarRoomsInUse]);

  // Hook for department schedules stage counts
  const {
    draftingProgress,
    stageCounts,
  } = useDepartmentScheduleStatus(user?.department_id);
  const { feedItems: notificationItems, unreadCount, markAllAsRead } = useSystemNotifications();

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const shouldShowSkeleton = !hasCachedData(dashboardCacheKey);
      try {
        setIsLoading(shouldShowSkeleton);
        const data = await loadCachedData<DashboardData>(dashboardCacheKey, async () => {
          const response = await api.get<InitialDataResponse>('/initial-data');

          return {
            faculties: response.data.faculties,
            rooms: response.data.rooms,
            sections: response.data.sections,
            subjects: response.data.subjects,
            schedules: response.data.schedules,
            activeTerm: response.data.active_term,
          };
        });

        if (!active) return;
        setFaculties(data.faculties);
        setRooms(data.rooms);
        setSections(data.sections);
        setSubjects(data.subjects);
        setSchedules(data.schedules);
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

  // ── 1. Department Filtered Data ──
  const deptFaculties = useMemo(() => {
    if (!user?.department_id) return [];
    return faculties.filter(f => Number(f.department_id) === Number(user.department_id));
  }, [faculties, user?.department_id]);

  const deptSections = useMemo(() => {
    if (!user?.department_id) return [];
    return sections.filter(s => Number(s.department_id) === Number(user.department_id));
  }, [sections, user?.department_id]);

  const deptSubjects = useMemo(() => {
    if (!user?.department_id) return [];
    return subjects.filter(s => s.department_id !== undefined && Number(s.department_id) === Number(user.department_id));
  }, [subjects, user?.department_id]);

  // Group schedules by section ID
  const scheduleStatusMap = useMemo(() => {
    const map = new Map<number, { status: string; updated_at?: string; room_id?: number | null }>();
    schedules.forEach(s => {
      const matchesActiveTerm = !activeTerm?.id || Number(s.term_id) === Number(activeTerm.id);
      if (matchesActiveTerm && !map.has(s.section_id)) {
        map.set(s.section_id, { status: s.status, updated_at: s.updated_at, room_id: s.room_id });
      }
    });
    return map;
  }, [activeTerm?.id, schedules]);

  // Department schedules total
  const deptSchedulesCount = useMemo(() => {
    if (!user?.department_id) return 0;
    return schedules.filter(s => {
      const sec = sections.find(x => x.id === s.section_id);
      const matchesDepartment = sec && Number(sec.department_id) === Number(user.department_id);
      const matchesActiveTerm = !activeTerm?.id || Number(s.term_id) === Number(activeTerm.id);
      return matchesDepartment && matchesActiveTerm;
    }).length;
  }, [activeTerm?.id, schedules, sections, user?.department_id]);

  // ── 2. Department Specific Metrics ──
  const deptMetrics = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;

    deptSections.forEach(sec => {
      const val = scheduleStatusMap.get(sec.id);
      if (val) {
        if (val.status === 'submitted') {
          pending++;
        } else if (val.status === 'approved' || val.status === 'approved_by_dean') {
          approved++;
        } else if (val.status === 'rejected' || val.status === 'rejected_by_dean') {
          rejected++;
        }
      }
    });

    return { pending, approved, rejected };
  }, [deptSections, scheduleStatusMap]);

  // ── 3. Schedule Approval Queue (Awaiting Dean Review) ──
  const approvalQueue = useMemo(() => {
    const queue: QueueItem[] = [];
    deptSections.forEach(sec => {
      const val = scheduleStatusMap.get(sec.id);
      if (val && val.status === 'submitted') {
        const submissionDate = val.updated_at
          ? new Date(val.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Just now';

        queue.push({
          id: sec.id,
          section_name: sec.section_name,
          department_code: sec.department?.department_code || 'N/A',
          semester: activeTerm?.semester ? `${activeTerm.semester.toUpperCase()} SEM` : '1st Sem',
          submission_date: submissionDate,
          status: val.status
        });
      }
    });
    return queue;
  }, [deptSections, scheduleStatusMap, activeTerm]);

  // ── 4. Section Scheduling Progress (Checklist Overview) ──
  const sectionProgressList = useMemo(() => {
    return deptSections.map(sec => {
      const val = scheduleStatusMap.get(sec.id);
      const status = val ? val.status : 'draft';

      let statusColor = 'bg-gray-100 text-gray-500 border-gray-200';
      if (status === 'submitted') {
        statusColor = 'bg-amber-50 text-amber-700 border-amber-200';
      } else if (status === 'approved_by_dean') {
        statusColor = 'bg-blue-50 text-blue-700 border-blue-200';
      } else if (status === 'approved') {
        statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-250';
      } else if (status === 'rejected' || status === 'rejected_by_dean') {
        statusColor = 'bg-red-50 text-red-700 border-red-200';
      }

      return {
        id: sec.id,
        section_name: sec.section_name,
        status,
        statusColor
      };
    });
  }, [deptSections, scheduleStatusMap]);

  return (
    <div className="space-y-5 pb-8 font-sans min-h-screen bg-[#F7F4F0]">
      {/* Breadcrumb Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-muted text-xs tracking-wider uppercase">Home / Dashboard</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#1f2937]">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Department overview of scheduling progress and approval work.</p>
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
            ? `${approvalQueue.length} schedule${approvalQueue.length === 1 ? '' : 's'} awaiting dean attention.`
            : 'All clear — no action items require attention right now.'}
        </span>
      </div>

      {/* Greeting Banner */}
      <div className="bg-[#5A1220] py-3 px-5 rounded-xl text-white border border-[#5A1220]/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md">
        <div>
          <h1 className="font-sans text-lg font-bold tracking-tight text-white">
            Welcome back, <span className="text-[#F5A623]">{user?.name || 'Dean'}</span>
          </h1>
          <p className="text-[#E2D9D0] text-xs mt-1">Dean Dashboard &mdash; department overview</p>
        </div>
        {activeTerm && (
          <span className="text-xs sm:text-sm bg-white/10 px-4 py-2 rounded-xl text-[#F5A623] font-bold border border-white/5 uppercase tracking-wider">
            {activeTerm.term_name}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {/* Skeleton Summary Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-gray-150 shadow-sm animate-pulse h-[84px] flex flex-col justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-8" />
              </div>
            ))}
          </div>
          {/* Skeleton Widgets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-[340px] rounded-2xl" />
            <Skeleton className="h-[340px] rounded-2xl" />
            <Skeleton className="h-[340px] rounded-2xl" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Metric Cards (7 Cards Grid) */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {/* Total Faculty */}
            <div
              onClick={() => navigate('/dean/faculty')}
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Faculty</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{deptFaculties.length}</span>
                <GraduationCap className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Total Subjects */}
            <div
              onClick={() => navigate('/dean/curricula')}
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Subjects</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{deptSubjects.length}</span>
                <BookOpen className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Total Schedules */}
            <div
              onClick={() => navigate('/dean/schedules')}
              className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-pointer"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Schedules</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{deptSchedulesCount}</span>
                <CalendarDays className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Pending Approvals */}
            <div className="bg-white p-4 rounded-xl border border-amber-250 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-amber-50/10">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider truncate">Pending Review</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-amber-700">{deptMetrics.pending}</span>
                <Clock className="w-4 h-4 text-[#F5A623]" />
              </div>
            </div>

            {/* Approved Schedules */}
            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-emerald-50/10">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider truncate">Approved</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-emerald-700">{deptMetrics.approved}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            </div>

            {/* Rejected Schedules */}
            <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-red-50/10">
              <span className="text-[10px] font-bold text-red-650 uppercase tracking-wider truncate">Rejected</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-red-700">{deptMetrics.rejected}</span>
                <AlertCircle className="w-4 h-4 text-red-600" />
              </div>
            </div>

            {/* Department Completion Percentage */}
            <div className="bg-white p-4 rounded-xl border border-[#5A1220]/25 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-[#5A1220]/5">
              <span className="text-[10px] font-bold text-[#5A1220] uppercase tracking-wider truncate">Progress</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-[#7B1113]">{draftingProgress}%</span>
                <TrendingUp className="w-4 h-4 text-[#5A1220]" />
              </div>
            </div>
          </div>

          {/* Widgets Grid Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Widget 1: Department Schedule Progress */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[340px]">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-6">
                  <TrendingUp className="w-5 h-5 text-[#5A1220]" />
                  <span>Department Schedule Progress</span>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-500">Drafting Completion</span>
                      <span className="font-bold text-[#5A1220] text-sm">{draftingProgress}%</span>
                    </div>
                    <div className="h-3.5 w-full bg-gray-100 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${draftingProgress}%` }}
                        className="bg-[#5A1220] h-full rounded-full transition-all duration-500"
                      />
                    </div>
                  </div>

                  {/* Stage breakdown progress */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Draft</p>
                      <p className="text-xl font-extrabold text-gray-800 mt-1">{stageCounts?.draft ?? 0}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Submitted</p>
                      <p className="text-xl font-extrabold text-gray-800 mt-1">{stageCounts?.submitted ?? 0}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dean Approved</p>
                      <p className="text-xl font-extrabold text-gray-800 mt-1">{stageCounts?.approved_by_dean ?? 0}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-150">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">VPAA Approved</p>
                      <p className="text-xl font-extrabold text-gray-800 mt-1">{stageCounts?.approved ?? 0}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-150 flex items-center justify-between text-xs text-gray-400">
                <span>Active semester overview</span>
              </div>
            </div>

            {/* Widget 2: Faculty Teaching Load */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[340px]">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-5">
                  <Users className="w-5 h-5 text-[#5A1220]" />
                  <span>Faculty Load Overview</span>
                </div>

                <div className="space-y-3.5 max-h-[200px] overflow-y-auto pr-1">
                  {deptFaculties.length === 0 ? (
                    <p className="text-center text-gray-400 text-xs py-8">No department instructors found.</p>
                  ) : (
                    deptFaculties.slice(0, 4).map(f => {
                      const assigned = f.assigned_units || 0;
                      const max = f.max_units || 21;
                      const pct = max > 0 ? Math.round((assigned / max) * 100) : 0;

                      let barColor = 'bg-[#F5A623]';
                      let statusBadge = 'Available';
                      let statusColor = 'text-[#F5A623] bg-amber-50 border-amber-200';

                      if (pct > 100) {
                        barColor = 'bg-red-500';
                        statusBadge = 'Overloaded';
                        statusColor = 'text-red-600 bg-red-50 border-red-200';
                      } else if (pct === 100) {
                        barColor = 'bg-emerald-500';
                        statusBadge = 'Fully Loaded';
                        statusColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
                      }

                      // Check Pro Bono mapping
                      const isProBono = f.probono_units !== undefined && f.probono_units !== null && Number(f.probono_units) > 0;
                      if (isProBono) {
                        statusBadge = 'Pro Bono';
                        statusColor = 'text-purple-600 bg-purple-50 border-purple-200';
                      }

                      const middleInitial = f.middle_name ? `${f.middle_name.charAt(0)}.` : '';
                      const fullName = `${f.last_name}, ${f.first_name} ${middleInitial}`.trim();

                      return (
                        <div key={f.id} className="space-y-1.5 pb-2 border-b border-gray-100 last:border-0 last:pb-0">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-gray-800 truncate max-w-[130px]">{fullName}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase border ${statusColor}`}>
                              {statusBadge}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3 text-[10px]">
                            <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="font-bold text-gray-500 whitespace-nowrap">{assigned}/{max} Units ({pct}%)</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-150">
                <button
                  onClick={() => navigate('/dean/faculty')}
                  className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline flex items-center gap-1"
                >
                  Manage department faculty load &rarr;
                </button>
              </div>
            </div>

            {/* Widget 3: Schedule Approval Queue */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[340px]">
              <div>
                <div className="flex justify-between items-center gap-4 mb-6">
                  <div className="flex items-center gap-2.5 text-gray-800 font-bold">
                    <CheckSquare className="w-5 h-5 text-[#5A1220]" />
                    <span>Schedule Approval Queue</span>
                  </div>
                  {approvalQueue.length > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold border border-red-100">
                      {approvalQueue.length} Pending
                    </span>
                  )}
                </div>

                <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                  {approvalQueue.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center text-center">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-2" />
                      <p className="text-gray-700 font-bold text-xs">No pending approvals</p>
                      <p className="text-gray-400 text-[11px] mt-0.5">Schedules are fully reviewed.</p>
                    </div>
                  ) : (
                    approvalQueue.slice(0, 3).map(item => (
                      <div key={item.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex justify-between items-center text-xs">
                        <div className="space-y-0.5">
                          <p className="font-bold text-gray-800">{item.section_name}</p>
                          <p className="text-[10px] text-gray-400">{item.semester} &bull; {item.submission_date}</p>
                        </div>
                        <button
                          onClick={() => navigate('/dean/schedules/approval')}
                          className="px-3 py-1.5 bg-[#5A1220] hover:bg-[#C9952A] text-white text-[10px] font-bold rounded-lg cursor-pointer transition-colors"
                        >
                          Review
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {approvalQueue.length > 3 && (
                <div className="mt-4 flex justify-end border-t border-gray-150 pt-3">
                  <button
                    onClick={() => navigate('/dean/schedules/approval')}
                    className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    View all approvals &rarr;
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Lower Widgets Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Widget 4: Section Scheduling Progress */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm min-h-[340px] flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-5">
                  <Layers className="w-5 h-5 text-[#5A1220]" />
                  <span>Section Scheduling Progress</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[220px] overflow-y-auto pr-1">
                  {sectionProgressList.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-gray-400 text-xs">
                      No section classes registered for this department.
                    </div>
                  ) : (
                    sectionProgressList.map(sec => (
                      <div key={sec.id} className="p-3 bg-gray-50 border border-gray-150 rounded-xl flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-700 truncate max-w-[100px]">{sec.section_name}</span>
                        <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase border ${sec.statusColor}`}>
                          {sec.status === 'approved_by_dean' ? 'Reviewed' : sec.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-150 mt-4 flex justify-end">
                <button
                  onClick={() => navigate('/dean/schedules')}
                  className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline"
                >
                  Manage academic schedules &rarr;
                </button>
              </div>
            </div>

            {/* Widget 5: Department Status (Stats Overview) */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm min-h-[340px] flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-5">
                  <Building2 className="w-5 h-5 text-[#5A1220]" />
                  <span>Department Status Overview</span>
                </div>

                <div className="space-y-3 text-xs text-gray-600">
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                    <span>Draft Schedules</span>
                    <span className="font-bold text-gray-800">{stageCounts?.draft ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                    <span>Pending Approvals</span>
                    <span className="font-bold text-gray-800">{deptMetrics.pending}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                    <span>Approved Schedules</span>
                    <span className="font-bold text-emerald-600">{deptMetrics.approved}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                    <span>Rejected Schedules</span>
                    <span className="font-bold text-red-650">{deptMetrics.rejected}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                    <span>Total Faculty Members</span>
                    <span className="font-bold text-gray-800">{deptFaculties.length}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                    <span>Allocated Classrooms</span>
                    <span className="font-bold text-gray-800">{deptRoomsCount}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 last:border-0">
                    <span>Total Subjects</span>
                    <span className="font-bold text-gray-800">{deptSubjects.length}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-150 mt-4 flex justify-between text-[11px] font-semibold text-gray-400">
                <span>WICARS scheduling platform</span>
                <span>Active Semester stats</span>
              </div>
            </div>
          </div>


          {/* Department Academic Timetable Calendar Schedule (Sunday to Saturday, 7:00 AM - 7:00 PM, 30-min slots) */}
          <div className={`${
            isFullscreen
              ? 'fixed inset-0 z-[99999] bg-white p-6 flex flex-col overflow-hidden w-screen h-screen'
              : 'bg-white p-6 rounded-2xl border border-gray-200 shadow-sm font-sans'
          }`}>
            {/* Header + Actions Row */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-gray-150 pb-4">
              <div className="space-y-3.5 flex-1">
                <div>
                  <h2 className="text-gray-850 font-bold text-lg flex items-center gap-2 leading-none">
                    <CalendarDays className="w-5 h-5 text-[#5A1220]" />
                    Department Academic Timetable
                  </h2>
                  <p className="text-xs text-gray-500 mt-1 font-semibold">
                    Weekly schedule overview, room utilization, and instructor timetables for your department.
                  </p>
                </div>

                {/* Primary Action Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Day Filter */}
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm">
                    <span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider">Day</span>
                    <select
                      value={filterDay}
                      onChange={(e) => setFilterDay(e.target.value)}
                      className="border-none text-gray-700 bg-transparent text-xs font-semibold focus:ring-0 cursor-pointer p-0 pr-6"
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

              {/* Top Right: Search Bar & Controls */}
              <div className="flex items-center gap-2 w-full lg:w-auto relative">
                <div className="relative flex-1 lg:w-72 lg:flex-none">
                  <input
                    type="text"
                    placeholder="Search sections, instructors, rooms..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 pl-9 border border-gray-300 text-gray-700 bg-white rounded-xl focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] text-xs font-semibold shadow-sm transition-all"
                  />
                  <Filter className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                </div>

                {/* Full Window Toggle Button */}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 text-gray-700 hover:text-[#5A1220] hover:bg-gray-100 rounded-xl transition-all cursor-pointer border border-gray-200 bg-white shadow-sm flex items-center justify-center shrink-0"
                  title={isFullscreen ? "Exit Full Window" : "Full Window View"}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                {/* Reset Button */}
                {(filterDay !== 'all' || searchQuery !== '') && (
                  <button
                    onClick={() => {
                      setFilterDay('all');
                      setSearchQuery('');
                    }}
                    className="p-2 text-gray-555 hover:text-[#5A1220] hover:bg-red-50 hover:border-red-200 rounded-xl transition-all cursor-pointer border border-gray-200 bg-white shadow-sm flex items-center justify-center shrink-0"
                    title="Reset Filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Summary Metrics Row */}
            <div className={isFullscreen ? "flex flex-wrap items-center gap-4 mt-3 mb-2 pb-2.5 border-b border-gray-150" : "grid grid-cols-1 md:grid-cols-3 gap-4 mt-4"}>
              {/* Total Classes */}
              <div className={isFullscreen ? "flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-xl" : "p-3 bg-white rounded-xl border border-gray-150 shadow-sm flex items-center justify-between hover:shadow-md transition-all duration-300"}>
                {isFullscreen ? (
                  <>
                    <CalendarDays className="w-3.5 h-3.5 text-[#5A1220]" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Classes:</span>
                    <span className="font-extrabold text-[#5A1220] text-xs">{calendarTotalClasses}</span>
                  </>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-bold text-gray-450 uppercase tracking-wider block">Total Classes</span>
                      <span className="text-xl font-black text-[#5A1220] block">{calendarTotalClasses}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-red-50 text-[#5A1220] shadow-sm shrink-0">
                      <CalendarDays className="w-4.5 h-4.5" />
                    </div>
                  </>
                )}
              </div>

              {/* Rooms in Use */}
              <div className={isFullscreen ? "flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-xl" : "p-3 bg-white rounded-xl border border-gray-150 shadow-sm flex items-center justify-between hover:shadow-md transition-all duration-300"}>
                {isFullscreen ? (
                  <>
                    <DoorOpen className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Rooms in Use:</span>
                    <span className="font-extrabold text-slate-800 text-xs">{calendarRoomsInUse}</span>
                  </>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-bold text-gray-455 uppercase tracking-wider block">Rooms in Use</span>
                      <span className="text-xl font-black text-slate-800 block">{calendarRoomsInUse}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 text-slate-500 shadow-sm shrink-0">
                      <DoorOpen className="w-4.5 h-4.5" />
                    </div>
                  </>
                )}
              </div>

              {/* Available Rooms */}
              <div className={isFullscreen ? "flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-xl" : "p-3 bg-white rounded-xl border border-gray-150 shadow-sm flex items-center justify-between hover:shadow-md transition-all duration-300"}>
                {isFullscreen ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Available Rooms:</span>
                    <span className="font-extrabold text-emerald-600 text-xs">{calendarAvailableRooms}</span>
                  </>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-bold text-gray-455 uppercase tracking-wider block">Available Rooms</span>
                      <span className="text-xl font-black text-emerald-600 block">{calendarAvailableRooms}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shadow-sm shrink-0">
                      <CheckCircle2 className="w-4.5 h-4.5" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Timetable Grid (Sunday to Saturday, 7:00 AM - 7:00 PM, 30-min slots) */}
            <div className={`mt-4 ${isFullscreen ? 'flex-1 overflow-hidden flex flex-col' : ''}`}>
              <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-inner flex-1 flex flex-col">
                <div className={`min-w-[1000px] bg-white relative flex flex-row scrollbar-thin ${
                  isFullscreen 
                    ? 'flex-1 overflow-y-auto' 
                    : 'h-[660px] overflow-y-hidden'
                }`}>
                  {/* Sticky Left Corner & Time Column */}
                  <div className="w-20 shrink-0 sticky left-0 z-20 bg-gray-50 select-none border-r border-gray-200">
                    <div className="sticky top-0 left-0 z-40 h-10 border-b border-gray-200 bg-gray-100 flex items-center justify-center font-extrabold text-[9px] uppercase tracking-wider text-gray-500">
                      Time
                    </div>
                    {timeSlots.map((slot, index) => (
                      <div
                        key={index}
                        className="h-6 border-b border-gray-100 last:border-b-0 flex items-center justify-center text-[9px] font-semibold text-gray-400 bg-gray-50/90"
                      >
                        {slot.label.includes(":00") ? (
                          <span className="font-bold text-gray-600">{slot.label}</span>
                        ) : (
                          <span className="text-gray-400 font-medium text-[8px]">{slot.label}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Days Columns (Sunday to Saturday) */}
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
                            className={`flex-1 border-r border-gray-200 last:border-r-0 relative min-w-[170px] transition-colors duration-250 ${
                              isToday ? 'bg-red-500/[0.015]' : ''
                            }`}
                          >
                            {/* Sticky Day Column Header */}
                            <div
                              className={`sticky top-0 z-10 h-10 border-b border-gray-200 flex flex-col items-center justify-center select-none ${
                                isToday
                                  ? 'bg-red-50/95 text-[#5A1220] font-black border-b-2 border-b-red-500 shadow-sm'
                                  : 'bg-gray-50 text-gray-700'
                              }`}
                            >
                              <span className="font-bold text-xs uppercase tracking-wider">{day}</span>
                              <span className="text-[8px] font-extrabold opacity-75">
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

                                if (height <= 0) return null;

                                const deptCode = schedule.section?.department?.department_code || schedule.department?.department_code || 'CIT';
                                const layout = layouts[schedule.id] || { col: 0, totalCols: 1 };
                                const colWidth = 100 / layout.totalCols;
                                const left = layout.col * colWidth;

                                return (
                                  <div
                                    key={schedule.id}
                                    style={{
                                      top: `${top + 3}px`,
                                      height: `${height - 6}px`,
                                      left: `calc(${left}% + 2px)`,
                                      width: `calc(${colWidth}% - 4px)`
                                    }}
                                    className={`group absolute rounded-xl border border-l-4 p-2 overflow-hidden text-left flex flex-col justify-between font-sans shadow-sm select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:z-25 ${getDeptStyles(deptCode)}`}
                                  >
                                    <div className="space-y-0.5 min-w-0">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-extrabold text-[11px] leading-tight truncate">
                                          {schedule.course?.course_code || schedule.subject?.subject_code || 'N/A'}
                                        </span>
                                        <span className="text-[8px] font-black uppercase px-1 py-0.2 rounded bg-black/5 shrink-0">
                                          {schedule.section?.section_name || 'Sec'}
                                        </span>
                                      </div>
                                      <p className="text-[9px] font-semibold opacity-90 truncate leading-tight">
                                        {schedule.course?.course_name || schedule.subject?.subject_name || 'No title'}
                                      </p>
                                    </div>

                                    <div className="border-t border-black/5 pt-1 mt-auto flex items-center justify-between text-[8px] font-bold opacity-80">
                                      <span className="truncate max-w-[60%]">
                                        {schedule.faculty ? `${schedule.faculty.first_name[0]}. ${schedule.faculty.last_name}` : 'TBA'}
                                      </span>
                                      <span className="truncate">
                                        {schedule.room?.room_code || 'Room TBA'}
                                      </span>
                                    </div>

                                    {/* Hover Details Popover */}
                                    <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white rounded-xl shadow-2xl backdrop-blur-md z-50 border border-slate-700 text-xs space-y-2 leading-snug">
                                      <div className="flex items-center justify-between border-b border-gray-700 pb-1.5">
                                        <span className="font-bold text-[#F5A623]">
                                          {schedule.course?.course_code || schedule.subject?.subject_code}
                                        </span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded font-semibold uppercase">
                                          {schedule.mode || 'Lecture'}
                                        </span>
                                      </div>
                                      
                                      <p className="font-bold text-gray-100 text-xs">
                                        {schedule.course?.course_name || schedule.subject?.subject_name || 'No subject name'}
                                      </p>

                                      <div className="border-t border-gray-700 pt-1.5 space-y-1 text-gray-300 text-[10px]">
                                        <div className="flex justify-between">
                                          <span className="font-semibold text-gray-400">Instructor:</span>
                                          <span className="font-bold text-white">
                                            {schedule.faculty ? `${schedule.faculty.first_name} ${schedule.faculty.last_name}` : 'Unassigned'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="font-semibold text-gray-400">Section:</span>
                                          <span className="font-bold text-white">{schedule.section?.section_name}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="font-semibold text-gray-400">Room:</span>
                                          <span className="font-bold text-white">
                                            {schedule.room?.building || 'Main'} &bull; {schedule.room?.room_code || 'Unassigned'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="font-semibold text-gray-400">Time:</span>
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
      )}
    </div>
  );
}
