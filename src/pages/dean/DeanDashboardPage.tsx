import { formatPhilippineDate } from '../../lib/philippineTime';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  CalendarCheck2,
  Check,
  FileText,
  LayoutGrid,
  Maximize2,
  Minimize2,
  RotateCcw,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Donut, DonutLegend, FilterSelect, Panel, type Slice } from '../../components/vpaa/DashboardPrimitives';
import DashboardMetricCard, { type DashboardMetricTone } from '../../components/overview/DashboardMetricCard';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import DashboardGantt from '../vpaa/calendar/DashboardGantt';
import ScheduleDetailModal from '../vpaa/calendar/ScheduleDetailModal';
import { buildStandardHours, DEFAULT_STANDARD_HOURS, filterVpaaApprovedSchedules, findOverlaps, withCalendarDepartments, type CalendarDepartment, type CalendarSchedule, type StandardHours } from '../vpaa/calendar/ganttLayout';
import type { TimeGridConfigInput } from '../../lib/timeGrid';
import InstructorWorkloadChart from '../../components/scheduling/InstructorWorkloadChart';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import type { SectionStatusItem } from '../../hooks/useDepartmentScheduleStatus';
import api from '../../lib/api';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { basicLoadOf } from '../../lib/facultyLoad';
import TruncatedDataNotice from '../../components/ui/TruncatedDataNotice';
import { buildRoomUsage, physicalRooms, roomsInUse, type RoomUsage } from '../../lib/roomUsage';

interface Faculty { id:number; first_name:string; last_name:string; employment_type?:'full-time'|'part-time'; max_units:number; assigned_units?:number; deload_units?:number; profile_picture?:string|null; department_id:number; status?:string }
interface Room { id:number; room_code:string; room_type:string; building?:string|null; status?:string|null; department_id?:number|null }
interface Section { id:number; section_name:string; year_level?:string|number|null; department_id:number }
interface Subject { id:number; subject_code:string; subject_name:string; department_id?:number|null }
interface Schedule {
  id:number; semester_id:number; section_id:number; faculty_id?:number|null; room_id?:number|null; department_id?:number|null;
  day:string; start_time:string; end_time:string; mode?:string|null; status:string; updated_at?:string|null;
  course?:{ id?:number; course_code?:string; course_name?:string; course_category?:string|null; units?:number }|null;
  subject?:{ id?:number; subject_code?:string; subject_name?:string; subject_category?:string|null; units?:number }|null;
  faculty?:{ id?:number; first_name:string; last_name:string }|null;
  room?:{ id?:number; room_code?:string; room_type?:string; building?:string|null }|null;
  section?:{ id?:number; section_name?:string }|null;
  meeting_type?:string|null; course_id?:number|null; subject_id?:number|null;
}
interface Semester { id:number; academic_year?:string; semester?:string; is_active?:boolean }
interface Submission {
  id:number; semester_id:number|string; submitted_at?:string|null;
  sections?:Array<{ id:number; pivot?:{ state?:'included'|'withdrawn' }|null }>|null;
  submitter?:{ name?:string }|null;
}
interface Overview { faculties:Faculty[]; rooms:Room[]; sections:Section[]; subjects:Subject[]; schedules:Schedule[]; departments?:CalendarDepartment[]; submissions?:Submission[]; activeSemester:Semester|null; standardHours?:StandardHours; schedulesTruncated?:boolean }
interface InitialData { faculties?:Faculty[]; rooms?:Room[]; sections?:Section[]; subjects?:Subject[]; courses?:Subject[]; schedules?:Schedule[]; departments?:CalendarDepartment[]; schedule_submissions?:Submission[]; active_semester?:Semester; time_grid?:TimeGridConfigInput; schedules_truncated?:boolean }

type Tone = DashboardMetricTone;

interface Tile { label:string; value:number|string; detail:string; icon:LucideIcon; path:string; tone:Tone }

const QUEUE_COLUMNS = 'minmax(0,1.25fr) minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr) 80px';
const OVERVIEW_COLUMNS = 'minmax(0,1.4fr) 54px 56px 60px 56px';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'progress', label: 'Progress' },
  { key: 'attentions', label: 'Attentions' },
] as const;
type TabKey = typeof TABS[number]['key'];
const TAB_PARAM = 'tab';
const isTabKey = (value: string | null): value is TabKey => TABS.some(t => t.key === value);

const percent = (part:number, total:number) => (total > 0 ? Math.round((part / total) * 100) : 0);

