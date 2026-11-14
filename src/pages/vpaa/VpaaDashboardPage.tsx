import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarCheck2,
  Check,
  CheckCircle2,
  Landmark,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Minus,
  RotateCcw,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import DashboardGantt from './calendar/DashboardGantt';
import ScheduleDetailModal from './calendar/ScheduleDetailModal';
import { buildStandardHours, DEFAULT_STANDARD_HOURS, filterVpaaApprovedSchedules, findOverlaps, withCalendarDepartments, type CalendarSchedule, type StandardHours } from './calendar/ganttLayout';
import type { TimeGridConfigInput } from '../../lib/timeGrid';
import DashboardMetricCard from '../../components/overview/DashboardMetricCard';
import BuildingUtilizationPanel from '../../components/vpaa/BuildingUtilizationPanel';
import FacultyLoadPanel, { type FacultyLoadRow } from '../../components/vpaa/FacultyLoadPanel';
import AdministrativeActivityPanel, { type ActivityRow } from '../../components/vpaa/AdministrativeActivityPanel';
import { Donut, DonutLegend, FilterSelect, Panel, type Slice } from '../../components/vpaa/DashboardPrimitives';
import { grouped } from '../../lib/dashboardFormat';
import { basicLoadOf } from '../../lib/facultyLoad';
import { formatPersonName } from '../../lib/personName';
import api from '../../lib/api';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { physicalRooms } from '../../lib/roomUsage';
import { formatPhilippineDate } from '../../lib/philippineTime';
import { EMPTY_INSIGHTS, type VpaaInsights } from '../../lib/vpaaInsights';
import {
  institutionTotals,
  latestSubmissionBySection,
  queueSeverity,
  relativeAge,
  rollupDepartments,
  type DepartmentRollup,
  type OverviewSubmission,
} from '../../lib/vpaaOverview';

interface Schedule {
  course_id?:number|null; department_id?:number|null; department?:Department|null; meeting_type?:string|null;
  id:number; semester_id:number; section_id:number; faculty_id?:number|null; subject_id?:number|null; room_id?:number|null;
  day:string; start_time:string; end_time:string; mode?:'on-site'|'online'|'field'; status:string; updated_at?:string;
  section?:{ id:number; section_name:string; department_id:number; department?:{ department_code:string; department_name:string }|null }|null;
  faculty?:{ id:number; first_name:string; last_name:string }|null;
  room?:{ id:number; room_code:string; building?:string|null; room_type?:string }|null;
  course?:{ id:number; course_code:string; course_name:string; course_category?:string|null; units?:number }|null;
  subject?:{ id:number; subject_code:string; subject_name:string; subject_category?:string|null; units?:number }|null;
}
interface Room { id:number; room_code:string; room_type:string; building?:string|null; status?:string|null }
interface Section { id:number; section_name:string; department_id:number }
interface Faculty { id:number; first_name:string; last_name:string; employment_type?:'full-time'|'part-time'; max_units:number; deload_units?:number|null; assigned_units?:number; department_id:number; status:string }
interface Department { id:number; department_name:string; department_code:string; logo?:string|null }
interface Subject { id:number; subject_code:string; subject_name:string }
interface Semester { id:number; academic_year:string; semester:'1st'|'2nd'|'summer'; is_active:boolean }

interface DashboardData {
  schedules:Schedule[]; rooms:Room[]; sections:Section[]; faculties:Faculty[];
  departments:Department[]; subjects:Subject[]; activeSemester:Semester|null;
  submissions:OverviewSubmission[]; scheduleLimitReached:boolean;
  standardHours:StandardHours;
  activeCurriculaCount:number;
}
interface InitialDataResponse {
  schedules?:Schedule[]; rooms?:Room[]; sections?:Section[]; faculties?:Faculty[];
  departments?:Department[]; subjects?:Subject[]; courses?:Subject[]; active_semester?:Semester;
  schedule_submissions?:OverviewSubmission[];
  time_grid?:TimeGridConfigInput;
  active_curricula_count?:number;
}

interface Tile { label:string; value:string; detail:string; icon:LucideIcon; path:string; tone:'brand'|'info'|'good'|'warn'|'alert'|'accent' }

const ATTENTION_COLUMNS = 'minmax(0,1.4fr) minmax(0,1.1fr) minmax(0,0.95fr) minmax(0,0.9fr) 78px';
const WORKFLOW_COLUMNS = 'minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,0.95fr) 92px';

const SCHEDULE_PREVIEW_LIMIT = 2000;

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'progress', label: 'Progress' },
  { key: 'attentions', label: 'Attentions' },
  { key: 'activity', label: 'Activity' },
] as const;
type TabKey = typeof TABS[number]['key'];
const TAB_PARAM = 'tab';
const isTabKey = (value: string | null): value is TabKey => TABS.some(t => t.key === value);

