import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CalendarDays, 
  DoorOpen, 
  ClipboardList,
  Clock,
  Layers,
  Users,
  BookOpen,
  TrendingUp
} from 'lucide-react';
import { useTour } from '../../hooks/useTour';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';
import DepartmentScheduleStatusCard from '../../components/ui/DepartmentScheduleStatusCard';

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
  name: string;
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
  const user = userJson ? (JSON.parse(userJson) as { name?: string; department_id?: number }) : null;

  // Stats State
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeTerm, setActiveTerm] = useState<Term | null>(null);


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
  const draftCount        = schedules.filter(s => !['submitted', 'faculty_assignment', 'finalized', 'approved_by_dean', 'approved'].includes(s.status)).length;
  const submittedCount    = schedules.filter(s => ['submitted', 'faculty_assignment', 'finalized'].includes(s.status)).length;
  const deanApprovedCount = schedules.filter(s => s.status === 'approved_by_dean').length;
  const approvedCount     = schedules.filter(s => s.status === 'approved').length;

  // Percentages for Stage Breakdown (handle division by zero)
  const draftPercent = totalSchedules > 0 ? Math.round((draftCount / totalSchedules) * 100) : 0;
  const submittedPercent = totalSchedules > 0 ? Math.round((submittedCount / totalSchedules) * 100) : 0;
  const deanApprovedPercent = totalSchedules > 0 ? Math.round((deanApprovedCount / totalSchedules) * 100) : 0;
  const approvedPercent = totalSchedules > 0 ? Math.round((approvedCount / totalSchedules) * 100) : 0;

  // Room Utilization calculations
  const utilizedRoomIds = new Set(schedules.filter(s => s.room_id).map(s => s.room_id));
  const utilizationRate = rooms.length > 0 ? Math.round((utilizedRoomIds.size / rooms.length) * 100) : 0;

  // Radial Ring circumference calculations
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (utilizationRate / 100) * circumference;


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
      <div className="relative overflow-hidden bg-gradient-to-br from-[#4e0a10] to-[#2c0508] p-6 sm:p-8 rounded-2xl text-white shadow-md border border-[#4e0a10]/20">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-[#C9952A]/5 rounded-full blur-3xl -ml-12 -mb-12 pointer-events-none" />
        <div className="relative z-10">
          <h1 className="font-display text-xl sm:text-2xl font-black tracking-tight text-white">
            Welcome back, <span className="text-[#C9952A]">{user?.name || 'Secretary'}</span>!
          </h1>
        </div>
      </div>

      {isLoading ? (
      <div className="space-y-8">
          {/* Skeleton Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm animate-pulse min-h-[98px] flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-6 w-6 rounded-lg" />
                </div>
                <Skeleton className="h-9 w-10" />
              </div>
            ))}
          </div>

          {/* Skeleton Analytics — Stage Distribution + stacked Status Card & Room Gauge */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm animate-pulse space-y-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full rounded-full mt-2" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {/* Skeleton compact status card */}
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm animate-pulse space-y-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-6 w-10" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <div className="flex gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-2.5 w-2.5 rounded-full" />
                  ))}
                </div>
                <Skeleton className="h-8 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>

              {/* Skeleton Room Utilization Gauge */}
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm animate-pulse flex flex-col items-center justify-center gap-4 min-h-[250px]">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-32 w-32 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </div>

          {/* Skeleton Quick Actions & Activity — prevents shift from missing section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm animate-pulse space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm animate-pulse space-y-5 min-h-[280px]">
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
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-300 relative group overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#4e0a10] opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Schedules</span>
                <div className="p-1.5 rounded-lg bg-[#4e0a10]/5 text-[#4e0a10]">
                  <CalendarDays className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{totalSchedules}</p>
            </div>

            {/* Pending Approvals */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-300 relative group overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#C9952A] opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Pending</span>
                <div className="p-1.5 rounded-lg bg-[#C9952A]/5 text-[#C9952A]">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{pendingApprovals}</p>
            </div>

            {/* Sections */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-300 relative group overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Sections</span>
                <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{sections.length}</p>
            </div>

            {/* Faculty */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-300 relative group overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Faculty</span>
                <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{faculties.length}</p>
            </div>

            {/* Rooms */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-300 relative group overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Rooms</span>
                <div className="p-1.5 rounded-lg bg-cyan-50 text-cyan-600">
                  <DoorOpen className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{rooms.length}</p>
            </div>

            {/* Subjects */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-300 relative group overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-teal-600 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between text-gray-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Subjects</span>
                <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600">
                  <BookOpen className="w-4 h-4" />
                </div>
              </div>
              <p className="text-3xl font-extrabold text-gray-900">{subjects.length}</p>
            </div>
          </div>

          {/* Analytics Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stage Distribution Chart */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-6">
                  <TrendingUp className="w-5 h-5 text-[#4e0a10]" />
                  <span>Schedules Stage Breakdown</span>
                </div>

                {/* Progress bar container */}
                {totalSchedules === 0 ? (
                  <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-2xl text-center">
                    <p className="text-gray-400 text-sm">No scheduled section data available.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Visual Segment Bar */}
                    <div className="h-4 w-full bg-gray-100 rounded-full flex overflow-hidden shadow-inner">
                      <div style={{ width: `${draftPercent}%` }} className="bg-gray-400 h-full transition-all duration-500" title={`Draft: ${draftCount}`} />
                      <div style={{ width: `${submittedPercent}%` }} className="bg-amber-500 h-full transition-all duration-500" title={`Submitted: ${submittedCount}`} />
                      <div style={{ width: `${deanApprovedPercent}%` }} className="bg-blue-600 h-full transition-all duration-500" title={`Dean Approved: ${deanApprovedCount}`} />
                      <div style={{ width: `${approvedPercent}%` }} className="bg-emerald-600 h-full transition-all duration-500" title={`Approved: ${approvedCount}`} />
                    </div>

                    {/* Numeric breakdown details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                      <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-gray-400 block" />
                          Draft
                        </div>
                        <p className="text-xl font-extrabold text-gray-800 mt-1">{draftCount} <span className="text-xs text-gray-400 font-medium">({draftPercent}%)</span></p>
                      </div>

                      <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 block" />
                          Submitted
                        </div>
                        <p className="text-xl font-extrabold text-gray-800 mt-1">{submittedCount} <span className="text-xs text-gray-400 font-medium">({submittedPercent}%)</span></p>
                      </div>

                      <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 block" />
                          Dean Approved
                        </div>
                        <p className="text-xl font-extrabold text-gray-800 mt-1">{deanApprovedCount} <span className="text-xs text-gray-400 font-medium">({deanApprovedPercent}%)</span></p>
                      </div>

                      <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-semibold">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 block" />
                          VPAA Approved
                        </div>
                        <p className="text-xl font-extrabold text-gray-800 mt-1">{approvedCount} <span className="text-xs text-gray-400 font-medium">({approvedPercent}%)</span></p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Department Schedule Status overview + Room Utilization Gauge */}
            <div className="flex flex-col gap-6">
              {user?.department_id && (
                <DepartmentScheduleStatusCard departmentId={user.department_id} />
              )}

              {/* Room Utilization Gauge */}
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between flex-1">
                <div>
                  <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-6">
                    <DoorOpen className="w-5 h-5 text-[#4e0a10]" />
                    <span>Room Utilization</span>
                  </div>

                  <div className="flex flex-col items-center justify-center py-4 relative">
                    <div className="relative flex items-center justify-center">
                      <svg className="w-32 h-32 transform -rotate-90">
                        {/* Background circle */}
                        <circle
                          cx="64"
                          cy="64"
                          r={radius}
                          className="stroke-gray-100 fill-transparent"
                          strokeWidth="8"
                        />
                        {/* Foreground Circle Progress */}
                        <circle
                          cx="64"
                          cy="64"
                          r={radius}
                          className="stroke-[#4e0a10] fill-transparent transition-all duration-500"
                          strokeWidth="8"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                        />
                      </svg>
                      {/* Ring Label overlay */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-black text-gray-800">{utilizationRate}%</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Rate</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-150/60 pt-4 text-center mt-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-bold text-gray-800">{utilizedRoomIds.size}</span> out of <span className="font-bold text-gray-800">{rooms.length}</span> rooms scheduled.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions & Recent Activities Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Actions Panel */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4">
              <h2 className="text-gray-800 font-bold text-lg">Quick Actions</h2>
              <div className="flex-1 flex flex-col sm:flex-row lg:flex-col gap-4">
                <button
                  onClick={() => navigate('/secretary/schedules')}
                  className="flex-1 flex flex-col items-center justify-center p-6 bg-white border border-gray-150 rounded-xl hover:shadow-lg transition-all duration-300 text-gray-700 hover:text-[#4e0a10] group"
                >
                  <CalendarDays className="w-8 h-8 text-[#4e0a10] mb-3 group-hover:scale-105 transition-transform" />
                  <span className="text-sm font-bold text-center">Manage Class Schedules</span>
                </button>
                <button
                  onClick={() => navigate('/secretary/rooms')}
                  className="flex-1 flex flex-col items-center justify-center p-6 bg-white border border-gray-150 rounded-xl hover:shadow-lg transition-all duration-300 text-gray-700 hover:text-[#4e0a10] group"
                >
                  <DoorOpen className="w-8 h-8 text-[#4e0a10] mb-3 group-hover:scale-105 transition-transform" />
                  <span className="text-sm font-bold text-center">View Room Assignments</span>
                </button>
              </div>
            </div>

            {/* Activities Timeline Feed */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[280px]">
              <div>
                <div className="flex items-center gap-2.5 text-gray-800 font-bold mb-6">
                  <ClipboardList className="w-5 h-5 text-[#4e0a10]" />
                  <span>Recent Activity</span>
                </div>

                {mockActivities.length === 0 ? (
                  <p className="text-muted text-sm italic">No recent activity logged.</p>
                ) : (
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
                    {mockActivities.map((act) => (
                      <div key={act.id} className="relative flex items-start gap-4">
                        <div className="absolute -left-[22px] mt-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-[#C9952A] flex items-center justify-center" />
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
                  className="text-xs font-bold text-[#4e0a10] hover:text-[#3d080c] hover:underline flex items-center gap-1.5"
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
