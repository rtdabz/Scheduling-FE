import { getPhilippineNowParts } from '../../lib/philippineTime';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  Clock,
  Building2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Lock,
  Send,
} from 'lucide-react';
import Skeleton from './Skeleton';
import WeeklyTimetableGrid from '../scheduling/WeeklyTimetableGrid';
import ScheduleCard from '../../pages/ClassSchedules/SchedulerPanel/TimetableGrid/ScheduleCard';
import { DAYS, GRID_HEADER_HEIGHT_PX, SLOT_HEIGHT_PX } from '../../pages/ClassSchedules/SchedulerPanel/constants';
import { gridOpeningMinutes, slotCount, slotMinutes, slotToTimeLabel, timeToSlot } from '../../lib/timeGrid';
import {
  formatDuration,
  fromMinutes,
  freeWindows,
  REQUEST_DURATIONS,
  subtractRanges,
  toMinutes,
  type MinuteRange,
  type RoomRequestWindow,
} from '../../lib/roomRequests';
import { useRoomGrants } from '../../hooks/useRoomGrants';
import type { LinkedSlot } from '../../lib/notificationLink';
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
  allow_lecture_usage?: boolean;
  status: 'available' | 'not available';
  department_id: number | null;
  department: Department | null;
}

interface Schedule {
  id: number;
  semester_id: number;
  section_id: number | null;
  course_id: number | null;
  faculty_id: number | null;
  room_id: number;
  department_id: number;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  start_time: string;
  end_time: string;
  mode: string;
  meeting_type?: 'lecture' | 'laboratory' | null;
  status: string;
  /** Another department's class: its details are withheld and it shows only as "Occupied". */
  is_masked?: boolean;
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
  initialViewMode?: 'list' | 'grid';
  highlightSlots?: LinkedSlot[];
  /** Semester whose borrowing grants are shown; defaults to the active one. */
  semesterId?: number | null;
  /**
   * What List View shows: the room's classes, or only the free time a department can
   * request (clear of classes and borrowed windows, at least the shortest request length).
   */
  listMode?: 'classes' | 'availability';
  /** Offered on each free window in availability mode; the request is re-validated on send. */
  onRequestSlot?: (choice: { day: string; start: string; duration: number }) => void;
  /**
   * Set while the owning department's timetable awaits final VPAA approval: no free
   * time is offered for borrowing, and this message is shown instead.
   */
  borrowingClosedMessage?: string | null;
}

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toHHMM = (time: string) => time.slice(0, 5);

