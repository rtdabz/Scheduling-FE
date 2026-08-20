import React from 'react';
import { BookOpen, CalendarDays, Globe2, MapPin } from 'lucide-react';
import WeeklyTimetableGrid from './WeeklyTimetableGrid';
import { FULL_DAY_NAMES, timeToSlot, slotCount, slotToTimeLabel, formatTime12h } from '../../lib/timeGrid';

export interface DashboardSchedule {
  id: number | string;
  day: string;
  start_time: string;
  end_time: string;
  mode?: string | null;
  category?: string | null;
  faculty_id?: number | string | null;
  room_id?: number | string | null;
  course?: { course_code?: string; course_category?: string | null; category?: string | null; units?: number; lecture_units?: number; laboratory_units?: number } | null;
  subject?: { subject_code?: string; subject_category?: string | null; category?: string | null; units?: number; lecture_units?: number; laboratory_units?: number } | null;
  section?: { section_name?: string } | null;
  room?: { room_code?: string; room_type?: string } | null;
};

interface DashboardTimetableGridProps {
  schedules: DashboardSchedule[];
  sectionLabel: string;
  onOpenSchedule: () => void;
}

const dayIndex = (value: string) => {
  const short = value.trim().slice(0, 3).toLowerCase();
  return FULL_DAY_NAMES.findIndex(day => day.slice(0, 3).toLowerCase() === short);
};

/**
 * Major/minor classification driving the maroon vs gold card treatment.
 *
 * The column is courses.course_category (subjects: subject_category) — the same
 * fields InstructorTimetableModal and GenerateScheduleModal read. Reading a bare
 * `category` matched nothing, so every card silently fell back to 'major' and
 * the gold Minor styling and its legend swatch were unreachable.
 *
 * Note this is a different axis from the course_categories table (GEC,
 * Laboratory, Field, Research, Other), which must not be used here.
 */
const scheduleCategory = (schedule: DashboardSchedule) => (
  schedule.category
  ?? schedule.course?.course_category ?? schedule.course?.category
  ?? schedule.subject?.subject_category ?? schedule.subject?.category
  ?? 'major'
).toLowerCase();

/**
 * Delivery mode of a class: the `mode` column wins, the room's type is the
 * fallback for rows written before that column existed.
 *
 * Only `field` needs a card badge. On-site and online are already stated by the
 * header toggle, which is what the cards are filtered by — repeating it on
 * every card said nothing. Field is the exception: it is not online, so it
 * shows up under the on-site toggle, yet it occupies no room.
 */
const isOnline = (schedule: DashboardSchedule) =>
  schedule.mode?.toLowerCase().includes('online') === true
  || (schedule.room?.room_type ?? '').toLowerCase().includes('online');

const isField = (schedule: DashboardSchedule) =>
  schedule.mode?.toLowerCase().includes('field') === true
  || (schedule.room?.room_type ?? '').toLowerCase().includes('field');

const getCardLayouts = (schedules: DashboardSchedule[]) => {
  const layouts = new Map<number | string, { leftPct: number; widthPct: number }>();
  const sorted = [...schedules].sort((a, b) => timeToSlot(a.start_time) - timeToSlot(b.start_time));
  const groups: DashboardSchedule[][] = [];

  sorted.forEach((schedule) => {
    const lastGroup = groups.at(-1);
    const groupEnd = lastGroup
      ? Math.max(...lastGroup.map(item => timeToSlot(item.end_time)))
      : -1;
    if (!lastGroup || timeToSlot(schedule.start_time) >= groupEnd) groups.push([schedule]);
    else lastGroup.push(schedule);
  });

  groups.forEach((group) => {
    const columnEnds: number[] = [];
    const assignments = group.map((schedule) => {
      const start = timeToSlot(schedule.start_time);
      const end = Math.max(start + 1, timeToSlot(schedule.end_time));
      let column = columnEnds.findIndex(columnEnd => columnEnd <= start);
      if (column === -1) column = columnEnds.length;
      columnEnds[column] = end;
      return { schedule, column };
    });
    const widthPct = 100 / Math.max(1, columnEnds.length);
    assignments.forEach(({ schedule, column }) => layouts.set(schedule.id, {
      leftPct: column * widthPct,
      widthPct,
    }));
  });

  return layouts;
};