// Readiness stages, in bar order: finished work first, then work still needing action.
const READINESS_STAGES = [
  { key: 'reviewed', label: 'Approved & Forwarded', color: '#4e0a10' },
  { key: 'ready', label: 'Ready for Review', color: '#C9952A' },
  { key: 'returned', label: 'Returned for Revision', color: '#B4432F' },
  { key: 'prep', label: 'Still in Preparation', color: '#A89A8D' },
  { key: 'not-started', label: 'Not Started', color: '#E6DED5' },
] as const;
type ReadinessKey = typeof READINESS_STAGES[number]['key'];
type ReadinessCounts = Record<ReadinessKey, number>;
const emptyReadiness = (): ReadinessCounts => ({ reviewed: 0, ready: 0, returned: 0, prep: 0, 'not-started': 0 });
// Legend order keeps the Dean's queue first.
const READINESS_LEGEND_ORDER: ReadinessKey[] = ['ready', 'prep', 'returned', 'reviewed', 'not-started'];

const readinessOf = (status:string, scheduled:boolean): ReadinessKey => {
  if (status === 'submitted') return 'ready';
  if (status === 'revision') return 'returned';
  if (status === 'approved_by_dean' || status === 'approved') return 'reviewed';
  return scheduled ? 'prep' : 'not-started';
};

const WORKLOAD_BANDS = [
  { key: 'completed', label: 'Completed Load', color: '#3F7D58' },
  { key: 'within', label: 'Within Teaching Capacity', color: '#4A6A8A' },
  { key: 'above', label: 'Above Teaching Capacity', color: '#C9952A' },
  { key: 'none', label: 'No Assignments', color: '#B4432F' },
] as const;
type WorkloadBand = typeof WORKLOAD_BANDS[number]['key'];

const workloadBandOf = ({ assigned, max }: { assigned:number; max:number }): WorkloadBand => {
  if (assigned <= 0) return 'none';
  if (assigned > max) return 'above';
  if (assigned === max) return 'completed';
  return 'within';
};
const workloadColorOf = (load: { assigned:number; max:number }) =>
  WORKLOAD_BANDS.find(band => band.key === workloadBandOf(load))!.color;

