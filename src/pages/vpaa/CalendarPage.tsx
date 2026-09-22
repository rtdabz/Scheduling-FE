import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  Crosshair,
  Maximize2,
  Minimize2,
  Printer,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import api from '../../lib/api';
import Skeleton from '../../components/ui/Skeleton';
import SearchInput from '../../components/ui/SearchInput';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import { useToast } from '../../context/ToastContext';
import { academicYearLabel, semesterLabel } from '../../lib/semesterLabel';
import MasterGantt, { type MasterGanttHandle } from './calendar/MasterGantt';
import { LAB_PATTERN, OFF_HOURS_PATTERN, type Density, type ZoomLevel } from './calendar/ganttPresentation';
import ScheduleDetailModal from './calendar/ScheduleDetailModal';
import { departmentTone } from './calendar/departmentPalette';
import {
  CALENDAR_DAYS,
  DEFAULT_STANDARD_HOURS,
  buildGanttDays,
  buildStandardHours,
  buildTimeWindow,
  courseCodeOf,
  courseNameOf,
  dayIndexOf,
  departmentIdOf,
  findOverlaps,
  instructorNameOf,
  minutesToLabel,
  sessionTypeOf,
  withCalendarDepartments,
  type CalendarDepartment,
  type CalendarSchedule,
  type GroupBy,
  type SessionType,
  type StandardHours,
} from './calendar/ganttLayout';

interface ActiveSemester {
  id: number;
  academic_year: string;
  semester: string;
}

interface TimeslotSettingsResponse {
  settings?: { opening_time?: string | null; closing_time?: string | null; slot_interval?: number | null };
}

interface CalendarData {
  schedules: CalendarSchedule[];
  departments: CalendarDepartment[];
  semester: ActiveSemester | null;
  standardHours: StandardHours;
}

const CACHE_KEY = 'page:vpaa-calendar:gantt';

/** GET /schedules clamps per_page to this; a full page means rows may be missing. */
const SCHEDULE_ROW_LIMIT = 1000;
const WEEKDAYS = [0, 1, 2, 3, 4, 5];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none', label: 'Day only' },
  { value: 'room', label: 'Room' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'section', label: 'Section' },
  { value: 'department', label: 'Department' },
];

const ZOOM_OPTIONS: { value: ZoomLevel; label: string }[] = [
  { value: 'fit', label: 'Fit' },
  { value: 'normal', label: '1×' },
  { value: 'wide', label: '2×' },
];

