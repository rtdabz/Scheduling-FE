import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CalendarDays, 
  DoorOpen, 
  ClipboardList,
  Clock,
  Layers,
  Users,
  BookOpen,
  TrendingUp,
  ArrowRight,
  CalendarPlus,
  AlertTriangle
} from 'lucide-react';
import { useTour } from '../../hooks/useTour';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';

interface Schedule {
  id: number;
  term_id: number;
  section_id: number;
  room_id?: number | null;
  status: string;
}

interface Room {
  id: number;
  room_code: string;
  room_name?: string;
  room_type: string;
}

interface Section {
  id: number;
  section_name: string;
}

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

interface Subject {
  id: number;
  subject_code: string;
  subject_name: string;
}

interface Term {
  id: number;
  term_name: string;
  status: string;
}

interface ActivityLog {
  id: number;
  action: string;
  timestamp: string;
}

interface SectionStatus {
  id: number;
  section_name: string;
  status: string;
}

const mockActivities: ActivityLog[] = [
  { id: 1, action: "You submitted BSCS 4A for approval", timestamp: "2 hours ago" },
  { id: 2, action: "You added CS 401 to BSCS 4A schedule", timestamp: "4 hours ago" },
  { id: 3, action: "Room 101 was assigned to BSIT 2B", timestamp: "5 hours ago" },
  { id: 4, action: "Draft schedule created for BSIT 3A", timestamp: "1 day ago" },
  { id: 5, action: "Logged in to admin portal", timestamp: "2 days ago" },
];

