import { getPhilippineNowParts } from '../../lib/philippineTime';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  Calendar,
  DoorOpen,
  Landmark,
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
import { DAYS } from '../../pages/ClassSchedules/SchedulerPanel/constants';
import { TimetableLegend, TimetableTitleBar } from '../scheduling/TimetablePanel';
import {
  TIMETABLE_BLOCK_BASE,
  TIMETABLE_BLOCK_META,
  TIMETABLE_BLOCK_STYLES,
  TIMETABLE_BLOCK_TITLE,
  TIMETABLE_HEADER_BUTTON,
  TIMETABLE_HEADER_BUTTON_PRESSED,
  TIMETABLE_SWATCH,
} from '../scheduling/timetableStyles';
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
import { formatPersonName, type PersonNameParts } from '../../lib/personName';
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
  faculty?: (PersonNameParts & {
    id: number;
    first_name: string;
    last_name: string;
  }) | null;
}

/** Total class time for the printed header, e.g. "16 hrs" or "7.5 hrs". */
const formatPrintHours = (minutes: number) => {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
};

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
  /** Rendered before the room identity in the header, e.g. a back button. */
  leading?: ReactNode;
  /** Rendered at the right end of the header, e.g. the Request Room button. */
  actions?: ReactNode;
}

/** Restrained, low-saturation badge tones per room type. */
const TYPE_BADGE: Record<Room['room_type'], string> = {
  lecture: 'border-[#5A1220]/15 bg-[#5A1220]/[0.05] text-[#5A1220]',
  laboratory: 'border-slate-200 bg-slate-50 text-slate-700',
  online: 'border-sky-200 bg-sky-50 text-sky-700',
  field: 'border-amber-200 bg-amber-50 text-amber-800',
};

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

