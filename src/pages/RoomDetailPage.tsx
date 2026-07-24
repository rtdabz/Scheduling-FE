import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Skeleton from '../components/ui/Skeleton';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Building2,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import api from '../lib/api';

interface Department {
  id: number;
  department_name: string;
  department_code: string;
}

interface Room {
  id: number;
  room_code: string;
  building: string;
  room_type: 'lecture' | 'laboratory' | 'online' | 'field';
  status: 'available' | 'not available';
  department_id: number | null;
  department: Department | null;
}

interface Schedule {
  id: number;
  term_id: number;
  section_id: number;
  course_id: number;
  faculty_id: number | null;
  room_id: number;
  department_id: number;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  start_time: string;
  end_time: string;
  mode: string;
  status: string;
  section?: {
    id: number;
    section_name: string;
  } | null;
  course?: {
    id: number;
    course_code: string;
    course_name: string;
  } | null;
  faculty?: {
    id: number;
    first_name: string;
    last_name: string;
    middle_name?: string | null;
  } | null;
}

const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let hour = parseInt(parts[0], 10);
  const minute = parts[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12;
  return `${hour}:${minute} ${ampm}`;
};

const getMinutes = (timeStr: string) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
};

export default function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const userRole = user?.role?.toLowerCase() || '';

  const [room, setRoom] = useState<Room | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTabDay, setActiveTabDay] = useState<string>('Monday');

  useEffect(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayIdx = new Date().getDay();
    const defaultDay = currentDayIdx === 0 ? 'Monday' : days[currentDayIdx];
    setActiveTabDay(defaultDay);
  }, []);

  useEffect(() => {
    const fetchRoom = async () => {
      setIsLoading(true);
      try {
        const [roomRes, initialRes] = await Promise.all([
          api.get<Room>(`/rooms/${id}`),
          api.get<{ schedules: Schedule[] }>('/initial-data'),
        ]);
        setRoom(roomRes.data);
        setSchedules(initialRes.data.schedules);
      } catch {
        navigate(-1);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRoom();
  }, [id, navigate]);

  const activeRoomSchedules = useMemo(() => {
    if (!room) return [];
    return schedules
      .filter(s => s.room_id === room.id && s.day === activeTabDay)
      .sort((a, b) => getMinutes(a.start_time) - getMinutes(b.start_time));
  }, [room, schedules, activeTabDay]);

  const getBackPath = () => {
    if (userRole === 'vpaa') return '/rooms';
    if (userRole === 'dean') return '/dean/rooms';
    if (userRole === 'secretary') return '/secretary/rooms';
    if (userRole === 'program_head') return '/program_head/rooms';
    return '/rooms';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <Skeleton className="h-8 w-64 mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <Skeleton className="h-12 w-full" />
          <div className="p-6 space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!room) return null;

  let badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
  if (room.room_type === 'laboratory') badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
  else if (room.room_type === 'online') badgeColor = 'bg-green-50 text-green-700 border-green-200';
  else if (room.room_type === 'field') badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';

  const statusBadgeColor = room.status === 'not available'
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-green-50 text-green-700 border-green-200';

  return (
    <div className="space-y-6">
      {/* Back Button + Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(getBackPath())}
          className="p-2 text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-855 font-sans">
            Classroom Details
          </h1>
          <p className="text-xs text-gray-400 font-sans font-semibold">
            Weekly schedule and room information
          </p>
        </div>
      </div>

      {/* Room Info Card */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#C9952A]/10 text-[#C9952A] flex items-center justify-center">
              <Building2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-gray-800 font-mono uppercase">
                  {room.room_code}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                  {room.room_type}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusBadgeColor}`}>
                  {room.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 font-semibold">
                {room.building || 'No building assigned'} &bull; {room.department ? `${room.department.department_code} Department` : 'General / All'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Building</p>
            <p className="text-sm font-bold text-gray-700">{room.building || 'N/A'}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Type</p>
            <p className="text-sm font-bold text-gray-700 capitalize">{room.room_type}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Status</p>
            <div className="flex items-center gap-1.5">
              {room.status === 'available' ? (
                <CheckCircle2 size={14} className="text-emerald-500" />
              ) : room.status === 'not available' ? (
                <XCircle size={14} className="text-red-500" />
              ) : (
                <HelpCircle size={14} className="text-gray-400" />
              )}
              <p className="text-sm font-bold text-gray-700 capitalize">{room.status}</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Department</p>
            <p className="text-sm font-bold text-gray-700">{room.department?.department_code || 'General'}</p>
          </div>
        </div>
      </div>

      {/* Weekly Timetable */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm font-sans">
        {/* Day Tabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto bg-gray-50/50">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
            const count = schedules.filter(s => s.room_id === room.id && s.day === day).length;
            const isActive = activeTabDay === day;
            return (
              <button
                key={day}
                onClick={() => setActiveTabDay(day)}
                className={`flex-1 min-w-[90px] py-3 text-center border-b-2 font-bold text-xs transition-all uppercase tracking-wider cursor-pointer whitespace-nowrap px-4 ${
                  isActive
                    ? 'border-[#C9952A] text-[#C9952A] bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span>{day}</span>
                {count > 0 && (
                  <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-[#C9952A] text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Timetable Content */}
        <div className="p-6">
          {activeRoomSchedules.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center text-gray-400">
              <div className="w-12 h-12 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center border border-gray-150 mb-3">
                <Calendar size={22} />
              </div>
              <p className="text-sm font-semibold">No classes scheduled on this day</p>
              <p className="text-xs">Classroom is free and available during this timeframe.</p>
            </div>
          ) : (
            <div className="relative border-l border-gray-150 pl-6 space-y-6">
              {activeRoomSchedules.map((sched) => {
                const startMin = getMinutes(sched.start_time);
                const endMin = getMinutes(sched.end_time);
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const isToday = days[now.getDay()] === activeTabDay;
                const isCurrentlyRunning = isToday && currentMinutes >= startMin && currentMinutes <= endMin;

                return (
                  <div key={sched.id} className="relative group">
                    {/* Timeline Node dot */}
                    <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center transition-colors ${
                      isCurrentlyRunning
                        ? 'border-emerald-500 ring-4 ring-emerald-100'
                        : 'border-[#C9952A] group-hover:border-[#4e0a10]'
                    }`}>
                      {isCurrentlyRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </div>

                    {/* Schedule Item Box */}
                    <div className={`border rounded-2xl p-4 transition-all ${
                      isCurrentlyRunning
                        ? 'bg-emerald-50/30 border-emerald-150 shadow-sm'
                        : 'bg-gray-50/30 border-gray-150 hover:bg-gray-50/70 hover:border-gray-250'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-gray-800">
                              {sched.course?.course_name || sched.course?.course_code || 'Subject Class'}
                            </h4>
                            {isCurrentlyRunning && (
                              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#C9952A] font-bold font-mono">
                            {sched.course?.course_code} &bull; Section {sched.section?.section_name}
                          </p>
                        </div>

                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-lg w-max shadow-sm">
                          {sched.mode}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-4 text-xs border-t border-gray-100 pt-3">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-gray-400" />
                          <span className="text-gray-600 font-semibold">
                            {formatTime(sched.start_time)} - {formatTime(sched.end_time)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 font-bold">BY</span>
                          <span className="text-gray-600 font-semibold truncate">
                            {sched.faculty
                              ? `${sched.faculty.first_name} ${sched.faculty.last_name}`
                              : 'No Instructor Assigned'
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