export default function SecretaryDashboardPage() {
  useTour();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  
  // User info
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as { name?: string; department_id?: number; role?: string }) : null;

  // Stats State
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeTerm, setActiveTerm] = useState<Term | null>(null);

  // Department schedule status progress hook
  const {
    draftingProgress,
    yearLevels,
    stageCounts,
  } = useDepartmentScheduleStatus(user?.department_id);


  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        const [
          schedulesRes,
          roomsRes,
          sectionsRes,
          facultiesRes,
          subjectsRes,
          activeTermRes
        ] = await Promise.all([
          api.get<Schedule[]>('/schedules').catch(() => null),
          api.get<Room[]>('/rooms').catch(() => null),
          api.get<Section[]>('/sections').catch(() => null),
          api.get<Faculty[]>('/faculties').catch(() => null),
          api.get<Subject[]>('/subjects').catch(() => null),
          api.get<Term>('/terms/active').catch(() => null)
        ]);

        setSchedules(schedulesRes?.data || []);
        setRooms(roomsRes?.data || []);
        setSections(sectionsRes?.data || []);
        setFaculties(facultiesRes?.data || []);
        setSubjects(subjectsRes?.data || []);
        setActiveTerm(activeTermRes?.data || null);

      } catch {
        // Fallback — data stays at defaults
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const totalSchedules = schedules.length;
  const pendingApprovals = schedules.filter(s => s.status === 'submitted' || s.status === 'approved_by_dean').length;
  const isTermActive = !!activeTerm;

  // Counts for Stage Breakdown
  const draftCount        = stageCounts?.draft ?? 0;
  const submittedCount    = stageCounts?.submitted ?? 0;
  const deanApprovedCount = stageCounts?.approved_by_dean ?? 0;
  const approvedCount     = stageCounts?.approved ?? 0;
  const totalDeptSchedules = draftCount + submittedCount + deanApprovedCount + approvedCount;

  // Percentages for Stage Breakdown (handle division by zero)
  const draftPercent = totalDeptSchedules > 0 ? Math.round((draftCount / totalDeptSchedules) * 100) : 0;
  const submittedPercent = totalDeptSchedules > 0 ? Math.round((submittedCount / totalDeptSchedules) * 100) : 0;
  const deanApprovedPercent = totalDeptSchedules > 0 ? Math.round((deanApprovedCount / totalDeptSchedules) * 100) : 0;
  const approvedPercent = totalDeptSchedules > 0 ? Math.round((approvedCount / totalDeptSchedules) * 100) : 0;

  // Room Utilization calculations
  const utilizedRoomIds = new Set(schedules.filter(s => s.room_id).map(s => s.room_id));
  const utilizationRate = rooms.length > 0 ? Math.round((utilizedRoomIds.size / rooms.length) * 100) : 0;

  // Radial Ring circumference calculations
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (utilizationRate / 100) * circumference;

  // Derived faculties list (top 3 sorted by workload % descending)
  const processedFaculties = useMemo(() => {
    let list = [...faculties];
    
    // Filter by department if secretary has a department_id
    if (user?.department_id) {
      list = list.filter(f => f.department_id !== null && Number(f.department_id) === Number(user.department_id));
    }

    list.sort((a, b) => {
      const pctA = (a.assigned_units || 0) / (a.max_units || 21);
      const pctB = (b.assigned_units || 0) / (b.max_units || 21);
      return pctB - pctA;
    });

    return list.slice(0, 3);
  }, [faculties, user?.department_id]);

  const facultyStats = useMemo(() => {
    // Stats are computed over all department faculties (or all if VPAA)
    const list = user?.department_id 
      ? faculties.filter(f => f.department_id !== null && Number(f.department_id) === Number(user.department_id))
      : faculties;

    let total = list.length;
    let fullyLoaded = 0;
    let underloaded = 0;
    let overloaded = 0;

    list.forEach(f => {
      const assigned = f.assigned_units || 0;
      const max = f.max_units || 21;
      const pct = max > 0 ? (assigned / max) * 100 : 0;

      if (pct > 100) {
        overloaded++;
      } else if (pct === 100) {
        fullyLoaded++;
      } else {
        underloaded++;
      }
    });

    return { total, fullyLoaded, underloaded, overloaded };
  }, [faculties, user?.department_id]);


  return (
    <div className="space-y-8 pb-12 transition-opacity duration-200">
      {/* Breadcrumb Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-muted text-xs tracking-wider uppercase">Home / Dashboard</p>
        </div>
        {activeTerm && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-150 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active Term: {activeTerm.term_name}
          </div>
        )}
      </div>

      {/* Greeting Banner */}
      <div className="bg-[#5A1220] py-4 px-6 rounded-xl text-white border border-[#5A1220]/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="font-sans text-base font-medium tracking-tight text-white">
          Welcome back, <span className="text-[#F5A623] font-medium">{user?.name || 'Secretary User'}</span>!
        </h1>
        {activeTerm && (
          <span className="text-xs sm:text-sm text-[#F5A623]/85 font-medium tracking-wide">
            {activeTerm.term_name}
          </span>
        )}
      </div>

      {isLoading ? (
      <div className="space-y-8">
          {/* Skeleton Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200 animate-pulse min-h-[98px] flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-6 w-6 rounded-lg" />
                </div>
                <Skeleton className="h-9 w-10" />
              </div>
            ))}
          </div>

          {/* Skeleton Analytics — Stage Distribution, Room Gauge & Faculty Load */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stage Breakdown Skeleton */}
            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse flex flex-col justify-between min-h-[340px]">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full rounded-full mt-2" />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              </div>
              <Skeleton className="h-10 w-full rounded-xl mt-4" />
            </div>

            {/* Room Utilization Skeleton */}
            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse flex flex-col items-center justify-center gap-4 min-h-[340px]">
              <div className="self-start">
                <Skeleton className="h-5 w-36" />
              </div>
              <Skeleton className="h-32 w-32 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>

            {/* Faculty Load Skeleton */}
            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse flex flex-col justify-between min-h-[340px]">
              <div className="space-y-4">
                <Skeleton className="h-5 w-32" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-2 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
              <Skeleton className="h-4 w-28 self-end" />
            </div>
          </div>

          {/* Skeleton Quick Actions & Activity — prevents shift from missing section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse space-y-5 min-h-[280px]">
              <Skeleton className="h-5 w-36" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <Skeleton className="h-3.5 w-3.5 rounded-full flex-shrink-0 mt-1" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
            {/* Total Schedules */}
            <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200 relative group overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Schedules</span>
                <div className="p-1.5 rounded-lg bg-[#5A1220]/5 text-[#5A1220]">
                  <CalendarDays className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{totalSchedules}</p>
            </div>

            {/* Pending Approvals */}
            <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200 relative group overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Pending</span>
                <div className="p-1.5 rounded-lg bg-[#F5A623]/5 text-[#F5A623]">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{pendingApprovals}</p>
            </div>

            {/* Sections */}
            <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200 relative group overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Sections</span>
                <div className="p-1.5 rounded-lg bg-[#5A1220]/5 text-[#5A1220]">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{sections.length}</p>
            </div>

            {/* Faculty */}
            <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200 relative group overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Faculty</span>
                <div className="p-1.5 rounded-lg bg-[#5A1220]/5 text-[#5A1220]">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{faculties.length}</p>
            </div>

            {/* Rooms */}
            <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200 relative group overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Rooms</span>
                <div className="p-1.5 rounded-lg bg-[#5A1220]/5 text-[#5A1220]">
                  <DoorOpen className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{rooms.length}</p>
            </div>

            {/* Subjects */}
            <div className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200 relative group overflow-hidden">
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Subjects</span>
                <div className="p-1.5 rounded-lg bg-[#5A1220]/5 text-[#5A1220]">
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{subjects.length}</p>
            </div>
          </div>

          {/* Analytics Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stage Distribution Chart */}
            <div className="lg:col-span-1 bg-white p-6 rounded-xl border-[0.5px] border-gray-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div className="flex items-center gap-2.5 text-gray-800 font-bold">
                    <TrendingUp className="w-5 h-5 text-[#5A1220]" />
                    <span>Schedules Stage Breakdown</span>
                  </div>
                  {user?.department_id && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#5A1220]/10 text-[#5A1220] text-xs font-bold border border-[#5A1220]/15">
                      {draftingProgress}% Completed
                    </span>
                  )}
                </div>

                {/* Progress bar container */}
                {totalDeptSchedules === 0 ? (
                  <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-xl text-center">
                    <p className="text-gray-400 text-sm">No scheduled section data available.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Visual Progress Bar */}
                    <div className="h-4 w-full bg-gray-100 rounded-full flex overflow-hidden">
                      <div
                        style={{ width: `${draftingProgress}%` }}
                        className="bg-[#5A1220] h-full transition-all duration-500"
                        title={`Progress: ${draftingProgress}%`}
                      />
                    </div>

                    {/* Numeric breakdown details */}
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-gray-400 block" />
                          Draft
                        </div>
                        <p className="text-xl font-extrabold text-gray-800 mt-1">{draftCount} <span className="text-xs text-gray-400 font-medium">({draftPercent}%)</span></p>
                      </div>

                      <div className="p-3 bg-[#F5A623]/5 rounded-xl border border-[#F5A623]/20">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#F5A623] block" />
                          Submitted
                        </div>
                        <p className="text-xl font-extrabold text-gray-800 mt-1">{submittedCount} <span className="text-xs text-gray-400 font-medium">({submittedPercent}%)</span></p>
                      </div>

                      <div className="p-3 bg-[#5A1220]/5 rounded-xl border border-[#5A1220]/20">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#5A1220] block" />
                          Dean Approved
                        </div>
                        <p className="text-xl font-extrabold text-gray-800 mt-1">{deanApprovedCount} <span className="text-xs text-gray-400 font-medium">({deanApprovedPercent}%)</span></p>
                      </div>

                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-gray-800 block" />
                          VPAA Approved
                        </div>
                        <p className="text-xl font-extrabold text-gray-800 mt-1">{approvedCount} <span className="text-xs text-gray-400 font-medium">({approvedPercent}%)</span></p>
                      </div>
                    </div>

                    {/* Footer note row & Action */}
                    <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col gap-4">
                      <div className="text-xs text-gray-500 flex items-center justify-between">
                        <span>{
                          yearLevels && yearLevels.length > 0
                            ? (yearLevels.filter(yl => !yl.isComplete).map(yl => yl.label).length === 0
                              ? 'All year levels drafted'
                              : `Pending: ${yearLevels.filter(yl => !yl.isComplete).map(yl => yl.label).join(', ')} draft`)
                            : 'No schedule status data'
                        }</span>
                        <span className="font-medium text-gray-400">Updated just now</span>
                      </div>

                      <button
                        onClick={() => navigate('/secretary/schedules')}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#5A1220]/5 hover:bg-[#5A1220]/10 text-[#5A1220] text-sm font-bold border border-[#5A1220]/10 transition-colors"
                      >
                        View details
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Room Utilization Gauge */}
            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 flex flex-col justify-between flex-1">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-6">
                  <DoorOpen className="w-5 h-5 text-[#5A1220]" />
                  <span>Room Utilization</span>
                </div>

                <div className="flex flex-col items-center justify-center py-4 relative">
                  <div className="relative flex items-center justify-center">
                    <svg className="w-48 h-48 transform -rotate-90">
                      {/* Background circle */}
                      <circle
                        cx="96"
                        cy="96"
                        r={radius}
                        className="stroke-gray-100 fill-transparent"
                        strokeWidth="12"
                      />
                      {/* Foreground Circle Progress */}
                      <circle
                        cx="96"
                        cy="96"
                        r={radius}
                        className="stroke-[#5A1220] fill-transparent transition-all duration-500"
                        strokeWidth="12"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                      />
                    </svg>
                    {/* Ring Label overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-4xl font-extrabold text-gray-800">{utilizationRate}%</span>
                      <span className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Utilization</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 text-center mt-4">
                <p className="text-sm text-gray-600">
                  <span className="font-bold text-gray-800">{utilizedRoomIds.size}</span> out of <span className="font-bold text-gray-800">{rooms.length}</span> rooms scheduled.
                </p>
              </div>
            </div>

            {/* Faculty Teaching Load Card */}
            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 flex flex-col justify-between min-h-[340px]">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-5">
                  <Users className="w-5 h-5 text-[#5A1220]" />
                  <span>Faculty Load</span>
                </div>

                <div className="space-y-4 font-sans">
                  {processedFaculties.length === 0 ? (
                    <p className="text-center text-gray-400 text-xs py-4 font-sans">No instructors found.</p>
                  ) : (
                    processedFaculties.map((f) => {
                      const assigned = f.assigned_units || 0;
                      const max = f.max_units || 21;
                      const pct = max > 0 ? Math.round((assigned / max) * 100) : 0;
                      
                      let barColor = 'bg-[#F5A623]';
                      let textColor = 'text-[#F5A623] bg-amber-50 border-amber-200';
                      if (pct > 100) {
                        barColor = 'bg-red-500';
                        textColor = 'text-red-600 bg-red-50 border-red-200';
                      } else if (pct === 100) {
                        barColor = 'bg-emerald-500';
                        textColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
                      }

                      const middleInitial = f.middle_name ? `${f.middle_name.charAt(0)}.` : '';
                      const fullName = `${f.last_name}, ${f.first_name} ${middleInitial}`.trim();
                      const deptCode = f.department?.department_code || 'N/A';

                      return (
                        <div key={f.id} className="space-y-1 pb-2 border-b border-gray-100 last:border-0 last:pb-0 font-sans">
                          <div className="flex justify-between items-center text-xs font-sans">
                            <span className="font-bold text-gray-800 truncate max-w-[130px]" title={fullName}>{fullName}</span>
                            <span className="text-[9px] bg-gray-100 text-gray-500 border border-gray-200 rounded px-1.5 py-0.5 font-bold uppercase">
                              {deptCode}
                            </span>
                          </div>
                          
                          <div className="flex items-center justify-between gap-2 text-[10px] font-sans">
                            <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden max-w-[120px]">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-gray-400">
                                {assigned}/{max}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${textColor}`}>
                                {pct}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="mt-4 flex justify-end border-t border-gray-100 pt-3">
                <button
                  onClick={() => navigate(user?.role?.toLowerCase() === 'secretary' ? '/secretary/instructors' : '/faculty')}
                  className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  View all faculty &rarr;
                </button>
              </div>
            </div>
          </div>

          {/* Quick Actions & Recent Activities Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Actions Panel */}
            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 flex flex-col gap-4">
              <h2 className="text-gray-800 font-bold text-lg">Quick Actions</h2>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => navigate('/secretary/schedules')}
                  className="w-full h-11 px-4 flex items-center gap-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] group"
                >
                  <CalendarDays className="w-5 h-5 text-[#5A1220] group-hover:scale-105 transition-transform flex-shrink-0" />
                  <span className="text-sm font-bold text-left">Manage Class Schedules</span>
                </button>
                <button
                  onClick={() => navigate('/secretary/rooms')}
                  className="w-full h-11 px-4 flex items-center gap-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] group"
                >
                  <DoorOpen className="w-5 h-5 text-[#5A1220] group-hover:scale-105 transition-transform flex-shrink-0" />
                  <span className="text-sm font-bold text-left">View Room Assignments</span>
                </button>
                <button
                  onClick={() => navigate('/secretary/schedules')}
                  className="w-full h-11 px-4 flex items-center gap-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] group"
                >
                  <CalendarPlus className="w-5 h-5 text-[#5A1220] group-hover:scale-105 transition-transform flex-shrink-0" />
                  <span className="text-sm font-bold text-left">Add New Schedule</span>
                </button>
                <button
                  onClick={() => navigate('/secretary/schedules')}
                  className="w-full h-11 px-4 flex items-center gap-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 hover:text-[#5A1220] group"
                >
                  <AlertTriangle className="w-5 h-5 text-[#5A1220] group-hover:scale-105 transition-transform flex-shrink-0" />
                  <span className="text-sm font-bold text-left">Check Conflicts</span>
                </button>
              </div>
            </div>

            {/* Activities Timeline Feed */}
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border-[0.5px] border-gray-200 flex flex-col justify-between min-h-[280px]">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-6">
                  <ClipboardList className="w-5 h-5 text-[#5A1220]" />
                  <span>Recent Activity</span>
                </div>

                {mockActivities.length === 0 ? (
                  <p className="text-muted text-sm italic">No recent activity logged.</p>
                ) : (
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
                    {mockActivities.map((act, index) => (
                      <div key={act.id} className="relative flex items-start gap-4">
                        <div className={`absolute -left-[22px] mt-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 ${
                          index === 0 ? 'border-[#F5A623]' : 'border-gray-300'
                        } flex items-center justify-center`} />
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 leading-snug">{act.action}</p>
                          <span className="text-xs text-gray-400 mt-1 block font-medium">{act.timestamp}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end border-t border-gray-100 pt-4">
                <button
                  onClick={() => navigate('/activity-log')}
                  className="text-xs font-bold text-[#5A1220] hover:text-[#410b15] hover:underline flex items-center gap-1.5"
                >
                  View Activity Logs &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
