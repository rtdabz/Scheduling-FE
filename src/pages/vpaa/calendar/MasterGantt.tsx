import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, MapPin, User } from 'lucide-react';
import { formatTime12h } from '../../../lib/timeGrid';
import { scheduleLocationLabel } from '../../../lib/scheduleLocation';
import {
  buildTicks,
  courseCodeOf,
  dateDayIndex,
  instructorNameOf,
  minutesToLabel,
  percentOf,
  sessionTypeOf,
  type CalendarSchedule,
  type GanttBlock,
  type GanttDay,
  type GroupBy,
  type OverlapEntry,
  type StandardHours,
  type TimeWindow,
} from './ganttLayout';
import { departmentTone } from './departmentPalette';
import GanttHoverCard from './GanttHoverCard';
import DepartmentLogo from '../../../components/ui/DepartmentLogo';
import { LAB_PATTERN, OFF_HOURS_PATTERN, ZOOM_PX_PER_HOUR, overlapSummary, type Density, type ZoomLevel } from './ganttPresentation';

const LANE_HEIGHT: Record<Density, number> = { comfortable: 66, compact: 44 };
/** Below this width a block drops its badges so the course code is what survives. */
const NARROW_BLOCK_PX = 88;
const ROW_PADDING = 4;
const AXIS_HEIGHT = 44;
const DAY_HEADER_HEIGHT = 40;

export interface MasterGanttHandle {
  /** Scrolls the current time, and today's row when shown, into view. */
  scrollToNow: () => void;
}

interface MasterGanttProps {
  days: GanttDay[];
  timeWindow: TimeWindow;
  standardHours: StandardHours;
  groupBy: GroupBy;
  zoom: ZoomLevel;
  density: Density;
  overlaps: ReadonlyMap<number, OverlapEntry[]>;
  collapsedDays: ReadonlySet<number>;
  onToggleDay: (dayIndex: number) => void;
  onSelect: (schedule: CalendarSchedule) => void;
  now: Date;
  className?: string;
  /** Continue the time grid through unused viewport space below the meetings. */
  fillHeight?: boolean;
  /** Suppress sideways scrolling; only meaningful alongside zoom="fit", where the timeline already matches the viewport width. */
  lockHorizontalScroll?: boolean;
  /** Time held for someone other than the classes drawn, e.g. a room lent to another department. */
  reservations?: readonly GanttReservation[];
}

export interface GanttReservation {
  dayIndex: number;
  /** Minutes from midnight. */
  start: number;
  end: number;
  label: string;
}

interface HoverState {
  schedule: CalendarSchedule;
  rect: DOMRect;
}

