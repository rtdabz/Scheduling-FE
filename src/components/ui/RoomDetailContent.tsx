import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Building2,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import Skeleton from './Skeleton';
import WeeklyTimetableGrid from '../scheduling/WeeklyTimetableGrid';
import TimetableCardTooltip from '../scheduling/TimetableCardTooltip';

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

interface RoomDetailContentProps {
  room: Room | null;
  schedules: Schedule[];
  isLoading: boolean;
}

const ROOM_WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

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

const parseTimeToSlotIndex = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const totalMinutes = h * 60 + m;
  const startMinutes = 7 * 60; // 7:00 AM
  const slotIdx = Math.floor((totalMinutes - startMinutes) / 30);
  return Math.max(0, Math.min(24, slotIdx)); // Max slot index 24 (for 7:00 PM end time)
};

const getDeptStyles = (deptCode: string) => {
  const code = (deptCode || '').toUpperCase();
  if (code.includes('IT') || code.includes('CS') || code.includes('TECH')) {
    return 'bg-blue-50 text-blue-805 border-blue-200 border-l-blue-600';
  }
  if (code.includes('AS') || code.includes('ART') || code.includes('SCI')) {
    return 'bg-purple-50 text-purple-800 border-purple-200 border-l-purple-600';
  }
  if (code.includes('ED') || code.includes('EDUC')) {
    return 'bg-orange-50 text-orange-800 border-orange-200 border-l-orange-505';
  }
  if (code.includes('BA') || code.includes('BUS')) {
    return 'bg-yellow-50/50 text-yellow-805 border-yellow-250 border-l-yellow-600';
  }
  if (code.includes('HM') || code.includes('HOS')) {
    return 'bg-lime-50 text-lime-800 border-lime-200 border-l-lime-600';
  }
  if (code.includes('MID') || code.includes('MED')) {
    return 'bg-emerald-50 text-emerald-800 border-emerald-250 border-l-emerald-600';
  }
  if (code.includes('CRIM') || code.includes('LAW')) {
    return 'bg-[#5A1220]/5 text-[#5A1220] border-[#5A1220]/20 border-l-[#5A1220]';
  }
  if (code.includes('LIS') || code.includes('LIB')) {
    return 'bg-pink-50 text-pink-850 border-pink-200 border-l-pink-600';
  }
  return 'bg-slate-50 text-slate-800 border-slate-200 border-l-slate-500';
};

