import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, CircleDot, ClipboardCheck, Clock3, DoorOpen, GraduationCap, Layers3, Send, UserCheck, Users } from 'lucide-react';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import DashboardTimetableGrid from '../../components/scheduling/DashboardTimetableGrid';
import { useToast } from '../../context/ToastContext';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import api from '../../lib/api';
import { termLabel } from '../../lib/termLabel';

interface Faculty { id: number; first_name: string; last_name: string; max_units: number; assigned_units?: number; department_id: number; }
interface Section { id: number; section_name: string; department_id: number; year_level: number; }
interface Subject { id: number; subject_code: string; subject_name: string; department_id?: number | null; }
interface Schedule {
  id: number; term_id: number; section_id: number; faculty_id?: number | null; room_id?: number | null; day: string; start_time: string; end_time: string; status: string;
  course?: { course_code: string; course_name: string; course_category?: string | null } | null; subject?: { subject_code: string; subject_name: string; subject_category?: string | null } | null;
  faculty?: { first_name: string; last_name: string } | null; room?: { room_code: string; building?: string } | null;
  section?: { id: number; section_name: string; department_id: number } | null; department_id?: number | null;
}
interface Term { id: number; academic_year: string; semester: '1st' | '2nd' | 'summer'; is_active: boolean; }
interface StoredUser { id?: number; name?: string; department_id?: number; role?: string; }
interface DashboardData { faculties: Faculty[]; sections: Section[]; subjects: Subject[]; schedules: Schedule[]; activeTerm: Term | null; }
interface InitialDataResponse extends Omit<DashboardData, 'activeTerm' | 'subjects'> { active_term: Term; courses?: Subject[]; subjects?: Subject[]; }

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDay = (day: string) => { const value = day.trim().slice(0, 3).toLowerCase(); return value.charAt(0).toUpperCase() + value.slice(1); };
const statusLabel = (status: string) => status === 'approved' ? 'VPAA Approved' : status === 'approved_by_dean' ? 'Dean Approved' : status === 'submitted' ? 'Submitted' : 'In Preparation';

