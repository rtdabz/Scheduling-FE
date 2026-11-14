import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  DoorOpen,
  FileClock,
  FileText,
  FlaskConical,
  Globe2,
  Handshake,
  LayoutGrid,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import RoomRecoveryAlerts from '../../components/rooms/RoomRecoveryAlerts';
import DashboardGantt from '../vpaa/calendar/DashboardGantt';
import ScheduleDetailModal from '../vpaa/calendar/ScheduleDetailModal';
import { buildStandardHours, DEFAULT_STANDARD_HOURS, filterVpaaApprovedSchedules, findOverlaps, withCalendarDepartments, type CalendarDepartment, type CalendarSchedule, type StandardHours } from '../vpaa/calendar/ganttLayout';
import type { TimeGridConfigInput } from '../../lib/timeGrid';
import InstructorWorkloadChart from '../../components/scheduling/InstructorWorkloadChart';
import { DEAN_REQUIRED_MESSAGE, useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { useToast } from '../../context/ToastContext';
import api from '../../lib/api';
import { getStoredUser, hasStoredCapability } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { buildRoomUsage, physicalRooms, roomsInUse } from '../../lib/roomUsage';
import { MILESTONE_TITLES, SUBMISSION_MILESTONES, submissionProgress } from '../../lib/submissionStage';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import DashboardMetricCard from '../../components/overview/DashboardMetricCard';
import { basicLoadOf } from '../../lib/facultyLoad';
import { officePath } from '../../lib/roles';

interface Schedule { id:number; semester_id:number; section_id:number; faculty_id?:number|null; room_id?:number|null; mode?:string|null; day:string; start_time:string; end_time:string; status:string; meeting_type?:string|null; course_id?:number|null; subject_id?:number|null; course?:{id?:number;course_code:string;course_name?:string;course_category?:string|null;units?:number}|null; subject?:{id?:number;subject_code:string;subject_name?:string;subject_category?:string|null;units?:number}|null; faculty?:{id?:number;first_name:string;last_name:string}|null; room?:{id?:number;room_code:string;room_type?:string;building?:string|null}|null; section?:{id?:number;section_name:string}|null; department_id?:number|null }
interface Room { id:number; room_code:string; room_type:string; building?:string|null; status?:string|null; department_id?:number|null }
interface Section { id:number; section_name:string; department_id?:number|null }
interface Faculty { id:number; first_name:string; last_name:string; max_units:number; assigned_units?:number; deload_units?:number; profile_picture?:string|null; department_id:number }
interface Subject { id:number; subject_code:string; subject_name:string; department_id?:number|null }
interface Semester { id:number; status:string }
interface Overview { schedules:Schedule[]; departments?:CalendarDepartment[]; rooms:Room[]; sections:Section[]; faculties:Faculty[]; subjects:Subject[]; activeSemester:Semester|null; standardHours?:StandardHours }
interface InitialData { schedules?:Schedule[]; departments?:CalendarDepartment[]; rooms?:Room[]; sections?:Section[]; faculties?:Faculty[]; subjects?:Subject[]; courses?:Subject[]; active_semester?:Semester; time_grid?:TimeGridConfigInput }

type Tone = 'brand' | 'info' | 'good' | 'warn' | 'alert' | 'accent';

interface Tile { label:string; value:number|string; detail:string; icon:LucideIcon; path:string; tone:Tone }
interface QueueRow { label:string; value:number; action:string; icon:LucideIcon; path:string }

const TONES: Record<Tone, string> = {
  brand: 'bg-primary/10 text-primary',
  info: 'bg-stage-idle/60 text-muted',
  good: 'bg-stage-done/10 text-stage-done',
  warn: 'bg-accent/15 text-stage-warnText',
  alert: 'bg-stage-returned/10 text-stage-returned',
  accent: 'bg-accent/15 text-stage-warnText',
};

// Tinted callout surfaces, one per state, shared by every summary band.
const BANDS = {
  good: 'bg-stage-done/[0.08]',
  warn: 'bg-accent/[0.12]',
  alert: 'bg-stage-returned/[0.08]',
  brand: 'bg-primary/[0.05]',
} as const;

// Chart fills, matched to the `stage` tokens in tailwind.config.js.
const CHART = { done: '#3F7D58', progress: '#C9952A', track: '#E6DED5', brand: '#4e0a10', label: '#7A6E67' } as const;

const LINK = 'rounded text-xs font-semibold text-primary transition-colors hover:text-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const STAGES = ['Draft', 'Ready to Submit', 'Submitted to Dean', 'Returned by Dean', 'Approved by Dean', 'Approved by VPAA'];

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'progress', label: 'Progress' },
] as const;
type TabKey = typeof TABS[number]['key'];
const TAB_PARAM = 'tab';
const isTabKey = (value: string | null): value is TabKey => TABS.some(t => t.key === value);

const percent = (part:number, total:number) => (total > 0 ? Math.round((part / total) * 100) : 0);

type Delivery = 'on-site' | 'online' | 'field';