const toStandardHours = (response: TimeslotSettingsResponse | null | undefined): StandardHours => {
  return buildStandardHours(response?.settings?.opening_time, response?.settings?.closing_time, response?.settings?.slot_interval);
};

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center rounded-xl border border-gray-200 bg-gray-100 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${value === option.value ? 'bg-[#5A1220] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToolButton({ onClick, label, children, active = false }: { onClick: () => void; label: string; children: ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
      className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold shadow-xs transition-colors ${active ? 'border-[#5A1220] bg-[#5A1220] text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-[#5A1220]'}`}
    >
      {children}
    </button>
  );
}

export default function VpaaCalendarPage() {
  const { toast } = useToast();
  // Read through a ref so a toast API that is not referentially stable cannot re-trigger the load.
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });
  const cached = getCachedData<CalendarData>(CACHE_KEY);

  const [data, setData] = useState<CalendarData>(cached ?? {
    schedules: [],
    departments: [],
    semester: null,
    standardHours: DEFAULT_STANDARD_HOURS,
  });
  const [isLoading, setIsLoading] = useState(!hasCachedData(CACHE_KEY));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [departmentId, setDepartmentId] = useState('all');
  const [sessionType, setSessionType] = useState<'all' | SessionType>('all');
  const [hiddenDays, setHiddenDays] = useState<ReadonlySet<number>>(new Set());
  const [overlapsOnly, setOverlapsOnly] = useState(false);

  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [zoom, setZoom] = useState<ZoomLevel>('fit');
  const [density, setDensity] = useState<Density>('comfortable');
  const [collapsedDays, setCollapsedDays] = useState<ReadonlySet<number>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selected, setSelected] = useState<CalendarSchedule | null>(null);
  const [now, setNow] = useState(() => new Date());
  const ganttRef = useRef<MasterGanttHandle>(null);

  const fetchData = useCallback(async (options: { force?: boolean; silent?: boolean } = {}) => {
    // A manual refresh keeps the chart on screen and spins the button instead.
    if (options.force) setIsRefreshing(true);
    else if (!options.silent && !hasCachedData(CACHE_KEY)) setIsLoading(true);
    try {
      // The active semester scopes the schedules, so it resolves first. A 404 means
      // no semester is active; the calendar then shows everything it can see.
      const [semesterRes, timeslotRes, departmentRes] = await Promise.all([
        api.get<ActiveSemester>('/semesters/active').catch(() => ({ data: null })),
        api.get<TimeslotSettingsResponse>('/timeslots').catch(() => ({ data: null })),
        api.get<CalendarDepartment[]>('/departments'),
      ]);
      const semester = semesterRes.data?.id ? semesterRes.data : null;
      const scheduleRes = await api.get<CalendarSchedule[]>('/schedules', {
        params: { per_page: SCHEDULE_ROW_LIMIT, ...(semester ? { semester_id: semester.id } : {}) },
      });

      const next: CalendarData = {
        schedules: Array.isArray(scheduleRes.data) ? scheduleRes.data : [],
        departments: Array.isArray(departmentRes.data) ? departmentRes.data : [],
        semester,
        standardHours: toStandardHours(timeslotRes.data),
      };
      setData(next);
      setCachedData(CACHE_KEY, next);
      setLoadError(false);
    } catch (err) {
      setLoadError(true);
      console.error('Error loading calendar data:', err);
      toastRef.current.error('Error', 'Failed to load the master calendar');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial load; fetchData flips the loading flag before it awaits anything.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchData(); }, [fetchData]);
  useLiveRefresh(['schedules', 'departments', 'settings'], () => { void fetchData({ silent: true }); });

  // Keeps the "now" marker moving without a page refresh.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape belongs to the detail modal while it is open.
      if (event.key === 'Escape' && !selected) setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreen, selected]);

  const { departments, semester, standardHours } = data;
  const schedules = useMemo(() => withCalendarDepartments(data.schedules, departments), [data.schedules, departments]);

  // Overlaps are a property of the timetable, not of the current filter, so they
  // are found across every loaded meeting.
  const overlaps = useMemo(() => findOverlaps(schedules), [schedules]);

  const filteredSchedules = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return schedules.filter((item) => {
      if (departmentId !== 'all' && String(departmentIdOf(item)) !== departmentId) return false;
      if (sessionType !== 'all' && sessionTypeOf(item) !== sessionType) return false;
      if (overlapsOnly && !overlaps.has(item.id)) return false;
      if (!query) return true;
      return [courseCodeOf(item), courseNameOf(item), instructorNameOf(item), item.room?.room_code, item.section?.section_name]
        .some((value) => (value ?? '').toLowerCase().includes(query));
    });
  }, [schedules, departmentId, sessionType, overlapsOnly, overlaps, searchQuery]);

  // Sunday is only offered when something actually meets on it.
  const availableDays = useMemo(
    () => (schedules.some((item) => dayIndexOf(item.day) === 6) ? [...WEEKDAYS, 6] : WEEKDAYS),
    [schedules],
  );
  const visibleDays = useMemo(() => availableDays.filter((day) => !hiddenDays.has(day)), [availableDays, hiddenDays]);

  // The axis spans every loaded class, not just the filtered ones, so it holds still while filtering.
  const timeWindow = useMemo(() => buildTimeWindow(standardHours, schedules), [standardHours, schedules]);
  const ganttDays = useMemo(() => buildGanttDays(filteredSchedules, groupBy, visibleDays), [filteredSchedules, groupBy, visibleDays]);

  // Match the summary and legend to the selected days, including valid meetings only.
  const visibleSchedules = useMemo(
    () => ganttDays.flatMap((day) => day.rows.flatMap((row) => row.blocks.map((block) => block.schedule))),
    [ganttDays],
  );
  const overlappingCount = visibleSchedules.filter((item) => overlaps.has(item.id)).length;

  const legendDepartments = useMemo(() => {
    const seen = new Map<string, string>();
    visibleSchedules.forEach((item) => {
      const code = item.department?.department_code?.trim();
      if (code && !seen.has(code)) seen.set(code, item.department?.department_name ?? code);
    });
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleSchedules]);

  const hasFilters = searchQuery !== '' || departmentId !== 'all' || sessionType !== 'all' || overlapsOnly || hiddenDays.size > 0;
  const resetFilters = () => {
    setSearchQuery('');
    setDepartmentId('all');
    setSessionType('all');
    setOverlapsOnly(false);
    setHiddenDays(new Set());
  };

  const toggleSet = (set: ReadonlySet<number>, value: number) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    return next;
  };

  const allCollapsed = visibleDays.length > 0 && visibleDays.every((day) => collapsedDays.has(day));
  const standardHoursLabel = `${minutesToLabel(standardHours.opening)} – ${minutesToLabel(standardHours.closing)}`;

  const skeleton = (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading calendar">
      <Skeleton className="h-10 w-full rounded-lg" />
      {[
        ['ml-[4%] w-[18%]', 'ml-[6%] w-[12%]'],
        ['ml-[14%] w-[22%]', 'ml-[3%] w-[16%]'],
        ['ml-[2%] w-[14%]', 'ml-[20%] w-[18%]'],
        ['ml-[24%] w-[16%]', 'ml-[5%] w-[10%]'],
        ['ml-[8%] w-[20%]', 'ml-[10%] w-[14%]'],
      ].map(([first, second], index) => (
        <div key={index} className="space-y-1.5">
          <Skeleton className="h-8 w-full rounded-lg" />
          <div className="flex pl-[140px]">
            <Skeleton className={`h-12 rounded-lg ${first}`} />
            <Skeleton className={`h-12 rounded-lg ${second}`} />
          </div>
        </div>
      ))}
    </div>
  );

  const chartCard = (
    <div
      className={isFullscreen
        ? 'fixed inset-0 z-[1000] flex h-screen w-screen flex-col gap-3 bg-white p-4 font-sans sm:p-5'
        : 'flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 font-sans shadow-sm sm:p-4'}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-sm font-extrabold text-[#5A1220]">Weekly timeline</h2>
          <span className="text-xs font-medium text-slate-500">
            {semester ? `${semesterLabel(semester.semester)} · ${academicYearLabel(semester.academic_year)}` : 'All semesters'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span role="status" className="mr-1 text-xs font-semibold text-slate-500">
            {isLoading ? 'Loading…' : `${visibleSchedules.length} ${visibleSchedules.length === 1 ? 'meeting' : 'meetings'} in view`}
          </span>
          <button
            type="button"
            onClick={() => void fetchData({ force: true })}
            disabled={isRefreshing || isLoading}
            title="Refresh calendar"
            aria-label="Refresh calendar"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#5A1220] disabled:opacity-50 print:hidden"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <span className="print:hidden">
            <ToolButton onClick={() => setIsFullscreen((value) => !value)} label={isFullscreen ? 'Exit full screen' : 'Full screen'}>
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </ToolButton>
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <SearchInput
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search classes..."
          containerClassName="relative min-w-[180px] flex-1"
          aria-label="Search classes"
          title="Search by course, instructor, room or section"
        />
        <select
          value={departmentId}
          onChange={(event) => setDepartmentId(event.target.value)}
          aria-label="Department"
          className="h-9 min-w-0 max-w-full cursor-pointer rounded-xl border border-gray-300 bg-white px-2.5 text-xs font-bold text-gray-800 outline-none focus:border-[#5A1220] sm:max-w-[200px]"
        >
          <option value="all">All departments</option>
          {departments.map((department) => (
            <option key={department.id} value={String(department.id)}>{department.department_code} – {department.department_name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500">
          <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
          Rows
          <select
            value={groupBy}
            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
            className="h-9 cursor-pointer rounded-xl border border-gray-300 bg-white px-2.5 text-xs font-bold text-gray-800 outline-none focus:border-[#5A1220]"
          >
            {GROUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <ToolButton onClick={() => setOverlapsOnly((value) => !value)} label="Show only overlapping classes" active={overlapsOnly}>
          <AlertTriangle className="h-3.5 w-3.5" />Overlaps{overlappingCount || overlapsOnly ? ` (${overlappingCount})` : ''}
        </ToolButton>
        <button
          type="button"
          onClick={() => setShowOptions((value) => !value)}
          aria-label="View options"
          aria-expanded={showOptions}
          aria-controls="calendar-view-options"
          className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-bold transition-colors ${showOptions ? 'border-[#5A1220]/30 bg-[#5A1220]/5 text-[#5A1220]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />View options
          {sessionType !== 'all' && <span className="h-1.5 w-1.5 rounded-full bg-[#5A1220]" aria-label={`${sessionType} filter active`} />}
        </button>
        {hasFilters && <ToolButton onClick={resetFilters} label="Clear filters"><RotateCcw className="h-3.5 w-3.5" />Clear</ToolButton>}
      </div>

      {showOptions && (
        <div id="calendar-view-options" className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 print:hidden">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Sessions</p>
            <Segmented label="Session type" value={sessionType} onChange={setSessionType} options={[{ value: 'all', label: 'All sessions' }, { value: 'lecture', label: 'Lecture' }, { value: 'laboratory', label: 'Laboratory' }]} />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Details</p>
            <Segmented label="Density" value={density} onChange={setDensity} options={[{ value: 'comfortable', label: 'Detailed' }, { value: 'compact', label: 'Compact' }]} />
          </div>
          <ToolButton onClick={() => setCollapsedDays(allCollapsed ? new Set() : new Set(visibleDays))} label={allCollapsed ? 'Expand all days' : 'Collapse all days'}>
            {allCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
            {allCollapsed ? 'Expand days' : 'Collapse days'}
          </ToolButton>
          <ToolButton onClick={() => window.print()} label="Print calendar"><Printer className="h-3.5 w-3.5" />Print</ToolButton>
          <span className="flex items-center gap-1 text-[11px] text-slate-500"><Clock className="h-3 w-3" />Standard hours {standardHoursLabel}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 print:hidden">
        <div role="group" aria-label="Days shown" className="flex flex-wrap items-center gap-1">
          {availableDays.map((day) => {
            const shown = !hiddenDays.has(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={shown}
                onClick={() => setHiddenDays((current) => toggleSet(current, day))}
                className={`h-8 min-w-[2.25rem] rounded-lg px-2 text-[11px] font-bold transition-colors ${shown ? 'bg-[#5A1220] text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
              >
                {CALENDAR_DAYS[day].slice(0, 3)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <ToolButton onClick={() => ganttRef.current?.scrollToNow()} label="Jump to the current time"><Crosshair className="h-3.5 w-3.5" />Now</ToolButton>
          <Segmented label="Zoom" value={zoom} onChange={setZoom} options={ZOOM_OPTIONS} />
        </div>
      </div>

      {loadError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {schedules.length ? 'Could not refresh. Showing the last loaded schedules.' : 'Could not load schedules.'}
          <button type="button" disabled={isRefreshing} onClick={() => void fetchData({ force: true })} className="ml-2 font-bold underline disabled:opacity-50">Retry</button>
        </p>
      )}

      {data.schedules.length >= SCHEDULE_ROW_LIMIT && (
        <p className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Showing the latest {SCHEDULE_ROW_LIMIT.toLocaleString()} class meetings. Filter by department in Schedules for a complete list.
        </p>
      )}

      {isLoading ? skeleton : visibleDays.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 text-center">
          <CalendarIcon className="h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm font-bold text-gray-600">No days selected</p>
          <button type="button" onClick={() => setHiddenDays(new Set())} className="mt-1 text-xs font-bold text-[#5A1220] hover:underline">Show all days</button>
        </div>
      ) : (
        <MasterGantt
          ref={ganttRef}
          days={ganttDays}
          timeWindow={timeWindow}
          standardHours={standardHours}
          groupBy={groupBy}
          zoom={zoom}
          density={density}
          overlaps={overlaps}
          collapsedDays={collapsedDays}
          onToggleDay={(day) => setCollapsedDays((current) => toggleSet(current, day))}
          onSelect={setSelected}
          now={now}
          className={isFullscreen ? 'min-h-0 flex-1' : 'h-[calc(100dvh-19rem)] min-h-[360px]'}
        />
      )}

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <i className="h-3.5 w-6 rounded border border-slate-300 bg-white" />Lecture
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-3.5 w-6 rounded border border-slate-300 bg-white" style={LAB_PATTERN} />Laboratory
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-3.5 w-6 rounded border border-slate-300 bg-white ring-2 ring-red-500/70" />Overlap
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-3.5 w-0.5 bg-red-500" />Now
        </span>
        {(timeWindow.start < standardHours.opening || timeWindow.end > standardHours.closing) && <span className="flex items-center gap-1.5" title="Outside the standard scheduling hours set in Settings">
          <i className="h-3.5 w-6 rounded border border-slate-200" style={OFF_HOURS_PATTERN} />
          Outside {standardHoursLabel}
        </span>}
        <span className="hidden h-4 w-px bg-slate-200 sm:block" aria-hidden="true" />
        {legendDepartments.length ? legendDepartments.map(([code, name]) => (
          <span key={code} className="flex items-center gap-1.5" title={name}>
            <i className={`h-2.5 w-2.5 rounded-full ${departmentTone(code, name).swatch}`} />
            {code}
          </span>
        )) : <span className="italic text-slate-400">No classes in view</span>}
      </footer>
    </div>
  );

  return (
    <div id="calendar-page" className="min-w-0 font-sans">
      {isFullscreen ? createPortal(chartCard, document.body) : chartCard}

      <ScheduleDetailModal
        schedule={selected}
        allSchedules={schedules}
        overlaps={overlaps}
        onClose={() => setSelected(null)}
        onSelect={setSelected}
      />
    </div>
  );
}
