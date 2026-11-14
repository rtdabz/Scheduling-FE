import { useMemo, useState } from 'react';
import MasterGantt from './MasterGantt';
import { CALENDAR_DAYS, buildGanttDays, buildTimeWindow, dateDayIndex, dayIndexOf, filterVpaaApprovedSchedules, type CalendarSchedule, type GroupBy, type OverlapEntry, type StandardHours } from './ganttLayout';
import { departmentTone } from './departmentPalette';

interface DashboardGanttProps {
  schedules: CalendarSchedule[];
  allSchedules: CalendarSchedule[];
  standardHours: StandardHours;
  overlaps: ReadonlyMap<number, OverlapEntry[]>;
  now: Date;
  onSelect: (schedule: CalendarSchedule) => void;
  isFullscreen: boolean;
  selectedId?: number | null;}

// The legend swatch is far smaller than a class card, so its hatch is drawn
// a touch stronger to stay legible.
const LAB_STRIPES = { backgroundImage: 'repeating-linear-gradient(135deg, rgba(26, 20, 16, 0.22) 0 1.5px, transparent 1.5px 5px)' };

export default function DashboardGantt({ schedules, allSchedules, standardHours, overlaps, now, onSelect, isFullscreen, selectedId }: DashboardGanttProps) {
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [deliveryMode, setDeliveryMode] = useState<'on-site' | 'online' | 'field'>('on-site');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [weekDay, setWeekDay] = useState<number | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<ReadonlySet<number>>(new Set());
  const today = dateDayIndex(now);
  const weekDays = useMemo(() => filterVpaaApprovedSchedules(allSchedules).some((item) => dayIndexOf(item.day) === 6) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5], [allSchedules]);
  const visibleDays = useMemo(() => period === 'today' ? [today] : weekDay === null ? weekDays : [weekDay], [period, today, weekDay, weekDays]);
  const visibleSchedules = useMemo(() => schedules.filter((item) =>
    (item.mode ?? 'on-site') === deliveryMode), [schedules, deliveryMode]);
  const days = useMemo(() => buildGanttDays(visibleSchedules, groupBy, visibleDays), [visibleSchedules, groupBy, visibleDays]);
  const timeWindow = useMemo(() => buildTimeWindow(standardHours, allSchedules), [standardHours, allSchedules]);
  const meetings = days.flatMap((day) => day.rows.flatMap((row) => row.blocks.map((block) => block.schedule)));
  const legend = [...new Map(meetings.filter((item) => item.department).map((item) => [item.department!.id, item.department!])).values()];
  const segmentGroup = 'flex rounded-lg border border-border bg-parchment p-0.5';
  const segment = 'selection-indicator h-7 rounded-md px-3 text-xs font-semibold text-muted transition-colors hover:text-text';
  const controlClass = 'h-8 rounded-lg border border-border bg-white px-2.5 text-xs font-semibold text-text transition-colors hover:border-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div role="group" aria-label="Timeline period" className={segmentGroup}>
          {(['today', 'week'] as const).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={segment}>{value === 'today' ? 'Today' : 'Week'}</button>)}
        </div>
        <div role="group" aria-label="Delivery mode" className={segmentGroup}>
          {(['on-site', 'online', 'field'] as const).map((value) => <button key={value} type="button" aria-pressed={deliveryMode === value} onClick={() => setDeliveryMode(value)} className={segment}>{value === 'on-site' ? 'On-site' : value === 'online' ? 'Online' : 'Field'}</button>)}
        </div>
        <select aria-label="Timeline rows" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)} className={controlClass}>
          <option value="none">Day only</option><option value="room">By room</option><option value="instructor">By instructor</option><option value="section">By section</option><option value="department">By department</option>
        </select>
        <span role="status" className="ml-auto rounded-full bg-parchment px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted">{meetings.length} {meetings.length === 1 ? 'class' : 'classes'} in view</span>
      </div>
      {period === 'week' && (
        <div role="group" aria-label="Day shown" className="flex shrink-0 flex-wrap items-center gap-1">
          {[null, ...weekDays].map((day) => (
            <button key={day ?? 'all'} type="button" aria-pressed={weekDay === day} onClick={() => setWeekDay(day)}
              className={`selection-indicator h-7 min-w-[2.75rem] rounded-full px-3 text-xs font-semibold transition-colors ${weekDay === day ? '' : 'text-muted hover:bg-parchment hover:text-text'}`}>
              {day === null ? 'All days' : CALENDAR_DAYS[day].slice(0, 3)}
            </button>
          ))}
        </div>
      )}
      <MasterGantt fillHeight days={days} timeWindow={timeWindow} standardHours={standardHours} groupBy={groupBy} zoom="fit" density="comfortable" overlaps={overlaps} collapsedDays={collapsedDays}
        onToggleDay={(day) => setCollapsedDays((current) => { const next = new Set(current); if (next.has(day)) next.delete(day); else next.add(day); return next; })}
        onSelect={onSelect} now={now} selectedId={selectedId} className={isFullscreen ? 'h-0 min-h-[260px] flex-1 [contain:size]' : 'h-[420px] min-h-[220px] shrink-0 [contain:size] xl:h-0 xl:flex-1'} />
      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-muted">
        <span className="flex items-center gap-1.5"><i className="h-3 w-5 rounded-[3px] border border-border bg-parchment" />Lecture</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-5 rounded-[3px] border border-border bg-parchment" style={LAB_STRIPES} />Laboratory</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-5 rounded-[3px] border border-dashed border-accent bg-white" />Unassigned</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-5 rounded-[3px] bg-white ring-2 ring-inset ring-red-500/80" />Overlap</span>
        {legend.map((department) => <span key={department.id} title={department.department_name} className="flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${departmentTone(department.department_code, department.department_name).swatch}`} />{department.department_code}</span>)}
        <span className="ml-auto">Select a class for details.</span>
      </footer>
    </div>
  );
}