const deliveryOf = (schedule:Schedule): Delivery => {
  const mode = (schedule.mode ?? '').toLowerCase();
  if (mode.includes('online')) return 'online';
  if (mode.includes('field')) return 'field';
  const roomType = (schedule.room?.room_type ?? '').toLowerCase();
  if (roomType.includes('online')) return 'online';
  if (roomType.includes('field')) return 'field';
  return 'on-site';
};

const needsRoom = (schedule:Schedule) => deliveryOf(schedule) === 'on-site';

const inDepartment = <T extends {department_id?:number|null}>(items:T[], departmentId?:number) =>
  items.filter(item => !departmentId || !item.department_id || Number(item.department_id) === Number(departmentId));

interface SecretaryDashboardPageProps {
  role?: 'secretary' | 'director' | 'program_head';
}

const DASHBOARD_LIVE_TOPICS = ['schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty', 'courses', 'curriculum', 'departments'] as const;

export default function SecretaryDashboardPage({ role = 'secretary' }: SecretaryDashboardPageProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const user = useMemo(() => getStoredUser(), []);
  const departmentId = user?.department_id;
  const canViewSchedules = hasStoredCapability('schedule.view');
  const canUpdateSchedules = hasStoredCapability('schedule.update');
  const canAssignInstructors = hasStoredCapability('schedule.assign_instructor');
  const canAssignCrossDepartment = hasStoredCapability('schedule.assign_instructor_cross_department');
  const isProgramHead = role === 'program_head';
  const paths = isProgramHead
    ? {
        sections: '/program_head/sections',
        schedules: '/program_head/schedule-management',
        instructors: '/program_head/instructors',
        courses: '/program_head/courses',
        rooms: '/program_head/facilities',
        crossDepartment: '/program_head/cross-department-assignments',
      }
    : {
        // A Director runs the same office workspace under /director/*.
        sections: officePath(role, '/secretary/sections'),
        schedules: officePath(role, '/secretary/schedule-management'),
        instructors: officePath(role, '/secretary/instructors'),
        courses: officePath(role, '/secretary/courses'),
        rooms: officePath(role, '/secretary/facilities'),
        crossDepartment: officePath(role, '/secretary/cross-department-assignments'),
      };
  const roomAssignmentPath = canUpdateSchedules ? paths.schedules : paths.rooms;
  const cacheKey = `dashboard:${user?.role ?? 'secretary'}:${user?.id ?? departmentId ?? 'current'}`;
  const cached = getCachedData<Overview>(cacheKey);

  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const liveRevision = useLiveRevision(DASHBOARD_LIVE_TOPICS);
  const [submitting, setSubmitting] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>(cached?.schedules ?? []);
  const [departments, setDepartments] = useState<CalendarDepartment[]>(cached?.departments ?? []);
  const [rooms, setRooms] = useState<Room[]>(cached?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cached?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cached?.faculties ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cached?.subjects ?? []);
  const [semester, setSemester] = useState<Semester | null>(cached?.activeSemester ?? null);
  const [standardHours, setStandardHours] = useState<StandardHours>(cached?.standardHours ?? DEFAULT_STANDARD_HOURS);
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);
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
        const overview = await loadCachedData<Overview>(cacheKey, async () => {
          const { data = {} } = await api.get<InitialData>('/initial-data');
          return {
            schedules: Array.isArray(data.schedules) ? data.schedules : [],
            departments: Array.isArray(data.departments) ? data.departments : [],
            rooms: Array.isArray(data.rooms) ? data.rooms : [],
            sections: Array.isArray(data.sections) ? data.sections : [],
            faculties: Array.isArray(data.faculties) ? data.faculties : [],
            subjects: Array.isArray(data.subjects) ? data.subjects : (Array.isArray(data.courses) ? data.courses : []),
            activeSemester: data.active_semester || null,
            standardHours: buildStandardHours(data.time_grid?.opening_time, data.time_grid?.closing_time, data.time_grid?.slot_minutes),
          };
        }, reloadKey > 0);

        if (!active) return;
        setSchedules(overview.schedules);
        setDepartments(overview.departments ?? []);
        setRooms(overview.rooms);
        setSections(overview.sections);
        setFaculties(overview.faculties);
        setSubjects(overview.subjects);
        setSemester(overview.activeSemester);
        setStandardHours(overview.standardHours ?? DEFAULT_STANDARD_HOURS);
      } catch {
        if (active) setLoadError('Could not load scheduling data. Figures below may be out of date.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [cacheKey, reloadKey, liveRevision]);

  const {
    draftingProgress,
    draftedCount,
    totalSections,
    yearLevels,
    stageCounts,
    canSubmit,
    hasDean,
    crossDepartmentPending,
    error: statusError,
    refetch: refetchStatus,
  } = useDepartmentScheduleStatus(departmentId);

  const visibleSections = useMemo(() => inDepartment(sections, departmentId), [sections, departmentId]);
  const visibleRooms = useMemo(() => inDepartment(rooms, departmentId), [rooms, departmentId]);
  const visibleSubjects = useMemo(() => inDepartment(subjects, departmentId), [subjects, departmentId]);
  const visibleFaculty = useMemo(
    () => faculties.filter(f => !departmentId || Number(f.department_id) === Number(departmentId)),
    [faculties, departmentId],
  );

  const sectionIds = useMemo(() => new Set(visibleSections.map(s => s.id)), [visibleSections]);
  const semesterId = semester?.id;
  const visibleSchedules = useMemo(
    () => schedules.filter(s =>
      (!semesterId || Number(s.semester_id) === Number(semesterId)) &&
      (sectionIds.has(s.section_id) || Number(s.department_id) === Number(departmentId))),
    [schedules, semesterId, sectionIds, departmentId],
  );

  const calendarSchedules = useMemo<CalendarSchedule[]>(() => withCalendarDepartments(filterVpaaApprovedSchedules(visibleSchedules).map(item => ({
    ...item,
    course_id: item.course_id ?? item.course?.id ?? item.subject_id,
    room: item.room?.id ? { id: item.room.id, room_code: item.room.room_code ?? '', building: item.room.building } : null,
    section: item.section?.id ? { id: item.section.id, section_name: item.section.section_name ?? '' } : null,
    faculty: item.faculty?.id ? { id: item.faculty.id, first_name: item.faculty.first_name, last_name: item.faculty.last_name } : null,
    mode: deliveryOf(item),
  })), departments), [visibleSchedules, departments]);
  const timelineOverlaps = useMemo(() => findOverlaps(calendarSchedules), [calendarSchedules]);

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen && !selectedSchedule) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen, selectedSchedule]);

  const scheduledSections = useMemo(() => new Set(visibleSchedules.map(s => s.section_id)).size, [visibleSchedules]);
  const remaining = Math.max(0, visibleSections.length - scheduledSections);
  const noInstructor = visibleSchedules.filter(s => !s.faculty_id && !s.faculty).length;
  const noRoom = visibleSchedules.filter(s => needsRoom(s) && !s.room_id && !s.room).length;
  const onlineClasses = visibleSchedules.filter(s => deliveryOf(s) === 'online').length;
  const fieldClasses = visibleSchedules.filter(s => deliveryOf(s) === 'field').length;
  const incomplete = visibleSchedules.filter(s => (!s.course && !s.subject) || !s.start_time || !s.end_time).length;

  const loads = useMemo(() => visibleFaculty
    .map(f => {
      const assigned = f.assigned_units || 0;
      const max = basicLoadOf(f.max_units, f.deload_units);
      return { ...f, assigned, max, remaining: Math.max(0, max - assigned) };
    })
    .sort((a, b) => b.remaining - a.remaining), [visibleFaculty]);

  const workload = useMemo(
    () => [...loads].sort((a, b) => b.assigned - a.assigned).slice(0, 6),
    [loads],
  );

  const assignableRooms = useMemo(() => physicalRooms(visibleRooms), [visibleRooms]);
  const classesByRoom = useMemo(() => {
    const counts = new Map<number, number>();
    visibleSchedules.forEach(s => {
      if (s.room_id) counts.set(s.room_id, (counts.get(s.room_id) ?? 0) + 1);
    });
    return counts;
  }, [visibleSchedules]);
  const roomUsage = useMemo(() => buildRoomUsage(visibleRooms, classesByRoom), [visibleRooms, classesByRoom]);
  const roomsUsed = roomsInUse(roomUsage);
  const labRooms = assignableRooms.filter(r => (r.room_type ?? '').toLowerCase().includes('lab')).length;

  const checks: ReadonlyArray<readonly [string, boolean]> = [
    ['All required sections have schedules', remaining === 0],
    ['All scheduled classes have instructors', noInstructor === 0],
    ['All on-site classes have rooms', noRoom === 0],
    ['Required schedule information is complete', incomplete === 0],
    ['Every year level has left the draft stage', canSubmit],
    ['A Department Dean is assigned to receive the submission', hasDean],
  ];
  const doneChecks = checks.filter(([, done]) => done).length;
  const ready = percent(doneChecks, checks.length);

  const currentStage = stageCounts.approved ? 5
    : stageCounts.approved_by_dean ? 4
    : stageCounts.revision ? 3
    : stageCounts.submitted ? 2
    : canSubmit ? 1
    : 0;

  const pendingYears = yearLevels.filter(y => !y.isComplete).map(y => y.label);
  const submitHint = !hasDean
    ? DEAN_REQUIRED_MESSAGE
    : canSubmit
      ? 'Every year level has left the draft stage. Schedules are ready for the Dean.'
      : pendingYears.length
        ? `Finish drafting ${pendingYears.join(', ')} before submitting.`
        : 'No active sections found for this department yet.';

  const progress = submissionProgress(currentStage);
  const statusNote = progress.isComplete
    ? 'Approved all the way through. Nothing further is needed for this semester.'
    : currentStage === 4 ? 'The Dean approved these schedules. Waiting on the VPAA.'
    : progress.isReturned ? `${stageCounts.revision} section${stageCounts.revision === 1 ? '' : 's'} came back from the Dean. Revise and submit again.`
    : currentStage === 2 ? 'Schedules are with the Dean for review.'
    : submitHint;
  const statusTone: Tone = progress.isReturned ? 'alert'
    : progress.isComplete || currentStage === 4 ? 'good'
    : currentStage === 2 ? 'brand'
    : canSubmit ? 'good'
    : 'warn';
  const statusBand = progress.isReturned ? BANDS.alert
    : progress.isComplete || currentStage === 4 || canSubmit ? BANDS.good
    : currentStage === 2 ? BANDS.brand
    : BANDS.warn;
  const StatusIcon = progress.isReturned ? RotateCcw
    : progress.isComplete ? ShieldCheck
    : currentStage === 4 ? CheckCircle2
    : currentStage === 2 ? Send
    : canSubmit ? ShieldCheck
    : FileText;

  const submitToDean = async () => {
    if (!departmentId || !canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/departments/${departmentId}/submit-schedules`);
      toast.success('Submitted', 'Department schedules were sent to the Dean for approval.');
      refetchStatus();
      setReloadKey(k => k + 1);
    } catch (err) {
      const payload = (err as { response?: { data?: { message?: string; hint?: string } } })?.response?.data;
      toast.error('Submission failed', payload?.hint || payload?.message || 'Could not submit schedules.');
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setReloadKey(k => k + 1);
    refetchStatus();
  };



  const queue: QueueRow[] = [
    ...(canUpdateSchedules ? [{ label:'Sections that still need schedules', value:remaining, action:'View', icon:CalendarDays, path:paths.schedules } as QueueRow] : []),
    ...(canAssignInstructors ? [{ label:'Classes without instructors', value:noInstructor, action:'Assign', icon:UserRoundCheck, path:paths.schedules } as QueueRow] : []),
    ...(canAssignCrossDepartment ? [{ label:'Delegated classes without instructors', value:crossDepartmentPending, action:'Assign', icon:Handshake, path:paths.crossDepartment } as QueueRow] : []),
    { label:'On-site classes without rooms', value:noRoom, action:'Assign', icon:DoorOpen, path:roomAssignmentPath },
    ...(canUpdateSchedules ? [{ label:'Incomplete schedule entries', value:incomplete, action:'Complete', icon:ClipboardCheck, path:paths.schedules } as QueueRow] : []),
    ...(canViewSchedules ? [{ label:'Sections returned for revision', value:stageCounts.revision, action:'Review', icon:FileClock, path:paths.schedules } as QueueRow] : []),
  ];

  const openQueue = queue.filter(row => row.value > 0).sort((a, b) => b.value - a.value);
  const clearedQueue = queue.filter(row => row.value === 0);
  const openItems = openQueue.reduce((total, row) => total + row.value, 0);

  const progressRows = yearLevels.length
    ? yearLevels
    : [{ year_level:0, label:'All sections', total:visibleSections.length, drafted:scheduledSections, isComplete:remaining === 0 }];

  // Donut arcs: each year level contributes its drafted share, coloured by
  // whether that level is finished. Undrafted sections stay on the neutral
  // track, so nothing drafted means an empty ring.
  const donutSlices = progressRows.flatMap(row => {
    const drafted = Math.min(row.drafted, row.total);
    return [
      { key: `${row.year_level}-drafted`, value: drafted, fill: row.isComplete ? CHART.done : CHART.progress },
      { key: `${row.year_level}-open`, value: row.total - drafted, fill: CHART.track },
    ];
  }).filter(slice => slice.value > 0);
  const hasDraftedSlice = donutSlices.some(slice => slice.fill !== CHART.track);

  // The tab lives in the URL so returning from the schedule builder lands on the same tab.
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

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = TABS.findIndex(t => t.key === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    selectTab(next.key);
    document.getElementById(`dashboard-tab-${next.key}`)?.focus();
  };

  const kpis: Tile[] = [
    {
      label: 'Needs Attention',
      value: openItems,
      detail: openItems ? `${openItems} item${openItems === 1 ? '' : 's'} to resolve` : 'All tasks cleared',
      icon: CalendarCheck2,
      path: paths.schedules,
      tone: openItems > 0 ? 'alert' : 'good',
    },
  ];

  const inventory: Tile[] = [
    { label: 'Sections', value: visibleSections.length, detail: 'Department scope', icon: LayoutGrid, path: paths.sections, tone: 'brand' },
    { label: 'Instructors', value: visibleFaculty.length, detail: 'Active instructors', icon: Users, path: paths.instructors, tone: 'brand' },
    { label: 'Courses', value: visibleSubjects.length, detail: 'Offered courses', icon: BookOpen, path: paths.courses, tone: 'brand' },
    { label: 'Rooms', value: assignableRooms.length, detail: 'Department rooms', icon: Building2, path: paths.rooms, tone: 'brand' },
  ];

  const timetablePanel = (
    <div className={isFullscreen ? 'fixed inset-0 z-[999999] flex flex-col overflow-auto bg-parchment p-4 font-jakarta text-text sm:p-6' : 'flex min-h-0 min-w-0 flex-1 flex-col'}>
      <Panel
        title="Department Academic Timetable"
        action="View full timetable"
        onAction={() => navigate(paths.schedules)}
        headerExtra={<button
          type="button"
          onClick={() => setIsFullscreen(open => !open)}
          title={isFullscreen ? 'Exit full window (Esc)' : 'Full window view'}
          aria-label={isFullscreen ? 'Exit full window' : 'Full window view'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5"/> : <Maximize2 className="h-3.5 w-3.5"/>}
        </button>}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <DashboardGantt
            schedules={calendarSchedules}
            allSchedules={calendarSchedules}
            standardHours={standardHours}
            overlaps={timelineOverlaps}
            now={now}
            onSelect={setSelectedSchedule}
            isFullscreen={isFullscreen}
            selectedId={selectedSchedule?.id}
          />
        </div>
      </Panel>
      <ScheduleDetailModal schedule={selectedSchedule} allSchedules={calendarSchedules} overlaps={timelineOverlaps} onClose={() => setSelectedSchedule(null)} onSelect={setSelectedSchedule} />
    </div>
  );

  const dashboardLoading = loading;
  const metrics = (
    <section id="dashboard-metrics" data-skeleton={dashboardLoading ? 'metrics' : undefined} className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
      {kpis.map(({ label, value, detail, icon, path, tone }) => (
        <DashboardMetricCard
          loading={dashboardLoading}
          key={label}
          label={label}
          value={value}
          detail={detail}
          icon={icon}
          tone={tone}
          onClick={() => navigate(path)}
        />
      ))}

      <DashboardMetricCard
        loading={dashboardLoading}
        label="Drafting Completion"
        value={`${draftingProgress}%`}
        detail={`${draftedCount} / ${totalSections} sections completed`}
        progress={draftingProgress}
        tone={draftingProgress === 100 ? 'good' : 'brand'}
        onClick={() => navigate(paths.schedules)}
      />

      {inventory.map(({ label, value, detail, icon, path, tone }) => (
        <DashboardMetricCard
          loading={dashboardLoading}
          key={label}
          label={label}
          value={value}
          detail={detail}
          icon={icon}
          tone={tone}
          onClick={() => navigate(path)}
        />
      ))}
    </section>
  );

  if (dashboardLoading) {
    return <DashboardSkeleton
      variant="secretary"
      metrics={metrics}
      tab={tab}
      secretaryLayout={{
        queueRowCount: queue.length,
        showDraftingProgress: canViewSchedules,
        showFacultyAssignment: canAssignInstructors,
        showTimetable: canViewSchedules,
        readinessCheckCount: checks.length,
      }}
    />;
  }

  return <div id="dashboard-overview" className="space-y-4 pb-8 font-jakarta text-text">
    {canViewSchedules && <RoomRecoveryAlerts />}
    {(loadError || statusError) && <div className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-[13px] font-medium text-stage-warnText ${BANDS.warn}`}>
      <AlertTriangle className="h-4 w-4 shrink-0"/>
      <span className="flex-1">{loadError || statusError}</span>
      <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-white px-2.5 py-1.5 text-xs font-semibold text-stage-warnText transition-colors hover:bg-accent/10"><RotateCcw className="h-3 w-3"/> Retry</button>
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
          <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-0.5 origin-center rounded-full bg-primary transition-transform duration-200 ease-out ${active ? 'scale-x-100' : 'scale-x-0'}`} />
        </button>;
      })}
    </div>

    {visitedTabs.has('overview') && <div role="tabpanel" id="dashboard-panel-overview" aria-labelledby="dashboard-tab-overview" hidden={tab !== 'overview'}><div className="space-y-4">
    {metrics}

    {canViewSchedules && <section className="flex min-h-0 min-w-0 flex-col xl:h-[640px]">
      {isFullscreen ? createPortal(timetablePanel, document.body) : timetablePanel}
    </section>}
    </div></div>}

    {visitedTabs.has('progress') && <div role="tabpanel" id="dashboard-panel-progress" aria-labelledby="dashboard-tab-progress" hidden={tab !== 'progress'}><div className="space-y-4">
    <section id="dashboard-work-queue" className="grid gap-4 xl:grid-cols-12">
      <Panel title="Scheduling Work Queue" className="xl:col-span-4" action="View all items" onAction={() => navigate(paths.schedules)}>
        <div className={`flex items-center gap-3.5 rounded-xl px-4 py-3.5 ${openItems ? BANDS.warn : BANDS.good}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ${openItems ? 'text-stage-warnText' : 'text-stage-done'}`}>{openItems ? <AlertTriangle className="h-[18px] w-[18px]"/> : <CheckCircle2 className="h-[18px] w-[18px]"/>}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-bold leading-none tracking-tight tabular-nums text-primary">{openItems}</span>
              <span className="min-w-0 truncate text-[13px] font-medium text-text">{openItems === 1 ? 'item needs attention' : 'items need attention'}</span>
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <div className="flex flex-1 gap-1" aria-hidden="true">
                {queue.map((row, i) => <i key={row.label} className={`h-1 flex-1 rounded-full ${i < clearedQueue.length ? 'bg-stage-done' : 'bg-text/10'}`}/>)}
              </div>
              <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted">{clearedQueue.length}/{queue.length} clear</span>
            </div>
          </div>
        </div>

        <ul className="mt-3 space-y-2.5">
          {[...openQueue, ...clearedQueue].map(({label, value, action, icon:Icon, path}) => <li key={label}>
            <button
              type="button"
              onClick={() => navigate(path)}
              className="group flex w-full items-center gap-3 rounded-xl border border-border/70 px-3.5 py-2.5 text-left transition-colors hover:border-primary/30 hover:bg-parchment/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${value ? TONES.warn : TONES.info}`}><Icon className="h-4 w-4"/></span>
              <span className={`min-w-0 flex-1 truncate text-[13px] ${value ? 'font-semibold text-text' : 'font-medium text-muted'}`} title={label}>{label}</span>
              <span className={`flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${value ? 'bg-accent/15 text-stage-warnText' : 'text-muted/60'}`}>{value}</span>
              <span className="flex w-[76px] shrink-0 justify-end">
                {value
                  ? <span className="inline-flex h-7 items-center gap-0.5 rounded-md border border-primary/25 bg-white pl-2.5 pr-1.5 text-xs font-semibold text-primary transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-white">{action}<ChevronRight className="h-3.5 w-3.5"/></span>
                  : <span className="inline-flex h-7 items-center gap-1 rounded-md bg-stage-done/10 px-2 text-xs font-semibold text-stage-done"><Check className="h-3.5 w-3.5"/>Clear</span>}
              </span>
            </button>
          </li>)}
        </ul>
      </Panel>

      {canViewSchedules && <Panel title="Department Drafting Progress" className="xl:col-span-4" action="Open Schedule" onAction={() => navigate(paths.schedules)}>
        <div className="flex items-center gap-5 rounded-xl bg-parchment px-4 py-4">
        <div className="h-24 w-24 shrink-0" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {/* Neutral track: the only thing drawn at 0%. */}
              <Pie
                data={[{ value: 1 }]}
                dataKey="value"
                innerRadius="70%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                fill={CHART.track}
                stroke="none"
                isAnimationActive={false}
              />
              {hasDraftedSlice && <Pie
                data={donutSlices}
                dataKey="value"
                innerRadius="70%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                stroke="#F7F4F0"
                strokeWidth={donutSlices.length > 1 ? 2 : 0}
              >
                {donutSlices.map(slice => <Cell key={slice.key} fill={slice.fill}/>)}
              </Pie>}
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[34px] font-bold leading-none tracking-tight tabular-nums text-primary">{draftingProgress}%</div>
          <div className="mt-2 text-[13px] font-medium leading-tight text-text"><span className="font-semibold tabular-nums">{draftedCount} of {totalSections}</span> sections completed</div>
        </div>
        </div>

        <ul className="mt-3 space-y-2.5">
          {progressRows.map(row => {
            const value = percent(row.drafted, row.total);
            return (
              <li key={row.year_level} className="min-w-0 rounded-xl border border-border/70 px-4 py-3.5">
                <div className="flex items-center gap-2">
                  {row.isComplete
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-stage-done"/>
                    : <span className={`mx-px h-3.5 w-3.5 shrink-0 rounded-full border-2 ${row.drafted > 0 ? 'border-accent' : 'border-stage-drafting/60'}`}/>}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text" title={row.label}>{row.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted"><span className="font-semibold text-text">{row.drafted}</span> of {row.total}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stage-idle" role="progressbar" aria-label={`${row.label} drafting progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
                  <div className={`h-full rounded-full ${row.isComplete ? 'bg-stage-done' : 'bg-accent'}`} style={{ width: `${value}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>}

      {canAssignInstructors && <Panel title="Instructor Assignment" className="xl:col-span-4" action="Open Schedule Builder" onAction={() => navigate(paths.schedules)}>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-text">Workload progress</span>
          <span className="text-[11px] text-muted">Assigned / max units</span>
        </div>
        <InstructorWorkloadChart instructors={workload} cards/>
      </Panel>}
    </section>

    <section className="grid items-stretch gap-4 xl:grid-cols-2">
      <Panel title="Room Assignment" action="View rooms" onAction={() => navigate(paths.rooms)}>
        <button
          type="button"
          onClick={() => navigate(roomAssignmentPath)}
          className={`group flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${noRoom ? `${BANDS.alert} hover:bg-stage-returned/[0.13]` : `${BANDS.good} hover:bg-stage-done/[0.13]`}`}
        >
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ${noRoom ? 'text-stage-returned' : 'text-stage-done'}`}>{noRoom ? <AlertTriangle className="h-[18px] w-[18px]"/> : <CheckCircle2 className="h-[18px] w-[18px]"/>}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[28px] font-bold leading-none tracking-tight tabular-nums text-primary">{noRoom}</span>
            <span className="mt-1.5 block text-xs font-medium leading-tight text-text/80">{noRoom ? 'on-site classes still waiting for a room' : 'every on-site class has a room'}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"/>
        </button>

        <div className="mt-3 grid grid-cols-4 divide-x divide-border/70 rounded-xl bg-parchment/70 py-3">
          <StatChip icon={DoorOpen} value={assignableRooms.length} label="Rooms"/>
          <StatChip icon={FlaskConical} value={labRooms} label="Labs"/>
          <StatChip icon={Globe2} value={onlineClasses} label="Online"/>
          <StatChip icon={MapPin} value={fieldClasses} label="Field"/>
        </div>

        <div className="mt-4 flex items-baseline justify-between gap-2">
          <span className="text-xs font-semibold text-text">Room usage</span>
          <span className="text-[11px] tabular-nums text-muted">{roomsUsed} of {assignableRooms.length} rooms in use</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stage-idle" role="progressbar" aria-label="Rooms in use" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(roomsUsed, assignableRooms.length)}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent(roomsUsed, assignableRooms.length)}%` }}/>
        </div>

        {roomUsage.length ? <ul className="mt-3.5 space-y-2.5">
          {roomUsage.slice(0, 5).map(room => <li key={room.code} className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_auto] items-center gap-2.5">
            <span className="truncate text-xs font-semibold text-text" title={room.code}>{room.code}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-stage-idle">
              <div className="h-full rounded-full bg-primary" style={{ width: `${room.share}%` }}/>
            </div>
            <span className="min-w-[4.5rem] whitespace-nowrap text-right text-[11px] tabular-nums text-muted">{room.classes} {room.classes === 1 ? 'class' : 'classes'}</span>
          </li>)}
        </ul> : <p className="mt-2 py-3 text-center text-xs text-muted">No rooms available to this department.</p>}

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <button type="button" onClick={() => navigate(paths.rooms)} className={`inline-flex items-center gap-1 ${LINK}`}>Go to Room List <ArrowRight className="h-3.5 w-3.5"/></button>
          {roomUsage.length > 5 && <span className="text-[11px] text-muted">+{roomUsage.length - 5} more</span>}
        </div>
      </Panel>

      <Panel title="Submission Overview" className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-3">
          <div className={`rounded-xl px-3.5 py-3 ${statusBand}`}>
            <div className="flex items-start gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white ${TONES[statusTone].split(' ').filter(c => c.startsWith('text-')).join(' ')}`}><StatusIcon className="h-4 w-4"/></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold leading-tight text-primary" title={STAGES[currentStage]}>{STAGES[currentStage]}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted">Step {progress.at + 1} of {SUBMISSION_MILESTONES.length}</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-text/75">{statusNote}</p>
              </div>
            </div>
          </div>

          <ol className="flex items-start pt-0.5">
            {SUBMISSION_MILESTONES.map((milestone, i) => {
              const passed = i < progress.done;
              const here = i === progress.at && !passed;
              return <li key={milestone} className="relative min-w-0 flex-1 text-center">
                {i < SUBMISSION_MILESTONES.length - 1 && <div className={`absolute left-1/2 top-[11px] h-0.5 w-full ${passed ? 'bg-stage-done' : 'bg-stage-idle'}`}/>}
                <span
                  title={MILESTONE_TITLES[milestone]}
                  className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                    passed ? 'bg-stage-done text-white'
                    : here ? (progress.isReturned ? 'bg-stage-returned text-white ring-4 ring-stage-returned/15' : 'border-2 border-primary bg-white text-primary ring-4 ring-primary/10')
                    : 'border border-border bg-white text-muted'}`}
                >
                  {passed ? <Check className="h-3 w-3"/> : here && progress.isReturned ? <RotateCcw className="h-3 w-3"/> : i + 1}
                </span>
                <div className={`mt-1.5 px-0.5 text-[10px] leading-3 ${here ? 'font-semibold text-primary' : passed ? 'font-medium text-stage-done' : 'font-medium text-muted'}`}>{milestone}</div>
              </li>;
            })}
          </ol>

          <div className="flex flex-1 flex-col border-t border-border/60 pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-text">Readiness</span>
              <span className="text-[11px] font-medium tabular-nums text-muted">{doneChecks} of {checks.length} checks</span>
            </div>
            <div className="mt-1 h-7 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ readiness: ready, label: `${ready}%` }]} layout="vertical" margin={{ top: 4, right: 38, left: 0, bottom: 4 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis type="category" hide />
                  <Bar dataKey="readiness" fill={ready === 100 ? CHART.done : CHART.progress} radius={[4, 4, 4, 4]} barSize={6} background={{ fill: CHART.track, radius: 4 }}>
                    <LabelList dataKey="label" position="right" offset={8} style={{ fontSize: 11, fontWeight: 600, fill: CHART.label }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-2">
              {checks.map(([label, done]) => <li key={label} className="flex items-start gap-2">
                {done
                  ? <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stage-done text-white"><Check className="h-2.5 w-2.5" strokeWidth={3}/></span>
                  : <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-accent bg-accent/10"/>}
                <span className={`min-w-0 flex-1 text-xs leading-4 ${done ? 'text-muted' : 'font-medium text-text'}`}>{label}</span>
              </li>)}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => navigate(paths.schedules)}
            title={canSubmit ? 'Submission is done from the schedule workflow' : submitHint}
            className="group inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {canSubmit
              ? <><Send className="h-4 w-4"/>Submit in Schedule Workflow</>
              : <>Continue Drafting Schedules<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"/></>}
          </button>
        </div>
      </Panel>

      <Panel title="Submission Status" className="hidden">
        <ol className="flex items-start overflow-x-auto pb-3">
          {STAGES.map((stage, i) => <li key={stage} className="relative min-w-16 flex-1 text-center">
            {i < STAGES.length - 1 && <div className={`absolute left-1/2 top-3 h-0.5 w-full ${i < currentStage ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            <span className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${i <= currentStage ? 'bg-primary' : 'bg-slate-300'}`}>{i < currentStage ? <Check className="h-3 w-3" /> : i + 1}</span>
            <div className="mt-1.5 px-1 text-[10px] font-semibold leading-3">{stage}</div>
          </li>)}
        </ol>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-wide text-primary">Current Status</div><div className="text-sm font-bold text-primary">{STAGES[currentStage]}</div><p className="mt-1 text-[11px] leading-4 text-slate-500">{submitHint}</p></div>
          <button type="button" onClick={submitToDean} disabled={!canSubmit || submitting || !departmentId} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-bold text-white transition ${canSubmit && !submitting && departmentId ? 'bg-primary hover:bg-primary-light' : 'cursor-not-allowed bg-slate-300'}`}>
            {submitting ? <LoadingSpinner size={12} /> : <Send className="h-3 w-3" />}{submitting ? 'Submittingâ€¦' : 'Submit to Dean'}
          </button>
        </div>
      </Panel>
    </section>

    <section className="hidden grid gap-4 xl:grid-cols-12">
      <Panel title="Submission Readiness Checklist" className="xl:col-span-12">
        <div className="grid gap-4 md:grid-cols-[1fr_140px] md:items-center">
          <div className="grid gap-2 sm:grid-cols-2">
            {checks.map(([label, done]) => <div key={label} className="flex items-center gap-2 text-[11px]">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><Check className="h-3 w-3"/></span>
              <span className="min-w-0 flex-1 font-medium">{label}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${done ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}>{done ? 'Complete' : 'Pending'}</span>
            </div>)}
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{ready}%</div>
            <div className="text-[10px] text-slate-500">Ready to submit to the Dean</div>
            <button type="button" onClick={() => navigate(paths.schedules)} className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-[11px] font-bold text-white transition hover:bg-primary-light">Review Details</button>
          </div>
        </div>
      </Panel>

      <Panel title="Submission Status" className="hidden xl:col-span-5">
        <ol className="flex items-start overflow-x-auto pb-3">
          {STAGES.map((stage, i) => <li key={stage} className="relative min-w-16 flex-1 text-center">
            {i < STAGES.length - 1 && <div className={`absolute left-1/2 top-3 h-0.5 w-full ${i < currentStage ? 'bg-emerald-400' : 'bg-slate-200'}`}/>}
            <span className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${i <= currentStage ? 'bg-primary' : 'bg-slate-300'}`}>{i < currentStage ? <Check className="h-3 w-3"/> : i + 1}</span>
            <div className="mt-1.5 px-1 text-[10px] font-semibold leading-3">{stage}</div>
          </li>)}
        </ol>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-primary">Current Status</div>
            <div className="text-sm font-bold text-primary">{STAGES[currentStage]}</div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{submitHint}</p>
          </div>
          <button
            type="button"
            onClick={submitToDean}
            disabled={!canSubmit || submitting || !departmentId}
            title={canSubmit ? 'Send every department schedule to the Dean' : submitHint}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-[11px] font-bold text-white transition ${canSubmit && !submitting && departmentId ? 'bg-primary hover:bg-primary-light' : 'cursor-not-allowed bg-slate-300'}`}
          >
            {submitting ? <LoadingSpinner size={12} /> : <Send className="h-3 w-3"/>}
            {submitting ? 'Submitting…' : 'Submit to Dean'}
          </button>
        </div>
      </Panel>
    </section>
    </div></div>}
  </div>;
}

function Panel({title, children, action, onAction, headerExtra, className = ''}:{title:string; children:ReactNode; action?:string; onAction?:() => void; headerExtra?:ReactNode; className?:string}) {
  return <section className={`min-w-0 rounded-xl border border-border bg-white p-5 ${className}`}>
    <div className="mb-4 flex min-h-[28px] items-center justify-between gap-3">
      <h2 className="min-w-0 truncate font-jakarta text-[15px] font-semibold leading-5 tracking-tight text-text" title={title}>{title}</h2>
      <div className="flex shrink-0 items-center gap-2">
        {action && <button type="button" onClick={onAction} className="-mr-1.5 inline-flex h-7 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md pl-2 pr-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">{action}<ChevronRight className="h-3.5 w-3.5"/></button>}
        {headerExtra}
      </div>
    </div>
    {children}
  </section>;
}

function StatChip({icon:Icon, value, label}:{icon:LucideIcon; value:number; label:string}) {
  return <div className="min-w-0 px-2 text-center">
    <span className="block text-lg font-bold leading-none tabular-nums text-text">{value}</span>
    <span className="mt-1.5 flex items-center justify-center gap-1 text-[11px] font-medium text-muted" title={label}>
      <Icon className="h-3 w-3 shrink-0 text-primary/60"/><span className="truncate">{label}</span>
    </span>
  </div>;
}



import LoadingSpinner from "../../components/ui/LoadingSpinner";