const formatSubmittedOn = (value?:string|null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return formatPhilippineDate(value, { month:'short', day:'numeric', year:'numeric' });
};

const SEVERITY_STYLES = {
  overdue: 'bg-stage-returned/10 text-stage-returned',
  ageing: 'bg-accent/[0.12] text-stage-warnText',
  fresh: 'bg-stage-idle/60 text-muted',
} as const;

const DASHBOARD_LIVE_TOPICS = ['schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty', 'courses', 'departments', 'users', 'settings', 'curriculum'] as const;

export default function VpaaDashboardPage() {
  const navigate = useNavigate();

  const user = useMemo(() => getStoredUser(), []);
  const cacheKey = `dashboard:${user?.role ?? 'vpaa'}:${user?.id ?? 'current'}`;
  const insightsCacheKey = `${cacheKey}:insights`;
  const activityCacheKey = `${cacheKey}:activity`;
  const cached = getCachedData<DashboardData>(cacheKey);

  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const liveRevision = useLiveRevision(DASHBOARD_LIVE_TOPICS);
  const [schedules, setSchedules] = useState<Schedule[]>(cached?.schedules ?? []);
  const [rooms, setRooms] = useState<Room[]>(cached?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cached?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cached?.faculties ?? []);
  const [departments, setDepartments] = useState<Department[]>(cached?.departments ?? []);
  const [, setSubjects] = useState<Subject[]>(cached?.subjects ?? []);
  const [activeCurriculaCount, setActiveCurriculaCount] = useState<number>(cached?.activeCurriculaCount ?? 0);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(cached?.activeSemester ?? null);
  const [submissions, setSubmissions] = useState<OverviewSubmission[]>(cached?.submissions ?? []);
  const [previewTruncated, setPreviewTruncated] = useState(cached?.scheduleLimitReached ?? false);
  const [standardHours, setStandardHours] = useState<StandardHours>(cached?.standardHours ?? DEFAULT_STANDARD_HOURS);
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);

  const cachedInsights = getCachedData<VpaaInsights>(insightsCacheKey);
  const [insights, setInsights] = useState<VpaaInsights>(cachedInsights ?? EMPTY_INSIGHTS);
  const [insightsLoading, setInsightsLoading] = useState(!hasCachedData(insightsCacheKey));

  const cachedActivity = getCachedData<ActivityRow[]>(activityCacheKey);
  const [activity, setActivity] = useState<ActivityRow[]>(cachedActivity ?? []);
  const [activityLoading, setActivityLoading] = useState(!hasCachedData(activityCacheKey));
  const [activityError, setActivityError] = useState(false);

  const [filterDept, setFilterDept] = useState('all');
  const [filterBuilding, setFilterBuilding] = useState('all');
  const [filterRoom, setFilterRoom] = useState('all');
  const [showTimetableFilters, setShowTimetableFilters] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(liveRevision === 0 && !hasCachedData(cacheKey));
      setLoadError(null);
      try {
        const data = await loadCachedData<DashboardData>(cacheKey, async () => {
          const response = await api.get<InitialDataResponse>('/initial-data', {
            params: { schedule_limit: SCHEDULE_PREVIEW_LIMIT },
          });
          const d = response.data || {};
          const rows = Array.isArray(d.schedules) ? d.schedules : [];
          return {
            schedules: rows,
            rooms: Array.isArray(d.rooms) ? d.rooms : [],
            sections: Array.isArray(d.sections) ? d.sections : [],
            faculties: Array.isArray(d.faculties) ? d.faculties : [],
            departments: Array.isArray(d.departments) ? d.departments : [],
            subjects: Array.isArray(d.subjects) ? d.subjects : (Array.isArray(d.courses) ? d.courses : []),
            activeSemester: d.active_semester || null,
            submissions: Array.isArray(d.schedule_submissions) ? d.schedule_submissions : [],
            scheduleLimitReached: rows.length >= SCHEDULE_PREVIEW_LIMIT,
            standardHours: buildStandardHours(d.time_grid?.opening_time, d.time_grid?.closing_time, d.time_grid?.slot_minutes),
            activeCurriculaCount: typeof d.active_curricula_count === 'number' ? d.active_curricula_count : 0,
          };
        }, reloadKey > 0);

        if (!active) return;
        setSchedules(data.schedules);
        setRooms(data.rooms);
        setSections(data.sections);
        setFaculties(data.faculties);
        setDepartments(data.departments);
        setSubjects(data.subjects);
        setActiveCurriculaCount(data.activeCurriculaCount ?? 0);
        setActiveSemester(data.activeSemester);
        setSubmissions(data.submissions ?? []);
        setPreviewTruncated(Boolean(data.scheduleLimitReached));
        setStandardHours(data.standardHours ?? DEFAULT_STANDARD_HOURS);
      } catch {
        if (active) setLoadError('Could not load institution-wide scheduling data. Figures below may be out of date.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [cacheKey, reloadKey, liveRevision]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setInsightsLoading(liveRevision === 0 && !hasCachedData(insightsCacheKey));
      try {
        const data = await loadCachedData<VpaaInsights>(insightsCacheKey, async () => {
          const response = await api.get<VpaaInsights>('/vpaa/dashboard-insights');
          return { ...EMPTY_INSIGHTS, ...(response.data ?? {}) };
        }, reloadKey > 0);
        if (active) setInsights(data);
      } catch {
        if (active && !hasCachedData(insightsCacheKey)) setInsights(EMPTY_INSIGHTS);
      } finally {
        if (active) {
          setInsightsLoading(false);
        }
      }
    };

    load();
    return () => { active = false; };
  }, [insightsCacheKey, reloadKey, liveRevision]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setActivityLoading(liveRevision === 0 && !hasCachedData(activityCacheKey));
      setActivityError(false);
      try {
        const rows = await loadCachedData<ActivityRow[]>(activityCacheKey, async () => {
          const response = await api.get<{ data?: Array<{ id:string; event:string; category:string; occurred_at:string; actor?:{ name?:string|null }|null; actor_type?:ActivityRow['actorType'] }> }>(
            '/activity-log',
            { params: { per_page: 10 } },
          );
          return (response.data?.data ?? []).slice(0, 6).map(row => ({
            id: row.id,
            event: row.event,
            category: row.category,
            actor: row.actor?.name ?? null,
            actorType: row.actor_type,
            occurredAt: row.occurred_at,
          }));
        }, reloadKey > 0);
        if (active) setActivity(rows);
      } catch {
        if (active && !hasCachedData(activityCacheKey)) setActivityError(true);
      } finally {
        if (active) setActivityLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [activityCacheKey, reloadKey, liveRevision]);

  const retry = useCallback(() => setReloadKey(k => k + 1), []);

  const activeSemesterId = activeSemester?.id ?? null;

  const submissionBySection = useMemo(
    () => latestSubmissionBySection(submissions, activeSemesterId),
    [submissions, activeSemesterId],
  );

  const departmentStats = useMemo<DepartmentRollup[]>(
    () => rollupDepartments(departments, sections, submissionBySection),
    [departments, sections, submissionBySection],
  );

  const totals = useMemo(() => institutionTotals(departmentStats), [departmentStats]);

  const workflowRows = useMemo(
    () => [...departmentStats].sort(
      (a, b) => b.progressPercent - a.progressPercent || a.department_code.localeCompare(b.department_code),
    ),
    [departmentStats],
  );

  const fullyApprovedDepartments = departmentStats.filter(d => d.approvalStatus === 'Fully Approved').length;

  const attentionRows = useMemo(
    () => departmentStats
      .filter(d => d.pendingVpaaCount > 0)
      .sort((a, b) => {
        if (!a.submittedAt) return 1;
        if (!b.submittedAt) return -1;
        return a.submittedAt.localeCompare(b.submittedAt);
      }),
    [departmentStats],
  );

  const overrideRows = useMemo(
    () => departmentStats.filter(d => d.hasOverride),
    [departmentStats],
  );

  const readiness = useMemo(() => {
    let readyForApproval = 0;
    let withDean = 0;
    let returned = 0;
    let partlyApproved = 0;
    let stillDrafting = 0;
    let fullyApproved = 0;

    departmentStats.forEach(dept => {
      if (dept.approvalStatus === 'Fully Approved') fullyApproved++;
      else if (dept.pendingVpaaCount > 0) readyForApproval++;
      else if (dept.returnedCount > 0) returned++;
      else if (dept.pendingCount > dept.pendingVpaaCount) withDean++;
      else if (dept.approvedCount > 0) partlyApproved++;
      else stillDrafting++;
    });

    return { readyForApproval, withDean, returned, partlyApproved, stillDrafting, fullyApproved };
  }, [departmentStats]);

  const readinessSlices: Slice[] = [
    { key: 'ready', label: 'Ready for Final Approval', value: readiness.readyForApproval, color: '#C9952A' },
    { key: 'dean', label: 'Waiting on Dean', value: readiness.withDean, color: '#4A6A8A' },
    { key: 'partial', label: 'Partly Approved', value: readiness.partlyApproved, color: '#3F7D58' },
    { key: 'drafting', label: 'Still Drafting', value: readiness.stillDrafting, color: '#A89A8D' },
    { key: 'returned', label: 'Returned for Revision', value: readiness.returned, color: '#B4432F' },
    { key: 'approved', label: 'Fully Approved', value: readiness.fullyApproved, color: '#4e0a10' },
  ];

  const facultyBands = useMemo(() => {
    let completeLoad = 0;
    let remainingCapacity = 0;
    let overloaded = 0;
    let noAssignment = 0;

    faculties.forEach(f => {
      const assigned = f.assigned_units || 0;
      const max = basicLoadOf(f.max_units, f.deload_units);
      if (assigned <= 0) noAssignment++;
      else if (assigned > max) overloaded++;
      else if (assigned === max) completeLoad++;
      else remainingCapacity++;
    });

    return { completeLoad, remainingCapacity, overloaded, noAssignment };
  }, [faculties]);

  const facultySlices: Slice[] = [
    { key: 'complete', label: 'Complete Load', value: facultyBands.completeLoad, color: '#3F7D58' },
    { key: 'remaining', label: 'With Remaining Capacity', value: facultyBands.remainingCapacity, color: '#4A6A8A' },
    { key: 'overloaded', label: 'Overloaded', value: facultyBands.overloaded, color: '#C9952A' },
    { key: 'none', label: 'No Assignment', value: facultyBands.noAssignment, color: '#E6DED5' },
  ];

  const departmentNames = useMemo(
    () => new Map(departments.map(d => [Number(d.id), d.department_code])),
    [departments],
  );

  const overloadedFaculty = useMemo<FacultyLoadRow[]>(
    () => faculties
      .map(f => {
        const assigned = f.assigned_units || 0;
        const max = basicLoadOf(f.max_units, f.deload_units);
        return {
          id: f.id,
          name: formatPersonName(f),
          department: departmentNames.get(Number(f.department_id)) ?? '—',
          assigned,
          max,
          over: assigned - max,
        };
      })
      .filter(row => row.over > 0)
      .sort((a, b) => b.over - a.over),
    [faculties, departmentNames],
  );

  const campusRooms = useMemo(() => physicalRooms(rooms), [rooms]);

  const semesterSchedules = useMemo(
    () => (activeSemesterId ? schedules.filter(s => Number(s.semester_id) === Number(activeSemesterId)) : schedules),
    [activeSemesterId, schedules],
  );

  const publishedSchedules = useMemo(() => withCalendarDepartments(filterVpaaApprovedSchedules(semesterSchedules), departments).map((item) => ({
    ...item,
    course_id: item.course_id ?? item.course?.id ?? item.subject_id,
    mode: item.mode?.toLowerCase().includes('online') || item.room?.room_type?.toLowerCase().includes('online') ? 'online' as const
      : item.mode?.toLowerCase().includes('field') || item.room?.room_type?.toLowerCase().includes('field') ? 'field' as const : 'on-site' as const,
  })), [semesterSchedules, departments]);
  const timelineOverlaps = useMemo(() => findOverlaps(publishedSchedules), [publishedSchedules]);

  const buildingOptions = useMemo(
    () => Array.from(new Set(campusRooms.map(r => (r.building ?? '').trim()).filter(Boolean))).sort(),
    [campusRooms],
  );
  const roomOptions = useMemo(() => {
    const scoped = filterBuilding === 'all'
      ? campusRooms
      : campusRooms.filter(r => (r.building ?? '').trim() === filterBuilding);
    return [...scoped].sort((a, b) => a.room_code.localeCompare(b.room_code));
  }, [campusRooms, filterBuilding]);

  const timetableSchedules = useMemo(() => {
    return publishedSchedules.filter(s => {
      if (filterDept !== 'all' && Number(s.section?.department_id) !== Number(filterDept)) return false;
      if (filterBuilding !== 'all' && (s.room?.building ?? '').trim() !== filterBuilding) return false;
      if (filterRoom !== 'all' && String(s.room_id ?? '') !== filterRoom) return false;
      return true;
    });
  }, [publishedSchedules, filterDept, filterBuilding, filterRoom]);

  const changeBuilding = (value:string) => {
    setFilterBuilding(value);
    setFilterRoom('all');
  };

  const filtersActive = filterDept !== 'all' || filterBuilding !== 'all' || filterRoom !== 'all';
  const activeTimetableFilterCount = [filterDept, filterBuilding, filterRoom].filter(value => value !== 'all').length;
  const resetFilters = () => {
    setFilterDept('all');
    setFilterBuilding('all');
    setFilterRoom('all');
  };

  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isFullscreen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen && !selectedSchedule) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, selectedSchedule]);

  const openApproval = () => navigate('/schedules/approval');

  // The tab lives in the URL so returning from a review lands on the same tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get(TAB_PARAM);
  const tab: TabKey = isTabKey(tabParam) ? tabParam : 'overview';
  const selectTab = useCallback((key: TabKey) => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (key === 'overview') next.delete(TAB_PARAM);
      else next.set(TAB_PARAM, key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  // A tab mounts on its first visit and stays mounted, so the timetable keeps its view.
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<TabKey>>(() => new Set([tab]));
  if (!visitedTabs.has(tab)) setVisitedTabs(new Set(visitedTabs).add(tab));

  // One per department package awaiting final approval, matching the Requires Attention list.
  const attentionCount = departmentStats.filter(d => d.pendingVpaaCount > 0).length;

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = TABS.findIndex(t => t.key === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    selectTab(next.key);
    document.getElementById(`dashboard-tab-${next.key}`)?.focus();
  };

  const kpis: Tile[] = [
    {
      label: 'Awaiting Your Approval',
      value: grouped(totals.pendingVpaa),
      detail: attentionRows.length
        ? `${attentionRows.length} department${attentionRows.length === 1 ? '' : 's'} · oldest ${relativeAge(attentionRows[0]?.submittedAt, now)}`
        : 'Nothing in your queue',
      icon: CalendarCheck2,
      path: '/schedules/approval',
      tone: totals.pendingVpaa > 0 ? 'alert' : 'good',
    },
  ];

  const inventory: Tile[] = [
    { label: 'Departments', value: grouped(departments.length), detail: 'Academic units', icon: Landmark, path: '/departments', tone: 'brand' },
    { label: 'Instructors', value: grouped(faculties.length), detail: 'Active instructors', icon: Users, path: '/instructors', tone: 'brand' },
    { label: 'Curriculums', value: grouped(activeCurriculaCount), detail: 'Active curriculums', icon: BookOpen, path: '/curriculum', tone: 'brand' },
    { label: 'Rooms', value: grouped(campusRooms.length), detail: 'Across campus', icon: Building2, path: '/facilities', tone: 'brand' },
    { label: 'Sections', value: grouped(totals.sections), detail: 'In the active semester', icon: LayoutGrid, path: '/schedules/approval', tone: 'brand' },
  ];

  const timetablePanel = (
    <div className={isFullscreen ? 'fixed inset-0 z-[1000] flex flex-col overflow-auto bg-parchment p-4 font-jakarta text-text sm:p-6' : 'flex min-h-0 min-w-0 flex-1 flex-col'}>
      <section aria-label="Institutional master timetable" className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-white p-5">
        <header className="flex shrink-0 flex-wrap items-center gap-2">
          <h2 className="font-jakarta text-[15px] font-semibold leading-5 tracking-tight text-text">Master timetable</h2>
          <span title="Preview of VPAA-approved classes" className="rounded-full bg-parchment px-2 py-0.5 text-[11px] font-medium text-muted">Preview</span>
          <button type="button" aria-label="Timetable filters" aria-expanded={showTimetableFilters} aria-controls="dashboard-timetable-filters" onClick={() => setShowTimetableFilters(open => !open)}
            data-active={showTimetableFilters || activeTimetableFilterCount > 0}
            className={`selection-indicator ml-auto flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold ${showTimetableFilters || activeTimetableFilterCount > 0 ? '' : 'border-border text-muted hover:bg-parchment'}`}>
            <SlidersHorizontal className="h-3.5 w-3.5" />Filters
            {activeTimetableFilterCount > 0 && <span className="selection-indicator-count">{activeTimetableFilterCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(open => !open)}
            title={isFullscreen ? 'Exit full window (Esc)' : 'Full window view'}
            aria-label={isFullscreen ? 'Exit full window' : 'Full window view'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {filtersActive && <button
            type="button"
            onClick={resetFilters}
            title="Reset filters"
            aria-label="Reset filters"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>}
          <button type="button" onClick={() => navigate('/calendar')} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Master Calendar <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </header>

        {showTimetableFilters && <div id="dashboard-timetable-filters" className="mt-2 flex shrink-0 flex-wrap items-center gap-2 rounded-lg bg-parchment p-2">
          <FilterSelect label="Dept" value={filterDept} onChange={setFilterDept}>
            <option value="all">All</option>
            {departments.map(dept => <option key={dept.id} value={String(dept.id)}>{dept.department_code}</option>)}
          </FilterSelect>
          <FilterSelect label="Building" value={filterBuilding} onChange={changeBuilding}>
            <option value="all">All</option>
            {buildingOptions.map(building => <option key={building} value={building}>{building}</option>)}
          </FilterSelect>
          <FilterSelect label="Room" value={filterRoom} onChange={setFilterRoom}>
            <option value="all">All</option>
            {roomOptions.map(room => <option key={room.id} value={String(room.id)}>{room.room_code}</option>)}
          </FilterSelect>
        </div>}

        {previewTruncated && <p className="mt-2 flex items-start gap-1.5 rounded-md border border-accent/30 bg-accent/[0.12] px-2.5 py-1.5 text-[11px] font-semibold text-stage-warnText">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Preview is based on the most recent {grouped(SCHEDULE_PREVIEW_LIMIT)} meetings; some classes and overlaps may be missing. Campus-wide figures elsewhere on this page cover every meeting.
        </p>}

        <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col">
          <DashboardGantt
            schedules={timetableSchedules}
            allSchedules={publishedSchedules}
            standardHours={standardHours}
            overlaps={timelineOverlaps}
            now={now}
            onSelect={setSelectedSchedule}
            isFullscreen={isFullscreen}
            selectedId={selectedSchedule?.id}
          />
        </div>

      </section>
      <ScheduleDetailModal schedule={selectedSchedule} allSchedules={publishedSchedules} overlaps={timelineOverlaps} onClose={() => setSelectedSchedule(null)} onSelect={setSelectedSchedule} />
    </div>
  );

  const dashboardLoading = loading || insightsLoading || activityLoading;
  const metrics = (
    <section id="dashboard-metrics" data-skeleton={dashboardLoading ? 'metrics' : undefined} className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-7">
      {kpis.map(({ label, value, detail, icon, path, tone }) => <DashboardMetricCard loading={dashboardLoading} key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} onClick={() => navigate(path)} />)}

      <DashboardMetricCard
        loading={dashboardLoading}
        label="Overall Approval Completion"
        value={`${totals.progressPercent}%`}
        detail={`${grouped(totals.approved)} / ${grouped(totals.sections)} sections approved`}
        progress={totals.progressPercent}
        tone={totals.progressPercent === 100 ? 'good' : 'brand'}
        onClick={() => navigate('/schedules/approval')}
      />

      {inventory.map(({ label, value, detail, icon, path, tone }) => <DashboardMetricCard loading={dashboardLoading} key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} onClick={() => navigate(path)} />)}
    </section>
  );

  if (dashboardLoading) return <DashboardSkeleton metrics={metrics} variant="vpaa" tab={tab} />;

  return <div id="dashboard-overview" className="space-y-4 pb-8 font-jakarta text-text">
    {loadError && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-accent/[0.12] px-4 py-3 text-[13px] font-medium text-stage-warnText">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{loadError}</span>
      <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-white px-2.5 py-1.5 font-bold text-stage-warnText transition hover:bg-accent/[0.12]"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>
    </div>}

    <div role="tablist" aria-label="Dashboard sections" onKeyDown={onTabKeyDown} className="flex gap-6 border-b border-border">
      {TABS.map(({ key, label }) => {
        const active = tab === key;
        return <button
          key={key}
          type="button"
          role="tab"
          id={`dashboard-tab-${key}`}
          aria-selected={active}
          aria-controls={`dashboard-panel-${key}`}
          tabIndex={active ? 0 : -1}
          onClick={() => selectTab(key)}
          className={`relative -mb-px flex shrink-0 items-center gap-1.5 rounded-sm px-0.5 pb-2.5 pt-1 text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${active ? 'font-semibold text-primary' : 'font-medium text-muted hover:text-text'}`}
        >
          {label}
          {key === 'attentions' && attentionCount > 0 && <span
            aria-label={`${attentionCount} item${attentionCount === 1 ? '' : 's'} requiring attention`}
            className="rounded-full bg-stage-returned px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-white"
          >{attentionCount}</span>}
          <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-0.5 origin-center rounded-full bg-primary transition-transform duration-200 ease-out ${active ? 'scale-x-100' : 'scale-x-0'}`} />
        </button>;
      })}
    </div>

    {visitedTabs.has('overview') && <div role="tabpanel" id="dashboard-panel-overview" aria-labelledby="dashboard-tab-overview" hidden={tab !== 'overview'}><div className="space-y-4">
    {metrics}

    <section className="flex min-h-0 min-w-0 flex-col xl:h-[640px]">
      {isFullscreen ? createPortal(timetablePanel, document.body) : timetablePanel}
    </section>
    </div></div>}

    {visitedTabs.has('activity') && <div role="tabpanel" id="dashboard-panel-activity" aria-labelledby="dashboard-tab-activity" hidden={tab !== 'activity'}>
      <AdministrativeActivityPanel
        rows={activity}
        loading={activityLoading}
        error={activityError}
        now={now}
        onOpen={() => navigate('/activity-log')}
      />
    </div>}

    {visitedTabs.has('attentions') && <div role="tabpanel" id="dashboard-panel-attentions" aria-labelledby="dashboard-tab-attentions" hidden={tab !== 'attentions'}><div className="space-y-4">
    <section className="grid gap-4">
      <Panel
        title="Requires Attention"
        subtitle="Department packages the Deans have cleared for your final approval, longest-waiting first."
        tone={totals.pendingVpaa > 0 ? 'alert' : 'brand'}
        badge={attentionRows.length}
        action="View approval queue"
        onAction={openApproval}
      >
        <div className={`flex items-center gap-3.5 rounded-xl px-4 py-3.5 ${totals.pendingVpaa ? 'bg-stage-returned/[0.08]' : 'bg-stage-done/[0.08]'}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ${totals.pendingVpaa ? 'text-stage-returned' : 'text-stage-done'}`}>
            {totals.pendingVpaa ? <AlertTriangle className="h-[18px] w-[18px]" /> : <CheckCircle2 className="h-[18px] w-[18px]" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold leading-tight tracking-tight text-primary">
              {grouped(totals.pendingVpaa)} {totals.pendingVpaa === 1 ? 'Section' : 'Sections'} Awaiting VPAA Review
            </div>
            <p className="mt-1 text-xs leading-tight text-text/75">
              {totals.pendingVpaa ? 'Cleared by Deans and waiting on your final approval' : 'Nothing is waiting on your final approval'}
            </p>
          </div>
        </div>

        {overrideRows.length > 0 && <div className="mt-2.5 rounded-xl bg-accent/[0.12] px-4 py-3">
          <p className="text-[11px] font-bold text-stage-warnText">
            {overrideRows.length} package{overrideRows.length === 1 ? '' : 's'} approved by a Dean with an override
          </p>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-stage-warnText">
            {overrideRows.map(row => row.department_code).join(', ')} — a scheduling rule was waived, so these need your explicit review.
          </p>
        </div>}

        {attentionRows.length ? <div className="-mx-1 mt-3 overflow-x-auto px-1 sm:overflow-x-visible">
          <div className="min-w-[520px] sm:min-w-0">
            <div className="grid gap-2 px-3 pb-2 text-[11px] font-bold text-muted" style={{ gridTemplateColumns: ATTENTION_COLUMNS }}>
              <span>Department</span>
              <span>Sections</span>
              <span>Submitted</span>
              <span>Waiting</span>
              <span />
            </div>
            <ul className="space-y-2">
              {attentionRows.map(row => {
                const severity = queueSeverity(row.submittedAt, now);
                return <li key={row.id} className="grid items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5" style={{ gridTemplateColumns: ATTENTION_COLUMNS }}>
                  <span className="min-w-0">
                    <b className="block truncate text-[13px] text-text" title={`${row.department_code} · ${row.department_name}`}>{row.department_name}</b>
                    <span className="flex flex-wrap items-center gap-1">
                      {row.hasOverride && <span className="rounded-full bg-accent/[0.12] px-1.5 py-0.5 text-[11px] font-bold text-stage-warnText" title={row.overrideReason ?? 'Approved with an override'}>Override</span>}
                      {row.revisionNumber > 1 && <span className="rounded-full bg-stage-idle/60 px-1.5 py-0.5 text-[11px] font-bold text-muted" title="This package has been through the review loop before">Rev {row.revisionNumber}</span>}
                    </span>
                  </span>
                  <span className="truncate text-[11px] font-semibold text-muted">
                    {grouped(row.pendingVpaaCount)} of {grouped(row.sectionsCount)}
                  </span>
                  <span className="truncate text-[11px] font-semibold text-muted">{formatSubmittedOn(row.submittedAt)}</span>
                  <span className={`truncate rounded-full px-2 py-0.5 text-center text-[11px] font-bold ${SEVERITY_STYLES[severity]}`} title={severity === 'overdue' ? 'Waiting five days or more' : severity === 'ageing' ? 'Waiting two days or more' : 'Recently submitted'}>
                    {relativeAge(row.submittedAt, now)}
                  </span>
                  <button
                    type="button"
                    onClick={openApproval}
                    title={`Review ${row.department_name} — ${row.pendingVpaaCount} section${row.pendingVpaaCount === 1 ? '' : 's'} awaiting approval`}
                    className="inline-flex h-7 items-center justify-center rounded-md border border-primary/25 bg-white px-2.5 text-xs font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    Review
                  </button>
                </li>;
              })}
            </ul>
          </div>
        </div> : <p className="mt-3 py-4 text-center text-xs text-muted">No department packages are awaiting your review.</p>}
      </Panel>
    </section>

    </div></div>}

    {visitedTabs.has('progress') && <div role="tabpanel" id="dashboard-panel-progress" aria-labelledby="dashboard-tab-progress" hidden={tab !== 'progress'}><div className="space-y-4">
    <section>
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <FacultyLoadPanel
          slices={facultySlices}
          total={faculties.length}
          overloaded={overloadedFaculty}
          onOpen={() => navigate('/instructors')}
        />

        <Panel
          title="Institutional Readiness"
          subtitle="Departments by approval stage."
          action="View readiness"
          onAction={() => navigate('/departments')}
        >
          <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
            <Donut slices={readinessSlices} headline={departments.length} caption="Departments" />
            <DonutLegend slices={readinessSlices} total={departments.length} />
          </div>
        </Panel>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-12">
      <Panel
        title="Workflow · Department Scheduling Progress"
        subtitle="Approval completion for every academic unit."
        action="View all departments"
        onAction={() => navigate('/departments')}
        className="xl:col-span-6"
      >
        {workflowRows.length ? <>
          <div className="-mx-1 overflow-x-auto px-1 sm:overflow-x-visible">
            <div className="min-w-[470px] sm:min-w-0">
              <div className="grid gap-2 px-3 pb-2 text-[11px] font-bold leading-tight text-muted" style={{ gridTemplateColumns: WORKFLOW_COLUMNS }}>
                <span>Department</span>
                <span>Completion</span>
                <span className="text-right">Approved / Total</span>
                <span className="text-right">Stage</span>
              </div>
              <ul className="space-y-2">
                {workflowRows.map(row => <li key={row.id} className="grid items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5" style={{ gridTemplateColumns: WORKFLOW_COLUMNS }}>
                  <b className="truncate text-[13px] text-text" title={`${row.department_code} · ${row.department_name}`}>{row.department_name}</b>
                  <span className="h-6 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ readiness: row.progressPercent, label: `${row.progressPercent}%` }]} layout="vertical" margin={{ top: 4, right: 42, left: 0, bottom: 4 }}>
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" hide />
                        <Bar dataKey="readiness" fill={row.progressPercent === 100 ? '#3F7D58' : row.returnedCount > 0 ? '#B4432F' : '#C9952A'} radius={[4, 4, 4, 4]} barSize={6} background={{ fill: '#E6DED5', radius: 4 }}>
                          <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 11, fontWeight: 600, fill: '#7A6E67' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </span>
                  <span className="text-right text-[11px] font-semibold tabular-nums text-muted">{grouped(row.approvedCount)} / {grouped(row.sectionsCount)}</span>
                  <span className="flex justify-end">
                    <StageBadge status={row.approvalStatus} />
                  </span>
                </li>)}
              </ul>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[11px] font-semibold text-muted">
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-stage-done" /> {fullyApprovedDepartments} of {departments.length} fully approved</span>
            <span className="flex items-center gap-1.5"><Minus className="h-3.5 w-3.5 text-muted/50" /> {grouped(totals.draft)} sections still drafting</span>
            <span className="ml-auto font-bold text-primary tabular-nums">{totals.progressPercent}% institutional</span>
          </div>
        </> : <p className="py-6 text-center text-xs text-muted">No departments are configured yet.</p>}
      </Panel>

      <BuildingUtilizationPanel
        insights={insights}
        loading={insightsLoading}
        onOpenRooms={() => navigate('/facilities')}
        className="xl:col-span-6"
      />
    </section>
    </div></div>}
  </div>;
}

const STAGE_BADGES: Record<DepartmentRollup['approvalStatus'], { label:string; className:string }> = {
  'Fully Approved': { label: 'Approved', className: 'bg-stage-done/10 text-stage-done' },
  'Pending Review': { label: 'In review', className: 'bg-accent/[0.12] text-stage-warnText' },
  Returned: { label: 'Returned', className: 'bg-stage-returned/10 text-stage-returned' },
  'Partially Approved': { label: 'Partial', className: 'bg-stage-waiting/10 text-stage-waiting' },
  Draft: { label: 'Drafting', className: 'bg-stage-idle/60 text-muted' },
};

function StageBadge({ status }: { status: DepartmentRollup['approvalStatus'] }) {
  const badge = STAGE_BADGES[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.className}`} title={status}>{badge.label}</span>;
}
