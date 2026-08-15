import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckSquare,
  DoorOpen,
  Filter,
  GraduationCap,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { useSystemNotifications } from '../../hooks/useSystemNotifications';

interface Schedule {
  id: number;
  term_id: number;
  section_id: number;
  faculty_id?: number | null;
  room_id?: number | null;
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
  department_id?: number | null;
  department?: {
    id: number;
    department_code: string;
    department_name: string;
  } | null;
}

interface Room {
  id: number;
  room_code: string;
  building?: string;
  room_type: string;
  department_id?: number | null;
}

interface Section {
  id: number;
  section_name: string;
  department_id?: number | null;
}

interface Faculty {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  assigned_units?: number;
  deload_units?: number;
  probono_units?: number;
  department_id: number;
  department?: {
    id: number;
    department_name: string;
    department_code: string;
  } | null;
  status: string;
}

interface Subject {
  id: number;
  subject_code: string;
  subject_name: string;
  department_id?: number | null;
}

interface Term {
  id: number;
  term_name: string;
  status: string;
}

interface StoredUser {
  id?: number;
  name?: string;
  department_id?: number;
  role?: string;
}

interface SchedulingOverviewData {
  schedules: Schedule[];
  rooms: Room[];
  sections: Section[];
  faculties: Faculty[];
  subjects: Subject[];
  activeTerm: Term | null;
}

interface InitialDataResponse {
  schedules?: Schedule[];
  rooms?: Room[];
  sections?: Section[];
  faculties?: Faculty[];
  subjects?: Subject[];
  courses?: Subject[];
  active_term?: Term;
}