export default function DashboardTimetableGrid({
  schedules,
  sectionLabel,
  onOpenSchedule,
}: DashboardTimetableGridProps) {
  const [deliveryMode, setDeliveryMode] = React.useState<'on-site' | 'online'>('on-site');
  const todayIndex = (new Date().getDay() + 6) % 7;
  const todayName = FULL_DAY_NAMES[todayIndex];
  const visibleSchedules = schedules.filter(schedule =>
    dayIndex(schedule.day) === todayIndex && (deliveryMode === 'online' ? isOnline(schedule) : !isOnline(schedule))
  );
  const cardLayouts = getCardLayouts(visibleSchedules);
  const placedSubjects = new Set(visibleSchedules.map(schedule => (
    schedule.course?.course_code ?? schedule.subject?.subject_code ?? schedule.id
  ))).size;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/60 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-base font-black text-slate-900">
            <CalendarDays className="h-5 w-5 text-[#4e0a10]" />
            Timetable Grid
          </h2>
          <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{sectionLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Delivery mode">
            <button
              type="button"
              onClick={() => setDeliveryMode('on-site')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition ${deliveryMode === 'on-site' ? 'bg-[#4e0a10] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
              aria-pressed={deliveryMode === 'on-site'}
            >
              <MapPin className="h-3.5 w-3.5" /> On-site
            </button>
            <button
              type="button"
              onClick={() => setDeliveryMode('online')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black transition ${deliveryMode === 'online' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
              aria-pressed={deliveryMode === 'online'}
            >
              <Globe2 className="h-3.5 w-3.5" /> Online
            </button>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold tabular-nums text-slate-600">
            {visibleSchedules.length} {visibleSchedules.length === 1 ? 'class' : 'classes'} &middot; {placedSubjects} {placedSubjects === 1 ? 'subject' : 'subjects'}
          </span>
          <button type="button" onClick={onOpenSchedule} className="inline-flex items-center gap-1.5 rounded-xl border border-[#4e0a10] bg-[#4e0a10] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#6b0e17]">
            <BookOpen className="h-3.5 w-3.5" />
            Open Schedule Builder
          </button>
        </div>
      </header>

      <div className="overflow-hidden bg-slate-50/70 p-4">
        <WeeklyTimetableGrid
          days={[todayName]}
          slotCount={slotCount()}
          headerHeight={54}
          timeColumnWidth={88}
          slotHeight={24}
          minWidth={0}
          getTimeLabel={slotToTimeLabel}
          getDayCount={() => visibleSchedules.length}
        >
          {visibleSchedules.map(schedule => {
            const start = Math.max(0, timeToSlot(schedule.start_time));
            const end = Math.max(start + 1, timeToSlot(schedule.end_time));
            const duration = end - start;
            const category = scheduleCategory(schedule);
            const isMinor = category === 'minor';
            const code = schedule.course?.course_code ?? schedule.subject?.subject_code ?? 'Course';
            const units = schedule.course?.units ?? schedule.subject?.units;
            const fieldClass = isField(schedule);

            return (
              <button
                type="button"
                key={schedule.id}
                onClick={onOpenSchedule}
                className={`group relative z-10 m-0.5 overflow-hidden rounded-xl border-2 border-l-4 p-2 text-left shadow-sm transition hover:z-20 hover:shadow-md ${
                  isMinor
                    ? 'border-amber-300 border-l-[#c9952a] bg-amber-50 text-amber-950'
                    : 'border-rose-300 border-l-[#4e0a10] bg-rose-50 text-[#4e0a10]'
                }`}
                style={{
                  gridColumn: 2,
                  gridRow: `${start + 2} / span ${duration}`,
                  marginLeft: `calc(${cardLayouts.get(schedule.id)?.leftPct ?? 0}% + 2px)`,
                  width: `calc(${cardLayouts.get(schedule.id)?.widthPct ?? 100}% - 4px)`,
                }}
                title={`${code} · ${formatTime12h(schedule.start_time)}–${formatTime12h(schedule.end_time)}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <strong className="truncate text-[11px] font-black">{code}</strong>
                  {fieldClass ? (
                    <span className="shrink-0 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold text-amber-700">
                      Field
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-700">
                  {schedule.room?.room_code ?? 'Room TBA'}
                </div>
                <div className="mt-1 flex items-center justify-between gap-1 text-[9px] text-slate-500">
                  <span>{formatTime12h(schedule.start_time)}–{formatTime12h(schedule.end_time)}</span>
                  {units ? <span className="rounded bg-white/80 px-1 py-0.5 font-bold">{units}u</span> : null}
                </div>
              </button>
            );
          })}
        </WeeklyTimetableGrid>
      </div>

      <footer className="flex flex-wrap items-center gap-4 border-t border-slate-200 bg-slate-50/60 px-5 py-3 text-[11px] font-semibold text-slate-500">
        <span>Categories:</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full border-2 border-[#4e0a10] bg-rose-50" /> Major</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded-full border-2 border-[#c9952a] bg-amber-50" /> Minor</span>
      </footer>
    </section>
  );
}
