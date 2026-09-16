import { useMemo, useState } from 'react';
import MasterGantt from './MasterGantt';
import { buildGanttDays, buildTimeWindow, dateDayIndex, dayIndexOf, type CalendarSchedule, type GroupBy, type OverlapEntry, type StandardHours } from './ganttLayout';
import { LAB_PATTERN, type ZoomLevel } from './ganttPresentation';
import { departmentTone } from './departmentPalette';

interface DashboardGanttProps {
  schedules: CalendarSchedule[];
  allSchedules: CalendarSchedule[];
  standardHours: StandardHours;
  overlaps: ReadonlyMap<number, OverlapEntry[]>;
  now: Date;
  onSelect: (schedule: CalendarSchedule) => void;
  isFullscreen: boolean;
}

/** Dashboard controls around the same renderer used by the Master Calendar. */
export default function DashboardGantt({ schedules, allSchedules, standardHours, overlaps, now, onSelect, isFullscreen }: DashboardGanttProps) {
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [deliveryMode, setDeliveryMode] = useState<'on-site' | 'online' | 'field'>('on-site');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [zoom, setZoom] = useState<ZoomLevel>('fit');
  const [collapsedDays, setCollapsedDays] = useState<ReadonlySet<number>>(new Set());
  const today = dateDayIndex(now);
  const visibleDays = useMemo(() => period === 'today' ? [today]
    : allSchedules.some((item) => dayIndexOf(item.day) === 6) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5], [period, today, allSchedules]);
  const visibleSchedules = useMemo(() => schedules.filter((item) =>
    (item.mode ?? 'on-site') === deliveryMode), [schedules, deliveryMode]);
  const days = useMemo(() => buildGanttDays(visibleSchedules, groupBy, visibleDays), [visibleSchedules, groupBy, visibleDays]);
  const timeWindow = useMemo(() => buildTimeWindow(standardHours, allSchedules), [standardHours, allSchedules]);
  const meetings = days.flatMap((day) => day.rows.flatMap((row) => row.blocks.map((block) => block.schedule)));
  const legend = [...new Map(meetings.filter((item) => item.department).map((item) => [item.department!.id, item.department!])).values()];
  const controlClass = 'h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700';

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div role="group" aria-label="Timeline period" className="flex rounded-lg bg-slate-100 p-0.5">
          {(['today', 'week'] as const).map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${period === value ? 'bg-[#5A1220] text-white' : 'text-slate-600'}`}>{value === 'today' ? 'Today' : 'Week'}</button>)}
        </div>
        <div role="group" aria-label="Delivery mode" className="flex rounded-lg bg-slate-100 p-0.5">
          {(['on-site', 'online', 'field'] as const).map((value) => <button key={value} type="button" aria-pressed={deliveryMode === value} onClick={() => setDeliveryMode(value)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${deliveryMode === value ? 'bg-[#5A1220] text-white' : 'text-slate-600'}`}>{value === 'on-site' ? 'On-site' : value === 'online' ? 'Online' : 'Field'}</button>)}
        </div>
        <select aria-label="Timeline rows" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)} className={controlClass}>
          <option value="none">Day only</option><option value="room">By room</option><option value="instructor">By instructor</option><option value="section">By section</option><option value="department">By department</option>
        </select>
        <select aria-label="Timeline zoom" value={zoom} onChange={(event) => setZoom(event.target.value as ZoomLevel)} className={controlClass}>
          <option value="fit">Fit</option><option value="normal">1×</option><option value="wide">2×</option>
        </select>
        <span role="status" className="ml-auto text-xs font-semibold text-slate-500">{meetings.length} {meetings.length === 1 ? 'meeting' : 'meetings'} in view</span>
      </div>
      <MasterGantt fillHeight days={days} timeWindow={timeWindow} standardHours={standardHours} groupBy={groupBy} zoom={zoom} density="comfortable" overlaps={overlaps} collapsedDays={collapsedDays}
        onToggleDay={(day) => setCollapsedDays((current) => { const next = new Set(current); if (next.has(day)) next.delete(day); else next.add(day); return next; })}
        onSelect={onSelect} now={now} className={isFullscreen ? 'h-0 min-h-[260px] flex-1 [contain:size]' : 'h-[420px] min-h-[220px] shrink-0 [contain:size] xl:h-0 xl:flex-1'} />
      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5"><i className="h-3 w-5 rounded border border-slate-300 bg-white" />Lecture</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-5 rounded border border-slate-300 bg-white" style={LAB_PATTERN} />Laboratory</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-5 rounded border border-red-500 ring-1 ring-red-500" />Overlap</span>
        {legend.map((department) => <span key={department.id} title={department.department_name} className="flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-full ${departmentTone(department.department_code, department.department_name).swatch}`} />{department.department_code}</span>)}
        <span className="ml-auto font-normal">Select a class for details.</span>
      </footer>
    </div>
  );
}
