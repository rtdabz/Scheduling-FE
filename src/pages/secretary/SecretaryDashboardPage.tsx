import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CalendarDays, 
  DoorOpen, 
  CheckCircle2, 
  XCircle, 
  LayoutGrid, 
  ClipboardList 
} from 'lucide-react';
import { useTour } from '../../hooks/useTour';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';

interface Schedule {
  id: number;
  term_id: number;
  section_id: number;
  status: string;
}

interface Room {
  id: number;
  room_name: string;
}

interface Section {
  id: number;
  section_name: string;
}

interface Term {
  id: number;
  status: string;
}

interface ActivityLog {
  id: number;
  action: string;
  timestamp: string;
}

const mockActivities: ActivityLog[] = [
  { id: 1, action: "You submitted BSCS 4A for approval", timestamp: "2 hours ago" },
  { id: 2, action: "You added CS 401 to BSCS 4A schedule", timestamp: "4 hours ago" },
  { id: 3, action: "Room 101 was assigned to BSIT 2B", timestamp: "5 hours ago" },
  { id: 4, action: "Draft schedule created for BSIT 3A", timestamp: "1 day ago" },
  { id: 5, action: "Logged in to admin portal", timestamp: "2 days ago" },
];

const stages = [
  { key: 0, label: 'Draft' },
  { key: 1, label: 'Submitted' },
  { key: 2, label: 'Dean Approved' },
  { key: 3, label: 'VPAA Approved' },
];

const getStatusIndex = (status: string): number => {
  const s = status.toLowerCase();
  if (s === 'approved') return 3;
  if (s === 'approved_by_dean') return 2;
  if (s === 'submitted' || s === 'faculty_assignment' || s === 'finalized') return 1;
  return 0; // draft
};

