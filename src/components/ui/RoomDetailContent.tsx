import { getPhilippineNowParts } from '../../lib/philippineTime';

import { useMemo, useState } from 'react';
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
import ScheduleCard from '../../pages/ClassSchedules/SchedulerPanel/TimetableGrid/ScheduleCard';
import { DAYS, GRID_HEADER_HEIGHT_PX, SLOT_HEIGHT_PX } from '../../pages/ClassSchedules/SchedulerPanel/constants';
import { slotCount, slotToTimeLabel, timeToSlot } from '../../lib/timeGrid';
import type {
  Room as SchedulerRoom,
  ScheduleItem,
  Subject,
} from '../../pages/ClassSchedules/SchedulerPanel/types';

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
  meeting_type?: 'lecture' | 'laboratory' | null;
  status: string;
  section?: {
    id: number;
    section_name: string;
  } | null;
  course?: {
    id: number;
    course_code: string;
    course_name: string;
    course_category?: 'major' | 'minor';
    units?: number | string | null;
    lecture_hours?: number | string | null;
    lab_hours?: number | string | null;
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

const noop = () => undefined;

export default function RoomDetailContent({ room, schedules, isLoading }: RoomDetailContentProps) {
  const [activeTabDay, setActiveTabDay] = useState<string>(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[getPhilippineNowParts().weekdayIndex];
  });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const activeRoomSchedules = useMemo(() => {
    if (!room) return [];
    return schedules
      .filter(s => s.room_id === room.id && s.day === activeTabDay)
      .sort((a, b) => getMinutes(a.start_time) - getMinutes(b.start_time));
  }, [room, schedules, activeTabDay]);

  const roomGridCards = useMemo(() => {
    if (!room) return [];

    return schedules
      .filter((schedule) => schedule.room_id === room.id)
      .map((schedule): { schedule: ScheduleItem; subject: Subject } | null => {
        const dayIndex = DAYS.indexOf(schedule.day);
        if (dayIndex < 0) return null;

        const startSlot = timeToSlot(schedule.start_time);
        const endSlot = timeToSlot(schedule.end_time);
        const category = schedule.course?.course_category === 'minor' ? 'minor' : 'major';
        const courseId = String(schedule.course_id);

        return {
          schedule: {
            id: String(schedule.id),
            termId: schedule.term_id,
            departmentId: schedule.department_id,
            courseId,
            subjectId: courseId,
            courseCode: schedule.course?.course_code ?? 'Course',
            subjectCode: schedule.course?.course_code ?? 'Course',
            courseName: schedule.course?.course_name ?? 'No course name',
            subjectName: schedule.course?.course_name ?? 'No course name',
            courseType: category,
            subjectType: category,
            lectureUnits: Number(schedule.course?.lecture_hours ?? 0),
            laboratoryUnits: Number(schedule.course?.lab_hours ?? 0),
            totalUnits: Number(schedule.course?.units ?? 0),
            sectionName: schedule.section?.section_name ?? '',
            roomName: room.room_code,
            day: DAYS[dayIndex],
            startTime: formatTime(schedule.start_time),
            endTime: formatTime(schedule.end_time),
            mode: schedule.mode === 'online' || schedule.mode === 'field' ? schedule.mode : 'on-site',
            facultyName: schedule.faculty
              ? `${schedule.faculty.first_name} ${schedule.faculty.last_name}`.trim()
              : null,
            facultyId: schedule.faculty_id == null ? null : String(schedule.faculty_id),
            status: schedule.status as ScheduleItem['status'],
            dayIndex,
            startSlot,
            durationSlots: Math.max(1, endSlot - startSlot),
            sectionId: String(schedule.section_id),
            roomId: String(room.id),
            meetingType: schedule.meeting_type ?? null,
          },
          subject: {
            id: courseId,
            code: schedule.course?.course_code ?? 'Course',
            name: schedule.course?.course_name ?? 'No course name',
            units: Number(schedule.course?.units ?? 0),
            lectureHours: Number(schedule.course?.lecture_hours ?? 0),
            labHours: Number(schedule.course?.lab_hours ?? 0),
            category,
            semester: '1st',
            departmentId: schedule.department_id,
            yearLevel: 1,
            roomTypeRequired: room.room_type === 'laboratory' ? 'laboratory' : 'lecture',
            status: 'active',
          },
        };
      })
      .filter((item): item is { schedule: ScheduleItem; subject: Subject } => item !== null);
  }, [room, schedules]);

  const schedulerRoom = useMemo<SchedulerRoom | null>(() => room ? ({
    id: String(room.id),
    name: room.room_code,
    departmentId: room.department_id,
    roomType: room.room_type,
    status: room.status,
  }) : null, [room]);

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
          <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4 sm:p-5">
            <WeeklyTimetableGrid
              days={DAYS}
              slotCount={Math.max(slotCount(), ...roomGridCards.map(({ schedule }) => schedule.startSlot + schedule.durationSlots))}
              headerHeight={GRID_HEADER_HEIGHT_PX}
              rowTemplate={`repeat(${Math.max(slotCount(), ...roomGridCards.map(({ schedule }) => schedule.startSlot + schedule.durationSlots))}, ${SLOT_HEIGHT_PX}px)`}
              minWidth={900}
              className="min-h-full shrink-0"
              getTimeLabel={slotToTimeLabel}
              getDayCount={(dayIndex) => roomGridCards.filter(({ schedule }) => schedule.dayIndex === dayIndex).length}
            >
              {roomGridCards.map(({ schedule, subject }) => (
                <ScheduleCard
                  key={schedule.id}
                  rooms={schedulerRoom ? [schedulerRoom] : []}
                  schedule={schedule}
                  subject={subject}
                  isEditable={false}
                  isPhase2Active={false}
                  currentStatus="finalized"
                  draggedScheduleId={null}
                  isMoving={false}
                  deleteConfirmScheduleId={null}
                  setDeleteConfirmScheduleId={noop}
                  onDragStart={noop}
                  onDragEnd={noop}
                  onDelete={noop}
                  onCardClick={noop}
                  isReadOnlyViewer
                />
              ))}
            </WeeklyTimetableGrid>
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
