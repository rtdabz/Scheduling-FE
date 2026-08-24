import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  DoorOpen,
  FileText,
  Landmark,
  Maximize2,
  Minimize2,
  Minus,
  RotateCcw,
  Search,
  Undo2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import DashboardTimetableGrid from '../../components/scheduling/DashboardTimetableGrid';
import { DashboardNotificationBanner } from '../../components/overview';
import type { ActivityFeedItem } from '../../components/overview';
import { useSystemNotifications } from '../../hooks/useSystemNotifications';
import api from '../../lib/api';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { physicalRooms } from '../../lib/roomUsage';
import { termLabel } from '../../lib/termLabel';

interface Schedule {
  id:number; term_id:number; section_id:number; faculty_id?:number|null; subject_id?:number|null; room_id?:number|null;
  day:string; start_time:string; end_time:string; mode?:'on-site'|'online'|'field'; status:string; updated_at?:string;
  section?:{ id:number; section_name:string; department_id:number; department?:{ department_code:string; department_name:string }|null }|null;
  faculty?:{ id:number; first_name:string; last_name:string }|null;
  room?:{ id:number; room_code:string; building?:string|null; room_type?:string }|null;
  course?:{ id:number; course_code:string; course_name:string; course_category?:string|null; units?:number }|null;
  subject?:{ id:number; subject_code:string; subject_name:string; subject_category?:string|null; units?:number }|null;
}
interface Room { id:number; room_code:string; room_type:string; building?:string|null; status?:string|null }
interface Section { id:number; section_name:string; department_id:number; department?:{ id:number; department_code:string; department_name:string }|null }
interface Faculty { id:number; first_name:string; last_name:string; employment_type?:'full-time'|'part-time'; max_units:number; assigned_units?:number; probono_units?:number|null; department_id:number; status:string }
interface Department { id:number; department_name:string; department_code:string }
interface Subject { id:number; subject_code:string; subject_name:string }
interface Term { id:number; academic_year:string; semester:'1st'|'2nd'|'summer'; is_active:boolean }

interface DashboardData {
  schedules:Schedule[]; rooms:Room[]; sections:Section[]; faculties:Faculty[];
  departments:Department[]; subjects:Subject[]; activeTerm:Term|null;
}
interface InitialDataResponse {
  schedules?:Schedule[]; rooms?:Room[]; sections?:Section[]; faculties?:Faculty[];
  departments?:Department[]; subjects?:Subject[]; courses?:Subject[]; active_term?:Term;
}

type Tone = 'brand' | 'info' | 'good' | 'warn' | 'alert' | 'accent';

interface Tile { label:string; value:number; detail:string; icon:LucideIcon; path:string; tone:Tone }

const TONES: Record<Tone, string> = {
  brand: 'bg-primary/10 text-primary',
  info: 'bg-slate-100 text-slate-600',
  good: 'bg-emerald-50 text-emerald-600',
  warn: 'bg-amber-50 text-amber-700',
  alert: 'bg-rose-50 text-rose-600',
  accent: 'bg-violet-50 text-violet-600',
};

const ATTENTION_COLUMNS = 'minmax(0,1.4fr) minmax(0,1.3fr) minmax(0,0.95fr) minmax(0,0.85fr) 74px';
const WORKFLOW_COLUMNS = 'minmax(0,1.5fr) minmax(0,1.35fr) minmax(0,0.95fr) 84px';

