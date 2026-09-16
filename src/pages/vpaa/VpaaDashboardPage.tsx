import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarCheck2,
  Check,
  CheckCircle2,
  GaugeCircle,
  Landmark,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Minus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import DashboardGantt from './calendar/DashboardGantt';
import ScheduleDetailModal from './calendar/ScheduleDetailModal';
import { buildStandardHours, DEFAULT_STANDARD_HOURS, findOverlaps, withCalendarDepartments, type CalendarSchedule, type StandardHours } from './calendar/ganttLayout';
import { isVpaaApproved } from '../../lib/scheduleStatus';
import type { TimeGridConfigInput } from '../../lib/timeGrid';
import DashboardMetricCard from '../../components/overview/DashboardMetricCard';
import ExecutiveHeader from '../../components/vpaa/ExecutiveHeader';
import BuildingUtilizationPanel from '../../components/vpaa/BuildingUtilizationPanel';
import FacultyLoadPanel, { type FacultyLoadRow } from '../../components/vpaa/FacultyLoadPanel';
import AdministrativeActivityPanel, { type ActivityRow } from '../../components/vpaa/AdministrativeActivityPanel';
import { Donut, DonutLegend, FilterSelect, Panel, type Slice } from '../../components/vpaa/DashboardPrimitives';
import { grouped } from '../../lib/dashboardFormat';
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
  percent,
  queueSeverity,
  relativeAge,
  rollupDepartments,
  type DepartmentRollup,
  type OverviewSubmission,
} from '../../lib/vpaaOverview';

/**
 * The VPAA's institutional overview.
 *
 * Two rules govern where each figure comes from, and they are the reason this
 * page does not simply count the `schedules` array the way the department
 * dashboards do:
 *
 *  - Approval state comes from `schedule_submissions`. See lib/vpaaOverview.ts
 *    for why reading `schedules.status` reported approved departments as drafts.
 *  - Campus-wide aggregates (room load, peak hours, coverage gaps) come from
 *    `/vpaa/dashboard-insights`, which counts server-side over every meeting in
 *    the semester. The `schedules` array here is capped and is used only to draw the
 *    timetable preview, which is explicitly a preview.
 */

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
interface Faculty { id:number; first_name:string; last_name:string; employment_type?:'full-time'|'part-time'; max_units:number; assigned_units?:number; probono_units?:number|null; department_id:number; status:string }
interface Department { id:number; department_name:string; department_code:string; logo?:string|null }
interface Subject { id:number; subject_code:string; subject_name:string }
interface Semester { id:number; academic_year:string; semester:'1st'|'2nd'|'summer'; is_active:boolean }

interface DashboardData {
  schedules:Schedule[]; rooms:Room[]; sections:Section[]; faculties:Faculty[];
  departments:Department[]; subjects:Subject[]; activeSemester:Semester|null;
  submissions:OverviewSubmission[]; scheduleLimitReached:boolean;
  standardHours:StandardHours;
}
interface InitialDataResponse {
  schedules?:Schedule[]; rooms?:Room[]; sections?:Section[]; faculties?:Faculty[];
  departments?:Department[]; subjects?:Subject[]; courses?:Subject[]; active_semester?:Semester;
  schedule_submissions?:OverviewSubmission[];
  time_grid?:TimeGridConfigInput;
}

interface Tile { label:string; value:string; detail:string; icon:LucideIcon; path:string; tone:'brand'|'info'|'good'|'warn'|'alert'|'accent' }

const ATTENTION_COLUMNS = 'minmax(0,1.4fr) minmax(0,1.1fr) minmax(0,0.95fr) minmax(0,0.9fr) 78px';
const WORKFLOW_COLUMNS = 'minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,0.95fr) 92px';

/**
 * The dashboard asks for the ceiling the API allows. The timetable preview is
 * still a preview at this size, but a truncated draw is at least reported rather
 * than passed off as the whole campus — and no statistic on the page is derived
 * from this list.
 */
const SCHEDULE_PREVIEW_LIMIT = 2000;

/** "May 11, 2026" — the approval queue's Submitted column. */
const formatSubmittedOn = (value?:string|null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return formatPhilippineDate(value, { month:'short', day:'numeric', year:'numeric' });
};

const SEVERITY_STYLES = {
  overdue: 'bg-rose-50 text-rose-700',
  ageing: 'bg-amber-50 text-amber-800',
  fresh: 'bg-slate-100 text-slate-600',
} as const;