const MasterGantt = forwardRef<MasterGanttHandle, MasterGanttProps>(function MasterGantt(
  { days, timeWindow, standardHours, groupBy, zoom, density, overlaps, collapsedDays, onToggleDay, onSelect, now, className = '', fillHeight = false, lockHorizontalScroll = false, reservations },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef(new Map<number, HTMLElement>());
  const [hover, setHover] = useState<HoverState | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const labelWidth = viewportWidth > 0 && viewportWidth < 600 ? 112 : groupBy === 'none' ? 148 : 180;
  const hours = (timeWindow.end - timeWindow.start) / 60;
  const timelineMinWidth = zoom === 'fit' ? 0 : Math.ceil(hours * ZOOM_PX_PER_HOUR[zoom]);
  const trackWidth = viewportWidth > 0
    ? Math.max(1, timelineMinWidth, viewportWidth - labelWidth)
    : hours * ZOOM_PX_PER_HOUR[zoom];
  const pixelsPerHour = trackWidth / hours;
  // Ticks are spaced in 90-minute units (7, 8:30, 10, ...) rather than whole hours,
  // widening to multiples of 90 minutes only when the track is too narrow to fit them.
  const tickStep = Math.max(1, Math.ceil(58 / (pixelsPerHour * 1.5))) * 90;
  const laneHeight = LANE_HEIGHT[density];

  const hourTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let minute = timeWindow.start; minute <= timeWindow.end; minute += tickStep) ticks.push(minute);
    return ticks;
  }, [timeWindow, tickStep]);

  // Half-hour (slot) lines only once there is room for them to read as structure, not noise.
  const minorTicks = useMemo(
    () => (pixelsPerHour >= 120 ? buildTicks(timeWindow, standardHours.slotMinutes).filter((minute) => minute % 60 !== 0) : []),
    [timeWindow, standardHours.slotMinutes, pixelsPerHour],
  );

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIndex = dateDayIndex(now);
  const nowInWindow = nowMinutes >= timeWindow.start && nowMinutes <= timeWindow.end;

  useImperativeHandle(ref, () => ({
    scrollToNow: () => {
      const container = scrollRef.current;
      if (!container) return;
      const trackWidth = container.scrollWidth - labelWidth;
      const clamped = Math.min(Math.max(nowMinutes, timeWindow.start), timeWindow.end);
      const x = labelWidth + (percentOf(clamped, timeWindow) / 100) * trackWidth;
      const today = dayRefs.current.get(todayIndex);
      container.scrollTo({
        left: Math.max(0, x - labelWidth - (container.clientWidth - labelWidth) / 2),
        top: today ? Math.max(0, today.offsetTop - AXIS_HEIGHT) : container.scrollTop,
        behavior: 'smooth',
      });
    },
  }), [labelWidth, nowMinutes, todayIndex, timeWindow]);

  const span = (from: number, to: number): CSSProperties => ({
    left: `${percentOf(from, timeWindow)}%`,
    width: `${percentOf(to, timeWindow) - percentOf(from, timeWindow)}%`,
  });

  /** Gridlines and off-hours shading behind one day's rows. */
  const trackBackdrop = (isToday: boolean) => (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {timeWindow.start < standardHours.opening && <div className="absolute inset-y-0" style={{ ...span(timeWindow.start, standardHours.opening), ...OFF_HOURS_PATTERN }} />}
      {timeWindow.end > standardHours.closing && <div className="absolute inset-y-0" style={{ ...span(standardHours.closing, timeWindow.end), ...OFF_HOURS_PATTERN }} />}
      {minorTicks.map((minute) => (
        <div key={`m${minute}`} className="absolute inset-y-0 border-l border-dashed border-slate-100" style={{ left: `${percentOf(minute, timeWindow)}%` }} />
      ))}
      {hourTicks.map((minute) => (
        <div key={`h${minute}`} className="absolute inset-y-0 border-l border-slate-200" style={{ left: `${percentOf(minute, timeWindow)}%` }} />
      ))}
      {isToday && nowInWindow && (
        <div className="absolute inset-y-0 z-[15] w-0.5 -translate-x-1/2 bg-red-500/80" style={{ left: `${percentOf(nowMinutes, timeWindow)}%` }} />
      )}
    </div>
  );

  /** Per-slot load across a day, drawn in the day header so a collapsed day still shows its shape. */
  const dayReservations = (dayIndex: number) =>
    (reservations ?? []).filter((reservation) => reservation.dayIndex === dayIndex
      && reservation.end > timeWindow.start && reservation.start < timeWindow.end);

  const densityStrip = (day: GanttDay) => {
    const step = standardHours.slotMinutes > 0 ? standardHours.slotMinutes : 30;
    const buckets = buildTicks({ start: timeWindow.start, end: timeWindow.end - step }, step).map((from) => {
      const to = from + step;
      let active = 0;
      for (const row of day.rows) for (const block of row.blocks) if (block.start < to && block.end > from) active++;
      return { from, to, active };
    });
    const peak = Math.max(1, ...buckets.map((bucket) => bucket.active));
    return (
      <div className="absolute inset-x-0 bottom-1.5 top-1.5" aria-hidden="true">
        {buckets.map((bucket) => bucket.active > 0 && (
          <div
            key={bucket.from}
            className="absolute bottom-0 rounded-t-sm bg-[#5A1220]"
            title={`${minutesToLabel(bucket.from)}: ${bucket.active} ${bucket.active === 1 ? 'class' : 'classes'} in session`}
            style={{ ...span(bucket.from, bucket.to), height: `${Math.max(12, (bucket.active / peak) * 100)}%`, opacity: 0.18 + (bucket.active / peak) * 0.55 }}
          />
        ))}
      </div>
    );
  };

  const renderBlock = (block: GanttBlock) => {
    const { schedule } = block;
    const tone = departmentTone(schedule.department?.department_code, schedule.department?.department_name);
    const isLab = sessionTypeOf(schedule) === 'laboratory';
    const overlapEntries = overlaps.get(schedule.id);
    const code = courseCodeOf(schedule);
    const section = schedule.section?.section_name ?? 'No section';
    const location = scheduleLocationLabel(schedule.mode, schedule.room?.room_code);
    const instructor = instructorNameOf(schedule) || 'Unassigned';
    const time = `${formatTime12h(schedule.start_time)} – ${formatTime12h(schedule.end_time)}`;
    const mode = (schedule.mode ?? 'on-site').toLowerCase();
    const isNarrow = ((block.end - block.start) / 60) * pixelsPerHour < NARROW_BLOCK_PX;

    return (
      <button
        key={schedule.id}
        type="button"
        onClick={() => onSelect(schedule)}
        onMouseEnter={(event) => setHover({ schedule, rect: event.currentTarget.getBoundingClientRect() })}
        onMouseLeave={() => setHover(null)}
        onFocus={(event) => setHover({ schedule, rect: event.currentTarget.getBoundingClientRect() })}
        onBlur={() => setHover(null)}
        aria-label={`${code} ${isLab ? 'laboratory' : 'lecture'}, ${section}, ${time}, ${location}, ${instructor}${overlapEntries ? `. ${overlapSummary(overlapEntries)}` : ''}`}
        data-schedule-id={schedule.id}
        data-session-type={isLab ? 'laboratory' : 'lecture'}
        className={`group absolute z-10 flex overflow-hidden rounded-lg border text-left shadow-sm transition-[box-shadow,background-color] hover:z-[12] hover:shadow-md focus:z-[12] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] ${tone.block} ${overlapEntries ? 'ring-2 ring-red-500/70' : ''}`}
        style={{
          ...span(block.start, block.end),
          top: ROW_PADDING + block.lane * laneHeight + 2,
          height: laneHeight - 4,
          ...(isLab ? LAB_PATTERN : null),
        }}
      >
        <span className={`w-1 shrink-0 ${tone.accent}`} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1.5 py-1">
          {/* The code keeps its full width; badges after it are what the block clips. */}
          <span className="flex min-w-0 items-center gap-1 overflow-hidden">
            <DepartmentLogo name={schedule.department?.department_name || schedule.department?.department_code || 'Department'} logo={schedule.department?.logo} className="h-4 w-4" iconSize={10} />
            <strong className="max-w-[calc(100%_-_1.25rem)] shrink-0 truncate text-[11px] font-black leading-tight">{code}</strong>
            {!isNarrow && (
              <span className={`shrink-0 rounded px-1 text-[8px] font-black uppercase leading-[14px] tracking-wide ${isLab ? 'bg-slate-800 text-white' : 'bg-white/90 text-slate-700 ring-1 ring-inset ring-slate-300'}`}>
                {isLab ? 'Lab' : 'Lec'}
              </span>
            )}
            {!isNarrow && mode !== 'on-site' && (
              <span className="shrink-0 rounded bg-amber-100 px-1 text-[8px] font-black uppercase leading-[14px] text-amber-800">{mode === 'online' ? 'Online' : 'Field'}</span>
            )}
            {overlapEntries && <AlertTriangle className="h-3 w-3 shrink-0 text-red-600" aria-hidden="true" />}
          </span>
          <span className="truncate text-[10px] font-semibold leading-tight opacity-80">
            {section}{density === 'compact' ? ` · ${location}` : ''}
          </span>
          {density === 'comfortable' && (
            <span className="flex min-w-0 items-center gap-2 text-[10px] font-medium leading-tight opacity-75">
              <span className="flex min-w-0 shrink-0 items-center gap-0.5"><MapPin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />{location}</span>
              <span className="flex min-w-0 items-center gap-0.5"><User className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /><span className="truncate">{instructor}</span></span>
            </span>
          )}
        </span>
      </button>
    );
  };

  const gridStyle: CSSProperties = { gridTemplateColumns: `${labelWidth}px minmax(${timelineMinWidth}px, 1fr)` };

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={() => { if (hover) setHover(null); }}
        role="region"
        aria-label="Master calendar timeline"
        className={`relative rounded-xl border border-slate-200 bg-white print:h-auto print:min-h-0 print:max-h-none print:overflow-visible ${lockHorizontalScroll ? 'overflow-y-auto overflow-x-hidden' : 'overflow-auto'} ${className}`}
      >
        <div className={fillHeight ? 'flex min-h-full flex-col [&>section]:shrink-0' : undefined}>
        {/* Time axis, pinned to the top while the days scroll beneath it. */}
        <div className="sticky top-0 z-40 grid shrink-0 border-b border-[#c9952a]/30 bg-gradient-to-b from-[#4e0a10] to-[#3d080c] text-white" style={{ ...gridStyle, height: AXIS_HEIGHT }}>
          <div className="sticky left-0 z-10 flex items-center gap-1.5 border-r border-[#c9952a]/30 bg-[#45090e] px-3 text-[10px] font-black uppercase tracking-wider text-[#c9952a]">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {groupBy === 'none' ? 'Day / Time' : 'Day / Group'}
          </div>
          <div className="relative">
            {hourTicks.map((minute) => {
              const left = percentOf(minute, timeWindow);
              // Edge labels would hang outside the track, so they align inward instead of centring.
              const align = left >= 99 ? '-translate-x-full pr-1' : left <= 1 ? 'pl-1' : '-translate-x-1/2';
              return (
                <span key={minute} className={`absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-bold tracking-wide ${align}`} style={{ left: `${left}%` }}>
                  {minutesToLabel(minute)}
                </span>
              );
            })}
            {nowInWindow && days.some((day) => day.dayIndex === todayIndex) && (
              <span
                className="absolute bottom-0 z-10 -translate-x-1/2 rounded-t bg-red-500 px-1 text-[9px] font-black leading-4 text-white"
                style={{ left: `${percentOf(nowMinutes, timeWindow)}%` }}
              >
                Now
              </span>
            )}
          </div>
        </div>

        {days.map((day) => {
          const isToday = day.dayIndex === todayIndex;
          const isCollapsed = collapsedDays.has(day.dayIndex);
          const labCount = day.rows.reduce(
            (sum, row) => sum + row.blocks.filter((block) => sessionTypeOf(block.schedule) === 'laboratory').length,
            0,
          );

          return (
            <section
              key={day.dayIndex}
              ref={(node) => { if (node) dayRefs.current.set(day.dayIndex, node); else dayRefs.current.delete(day.dayIndex); }}
              aria-label={`${day.name}, ${day.count} ${day.count === 1 ? 'class' : 'classes'}`}
              className={`border-slate-200 ${fillHeight && day === days[days.length - 1] ? '' : 'border-b-2 last:border-b-0'}`}
            >
              {/* Day header: pinned under the axis while its own rows are on screen. */}
              <div className="sticky z-30 grid border-b border-slate-200 bg-slate-50" style={{ ...gridStyle, top: AXIS_HEIGHT, height: DAY_HEADER_HEIGHT }}>
                <button
                  type="button"
                  onClick={() => onToggleDay(day.dayIndex)}
                  aria-expanded={!isCollapsed}
                  className={`sticky left-0 z-10 flex items-center gap-1.5 border-r border-slate-200 px-2.5 text-left transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C9952A] ${isToday ? 'bg-[#f5eced]' : 'bg-slate-50'}`}
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className={`truncate text-xs font-black uppercase tracking-wider ${isToday ? 'text-[#5A1220]' : 'text-slate-800'}`}>{day.name}</span>
                    {isToday && <span className="text-[9px] font-bold uppercase tracking-wider text-red-600">● Today</span>}
                  </span>
                  <span
                    className="ml-auto shrink-0 rounded-full bg-white px-1.5 text-[10px] font-extrabold leading-5 text-slate-600 ring-1 ring-inset ring-slate-200"
                    title={`${day.count - labCount} lecture, ${labCount} laboratory`}
                  >
                    {day.count}
                  </span>
                </button>
                <div className="relative">
                  {dayReservations(day.dayIndex).map((reservation, index) => (
                    <div
                      key={`reservation-${reservation.start}-${index}`}
                      title={`${reservation.label} · ${minutesToLabel(reservation.start)} - ${minutesToLabel(reservation.end)}`}
                      className="absolute bottom-1 top-1 flex items-center overflow-hidden rounded-md border-2 border-dashed border-orange-300 bg-orange-50/90 px-1.5"
                      style={span(Math.max(reservation.start, timeWindow.start), Math.min(reservation.end, timeWindow.end))}
                    >
                      <span className="truncate text-[10px] font-black uppercase tracking-wide text-orange-800">{reservation.label}</span>
                    </div>
                  ))}
                  {day.count > 0
                    ? densityStrip(day)
                    : dayReservations(day.dayIndex).length === 0 && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold italic text-slate-400">No classes in view</span>}
                </div>
              </div>

              {!isCollapsed && day.rows.length > 0 && (
                <div className="grid" style={gridStyle}>
                  <div className="sticky left-0 z-20 border-r border-slate-200 bg-white">
                    {day.rows.map((row) => (
                      <div
                        key={row.key}
                        className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 last:border-b-0"
                        style={{ height: row.laneCount * laneHeight + ROW_PADDING * 2 }}
                      >
                        {groupBy === 'none' ? (
                          <span className="text-[10px] font-semibold text-slate-400">
                            {row.laneCount > 1 ? `Up to ${row.laneCount} at once` : 'Classes'}
                          </span>
                        ) : (
                          <>
                            <span className={`truncate text-[11px] font-bold ${row.isPlaceholder ? 'italic text-slate-400' : 'text-slate-700'}`} title={row.label}>{row.label}</span>
                            <span className="ml-auto shrink-0 text-[10px] font-semibold text-slate-400">{row.blocks.length}</span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="relative">
                    {trackBackdrop(isToday)}
                    {day.rows.map((row) => (
                      <div
                        key={row.key}
                        data-row-key={row.key}
                        className="relative border-b border-slate-100 last:border-b-0"
                        style={{ height: row.laneCount * laneHeight + ROW_PADDING * 2 }}
                      >
                        {row.blocks.map(renderBlock)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
        {fillHeight && (
          <div aria-hidden="true" className="grid flex-1" style={gridStyle}>
            <div className="sticky left-0 z-20 border-r border-slate-200 bg-white" />
            <div className="relative">
              {trackBackdrop(days.length === 1 && days[0].dayIndex === todayIndex && !collapsedDays.has(todayIndex))}
            </div>
          </div>
        )}
        </div>
      </div>

      {hover && <GanttHoverCard schedule={hover.schedule} anchor={hover.rect} overlap={overlapSummary(overlaps.get(hover.schedule.id))} />}
    </>
  );
});

export default MasterGantt;
