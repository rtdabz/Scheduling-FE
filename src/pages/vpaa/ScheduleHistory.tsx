import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CalendarDays, ChevronLeft, ChevronRight, History, List, RefreshCw, X } from 'lucide-react';
import api from '../../lib/api';
import WeeklyTimetableGrid, { WEEK_DAYS } from '../../components/scheduling/WeeklyTimetableGrid';
import { formatTime12h, slotCount, slotToTimeLabel, timeToSlot } from '../../lib/timeGrid';
import ScheduleCard from '../ClassSchedules/SchedulerPanel/TimetableGrid/ScheduleCard';
import Skeleton from '../../components/ui/Skeleton';
import type { DeliveryMode, ScheduleItem, Subject } from '../ClassSchedules/SchedulerPanel/types';

type Snapshot = { id: number; schedule_id: number | null; section_id: number | null; section_name?: string; course_code?: string; course_name?: string; course_category?: string | null; units?: number | null; lecture_hours?: number | null; lab_hours?: number | null; faculty_name?: string; room_name?: string; snapshot: Record<string, unknown> };
type Entry = { id: number; group_id?: string | null; schedule_id: number | null; term_id: number | null; section_id: number | null; course_id: number | null; department_id: number | null; schedule_label: string; schedule_count: number; section_count: number; snapshots: Snapshot[]; action: string; snapshot: Record<string, unknown>; actor: { name: string; username: string; role: string } | null; created_at: string };
type Response = { data: Entry[]; meta: { current_page: number; per_page: number; total: number; last_page: number; from: number | null; to: number | null } };

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const date = (value: string) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(value));
const value = (s: Record<string, unknown>, key: string) => String(s[key] ?? '');
const number = (s: Record<string, unknown>, key: string) => Number(s[key] ?? 0);
const mode = (v: string): DeliveryMode => v === 'online' || v === 'field' ? v : 'on-site';
const bool = (v: unknown) => v === true || v === 1 || v === '1';
const noop = () => undefined;
const location = (item: Snapshot): string => {
  const scheduleMode = mode(value(item.snapshot, 'mode'));
  if (scheduleMode === 'online') return 'ONLINE';
  if (scheduleMode === 'field') return 'FIELD';
  return item.room_name || 'Room TBA';
};

const gridCard = (item: Snapshot): { schedule: ScheduleItem; subject: Subject } => {
  const start = timeToSlot(value(item.snapshot, 'start_time'));
  const end = Math.max(start + 1, timeToSlot(value(item.snapshot, 'end_time')));
  const day = value(item.snapshot, 'day');
  const category = item.course_category === 'minor' ? 'minor' : 'major';
  const units = Number(item.units ?? 0);
  const courseId = String(number(item.snapshot, 'course_id') || item.schedule_id || item.id);
  return {
    schedule: { id: String(item.schedule_id ?? item.id), termId: number(item.snapshot, 'term_id'), departmentId: number(item.snapshot, 'department_id'), courseId, courseCode: item.course_code || 'Course', courseName: item.course_name || 'Untitled course', courseType: category, lectureUnits: Number(item.lecture_hours ?? 0), laboratoryUnits: Number(item.lab_hours ?? 0), totalUnits: units, sectionName: item.section_name || 'Section', roomName: item.room_name || 'Room TBA', day, startTime: formatTime12h(value(item.snapshot, 'start_time')), endTime: formatTime12h(value(item.snapshot, 'end_time')), mode: mode(value(item.snapshot, 'mode')), facultyName: item.faculty_name || null, facultyId: value(item.snapshot, 'faculty_id') || null, status: 'finalized', dayIndex: WEEK_DAYS.indexOf(day as typeof WEEK_DAYS[number]), startSlot: start, durationSlots: end - start, sectionId: String(item.section_id ?? number(item.snapshot, 'section_id')), roomId: value(item.snapshot, 'room_id'), isHybrid: bool(item.snapshot.is_hybrid) },
    subject: { id: courseId, code: item.course_code || 'Course', name: item.course_name || 'Untitled course', units, lectureHours: Number(item.lecture_hours ?? 0), labHours: Number(item.lab_hours ?? 0), category, semester: '1st', departmentId: number(item.snapshot, 'department_id') || null, yearLevel: 1, roomTypeRequired: 'lecture', status: 'active' },
  };
};