export default function ProgramHeadDashboardPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) as StoredUser : null;
  const cacheKey = `dashboard:${user?.role ?? 'program_head'}:${user?.id ?? user?.department_id ?? 'current'}`;
  const cached = getCachedData<DashboardData>(cacheKey);
  const [isLoading, setIsLoading] = useState(!hasCachedData(cacheKey));
  const [faculties, setFaculties] = useState(cached?.faculties ?? []);
  const [sections, setSections] = useState(cached?.sections ?? []);
  const [subjects, setSubjects] = useState(cached?.subjects ?? []);
  const [schedules, setSchedules] = useState(cached?.schedules ?? []);
  const [activeTerm, setActiveTerm] = useState<Term | null>(cached?.activeTerm ?? null);
  const { draftingProgress, stageCounts } = useDepartmentScheduleStatus(user?.department_id);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        setIsLoading(!hasCachedData(cacheKey));
        const data = await loadCachedData<DashboardData>(cacheKey, async () => {
          const response = await api.get<InitialDataResponse>('/initial-data');
          return { faculties: response.data.faculties, sections: response.data.sections, subjects: response.data.courses ?? response.data.subjects ?? [], schedules: response.data.schedules, activeTerm: response.data.active_term };
        });
        if (!active) return;
        setFaculties(data.faculties); setSections(data.sections); setSubjects(data.subjects); setSchedules(data.schedules); setActiveTerm(data.activeTerm);
      } catch { toast.error('Error', 'Failed to load dashboard data.'); }
      finally { if (active) setIsLoading(false); }
    };
    loadData(); return () => { active = false; };
  }, [cacheKey, toast]);

  const programFaculties = useMemo(() => faculties.filter(f => Number(f.department_id) === Number(user?.department_id)), [faculties, user?.department_id]);
  const programSections = useMemo(() => sections.filter(s => Number(s.department_id) === Number(user?.department_id)), [sections, user?.department_id]);
  const programSubjects = useMemo(() => subjects.filter(s => Number(s.department_id) === Number(user?.department_id)), [subjects, user?.department_id]);
  const programSchedules = useMemo(() => schedules.filter(schedule => {
    const section = sections.find(item => item.id === schedule.section_id);
    return Number(section?.department_id ?? schedule.section?.department_id ?? schedule.department_id) === Number(user?.department_id)
      && (!activeTerm?.id || Number(schedule.term_id) === Number(activeTerm.id));
  }), [activeTerm?.id, schedules, sections, user?.department_id]);

  const scheduledIds = useMemo(() => new Set(programSchedules.map(s => s.section_id)), [programSchedules]);
  const scheduledSections = scheduledIds.size;
  const remainingSections = Math.max(0, programSections.length - scheduledSections);
  const withoutInstructor = programSchedules.filter(s => !s.faculty_id && !s.faculty).length;
  const withoutRoom = programSchedules.filter(s => !s.room_id && !s.room).length;
  const availableFaculty = programFaculties.filter(f => (f.assigned_units ?? 0) < (f.max_units || 21));
  const usedRooms = new Set(programSchedules.map(s => s.room?.room_code).filter(Boolean));
  const availableRooms = Math.max(0, 15 - usedRooms.size);
  const readiness = programSchedules.length ? Math.round(((programSchedules.length * 2 - withoutInstructor - withoutRoom) / (programSchedules.length * 2)) * 100) : 0;
  const yearProgress = useMemo(() => [1, 2, 3, 4].map(year => {
    const list = programSections.filter(s => s.year_level === year); const completed = list.filter(s => scheduledIds.has(s.id)).length;
    return { year, completed, total: list.length, percent: list.length ? Math.round(completed / list.length * 100) : 0 };
  }), [programSections, scheduledIds]);
  const topFaculty = useMemo(() => [...availableFaculty].sort((a, b) => ((b.max_units || 21) - (b.assigned_units ?? 0)) - ((a.max_units || 21) - (a.assigned_units ?? 0))).slice(0, 4), [availableFaculty]);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const timeSlots = useMemo(() => Array.from({ length: 25 }, (_, index) => {
    const totalMinutes = 7 * 60 + index * 30; let hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; const ampm = hours >= 12 ? 'PM' : 'AM'; if (hours > 12) hours -= 12; if (hours === 0) hours = 12;
    return { label: `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}` };
  }), []);
  const parseTimeToSlotIndex = (time: string) => {
    if (!time) return 0; const [clock, modifier] = time.trim().split(' '); if (!clock || !modifier) return 0; let [hours, minutes] = clock.split(':').map(Number); if (modifier === 'PM' && hours < 12) hours += 12; if (modifier === 'AM' && hours === 12) hours = 0; return Math.max(0, (hours * 60 + minutes - 7 * 60) / 30);
  };
  const getDayLayouts = (daySchedules: Schedule[]) => {
    const layouts: Record<number, { col: number; totalCols: number }> = {};
    daySchedules.forEach((schedule, index) => {
      const start = parseTimeToSlotIndex(schedule.start_time); const end = parseTimeToSlotIndex(schedule.end_time);
      const overlapping = daySchedules.filter((other, otherIndex) => otherIndex !== index && start < parseTimeToSlotIndex(other.end_time) && end > parseTimeToSlotIndex(other.start_time));
      const used = new Set(overlapping.map(other => layouts[other.id]?.col).filter((col): col is number => col !== undefined)); let col = 0; while (used.has(col)) col += 1;
      layouts[schedule.id] = { col, totalCols: Math.max(col + 1, overlapping.length + 1) };
    });
    return layouts;
  };
  const currentDay = days[now.getDay()];
  const currentTimeTop = useMemo(() => { const elapsed = (now.getHours() * 60 + now.getMinutes()) - 7 * 60; return elapsed >= 0 && elapsed <= 12 * 60 ? elapsed * 0.8 : null; }, [now]);
  const latestStatus = programSchedules.some(s => s.status === 'approved') ? 'approved' : programSchedules.some(s => s.status === 'approved_by_dean') ? 'approved_by_dean' : programSchedules.some(s => s.status === 'submitted') ? 'submitted' : 'draft';

  const metrics: Array<[string, number, string, typeof Users, string, string]> = [
    ['Program Sections', programSections.length, 'All year levels', Layers3, 'bg-blue-50 text-blue-600', '/program_head/schedules'],
    ['Scheduled Sections', scheduledSections, `${draftingProgress}% program progress`, CheckCircle2, 'bg-emerald-50 text-emerald-600', '/program_head/schedules'],
    ['Remaining Sections', remainingSections, 'Still in preparation', Clock3, 'bg-violet-50 text-violet-600', '/program_head/schedules'],
    ['Program Faculty', programFaculties.length, `${availableFaculty.length} with capacity`, Users, 'bg-green-50 text-green-600', '/program_head/faculty'],
    ['Program Courses', programSubjects.length, 'Curriculum subjects', BookOpen, 'bg-indigo-50 text-indigo-600', '/program_head/curriculum'],
    ['Need Instructors', withoutInstructor, 'Requires assignment', UserCheck, 'bg-orange-50 text-orange-600', '/program_head/instructor-assignment'],
    ['Rooms In Use', usedRooms.size, `${availableRooms} estimated available`, Building2, 'bg-rose-50 text-rose-600', '/program_head/rooms'],
  ];
  const readinessQueue: Array<[string, number, string, typeof Users, string]> = [
    ['Sections still in preparation', remainingSections, 'Review', Layers3, '/program_head/schedules'],
    ['Classes needing instructors', withoutInstructor, 'Assign', UserCheck, '/program_head/instructor-assignment'],
    ['Classes needing rooms', withoutRoom, 'Assign', DoorOpen, '/program_head/rooms'],
    ['Schedules awaiting next stage', (stageCounts?.draft ?? 0) + (stageCounts?.submitted ?? 0), 'Track', Send, '/program_head/schedules'],
  ];

  if (isLoading) return <DashboardSkeleton variant="program" />;

  return (
    <div className="min-h-screen space-y-4 bg-[#f7f8fc] pb-8 font-sans text-slate-900">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-1 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-extrabold text-[#14213d]">Program Head Dashboard</h1><p className="mt-1 text-xs text-slate-500">Monitor program completeness, section readiness, and schedule progress.</p></div>
        <div className="flex items-center gap-3">
          {activeTerm && <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm"><CalendarDays className="h-3.5 w-3.5 text-blue-600" />{termLabel(activeTerm)}<ChevronDown className="h-3.5 w-3.5 text-slate-400" /></div>}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7B1E3A] text-xs font-black text-white">{(user?.name || 'PH').split(' ').map(p => p[0]).join('').slice(0, 2)}</div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {metrics.map(([label, value, note, Icon, tone, route]) => <button key={label} onClick={() => navigate(route)} className="flex min-h-[92px] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:shadow-md"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><strong className="block text-xl font-black leading-none text-[#14213d]">{value}</strong><span className="mt-1.5 block break-words text-[10px] font-bold leading-tight text-slate-700">{label}</span><span className="mt-1 block break-words text-[8px] leading-tight text-slate-400">{note}</span></span></button>)}
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Panel title="Program Readiness Queue" className="xl:col-span-2" action={() => navigate('/program_head/schedules')}>
          <div className="divide-y divide-slate-100 rounded-md border border-slate-100">
            {readinessQueue.map(([label, value, action, Icon, route]) => <button key={label} onClick={() => navigate(route)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50"><Icon className="h-4 w-4 text-blue-600" /><span className="flex-1 text-[10px] font-semibold text-slate-700">{label}</span><strong className="text-[10px]">{value}</strong><span className="w-10 text-right text-[8px] font-bold text-blue-600">{action}</span></button>)}
          </div>
        </Panel>
        <Panel title="Program Schedule Progress" className="xl:col-span-3">
          <div className="grid gap-5 sm:grid-cols-[130px_1fr] sm:items-center">
            <div className="relative mx-auto flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `conic-gradient(#16a36a ${draftingProgress}%, #e8ebf1 0)` }}><div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white"><span className="text-[8px] font-bold text-slate-500">Completion</span><strong className="text-2xl font-black text-[#14213d]">{draftingProgress}%</strong><span className="text-[7px] text-slate-400">{scheduledSections}/{programSections.length} sections</span></div></div>
            <div className="space-y-3">{yearProgress.map(item => <div key={item.year} className="grid grid-cols-[42px_1fr_60px] items-center gap-3 text-[9px]"><span className="font-bold text-slate-700">Year {item.year}</span><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.percent}%` }} /></div><span className="text-right font-bold text-slate-500">{item.percent}% {item.completed}/{item.total}</span></div>)}</div>
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Instructor Coverage" action={() => navigate('/program_head/instructor-assignment')}>
          <MiniStats items={[[withoutInstructor, 'Need instructors', UserCheck], [availableFaculty.length, 'Eligible faculty', CheckCircle2], [programFaculties.length, 'Program faculty', Users]]} />
          <div className="overflow-hidden rounded-md border border-slate-100"><TableHeader labels={['Available instructor', 'Available', 'Current load']} />{topFaculty.map(f => <div key={f.id} className="grid grid-cols-[1fr_70px_70px] border-t border-slate-100 px-3 py-2 text-[9px]"><strong className="truncate text-slate-700">{f.first_name} {f.last_name}</strong><span>{Math.max(0, (f.max_units || 21) - (f.assigned_units ?? 0))} units</span><span>{f.assigned_units ?? 0}/{f.max_units || 21}</span></div>)}{topFaculty.length === 0 && <Empty text="No available instructors found." />}</div>
        </Panel>
        <Panel title="Room Coverage" action={() => navigate('/program_head/rooms')}>
          <MiniStats items={[[withoutRoom, 'Need rooms', DoorOpen], [usedRooms.size, 'Rooms in use', Building2], [availableRooms, 'Est. available', CheckCircle2]]} />
          <div className="overflow-hidden rounded-md border border-slate-100"><TableHeader labels={['Room', 'Building', 'Classes']} />{Array.from(usedRooms).slice(0, 4).map(room => { const roomSchedules = programSchedules.filter(s => s.room?.room_code === room); return <div key={room} className="grid grid-cols-[1fr_1fr_70px] border-t border-slate-100 px-3 py-2 text-[9px]"><strong className="text-slate-700">{room}</strong><span>{roomSchedules[0]?.room?.building || 'Main'}</span><span>{roomSchedules.length}</span></div>; })}{usedRooms.size === 0 && <Empty text="No room assignments yet." />}</div>
        </Panel>
      </section>

      <DashboardTimetableGrid schedules={programSchedules} sectionLabel={`${programSections.length} Sections`} onOpenSchedule={() => navigate('/program_head/schedules')} />

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Program Readiness Checklist">
          <div className="grid gap-2 sm:grid-cols-2">{[
            ['Required sections are scheduled', remainingSections === 0], ['Scheduled classes have instructors', withoutInstructor === 0], ['Scheduled classes have rooms', withoutRoom === 0], ['Program schedule information is complete', readiness === 100],
          ].map(([label, complete]) => <div key={String(label)} className="flex items-center gap-2 rounded-md border border-slate-100 px-3 py-2"><span className={`flex h-4 w-4 items-center justify-center rounded-full ${complete ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{complete ? <Check className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}</span><span className="flex-1 text-[9px] font-semibold text-slate-600">{String(label)}</span><span className={`rounded px-1.5 py-0.5 text-[7px] font-bold ${complete ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>{complete ? 'Complete' : 'Pending'}</span></div>)}</div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><div><strong className="text-2xl font-black text-[#14213d]">{readiness}%</strong><p className="text-[8px] text-slate-400">Program schedule readiness</p></div><button onClick={() => navigate('/program_head/schedules')} className="rounded-md bg-[#14213d] px-4 py-2 text-[9px] font-bold text-white">Review details</button></div>
        </Panel>
        <Panel title="Submission Status">
          <div className="flex items-start justify-between">{[
            ['draft', 'In Preparation', ClipboardCheck], ['submitted', 'Submitted', Send], ['approved_by_dean', 'Dean Approved', GraduationCap], ['approved', 'VPAA Approved', CheckCircle2],
          ].map(([key, label, Icon], index) => { const stages = ['draft', 'submitted', 'approved_by_dean', 'approved']; const reached = index <= stages.indexOf(latestStatus); return <div key={String(key)} className="relative flex flex-1 flex-col items-center text-center before:absolute before:left-0 before:right-0 before:top-4 before:h-px before:bg-slate-200 first:before:left-1/2 last:before:right-1/2"><span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${reached ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}><Icon className="h-3.5 w-3.5" /></span><span className="mt-2 max-w-20 text-[8px] font-bold text-slate-600">{String(label)}</span></div>; })}</div>
          <div className="mt-5 rounded-md bg-slate-50 p-3"><span className="text-[8px] font-bold text-blue-600">Current Status</span><p className="mt-1 text-sm font-black text-[#14213d]">{statusLabel(latestStatus)}</p><p className="mt-1 text-[8px] text-slate-500">Track the program schedule through departmental and institutional review.</p></div>
          <div className="mt-3 flex justify-end"><button onClick={() => navigate('/program_head/schedules')} className="flex items-center gap-2 rounded-md bg-[#14213d] px-4 py-2 text-[9px] font-bold text-white"><Send className="h-3 w-3" />Open scheduling panel</button></div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({ title, children, className = '', action, actionLabel = 'View all' }: { title: string; children: React.ReactNode; className?: string; action?: () => void; actionLabel?: string }) {
  return <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}><div className="mb-3 flex items-center justify-between"><h2 className="text-[11px] font-black uppercase text-[#14213d]">{title}</h2>{action && <button onClick={action} className="flex items-center gap-1 text-[9px] font-bold text-blue-600">{actionLabel}<ArrowRight className="h-3 w-3" /></button>}</div>{children}</div>;
}
function MiniStats({ items }: { items: readonly (readonly [number, string, typeof Users])[] }) { return <div className="mb-3 grid grid-cols-3 gap-2">{items.map(([value, label, Icon]) => <div key={label} className="rounded-md border border-slate-100 bg-slate-50 p-2"><Icon className="mb-1 h-3.5 w-3.5 text-emerald-600" /><strong className="text-sm text-[#14213d]">{value}</strong><p className="text-[8px] text-slate-500">{label}</p></div>)}</div>; }
function TableHeader({ labels }: { labels: string[] }) { return <div className="grid grid-cols-[1fr_70px_70px] bg-slate-50 px-3 py-2 text-[8px] font-bold uppercase text-slate-400">{labels.map(label => <span key={label}>{label}</span>)}</div>; }
function Empty({ text }: { text: string }) { return <p className="px-3 py-5 text-center text-[9px] text-slate-400">{text}</p>; }
