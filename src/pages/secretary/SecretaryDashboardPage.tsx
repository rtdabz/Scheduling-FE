import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Building2,
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
  GraduationCap,
  Loader2,
  MapPin,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import DashboardTimetableGrid from '../../components/scheduling/DashboardTimetableGrid';
import InstructorWorkloadChart from '../../components/scheduling/InstructorWorkloadChart';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { useToast } from '../../context/ToastContext';
import api from '../../lib/api';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { buildRoomUsage, physicalRooms, roomsInUse } from '../../lib/roomUsage';
import { MILESTONE_TITLES, SUBMISSION_MILESTONES, submissionProgress } from '../../lib/submissionStage';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

interface Schedule { id:number; term_id:number; section_id:number; faculty_id?:number|null; room_id?:number|null; mode?:string|null; day:string; start_time:string; end_time:string; status:string; course?:{course_code:string;course_category?:string|null}|null; subject?:{subject_code:string;subject_category?:string|null}|null; faculty?:{first_name:string;last_name:string}|null; room?:{room_code:string;room_type?:string}|null; section?:{section_name:string}|null; department_id?:number|null }
interface Room { id:number; room_code:string; room_type:string; building?:string|null; status?:string|null; department_id?:number|null }
interface Section { id:number; section_name:string; department_id?:number|null }
interface Faculty { id:number; first_name:string; last_name:string; max_units:number; assigned_units?:number; deload_units?:number; profile_picture?:string|null; department_id:number }
interface Subject { id:number; subject_code:string; subject_name:string; department_id?:number|null }
interface Term { id:number; status:string }
interface Overview { schedules:Schedule[]; rooms:Room[]; sections:Section[]; faculties:Faculty[]; subjects:Subject[]; activeTerm:Term|null }
interface InitialData { schedules?:Schedule[]; rooms?:Room[]; sections?:Section[]; faculties?:Faculty[]; subjects?:Subject[]; courses?:Subject[]; active_term?:Term }

type Tone = 'brand' | 'info' | 'good' | 'warn' | 'alert';

interface Tile { label:string; value:number; detail:string; icon:LucideIcon; path:string; tone:Tone }
interface QueueRow { label:string; value:number; action:string; icon:LucideIcon; path:string }

const TONES: Record<Tone, string> = {
  brand: 'bg-primary/10 text-primary',
  info: 'bg-slate-100 text-slate-600',
  good: 'bg-emerald-50 text-emerald-600',
  warn: 'bg-amber-50 text-amber-700',
  alert: 'bg-rose-50 text-rose-600',
};

/** Workflow stages a department schedule moves through, in order. */
const STAGES = ['Draft', 'Ready to Submit', 'Submitted to Dean', 'Returned by Dean', 'Approved by Dean', 'Approved by VPAA'];

const percent = (part:number, total:number) => (total > 0 ? Math.round((part / total) * 100) : 0);

type Delivery = 'on-site' | 'online' | 'field';

/**
 * Delivery mode of a class. Matches DashboardTimetableGrid's own reading:
 * the `mode` column wins, the room's type is the fallback for older rows.
 */
const deliveryOf = (schedule:Schedule): Delivery => {
  const mode = (schedule.mode ?? '').toLowerCase();
  if (mode.includes('online')) return 'online';
  if (mode.includes('field')) return 'field';
  const roomType = (schedule.room?.room_type ?? '').toLowerCase();
  if (roomType.includes('online')) return 'online';
  if (roomType.includes('field')) return 'field';
  return 'on-site';
};

/**
 * Only on-site classes occupy a physical room. Online classes are roomless by
 * design (migration allow_online_schedules_without_rooms made room_id nullable
 * for exactly this) and field classes are located by their delivery mode, so
 * neither is a room gap to chase.
 */
const needsRoom = (schedule:Schedule) => deliveryOf(schedule) === 'on-site';