const DASHBOARD_LIVE_TOPICS = ['schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty', 'courses', 'departments', 'users', 'settings'] as const;

export default function VpaaDashboardPage() {
  const navigate = useNavigate();

  const user = useMemo(() => getStoredUser(), []);
  const cacheKey = `dashboard:${user?.role ?? 'vpaa'}:${user?.id ?? 'current'}`;
  // Both keep the `dashboard:` prefix so invalidateCacheGroups('dashboards')
  // still evicts them along with the main payload.
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
  const [subjects, setSubjects] = useState<Subject[]>(cached?.subjects ?? []);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(cached?.activeSemester ?? null);
  const [submissions, setSubmissions] = useState<OverviewSubmission[]>(cached?.submissions ?? []);
  const [previewTruncated, setPreviewTruncated] = useState(cached?.scheduleLimitReached ?? false);
  const [standardHours, setStandardHours] = useState<StandardHours>(cached?.standardHours ?? DEFAULT_STANDARD_HOURS);
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);

  // Campus-wide aggregates. Loaded alongside the main payload rather than inside
  // it: it is a separate, individually cacheable endpoint.
  //
  // These start from their own cache entry rather than from EMPTY_INSIGHTS. They
  // used to fetch unconditionally with `loading` hard-coded true, so on a revisit
  // /initial-data resolved from cache instantly while these two still went to the
  // network — the utilisation and heatmap panels visibly arrived after the rest
  // of the page had already painted.
  const cachedInsights = getCachedData<VpaaInsights>(insightsCacheKey);
  const [insights, setInsights] = useState<VpaaInsights>(cachedInsights ?? EMPTY_INSIGHTS);
  const [insightsLoading, setInsightsLoading] = useState(!hasCachedData(insightsCacheKey));

  const cachedActivity = getCachedData<ActivityRow[]>(activityCacheKey);
  const [activity, setActivity] = useState<ActivityRow[]>(cachedActivity ?? []);
  const [activityLoading, setActivityLoading] = useState(!hasCachedData(activityCacheKey));
  const [activityError, setActivityError] = useState(false);

  // True while any refresh is in flight, cached or not. `insightsLoading` only
  // reports "nothing to paint yet", so the header's spinner needs its own flag
  // to still turn during a manual refresh over warm cache.
  const [insightsRefreshing, setInsightsRefreshing] = useState(true);

  // ── Timetable controls ──
  const [filterDept, setFilterDept] = useState('all');
  const [filterBuilding, setFilterBuilding] = useState('all');
  const [filterRoom, setFilterRoom] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showTimetableFilters, setShowTimetableFilters] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Minute ticker. Drives the queue's Age column so it stays current without a
  // reload, and keeps every row in a render agreeing on "now".
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      // A live refresh keeps the current figures on screen until new ones land.
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
            // The API caps the array rather than reporting a total, so hitting
            // the ceiling exactly is the only signal that rows were dropped.
            scheduleLimitReached: rows.length >= SCHEDULE_PREVIEW_LIMIT,
            standardHours: buildStandardHours(d.time_grid?.opening_time, d.time_grid?.closing_time, d.time_grid?.slot_minutes),
          };
        }, reloadKey > 0);

        if (!active) return;
        setSchedules(data.schedules);
        setRooms(data.rooms);
        setSections(data.sections);
        setFaculties(data.faculties);
        setDepartments(data.departments);
        setSubjects(data.subjects);
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
      setInsightsRefreshing(true);
      try {
        const data = await loadCachedData<VpaaInsights>(insightsCacheKey, async () => {
          const response = await api.get<VpaaInsights>('/vpaa/dashboard-insights');
          return { ...EMPTY_INSIGHTS, ...(response.data ?? {}) };
        }, reloadKey > 0);
        if (active) setInsights(data);
      } catch {
        // Keep whatever the cache already gave us; only a cold failure is blank.
        if (active && !hasCachedData(insightsCacheKey)) setInsights(EMPTY_INSIGHTS);
      } finally {
        if (active) {
          setInsightsLoading(false);
          setInsightsRefreshing(false);
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
          const response = await api.get<{ data?: Array<{ id:string; event:string; category:string; occurred_at:string; actor?:{ name?:string }|null }> }>(
            '/activity-log',
            { params: { per_page: 10 } },
          );
          return (response.data?.data ?? []).slice(0, 6).map(row => ({
            id: row.id,
            event: row.event,
            category: row.category,
            actor: row.actor?.name ?? null,
            occurredAt: row.occurred_at,
          }));
        }, reloadKey > 0);
        if (active) setActivity(rows);
      } catch {
        // A cached trail is still worth showing; only a cold failure is an error.
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

  // ── Approval rollup, from schedule_submissions ──
  const submissionBySection = useMemo(
    () => latestSubmissionBySection(submissions, activeSemesterId),
    [submissions, activeSemesterId],
  );

  const departmentStats = useMemo<DepartmentRollup[]>(
    () => rollupDepartments(departments, sections, submissionBySection),
    [departments, sections, submissionBySection],
  );

  const totals = useMemo(() => institutionTotals(departmentStats), [departmentStats]);

  /** Furthest-along first — the reference's descending completion table. */
  const workflowRows = useMemo(
    () => [...departmentStats].sort(
      (a, b) => b.progressPercent - a.progressPercent || a.department_code.localeCompare(b.department_code),
    ),
    [departmentStats],
  );

  const fullyApprovedDepartments = departmentStats.filter(d => d.approvalStatus === 'Fully Approved').length;

  /**
   * Departments still needing the VPAA, longest-waiting first.
   *
   * A package with no hand-off stamp sorts last rather than first: an empty
   * string compares below every ISO date, which would otherwise put an undated
   * row at the head of the queue and report it as the oldest thing waiting.
   */
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

  // ── Institutional readiness, by department ──
  const readiness = useMemo(() => {
    let readyForApproval = 0;
    let returned = 0;
    let stillDrafting = 0;
    let fullyApproved = 0;

    departmentStats.forEach(dept => {
      if (dept.approvalStatus === 'Fully Approved') fullyApproved++;
      else if (dept.pendingVpaaCount > 0) readyForApproval++;
      else if (dept.returnedCount > 0) returned++;
      else stillDrafting++;
    });

    return { readyForApproval, returned, stillDrafting, fullyApproved };
  }, [departmentStats]);

  const readinessSlices: Slice[] = [
    { key: 'ready', label: 'Ready for Final Approval', value: readiness.readyForApproval, color: '#16a36a' },
    { key: 'drafting', label: 'Still Drafting', value: readiness.stillDrafting, color: '#3b82f6' },
    { key: 'returned', label: 'Returned for Revision', value: readiness.returned, color: '#f59e0b' },
    { key: 'approved', label: 'Fully Approved', value: readiness.fullyApproved, color: '#8b5cf6' },
  ];

  // ── Faculty load bands ──
  const facultyBands = useMemo(() => {
    let completeLoad = 0;
    let remainingCapacity = 0;
    let overloaded = 0;
    let noAssignment = 0;

    faculties.forEach(f => {
      const assigned = f.assigned_units || 0;
      const max = f.max_units ?? 21;
      if (assigned <= 0) noAssignment++;
      else if (assigned > max) overloaded++;
      else if (assigned === max) completeLoad++;
      else remainingCapacity++;
    });

    return { completeLoad, remainingCapacity, overloaded, noAssignment };
  }, [faculties]);

  const facultySlices: Slice[] = [
    { key: 'complete', label: 'Complete Load', value: facultyBands.completeLoad, color: '#16a36a' },
    { key: 'remaining', label: 'With Remaining Capacity', value: facultyBands.remainingCapacity, color: '#3b82f6' },
    { key: 'overloaded', label: 'Overloaded', value: facultyBands.overloaded, color: '#f59e0b' },
    { key: 'none', label: 'No Assignment', value: facultyBands.noAssignment, color: '#cbd5e1' },
  ];

  const departmentNames = useMemo(
    () => new Map(departments.map(d => [Number(d.id), d.department_code])),
    [departments],
  );

  const overloadedFaculty = useMemo<FacultyLoadRow[]>(
    () => faculties
      .map(f => {
        const assigned = f.assigned_units || 0;
        const max = f.max_units ?? 21;
        return {
          id: f.id,
          name: `${f.first_name} ${f.last_name}`.trim(),
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

  // Physical rooms only: ONLINE and FIELD are placeholder rows standing in for a
  // delivery mode, so counting them would overstate the campus room inventory.
  const campusRooms = useMemo(() => physicalRooms(rooms), [rooms]);

  // ── Timetable filters ──
  const semesterSchedules = useMemo(
    () => (activeSemesterId ? schedules.filter(s => Number(s.semester_id) === Number(activeSemesterId)) : schedules),
    [activeSemesterId, schedules],
  );

  // Keep the dashboard a published view; the Master Calendar has a broader scope.
  const publishedSchedules = useMemo(() => withCalendarDepartments(semesterSchedules, departments).filter((item) => isVpaaApproved(item.status)).map((item) => ({
    ...item,
    course_id: item.course_id ?? item.course?.id ?? item.subject_id,
    // Preserve the old dashboard's virtual-room and field classification.
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
    const query = searchQuery.trim().toLowerCase();
    return publishedSchedules.filter(s => {
      if (filterDept !== 'all' && Number(s.section?.department_id) !== Number(filterDept)) return false;
      if (filterBuilding !== 'all' && (s.room?.building ?? '').trim() !== filterBuilding) return false;
      if (filterRoom !== 'all' && String(s.room_id ?? '') !== filterRoom) return false;
      if (!query) return true;
      return [
        s.section?.section_name,
        s.course?.course_code,
        s.course?.course_name,
        s.subject?.subject_code,
        s.subject?.subject_name,
        s.faculty ? `${s.faculty.first_name} ${s.faculty.last_name}` : '',
        s.room?.room_code,
        s.room?.building,
      ].some(value => (value ?? '').toLowerCase().includes(query));
    });
  }, [publishedSchedules, filterDept, filterBuilding, filterRoom, searchQuery]);

  /**
   * The room list is scoped by building, so switching building has to clear the
   * room too — a room from the previous building matches nothing and would filter
   * the grid to empty with no visible reason why.
   */
  const changeBuilding = (value:string) => {
    setFilterBuilding(value);
    setFilterRoom('all');
  };

  const filtersActive = filterDept !== 'all' || filterBuilding !== 'all' || filterRoom !== 'all' || searchQuery !== '';
  const activeTimetableFilterCount = [filterDept, filterBuilding, filterRoom].filter(value => value !== 'all').length;
  const resetFilters = () => {
    setFilterDept('all');
    setFilterBuilding('all');
    setFilterRoom('all');
    setSearchQuery('');
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

  // ── Decision metrics ──
  // Inventory counts (departments, faculty, courses, rooms) moved to the strip
  // below these: they never change during a semester and carry no decision, so they
  // were crowding out the figures the VPAA is meant to act on.
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
    {
      label: 'Classes Without an Instructor',
      value: grouped(insights.coverage.classes_without_instructor),
      detail: `Across ${grouped(insights.coverage.departments_with_gaps)} department${insights.coverage.departments_with_gaps === 1 ? '' : 's'}`,
      icon: UserX,
      path: '/faculty',
      tone: insights.coverage.classes_without_instructor > 0 ? 'warn' : 'good',
    },
    {
      label: 'Faculty Over Max Load',
      value: grouped(facultyBands.overloaded),
      detail: `${percent(facultyBands.overloaded, faculties.length)}% of faculty`,
      icon: Users,
      path: '/faculty',
      tone: facultyBands.overloaded > 0 ? 'warn' : 'good',
    },
    {
      label: 'Average Room Load',
      value: `${insights.utilization.average_utilization}%`,
      detail: `${grouped(insights.utilization.idle_room_count)} room${insights.utilization.idle_room_count === 1 ? '' : 's'} unused`,
      icon: GaugeCircle,
      path: '/rooms',
      tone: 'info',
    },
  ];

  const inventory: Tile[] = [
    { label: 'Departments', value: grouped(departments.length), detail: 'Academic units', icon: Landmark, path: '/departments', tone: 'brand' },
    { label: 'Faculty', value: grouped(faculties.length), detail: 'Active faculty', icon: Users, path: '/faculty', tone: 'accent' },
    { label: 'Courses Offered', value: grouped(subjects.length), detail: 'This semester', icon: BookOpen, path: '/curriculum', tone: 'good' },
    { label: 'Rooms', value: grouped(campusRooms.length), detail: 'Across campus', icon: Building2, path: '/rooms', tone: 'warn' },
    { label: 'Sections', value: grouped(totals.sections), detail: 'In the active semester', icon: LayoutGrid, path: '/schedules', tone: 'info' },
  ];

  const completionSlices = [
    { key: 'done', value: Math.max(0, totals.approved), color: '#16a36a' },
    { key: 'left', value: Math.max(0, totals.sections - totals.approved), color: '#e2e8f0' },
  ].filter(slice => slice.value > 0);

  /**
   * The master-timetable panel. Extracted so the same tree can be portalled to the
   * body for the full-window view without the grid remounting into a new shape.
   */
  const timetablePanel = (
    <div className={isFullscreen ? 'fixed inset-0 z-[1000] flex flex-col overflow-auto bg-white p-4 sm:p-6' : 'flex min-h-0 min-w-0 flex-1 flex-col'}>
      <section aria-label="Institutional master timetable" className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <header className="flex shrink-0 flex-wrap items-center gap-2">
          <h2 className="font-sans text-sm font-bold text-[#5A1220]">Master timetable</h2>
          <span title="Preview of VPAA-approved classes" className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Preview</span>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search timetable"
              aria-label="Search timetable"
              className="w-40 rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-[11px] font-semibold text-slate-700 shadow-sm outline-none transition focus:border-primary/40"
            />
          </div>
          <button type="button" aria-label="Timetable filters" aria-expanded={showTimetableFilters} aria-controls="dashboard-timetable-filters" onClick={() => setShowTimetableFilters(open => !open)}
            className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-semibold ${showTimetableFilters || activeTimetableFilterCount > 0 ? 'border-primary/30 bg-primary/5 text-primary' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <SlidersHorizontal className="h-3.5 w-3.5" />Filters
            {activeTimetableFilterCount > 0 && <span>{activeTimetableFilterCount}</span>}
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen(open => !open)}
            title={isFullscreen ? 'Exit full window (Esc)' : 'Full window view'}
            aria-label={isFullscreen ? 'Exit full window' : 'Full window view'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-primary/30 hover:text-primary"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {filtersActive && <button
            type="button"
            onClick={resetFilters}
            title="Reset filters"
            aria-label="Reset filters"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-primary/30 hover:text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>}
          <button type="button" onClick={() => navigate('/calendar')} className="inline-flex h-7 items-center gap-1 text-[11px] font-bold text-primary hover:underline">
            Master Calendar <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </header>

        {showTimetableFilters && <div id="dashboard-timetable-filters" className="mt-2 flex shrink-0 flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
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

        {previewTruncated && <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Preview is based on the most recent {grouped(SCHEDULE_PREVIEW_LIMIT)} meetings; some classes and overlaps may be missing. Campus-wide figures elsewhere on this page cover every meeting.
        </p>}

        <div className="mt-2 flex min-h-0 min-w-0 flex-1 flex-col">
          <DashboardGantt
            schedules={timetableSchedules}
            allSchedules={publishedSchedules}
            standardHours={standardHours}
            overlaps={timelineOverlaps}
            now={now}
            onSelect={setSelectedSchedule}
            isFullscreen={isFullscreen}
          />
        </div>

      </section>
      <ScheduleDetailModal schedule={selectedSchedule} allSchedules={publishedSchedules} overlaps={timelineOverlaps} onClose={() => setSelectedSchedule(null)} onSelect={setSelectedSchedule} />
    </div>
  );

  // Hold the skeleton until every source has something to paint. Showing the
  // page as soon as /initial-data landed meant the utilisation, heatmap and
  // activity panels filled in seconds later against an otherwise finished page.
  // None of the three blocks a revisit: each is seeded from its own cache above,
  // so a warm dashboard skips this entirely.
  if (loading || insightsLoading || activityLoading) return <DashboardSkeleton variant="vpaa" />;

  return <div id="dashboard-overview" className="space-y-4 pb-8 text-slate-800">
    {loadError && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{loadError}</span>
      <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-bold text-amber-800 transition hover:bg-amber-100"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>
    </div>}

    <ExecutiveHeader
      semester={activeSemester}
      generatedAt={insights.generated_at || null}
      now={now}
      refreshing={insightsRefreshing}
      onRefresh={retry}
      onPrint={() => window.print()}
    />

    <section id="dashboard-metrics" className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      {kpis.map(({ label, value, detail, icon, path, tone }) => <DashboardMetricCard key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} onClick={() => navigate(path)} />)}

      <button
        type="button"
        onClick={() => navigate('/schedules')}
        className="flex min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md xl:col-span-2"
      >
        <div className="relative h-12 w-12 shrink-0 self-start">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={completionSlices.map(slice => ({ name: slice.key, value: slice.value }))}
                dataKey="value"
                innerRadius="67%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                paddingAngle={1}
                stroke="#ffffff"
                strokeWidth={3}
              >
                {completionSlices.map(slice => <Cell key={slice.key} fill={slice.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold leading-none tabular-nums text-primary">{totals.progressPercent}%</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="break-words text-xs font-bold leading-tight">Overall Approval Completion</div>
          <div className="mt-1 h-7 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ readiness: totals.progressPercent, label: `${totals.progressPercent}%` }]} layout="vertical" margin={{ top: 4, right: 38, left: 0, bottom: 4 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" hide />
                <Bar dataKey="readiness" fill={totals.progressPercent === 100 ? '#16a36a' : '#f59e0b'} radius={[5, 5, 5, 5]} barSize={9} background={{ fill: '#e2e8f0', radius: 5 }}>
                  <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-auto break-words pt-0.5 text-[11px] leading-tight text-slate-500">{grouped(totals.approved)} / {grouped(totals.sections)} sections approved</div>
        </div>
      </button>
    </section>

    <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
      {inventory.map(({ label, value, detail, icon, path, tone }) => <DashboardMetricCard key={label} label={label} value={value} detail={detail} icon={icon} tone={tone} onClick={() => navigate(path)} />)}
    </section>

    <section className="grid gap-4">
      <Panel
        title="Requires Attention"
        subtitle="Department packages the Deans have cleared for your final approval, longest-waiting first."
        tone={totals.pendingVpaa > 0 ? 'alert' : 'brand'}
        badge={totals.pendingVpaa}
        action="View approval queue"
        onAction={openApproval}
      >
        <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${totals.pendingVpaa ? 'border-rose-200 bg-rose-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${totals.pendingVpaa ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
            {totals.pendingVpaa ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold leading-tight text-primary">
              {grouped(totals.pendingVpaa)} {totals.pendingVpaa === 1 ? 'Section' : 'Sections'} Awaiting VPAA Review
            </div>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-slate-600">
              {totals.pendingVpaa ? 'Cleared by Deans and waiting on your final approval' : 'Nothing is waiting on your final approval'}
            </p>
          </div>
        </div>

        {overrideRows.length > 0 && <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
          <p className="text-[11px] font-bold text-amber-900">
            {overrideRows.length} package{overrideRows.length === 1 ? '' : 's'} approved by a Dean with an override
          </p>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-amber-800">
            {overrideRows.map(row => row.department_code).join(', ')} — a scheduling rule was waived, so these need your explicit review.
          </p>
        </div>}

        {attentionRows.length ? <div className="-mx-1 mt-3 overflow-x-auto px-1 sm:overflow-x-visible">
          <div className="min-w-[520px] sm:min-w-0">
            <div className="grid gap-2 border-b border-slate-100 pb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400" style={{ gridTemplateColumns: ATTENTION_COLUMNS }}>
              <span>Department</span>
              <span>Sections</span>
              <span>Submitted</span>
              <span>Waiting</span>
              <span />
            </div>
            <ul className="divide-y divide-slate-100">
              {attentionRows.map(row => {
                const severity = queueSeverity(row.submittedAt, now);
                return <li key={row.id} className="grid items-center gap-2 py-2" style={{ gridTemplateColumns: ATTENTION_COLUMNS }}>
                  <span className="min-w-0">
                    <b className="block truncate text-[12px] text-slate-700" title={`${row.department_code} · ${row.department_name}`}>{row.department_name}</b>
                    <span className="flex flex-wrap items-center gap-1">
                      {row.hasOverride && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800" title={row.overrideReason ?? 'Approved with an override'}>Override</span>}
                      {row.revisionNumber > 1 && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600" title="This package has been through the review loop before">Rev {row.revisionNumber}</span>}
                    </span>
                  </span>
                  <span className="truncate text-[11px] font-semibold text-slate-500">
                    {grouped(row.pendingVpaaCount)} of {grouped(row.sectionsCount)}
                  </span>
                  <span className="truncate text-[11px] font-semibold text-slate-500">{formatSubmittedOn(row.submittedAt)}</span>
                  <span className={`truncate rounded-full px-2 py-0.5 text-center text-[11px] font-bold ${SEVERITY_STYLES[severity]}`} title={severity === 'overdue' ? 'Waiting five days or more' : severity === 'ageing' ? 'Waiting two days or more' : 'Recently submitted'}>
                    {relativeAge(row.submittedAt, now)}
                  </span>
                  <button
                    type="button"
                    onClick={openApproval}
                    title={`Review ${row.department_name} — ${row.pendingVpaaCount} section${row.pendingVpaaCount === 1 ? '' : 's'} awaiting approval`}
                    className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                  >
                    Review
                  </button>
                </li>;
              })}
            </ul>
          </div>
        </div> : <p className="mt-3 py-4 text-center text-xs italic text-slate-400">No department packages are awaiting your review.</p>}
      </Panel>
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
              <div className="grid gap-2 border-b border-slate-100 pb-2 text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-400" style={{ gridTemplateColumns: WORKFLOW_COLUMNS }}>
                <span>Department</span>
                <span>Completion</span>
                <span className="text-right">Approved / Total</span>
                <span className="text-right">Stage</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {workflowRows.map(row => <li key={row.id} className="grid items-center gap-2 py-2" style={{ gridTemplateColumns: WORKFLOW_COLUMNS }}>
                  <b className="truncate text-[12px] text-slate-700" title={`${row.department_code} · ${row.department_name}`}>{row.department_name}</b>
                  <span className="h-6 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ readiness: row.progressPercent, label: `${row.progressPercent}%` }]} layout="vertical" margin={{ top: 4, right: 38, left: 0, bottom: 4 }}>
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" hide />
                        <Bar dataKey="readiness" fill={row.progressPercent === 100 ? '#16a36a' : row.returnedCount > 0 ? '#e11d48' : '#f59e0b'} radius={[5, 5, 5, 5]} barSize={9} background={{ fill: '#e2e8f0', radius: 5 }}>
                          <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </span>
                  <span className="text-right text-[11px] font-semibold tabular-nums text-slate-500">{grouped(row.approvedCount)} / {grouped(row.sectionsCount)}</span>
                  <span className="flex justify-end">
                    <StageBadge status={row.approvalStatus} />
                  </span>
                </li>)}
              </ul>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[11px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600" /> {fullyApprovedDepartments} of {departments.length} fully approved</span>
            <span className="flex items-center gap-1.5"><Minus className="h-3.5 w-3.5 text-slate-300" /> {grouped(totals.draft)} sections still drafting</span>
            <span className="ml-auto font-bold text-primary tabular-nums">{totals.progressPercent}% institutional</span>
          </div>
        </> : <p className="py-6 text-center text-xs italic text-slate-400">No departments are configured yet.</p>}
      </Panel>

      <BuildingUtilizationPanel
        insights={insights}
        loading={insightsLoading}
        onOpenRooms={() => navigate('/rooms')}
        className="xl:col-span-6"
      />
    </section>

    <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* Let the activity column set the desktop height, not the number of Gantt rows. */}
      <div className="flex min-h-0 min-w-0 flex-col xl:[contain:size]">
        {isFullscreen ? createPortal(timetablePanel, document.body) : timetablePanel}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <FacultyLoadPanel
          slices={facultySlices}
          total={faculties.length}
          overloaded={overloadedFaculty}
          onOpen={() => navigate('/faculty')}
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

        {/* Both columns share a bottom edge; the Gantt viewport absorbs extra height. */}
        <AdministrativeActivityPanel
          rows={activity}
          loading={activityLoading}
          error={activityError}
          now={now}
          onOpen={() => navigate('/activity-log')}
          className="min-h-[220px] flex-1"
          compact
        />
      </div>
    </section>
  </div>;
}

const STAGE_BADGES: Record<DepartmentRollup['approvalStatus'], { label:string; className:string }> = {
  'Fully Approved': { label: 'Approved', className: 'bg-emerald-50 text-emerald-700' },
  'Pending Review': { label: 'In review', className: 'bg-amber-50 text-amber-800' },
  Returned: { label: 'Returned', className: 'bg-rose-50 text-rose-700' },
  'Partially Approved': { label: 'Partial', className: 'bg-sky-50 text-sky-700' },
  Draft: { label: 'Drafting', className: 'bg-slate-100 text-slate-600' },
};

/**
 * The workflow table's rightmost column used to be a tick or a dash, which could
 * only say "approved" or "not approved" — a department whose schedules the Dean
 * had sent back looked identical to one that had not started.
 */
function StageBadge({ status }: { status: DepartmentRollup['approvalStatus'] }) {
  const badge = STAGE_BADGES[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`} title={status}>{badge.label}</span>;
}