const percent = (part:number, total:number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** One decimal — the precision the donut legends quote each share to. */
const share1 = (part:number, total:number) => (total > 0 ? ((part / total) * 100).toFixed(1) : '0.0');

/** Thousands separators, so institution-wide counts stay readable. */
const grouped = (value:number) => value.toLocaleString();

/** "May 11, 2026" — the approval queue's Submitted column. */
const formatSubmittedOn = (value?:string|null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
};

/**
 * "3 days ago" — how long a package has been sitting in the VPAA queue.
 *
 * `reference` is the dashboard's minute ticker rather than a fresh Date, so every
 * row in a render agrees on "now" and the column refreshes on the same beat as
 * the timetable's current-time marker.
 */
const relativeAge = (value:string|null|undefined, reference:Date) => {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.max(0, Math.floor((reference.getTime() - then) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

interface Slice { key:string; label:string; value:number; color:string }

/** Per-department rollup behind the workflow table, readiness donut and queue. */
interface DepartmentStat {
  id:number;
  department_name:string;
  department_code:string;
  sectionsCount:number;
  /** Sections the VPAA has approved. */
  completedCount:number;
  /** Sections anywhere in review — with the Dean or with the VPAA. */
  pendingCount:number;
  /** Sections the Dean has cleared and the VPAA has not, i.e. this queue. */
  pendingVpaaCount:number;
  /** Newest Dean hand-off among those sections. */
  submittedAt:string|null;
  approvalStatus:string;
  progressPercent:number;
}

/** Icon and tint for one administrative-activity row, keyed off notification type. */
const activityLook = (type?:string): { icon:LucideIcon; tone:string } => {
  if (type === 'schedule_approved_by_vpaa' || type === 'schedule_approved_by_dean') return { icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600' };
  if (type === 'schedule_returned_by_vpaa' || type === 'schedule_returned_by_dean') return { icon: RotateCcw, tone: 'bg-rose-50 text-rose-600' };
  if (type === 'schedule_submitted') return { icon: FileText, tone: 'bg-amber-50 text-amber-700' };
  if (type === 'schedule_withdrawn') return { icon: Undo2, tone: 'bg-slate-100 text-slate-600' };
  return { icon: Activity, tone: 'bg-primary/10 text-primary' };
};

export default function VpaaDashboardPage() {
  const navigate = useNavigate();

  const user = useMemo(() => getStoredUser(), []);
  const cacheKey = `dashboard:${user?.role ?? 'vpaa'}:${user?.id ?? 'current'}`;
  const cached = getCachedData<DashboardData>(cacheKey);

  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [schedules, setSchedules] = useState<Schedule[]>(cached?.schedules ?? []);
  const [rooms, setRooms] = useState<Room[]>(cached?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cached?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cached?.faculties ?? []);
  const [departments, setDepartments] = useState<Department[]>(cached?.departments ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cached?.subjects ?? []);
  const [activeTerm, setActiveTerm] = useState<Term | null>(cached?.activeTerm ?? null);

  const { feedItems: notificationItems, unreadCount, markAllAsRead } = useSystemNotifications();

  // ── Timetable controls ──
  const [filterDept, setFilterDept] = useState('all');
  const [filterBuilding, setFilterBuilding] = useState('all');
  const [filterRoom, setFilterRoom] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Minute ticker. Drives the queue's Age column so it stays current without a reload.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(!hasCachedData(cacheKey));
      setLoadError(null);
      try {
        const data = await loadCachedData<DashboardData>(cacheKey, async () => {
          const response = await api.get<InitialDataResponse>('/initial-data');
          const d = response.data || {};
          return {
            schedules: Array.isArray(d.schedules) ? d.schedules : [],
            rooms: Array.isArray(d.rooms) ? d.rooms : [],
            sections: Array.isArray(d.sections) ? d.sections : [],
            faculties: Array.isArray(d.faculties) ? d.faculties : [],
            departments: Array.isArray(d.departments) ? d.departments : [],
            subjects: Array.isArray(d.subjects) ? d.subjects : (Array.isArray(d.courses) ? d.courses : []),
            activeTerm: d.active_term || null,
          };
        }, reloadKey > 0);

        if (!active) return;
        setSchedules(data.schedules);
        setRooms(data.rooms);
        setSections(data.sections);
        setFaculties(data.faculties);
        setDepartments(data.departments);
        setSubjects(data.subjects);
        setActiveTerm(data.activeTerm);
      } catch {
        if (active) setLoadError('Could not load institution-wide scheduling data. Figures below may be out of date.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [cacheKey, reloadKey]);

  const retry = () => setReloadKey(k => k + 1);

  const activeTermId = activeTerm?.id;

  // ── Schedule status per section, newest row wins ──
  const scheduleStatusMap = useMemo(() => {
    const map = new Map<number, { status:string; updated_at?:string }>();
    schedules.forEach(s => {
      const matchesActiveTerm = !activeTermId || Number(s.term_id) === Number(activeTermId);
      if (matchesActiveTerm && !map.has(s.section_id)) {
        map.set(s.section_id, { status: s.status, updated_at: s.updated_at });
      }
    });
    return map;
  }, [activeTermId, schedules]);

  const termSchedules = useMemo(
    () => (activeTermId ? schedules.filter(s => Number(s.term_id) === Number(activeTermId)) : schedules),
    [activeTermId, schedules],
  );

  // Physical rooms only: ONLINE and FIELD are placeholder rows standing in for a
  // delivery mode, so counting them would overstate the campus room inventory.
  const campusRooms = useMemo(() => physicalRooms(rooms), [rooms]);

  // ── Executive overview ──
  const totalSectionsCount = sections.length;
  /** Sections carrying at least one schedule row this term. */
  const scheduledSectionCount = scheduleStatusMap.size;
  const schedulingCompletion = percent(scheduledSectionCount, totalSectionsCount);

  // ── Overall section status spread ──
  const overallStats = useMemo(() => {
    let draftCount = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    sections.forEach(sec => {
      const val = scheduleStatusMap.get(sec.id);
      if (!val) { draftCount++; return; }
      if (val.status === 'approved') approvedCount++;
      else if (val.status === 'submitted' || val.status === 'approved_by_dean') pendingCount++;
      else if (val.status === 'rejected' || val.status === 'rejected_by_dean') rejectedCount++;
      else draftCount++;
    });

    return {
      draftCount,
      pendingCount,
      approvedCount,
      rejectedCount,
      progressPercent: percent(approvedCount, sections.length),
    };
  }, [sections, scheduleStatusMap]);

  /** Sections the Dean cleared that the VPAA has not — the final-approval queue. */
  const awaitingVpaaReview = useMemo(() => {
    let pending = 0;
    scheduleStatusMap.forEach(val => { if (val.status === 'approved_by_dean') pending++; });
    return pending;
  }, [scheduleStatusMap]);

  // ── Per-department rollup ──
  const departmentStats = useMemo<DepartmentStat[]>(() => departments.map(dept => {
    const deptSections = sections.filter(sec => Number(sec.department_id) === Number(dept.id));
    let completedCount = 0;
    let pendingCount = 0;
    let pendingVpaaCount = 0;
    let submittedAt: string | null = null;

    deptSections.forEach(sec => {
      const val = scheduleStatusMap.get(sec.id);
      if (!val) return;
      if (val.status === 'approved') {
        completedCount++;
      } else if (val.status === 'submitted' || val.status === 'approved_by_dean') {
        pendingCount++;
        if (val.status === 'approved_by_dean') {
          pendingVpaaCount++;
          // ISO-8601 stamps sort chronologically as text, so no Date churn per row.
          if (val.updated_at && (!submittedAt || val.updated_at > submittedAt)) submittedAt = val.updated_at;
        }
      }
    });

    const sectionsCount = deptSections.length;
    let approvalStatus = 'Draft';
    if (completedCount === sectionsCount && sectionsCount > 0) approvalStatus = 'Fully Approved';
    else if (pendingCount > 0) approvalStatus = 'Pending Review';
    else if (completedCount > 0) approvalStatus = 'Partially Approved';

    return {
      id: dept.id,
      department_name: dept.department_name,
      department_code: dept.department_code,
      sectionsCount,
      completedCount,
      pendingCount,
      pendingVpaaCount,
      submittedAt,
      approvalStatus,
      progressPercent: percent(completedCount, sectionsCount),
    };
  }), [departments, sections, scheduleStatusMap]);

  /** Furthest-along first, matching the reference's descending completion table. */
  const workflowRows = useMemo(
    () => [...departmentStats].sort((a, b) => b.progressPercent - a.progressPercent || a.department_code.localeCompare(b.department_code)),
    [departmentStats],
  );

  const fullyApprovedDepartments = departmentStats.filter(d => d.approvalStatus === 'Fully Approved').length;

  /**
   * Departments still needing the VPAA, newest hand-off first — the order the
   * reference's queue is in.
   */
  const attentionRows = useMemo(
    () => departmentStats
      .filter(d => d.pendingVpaaCount > 0)
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')),
    [departmentStats],
  );

  // ── Institutional readiness, by department ──
  const readiness = useMemo(() => {
    let readyForApproval = 0;
    let stillDrafting = 0;
    let fullyApproved = 0;

    departmentStats.forEach(dept => {
      if (dept.approvalStatus === 'Fully Approved') fullyApproved++;
      else if (dept.pendingVpaaCount > 0) readyForApproval++;
      else stillDrafting++;
    });

    return { readyForApproval, stillDrafting, fullyApproved };
  }, [departmentStats]);

  const readinessSlices: Slice[] = [
    { key: 'ready', label: 'Ready for Final Approval', value: readiness.readyForApproval, color: '#16a36a' },
    { key: 'drafting', label: 'Still Drafting', value: readiness.stillDrafting, color: '#3b82f6' },
    { key: 'approved', label: 'Fully Approved', value: readiness.fullyApproved, color: '#8b5cf6' },
  ];

  // ── Faculty load bands ──
  // The ceiling formula is unchanged from the previous dashboard (max_units with a
  // 21-unit fallback); the bands below just split the old "available" bucket so
  // faculty with nothing assigned are reported separately.
  const facultyBands = useMemo(() => {
    let completeLoad = 0;
    let remainingCapacity = 0;
    let overloaded = 0;
    let noAssignment = 0;

    faculties.forEach(f => {
      const assigned = f.assigned_units || 0;
      const max = f.max_units || 21;
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

  // ── Timetable filters ──
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
    return termSchedules.filter(s => {
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
  }, [termSchedules, filterDept, filterBuilding, filterRoom, searchQuery]);

  const timetableRoomsUsed = useMemo(
    () => new Set(timetableSchedules.map(s => s.room_id).filter(Boolean)).size,
    [timetableSchedules],
  );
  const timetableRoomsFree = Math.max(0, campusRooms.length - timetableRoomsUsed);

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
  const resetFilters = () => {
    setFilterDept('all');
    setFilterBuilding('all');
    setFilterRoom('all');
    setSearchQuery('');
  };

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const openApproval = () => navigate('/schedules/approval');

  const tiles: Tile[] = [
    { label: 'Departments', value: departments.length, detail: 'All academic units', icon: Landmark, path: '/departments', tone: 'brand' },
    { label: 'Faculty', value: faculties.length, detail: 'Active faculty', icon: Users, path: '/faculty', tone: 'accent' },
    { label: 'Courses', value: subjects.length, detail: 'Curriculum courses', icon: BookOpen, path: '/curriculum-view', tone: 'good' },
    { label: 'Rooms', value: campusRooms.length, detail: 'Across campus', icon: Building2, path: '/rooms', tone: 'warn' },
  ];

  const completionSlices = [
    { key: 'done', value: Math.max(0, scheduledSectionCount), color: '#16a36a' },
    { key: 'left', value: Math.max(0, totalSectionsCount - scheduledSectionCount), color: '#e2e8f0' },
  ].filter(slice => slice.value > 0);

  const activityRows: ActivityFeedItem[] = notificationItems.slice(0, 5);

  /**
   * The master-timetable panel. Extracted so the same tree can be portalled to the
   * body for the full-window view without the grid remounting into a new shape.
   */
  const timetablePanel = (
    <div className={isFullscreen ? 'fixed inset-0 z-[999999] flex flex-col overflow-auto bg-white p-4 sm:p-6' : 'flex h-full min-w-0 flex-col'}>
      <Panel
        title="Institutional Master Timetable (Preview)"
        subtitle="Campus-wide classes for today."
        action="Open Master Timetable"
        onAction={() => navigate('/calendar')}
        className="flex flex-1 flex-col"
      >
        <div className="flex flex-wrap items-center gap-2">
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

          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search timetable"
              aria-label="Search timetable"
              className="w-40 rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-[10px] font-semibold text-slate-700 shadow-sm outline-none transition focus:border-primary/40"
            />
          </div>
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
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <StatChip icon={CalendarCheck2} value={timetableSchedules.length} label="Scheduled Classes" />
          <StatChip icon={Building2} value={timetableRoomsUsed} label="Rooms in Use" />
          <StatChip icon={DoorOpen} value={timetableRoomsFree} label="Available Rooms" />
        </div>

        <div className="mt-3 min-w-0">
          <DashboardTimetableGrid
            schedules={timetableSchedules}
            sectionLabel={`${grouped(departments.length)} ${departments.length === 1 ? 'department' : 'departments'} · ${grouped(timetableSchedules.length)} ${timetableSchedules.length === 1 ? 'class' : 'classes'}`}
            onOpenSchedule={() => navigate('/schedules')}
          />
        </div>

        <button
          type="button"
          onClick={() => navigate('/calendar')}
          className="mt-auto self-start pt-3 text-[11px] font-bold text-primary hover:underline"
        >
          Open Master Timetable <ArrowRight className="inline h-3 w-3" />
        </button>
      </Panel>
    </div>
  );

  if (loading) return <DashboardSkeleton variant="vpaa" />;

  return <div className="space-y-4 pb-8 text-slate-800">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-primary">VPAA Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Institution-wide scheduling monitoring and final approval.</p>
      </div>
    </header>

    {loadError && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{loadError}</span>
      <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-bold text-amber-800 transition hover:bg-amber-100"><RotateCcw className="h-3 w-3" /> Retry</button>
    </div>}

    <DashboardNotificationBanner
      items={notificationItems}
      unreadCount={unreadCount}
      actionLabel="Open VPAA Reviews"
      onAction={openApproval}
      onMarkAllRead={markAllAsRead}
    />

    <SectionLabel>Executive Overview</SectionLabel>

    <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-7">
      {tiles.map(({ label, value, detail, icon: Icon, path, tone }) => <button
        key={label}
        type="button"
        onClick={() => navigate(path)}
        className="flex min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}><Icon className="h-4 w-4" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-lg font-bold leading-5 text-primary">{grouped(value)}</div>
          <div className="mt-1 break-words text-[11px] font-bold leading-tight">{label}</div>
          <div className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{detail}</div>
        </div>
      </button>)}

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
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold leading-none tabular-nums text-primary">{schedulingCompletion}%</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="break-words text-[11px] font-bold leading-tight">Overall Scheduling Completion</div>
          <div className="mt-1 h-7 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ readiness: schedulingCompletion, label: `${schedulingCompletion}%` }]} layout="vertical" margin={{ top: 4, right: 38, left: 0, bottom: 4 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" hide />
                <Bar dataKey="readiness" fill={schedulingCompletion === 100 ? '#16a36a' : '#f59e0b'} radius={[5, 5, 5, 5]} barSize={9} background={{ fill: '#e2e8f0', radius: 5 }}>
                  <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{grouped(scheduledSectionCount)} / {grouped(totalSectionsCount)} sections scheduled</div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => navigate('/departments')}
        className="flex min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${fullyApprovedDepartments === departments.length && departments.length > 0 ? TONES.good : TONES.info}`}><CheckCircle2 className="h-4 w-4" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-lg font-bold leading-5 text-primary">{fullyApprovedDepartments} / {departments.length}</div>
          <div className="mt-1 break-words text-[11px] font-bold leading-tight">Fully Approved Departments</div>
          <div className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{percent(fullyApprovedDepartments, departments.length)}% of departments</div>
        </div>
      </button>
    </section>

    <section className="grid gap-4 xl:grid-cols-12">
      <Panel
        title="Requires Attention"
        subtitle="Department packages the Deans have cleared for your final approval."
        tone="alert"
        action="View all approval queue"
        onAction={openApproval}
        className="xl:col-span-6"
      >
        <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${awaitingVpaaReview ? 'border-rose-200 bg-rose-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${awaitingVpaaReview ? TONES.alert : TONES.good}`}>
            {awaitingVpaaReview ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold leading-tight text-primary">
              {grouped(awaitingVpaaReview)} {awaitingVpaaReview === 1 ? 'Schedule' : 'Schedules'} Awaiting VPAA Review
            </div>
            <p className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-600">
              {awaitingVpaaReview ? 'Submitted by Deans for final approval' : 'Nothing is waiting on your final approval'}
            </p>
          </div>
        </div>

        {attentionRows.length ? <div className="-mx-1 mt-3 overflow-x-auto px-1">
          <div className="min-w-[500px]">
            <div className="grid gap-2 border-b border-slate-100 pb-2 text-[9px] font-bold uppercase tracking-wide text-slate-400" style={{ gridTemplateColumns: ATTENTION_COLUMNS }}>
              <span>Department</span>
              <span>Academic Term</span>
              <span>Submitted</span>
              <span>Age</span>
              <span />
            </div>
            <ul className="divide-y divide-slate-100">
              {attentionRows.map(row => <li key={row.id} className="grid items-center gap-2 py-2" style={{ gridTemplateColumns: ATTENTION_COLUMNS }}>
                <b className="truncate text-[11px] text-slate-700" title={row.department_name}>{row.department_name}</b>
                <span className="truncate text-[10px] font-semibold text-slate-500" title={termLabel(activeTerm)}>{termLabel(activeTerm)}</span>
                <span className="truncate text-[10px] font-semibold text-slate-500">{formatSubmittedOn(row.submittedAt)}</span>
                <span className="truncate text-[10px] font-semibold text-slate-500">{relativeAge(row.submittedAt, now)}</span>
                <button
                  type="button"
                  onClick={openApproval}
                  title={`Review ${row.department_name} — ${row.pendingVpaaCount} section${row.pendingVpaaCount === 1 ? '' : 's'} awaiting approval`}
                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
                >
                  Review
                </button>
              </li>)}
            </ul>
          </div>
        </div> : <p className="mt-3 py-4 text-center text-[11px] italic text-slate-400">No department packages are awaiting your review.</p>}
      </Panel>

      <Panel
        title="Workflow · Department Scheduling Progress"
        subtitle="Approval completion for every academic unit."
        action="View all departments"
        onAction={() => navigate('/departments')}
        className="xl:col-span-6"
      >
        {workflowRows.length ? <>
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="min-w-[460px]">
              <div className="grid gap-2 border-b border-slate-100 pb-2 text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-400" style={{ gridTemplateColumns: WORKFLOW_COLUMNS }}>
                <span>Department</span>
                <span>Completion</span>
                <span className="text-right">Sections (Done / Total)</span>
                <span className="text-right">Fully Approved</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {workflowRows.map(row => <li key={row.id} className="grid items-center gap-2 py-2" style={{ gridTemplateColumns: WORKFLOW_COLUMNS }}>
                  <b className="truncate text-[11px] text-slate-700" title={`${row.department_code} · ${row.department_name}`}>{row.department_name}</b>
                  <span className="h-6 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ readiness: row.progressPercent, label: `${row.progressPercent}%` }]} layout="vertical" margin={{ top: 4, right: 38, left: 0, bottom: 4 }}>
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" hide />
                        <Bar dataKey="readiness" fill={row.progressPercent === 100 ? '#16a36a' : '#f59e0b'} radius={[5, 5, 5, 5]} barSize={9} background={{ fill: '#e2e8f0', radius: 5 }}>
                          <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </span>
                  <span className="text-right text-[10px] font-semibold tabular-nums text-slate-500">{grouped(row.completedCount)} / {grouped(row.sectionsCount)}</span>
                  <span className="flex justify-end">
                    {row.approvalStatus === 'Fully Approved'
                      ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Fully approved" />
                      : <Minus className="h-3.5 w-3.5 text-slate-300" aria-label="Not approved yet" />}
                  </span>
                </li>)}
              </ul>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-600" /> Fully Approved</span>
            <span className="flex items-center gap-1.5"><Minus className="h-3 w-3 text-slate-300" /> Not Approved Yet</span>
            <span className="ml-auto font-bold text-primary tabular-nums">{overallStats.progressPercent}% institutional</span>
          </div>
        </> : <p className="py-6 text-center text-[11px] italic text-slate-400">No departments are configured yet.</p>}
      </Panel>
    </section>

    <SectionLabel>Tactical · Operational Overview</SectionLabel>

    <section className="grid items-stretch gap-4 xl:grid-cols-12">
      <div className="min-w-0 xl:col-span-5">
        {isFullscreen ? createPortal(timetablePanel, document.body) : timetablePanel}
      </div>

      <Panel
        title="Faculty Load Overview"
        subtitle="Teaching load spread across all faculty."
        action="View Faculty Loads"
        onAction={() => navigate('/faculty')}
        className="flex flex-col xl:col-span-3"
      >
        <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
          <Donut slices={facultySlices} headline={grouped(faculties.length)} caption="Total Faculty" />
          <DonutLegend slices={facultySlices} total={faculties.length} />
        </div>

        <button
          type="button"
          onClick={() => navigate('/faculty')}
          className="mt-auto self-start pt-3 text-[11px] font-bold text-primary hover:underline"
        >
          View Faculty Loads <ArrowRight className="inline h-3 w-3" />
        </button>
      </Panel>

      <div className="flex min-w-0 flex-col gap-4 xl:col-span-4">
        <Panel
          title="Institutional Readiness"
          subtitle="Departments by approval stage."
          action="View Readiness"
          onAction={() => navigate('/departments')}
        >
          <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
            <Donut slices={readinessSlices} headline={departments.length} caption="Departments" />
            <DonutLegend slices={readinessSlices} total={departments.length} />
          </div>
        </Panel>

        <Panel
          title="Recent Administrative Activity"
          subtitle="Latest workflow events across the institution."
          action="View all activity"
          onAction={openApproval}
          className="flex flex-1 flex-col"
        >
          {activityRows.length ? <ul className="space-y-2.5">
            {activityRows.map(item => {
              const { icon: Icon, tone } = activityLook(item.type);
              return <li key={item.id} className="flex items-start gap-2.5">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tone}`}><Icon className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {item.isUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    <span className="truncate text-[11px] font-bold leading-tight text-slate-700" title={item.title}>{item.title ?? 'Activity'}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[10px] font-medium leading-tight text-slate-500" title={item.action}>{item.action}</p>
                </div>
                <span className="shrink-0 text-[9px] font-semibold text-slate-400">{item.timestamp}</span>
              </li>;
            })}
          </ul> : <p className="py-4 text-center text-[11px] italic text-slate-400">No recent administrative activity.</p>}
        </Panel>
      </div>
    </section>
  </div>;
}

/** Small eyebrow label grouping a band of panels, as in the reference layout. */
function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary/70">{children}</h2>;
}

function Panel({ title, subtitle, badge, tone = 'brand', children, action, onAction, className = '' }: {
  title: string;
  subtitle?: string;
  badge?: number;
  tone?: 'brand' | 'alert';
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
    <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className={`text-[11px] font-bold uppercase tracking-wide ${tone === 'alert' ? 'text-rose-600' : 'text-primary'}`}>{title}</h2>
          {badge != null && badge > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold leading-none tabular-nums text-white">{badge}</span>}
        </div>
        {subtitle && <p className="mt-1 text-[10px] font-medium leading-tight text-slate-500">{subtitle}</p>}
      </div>
      {action && <button type="button" onClick={onAction} className="inline-flex shrink-0 items-center text-[10px] font-bold text-primary hover:underline">{action}<ChevronRight className="h-3 w-3" /></button>}
    </div>
    {children}
  </section>;
}

/**
 * Donut and its centre readout — the same recharts configuration as the Secretary
 * dashboard's drafting donut, so every dashboard draws the same ring.
 *
 * An all-zero series is drawn as one neutral ring rather than nothing: recharts
 * renders no arcs when every value is 0, which reads as a broken chart.
 */
function Donut({ slices, headline, caption }: { slices: Slice[]; headline: number | string; caption: string }) {
  const filled = slices.filter(slice => slice.value > 0);
  const rows: Slice[] = filled.length ? filled : [{ key: 'empty', label: 'No data', value: 1, color: '#e2e8f0' }];

  return <div className="relative mx-auto h-32 w-32">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={rows.map(slice => ({ name: slice.label, value: slice.value }))}
          dataKey="value"
          innerRadius="67%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          paddingAngle={1}
          stroke="#ffffff"
          strokeWidth={3}
        >
          {rows.map(slice => <Cell key={slice.key} fill={slice.color} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
    <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white text-center">
      <b className="text-2xl leading-none text-primary">{headline}</b>
      <span className="mt-1 px-1 text-[9px] font-semibold leading-tight text-slate-500">{caption}</span>
    </div>
  </div>;
}

function DonutLegend({ slices, total }: { slices: Slice[]; total: number }) {
  return <ul className="min-w-0 space-y-2">
    {slices.map(slice => <li key={slice.key} className="flex items-start gap-2">
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] font-bold leading-tight text-slate-700" title={slice.label}>{slice.label}</div>
        <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-500">{slice.value.toLocaleString()} ({share1(slice.value, total)}%)</div>
      </div>
    </li>)}
  </ul>;
}

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return <label className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 shadow-sm">
    <span className="shrink-0">{label}:</span>
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      aria-label={label}
      className="max-w-[92px] cursor-pointer truncate border-none bg-transparent p-0 pr-1 text-[10px] font-bold text-slate-700 outline-none"
    >
      {children}
    </select>
  </label>;
}

function StatChip({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2 text-center">
    <Icon className="mx-auto h-3.5 w-3.5 text-primary/70" />
    <b className="mt-1 block text-sm leading-none tabular-nums text-primary">{value.toLocaleString()}</b>
    <span className="mt-1 block truncate text-[9px] font-semibold text-slate-500" title={label}>{label}</span>
  </div>;
}