/** Keep rows that belong to the user's department (rows with no department are shared/global). */
const inDepartment = <T extends {department_id?:number|null}>(items:T[], departmentId?:number) =>
  items.filter(item => !departmentId || !item.department_id || Number(item.department_id) === Number(departmentId));

export default function SecretaryDashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const user = useMemo(() => getStoredUser(), []);
  const departmentId = user?.department_id;
  const cacheKey = `dashboard:${user?.role ?? 'secretary'}:${user?.id ?? departmentId ?? 'current'}`;
  const cached = getCachedData<Overview>(cacheKey);

  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>(cached?.schedules ?? []);
  const [rooms, setRooms] = useState<Room[]>(cached?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cached?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cached?.faculties ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cached?.subjects ?? []);
  const [term, setTerm] = useState<Term | null>(cached?.activeTerm ?? null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(!hasCachedData(cacheKey));
      setLoadError(null);
      try {
        const overview = await loadCachedData<Overview>(cacheKey, async () => {
          const { data = {} } = await api.get<InitialData>('/initial-data');
          return {
            schedules: Array.isArray(data.schedules) ? data.schedules : [],
            rooms: Array.isArray(data.rooms) ? data.rooms : [],
            sections: Array.isArray(data.sections) ? data.sections : [],
            faculties: Array.isArray(data.faculties) ? data.faculties : [],
            subjects: Array.isArray(data.subjects) ? data.subjects : (Array.isArray(data.courses) ? data.courses : []),
            activeTerm: data.active_term || null,
          };
        }, reloadKey > 0);

        if (!active) return;
        setSchedules(overview.schedules);
        setRooms(overview.rooms);
        setSections(overview.sections);
        setFaculties(overview.faculties);
        setSubjects(overview.subjects);
        setTerm(overview.activeTerm);
      } catch {
        if (active) setLoadError('Could not load scheduling data. Figures below may be out of date.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [cacheKey, reloadKey]);

  const {
    draftingProgress,
    draftedCount,
    totalSections,
    yearLevels,
    stageCounts,
    canSubmit,
    error: statusError,
    refetch: refetchStatus,
  } = useDepartmentScheduleStatus(departmentId);

  // ── Department-scoped views of the raw payload ──
  const visibleSections = useMemo(() => inDepartment(sections, departmentId), [sections, departmentId]);
  const visibleRooms = useMemo(() => inDepartment(rooms, departmentId), [rooms, departmentId]);
  const visibleSubjects = useMemo(() => inDepartment(subjects, departmentId), [subjects, departmentId]);
  const visibleFaculty = useMemo(
    () => faculties.filter(f => !departmentId || Number(f.department_id) === Number(departmentId)),
    [faculties, departmentId],
  );

  const sectionIds = useMemo(() => new Set(visibleSections.map(s => s.id)), [visibleSections]);
  const termId = term?.id;
  const visibleSchedules = useMemo(
    () => schedules.filter(s =>
      (!termId || Number(s.term_id) === Number(termId)) &&
      (sectionIds.has(s.section_id) || Number(s.department_id) === Number(departmentId))),
    [schedules, termId, sectionIds, departmentId],
  );

  // ── Counts ──
  const scheduledSections = useMemo(() => new Set(visibleSchedules.map(s => s.section_id)).size, [visibleSchedules]);
  const sectionCoverage = percent(scheduledSections, visibleSections.length);
  const remaining = Math.max(0, visibleSections.length - scheduledSections);
  const noInstructor = visibleSchedules.filter(s => !s.faculty_id && !s.faculty).length;
  const noRoom = visibleSchedules.filter(s => needsRoom(s) && !s.room_id && !s.room).length;
  const onlineClasses = visibleSchedules.filter(s => deliveryOf(s) === 'online').length;
  const fieldClasses = visibleSchedules.filter(s => deliveryOf(s) === 'field').length;
  const incomplete = visibleSchedules.filter(s => (!s.course && !s.subject) || !s.start_time || !s.end_time).length;
  const draftClasses = visibleSchedules.filter(s => !s.status || ['draft', 'revision'].includes(s.status.toLowerCase())).length;

  const loads = useMemo(() => visibleFaculty
    .map(f => {
      const assigned = f.assigned_units || 0;
      const max = Math.max(0, f.max_units - (f.deload_units || 0));
      return { ...f, assigned, max, remaining: Math.max(0, max - assigned) };
    })
    .sort((a, b) => b.remaining - a.remaining), [visibleFaculty]);

  /** Busiest five instructors, the rows of the Workload Progress list. */
  const workload = useMemo(
    () => [...loads].sort((a, b) => b.assigned - a.assigned).slice(0, 5),
    [loads],
  );

  // ── Room inventory ──
  // Physical rooms only. ONLINE and FIELD are placeholder rows that exist so an
  // online or field class has something to point at; treating them as rooms made
  // the unbooked count look worse than it was and reported them as "Unbooked"
  // while a hundred classes were delivered through them.
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
  const unbookedRooms = Math.max(0, assignableRooms.length - roomsUsed);
  const labRooms = assignableRooms.filter(r => (r.room_type ?? '').toLowerCase().includes('lab')).length;

  // ── Submission readiness ──
  // The last item mirrors the backend gate for POST /departments/{id}/submit-schedules.
  const checks: ReadonlyArray<readonly [string, boolean]> = [
    ['All required sections have schedules', remaining === 0],
    ['All scheduled classes have instructors', noInstructor === 0],
    ['All on-site classes have rooms', noRoom === 0],
    ['Required schedule information is complete', incomplete === 0],
    ['Every year level has left the draft stage', canSubmit],
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
  const submitHint = canSubmit
    ? 'Every year level has left the draft stage. Schedules are ready for the Dean.'
    : pendingYears.length
      ? `Finish drafting ${pendingYears.join(', ')} before submitting.`
      : 'No active sections found for this department yet.';

  // ── Current status ──
  const progress = submissionProgress(currentStage);
  const statusNote = progress.isComplete
    ? 'Approved all the way through. Nothing further is needed for this term.'
    : currentStage === 4 ? 'The Dean approved these schedules. Waiting on the VPAA.'
    : progress.isReturned ? `${stageCounts.revision} section${stageCounts.revision === 1 ? '' : 's'} came back from the Dean. Revise and submit again.`
    : currentStage === 2 ? 'Schedules are with the Dean for review.'
    : submitHint;
  const statusTone: Tone = progress.isReturned ? 'alert'
    : progress.isComplete || currentStage === 4 ? 'good'
    : currentStage === 2 ? 'brand'
    : canSubmit ? 'good'
    : 'warn';
  const statusBand = progress.isReturned ? 'border-rose-200 bg-rose-50/70'
    : progress.isComplete || currentStage === 4 || canSubmit ? 'border-emerald-200 bg-emerald-50/70'
    : currentStage === 2 ? 'border-primary/20 bg-primary/5'
    : 'border-amber-200 bg-amber-50/70';
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

  const tiles: Tile[] = [
    { label:'Total Sections', value:visibleSections.length, detail:'Department scope', icon:Users, path:'/secretary/sections', tone:'brand' },
    { label:'Scheduled Sections', value:scheduledSections, detail:`${sectionCoverage}% of ${visibleSections.length} sections`, icon:ShieldCheck, path:'/secretary/schedules', tone:remaining === 0 && visibleSections.length > 0 ? 'good' : 'brand' },
    { label:'Remaining Sections', value:remaining, detail:'Still to schedule', icon:FileClock, path:'/secretary/schedules', tone:remaining ? 'warn' : 'good' },
    { label:'Total Faculty', value:visibleFaculty.length, detail:'Active faculty', icon:GraduationCap, path:'/secretary/instructors', tone:'brand' },
    { label:'Curriculum Courses', value:visibleSubjects.length, detail:'Available offerings', icon:BookOpen, path:'/secretary/courses', tone:'brand' },
    { label:'Unbooked Rooms', value:unbookedRooms, detail:`of ${assignableRooms.length} rooms`, icon:Building2, path:'/secretary/rooms', tone:'info' },
    { label:'Need Instructors', value:noInstructor, detail:'Requires assignment', icon:UserRoundCheck, path:'/secretary/instructor-assignment', tone:noInstructor ? 'alert' : 'good' },
    { label:'Draft Schedules', value:draftClasses, detail:'Not yet submitted', icon:FileText, path:'/secretary/schedules', tone:draftClasses ? 'warn' : 'good' },
  ];

  const queue: QueueRow[] = [
    { label:'Sections that still need schedules', value:remaining, action:'View', icon:CalendarDays, path:'/secretary/schedules' },
    { label:'Classes without instructors', value:noInstructor, action:'Assign', icon:UserRoundCheck, path:'/secretary/instructor-assignment' },
    { label:'On-site classes without rooms', value:noRoom, action:'Assign', icon:DoorOpen, path:'/secretary/rooms' },
    { label:'Incomplete schedule entries', value:incomplete, action:'Complete', icon:ClipboardCheck, path:'/secretary/schedules' },
    { label:'Sections returned for revision', value:stageCounts.revision, action:'Review', icon:FileClock, path:'/secretary/schedules' },
  ];

  /** Outstanding work first, biggest first; a settled row can wait at the bottom. */
  const openQueue = queue.filter(row => row.value > 0).sort((a, b) => b.value - a.value);
  const clearedQueue = queue.filter(row => row.value === 0);
  const openItems = openQueue.reduce((total, row) => total + row.value, 0);

  const progressRows = yearLevels.length
    ? yearLevels
    : [{ year_level:0, label:'All sections', total:visibleSections.length, drafted:scheduledSections, isComplete:remaining === 0 }];

  if (loading) return <DashboardSkeleton variant="secretary" />;

  return <div className="space-y-4 pb-8 text-slate-800">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-primary">Secretary Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Prepare complete and validated department schedules for approval.</p>
      </div>
    </header>

    {(loadError || statusError) && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0"/>
      <span className="flex-1">{loadError || statusError}</span>
      <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-bold text-amber-800 transition hover:bg-amber-100"><RotateCcw className="h-3 w-3"/> Retry</button>
    </div>}

    <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
      {tiles.map(({label, value, detail, icon:Icon, path, tone}) => <button
        key={label}
        type="button"
        onClick={() => navigate(path)}
        className="flex min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}><Icon className="h-4 w-4"/></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-lg font-bold leading-5 text-primary">{value}</div>
          <div className="mt-1 break-words text-[11px] font-bold leading-tight">{label}</div>
          <div className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{detail}</div>
        </div>
      </button>)}
    </section>

    <section className="grid gap-4 xl:grid-cols-12">
      <Panel title="Scheduling Work Queue" className="xl:col-span-4" action="View all items" onAction={() => navigate('/secretary/schedules')}>
        <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${openItems ? 'border-amber-200 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${openItems ? TONES.warn : TONES.good}`}>{openItems ? <AlertTriangle className="h-4 w-4"/> : <CheckCircle2 className="h-4 w-4"/>}</span>
            <div className="min-w-0">
              <div className="text-xl font-bold leading-none tabular-nums text-primary">{openItems}</div>
              <div className="mt-1 text-[10px] font-semibold leading-tight text-slate-600">{openItems === 1 ? 'item needs attention' : 'items need attention'}</div>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold tabular-nums text-slate-600">{clearedQueue.length}/{queue.length} clear</span>
        </div>

        <ul className="mt-1 divide-y divide-slate-100">
          {[...openQueue, ...clearedQueue].map(({label, value, action, icon:Icon, path}) => <li key={label}>
            <button
              type="button"
              onClick={() => navigate(path)}
              className="group flex w-full items-center gap-2.5 py-2.5 text-left transition hover:bg-slate-50"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${value ? TONES.warn : TONES.good}`}><Icon className="h-3.5 w-3.5"/></span>
              <span className={`min-w-0 flex-1 truncate text-xs ${value ? 'font-semibold text-slate-700' : 'font-medium text-slate-400'}`} title={label}>{label}</span>
              <b className={`w-7 shrink-0 text-right text-xs tabular-nums ${value ? 'text-amber-700' : 'text-slate-300'}`}>{value}</b>
              <span className="flex w-[68px] shrink-0 justify-end">
                {value
                  ? <span className="inline-flex items-center gap-0.5 rounded-md border border-primary/30 px-1.5 py-1 text-[10px] font-bold text-primary transition group-hover:border-primary group-hover:bg-primary group-hover:text-white">{action}<ChevronRight className="h-3 w-3"/></span>
                  : <Check className="h-3.5 w-3.5 text-emerald-500"/>}
              </span>
            </button>
          </li>)}
        </ul>
      </Panel>

      <Panel title="Department Drafting Progress" className="flex flex-col xl:col-span-4">
        <div className="grid gap-5 sm:grid-cols-[144px_1fr] sm:items-center">
          <div className="relative mx-auto h-32 w-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={progressRows.map(row => ({
                    name: row.label,
                    value: Math.max(1, row.total),
                    complete: row.isComplete,
                  }))}
                  dataKey="value"
                  innerRadius="67%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={1}
                  stroke="#ffffff"
                  strokeWidth={3}
                >
                  {progressRows.map(row => (
                    <Cell
                      key={row.year_level}
                      fill={row.isComplete ? '#16a36a' : '#f59e0b'}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white text-center">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Complete</span>
              <b className="mt-0.5 text-2xl leading-none text-primary">{draftingProgress}%</b>
              <span className="mt-1 text-[9px] text-slate-500">{draftedCount}/{totalSections} sections</span>
            </div>
          </div>
          <div className="h-[168px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={progressRows.map(row => ({ name: row.label, progress: percent(row.drafted, row.total), count: `${percent(row.drafted, row.total)}%  ${row.drafted}/${row.total}` }))} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barCategoryGap={10}>
                <XAxis type="number" domain={[0, 100]} hide />
                <YAxis type="category" dataKey="name" width={58} tick={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Bar dataKey="progress" fill="#16a36a" radius={[4, 4, 4, 4]} barSize={7} background={{ fill: '#e2e8f0', radius: 4 }}>
                  <LabelList dataKey="count" position="right" offset={8} style={{ fontSize: 9, fill: '#64748b' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="mt-auto border-t border-slate-100 pt-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md bg-emerald-50 p-2 text-center"><div className="text-lg font-bold leading-none text-emerald-700">{draftedCount}</div><div className="mt-1 text-[9px] font-semibold text-emerald-700">Drafted</div></div>
            <div className="rounded-md bg-amber-50 p-2 text-center"><div className="text-lg font-bold leading-none text-amber-700">{remaining}</div><div className="mt-1 text-[9px] font-semibold text-amber-700">Remaining</div></div>
            <div className="rounded-md bg-slate-50 p-2 text-center"><div className="text-lg font-bold leading-none text-primary">{progressRows.filter(row => row.isComplete).length}/{progressRows.length}</div><div className="mt-1 text-[9px] font-semibold text-slate-600">Years Complete</div></div>
          </div>
          <button type="button" onClick={() => navigate('/secretary/schedules')} className="mt-3 w-full rounded-md border border-primary px-3 py-2 text-[10px] font-bold text-primary transition hover:bg-primary/5">Open Department Schedule</button>
        </div>
      </Panel>

      <Panel title="Instructor Assignment" className="xl:col-span-4" action="View all" onAction={() => navigate('/secretary/instructor-assignment')}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Workload Progress</span>
          <span className="text-[9px] text-slate-400">Assigned / Max units</span>
        </div>
        <InstructorWorkloadChart instructors={workload}/>
      </Panel>
    </section>

    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <DashboardTimetableGrid
          schedules={visibleSchedules}
          sectionLabel={`${visibleSections.length} Sections`}
          onOpenSchedule={() => navigate('/secretary/schedules')}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
      <Panel title="Room Assignment" action="View all" onAction={() => navigate('/secretary/rooms')}>
        <button
          type="button"
          onClick={() => navigate('/secretary/rooms')}
          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition hover:shadow-sm ${noRoom ? 'border-rose-200 bg-rose-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}
        >
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${noRoom ? TONES.alert : TONES.good}`}>{noRoom ? <AlertTriangle className="h-4 w-4"/> : <CheckCircle2 className="h-4 w-4"/>}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-bold leading-none tabular-nums text-primary">{noRoom}</span>
            <span className="mt-1 block text-[10px] font-semibold leading-tight text-slate-600">{noRoom ? 'on-site classes still waiting for a room' : 'every on-site class has a room'}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400"/>
        </button>

        <div className="mt-3 grid grid-cols-4 gap-2">
          <StatChip icon={DoorOpen} value={assignableRooms.length} label="Rooms"/>
          <StatChip icon={FlaskConical} value={labRooms} label="Labs"/>
          <StatChip icon={Globe2} value={onlineClasses} label="Online"/>
          <StatChip icon={MapPin} value={fieldClasses} label="Field"/>
        </div>

        <div className="mt-3.5 flex items-baseline justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Room Usage</span>
          <span className="text-[9px] text-slate-400">{roomsUsed} of {assignableRooms.length} rooms in use</span>
        </div>

        {roomUsage.length ? <div className="mt-2 h-[140px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={roomUsage.slice(0, 5).map(room => ({ name: room.code, usage: room.share, classesLabel: `${room.classes} ${room.classes === 1 ? 'class' : 'classes'}` }))} layout="vertical" margin={{ top: 2, right: 58, left: 0, bottom: 2 }} barCategoryGap={9}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 10, fontWeight: 700, fill: '#5A1220' }} axisLine={false} tickLine={false} />
              <Bar dataKey="usage" fill="#5A1220" radius={[4, 4, 4, 4]} barSize={8} background={{ fill: '#e2e8f0', radius: 4 }}>
                <LabelList dataKey="classesLabel" position="right" offset={7} style={{ fontSize: 9, fill: '#64748b' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div> : <p className="mt-2 py-3 text-center text-[11px] italic text-slate-400">No rooms available to this department.</p>}

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <button type="button" onClick={() => navigate('/secretary/rooms')} className="text-[11px] font-bold text-primary hover:underline">Go to Room Assignment <ArrowRight className="inline h-3 w-3"/></button>
          {roomUsage.length > 5 && <span className="text-[10px] text-slate-400">+{roomUsage.length - 5} more</span>}
        </div>
      </Panel>

      <Panel title="Submission Overview" className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-2.5">
          <div className={`rounded-lg border px-2.5 py-2 ${statusBand}`}>
            <div className="flex items-start gap-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONES[statusTone]}`}><StatusIcon className="h-3.5 w-3.5"/></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-bold leading-tight text-primary" title={STAGES[currentStage]}>{STAGES[currentStage]}</span>
                  <span className="shrink-0 rounded-full bg-white/80 px-1.5 py-0.5 text-[8px] font-bold tabular-nums text-slate-600">{progress.at + 1}/{SUBMISSION_MILESTONES.length}</span>
                </div>
                <p className="mt-0.5 text-[9px] font-medium leading-3.5 text-slate-600">{statusNote}</p>
              </div>
            </div>
          </div>

          <ol className="flex items-start pt-0.5">
            {SUBMISSION_MILESTONES.map((milestone, i) => {
              const passed = i < progress.done;
              const here = i === progress.at && !passed;
              return <li key={milestone} className="relative min-w-0 flex-1 text-center">
                {i < SUBMISSION_MILESTONES.length - 1 && <div className={`absolute left-1/2 top-[11px] h-0.5 w-full ${passed ? 'bg-emerald-400' : 'bg-slate-200'}`}/>}
                <span
                  title={MILESTONE_TITLES[milestone]}
                  className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold ${
                    passed ? 'bg-emerald-500 text-white'
                    : here ? `text-white ring-4 ${progress.isReturned ? 'bg-rose-500 ring-rose-500/15' : 'bg-primary ring-primary/15'}`
                    : 'bg-slate-200 text-slate-500'}`}
                >
                  {passed ? <Check className="h-3 w-3"/> : here && progress.isReturned ? <RotateCcw className="h-3 w-3"/> : i + 1}
                </span>
                <div className={`mt-1.5 px-0.5 text-[8px] leading-[10px] ${here ? 'font-bold text-primary' : passed ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-400'}`}>{milestone}</div>
              </li>;
            })}
          </ol>

          <div className="flex flex-1 flex-col border-t border-slate-100 pt-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Readiness</span>
              <span className="text-[8px] font-semibold tabular-nums text-slate-500">{doneChecks}/{checks.length} &middot; {ready}%</span>
            </div>
            <div className="mt-1 h-7 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ readiness: ready, label: `${ready}%` }]} layout="vertical" margin={{ top: 4, right: 38, left: 0, bottom: 4 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis type="category" hide />
                  <Bar dataKey="readiness" fill={ready === 100 ? '#16a36a' : '#f59e0b'} radius={[5, 5, 5, 5]} barSize={9} background={{ fill: '#e2e8f0', radius: 5 }}>
                    <LabelList dataKey="label" position="right" offset={7} style={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1.5">
              {checks.map(([label, done]) => <li key={label} className="flex items-start gap-2">
                <span className={`mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-700'}`}>{done ? <Check className="h-2 w-2"/> : <AlertTriangle className="h-2 w-2"/>}</span>
                <span className={`min-w-0 flex-1 text-[10px] leading-3.5 ${done ? 'text-slate-500' : 'font-semibold text-slate-700'}`}>{label}</span>
              </li>)}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => navigate('/secretary/schedules')}
            title={canSubmit ? 'Submission is done from the schedule workflow' : submitHint}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-primary-light"
          >
            {canSubmit
              ? <><Send className="h-3 w-3"/>Submit in Schedule Workflow</>
              : <>Continue Drafting Schedules<ArrowRight className="h-3 w-3"/></>}
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
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}{submitting ? 'Submittingâ€¦' : 'Submit to Dean'}
          </button>
        </div>
      </Panel>
      </div>
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
            <button type="button" onClick={() => navigate('/secretary/schedules')} className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-[11px] font-bold text-white transition hover:bg-primary-light">Review Details</button>
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
            {submitting ? <Loader2 className="h-3 w-3 animate-spin"/> : <Send className="h-3 w-3"/>}
            {submitting ? 'Submitting…' : 'Submit to Dean'}
          </button>
        </div>
      </Panel>
    </section>
  </div>;
}

function Panel({title, children, action, onAction, className = ''}:{title:string; children:ReactNode; action?:string; onAction?:() => void; className?:string}) {
  return <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
      <h2 className="text-[11px] font-bold uppercase tracking-wide text-primary">{title}</h2>
      {action && <button type="button" onClick={onAction} className="inline-flex shrink-0 items-center text-[10px] font-bold text-primary hover:underline">{action}<ChevronRight className="h-3 w-3"/></button>}
    </div>
    {children}
  </section>;
}

function StatChip({icon:Icon, value, label}:{icon:LucideIcon; value:number; label:string}) {
  return <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2 text-center">
    <Icon className="mx-auto h-3.5 w-3.5 text-primary/70"/>
    <b className="mt-1 block text-sm leading-none tabular-nums text-primary">{value}</b>
    <span className="mt-1 block truncate text-[9px] font-semibold text-slate-500" title={label}>{label}</span>
  </div>;
}