const plural = (count:number, word:string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const BREAKDOWN_LIMIT = 5;

// Below xl: one column of summary/breakdown pairs (side-by-side pairs left the short
// summary stretched beside a tall list). Desktop: three columns, summaries on the
// first row and each breakdown directly beneath its summary.
const PROGRESS_GRID = 'grid gap-4 xl:grid-flow-col xl:grid-cols-3 xl:grid-rows-[auto_auto]';
const SUMMARY_CARD = 'flex flex-col';
const BREAKDOWN_CARD = 'flex flex-col';
const BREAKDOWN_ROW = 'rounded-lg px-2 py-2 transition-colors hover:bg-parchment';


const programOf = (sectionName:string) => {
  const trimmed = (sectionName ?? '').trim();
  const head = trimmed.replace(/\s*\d.*$/, '').trim();
  return head || trimmed || 'Unassigned';
};

const formatSubmittedOn = (value?:string|null) => {
  if (!value) return 'Not submitted';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not submitted';
  return formatPhilippineDate(value, { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
};

const inDepartment = <T extends {department_id?:number|null}>(items:T[], departmentId?:number) =>
  items.filter(item => !departmentId || !item.department_id || Number(item.department_id) === Number(departmentId));


interface Package {
  code:string;
  total:number;
  completion:number;
  awaitingReview:number;
  returned:number;
  submittedOn:string|null;
  submittedBy:string;
}

const DASHBOARD_LIVE_TOPICS = ['schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty', 'courses', 'users', 'departments'] as const;

export default function DeanDashboardPage() {
  const navigate = useNavigate();

  const user = useMemo(() => getStoredUser(), []);
  const departmentId = user?.department_id;
  const cacheKey = `dashboard:${user?.role ?? 'dean'}:${user?.id ?? departmentId ?? 'current'}`;
  const cached = getCachedData<Overview>(cacheKey);

  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schedulesTruncated, setSchedulesTruncated] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const liveRevision = useLiveRevision(DASHBOARD_LIVE_TOPICS);
  const [faculties, setFaculties] = useState<Faculty[]>(cached?.faculties ?? []);
  const [rooms, setRooms] = useState<Room[]>(cached?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cached?.sections ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cached?.subjects ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cached?.schedules ?? []);
  const [departments, setDepartments] = useState<CalendarDepartment[]>(cached?.departments ?? []);
  const [submissions, setSubmissions] = useState<Submission[]>(cached?.submissions ?? []);
  const [semester, setSemester] = useState<Semester | null>(cached?.activeSemester ?? null);
  const [standardHours, setStandardHours] = useState<StandardHours>(cached?.standardHours ?? DEFAULT_STANDARD_HOURS);
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarSchedule | null>(null);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const [yearFilter, setYearFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(liveRevision === 0 && !hasCachedData(cacheKey));
      setLoadError(null);
      try {
        const overview = await loadCachedData<Overview>(cacheKey, async () => {
          const { data = {} } = await api.get<InitialData>('/initial-data', { params: { schedule_limit: 2000 } });
          return {
            faculties: Array.isArray(data.faculties) ? data.faculties : [],
            rooms: Array.isArray(data.rooms) ? data.rooms : [],
            sections: Array.isArray(data.sections) ? data.sections : [],
            subjects: Array.isArray(data.subjects) ? data.subjects : (Array.isArray(data.courses) ? data.courses : []),
            schedules: Array.isArray(data.schedules) ? data.schedules : [],
            departments: Array.isArray(data.departments) ? data.departments : [],
            submissions: Array.isArray(data.schedule_submissions) ? data.schedule_submissions : [],
            activeSemester: data.active_semester || null,
            standardHours: buildStandardHours(data.time_grid?.opening_time, data.time_grid?.closing_time, data.time_grid?.slot_minutes),
            schedulesTruncated: data.schedules_truncated === true,
          };
        }, reloadKey > 0);

        if (!active) return;
        setFaculties(overview.faculties);
        setRooms(overview.rooms);
        setSections(overview.sections);
        setSubjects(overview.subjects);
        setSchedules(overview.schedules);
        setDepartments(overview.departments ?? []);
        setSubmissions(overview.submissions ?? []);
        setSemester(overview.activeSemester);
        setStandardHours(overview.standardHours ?? DEFAULT_STANDARD_HOURS);
        setSchedulesTruncated(overview.schedulesTruncated === true);
      } catch {
        if (active) setLoadError('Could not load department scheduling data. Figures below may be out of date.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [cacheKey, reloadKey, liveRevision]);

  const {
    sections: statusSections,
    stageCounts,
    draftedCount,
    totalSections,
    draftingProgress,
    error: statusError,
    refetch: refetchStatus,
  } = useDepartmentScheduleStatus(departmentId);

  const retry = () => {
    setReloadKey(k => k + 1);
    refetchStatus();
  };

  const deptSections = useMemo(
    () => sections.filter(s => !departmentId || Number(s.department_id) === Number(departmentId)),
    [sections, departmentId],
  );
  const deptSubjects = useMemo(
    () => subjects.filter(s => !departmentId || Number(s.department_id) === Number(departmentId)),
    [subjects, departmentId],
  );
  const deptFaculties = useMemo(
    () => faculties.filter(f =>
      (!departmentId || Number(f.department_id) === Number(departmentId)) &&
      (f.status ?? 'active').toLowerCase() === 'active'),
    [faculties, departmentId],
  );
  const deptRooms = useMemo(() => inDepartment(rooms, departmentId), [rooms, departmentId]);

  const sectionIds = useMemo(() => new Set(deptSections.map(s => s.id)), [deptSections]);
  const semesterId = semester?.id;
  const visibleSchedules = useMemo(
    () => schedules.filter(s =>
      (!semesterId || Number(s.semester_id) === Number(semesterId)) &&
      (sectionIds.has(s.section_id) || Number(s.department_id) === Number(departmentId))),
    [schedules, semesterId, sectionIds, departmentId],
  );

  const sectionTotal = totalSections || deptSections.length;

  const scheduledSectionIds = useMemo(() => new Set(visibleSchedules.map(s => Number(s.section_id))), [visibleSchedules]);

  // One pass classifies every section, giving the department totals and the per-program mix.
  const readiness = useMemo(() => {
    const totals = emptyReadiness();
    const byProgram = new Map<string, ReadinessCounts>();

    statusSections.forEach(section => {
      const stage = readinessOf(section.status, scheduledSectionIds.has(Number(section.id)));
      totals[stage] += 1;
      const program = programOf(section.code);
      const counts = byProgram.get(program) ?? emptyReadiness();
      counts[stage] += 1;
      byProgram.set(program, counts);
    });

    return { totals, byProgram };
  }, [statusSections, scheduledSectionIds]);

  const readinessSlices: Slice[] = READINESS_LEGEND_ORDER.map(key => {
    const stage = READINESS_STAGES.find(item => item.key === key)!;
    return { ...stage, value: readiness.totals[key] };
  });

  const latestSubmissionByProgram = useMemo(() => {
    const programBySection = new Map<number, string>();
    statusSections.forEach(section => programBySection.set(Number(section.id), programOf(section.code)));

    const latest = new Map<string, Submission>();
    submissions
      .filter(submission => !semesterId || Number(submission.semester_id) === Number(semesterId))
      .forEach(submission => (submission.sections ?? []).forEach(section => {
        if (section.pivot?.state === 'withdrawn') return;
        const program = programBySection.get(Number(section.id));
        if (!program) return;
        if (!latest.has(program) || submission.id > latest.get(program)!.id) latest.set(program, submission);
      }));
    return latest;
  }, [statusSections, submissions, semesterId]);

  const packages = useMemo<Package[]>(() => {
    const groups = new Map<string, SectionStatusItem[]>();
    statusSections.forEach(section => {
      const code = programOf(section.code);
      groups.set(code, [...(groups.get(code) ?? []), section]);
    });

    return Array.from(groups.entries())
      .map(([code, group]) => {
        const drafted = group.filter(s => s.status !== 'draft' && s.status !== 'revision').length;
        const awaitingReview = group.filter(s => s.status === 'submitted').length;
        const submission = latestSubmissionByProgram.get(code);
        return {
          code,
          total: group.length,
          completion: percent(drafted, group.length),
          awaitingReview,
          returned: group.filter(s => s.status === 'revision').length,
          submittedOn: submission?.submitted_at ?? null,
          submittedBy: submission?.submitter?.name?.trim() || '—',
        };
      })
      .sort((a, b) => b.awaitingReview - a.awaitingReview || b.completion - a.completion || a.code.localeCompare(b.code));
  }, [statusSections, latestSubmissionByProgram]);

  const packageTotals = useMemo(() => packages.reduce((totals, item) => ({
    submitted: totals.submitted + (item.awaitingReview > 0 ? 1 : 0),
    awaitingReview: totals.awaitingReview + item.awaitingReview,
    returned: totals.returned + item.returned,
    total: totals.total + item.total,
  }), { submitted: 0, awaitingReview: 0, returned: 0, total: 0 }), [packages]);

  const queuedPackages = useMemo(() => packages.filter(item => item.awaitingReview > 0), [packages]);

  const loads = useMemo(() => deptFaculties.map(f => {
    const assigned = f.assigned_units || 0;
    const max = basicLoadOf(f.max_units, f.deload_units);
    return { ...f, assigned, max };
  }), [deptFaculties]);

  const workloadBands = useMemo(() => {
    const counts: Record<WorkloadBand, number> = { completed: 0, within: 0, above: 0, none: 0 };
    loads.forEach(load => { counts[workloadBandOf(load)] += 1; });
    return counts;
  }, [loads]);

  const workloadSlices: Slice[] = WORKLOAD_BANDS.map(band => ({ ...band, value: workloadBands[band.key] }));

  const workload = useMemo(() => [...loads].sort((a, b) => b.assigned - a.assigned).slice(0, BREAKDOWN_LIMIT), [loads]);

  const assignableRooms = useMemo(() => physicalRooms(deptRooms), [deptRooms]);
  const classesByRoom = useMemo(() => {
    const counts = new Map<number, number>();
    visibleSchedules.forEach(s => {
      if (s.room_id) counts.set(s.room_id, (counts.get(s.room_id) ?? 0) + 1);
    });
    return counts;
  }, [visibleSchedules]);
  const roomUsage = useMemo(() => buildRoomUsage(deptRooms, classesByRoom), [deptRooms, classesByRoom]);
  const roomsUsed = roomsInUse(roomUsage);
  const roomsFree = Math.max(0, assignableRooms.length - roomsUsed);
  const utilization = percent(roomsUsed, assignableRooms.length);

  const roomSlices: Slice[] = [
    { key: 'in-use', label: 'Rooms in Use', value: roomsUsed, color: '#4e0a10' },
    { key: 'free', label: 'Available Rooms', value: roomsFree, color: '#E6DED5' },
  ];

  const yearBySection = useMemo(() => {
    const map = new Map<number, string>();
    deptSections.forEach(s => { if (s.year_level != null) map.set(Number(s.id), String(s.year_level)); });
    return map;
  }, [deptSections]);

  const yearOptions = useMemo(
    () => Array.from(new Set(deptSections.map(s => (s.year_level == null ? '' : String(s.year_level))).filter(Boolean))).sort(),
    [deptSections],
  );
  const sectionOptions = useMemo(
    () => [...deptSections].sort((a, b) => a.section_name.localeCompare(b.section_name)),
    [deptSections],
  );
  const facultyOptions = useMemo(
    () => [...deptFaculties].sort((a, b) => `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`)),
    [deptFaculties],
  );
  const roomOptions = useMemo(
    () => [...assignableRooms].sort((a, b) => a.room_code.localeCompare(b.room_code)),
    [assignableRooms],
  );

  const timetableSchedules = useMemo(() => {
    return visibleSchedules.filter(schedule => {
      if (yearFilter !== 'all' && yearBySection.get(Number(schedule.section_id)) !== yearFilter) return false;
      if (sectionFilter !== 'all' && String(schedule.section_id) !== sectionFilter) return false;
      if (facultyFilter !== 'all' && String(schedule.faculty_id ?? '') !== facultyFilter) return false;
      if (roomFilter !== 'all' && String(schedule.room_id ?? '') !== roomFilter) return false;
      return true;
    });
  }, [visibleSchedules, yearFilter, sectionFilter, facultyFilter, roomFilter, yearBySection]);

  const calendarSchedules = useMemo<CalendarSchedule[]>(() => withCalendarDepartments(filterVpaaApprovedSchedules(visibleSchedules).map(item => ({
    ...item,
    course_id: item.course_id ?? item.course?.id ?? item.subject_id,
    room: item.room?.id ? { id: item.room.id, room_code: item.room.room_code ?? '', building: item.room.building } : null,
    section: item.section?.id ? { id: item.section.id, section_name: item.section.section_name ?? '' } : null,
    faculty: item.faculty?.id ? { id: item.faculty.id, first_name: item.faculty.first_name, last_name: item.faculty.last_name } : null,
    mode: item.mode?.toLowerCase().includes('online') || item.room?.room_type?.toLowerCase().includes('online') ? 'online'
      : item.mode?.toLowerCase().includes('field') || item.room?.room_type?.toLowerCase().includes('field') ? 'field' : 'on-site',
  })), departments), [visibleSchedules, departments]);
  const calendarById = useMemo(() => new Map(calendarSchedules.map(item => [item.id, item])), [calendarSchedules]);
  const timetableCalendar = useMemo(
    () => timetableSchedules.map(item => calendarById.get(item.id)).filter((item): item is CalendarSchedule => Boolean(item)),
    [timetableSchedules, calendarById],
  );
  const timelineOverlaps = useMemo(() => findOverlaps(calendarSchedules), [calendarSchedules]);

  const filtersActive = yearFilter !== 'all' || sectionFilter !== 'all' || facultyFilter !== 'all' || roomFilter !== 'all';
  const resetFilters = () => {
    setYearFilter('all');
    setSectionFilter('all');
    setFacultyFilter('all');
    setRoomFilter('all');
  };

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

  const pendingApprovals = stageCounts.submitted;
  const openApproval = () => navigate('/dean/schedules/approval');

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

  // One per schedule package awaiting review, matching the Schedule Review Queue list.
  const attentionCount = queuedPackages.length;

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
      value: pendingApprovals,
      detail: pendingApprovals ? 'Awaiting your action' : 'Nothing awaiting review',
      icon: CalendarCheck2,
      path: '/dean/schedules/approval',
      tone: pendingApprovals > 0 ? 'alert' : 'good',
    },
  ];

  const inventory: Tile[] = [
    { label: 'Sections', value: sectionTotal, detail: 'Department scope', icon: LayoutGrid, path: '/dean/sections', tone: 'brand' },
    { label: 'Instructors', value: deptFaculties.length, detail: 'Active instructors', icon: Users, path: '/dean/instructors', tone: 'brand' },
    { label: 'Courses', value: deptSubjects.length, detail: 'Offered courses', icon: BookOpen, path: '/dean/courses', tone: 'brand' },
    { label: 'Rooms', value: assignableRooms.length, detail: 'Total rooms', icon: Building2, path: '/dean/facilities', tone: 'brand' },
  ];

  const timetablePanel = (
    <div className={isFullscreen ? 'fixed inset-0 z-[999999] flex flex-col overflow-auto bg-parchment p-4 font-jakarta text-text sm:p-6' : 'flex min-h-0 min-w-0 flex-1 flex-col'}>
      <Panel
        title="Department Academic Timetable"
        subtitle="Overview of department timetable."
        action="View full timetable"
        onAction={() => navigate('/dean/schedules')}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect label="Year Level" value={yearFilter} onChange={setYearFilter}>
            <option value="all">All</option>
            {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
          </FilterSelect>
          <FilterSelect label="Section" value={sectionFilter} onChange={setSectionFilter}>
            <option value="all">All</option>
            {sectionOptions.map(section => <option key={section.id} value={String(section.id)}>{section.section_name}</option>)}
          </FilterSelect>
          <FilterSelect label="Faculty" value={facultyFilter} onChange={setFacultyFilter}>
            <option value="all">All</option>
            {facultyOptions.map(faculty => <option key={faculty.id} value={String(faculty.id)}>{faculty.last_name}, {faculty.first_name}</option>)}
          </FilterSelect>
          <FilterSelect label="Room" value={roomFilter} onChange={setRoomFilter}>
            <option value="all">All</option>
            {roomOptions.map(room => <option key={room.id} value={String(room.id)}>{room.room_code}</option>)}
          </FilterSelect>

          <button
            type="button"
            onClick={() => setIsFullscreen(open => !open)}
            title={isFullscreen ? 'Exit full window (Esc)' : 'Full window view'}
            aria-label={isFullscreen ? 'Exit full window' : 'Full window view'}
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
        </div>

        <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col">
          <DashboardGantt
            schedules={timetableCalendar}
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
        label="Scheduling Completion"
        value={`${draftingProgress}%`}
        detail={`${draftedCount} / ${sectionTotal} sections completed`}
        progress={draftingProgress}
        tone={draftingProgress === 100 ? 'good' : 'brand'}
        onClick={() => navigate('/dean/schedules')}
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

  if (dashboardLoading) return <DashboardSkeleton metrics={metrics} variant="dean" tab={tab} />;

  return <div id="dashboard-overview" className="space-y-4 pb-8 font-jakarta text-text">
    {(loadError || statusError) && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-accent/[0.12] px-4 py-3 text-[13px] font-medium text-stage-warnText">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{loadError || statusError}</span>
      <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-white px-2.5 py-1.5 font-bold text-stage-warnText transition hover:bg-accent/[0.12]"><RotateCcw className="h-3 w-3" /> Retry</button>
    </div>}

    {!loadError && schedulesTruncated && <TruncatedDataNotice>
      The department has more class meetings than can be loaded at once, so the figures and timetable below may be missing classes.
    </TruncatedDataNotice>}

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

    {visitedTabs.has('progress') && <div role="tabpanel" id="dashboard-panel-progress" aria-labelledby="dashboard-tab-progress" hidden={tab !== 'progress'}><div className="space-y-4">
    {/* Paired DOM order (summary, then its breakdown) keeps each pair together on
        phones and tablets; on desktop column flow puts the summaries in one row. */}
    <section className={PROGRESS_GRID}>
      <Panel
        title="Section Submission Overview"
        subtitle="All department sections by submission stage."
        className={SUMMARY_CARD}
      >
        <SummaryChart>
          <Donut size="sm" slices={readinessSlices} headline={sectionTotal} caption="Total Sections" />
          <DonutLegend slices={readinessSlices} total={sectionTotal} decimals={0} />
        </SummaryChart>
      </Panel>

      <Panel
        title="Section Readiness"
        subtitle="Submission stage mix for each program."
        action="Review schedules"
        onAction={openApproval}
        className={BREAKDOWN_CARD}
      >
        {packages.length ? <ul className="-mx-2 min-w-0 space-y-0.5">
          {packages.map(item => <ReadinessRow key={item.code} code={item.code} total={item.total} completion={item.completion} counts={readiness.byProgram.get(item.code) ?? emptyReadiness()} />)}
        </ul> : <EmptyBreakdown>No sections to track yet this semester.</EmptyBreakdown>}
        <BreakdownFooter>
          <span>{draftedCount} of {plural(sectionTotal, 'section')} completed</span>
        </BreakdownFooter>
      </Panel>

      <Panel
        title="Instructor Workload Overview"
        subtitle="Active instructors by teaching load."
        className={SUMMARY_CARD}
      >
        <SummaryChart>
          <Donut size="sm" slices={workloadSlices} headline={deptFaculties.length} caption="Total Instructors" />
          <DonutLegend slices={workloadSlices} total={deptFaculties.length} decimals={0} />
        </SummaryChart>
      </Panel>

      <Panel
        title="Instructor Workload Breakdown"
        subtitle="Highest assigned loads against each maximum."
        action="View instructors"
        onAction={() => navigate('/dean/instructors')}
        className={BREAKDOWN_CARD}
      >
        <InstructorWorkloadChart instructors={workload} dense colorOf={workloadColorOf} />
        <BreakdownFooter>
          <span>Assigned / max units</span>
          {loads.length > workload.length && <span>+{loads.length - workload.length} more</span>}
        </BreakdownFooter>
      </Panel>

      <Panel
        title="Room Utilization Overview"
        subtitle="Department rooms holding classes this semester."
        className={SUMMARY_CARD}
      >
        <SummaryChart>
          <Donut size="sm" slices={roomSlices} headline={`${utilization}%`} caption="Utilization" />
          <DonutLegend slices={roomSlices} total={assignableRooms.length} decimals={0} />
        </SummaryChart>
      </Panel>

      <Panel
        title="Room Utilization Breakdown"
        subtitle="Class load relative to the busiest room."
        action="View facilities"
        onAction={() => navigate('/dean/facilities')}
        className={BREAKDOWN_CARD}
      >
        {roomUsage.length ? <ul className="-mx-2 min-w-0 space-y-0.5">
          {roomUsage.slice(0, BREAKDOWN_LIMIT).map(room => <RoomRow key={room.id} room={room} />)}
        </ul> : <EmptyBreakdown>No rooms available to this department.</EmptyBreakdown>}
        <BreakdownFooter>
          <span>{roomsUsed} of {assignableRooms.length} in use</span>
          {roomUsage.length > BREAKDOWN_LIMIT && <span>+{roomUsage.length - BREAKDOWN_LIMIT} more</span>}
        </BreakdownFooter>
      </Panel>
    </section>
    </div></div>}

    {visitedTabs.has('attentions') && <div role="tabpanel" id="dashboard-panel-attentions" aria-labelledby="dashboard-tab-attentions" hidden={tab !== 'attentions'}><div className="space-y-4">
    <section className="grid gap-4 xl:grid-cols-12">
      <Panel
        title="Schedule Review Queue"
        subtitle="Department schedule packages submitted for your review and approval."
        badge={pendingApprovals}
        action="View all queue"
        onAction={openApproval}
        className="xl:col-span-7"
      >
        {queuedPackages.length ? <>
          <div className="min-w-0">
            <div className="grid gap-2 px-3 pb-2 text-[11px] font-bold leading-tight text-muted" style={{ gridTemplateColumns: QUEUE_COLUMNS }}>
              <span>Schedule Package</span>
              <span>Submitted By</span>
              <span>Submitted On</span>
              <span>Completion</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="space-y-2">
              {queuedPackages.map(item => <li key={item.code} className="grid items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5" style={{ gridTemplateColumns: QUEUE_COLUMNS }}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <b className="truncate text-[11px] text-text" title={`${item.code} Schedule`}>{item.code} Schedule</b>
                </span>
                <span className="truncate text-[11px] font-semibold text-muted" title={item.submittedBy}>{item.submittedBy}</span>
                <span className="truncate text-[11px] font-semibold text-muted" title={formatSubmittedOn(item.submittedOn)}>{formatSubmittedOn(item.submittedOn)}</span>
                <span className="h-6 min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{ readiness: item.completion, label: `${item.completion}%` }]} layout="vertical" margin={{ top: 4, right: 42, left: 0, bottom: 4 }}>
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis type="category" hide />
                      <Bar dataKey="readiness" fill={item.completion === 100 ? '#3F7D58' : '#C9952A'} radius={[4, 4, 4, 4]} barSize={6} background={{ fill: '#E6DED5', radius: 4 }}>
                        <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 11, fontWeight: 600, fill: '#7A6E67' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </span>
                <span className="flex items-center justify-end gap-1">
                  <QueueAction icon={Check} label={`Approve ${item.code} Schedule`} tone="good" disabled={!item.awaitingReview} onClick={openApproval} />
                  <QueueAction icon={RotateCcw} label={`Return ${item.code} Schedule for revision`} tone="warn" disabled={!item.awaitingReview} onClick={openApproval} />
                  <QueueAction icon={X} label={`Reject ${item.code} Schedule`} tone="alert" disabled={!item.awaitingReview} onClick={openApproval} />
                </span>
              </li>)}
            </ul>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[11px] font-semibold text-muted">
            <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-stage-done" /> Approve</span>
            <span className="flex items-center gap-1.5"><RotateCcw className="h-3 w-3 text-stage-warnText" /> Return for Revision</span>
            <span className="flex items-center gap-1.5"><X className="h-3 w-3 text-stage-returned" /> Reject</span>
          </div>
        </> : <p className="py-6 text-center text-[11px] text-muted">No schedule packages are waiting for your review.</p>}
      </Panel>

      <Panel
        title="Schedule Review Overview"
        subtitle="Overview of submitted schedule packages."
        className="xl:col-span-5"
      >
        {packages.length ? <div>
          <div className="min-w-0">
            <div className="grid gap-2 px-3 pb-2 text-[11px] font-bold leading-tight text-muted" style={{ gridTemplateColumns: OVERVIEW_COLUMNS }}>
              <span>Schedule Package</span>
              <span className="text-right">Submitted</span>
              <span className="text-right">Ready for Review</span>
              <span className="text-right">Returned for Revision</span>
              <span className="text-right">Sections Included</span>
            </div>
            <ul className="space-y-2">
              {packages.map(item => <li key={item.code} className="grid items-center gap-2 rounded-xl border border-border/70 px-3 py-2.5 text-[11px] tabular-nums" style={{ gridTemplateColumns: OVERVIEW_COLUMNS }}>
                <b className="truncate text-text" title={`${item.code} Schedule`}>{item.code} Schedule</b>
                <span className="text-right font-semibold text-muted">{item.awaitingReview > 0 ? 1 : 0}</span>
                <span className={`text-right font-bold ${item.awaitingReview ? 'text-stage-done' : 'text-muted/50'}`}>{item.awaitingReview}</span>
                <span className={`text-right font-bold ${item.returned ? 'text-stage-returned' : 'text-muted/50'}`}>{item.returned}</span>
                <span className="text-right font-semibold text-muted">{item.total}</span>
              </li>)}
            </ul>
            <div className="mt-2 grid gap-2 rounded-xl bg-parchment px-3 py-2.5 text-xs font-semibold tabular-nums text-primary" style={{ gridTemplateColumns: OVERVIEW_COLUMNS }}>
              <span className="uppercase tracking-wide">Total</span>
              <span className="text-right">{packageTotals.submitted}</span>
              <span className="text-right">{packageTotals.awaitingReview}</span>
              <span className="text-right">{packageTotals.returned}</span>
              <span className="text-right">{packageTotals.total}</span>
            </div>
          </div>
        </div> : <p className="py-6 text-center text-[11px] text-muted">Nothing has been submitted for review yet.</p>}
      </Panel>
    </section>
    </div></div>}
  </div>;
}

function QueueAction({ icon: Icon, label, tone, disabled, onClick }: { icon: LucideIcon; label: string; tone: 'good' | 'warn' | 'alert'; disabled?: boolean; onClick: () => void }) {
  const tones: Record<'good' | 'warn' | 'alert', string> = {
    good: 'text-stage-done hover:border-stage-done/25 hover:bg-stage-done/10',
    warn: 'text-stage-warnText hover:border-accent/30 hover:bg-accent/[0.12]',
    alert: 'text-stage-returned hover:border-stage-returned/25 hover:bg-stage-returned/10',
  };

  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={disabled ? 'Nothing awaiting review in this package' : label}
    aria-label={label}
    className={`flex h-7 w-7 items-center justify-center rounded-md border border-border bg-white transition-colors disabled:cursor-not-allowed disabled:text-muted/50 disabled:hover:border-border disabled:hover:bg-white ${tones[tone]}`}
  >
    <Icon className="h-3.5 w-3.5" />
  </button>;
}

// Sized by the card, not the viewport: narrow cards stack the donut over its legend,
// wider ones set them side by side, and full-width strips split the legend in two.
const SUMMARY_LAYOUT = [
  'grid w-full items-center justify-items-center gap-4 [&>ul]:w-full',
  '[@container(min-width:20rem)]:grid-cols-[112px_minmax(0,1fr)] [@container(min-width:20rem)]:gap-6',
  '[@container(min-width:38rem)]:[&>ul]:grid [@container(min-width:38rem)]:[&>ul]:grid-cols-2 [@container(min-width:38rem)]:[&>ul]:gap-x-10 [@container(min-width:38rem)]:[&>ul]:gap-y-2.5 [@container(min-width:38rem)]:[&>ul>li]:!mt-0',
].join(' ');

/** Donut beside its legend when the card is wide enough, stacked when it is not. */
function SummaryChart({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center [container-type:inline-size]">
    <div className={SUMMARY_LAYOUT}>{children}</div>
  </div>;
}

function BreakdownFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-auto pt-3">
    <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11px] tabular-nums text-muted">{children}</div>
  </div>;
}

function EmptyBreakdown({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs text-muted">{children}</p>;
}

/** One program: its completion and a stacked bar of section stages. */
function ReadinessRow({ code, total, completion, counts }: { code:string; total:number; completion:number; counts:ReadinessCounts }) {
  const present = READINESS_STAGES.filter(stage => counts[stage.key] > 0);
  const description = present.map(stage => `${counts[stage.key]} ${stage.label}`).join(', ');

  return <li className={BREAKDOWN_ROW}>
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate">
        <span className="text-[13px] font-medium text-text">{code}</span>
        <span className="ml-2 text-[11px] text-muted">{plural(total, 'section')}</span>
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted"><span className="font-semibold text-text">{completion}%</span> complete</span>
    </div>
    <div role="img" aria-label={`${code}: ${description || 'no sections'}`} className="mt-1.5 flex h-1 gap-px overflow-hidden rounded-full bg-stage-idle">
      {present.filter(stage => stage.key !== 'not-started').map(stage => <span
        key={stage.key}
        title={`${stage.label}: ${counts[stage.key]}`}
        className="h-full transition-[width] duration-500 ease-out"
        style={{ width: `${(counts[stage.key] / total) * 100}%`, backgroundColor: stage.color }}
      />)}
    </div>
  </li>;
}

/** One room: class count, type, availability and its load against the busiest room. */
function RoomRow({ room }: { room: RoomUsage }) {
  const classes = `${room.classes} ${room.classes === 1 ? 'class' : 'classes'}`;

  return <li className={BREAKDOWN_ROW}>
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-[13px] font-medium text-text">{room.code}</span>
        <span className="min-w-0 truncate text-[11px] text-muted" title={`${room.typeLabel} · ${room.location}`}>{room.typeLabel} · {classes}</span>
        {room.isUnavailable && <span className="shrink-0 rounded bg-stage-returned/10 px-1.5 py-px text-[10px] font-semibold text-stage-returned">Unavailable</span>}
      </span>
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-text">{room.share}%</span>
    </div>
    <div
      role="progressbar"
      aria-label={`${room.code} class load`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={room.share}
      aria-valuetext={`${classes}, ${room.share}% of the busiest room`}
      className="mt-1.5 h-1 overflow-hidden rounded-full bg-stage-idle"
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${room.isUnavailable ? 'bg-muted/50' : 'bg-primary'}`} style={{ width: `${room.share}%` }} />
    </div>
  </li>;
}
