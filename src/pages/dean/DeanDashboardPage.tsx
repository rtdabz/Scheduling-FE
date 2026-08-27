import { formatPhilippineDate } from '../../lib/philippineTime';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
  CalendarCheck2,
  Check,
  ChevronRight,
  ClipboardCheck,
  DoorOpen,
  FileText,
  GraduationCap,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import DashboardTimetableGrid from '../../components/scheduling/DashboardTimetableGrid';
import InstructorWorkloadChart from '../../components/scheduling/InstructorWorkloadChart';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import type { SectionStatusItem } from '../../hooks/useDepartmentScheduleStatus';
import api from '../../lib/api';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { buildRoomUsage, physicalRooms, roomsInUse } from '../../lib/roomUsage';

interface Faculty { id:number; first_name:string; last_name:string; employment_type?:'full-time'|'part-time'; max_units:number; assigned_units?:number; deload_units?:number; probono_units?:number|null; profile_picture?:string|null; department_id:number; status?:string }
interface Room { id:number; room_code:string; room_type:string; building?:string|null; status?:string|null; department_id?:number|null }
interface Section { id:number; section_name:string; year_level?:string|number|null; department_id:number }
interface Subject { id:number; subject_code:string; subject_name:string; department_id?:number|null }
interface Schedule {
  id:number; term_id:number; section_id:number; faculty_id?:number|null; room_id?:number|null; department_id?:number|null;
  day:string; start_time:string; end_time:string; mode?:string|null; status:string; updated_at?:string|null;
  course?:{ id?:number; course_code?:string; course_name?:string; course_category?:string|null; units?:number }|null;
  subject?:{ id?:number; subject_code?:string; subject_name?:string; subject_category?:string|null; units?:number }|null;
  faculty?:{ id?:number; first_name:string; last_name:string }|null;
  room?:{ id?:number; room_code?:string; room_type?:string; building?:string|null }|null;
  section?:{ id?:number; section_name?:string }|null;
}
interface Term { id:number; academic_year?:string; semester?:string; is_active?:boolean }
interface DeptUser { id:number; name?:string; role?:string; department_id?:number|null }
interface Overview { faculties:Faculty[]; rooms:Room[]; sections:Section[]; subjects:Subject[]; schedules:Schedule[]; users:DeptUser[]; activeTerm:Term|null }
interface InitialData { faculties?:Faculty[]; rooms?:Room[]; sections?:Section[]; subjects?:Subject[]; courses?:Subject[]; schedules?:Schedule[]; users?:DeptUser[]; active_term?:Term }

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

const QUEUE_COLUMNS = 'minmax(0,1.25fr) minmax(0,1fr) minmax(0,1.15fr) minmax(0,1fr) 80px';
const OVERVIEW_COLUMNS = 'minmax(0,1.4fr) 58px 62px 66px 62px';

