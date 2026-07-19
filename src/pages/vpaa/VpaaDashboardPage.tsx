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
  room_id?: number | null;
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
}

interface Room {
  id: number;
  room_code: string;
  room_name?: string;
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

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const shouldShowSkeleton = !hasCachedData(dashboardCacheKey);
      try {
        setIsLoading(shouldShowSkeleton);
        const data = await loadCachedData<DashboardData>(dashboardCacheKey, async () => {
          const [
            schedulesRes,
            roomsRes,
            sectionsRes,
            facultiesRes,
            departmentsRes,
            subjectsRes,
            activeTermRes
          ] = await Promise.all([
            api.get<Schedule[]>('/schedules'),
            api.get<Room[]>('/rooms'),
            api.get<Section[]>('/sections'),
            api.get<Faculty[]>('/faculties'),
            api.get<Department[]>('/departments'),
            api.get<Subject[]>('/subjects'),
            api.get<Term>('/terms/active')
          ]);

          return {
            schedules: schedulesRes.data,
            rooms: roomsRes.data,
            sections: sectionsRes.data,
            faculties: facultiesRes.data,
            departments: departmentsRes.data,
            subjects: subjectsRes.data,
            activeTerm: activeTermRes.data,
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
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
          {/* Summary Metric Cards (9 Cards Grid) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-3">
            {/* Total Departments */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Departments</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{departments.length}</span>
                <Building2 className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Total Faculty */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Total Faculty</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{faculties.length}</span>
                <GraduationCap className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Total Sections */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Sections</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{sections.length}</span>
                <Layers className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Total Subjects */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Subjects</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{subjects.length}</span>
                <BookOpen className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Classrooms */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Classrooms</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{rooms.length}</span>
                <DoorOpen className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Schedules */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Schedules</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{totalSchedules}</span>
                <CalendarDays className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Pending Dean Approvals */}
            <div className="bg-white p-4 rounded-xl border border-amber-250 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-amber-50/10">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider truncate">Pending Dean</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-amber-700">{summaryMetrics.pendingDean}</span>
                <Clock className="w-4 h-4 text-[#F5A623]" />
              </div>
            </div>

            {/* Pending VPAA Approvals */}
            <div className="bg-white p-4 rounded-xl border border-[#5A1220]/25 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-red-50/5">
              <span className="text-[10px] font-bold text-[#5A1220] uppercase tracking-wider truncate">Pending VPAA</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-[#7B1113]">{summaryMetrics.pendingVpaa}</span>
                <Clock className="w-4 h-4 text-[#5A1220]" />
              </div>
            </div>

            {/* Approved Schedules */}
            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-emerald-50/10">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider truncate">Approved</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-emerald-700">{summaryMetrics.approved}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
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

              <div className="pt-4 border-t border-gray-150 flex justify-end">
                <button
                  onClick={() => navigate('/faculty')}
                  className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Manage workload distribution &rarr;
                </button>
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

          {/* Department Status Overview Section (Widget 1 & 5) */}
          <div className="space-y-3">
            <h2 className="text-gray-800 font-bold text-lg flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#5A1220]" />
              Department Status Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {departmentStats.length === 0 ? (
                <div className="col-span-full bg-white p-8 border border-gray-200 rounded-2xl text-center">
                  <p className="text-gray-400 text-sm">No department data has been registered.</p>
                </div>
              ) : (
                departmentStats.map(dept => {
                  let badgeStyles = 'bg-gray-100 text-gray-500 border border-gray-200';
                  if (dept.approvalStatus === 'VPAA Approved') {
                    badgeStyles = 'bg-emerald-50 text-emerald-700 border border-emerald-250';
                  } else if (dept.approvalStatus === 'Pending Review') {
                    badgeStyles = 'bg-amber-50 text-amber-700 border border-amber-250';
                  } else if (dept.approvalStatus === 'Partially Approved') {
                    badgeStyles = 'bg-blue-50 text-blue-700 border border-blue-200';
                  }

                  return (
                    <div key={dept.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded border uppercase">
                            {dept.department_code}
                          </span>
                          <h3 className="text-sm font-bold text-gray-800 mt-2 truncate max-w-[180px]" title={dept.department_name}>
                            {dept.department_name}
                          </h3>
                        </div>
                        <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${badgeStyles}`}>
                          {dept.approvalStatus}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {/* Summary breakdown mini logs */}
                        <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500 font-semibold">
                          <div>
                            <p className="text-[9px] text-gray-400 uppercase">Sections</p>
                            <p className="text-gray-800 font-bold mt-0.5">{dept.sectionsCount}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400 uppercase">Completed</p>
                            <p className="text-emerald-600 font-bold mt-0.5">{dept.completedCount}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400 uppercase">Pending</p>
                            <p className="text-amber-600 font-bold mt-0.5">{dept.pendingCount}</p>
                          </div>
                        </div>

                        {/* Progress slider bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[9px] font-bold text-gray-400">
                            <span>PROGRESS</span>
                            <span>{dept.progressPercent}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${dept.progressPercent}%` }}
                              className="bg-[#5A1220] h-full rounded-full transition-all duration-300"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <ActivityFeed
            title="Notifications"
            icon={ClipboardList}
            items={notificationItems}
            emptyMessage="No scheduling notifications yet."
            actionLabel={unreadCount > 0 ? 'Mark all as read ->' : 'Open approval queue ->'}
            onAction={() => {
              if (unreadCount > 0) {
                void markAllAsRead();
                return;
              }

              navigate('/schedules/approval');
            }}
            unreadCount={unreadCount}
          />

          {/* Quick Actions & Shortcut Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Quick Actions Card */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-3">
              <h2 className="text-gray-800 font-bold text-lg">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => navigate('/schedules/approval')}
                  className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                >
                  <CheckSquare className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold">Schedule Approval</span>
                </button>
                <button
                  onClick={() => navigate('/schedules')}
                  className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                >
                  <CalendarDays className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold">Schedule Viewer</span>
                </button>
                <button
                  onClick={() => navigate('/faculty')}
                  className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                >
                  <Users className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold">Teaching Load</span>
                </button>
                <button
                  onClick={() => navigate('/reports')}
                  className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                >
                  <FileBarChart className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold">Reports</span>
                </button>
                <button
                  onClick={handleExportSchedules}
                  className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                >
                  <Download className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold">Export Schedule</span>
                </button>
                <button
                  onClick={handleExportFacultyLoad}
                  className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                >
                  <Download className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold">Export Faculty Load</span>
                </button>
              </div>
            </div>

            {/* Quick overview note/description text */}
            <div className="lg:col-span-2 bg-[#5A1220]/5 border border-[#5A1220]/15 p-4 rounded-xl flex flex-col justify-between">
              <div className="space-y-3">
                <h3 className="text-[#5A1220] font-extrabold text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#5A1220]" />
                  Academic Scheduling Guidelines (VPAA Review)
                </h3>
                <p className="text-gray-600 text-xs leading-relaxed">
                  As VPAA, you are responsible for the final review and publication of the academic schedule for the active term. 
                  Schedules submitted by department heads must pass through their respective Deans for initial verification before 
                  appearing in your VPAA Approval Queue. 
                </p>
                <p className="text-gray-600 text-xs leading-relaxed">
                  Ensure all faculty members conform to their maximum allowable units. Overloaded and Pro Bono workloads should be 
                  vetted against university policies prior to issuing final approvals.
                </p>
              </div>
              <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400 mt-4 pt-4 border-t border-[#5A1220]/10">
                <span>Tagoloan Community College Scheduling Engine</span>
                <span className="text-[#5A1220] hover:underline cursor-pointer" onClick={() => navigate('/settings')}>
                  System Config &rarr;
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