export default function RoomDetailContent({ room, schedules, isLoading, initialViewMode = 'list', highlightSlots = NO_SLOTS, semesterId, listMode = 'classes', onRequestSlot, borrowingClosedMessage = null, leading, actions }: RoomDetailContentProps) {
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
            facultyName: schedule.faculty ? formatPersonName(schedule.faculty) : null,
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
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {leading}
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-[54px] rounded-xl" />
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

  const isAvailable = room.status === 'available';
  const typeBadge = TYPE_BADGE[room.room_type] ?? TYPE_BADGE.lecture;
  const StatusIcon = isAvailable ? CheckCircle2 : room.status === 'not available' ? XCircle : HelpCircle;

  const infoCards: { label: string; icon: typeof Building2; value: ReactNode }[] = [
    { label: 'Building', icon: Building2, value: room.building || 'N/A' },
    { label: 'Type', icon: DoorOpen, value: <span className="capitalize">{room.room_type}</span> },
    {
      label: 'Status',
      icon: StatusIcon,
      value: <span className={`capitalize ${isAvailable ? 'text-emerald-700' : 'text-rose-700'}`}>{room.status}</span>,
    },
    { label: 'Department', icon: Landmark, value: room.department?.department_code || 'General' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="room-detail-print-info flex flex-col gap-3 font-sans sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#5A1220]/15 bg-[#5A1220]/[0.06] text-[#5A1220]">
            <Building2 size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-base font-bold uppercase leading-tight tracking-tight text-gray-900 sm:text-lg">
                {room.room_code}
              </h2>
              <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeBadge}`}>
                {room.room_type}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  isAvailable
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isAvailable ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden="true" />
                {room.status}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs font-medium text-gray-500">
              {room.building || 'No building assigned'}
              <span className="mx-1.5 text-gray-300" aria-hidden="true">/</span>
              {room.department ? `${room.department.department_code} Department` : 'General / All'}
            </p>
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 sm:self-center">{actions}</div>}
      </div>

      <div className="room-detail-print-info mt-4 grid grid-cols-2 gap-2.5 font-sans sm:grid-cols-4">
        {infoCards.map(({ label, icon: Icon, value }) => (
          <div key={label} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-gray-200/80 bg-gray-50/70 px-3 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500">
              <Icon size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
              <p className="truncate text-[13px] font-semibold leading-tight text-gray-800">{value}</p>
            </div>
          </div>
        ))}
        {room.room_type === 'laboratory' && (
          <div className="col-span-2 flex items-center gap-2.5 rounded-xl border border-gray-200/80 bg-gray-50/70 px-3 py-2.5 sm:col-span-4">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500">
              <BookOpen size={14} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Lecture Use</p>
              <p className="text-[13px] font-semibold leading-tight text-gray-800">
                {room.allow_lecture_usage
                  ? 'Allowed: major full-lecture courses may use this lab when it is vacant'
                  : 'Not allowed: laboratory classes only'}
              </p>
            </div>
          </div>
        )}
      </div>

      {(grantsError || grantsStale) && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 font-sans text-xs font-medium text-amber-900">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0 text-amber-600" />
            {grantsError
              ? 'Borrowed-room reservations could not be loaded, so lent time may be missing below.'
              : 'Borrowed-room reservations could not be refreshed; the ones shown may be out of date.'}
          </span>
          <button type="button" onClick={retryGrants} className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-800 transition hover:bg-amber-100 cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {borrowingClosedMessage && (
        <div role="status" className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 border-l-[3px] border-l-[#C9952A] bg-amber-50/80 px-3.5 py-2.5 font-sans">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#C9952A]/15 text-[#8a6418]">
            <Lock size={13} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#8a6418]">Borrowing closed</p>
            <p className="mt-0.5 text-xs font-medium text-amber-900">{borrowingClosedMessage}</p>
          </div>
        </div>
      )}

      <div className="room-detail-print-grid mt-3 flex min-h-0 flex-1 flex-col overflow-clip rounded-xl border border-slate-200 bg-white font-sans">
        <header className="room-print-title hidden">
          <div className="flex items-end justify-between gap-6 border-b-2 border-[#4e0a10] pb-2.5">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#9a6b14]">Weekly Classroom Schedule</p>
              <h1 className="mt-0.5 text-[22px] font-extrabold leading-none tracking-tight text-[#4e0a10]">{room.room_code}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] font-medium text-slate-600">
                <span>{room.building || 'No building assigned'}</span>
                <span aria-hidden="true" className="text-slate-300">|</span>
                <span className="capitalize">{room.room_type} room</span>
                <span aria-hidden="true" className="text-slate-300">|</span>
                <span>{room.department ? `${room.department.department_code} Department` : 'General / All Departments'}</span>
              </p>
            </div>
            <dl className="flex shrink-0 items-stretch gap-0 text-right">
              {[
                { label: 'Classes', value: String(roomGridCards.length) },
                { label: 'Weekly Hours', value: formatPrintHours(roomGridCards.reduce((total, { schedule }) => total + schedule.durationSlots * slotMinutes(), 0)) },              ].map(({ label, value }, index) => (
                <div key={label} className={`px-3.5 ${index > 0 ? 'border-l border-slate-200' : ''} last:pr-0`}>
                  <dt className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</dt>
                  <dd className="mt-0.5 text-[13px] font-bold tabular-nums leading-tight text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>
        <TimetableTitleBar
          className="room-detail-print-toolbar"
          title="Weekly Classroom Schedule"
          highlight={room.room_code}
          detail={room.building || undefined}
          actions={(['list', 'grid'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={`${TIMETABLE_HEADER_BUTTON} ${viewMode === mode ? TIMETABLE_HEADER_BUTTON_PRESSED : ''}`}
            >
              {mode === 'list' ? 'List View' : 'Grid View'}
            </button>
          ))}
        />

        {viewMode === 'grid' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="room-detail-print-scroll min-h-0 flex-1 overflow-auto">
            <WeeklyTimetableGrid
              days={DAYS}
              slotCount={Math.max(slotCount(), ...roomGridCards.map(({ schedule }) => schedule.startSlot + schedule.durationSlots))}
              minWidth={760}
              className="shrink-0"
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
                    className={`${TIMETABLE_BLOCK_BASE} select-none p-1.5 px-2 ${TIMETABLE_BLOCK_STYLES[band.kind === 'borrowed' ? 'borrowed' : 'occupied']}`}
                    style={{ gridColumn: band.dayIndex + 2, gridRow: `${startSlot + 2} / span ${span}` }}
                  >
                    <p className={`flex items-center gap-1 ${TIMETABLE_BLOCK_TITLE}`}>
                      {band.kind === 'borrowed' ? <ArrowLeftRight size={11} className="shrink-0" /> : <Lock size={11} className="shrink-0" />}
                      <span className="truncate">{band.label}</span>
                    </p>
                    <p className={`mt-0.5 ${TIMETABLE_BLOCK_META}`}>{range}</p>
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
                    className="pointer-events-none relative z-30 mx-[3px] my-px rounded-lg border-2 border-[#C9952A] bg-[#C9952A]/10 ring-4 ring-[#C9952A]/25"
                    style={{ gridColumn: dayIndex + 2, gridRow: `${startSlot + 2} / span ${span}` }}
                  >
                    <span className="absolute -top-2.5 right-1.5 rounded-full bg-[#C9952A] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm">
                      Requested slot
                    </span>
                  </div>
                );
              })}
              {roomGridCards.map(({ schedule, subject }) => (
                // Print only: a plain card with just the course name and class time.
                <div
                  key={`print-${schedule.id}`}
                  aria-hidden="true"
                  className={`room-print-card ${TIMETABLE_BLOCK_BASE} hidden flex-col justify-between gap-1 border px-2 py-1.5 ${TIMETABLE_SWATCH[subject.category === 'minor' ? 'minor' : 'major']}`}
                  style={{ gridColumn: schedule.dayIndex + 2, gridRow: `${schedule.startSlot + 2} / span ${schedule.durationSlots}` }}
                >
                  <p className={`truncate text-[15px] font-extrabold uppercase leading-tight tracking-tight ${subject.category === 'minor' ? 'text-[#7a5410]' : 'text-[#4e0a10]'}`}>
                    {schedule.courseCode}
                  </p>
                  <p className="text-[11px] font-semibold tabular-nums leading-none text-slate-600">
                    {schedule.startTime} – {schedule.endTime}
                  </p>
                </div>
              ))}
              {roomGridCards.map(({ schedule, subject }) => (
                <div key={schedule.id} className="room-screen-card contents">
                <ScheduleCard
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
                </div>
              ))}
            </WeeklyTimetableGrid>
            </div>
            <TimetableLegend
              className="room-print-legend"
              groups={[
                {
                  label: 'Subjects',
                  items: roomGridCards.length > 0
                    ? [
                        { label: 'Major', swatch: TIMETABLE_SWATCH.major },
                        { label: 'Minor', swatch: TIMETABLE_SWATCH.minor },
                      ]
                    : [],
                },
                {
                  label: 'Slots',
                  items: [
                    ...(borrowingClosedMessage ? [] : [{ label: 'Available', swatch: TIMETABLE_SWATCH.available }]),
                    { label: 'Occupied', swatch: TIMETABLE_SWATCH.occupied },
                    { label: 'Borrowed', swatch: TIMETABLE_SWATCH.borrowed },
                    ...(highlightSlots.length > 0 ? [{ label: 'Requested slot', swatch: TIMETABLE_SWATCH.requested }] : []),
                  ],
                },
              ]}
            />
            <footer className="room-print-footer hidden items-center justify-between pt-2 text-[9px] font-medium text-slate-400">
              <span>{room.room_code}{room.building ? ` · ${room.building}` : ''} · Weekly Classroom Schedule</span>
              <span>Generated by WICARS</span>
            </footer>
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
                    aria-pressed={isActive}
                    className={`selection-indicator flex-1 min-w-[90px] py-3 text-center border-b-2 font-bold text-xs transition-all uppercase tracking-wider cursor-pointer whitespace-nowrap px-4 ${
                      isActive
                        ? ''
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
                        className="selection-indicator-count ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
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
                                  ? formatPersonName(sched.faculty)
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