const percent = (part:number, total:number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** One decimal — the precision the donut legends quote each share to. */
const share1 = (part:number, total:number) => (total > 0 ? ((part / total) * 100).toFixed(1) : '0.0');

/**
 * Program a section belongs to, read off its name.
 *
 * Sections are named "<program> <year><letter>" ("BSIT 1A", "BSBA 2C") and the
 * sections table carries no program_id, so the leading run of non-digits is the
 * only place the program is recorded. Everything before the first digit is the
 * package name; a name with no digit at all is its own package.
 */
const programOf = (sectionName:string) => {
  const trimmed = (sectionName ?? '').trim();
  const head = trimmed.replace(/\s*\d.*$/, '').trim();
  return head || trimmed || 'Unassigned';
};

/** "Aug 12, 2026, 10:24 AM" — the queue's Submitted On column. */
const formatSubmittedOn = (value?:string|null) => {
  if (!value) return 'Not submitted';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not submitted';
  return formatPhilippineDate(value, { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' });
};

/** Keep rows that belong to the Dean's department (rows with no department are shared/global). */
const inDepartment = <T extends {department_id?:number|null}>(items:T[], departmentId?:number) =>
  items.filter(item => !departmentId || !item.department_id || Number(item.department_id) === Number(departmentId));

interface Slice { key:string; label:string; value:number; color:string }

/** A schedule package: every section of one program, and where each one sits. */
interface Package {
  code:string;
  total:number;
  completion:number;
  awaitingReview:number;
  returned:number;
  submittedOn:string|null;
}

export default function DeanDashboardPage() {
  const navigate = useNavigate();

  const user = useMemo(() => getStoredUser(), []);
  const departmentId = user?.department_id;
  const cacheKey = `dashboard:${user?.role ?? 'dean'}:${user?.id ?? departmentId ?? 'current'}`;
  const cached = getCachedData<Overview>(cacheKey);

  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [faculties, setFaculties] = useState<Faculty[]>(cached?.faculties ?? []);
  const [rooms, setRooms] = useState<Room[]>(cached?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cached?.sections ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cached?.subjects ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cached?.schedules ?? []);
  const [users, setUsers] = useState<DeptUser[]>(cached?.users ?? []);
  const [term, setTerm] = useState<Term | null>(cached?.activeTerm ?? null);

  // ── Timetable controls ──
  const [yearFilter, setYearFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [roomFilter, setRoomFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(!hasCachedData(cacheKey));
      setLoadError(null);
      try {
        const overview = await loadCachedData<Overview>(cacheKey, async () => {
          const { data = {} } = await api.get<InitialData>('/initial-data');
          return {
            faculties: Array.isArray(data.faculties) ? data.faculties : [],
            rooms: Array.isArray(data.rooms) ? data.rooms : [],
            sections: Array.isArray(data.sections) ? data.sections : [],
            subjects: Array.isArray(data.subjects) ? data.subjects : (Array.isArray(data.courses) ? data.courses : []),
            schedules: Array.isArray(data.schedules) ? data.schedules : [],
            users: Array.isArray(data.users) ? data.users : [],
            activeTerm: data.active_term || null,
          };
        }, reloadKey > 0);

        if (!active) return;
        setFaculties(overview.faculties);
        setRooms(overview.rooms);
        setSections(overview.sections);
        setSubjects(overview.subjects);
        setSchedules(overview.schedules);
        setUsers(overview.users);
        setTerm(overview.activeTerm);
      } catch {
        if (active) setLoadError('Could not load department scheduling data. Figures below may be out of date.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [cacheKey, reloadKey]);

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

  // ── Department-scoped views of the raw payload ──
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
  const termId = term?.id;
  const visibleSchedules = useMemo(
    () => schedules.filter(s =>
      (!termId || Number(s.term_id) === Number(termId)) &&
      (sectionIds.has(s.section_id) || Number(s.department_id) === Number(departmentId))),
    [schedules, termId, sectionIds, departmentId],
  );

  /**
   * Sections total. The schedule-status endpoint is the authority — it counts the
   * active sections of the active term, the same set every readiness and
   * completion figure below is measured against. The payload is the fallback that
   * keeps the tile populated while that request is still in flight.
   */
  const sectionTotal = totalSections || deptSections.length;

  // ── Section submission readiness ──
  const scheduledSectionIds = useMemo(() => new Set(visibleSchedules.map(s => Number(s.section_id))), [visibleSchedules]);

  const readiness = useMemo(() => {
    let awaitingReview = 0;
    let inPreparation = 0;
    let returned = 0;
    let reviewed = 0;
    let notStarted = 0;

    statusSections.forEach(section => {
      if (section.status === 'submitted') awaitingReview += 1;
      else if (section.status === 'revision') returned += 1;
      else if (section.status === 'approved_by_dean' || section.status === 'approved') reviewed += 1;
      // The backend reports a section with no schedule rows as 'draft', which is a
      // different problem from one that is actively being drafted.
      else if (!scheduledSectionIds.has(Number(section.id))) notStarted += 1;
      else inPreparation += 1;
    });

    return { awaitingReview, inPreparation, returned, reviewed, notStarted };
  }, [statusSections, scheduledSectionIds]);

  const readinessSlices: Slice[] = [
    { key: 'ready', label: 'Ready for Review', value: readiness.awaitingReview, color: '#16a36a' },
    { key: 'prep', label: 'Still in Preparation', value: readiness.inPreparation, color: '#3b82f6' },
    { key: 'returned', label: 'Returned for Revision', value: readiness.returned, color: '#f59e0b' },
    { key: 'reviewed', label: 'Approved & Forwarded', value: readiness.reviewed, color: '#4e0a10' },
    { key: 'not-started', label: 'Not Started', value: readiness.notStarted, color: '#cbd5e1' },
  ];

  // ── Schedule packages, one per program in the department ──
  const latestSubmissionByProgram = useMemo(() => {
    const programBySection = new Map<number, string>();
    statusSections.forEach(section => programBySection.set(Number(section.id), programOf(section.code)));

    const latest = new Map<string, string>();
    visibleSchedules.forEach(schedule => {
      const program = programBySection.get(Number(schedule.section_id));
      const stamp = schedule.updated_at;
      if (!program || !stamp) return;
      // ISO-8601 stamps sort chronologically as text, so no Date churn per row.
      if (!latest.has(program) || stamp > latest.get(program)!) latest.set(program, stamp);
    });
    return latest;
  }, [statusSections, visibleSchedules]);

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
        return {
          code,
          total: group.length,
          completion: percent(drafted, group.length),
          awaitingReview,
          returned: group.filter(s => s.status === 'revision').length,
          submittedOn: awaitingReview > 0 ? latestSubmissionByProgram.get(code) ?? null : null,
        };
      })
      // Packages waiting on the Dean first; a settled package can wait at the bottom.
      .sort((a, b) => b.awaitingReview - a.awaitingReview || b.completion - a.completion || a.code.localeCompare(b.code));
  }, [statusSections, latestSubmissionByProgram]);

  const packageTotals = useMemo(() => packages.reduce((totals, item) => ({
    submitted: totals.submitted + (item.awaitingReview > 0 ? 1 : 0),
    awaitingReview: totals.awaitingReview + item.awaitingReview,
    returned: totals.returned + item.returned,
    total: totals.total + item.total,
  }), { submitted: 0, awaitingReview: 0, returned: 0, total: 0 }), [packages]);

  /**
   * Who prepares this department's schedules. Submission is a department-wide
   * action with no per-package author column, so the queue names the department's
   * schedule coordinator rather than inventing a per-row submitter.
   */
  const coordinator = useMemo(() => {
    const deptUsers = users.filter(u => !departmentId || Number(u.department_id) === Number(departmentId));
    const match = deptUsers.find(u => (u.role ?? '').toLowerCase() === 'secretary')
      ?? deptUsers.find(u => (u.role ?? '').toLowerCase() === 'program_head');
    return match?.name?.trim() || 'Schedule Coordinator';
  }, [users, departmentId]);

  // ── Faculty workload ──
  const loads = useMemo(() => deptFaculties.map(f => {
    const assigned = f.assigned_units || 0;
    const max = Math.max(0, f.max_units - (f.deload_units || 0));
    return { ...f, assigned, max };
  }), [deptFaculties]);

  const workloadBands = useMemo(() => {
    let completed = 0;
    let within = 0;
    let above = 0;
    let none = 0;

    loads.forEach(({ assigned, max }) => {
      if (assigned <= 0) none += 1;
      else if (assigned > max) above += 1;
      else if (assigned === max) completed += 1;
      else within += 1;
    });

    return { completed, within, above, none };
  }, [loads]);

  const workloadSlices: Slice[] = [
    { key: 'completed', label: 'Completed Load', value: workloadBands.completed, color: '#16a36a' },
    { key: 'within', label: 'Within Teaching Capacity', value: workloadBands.within, color: '#3b82f6' },
    { key: 'above', label: 'Above Teaching Capacity', value: workloadBands.above, color: '#f59e0b' },
    { key: 'none', label: 'No Assignments', value: workloadBands.none, color: '#f43f5e' },
  ];

  /** Busiest five instructors, the rows of the workload chart. */
  const workload = useMemo(() => [...loads].sort((a, b) => b.assigned - a.assigned).slice(0, 5), [loads]);

  // ── Room inventory ──
  // Physical rooms only: ONLINE and FIELD are placeholder rows standing in for a
  // delivery mode, so counting them would understate utilization.
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
    { key: 'in-use', label: 'Rooms in Use', value: roomsUsed, color: '#16a36a' },
    { key: 'free', label: 'Available Rooms', value: roomsFree, color: '#cbd5e1' },
  ];

  // ── Timetable filters ──
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
    const query = searchQuery.trim().toLowerCase();
    return visibleSchedules.filter(schedule => {
      if (yearFilter !== 'all' && yearBySection.get(Number(schedule.section_id)) !== yearFilter) return false;
      if (sectionFilter !== 'all' && String(schedule.section_id) !== sectionFilter) return false;
      if (facultyFilter !== 'all' && String(schedule.faculty_id ?? '') !== facultyFilter) return false;
      if (roomFilter !== 'all' && String(schedule.room_id ?? '') !== roomFilter) return false;
      if (!query) return true;
      return [
        schedule.section?.section_name,
        schedule.course?.course_code,
        schedule.course?.course_name,
        schedule.subject?.subject_code,
        schedule.subject?.subject_name,
        schedule.faculty ? `${schedule.faculty.first_name} ${schedule.faculty.last_name}` : '',
        schedule.room?.room_code,
        schedule.room?.building,
      ].some(value => (value ?? '').toLowerCase().includes(query));
    });
  }, [visibleSchedules, yearFilter, sectionFilter, facultyFilter, roomFilter, searchQuery, yearBySection]);

  const timetableRoomsUsed = useMemo(
    () => new Set(timetableSchedules.map(s => s.room_id).filter(Boolean)).size,
    [timetableSchedules],
  );
  const timetableRoomsFree = Math.max(0, assignableRooms.length - timetableRoomsUsed);

  const filtersActive = yearFilter !== 'all' || sectionFilter !== 'all' || facultyFilter !== 'all' || roomFilter !== 'all' || searchQuery !== '';
  const resetFilters = () => {
    setYearFilter('all');
    setSectionFilter('all');
    setFacultyFilter('all');
    setRoomFilter('all');
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

  const pendingApprovals = stageCounts.submitted;
  const openApproval = () => navigate('/dean/schedules/approval');

  const tiles: Tile[] = [
    { label: 'Department Sections', value: sectionTotal, detail: 'All sections', icon: Users, path: '/dean/schedules', tone: 'brand' },
    { label: 'Faculty Members', value: deptFaculties.length, detail: 'Active faculty', icon: GraduationCap, path: '/dean/faculty', tone: 'good' },
    { label: 'Curriculum Courses', value: deptSubjects.length, detail: 'Offered', icon: BookOpen, path: '/dean/curriculum', tone: 'accent' },
    { label: 'Rooms Managed', value: assignableRooms.length, detail: 'Total rooms', icon: Building2, path: '/dean/rooms', tone: 'warn' },
  ];

  const completionSlices = [
    { key: 'done', value: Math.max(0, draftedCount), color: '#16a36a' },
    { key: 'left', value: Math.max(0, sectionTotal - draftedCount), color: '#e2e8f0' },
  ].filter(slice => slice.value > 0);

  /**
   * The timetable panel. Extracted so the same tree can be portalled to the body
   * for the full-window view without the grid remounting into a different shape.
   */
  const timetablePanel = (
    <div className={isFullscreen ? 'fixed inset-0 z-[999999] flex flex-col overflow-auto bg-white p-4 sm:p-6' : 'flex h-full min-w-0 flex-col'}>
      <Panel
        title="Department Academic Timetable"
        subtitle="Overview of department timetable."
        action="View full timetable"
        onAction={() => navigate('/dean/schedules')}
        className="flex flex-1 flex-col"
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
            sectionLabel={`${deptSections.length} ${deptSections.length === 1 ? 'section' : 'sections'} · ${timetableSchedules.length} ${timetableSchedules.length === 1 ? 'class' : 'classes'}`}
            onOpenSchedule={() => navigate('/dean/schedules')}
          />
        </div>

        <button
          type="button"
          onClick={() => navigate('/dean/schedules')}
          className="mt-auto self-start pt-3 text-[11px] font-bold text-primary hover:underline"
        >
          View full timetable <ArrowRight className="inline h-3 w-3" />
        </button>
      </Panel>
    </div>
  );

  if (loading) return <DashboardSkeleton variant="dean" />;

  return <div className="space-y-4 pb-8 text-slate-800">
    {(loadError || statusError) && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{loadError || statusError}</span>
      <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-bold text-amber-800 transition hover:bg-amber-100"><RotateCcw className="h-3 w-3" /> Retry</button>
    </div>}

    <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
      {tiles.map(({ label, value, detail, icon: Icon, path, tone }) => <button
        key={label}
        type="button"
        onClick={() => navigate(path)}
        className="flex min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}><Icon className="h-4 w-4" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-lg font-bold leading-5 text-primary">{value}</div>
          <div className="mt-1 break-words text-[11px] font-bold leading-tight">{label}</div>
          <div className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{detail}</div>
        </div>
      </button>)}

      <button
        type="button"
        onClick={() => navigate('/dean/schedules')}
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
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold leading-none tabular-nums text-primary">{draftingProgress}%</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="break-words text-[11px] font-bold leading-tight">Scheduling Completion</div>
          <div className="mt-1 h-7 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ readiness: draftingProgress, label: `${draftingProgress}%` }]} layout="vertical" margin={{ top: 4, right: 38, left: 0, bottom: 4 }}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" hide />
                <Bar dataKey="readiness" fill={draftingProgress === 100 ? '#16a36a' : '#f59e0b'} radius={[5, 5, 5, 5]} barSize={9} background={{ fill: '#e2e8f0', radius: 5 }}>
                  <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{draftedCount} / {sectionTotal} sections completed</div>
        </div>
      </button>

      <button
        type="button"
        onClick={openApproval}
        className="flex min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md xl:col-span-2"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${pendingApprovals ? TONES.alert : TONES.good}`}><ClipboardCheck className="h-4 w-4" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-lg font-bold leading-5 text-primary">{pendingApprovals}</div>
          <div className="mt-1 break-words text-[11px] font-bold leading-tight">Pending Approvals</div>
          <div className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{pendingApprovals ? 'Awaiting your action' : 'Nothing awaiting review'}</div>
        </div>
      </button>
    </section>

    <section className="grid gap-4 xl:grid-cols-12">
      <Panel
        title="Schedule Review Queue"
        subtitle="Department schedule packages submitted for your review and approval."
        badge={pendingApprovals}
        action="View all queue"
        onAction={openApproval}
        className="xl:col-span-4"
      >
        {packages.length ? <>
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="min-w-[520px]">
              <div className="grid gap-2 border-b border-slate-100 pb-2 text-[9px] font-bold uppercase tracking-wide text-slate-400" style={{ gridTemplateColumns: QUEUE_COLUMNS }}>
                <span>Schedule Package</span>
                <span>Submitted By</span>
                <span>Submitted On</span>
                <span>Completion</span>
                <span className="text-right">Actions</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {packages.map(item => <li key={item.code} className="grid items-center gap-2 py-2" style={{ gridTemplateColumns: QUEUE_COLUMNS }}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <b className="truncate text-[11px] text-slate-700" title={`${item.code} Schedule`}>{item.code} Schedule</b>
                  </span>
                  <span className="truncate text-[10px] font-semibold text-slate-500" title={coordinator}>{coordinator}</span>
                  <span className="truncate text-[10px] font-semibold text-slate-500" title={formatSubmittedOn(item.submittedOn)}>{formatSubmittedOn(item.submittedOn)}</span>
                  <span className="h-6 min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ readiness: item.completion, label: `${item.completion}%` }]} layout="vertical" margin={{ top: 4, right: 38, left: 0, bottom: 4 }}>
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" hide />
                        <Bar dataKey="readiness" fill={item.completion === 100 ? '#16a36a' : '#f59e0b'} radius={[5, 5, 5, 5]} barSize={9} background={{ fill: '#e2e8f0', radius: 5 }}>
                          <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
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
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-600" /> Approve</span>
            <span className="flex items-center gap-1.5"><RotateCcw className="h-3 w-3 text-amber-600" /> Return for Revision</span>
            <span className="flex items-center gap-1.5"><X className="h-3 w-3 text-rose-600" /> Reject</span>
          </div>
        </> : <p className="py-6 text-center text-[11px] italic text-slate-400">No schedule packages for this department yet.</p>}
      </Panel>

      <Panel
        title="Section Submission Readiness"
        subtitle="Status of sections by readiness stage."
        action="View all sections by status"
        onAction={openApproval}
        className="xl:col-span-4"
      >
        <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
          <Donut slices={readinessSlices} headline={sectionTotal} caption="Total Sections" />
          <DonutLegend slices={readinessSlices} total={sectionTotal} />
        </div>
      </Panel>

      <Panel
        title="Schedule Review Overview"
        subtitle="Overview of submitted schedule packages."
        className="xl:col-span-4"
      >
        {packages.length ? <div className="-mx-1 overflow-x-auto px-1">
          <div className="min-w-[420px]">
            <div className="grid gap-2 border-b border-slate-100 pb-2 text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-400" style={{ gridTemplateColumns: OVERVIEW_COLUMNS }}>
              <span>Schedule Package</span>
              <span className="text-right">Submitted</span>
              <span className="text-right">Ready for Review</span>
              <span className="text-right">Returned for Revision</span>
              <span className="text-right">Sections Included</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {packages.map(item => <li key={item.code} className="grid items-center gap-2 py-2 text-[11px] tabular-nums" style={{ gridTemplateColumns: OVERVIEW_COLUMNS }}>
                <b className="truncate text-slate-700" title={`${item.code} Schedule`}>{item.code} Schedule</b>
                <span className="text-right font-semibold text-slate-600">{item.awaitingReview > 0 ? 1 : 0}</span>
                <span className={`text-right font-bold ${item.awaitingReview ? 'text-emerald-600' : 'text-slate-300'}`}>{item.awaitingReview}</span>
                <span className={`text-right font-bold ${item.returned ? 'text-rose-600' : 'text-slate-300'}`}>{item.returned}</span>
                <span className="text-right font-semibold text-slate-600">{item.total}</span>
              </li>)}
            </ul>
            <div className="grid gap-2 border-t border-slate-200 pt-2.5 text-[11px] font-bold tabular-nums text-primary" style={{ gridTemplateColumns: OVERVIEW_COLUMNS }}>
              <span className="uppercase tracking-wide">Total</span>
              <span className="text-right">{packageTotals.submitted}</span>
              <span className="text-right">{packageTotals.awaitingReview}</span>
              <span className="text-right">{packageTotals.returned}</span>
              <span className="text-right">{packageTotals.total}</span>
            </div>
          </div>
        </div> : <p className="py-6 text-center text-[11px] italic text-slate-400">Nothing has been submitted for review yet.</p>}
      </Panel>
    </section>

    <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {isFullscreen ? createPortal(timetablePanel, document.body) : timetablePanel}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Panel
          title="Faculty Workload"
          subtitle="Teaching load overview for all active faculty."
          action="Faculty workload by %"
          onAction={() => navigate('/dean/faculty')}
          className="flex flex-col"
        >
        <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
          <Donut slices={workloadSlices} headline={deptFaculties.length} caption="Total Faculty" />
          <DonutLegend slices={workloadSlices} total={deptFaculties.length} />
        </div>

        <div className="mt-auto border-t border-slate-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Faculty Workload by %</span>
            <span className="text-[9px] text-slate-400">Assigned / Max units</span>
          </div>
          <InstructorWorkloadChart instructors={workload} />
        </div>
        </Panel>

        <Panel
          title="Room Utilization"
          subtitle="Usage overview of department rooms."
          className="flex flex-col"
        >
        <div className="grid gap-4 sm:grid-cols-[128px_1fr] sm:items-center">
          <Donut slices={roomSlices} headline={`${utilization}%`} caption="Utilization" />
          <DonutLegend slices={roomSlices} total={assignableRooms.length} />
        </div>

        <div className="mt-3.5 flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Frequently Used Rooms</span>
          <span className="text-[9px] text-slate-400">{roomsUsed} of {assignableRooms.length} in use</span>
        </div>

        {roomUsage.length ? <div className="mt-2 h-[140px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={roomUsage.slice(0, 5).map(room => ({ name: room.code, usage: room.share, shareLabel: `${room.share}%` }))} layout="vertical" margin={{ top: 2, right: 58, left: 0, bottom: 2 }} barCategoryGap={9}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 10, fontWeight: 700, fill: '#5A1220' }} axisLine={false} tickLine={false} />
              <Bar dataKey="usage" fill="#5A1220" radius={[4, 4, 4, 4]} barSize={8} background={{ fill: '#e2e8f0', radius: 4 }}>
                <LabelList dataKey="shareLabel" position="right" offset={7} style={{ fontSize: 9, fill: '#64748b' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div> : <p className="mt-2 py-3 text-center text-[11px] italic text-slate-400">No rooms available to this department.</p>}

        <div className="mt-auto flex items-baseline justify-between gap-2 pt-3">
          <button type="button" onClick={() => navigate('/dean/rooms')} className="text-[11px] font-bold text-primary hover:underline">Go to Room Management <ArrowRight className="inline h-3 w-3" /></button>
          {roomUsage.length > 5 && <span className="text-[10px] text-slate-400">+{roomUsage.length - 5} more</span>}
        </div>
        </Panel>
      </div>
    </section>
  </div>;
}

function Panel({ title, subtitle, badge, children, action, onAction, className = '' }: {
  title: string;
  subtitle?: string;
  badge?: number;
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
    <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-primary">{title}</h2>
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
 * dashboard's drafting donut, so both dashboards draw the same ring.
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
        <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-slate-500">{slice.value} ({share1(slice.value, total)}%)</div>
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
    <b className="mt-1 block text-sm leading-none tabular-nums text-primary">{value}</b>
    <span className="mt-1 block truncate text-[9px] font-semibold text-slate-500" title={label}>{label}</span>
  </div>;
}

/**
 * One queue row action.
 *
 * Approve, return and reject are department-wide operations — POST
 * /departments/{id}/approve-by-dean and .../return-by-dean act on every submitted
 * row in the department, and there is no per-program endpoint. So these open the
 * approval workspace, where the package is reviewed and a return reason captured,
 * rather than firing a department-wide write from a single program's row.
 */
function QueueAction({ icon: Icon, label, tone, disabled, onClick }: { icon: LucideIcon; label: string; tone: 'good' | 'warn' | 'alert'; disabled?: boolean; onClick: () => void }) {
  const tones: Record<'good' | 'warn' | 'alert', string> = {
    good: 'text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50',
    warn: 'text-amber-600 hover:border-amber-300 hover:bg-amber-50',
    alert: 'text-rose-600 hover:border-rose-300 hover:bg-rose-50',
  };

  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={disabled ? 'Nothing awaiting review in this package' : label}
    aria-label={label}
    className={`flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white transition disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:border-slate-200 disabled:hover:bg-white ${tones[tone]}`}
  >
    <Icon className="h-3 w-3" />
  </button>;
}