export default function SecretaryDashboardPage() {
  useTour();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [schedulesCount, setSchedulesCount] = useState(0);
  const [activeRoomsCount, setActiveRoomsCount] = useState(6);
  const [isTermActive, setIsTermActive] = useState(true);
  const [activeSection, setActiveSection] = useState<{ id: number; section_name: string; status: string } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        let schedules: Schedule[] = [];
        let rooms: Room[] = [];
        let sections: Section[] = [];
        let activeTerm: Term | null = null;

        try {
          const schedulesRes = await api.get<Schedule[]>('/schedules');
          schedules = schedulesRes.data;
        } catch {
          // Fallback to empty
        }

        try {
          const roomsRes = await api.get<Room[]>('/rooms');
          rooms = roomsRes.data;
        } catch {
          // Fallback to empty
        }

        try {
          const sectionsRes = await api.get<Section[]>('/sections');
          sections = sectionsRes.data;
        } catch {
          // Fallback to empty
        }

        try {
          const termRes = await api.get<Term>('/terms/active');
          activeTerm = termRes.data;
        } catch {
          // Fallback to empty
        }

        setSchedulesCount(schedules.length);
        if (rooms.length > 0) {
          setActiveRoomsCount(rooms.length);
        }
        setIsTermActive(!!activeTerm);

        let foundActiveSection = null;
        if (schedules.length > 0 && sections.length > 0) {
          for (const sec of sections) {
            const secSchedules = schedules.filter((s: Schedule) => Number(s.section_id) === Number(sec.id));
            if (secSchedules.length > 0) {
              foundActiveSection = {
                id: Number(sec.id),
                section_name: sec.section_name,
                status: secSchedules[0].status || 'draft'
              };
              break;
            }
          }
        }

        if (!foundActiveSection) {
          foundActiveSection = {
            id: 1,
            section_name: 'BSCS 4A',
            status: 'draft'
          };
        }
        setActiveSection(foundActiveSection);
      } catch {
        setActiveSection({ id: 1, section_name: 'BSCS 4A', status: 'draft' });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const currentStageIndex = activeSection ? getStatusIndex(activeSection.status) : 0;

  return (
    <div className="transition-opacity duration-200">
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Dashboard</p>
      </div>
      
      {isLoading ? (
        <div className="space-y-6">
          {/* Stat Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-xl border border-gray-150/70 shadow-sm animate-pulse">
                <Skeleton className="h-4 w-28 mb-3" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
          
          {/* Progress Card Skeleton */}
          <div className="bg-white p-6 rounded-xl border border-gray-150/70 shadow-sm animate-pulse h-48">
            <Skeleton className="h-4 w-48 mb-6" />
            <div className="flex justify-between items-center max-w-3xl mx-auto h-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-8 rounded-full" />
              ))}
            </div>
            <div className="h-6"></div>
            <div className="flex justify-between items-center border-t border-gray-100 pt-6 mt-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-40 rounded-lg" />
            </div>
          </div>

          {/* Grid Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Actions Skeleton */}
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-xl border border-gray-150/70 shadow-sm animate-pulse flex flex-col items-center justify-center h-32">
                  <Skeleton className="h-8 w-8 rounded-full mb-3" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-150/70 shadow-sm animate-pulse flex flex-col items-center justify-center h-32">
                  <Skeleton className="h-8 w-8 rounded-full mb-3" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            </div>

            {/* Recent Activity Skeleton */}
            <div className="bg-white p-6 rounded-xl border border-gray-150/70 shadow-sm animate-pulse flex flex-col justify-between h-[230px]">
              <div>
                <Skeleton className="h-5 w-32 mb-6" />
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Skeleton className="w-2.5 h-2.5 rounded-full mt-1.5" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-2 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
                <CalendarDays className="h-4 w-4 text-[#4e0a10]" />
                <span>Class Schedules</span>
              </div>
              <p className="text-3xl font-bold text-[#1A1410] mt-1">{schedulesCount}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
                <DoorOpen className="h-4 w-4 text-[#4e0a10]" />
                <span>Active Rooms</span>
              </div>
              <p className="text-3xl font-bold text-[#1A1410] mt-1">{activeRoomsCount}</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
                {isTermActive ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span>Term Status</span>
              </div>
              <p className={`text-3xl font-bold mt-1 ${isTermActive ? 'text-emerald-600' : 'text-red-500'}`}>
                {isTermActive ? 'Active' : 'Inactive'}
              </p>
            </div>
          </div>

          {/* Schedule Progress Card */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-gray-700 font-semibold mb-6">
              <LayoutGrid className="w-5 h-5 text-[#4e0a10]" />
              <span>Current Schedule Progress</span>
            </div>

            <div className="relative flex items-center justify-between w-full max-w-3xl mx-auto mb-8 px-4">
              {/* Background Line */}
              <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-gray-200 -z-0"></div>
              {/* Active Progress Line */}
              <div 
                className="absolute left-4 top-1/2 -translate-y-1/2 h-1 bg-emerald-500 transition-all duration-500 -z-0"
                style={{ width: `calc((${currentStageIndex} / 3) * (100% - 32px))` }}
              ></div>

              {stages.map((stage) => {
                const isCompleted = stage.key < currentStageIndex;
                const isCurrent = stage.key === currentStageIndex;

                let circleClass = "";
                let textClass = "";
                if (isCompleted) {
                  circleClass = "bg-emerald-500 text-white border-emerald-500";
                  textClass = "text-emerald-600 font-medium";
                } else if (isCurrent) {
                  circleClass = "bg-[#4e0a10] text-white border-[#4e0a10] ring-4 ring-[#4e0a10]/15";
                  textClass = "text-[#4e0a10] font-semibold";
                } else {
                  circleClass = "bg-white text-gray-400 border-gray-300";
                  textClass = "text-gray-400";
                }

                return (
                  <div key={stage.key} className="relative z-10 flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition-all duration-300 ${circleClass}`}>
                      {isCompleted ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        stage.key + 1
                      )}
                    </div>
                    <span className={`absolute top-10 text-xs md:text-sm whitespace-nowrap mt-1 ${textClass}`}>
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="h-6"></div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-gray-100 pt-6 mt-4 gap-4">
              <div>
                <span className="text-gray-500 text-sm">Active Section: </span>
                <span className="text-[#1A1410] font-semibold text-base">
                  {activeSection?.section_name}
                </span>
              </div>
              <button
                onClick={() => navigate('/secretary/schedules')}
                className="inline-flex items-center justify-center px-5 h-10 bg-[#4e0a10] hover:bg-[#3d080c] text-white text-sm font-semibold rounded-lg transition-colors active:scale-[0.98]"
              >
                Go to Class Schedules
              </button>
            </div>
          </div>

          {/* Quick Actions & Recent Activity Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Quick Actions */}
            <div className="flex flex-col gap-4">
              <h2 className="text-[#1A1410] font-semibold text-lg">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => navigate('/secretary/schedules')}
                  className="flex flex-col items-center justify-center p-6 bg-white border border-gray-150 rounded-xl hover:shadow-md hover:border-gray-200 transition-all text-gray-700 hover:text-[#4e0a10] group"
                >
                  <CalendarDays className="w-8 h-8 text-[#4e0a10] mb-3 group-hover:scale-105 transition-transform" />
                  <span className="text-sm font-medium text-center">Manage Class Schedules</span>
                </button>
                <button
                  onClick={() => navigate('/secretary/rooms')}
                  className="flex flex-col items-center justify-center p-6 bg-white border border-gray-150 rounded-xl hover:shadow-md hover:border-gray-200 transition-all text-gray-700 hover:text-[#4e0a10] group"
                >
                  <DoorOpen className="w-8 h-8 text-[#4e0a10] mb-3 group-hover:scale-105 transition-transform" />
                  <span className="text-sm font-medium text-center">View Rooms</span>
                </button>
              </div>
            </div>

            {/* Recent Activity Feed */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between min-h-[230px]">
              <div>
                <div className="flex items-center gap-2 text-gray-700 font-semibold mb-6">
                  <ClipboardList className="w-5 h-5 text-[#4e0a10]" />
                  <span>Recent Activity</span>
                </div>

                {mockActivities.length === 0 ? (
                  <p className="text-muted text-sm italic">No recent activity yet.</p>
                ) : (
                  <div className="space-y-4">
                    {mockActivities.map((act) => (
                      <div key={act.id} className="flex items-start gap-3">
                        <div className="mt-1.5 w-2 h-2 rounded-full bg-[#C9952A]" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-800 leading-snug">{act.action}</p>
                          <span className="text-xs text-gray-400 mt-0.5 block">{act.timestamp}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => navigate('/activity-log')}
                  className="text-xs font-semibold text-[#4e0a10] hover:text-[#3d080c] hover:underline"
                >
                  View All &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