export default function ScheduleHistory() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [detailMode, setDetailMode] = useState<'list' | 'grid'>('list');
  const [sectionId, setSectionId] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState<Response['meta']>({ current_page: 1, per_page: 25, total: 0, last_page: 1, from: null, to: null });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await api.get<Response>('/schedule-history', { params: { page, per_page: 25 } }); setEntries(response.data.data); setMeta(response.data.meta); }
    catch (e: unknown) { setError(axios.isAxiosError<{ message?: string }>(e) ? e.response?.data?.message || 'Unable to load schedule history.' : 'Unable to load schedule history.'); }
    finally { setLoading(false); }
  }, [page]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const snapshots = useMemo(() => selected?.snapshots ?? [], [selected]);
  const sections = useMemo(() => Array.from(new Map(snapshots.map(item => [String(item.section_id ?? ''), item.section_name || 'Section'])).entries()), [snapshots]);
  const activeSectionId = sections.some(([id]) => id === sectionId) ? sectionId : sections[0]?.[0] ?? '';
  const cards = useMemo(() => snapshots.filter(item => String(item.section_id ?? '') === activeSectionId).map(gridCard), [activeSectionId, snapshots]);
  const open = (entry: Entry) => { setSelected(entry); setDetailMode('list'); setSectionId(''); };

  return <div className="space-y-5 pb-8">
    <div className="flex justify-end"><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {error ? <div role="alert" className="p-10 text-center text-sm font-semibold text-red-700">{error}</div> : loading ? <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading schedule history">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex items-center gap-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-24" /></div>)}</div> : entries.length === 0 ? <div className="p-12 text-center"><History className="mx-auto h-10 w-10 text-gray-300" /><p className="mt-3 font-semibold text-gray-700">No schedule history yet</p></div> : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm"><thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Date and time</th><th className="px-5 py-3">Action / status</th><th className="px-5 py-3">Schedule</th><th className="px-5 py-3">Actor</th></tr></thead><tbody className="divide-y divide-gray-100">{entries.map(entry => <tr key={entry.group_id || entry.id} onClick={() => open(entry)} className="cursor-pointer hover:bg-amber-50/40"><td className="whitespace-nowrap px-5 py-4 text-gray-600">{date(entry.created_at)}</td><td className="px-5 py-4 font-semibold text-gray-900">{label(entry.action)}</td><td className="px-5 py-4"><p className="font-semibold text-gray-900">{entry.schedule_label}</p><p className="text-xs text-gray-500">{entry.schedule_count} schedule{entry.schedule_count === 1 ? '' : 's'} · {entry.section_count} section{entry.section_count === 1 ? '' : 's'}</p></td><td className="px-5 py-4"><p className="font-medium text-gray-800">{entry.actor?.name || 'System'}</p><p className="text-xs uppercase text-gray-500">{entry.actor?.role || 'system'}</p></td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-600"><span>{meta.from !== null ? `${meta.from}-${meta.to} of ${meta.total}` : '0 entries'}</span><div className="flex items-center gap-2"><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)} className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>Page {meta.current_page} of {meta.last_page}</span><button aria-label="Next page" disabled={page >= meta.last_page || loading} onClick={() => setPage(v => v + 1)} className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></div>
    </div>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><div role="dialog" aria-modal="true" className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"><div className="flex shrink-0 items-start justify-between border-b border-gray-200 p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-[#5A1220]">{label(selected.action)}</p><h2 className="mt-1 text-xl font-bold text-gray-900">{selected.schedule_label}</h2><p className="mt-1 text-sm text-gray-500">{date(selected.created_at)} · {selected.schedule_count} related schedule{selected.schedule_count === 1 ? '' : 's'}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close details" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><div className="flex min-h-0 flex-1 flex-col gap-4 p-5"><div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-0.5"><button type="button" onClick={() => setDetailMode('list')} aria-pressed={detailMode === 'list'} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold ${detailMode === 'list' ? 'bg-[#4e0a10] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><List size={14} /> List View</button><button type="button" onClick={() => setDetailMode('grid')} aria-pressed={detailMode === 'grid'} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold ${detailMode === 'grid' ? 'bg-[#4e0a10] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}><CalendarDays size={14} /> Weekly Grid</button></div>{detailMode === 'grid' && sections.length > 1 && <select aria-label="Select section timetable" value={activeSectionId} onChange={e => setSectionId(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 sm:w-64">{sections.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>}</div>{detailMode === 'list' ? <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-gray-200"><table className="min-w-full text-xs"><thead className="sticky top-0 z-10 bg-gray-50 text-left font-bold uppercase text-gray-500"><tr><th className="px-3 py-2">Schedule</th><th className="px-3 py-2">Section</th><th className="px-3 py-2">Course</th><th className="px-3 py-2">Instructor</th><th className="px-3 py-2">Room</th></tr></thead><tbody className="divide-y divide-gray-100">{snapshots.map(item => <tr key={item.id}><td className="px-3 py-2">#{item.schedule_id ?? 'Deleted'}</td><td className="px-3 py-2">{item.section_name || `#${item.section_id ?? 'Unknown'}`}</td><td className="px-3 py-2">{item.course_code || 'Course'}<span className="block text-gray-500">{item.course_name || ''}</span></td><td className="px-3 py-2">{item.faculty_name || 'Unassigned'}</td><td className="px-3 py-2">{location(item)}</td></tr>)}</tbody></table></div> : cards.length === 0 ? <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">The selected history entry has no timetable snapshot for this section.</div> : <div className="min-h-0 flex-1 overflow-auto"><WeeklyTimetableGrid days={WEEK_DAYS} slotCount={slotCount()} slotHeight={28} minWidth={840} getTimeLabel={slotToTimeLabel} getDayCount={dayIndex => cards.filter(({ schedule }) => schedule.day === WEEK_DAYS[dayIndex]).length}>{cards.map(({ schedule, subject }) => <ScheduleCard key={schedule.id} rooms={[]} schedule={schedule} subject={subject} isEditable={false} isPhase2Active={false} currentStatus="finalized" draggedScheduleId={null} isMoving={false} deleteConfirmScheduleId={null} setDeleteConfirmScheduleId={noop} onDragStart={noop} onDragEnd={noop} onDelete={noop} onCardClick={noop} slotHeight={28} isWideView />)}</WeeklyTimetableGrid></div>}</div></div></div>}
  </div>;
}
