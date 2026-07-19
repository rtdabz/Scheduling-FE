import React, { useState, useEffect, useMemo } from 'react';
import { useTour } from '../../hooks/useTour';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useNavigate } from 'react-router-dom';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
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
  Bell,
  FileBarChart,
  CheckSquare
} from 'lucide-react';

interface Faculty {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  assigned_units?: number;
  department_id: number;
  department?: {
    id: number;
    department_name: string;
    department_code: string;
  } | null;
  status: string;
}

interface Section {
  id: number;
  section_name: string;
  department_id: number;
  year_level: number;
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

interface SectionProgressItem {
  id: number;
  section_name: string;
  year_level: number;
  status: string;
  statusColor: string;
}

interface StoredUser {
  id?: number;
  name?: string;
  department_id?: number;
  role?: string;
}

interface DashboardData {
  faculties: Faculty[];
  sections: Section[];
  subjects: Subject[];
  schedules: Schedule[];
  activeTerm: Term | null;
}

export default function ProgramHeadDashboardPage() {
  useTour();
  const { toast } = useToast();
  const navigate = useNavigate();

  // User
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const dashboardCacheKey = `dashboard:${user?.role ?? 'program_head'}:${user?.id ?? user?.department_id ?? 'current'}`;
  const cachedDashboardData = getCachedData<DashboardData>(dashboardCacheKey);
  const [isLoading, setIsLoading] = useState(!hasCachedData(dashboardCacheKey));

  // States
  const [faculties, setFaculties] = useState<Faculty[]>(cachedDashboardData?.faculties ?? []);
  const [sections, setSections] = useState<Section[]>(cachedDashboardData?.sections ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cachedDashboardData?.subjects ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cachedDashboardData?.schedules ?? []);
  const [activeTerm, setActiveTerm] = useState<Term | null>(cachedDashboardData?.activeTerm ?? null);

  // Hook for department schedules stage counts
  const {
    draftingProgress,
    stageCounts,
  } = useDepartmentScheduleStatus(user?.department_id);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const shouldShowSkeleton = !hasCachedData(dashboardCacheKey);
      try {
        setIsLoading(shouldShowSkeleton);
        const data = await loadCachedData<DashboardData>(dashboardCacheKey, async () => {
          const [
            facultiesRes,
            sectionsRes,
            subjectsRes,
            schedulesRes,
            activeTermRes
          ] = await Promise.all([
            api.get<Faculty[]>('/faculties'),
            api.get<Section[]>('/sections'),
            api.get<Subject[]>('/subjects'),
            api.get<Schedule[]>('/schedules'),
            api.get<Term>('/terms/active')
          ]);

          return {
            faculties: facultiesRes.data,
            sections: sectionsRes.data,
            subjects: subjectsRes.data,
            schedules: schedulesRes.data,
            activeTerm: activeTermRes.data,
          };
        });

        if (!active) return;
        setFaculties(data.faculties);
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

  // ── 2. Filtered Program Head Data ──
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

  const deptSchedulesCount = useMemo(() => {
    if (!user?.department_id) return 0;
    return schedules.filter(s => {
      const sec = sections.find(x => x.id === s.section_id);
      const matchesDepartment = sec && Number(sec.department_id) === Number(user.department_id);
      const matchesActiveTerm = !activeTerm?.id || Number(s.term_id) === Number(activeTerm.id);
      return matchesDepartment && matchesActiveTerm;
    }).length;
  }, [activeTerm?.id, schedules, sections, user?.department_id]);

  // ── 3. Stage Specific Program Statistics ──
  const programStats = useMemo(() => {
    let pending = 0;
    let approved = 0;

    deptSections.forEach(sec => {
      const val = scheduleStatusMap.get(sec.id);
      if (val) {
        if (val.status === 'submitted' || val.status === 'approved_by_dean') {
          pending++;
        } else if (val.status === 'approved') {
          approved++;
        }
      }
    });

    return { pending, approved };
  }, [deptSections, scheduleStatusMap]);

  // ── 4. Faculty Teaching Load Overview ──
  const processedFaculties = useMemo(() => {
    let list = [...deptFaculties];
    // Sort by load descending
    list.sort((a, b) => {
      const pctA = (a.assigned_units || 0) / (a.max_units || 21);
      const pctB = (b.assigned_units || 0) / (b.max_units || 21);
      return pctB - pctA;
    });
    return list.slice(0, 3);
  }, [deptFaculties]);

  // ── 5. Section Specific Progress List ──
  const sectionProgressList = useMemo<SectionProgressItem[]>(() => {
    return deptSections.map(sec => {
      const val = scheduleStatusMap.get(sec.id);
      const status = val ? val.status : 'draft';

      let statusColor = 'bg-gray-150 text-gray-500 border border-gray-200';
      if (status === 'submitted') {
        statusColor = 'bg-amber-50 text-amber-700 border border-amber-250';
      } else if (status === 'approved_by_dean') {
        statusColor = 'bg-blue-50 text-blue-700 border border-blue-200';
      } else if (status === 'approved') {
        statusColor = 'bg-emerald-50 text-emerald-700 border border-emerald-250';
      }

      return {
        id: sec.id,
        section_name: sec.section_name,
        year_level: sec.year_level,
        status: status === 'approved_by_dean' ? 'Dean Approved' : status,
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
          <p className="mt-1 text-sm text-slate-500">Program-level overview of sections, subjects, and scheduling progress.</p>
        </div>
        {activeTerm && (
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-bold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active Term: {activeTerm.term_name}
          </div>
        )}
      </div>

      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
        programStats.pending > 0
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}>
        <Bell className={`h-5 w-5 flex-shrink-0 ${programStats.pending > 0 ? 'text-amber-600' : 'text-emerald-500'}`} />
        <span>
          {programStats.pending > 0
            ? `${programStats.pending} schedule${programStats.pending === 1 ? '' : 's'} currently require attention.`
            : 'All clear — no action items require attention right now.'}
        </span>
      </div>

      {/* Greeting Banner */}
      <div className="bg-[#5A1220] py-3 px-5 rounded-xl text-white border border-[#5A1220]/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-md">
        <div>
          <h1 className="font-sans text-lg font-bold tracking-tight text-white">
            Welcome back, <span className="text-[#F5A623]">{user?.name || 'Program Head'}</span>
          </h1>
          <p className="text-[#E2D9D0] text-xs mt-1">Program Head Dashboard &mdash; monitor your assigned program</p>
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
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Faculty</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{deptFaculties.length}</span>
                <GraduationCap className="w-4 h-4 text-[#5A1220]/60" />
              </div>
            </div>

            {/* Total Sections */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">Sections</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-gray-900">{deptSections.length}</span>
                <Layers className="w-4 h-4 text-[#5A1220]/60" />
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

            {/* Pending Schedules */}
            <div className="bg-white p-4 rounded-xl border border-amber-250 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-amber-50/10">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider truncate">Pending</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-amber-700">{programStats.pending}</span>
                <Clock className="w-4 h-4 text-[#F5A623]" />
              </div>
            </div>

            {/* Approved Schedules */}
            <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-emerald-50/10">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider truncate">Approved</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-emerald-700">{programStats.approved}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            </div>

            {/* Program Completion Percentage */}
            <div className="bg-white p-4 rounded-xl border border-[#5A1220]/25 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow bg-[#5A1220]/5">
              <span className="text-[10px] font-bold text-[#5A1220] uppercase tracking-wider truncate">Completion</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-2xl font-extrabold text-[#7B1113]">{draftingProgress}%</span>
                <TrendingUp className="w-4 h-4 text-[#5A1220]" />
              </div>
            </div>
          </div>

          {/* Widgets Grid Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Widget 1: Program Schedule Progress */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[340px]">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-6">
                  <TrendingUp className="w-5 h-5 text-[#5A1220]" />
                  <span>Program Schedule Progress</span>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-500">Drafting Readiness</span>
                      <span className="font-bold text-[#5A1220] text-sm">{draftingProgress}%</span>
                    </div>
                    <div className="h-3.5 w-full bg-gray-100 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${draftingProgress}%` }}
                        className="bg-[#5A1220] h-full rounded-full transition-all duration-500"
                      />
                    </div>
                  </div>

                  {/* Stage counts overview */}
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
                <span>Active semester details</span>
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
                  {processedFaculties.length === 0 ? (
                    <p className="text-center text-gray-400 text-xs py-8">No department instructors found.</p>
                  ) : (
                    processedFaculties.map(f => {
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

                      const isProBono = (f as any).probono_units && Number((f as any).probono_units) > 0;
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
                  onClick={() => navigate('/program_head/faculty')}
                  className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Manage faculty teaching load &rarr;
                </button>
              </div>
            </div>

            {/* Widget 3: Section Progress */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between min-h-[340px]">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-5">
                  <Layers className="w-5 h-5 text-[#5A1220]" />
                  <span>Section Progress</span>
                </div>

                <div className="space-y-3.5 max-h-[200px] overflow-y-auto pr-1">
                  {sectionProgressList.length === 0 ? (
                    <div className="py-8 text-center text-gray-400 text-xs">
                      No section classes registered.
                    </div>
                  ) : (
                    sectionProgressList.slice(0, 4).map(sec => (
                      <div key={sec.id} className="p-3 bg-gray-50 border border-gray-150 rounded-xl flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <p className="font-bold text-gray-800">{sec.section_name}</p>
                          <p className="text-[10px] text-gray-400">Year {sec.year_level}</p>
                        </div>
                        <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase border ${sec.statusColor}`}>
                          {sec.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-150 mt-4 flex justify-end">
                <button
                  onClick={() => navigate('/program_head/schedules')}
                  className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline"
                >
                  View scheduling panel &rarr;
                </button>
              </div>
            </div>
          </div>

          {/* Lower Widgets Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Widget 5: Department/Program Schedule Status */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm min-h-[340px] flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-5">
                  <Building2Icon className="w-5 h-5 text-[#5A1220]" />
                  <span>Program Schedule Status</span>
                </div>

                <div className="space-y-6">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    This overview tracks the final schedule compilation of student sections in your program. Senders are verified 
                    and validated against conflict constraints before submission. 
                  </p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Drafts</p>
                      <p className="text-2xl font-extrabold text-gray-800 mt-1">{stageCounts?.draft ?? 0}</p>
                    </div>
                    <div className="p-4 bg-amber-50/10 border border-amber-250 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-amber-600 uppercase">Submitted</p>
                      <p className="text-2xl font-extrabold text-amber-700 mt-1">{stageCounts?.submitted ?? 0}</p>
                    </div>
                    <div className="p-4 bg-blue-50/10 border border-blue-200 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-blue-600 uppercase">Dean Approved</p>
                      <p className="text-2xl font-extrabold text-blue-700 mt-1">{stageCounts?.approved_by_dean ?? 0}</p>
                    </div>
                    <div className="p-4 bg-emerald-50/10 border border-emerald-250 rounded-xl text-center">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase">VPAA Approved</p>
                      <p className="text-2xl font-extrabold text-emerald-700 mt-1">{stageCounts?.approved ?? 0}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-150 mt-4 flex justify-between text-[11px] font-semibold text-gray-400">
                <span>Scheduling readiness: {draftingProgress}%</span>
                <span>Active Semester stats</span>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm min-h-[340px] flex flex-col justify-between">
              <div>
                <h2 className="text-gray-800 font-bold text-lg mb-5">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => navigate('/program_head/schedules')}
                    className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                  >
                    <CheckSquare className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold">Scheduler Panel</span>
                  </button>
                  <button
                    onClick={() => navigate('/program_head/schedules')}
                    className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                  >
                    <CalendarDays className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold">Schedule Viewer</span>
                  </button>
                  <button
                    onClick={() => navigate('/program_head/faculty')}
                    className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                  >
                    <Users className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold">Faculty</span>
                  </button>
                  <button
                    onClick={() => navigate('/program_head/faculty')}
                    className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                  >
                    <TrendingUp className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold">Teaching Load</span>
                  </button>
                  <button
                    onClick={() => navigate('/program_head/reports')}
                    className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] flex flex-col items-center justify-center gap-2 cursor-pointer shadow-sm group text-center"
                  >
                    <FileBarChart className="w-5 h-5 text-[#5A1220] group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold">Reports</span>
                  </button>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100 flex justify-end text-[11px] text-gray-400">
                <span>View controls &rarr;</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple fallback icon to avoid import issues
function Building2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}