const getClassType = (sched: Schedule) => {
  if (sched.mode?.toLowerCase() === 'laboratory' || sched.mode?.toLowerCase() === 'lab') return 'Laboratory';
  const name = (sched.course?.course_name || '').toLowerCase();
  const code = (sched.course?.course_code || '').toLowerCase();
  if (name.includes('lab') || name.includes('laboratory') || code.includes('l') || code.endsWith('l')) {
    return 'Laboratory';
  }
  return 'Lecture';
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

export default function RoomDetailContent({ room, schedules, isLoading }: RoomDetailContentProps) {
  const [activeTabDay, setActiveTabDay] = useState<string>('Monday');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayIdx = new Date().getDay();
    const defaultDay = days[currentDayIdx];
    setActiveTabDay(defaultDay);
  }, []);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let slot = 0; slot < 25; slot += 1) { // 25 half-hour slots from 7:00 AM to 7:30 PM
      const totalMinutes = 7 * 60 + slot * 30;
      let hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      if (hours > 12) hours -= 12;
      if (hours === 0) hours = 12;
      slots.push({
        label: `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`,
      });
    }
    return slots;
  }, []);

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
    return elapsed * 0.8;
  }, [now]);

  const activeRoomSchedules = useMemo(() => {
    if (!room) return [];
    return schedules
      .filter(s => s.room_id === room.id && s.day === activeTabDay)
      .sort((a, b) => getMinutes(a.start_time) - getMinutes(b.start_time));
  }, [room, schedules, activeTabDay]);

  if (isLoading || !room) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          {[1, 2].map(i => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  let badgeColor = 'bg-blue-50 text-blue-755 border-blue-200';
  if (room.room_type === 'laboratory') badgeColor = 'bg-purple-50 text-purple-700 border-purple-200';
  else if (room.room_type === 'online') badgeColor = 'bg-green-50 text-green-700 border-green-200';
  else if (room.room_type === 'field') badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';

  const statusBadgeColor = room.status === 'not available'
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-green-50 text-green-700 border-green-200';

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Room Info Block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans border-b border-gray-150 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#5A1220]/10 text-[#5A1220] flex items-center justify-center border border-[#5A1220]/25">
            <Building2 size={18} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-gray-800 font-mono uppercase leading-none">
                {room.room_code}
              </h2>
              <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider border ${badgeColor}`}>
                {room.room_type}
              </span>
              <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wider border ${statusBadgeColor}`}>
                {room.status}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5 font-semibold">
              {room.building || 'No building assigned'} &bull; {room.department ? `${room.department.department_code} Department` : 'General / All'}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-sans mt-3">
        <div className="bg-gray-50 rounded-lg py-2 px-3 border border-gray-100 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-450 mb-0.5">Building</p>
          <p className="text-xs font-bold text-gray-700">{room.building || 'N/A'}</p>
        </div>
        <div className="bg-gray-50 rounded-lg py-2 px-3 border border-gray-100 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-455 mb-0.5">Type</p>
          <p className="text-xs font-bold text-gray-700 capitalize">{room.room_type}</p>
        </div>
        <div className="bg-gray-50 rounded-lg py-2 px-3 border border-gray-100 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-455 mb-0.5">Status</p>
          <div className="flex items-center gap-1">
            {room.status === 'available' ? (
              <CheckCircle2 size={12} className="text-emerald-500" />
            ) : room.status === 'not available' ? (
              <XCircle size={12} className="text-red-500" />
            ) : (
              <HelpCircle size={12} className="text-gray-400" />
            )}
            <p className="text-xs font-bold text-gray-700 capitalize">{room.status}</p>
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg py-2 px-3 border border-gray-100 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-455 mb-0.5">Department</p>
          <p className="text-xs font-bold text-gray-700">{room.department?.department_code || 'General'}</p>
        </div>
      </div>

      {/* Weekly Timetable Section */}
      <div className="flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm font-sans mt-3">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50/50 flex-wrap gap-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Weekly Classroom Schedule</h3>
          
          {/* View Mode Switcher */}
          <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1 border border-gray-200">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[#5A1220] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              List View
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[#5A1220] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Grid View
            </button>
          </div>
        </div>

        {viewMode === 'grid' ? (
          <div className="flex-1 flex flex-col min-h-0 p-6">
            <div className="flex-1 overflow-x-auto rounded-2xl border border-gray-200 shadow-inner min-h-0">
              <WeeklyTimetableGrid
                days={ROOM_WEEK_DAYS}
                slotCount={timeSlots.length}
                headerHeight={48}
                timeColumnWidth={80}
                slotHeight={24}
                minWidth={1000}
                getTimeLabel={(slot) => timeSlots[slot]?.label ?? ''}
                getDayCount={(dayIndex) => schedules.filter((schedule) => schedule.room_id === room.id && schedule.day === ROOM_WEEK_DAYS[dayIndex]).length}
              >
                  {ROOM_WEEK_DAYS.map((day, dayIndex) => {
                    const daySchedules = schedules.filter(
                      (s) => s.room_id === room.id && s.day === day
                    );
                    
                    const layouts = getDayLayouts(daySchedules);
                    const shortDayName = day.substring(0, 3);
                    const isCurrentDay = shortDayName === currentDayName;

                    return (
                      <React.Fragment key={day}>
                          {/* Google Calendar Time Indicator Line */}
                          {isCurrentDay && currentDayTimeTop !== null && (
                            <div
                              className="relative z-20 pointer-events-none"
                              style={{ gridColumn: dayIndex + 2, gridRow: `2 / span ${timeSlots.length}` }}
                            >
                              <div className="absolute left-0 right-0 border-t-2 border-red-500 flex items-center" style={{ top: `${currentDayTimeTop}px` }}>
                                <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-sm" />
                              </div>
                            </div>
                          )}

                          {/* Render schedules on grid */}
                          {daySchedules.map((schedule) => {
                            const startIdx = parseTimeToSlotIndex(schedule.start_time);
                            const endIdx = parseTimeToSlotIndex(schedule.end_time);
                            const height = (endIdx - startIdx) * 24;
                            const layout = layouts.find((item) => item.schedule.id === schedule.id);
                            
                            const left = layout ? `${layout.leftPct}%` : "0%";
                            const width = layout ? `${layout.widthPct}%` : "100%";
                            const deptCode = schedule.course?.course_code?.substring(0, 4) || "GEN";
                            const isLab = getClassType(schedule) === 'Laboratory';

                            return (
                              <div
                                key={schedule.id}
                                className={`group z-10 m-0.5 rounded-xl border-2 border-l-4 p-2 overflow-visible text-left flex flex-col justify-between font-sans shadow-sm select-none transition-all duration-150 hover:scale-[1.02] hover:shadow-md hover:z-30 ${getDeptStyles(deptCode)}`}
                                style={{
                                  gridColumn: dayIndex + 2,
                                  gridRow: `${startIdx + 2} / span ${Math.max(1, endIdx - startIdx)}`,
                                  height: `${Math.max(24, height) - 4}px`,
                                  marginLeft: `calc(${left} + 2px)`,
                                  width: `calc(${width} - 4px)`,
                                  fontSize: '9px',
                                  lineHeight: '1.2'
                                }}
                              >
                                {/* Header */}
                                <div className="min-w-0 flex items-center justify-between gap-1">
                                  <p className="font-black truncate text-gray-900">
                                    {schedule.course?.course_code || "Course"}
                                  </p>
                                  <span className={`px-1 rounded-[3px] text-[7.5px] font-black uppercase tracking-wider scale-90 ${
                                    isLab
                                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}>
                                    {isLab ? 'LAB' : 'LEC'}
                                  </span>
                                </div>

                                {/* Details Body */}
                                <div className="mt-1 flex-1 flex flex-col justify-end text-[8px] font-bold text-slate-600 space-y-0.5 min-w-0">
                                  <p className="truncate font-black text-[#5A1220]">{schedule.section?.section_name}</p>
                                  <p className="truncate text-slate-800">
                                    👤 {schedule.faculty ? `${schedule.faculty.first_name} ${schedule.faculty.last_name}` : 'Unassigned'}
                                  </p>
                                  <p className="truncate text-slate-800">
                                    🚪 {room.room_code}
                                  </p>
                                </div>

                                <TimetableCardTooltip
                                  code={schedule.course?.course_code || 'Subject'}
                                  name={`${schedule.course?.course_name || 'No course name'} (${schedule.section?.section_name || 'Unassigned section'})`}
                                  instructor={schedule.faculty ? `${schedule.faculty.first_name} ${schedule.faculty.last_name}` : 'Unassigned'}
                                  location={`${room.building || 'Main'} - ${room.room_code}`}
                                  time={`${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}`}
                                  badge={isLab ? 'Laboratory' : 'Lecture'}
                                  align={['Thursday', 'Friday', 'Saturday'].includes(day) ? 'right' : 'left'}
                                />
                              </div>
                            );
                          })}
                      </React.Fragment>
                    );
                  })}
              </WeeklyTimetableGrid>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Day Tabs */}
            <div className="flex border-b border-gray-200 overflow-x-auto bg-gray-50/50">
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
                const count = schedules.filter(s => s.room_id === room.id && s.day === day).length;
                const isActive = activeTabDay === day;
                return (
                  <button
                    key={day}
                    onClick={() => setActiveTabDay(day)}
                    className={`flex-1 min-w-[90px] py-3 text-center border-b-2 font-bold text-xs transition-all uppercase tracking-wider cursor-pointer whitespace-nowrap px-4 ${
                      isActive
                        ? 'border-[#5A1220] text-[#5A1220] bg-white'
                        : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <span>{day}</span>
                    {count > 0 && (
                      <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        isActive ? 'bg-[#5A1220] text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Day Schedules List */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeRoomSchedules.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-center text-gray-400">
                  <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center border border-gray-200 mb-3">
                    <Calendar size={18} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">No classes scheduled</p>
                  <p className="text-[11px] text-gray-400 mt-1">Classroom is free and available during this timeframe.</p>
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
                        {/* Timeline node dot */}
                        <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center transition-colors ${
                          isCurrentlyRunning
                            ? 'border-emerald-500 ring-4 ring-emerald-100'
                            : 'border-[#5A1220]/70 group-hover:border-[#5A1220]'
                        }`}>
                          {isCurrentlyRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        </div>

                        {/* Schedule card box */}
                        <div className={`border rounded-2xl p-4 transition-all ${
                          isCurrentlyRunning
                            ? 'bg-emerald-50/20 border-emerald-150 shadow-sm'
                            : 'bg-gray-50/20 border-gray-150 hover:bg-gray-50/50 hover:border-gray-250 shadow-sm'
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
                              <p className="text-xs text-[#5A1220] font-bold font-mono">
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
                              <span className="text-gray-655 font-semibold truncate">
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
        )}
      </div>
    </div>
  );
}