/** Overlapping or touching ranges joined into one. */
const mergeRanges = (ranges: MinuteRange[]): MinuteRange[] => {
  const merged: MinuteRange[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
};

const rangeOf = (block: { start_time: string; end_time: string }): MinuteRange => ({
  start: toMinutes(block.start_time),
  end: toMinutes(block.end_time),
});

interface GridBand {
  key: string;
  kind: 'occupied' | 'borrowed';
  dayIndex: number;
  start: number;
  end: number;
  label: string;
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

const NO_SLOTS: LinkedSlot[] = [];

export default function RoomDetailContent({ room, schedules, isLoading, initialViewMode = 'list', highlightSlots = NO_SLOTS, semesterId, listMode = 'classes', onRequestSlot, borrowingClosedMessage = null }: RoomDetailContentProps) {
  const [activeTabDay, setActiveTabDay] = useState<string>(() => {
    if (highlightSlots[0]) return highlightSlots[0].day;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[getPhilippineNowParts().weekdayIndex];
  });
  const scrolledToHighlight = useRef(false);
  const scrollToHighlight = useCallback((node: HTMLDivElement | null) => {
    if (!node || scrolledToHighlight.current) return;
    scrolledToHighlight.current = true;
    node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, []);
  const activeDayHighlights = useMemo(
    () => highlightSlots.filter((slot) => slot.day === activeTabDay),
    [highlightSlots, activeTabDay],
  );
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(initialViewMode);
  const { grants: roomGrants, ready: grantsReady, error: grantsError, stale: grantsStale, retry: retryGrants } = useRoomGrants(room?.id ?? null, semesterId);
  const activeDayGrants = useMemo(
    () => roomGrants
      .filter((block) => block.day === activeTabDay)
      .sort((a, b) => getMinutes(a.start_time) - getMinutes(b.start_time)),
    [roomGrants, activeTabDay],
  );

  const activeRoomSchedules = useMemo(() => {
    if (!room) return [];
    return schedules
      .filter(s => s.room_id === room.id && s.day === activeTabDay)
      .sort((a, b) => getMinutes(a.start_time) - getMinutes(b.start_time));
  }, [room, schedules, activeTabDay]);

  const roomGridCards = useMemo(() => {
    if (!room) return [];

    return schedules
      .filter((schedule) => schedule.room_id === room.id && !schedule.is_masked)
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
            semesterId: schedule.semester_id,
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

  /**
   * Background bands drawn beside the class cards without ever overlapping them:
   * a borrowed window shows only where no visible class already fills it, and another
   * department's class shows only as "Occupied" outside any borrowed window.
   */
  const gridBands = useMemo<GridBand[]>(() => {
    if (!room) return [];
    const bands: GridBand[] = [];
    DAYS.forEach((day, dayIndex) => {
      const daySchedules = schedules.filter((s) => s.room_id === room.id && s.day === day);
      const cards = daySchedules.filter((s) => !s.is_masked).map(rangeOf);
      const dayGrants = roomGrants.filter((grant) => grant.day === day);
      dayGrants.forEach((grant, grantIndex) => {
        subtractRanges(rangeOf(grant), cards).forEach((part, partIndex) => {
          bands.push({
            key: `grant-${day}-${grantIndex}-${partIndex}`,
            kind: 'borrowed',
            dayIndex,
            ...part,
            label: `Borrowed by ${grant.department_code ?? 'another dept'}`,
          });
        });
      });
      const taken = [...cards, ...dayGrants.map(rangeOf)];
      mergeRanges(daySchedules.filter((s) => s.is_masked).map(rangeOf)).forEach((range, rangeIndex) => {
        subtractRanges(range, taken).forEach((part, partIndex) => {
          bands.push({ key: `occupied-${day}-${rangeIndex}-${partIndex}`, kind: 'occupied', dayIndex, ...part, label: 'Occupied' });
        });
      });
    });
    return bands;
  }, [room, schedules, roomGrants]);

  /** Every booking in the room: the same set the request picker and the server check against. */
  const bookedWindows = useMemo<RoomRequestWindow[]>(() => {
    if (!room) return [];
    return [
      ...schedules
        .filter((s) => s.room_id === room.id)
        .map((s) => ({ day: s.day, start_time: toHHMM(s.start_time), end_time: toHHMM(s.end_time) })),
      ...roomGrants.map((grant) => ({ day: grant.day, start_time: toHHMM(grant.start_time), end_time: toHHMM(grant.end_time) })),
    ];
  }, [room, schedules, roomGrants]);

  const roomStatus = room?.status;
  const availableByDay = useMemo<Record<string, RoomRequestWindow[]>>(() => {
    const opening = gridOpeningMinutes();
    const closing = opening + slotCount() * slotMinutes();
    return Object.fromEntries(ALL_DAYS.map((day) => [
      day,
      roomStatus === 'available' ? freeWindows(day, bookedWindows, opening, closing, REQUEST_DURATIONS[0].minutes) : [],
    ]));
  }, [roomStatus, bookedWindows]);

  const showAvailability = listMode === 'availability';

  const schedulerRoom = useMemo<SchedulerRoom | null>(() => room ? ({
    id: String(room.id),
    name: room.room_code,
    departmentId: room.department_id,
    roomType: room.room_type,
    status: room.status,
  }) : null, [room]);

  if (isLoading || !room || !grantsReady) {
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
      <div className="room-detail-print-info flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-sans border-b border-gray-150 pb-3">
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

      <div className="room-detail-print-info grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-sans mt-3">
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
        {room.room_type === 'laboratory' && (
          <div className="col-span-2 sm:col-span-4 bg-gray-50 rounded-lg py-2 px-3 border border-gray-100 shadow-sm">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-455 mb-0.5">Lecture Use</p>
            <p className="text-xs font-bold text-gray-700">
              {room.allow_lecture_usage
                ? 'Allowed: major full-lecture courses may use this lab when it is vacant'
                : 'Not allowed: laboratory classes only'}
            </p>
          </div>
        )}
      </div>

      {(grantsError || grantsStale) && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-sans text-xs font-semibold text-amber-800">
          <span>
            {grantsError
              ? 'Borrowed-room reservations could not be loaded, so lent time may be missing below.'
              : 'Borrowed-room reservations could not be refreshed; the ones shown may be out of date.'}
          </span>
          <button type="button" onClick={retryGrants} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100 cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {borrowingClosedMessage && (
        <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-sans text-xs font-semibold text-amber-800">
          <Lock size={14} className="shrink-0" />
          <span>{borrowingClosedMessage}</span>
        </div>
      )}

      <div className="room-detail-print-grid flex-1 flex flex-col min-h-0 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm font-sans mt-3">
        <div className="room-print-title hidden px-2 pb-2 text-base font-bold uppercase text-slate-900">
          {room.room_code} {room.building ? `- ${room.building}` : ''}
        </div>
        <div className="room-detail-print-toolbar flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50/50 flex-wrap gap-3">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Weekly Classroom Schedule</h3>
          
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
            <ul className="mb-3 flex flex-wrap items-center gap-4 text-[11px] font-bold text-gray-500" aria-label="Legend">
              {!borrowingClosedMessage && (
                <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-slate-200 bg-white" /> Available</li>
              )}
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-slate-300 bg-slate-100" /> Occupied</li>
              <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-dashed border-orange-300 bg-orange-50" /> Borrowed</li>
            </ul>
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
              {gridBands.map((band) => {
                const startSlot = timeToSlot(fromMinutes(band.start));
                const span = Math.max(1, timeToSlot(fromMinutes(band.end)) - startSlot);
                const range = `${formatTime(fromMinutes(band.start))} - ${formatTime(fromMinutes(band.end))}`;
                return (
                  <div
                    key={band.key}
                    title={`${band.label} · ${range}`}
                    aria-label={`${band.label}, ${DAYS[band.dayIndex]} ${range}`}
                    className={`m-0.5 select-none overflow-hidden rounded-lg px-2 py-1 ${
                      band.kind === 'borrowed'
                        ? 'border-2 border-dashed border-orange-300 bg-orange-50/80 text-orange-800'
                        : 'border border-slate-300 bg-slate-100 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(100,116,139,0.08)_6px,rgba(100,116,139,0.08)_12px)] text-slate-600'
                    }`}
                    style={{ gridColumn: band.dayIndex + 2, gridRow: `${startSlot + 2} / span ${span}` }}
                  >
                    <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide">
                      {band.kind === 'borrowed' ? <ArrowLeftRight size={11} /> : <Lock size={11} />}
                      <span className="truncate">{band.label}</span>
                    </p>
                    <p className="text-[10px] font-semibold">{range}</p>
                  </div>
                );
              })}
              {highlightSlots.map((slot, index) => {
                const dayIndex = DAYS.indexOf(slot.day);
                if (dayIndex < 0) return null;
                const startSlot = timeToSlot(slot.start_time);
                const span = Math.max(1, timeToSlot(slot.end_time) - startSlot);
                return (
                  <div
                    key={`highlight-${slot.day}-${slot.start_time}-${index}`}
                    ref={index === 0 ? scrollToHighlight : undefined}
                    title={`Requested slot · ${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}`}
                    className="pointer-events-none relative z-30 m-0.5 rounded-lg border-2 border-[#C9952A] bg-[#C9952A]/10 ring-4 ring-[#C9952A]/25"
                    style={{ gridColumn: dayIndex + 2, gridRow: `${startSlot + 2} / span ${span}` }}
                  >
                    <span className="absolute -top-2.5 right-1.5 rounded-full bg-[#C9952A] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm">
                      Requested slot
                    </span>
                  </div>
                );
              })}
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
            <div className="flex border-b border-gray-200 overflow-x-auto bg-gray-50/50">
              {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
                const count = showAvailability
                  ? (borrowingClosedMessage ? 0 : availableByDay[day].length)
                  : schedules.filter(s => s.room_id === room.id && s.day === day).length;
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
                    {highlightSlots.some((slot) => slot.day === day) && (
                      <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[#C9952A]" aria-label="Requested slot" />
                    )}
                    {count > 0 && (
                      <span
                        title={showAvailability ? `${count} available time slot${count === 1 ? '' : 's'}` : undefined}
                        className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                          showAvailability
                            ? (isActive ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700')
                            : (isActive ? 'bg-[#5A1220] text-white' : 'bg-gray-200 text-gray-600')
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {activeDayHighlights.length > 0 && (
                <div className="mb-3 space-y-2">
                  {activeDayHighlights.map((slot, index) => (
                    <div
                      key={`highlight-${slot.start_time}-${index}`}
                      ref={index === 0 ? scrollToHighlight : undefined}
                      className="flex items-center justify-between gap-3 rounded-xl border-2 border-[#C9952A] bg-[#C9952A]/10 px-4 py-2.5 text-[#8a6418] ring-4 ring-[#C9952A]/20"
                    >
                      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                        <Clock size={14} />
                        Requested slot
                      </span>
                      <span className="text-xs font-bold">{formatTime(slot.start_time)} - {formatTime(slot.end_time)}</span>
                    </div>
                  ))}
                </div>
              )}
              {showAvailability ? (
                borrowingClosedMessage ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center">
                    <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center border border-amber-200 mb-3">
                      <Lock size={18} />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Unavailable for borrowing</p>
                    <p className="text-[11px] text-gray-500 mt-1 max-w-md">{borrowingClosedMessage}</p>
                  </div>
                ) : grantsError ? (
                  <div role="alert" className="py-8 text-center text-xs font-semibold text-amber-800">
                    Available times cannot be shown until borrowed-room reservations load. Use Retry above.
                  </div>
                ) : availableByDay[activeTabDay].length === 0 ? (
                  <div className="py-8 flex flex-col items-center justify-center text-center text-gray-400">
                    <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center border border-gray-200 mb-3">
                      <Calendar size={18} />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-500">No available time slots</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {room.status !== 'available'
                        ? `${room.room_code} is not available for scheduling.`
                        : `Every window of at least ${formatDuration(REQUEST_DURATIONS[0].minutes)} on ${activeTabDay} is occupied or borrowed. Try another day.`}
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2" aria-label={`Available time slots on ${activeTabDay}`}>
                    {availableByDay[activeTabDay].map((slot) => {
                      const length = toMinutes(slot.end_time) - toMinutes(slot.start_time);
                      const duration = [...REQUEST_DURATIONS].reverse().find((option) => option.minutes <= length)?.minutes
                        ?? REQUEST_DURATIONS[0].minutes;
                      return (
                        <li
                          key={`${slot.day}-${slot.start_time}`}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <CheckCircle2 size={16} className="text-emerald-600" />
                            <div>
                              <p className="text-sm font-bold text-gray-800">{formatTime(slot.start_time)} - {formatTime(slot.end_time)}</p>
                              <p className="text-[11px] font-semibold text-emerald-700">Available · {formatDuration(length)} free</p>
                            </div>
                          </div>
                          {onRequestSlot && (
                            <button
                              type="button"
                              onClick={() => onRequestSlot({ day: slot.day, start: slot.start_time, duration })}
                              aria-label={`Request ${activeTabDay} from ${formatTime(slot.start_time)}`}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5A1220] px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#4e0a10] cursor-pointer"
                            >
                              <Send size={13} />
                              Request
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : (
              <>
              {activeDayGrants.length > 0 && (
                <div className="mb-5 space-y-2">
                  {activeDayGrants.map((block, index) => (
                    <div key={`grant-${block.start_time}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 px-4 py-2.5 text-orange-800">
                      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                        <ArrowLeftRight size={14} />
                        Borrowed by {block.department_code ?? 'another department'}
                      </span>
                      <span className="text-xs font-bold">{formatTime(block.start_time)} - {formatTime(block.end_time)}</span>
                    </div>
                  ))}
                </div>
              )}
              {activeRoomSchedules.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-center text-gray-400">
                  <div className="w-10 h-10 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center border border-gray-200 mb-3">
                    <Calendar size={18} />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400">No classes scheduled</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {activeDayGrants.length > 0 ? 'Outside the borrowed windows above, the classroom is free.' : 'Classroom is free and available during this timeframe.'}
                  </p>
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
                        <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-white flex items-center justify-center transition-colors ${
                          isCurrentlyRunning
                            ? 'border-emerald-500 ring-4 ring-emerald-100'
                            : 'border-[#5A1220]/70 group-hover:border-[#5A1220]'
                        }`}>
                          {isCurrentlyRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        </div>

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
              </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