export default function SecretarySchedulingOperationsPage() {
  const navigate = useNavigate();

  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const overviewCacheKey = `dashboard:${user?.role ?? 'secretary'}:${user?.id ?? user?.department_id ?? 'current'}`;
  const cachedOverviewData = getCachedData<SchedulingOverviewData>(overviewCacheKey);
  const [isLoading, setIsLoading] = useState(!hasCachedData(overviewCacheKey));

  const [schedules, setSchedules] = useState<Schedule[]>(cachedOverviewData?.schedules ?? []);
  const [rooms, setRooms] = useState<Room[]>(cachedOverviewData?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cachedOverviewData?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cachedOverviewData?.faculties ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cachedOverviewData?.subjects ?? []);
  const [activeTerm, setActiveTerm] = useState<Term | null>(cachedOverviewData?.activeTerm ?? null);

  // Timetable Calendar Filters and state for Secretary's Department
  const daysOfWeek = useMemo(() => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], []);
  const todayShort = useMemo(() => daysOfWeek[new Date().getDay()], [daysOfWeek]);
  const [filterDay, setFilterDay] = useState<string>(todayShort);
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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
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
      schedule: s,
      startIdx: parseTimeToSlotIndex(s.start_time),
      endIdx: parseTimeToSlotIndex(s.end_time)
    }));

    const sorted = [...slots].sort((a, b) => a.startIdx - b.startIdx || (b.endIdx - b.startIdx) - (a.endIdx - a.startIdx));
    const clusters: Array<typeof slots> = [];
    let curCluster: typeof slots = [];
    let curClusterEnd = -1;

    sorted.forEach((item) => {
      if (curCluster.length === 0) {
        curCluster.push(item);
        curClusterEnd = item.endIdx;
      } else if (item.startIdx < curClusterEnd) {
        curCluster.push(item);
        curClusterEnd = Math.max(curClusterEnd, item.endIdx);
      } else {
        clusters.push(curCluster);
        curCluster = [item];
        curClusterEnd = item.endIdx;
      }
    });
    if (curCluster.length > 0) {
      clusters.push(curCluster);
    }

    const layouts: Array<{ schedule: Schedule; leftPct: number; widthPct: number }> = [];

    clusters.forEach((cluster) => {
      const columns: Array<typeof slots> = [];

      cluster.forEach((item) => {
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
          const lastInCol = columns[i][columns[i].length - 1];
          if (lastInCol.endIdx <= item.startIdx) {
            columns[i].push(item);
            placed = true;
            break;
          }
        }
        if (!placed) {
          columns.push([item]);
        }
      });

      const colCount = Math.max(columns.length, 1);
      columns.forEach((col, colIdx) => {
        col.forEach((entry) => {
          layouts.push({
            schedule: entry.schedule,
            leftPct: (colIdx / colCount) * 100,
            widthPct: (1 / colCount) * 100,
          });
        });
      });
    });

    return layouts;
  };

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const shouldShowSkeleton = !hasCachedData(overviewCacheKey);
      try {
        setIsLoading(shouldShowSkeleton);

        const data = await loadCachedData<SchedulingOverviewData>(overviewCacheKey, async () => {
          const response = await api.get<InitialDataResponse>('/initial-data');
          const d = response.data || {};

          return {
            schedules: Array.isArray(d.schedules) ? d.schedules : [],
            rooms: Array.isArray(d.rooms) ? d.rooms : [],
            sections: Array.isArray(d.sections) ? d.sections : [],
            faculties: Array.isArray(d.faculties) ? d.faculties : [],
            subjects: Array.isArray(d.subjects) ? d.subjects : (Array.isArray((d as any).courses) ? (d as any).courses : []),
            activeTerm: d.active_term || null,
          };
        });

        if (!active) return;
        setSchedules(data.schedules);
        setRooms(data.rooms);
        setSections(data.sections);
        setFaculties(data.faculties);
        setSubjects(data.subjects);
        setActiveTerm(data.activeTerm);
      } catch {
        if (active) {
          setIsLoading(false);
        }
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
  }, [overviewCacheKey]);

  // Scoped Department Entities
  const visibleSections = useMemo(() => {
    if (!user?.department_id) return sections;
    return sections.filter(section => !section.department_id || Number(section.department_id) === Number(user.department_id));
  }, [sections, user?.department_id]);

  const visibleRooms = useMemo(() => {
    if (!user?.department_id) return rooms;
    return rooms.filter(room => !room.department_id || Number(room.department_id) === Number(user.department_id));
  }, [rooms, user?.department_id]);

  const visibleSubjects = useMemo(() => {
    if (!user?.department_id) return subjects;
    return subjects.filter(subject => !subject.department_id || Number(subject.department_id) === Number(user.department_id));
  }, [subjects, user?.department_id]);

  const visibleSectionIds = useMemo(() => new Set(visibleSections.map(section => section.id)), [visibleSections]);

  const visibleSchedules = useMemo(() => schedules.filter(schedule => {
    const matchesActiveTerm = !activeTerm?.id || Number(schedule.term_id) === Number(activeTerm.id);
    return matchesActiveTerm && (visibleSectionIds.has(schedule.section_id) || (user?.department_id && Number(schedule.department_id) === Number(user.department_id)));
  }), [activeTerm?.id, schedules, visibleSectionIds, user?.department_id]);

  // Calendar filtered schedules
  const calendarFilteredSchedules = useMemo(() => {
    let deptSchedules = visibleSchedules;

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
  }, [visibleSchedules, filterDay, searchQuery]);

  const calendarTotalClasses = calendarFilteredSchedules.length;
  const calendarRoomsInUse = useMemo(() => {
    const used = new Set(calendarFilteredSchedules.map(s => s.room_id).filter(Boolean));
    return used.size;
  }, [calendarFilteredSchedules]);
  const calendarAvailableRooms = useMemo(() => {
    return Math.max(0, visibleRooms.length - calendarRoomsInUse);
  }, [visibleRooms, calendarRoomsInUse]);

  const {
    draftingProgress,
    yearLevels,
    stageCounts,
  } = useDepartmentScheduleStatus(user?.department_id);

  // Overall Statistics for Donuts
  const overallStats = useMemo(() => {
    let approvedCount = 0;
    let pendingCount = 0;
    let draftCount = 0;
    let rejectedCount = 0;

    visibleSchedules.forEach(s => {
      const status = (s.status || '').toLowerCase();
      if (status === 'approved' || status === 'approved_by_dean') {
        approvedCount++;
      } else if (status === 'submitted' || status === 'pending') {
        pendingCount++;
      } else if (status === 'rejected') {
        rejectedCount++;
      } else {
        draftCount++;
      }
    });

    const total = visibleSchedules.length;
    const progressPercent = total > 0 ? Math.round((approvedCount / total) * 100) : 0;

    return { approvedCount, pendingCount, draftCount, rejectedCount, progressPercent };
  }, [visibleSchedules]);

  // Faculty Teaching Load Stats
  const facultyStats = useMemo(() => {
    const list = user?.department_id
      ? faculties.filter(f => f.department_id !== null && Number(f.department_id) === Number(user.department_id))
      : faculties;

    let available = 0;
    let fullyLoaded = 0;
    let overloaded = 0;
    let probono = 0;

    list.forEach((f) => {
      const required = f.max_units - (f.deload_units || 0);
      const assigned = f.assigned_units || 0;

      if ((f.probono_units || 0) > 0) {
        probono++;
      } else if (assigned > required) {
        overloaded++;
      } else if (assigned === required && required > 0) {
        fullyLoaded++;
      } else {
        available++;
      }
    });

    return { total: list.length, available, fullyLoaded, overloaded, probono };
  }, [faculties, user?.department_id]);

  const pendingApprovals = visibleSchedules.filter(schedule => schedule.status === 'submitted' || schedule.status === 'pending').length;

  return (
    <div className="space-y-5 pb-8 transition-opacity duration-200 font-sans">
      {/* ── Top Header Section (Clean without banner) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-muted text-xs tracking-wider uppercase">Home / Dashboard</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#1f2937]">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Department scheduling activity, room assignments, and faculty workloads.</p>
        </div>
        {activeTerm && (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-bold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active Term: {activeTerm.term_name}
          </div>
        )}
      </div>

      {/* Notice Pill */}
      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
        pendingApprovals > 0
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}>
        <Bell className={`h-5 w-5 flex-shrink-0 ${pendingApprovals > 0 ? 'text-amber-600' : 'text-emerald-500'}`} />
        <span>
          {pendingApprovals > 0
            ? `${pendingApprovals} schedule${pendingApprovals === 1 ? '' : 's'} currently in progress or awaiting endorsement.`
            : 'All clear — department academic timetable operations are running normally.'}
        </span>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch animate-pulse">
          {/* Left Column Skeleton */}
          <div className="xl:col-span-6 space-y-4 flex flex-col h-full">
            {/* 2x2 Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-3.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white p-4 rounded-2xl border border-gray-150 shadow-sm min-h-[88px] flex flex-col justify-between">
                  <Skeleton className="h-3 w-20" />
                  <div className="flex justify-between items-center mt-2">
                    <Skeleton className="h-7 w-10" />
                    <Skeleton className="h-4 w-4 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
            {/* Timetable / Section Summary Skeleton Card */}
            <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-5 flex-1 min-h-[380px] space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-6 w-24 rounded-lg" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-xl" />
                ))}
              </div>
            </div>
          </div>

          {/* Right Column Skeleton */}
          <div className="xl:col-span-6 space-y-4 flex flex-col h-full">
            {/* 2 Separate Cards Side-by-Side: Schedule Status & Faculty Load */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Schedule Status Card Skeleton */}
              <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-5 space-y-4 min-h-[240px]">
                <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <div className="flex items-center justify-center py-2">
                  <Skeleton className="h-28 w-28 rounded-full" />
                </div>
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>

              {/* Faculty Load Card Skeleton */}
              <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-5 space-y-4 min-h-[240px]">
                <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <div className="flex items-center justify-center py-2">
                  <Skeleton className="h-28 w-28 rounded-full" />
                </div>
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            </div>

            {/* Bottom Room Usage Card Skeleton */}
            <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-5 flex-1 min-h-[260px] space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-6 w-24 rounded-lg" />
              </div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Main Dashboard Grid matching VPAA schematic */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
          
          {/* ═══════════════════════════════════════════════════════════
              LEFT COLUMN: 2x2 CARDS -> TABLE (TIMETABLE)
             ═══════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-6 space-y-4 flex flex-col h-full">
            
            {/* 1. 2x2 CARDS Grid (4 Metric Cards) */}
            <div className="grid grid-cols-2 gap-3.5">
              {/* Card 1: Sections */}
              <div
                onClick={() => navigate('/secretary/sections')}
                className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer min-h-[90px]"
              >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Sections</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-gray-900">{visibleSections.length}</span>
                  <Layers className="w-4.5 h-4.5 text-[#5A1220]/70" />
                </div>
              </div>

              {/* Card 2: Faculty */}
              <div
                onClick={() => navigate('/secretary/instructors')}
                className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer min-h-[90px]"
              >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Total Faculty</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-gray-900">{facultyStats.total}</span>
                  <GraduationCap className="w-4.5 h-4.5 text-[#5A1220]/70" />
                </div>
              </div>

              {/* Card 3: Courses */}
              <div
                onClick={() => navigate('/secretary/curricula')}
                className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer min-h-[90px]"
              >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Curriculum Courses</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-gray-900">{visibleSubjects.length}</span>
                  <BookOpen className="w-4.5 h-4.5 text-[#5A1220]/70" />
                </div>
              </div>

              {/* Card 4: Classrooms */}
              <div
                onClick={() => navigate('/secretary/rooms')}
                className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-all cursor-pointer min-h-[90px]"
              >
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Classrooms</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-2xl font-black text-gray-900">{visibleRooms.length}</span>
                  <DoorOpen className="w-4.5 h-4.5 text-[#5A1220]/70" />
                </div>
              </div>
            </div>

            {/* 2. TABLE: Overall Department Schedule Timetable */}
            {(() => {
              const timetableElement = (
                <div
                  className={`${
                    isFullscreen
                      ? 'fixed inset-0 z-[999999] bg-white p-4 sm:p-6 flex flex-col w-screen h-screen m-0 top-0 left-0 right-0 bottom-0 overflow-hidden box-border select-none'
                      : 'bg-white p-5 rounded-2xl border border-gray-200 shadow-sm font-sans flex-1 flex flex-col justify-between'
                  }`}
                  style={isFullscreen ? { top: 0, left: 0, width: '100vw', height: '100vh', margin: 0 } : undefined}
                >
                  {/* Table Header Controls */}
                  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 border-b border-gray-150 pb-3 flex-shrink-0">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4.5 h-4.5 text-[#5A1220]" />
                        <h2 className="text-gray-850 font-bold text-base leading-none">
                          Department Academic Timetable
                        </h2>
                      </div>
                      
                      {/* Action Filters */}
                      <div className="flex flex-wrap items-center gap-2">
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
                        title={isFullscreen ? "Exit Full Window (Esc)" : "Full Window View"}
                      >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                      </button>

                      {/* Reset Button */}
                      {(filterDay !== todayShort || searchQuery !== '') && (
                        <button
                          onClick={() => {
                            setFilterDay(todayShort);
                            setSearchQuery('');
                          }}
                          className="p-1.5 text-gray-500 hover:text-[#5A1220] hover:bg-red-50 hover:border-red-200 rounded-xl transition-all cursor-pointer border border-gray-200 bg-white shadow-sm flex items-center justify-center shrink-0"
                          title="Reset Filters"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact Metrics Strip */}
                  <div className="flex items-center justify-between text-xs py-2 px-1 border-b border-gray-100 text-gray-500 font-semibold flex-shrink-0">
                    <span className="text-[11px] font-bold text-gray-800">
                      {calendarTotalClasses} {calendarTotalClasses === 1 ? 'Class Scheduled' : 'Classes Scheduled'}
                    </span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {calendarAvailableRooms} Available Rooms
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        {calendarRoomsInUse} In Use
                      </span>
                    </div>
                  </div>

                  {/* Timetable Grid (Sunday to Saturday, 7:00 AM - 7:00 PM, 30-min slots) */}
                  <div className="mt-2 flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="overflow-x-auto overflow-y-auto rounded-xl border border-gray-200 shadow-inner flex-1 flex flex-col h-full bg-white relative scrollbar-thin">
                      <div className="min-w-[850px] bg-white relative flex flex-row flex-1">
                        {/* Time Axis Column */}
                        <div className="w-20 shrink-0 sticky left-0 z-20 bg-gray-50/70 select-none border-r border-gray-200">
                          <div className="sticky top-0 z-20 h-9 border-b border-gray-200 bg-gray-100/90 text-gray-500 font-bold text-[9px] uppercase tracking-wider flex items-center justify-center">
                            Time
                          </div>
                          {timeSlots.map((slot, index) => (
                            <div
                              key={index}
                              className="h-6 border-b border-gray-100 text-[9px] text-gray-500 font-medium flex items-center justify-center"
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
                                    {daySchedules.map((schedule, scheduleIndex) => {
                                      const startIdx = parseTimeToSlotIndex(schedule.start_time);
                                      const endIdx = parseTimeToSlotIndex(schedule.end_time);
                                      const top = startIdx * 24;
                                      const height = (endIdx - startIdx) * 24;

                                      if (height <= 0) return null;

                                      const layout = layouts.find(item => item.schedule.id === schedule.id);
                                      const left = layout ? `${layout.leftPct}%` : '0%';
                                      const width = layout ? `${layout.widthPct}%` : '100%';
                                      const deptCode = schedule.section?.department?.department_code || schedule.department?.department_code || 'GEN';

                                      return (
                                        <div
                                          key={[
                                            schedule.id ?? 'schedule',
                                            schedule.section_id ?? 'section',
                                            schedule.course?.id ?? schedule.subject?.id ?? 'course',
                                            schedule.day ?? day,
                                            schedule.start_time ?? scheduleIndex,
                                            schedule.end_time ?? scheduleIndex,
                                          ].join('-')}
                                          style={{
                                            top: `${top + 1}px`,
                                            height: `${height - 2}px`,
                                            left: `calc(${left} + 2px)`,
                                            width: `calc(${width} - 4px)`,
                                          }}
                                          className={`group absolute rounded-lg border border-l-4 p-1.5 overflow-hidden text-left flex flex-col justify-between font-sans shadow-xs select-none transition-all duration-150 hover:scale-[1.02] hover:shadow-md hover:z-25 ${getDeptStyles(deptCode)}`}
                                        >
                                          <div className="space-y-0.5 min-w-0">
                                            <div className="flex items-center justify-between gap-1">
                                              <span className="font-extrabold text-[10px] leading-tight truncate">
                                                {schedule.course?.course_code || schedule.subject?.subject_code || 'N/A'}
                                              </span>
                                              <span className="text-[7.5px] font-black uppercase px-1 py-0.2 rounded bg-black/5 shrink-0">
                                                {schedule.section?.section_name || 'Sec'}
                                              </span>
                                            </div>
                                            <p className="text-[8.5px] font-semibold opacity-90 truncate leading-tight">
                                              {schedule.course?.course_name || schedule.subject?.subject_name || 'No title'}
                                            </p>
                                          </div>

                                          <div className="border-t border-black/5 pt-0.5 mt-auto flex items-center justify-between text-[7.5px] font-bold opacity-80">
                                            <span className="truncate max-w-[60%]">
                                              {schedule.faculty ? `${schedule.faculty.first_name[0]}. ${schedule.faculty.last_name}` : 'TBA'}
                                            </span>
                                            <span className="truncate">
                                              {schedule.room?.room_code || 'Room TBA'}
                                            </span>
                                          </div>

                                          {/* Hover Details Popover */}
                                          <div className={`opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none absolute w-60 p-2.5 bg-slate-900 text-white rounded-xl shadow-2xl backdrop-blur-md z-50 border border-slate-700 text-xs space-y-1.5 leading-snug ${
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
                                                  {schedule.room?.building || 'Main'} &bull; {schedule.room?.room_code || 'TBA'}
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

                  {/* Timetable Footer */}
                  <div className="border-t border-gray-100 pt-3 mt-3 flex items-center justify-between text-[11px] text-gray-400 flex-shrink-0">
                    <span>Secretary Academic Schedule Matrix</span>
                    <button
                      onClick={() => navigate('/secretary/schedules')}
                      className="font-bold text-[#5A1220] hover:underline cursor-pointer"
                    >
                      Manage Schedules &rarr;
                    </button>
                  </div>
                </div>
              );

              return isFullscreen ? createPortal(timetableElement, document.body) : timetableElement;
            })()}
          </div>

          {/* ═══════════════════════════════════════════════════════════
              RIGHT COLUMN: 2 PIE CHARTS -> BAR CHART
             ═══════════════════════════════════════════════════════════ */}
          <div className="xl:col-span-6 space-y-4 flex flex-col h-full font-sans">
            
            {/* 1. 2 PIE CHARTS Side-by-Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* PIE CHART 1: Schedule Status Distribution */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between font-sans">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="font-sans font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-[#5A1220]" />
                    Schedule Status
                  </h3>
                  <span className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">
                    Total: {visibleSchedules.length}
                  </span>
                </div>

                {/* Interactive Donut Visualization */}
                <div className="flex items-center justify-center my-4 relative">
                  <svg className="w-32 h-32 -rotate-90 transform" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f5f9" strokeWidth="10" />
                    {(() => {
                      const total = visibleSchedules.length || 1;
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
                            strokeWidth="10"
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                            className="transition-all duration-500"
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-sans">
                    <span className="text-2xl font-black text-gray-900 leading-none">{visibleSchedules.length}</span>
                    <span className="text-[8.5px] font-bold text-gray-400 uppercase tracking-wider mt-1">Schedules</span>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 font-sans">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-xs">Approved</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-2 py-0.5 bg-white rounded-md shadow-2xs border border-gray-200/60">
                      {overallStats.approvedCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-xs">Pending</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-2 py-0.5 bg-white rounded-md shadow-2xs border border-gray-200/60">
                      {overallStats.pendingCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                      <span className="font-semibold text-gray-600 text-xs">Drafts</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-2 py-0.5 bg-white rounded-md shadow-2xs border border-gray-200/60">
                      {overallStats.draftCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-xs">Rejected</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-2 py-0.5 bg-white rounded-md shadow-2xs border border-gray-200/60">
                      {overallStats.rejectedCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* PIE CHART 2: Faculty Load Distribution */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between font-sans">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <h3 className="font-sans font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-[#5A1220]" />
                    Faculty Load
                  </h3>
                  <span className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider">
                    Total: {facultyStats.total}
                  </span>
                </div>

                {/* Interactive Donut Visualization */}
                <div className="flex items-center justify-center my-4 relative">
                  <svg className="w-32 h-32 -rotate-90 transform" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f5f9" strokeWidth="10" />
                    {(() => {
                      const total = facultyStats.total || 1;
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
                            strokeWidth="10"
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                            className="transition-all duration-500"
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none font-sans">
                    <span className="text-2xl font-black text-gray-900 leading-none">{facultyStats.total}</span>
                    <span className="text-[8.5px] font-bold text-gray-400 uppercase tracking-wider mt-1">Faculty</span>
                  </div>
                </div>

                {/* Donut Legend */}
                <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 font-sans">
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-xs">Available</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-2 py-0.5 bg-white rounded-md shadow-2xs border border-gray-200/60">
                      {facultyStats.available}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-xs">Loaded</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-2 py-0.5 bg-white rounded-md shadow-2xs border border-gray-200/60">
                      {facultyStats.fullyLoaded}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-xs">Overload</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-2 py-0.5 bg-white rounded-md shadow-2xs border border-gray-200/60">
                      {facultyStats.overloaded}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50/80 border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                      <span className="font-semibold text-gray-600 text-xs">Pro Bono</span>
                    </div>
                    <span className="font-bold text-gray-900 text-xs px-2 py-0.5 bg-white rounded-md shadow-2xs border border-gray-200/60">
                      {facultyStats.probono}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. BAR CHART: Section Scheduling Readiness & Progress (Fits without scrolling) */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 mb-3">
                  <div>
                    <h3 className="font-sans font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-[#5A1220]" />
                      Section Scheduling Progress
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">Section readiness & approval completion across year levels</p>
                  </div>
                  <span className="text-xs font-black text-[#5A1220] bg-red-50 px-2.5 py-1 rounded-xl border border-red-100">
                    {draftingProgress}% Completed
                  </span>
                </div>

                {/* Section / Year Level Progress Bars */}
                <div className="space-y-2">
                  {(yearLevels && yearLevels.length > 0 ? yearLevels : [
                    { id: 1, label: '1st Year', totalSections: visibleSections.filter(s => s.section_name.includes('1')).length || 2, scheduledSections: 2, isComplete: true, percent: 100 },
                    { id: 2, label: '2nd Year', totalSections: visibleSections.filter(s => s.section_name.includes('2')).length || 2, scheduledSections: 2, isComplete: true, percent: 100 },
                    { id: 3, label: '3rd Year', totalSections: visibleSections.filter(s => s.section_name.includes('3')).length || 2, scheduledSections: 1, isComplete: false, percent: 50 },
                    { id: 4, label: '4th Year', totalSections: visibleSections.filter(s => s.section_name.includes('4')).length || 2, scheduledSections: 0, isComplete: false, percent: 0 },
                  ]).map((lvl: any) => {
                    const isCompleted = lvl.isComplete || lvl.percent === 100;
                    return (
                      <div key={lvl.id} className="space-y-1 pb-1.5 border-b border-gray-100 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-gray-900 w-20 text-xs">{lvl.label}</span>
                            <span className="text-[11px] text-gray-500 truncate max-w-[180px]">
                              {lvl.totalSections} Sections
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400">
                              {lvl.scheduledSections || 0}/{lvl.totalSections || 0} Ready
                            </span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                              isCompleted
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {lvl.percent || 0}%
                            </span>
                          </div>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden flex">
                          <div
                            style={{ width: `${lvl.percent || 0}%` }}
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

              {/* Footer aligned flush with Timetable bottom */}
              <div className="border-t border-gray-100 pt-3 mt-3 flex items-center justify-between text-[11px] text-gray-400">
                <span>Department Sections: {visibleSections.length}</span>
                <button
                  onClick={() => navigate('/secretary/schedules')}
                  className="font-bold text-[#5A1220] hover:underline cursor-pointer"
                >
                  Manage Schedules &rarr;
                </button>
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
