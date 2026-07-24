import { useState, useEffect, useMemo } from 'react';
import { useTour } from '../../hooks/useTour';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useNavigate } from 'react-router-dom';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { useSystemNotifications } from '../../hooks/useSystemNotifications';
import { ActivityFeed } from '../../components/overview';
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
  Building2
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
  room_id?: number | null;
  status: string;
  updated_at?: string;
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
  useTour();
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
    <div className="space-y-5 pb-8 transition-all duration-200 font-sans bg-gray-50/20">
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
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Subjects</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{deptSubjects.length}</span>
                <BookOpen className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Total Schedules */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
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

              navigate('/dean/schedules/approval');
            }}
            unreadCount={unreadCount}
          />

          {/* Quick Actions Panel */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-4">
            <h2 className="text-gray-800 font-bold text-lg">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <button
                onClick={() => navigate('/dean/schedules/approval')}
                className="p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2.5 cursor-pointer shadow-sm group text-center"
              >
                <CheckSquare className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Schedule Approval</span>
              </button>
              <button
                onClick={() => navigate('/dean/schedules')}
                className="p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2.5 cursor-pointer shadow-sm group text-center"
              >
                <Layers className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Scheduler Panel</span>
              </button>
              <button
                onClick={() => navigate('/dean/schedules')}
                className="p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2.5 cursor-pointer shadow-sm group text-center"
              >
                <CalendarDays className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Schedule Viewer</span>
              </button>
              <button
                onClick={() => navigate('/dean/faculty')}
                className="p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2.5 cursor-pointer shadow-sm group text-center"
              >
                <TrendingUp className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Teaching Load</span>
              </button>
              <button
                onClick={() => navigate('/dean/faculty')}
                className="p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2.5 cursor-pointer shadow-sm group text-center"
              >
                <Users className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Faculty Management</span>
              </button>
              <button
                onClick={() => navigate('/dean/reports')}
                className="p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2.5 cursor-pointer shadow-sm group text-center"
              >
                <FileBarChart className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold">Reports</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
