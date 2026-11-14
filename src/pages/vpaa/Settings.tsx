import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useBeforeUnload, useBlocker, useLocation, useSearchParams } from 'react-router-dom';
import { CalendarRange, CheckCircle2, Clock3, History, Save, Signature, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { useToast } from '../../context/ToastContext';
import DataTable from '../../components/ui/DataTable';
import Skeleton from '../../components/ui/Skeleton';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import api from '../../lib/api';
import { clearDataCache, getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { publishLiveTopics } from '../../lib/liveUpdates';
import { operatingHoursError, timeInputMinutes, toApiTime, toTimeInputValue } from '../../lib/operatingHours';
import { academicYearError, joinAcademicYear, splitAcademicYear } from '../../lib/academicYear';
import { normalizeInstitutionSettings, setCachedInstitutionSettings, type InstitutionSettings } from '../../lib/institutionSettings';
import { getStoredUserRole } from '../../lib/storedUser';
import { ARCHIVE_PARAM_PREFIX, ARCHIVED_VIEW_PARAM } from './archive/archiveTypes';

const ArchivePanel = lazy(() => import('./archive/ArchivePanel'));

interface Semester {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
  is_enabled: boolean;
  can_edit_academic_year?: boolean;
}
type SemesterPeriod = Semester['semester'];
interface ActivationHistoryEntry {
  id: string | number;
  semester: Semester['semester'] | null;
  academic_year: string | null;
  action: 'Activated' | 'Ended';
  changed_by: string | null;
  occurred_at: string | null;
  identity_recorded: boolean;
}
interface TimeslotSettings {
  opening_time: string;
  closing_time: string;
  field_end_time?: string;
  slot_interval: number;
}

const SEMESTER_LABELS: Record<Semester['semester'], string> = { '1st': '1st Semester', '2nd': '2nd Semester', summer: 'Summer' };
const SECTIONS = [
  { id: 'academic-semesters', label: 'Academic Semesters', icon: CalendarRange },
  { id: 'operating-hours', label: 'Operating Hours', icon: Clock3 },
  { id: 'document-signatories', label: 'Document Signatories', icon: Signature },
  { id: 'activation-history', label: 'Activation History', icon: History },
] as const;
const INPUT = 'h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:bg-parchment disabled:text-muted';
const PRIMARY = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-3 py-2 text-sm font-semibold text-primary hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50';
const apiMessage = (error: unknown, fallback: string) => (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
const yearError = (value: string) => /^\d{4}-\d{4}$/.test(value) ? academicYearError(splitAcademicYear(value)) : 'Enter two consecutive years, for example 2026-2027.';
const hoursDraftOf = (settings: TimeslotSettings) => ({
  opening_time: toTimeInputValue(settings.opening_time), closing_time: toTimeInputValue(settings.closing_time),
  field_end_time: toTimeInputValue(settings.field_end_time || settings.closing_time),
});

function SectionCard({ id, icon: Icon, title, description, children }: {
  id: string; icon: LucideIcon; title: string; description: string; children: ReactNode;
}) {
  return <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
    <header className="flex items-start gap-3 border-b border-border px-5 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon size={18} aria-hidden="true" /></span>
      <div><h2 id={`${id}-title`} className="font-sans text-base font-bold text-text">{title}</h2><p className="mt-1 text-sm text-muted">{description}</p></div>
    </header>{children}
  </section>;
}
function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="m-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
    <p>{message}</p><button type="button" className={SECONDARY} onClick={retry}>Retry</button>
  </div>;
}
function SaveFooter({ dirty, saving, disabled, label, discard, save }: {
  dirty: boolean; saving: boolean; disabled: boolean; label: string; discard: () => void; save: () => void;
}) {
  return <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-4">
    <span role="status" className="mr-auto text-sm text-muted">{dirty ? 'Unsaved changes' : 'No unsaved changes'}</span>
    {dirty && <button type="button" className={SECONDARY} disabled={saving} onClick={discard}>Discard changes</button>}
    <button type="button" className={PRIMARY} disabled={!dirty || disabled || saving} onClick={save}>
      {saving ? <LoadingSpinner className="h-4 w-4" /> : <Save size={16} aria-hidden="true" />}{saving ? 'Saving…' : label}
    </button>
  </footer>;
}

export default function Settings() {
  const { toast, confirm } = useToast();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const requestedSection = searchParams.get('section') || location.hash.slice(1);
  const section = SECTIONS.find(item => item.id === requestedSection)?.id || 'academic-semesters';
  const isVpaa = getStoredUserRole() === 'vpaa';
  const showArchived = isVpaa && searchParams.get(ARCHIVED_VIEW_PARAM) === '1' && section === 'academic-semesters';
  const cacheKey = 'page:settings';
  const cached = getCachedData<{ semesters: Semester[] }>(cacheKey);
  const [semesters, setSemesters] = useState<Semester[]>(cached?.semesters || []);
  const [yearDrafts, setYearDrafts] = useState<Record<number, string>>({});
  const [selectedPeriods, setSelectedPeriods] = useState<Partial<Record<SemesterPeriod, number>>>({});
  const [newYearDrafts, setNewYearDrafts] = useState<Partial<Record<SemesterPeriod, string>>>({});
  const [loadingSemesters, setLoadingSemesters] = useState(!hasCachedData(cacheKey));
  const [semesterError, setSemesterError] = useState<string | null>(null);
  const [semesterSaveError, setSemesterSaveError] = useState<string | null>(null);
  const [busySemester, setBusySemester] = useState<number | null>(null);
  const semesterWriteRef = useRef(false);
  const [hours, setHours] = useState<TimeslotSettings | null>(null);
  const [hoursDraft, setHoursDraft] = useState({ opening_time: '', closing_time: '', field_end_time: '' });
  const [loadingHours, setLoadingHours] = useState(true);
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [hoursSaveError, setHoursSaveError] = useState<string | null>(null);
  const [savingHours, setSavingHours] = useState(false);
  const hoursWriteRef = useRef(false);
  const [signatories, setSignatories] = useState<InstitutionSettings | null>(null);
  const [signatoryDraft, setSignatoryDraft] = useState<InstitutionSettings>({ president_name: '', president_title: '' });
  const [loadingSignatories, setLoadingSignatories] = useState(true);
  const [signatoryError, setSignatoryError] = useState<string | null>(null);
  const [signatorySaveError, setSignatorySaveError] = useState<string | null>(null);
  const [savingSignatory, setSavingSignatory] = useState(false);
  const signatoryWriteRef = useRef(false);
  const [history, setHistory] = useState<ActivationHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState('UTC');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const loadGeneration = useRef({ semesters: 0, hours: 0, signatories: 0, history: 0 });

  const sectionSearch = (id: string, archived = false) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', id);
    next.delete(ARCHIVED_VIEW_PARAM);
    [...next.keys()].filter(key => key.startsWith(ARCHIVE_PARAM_PREFIX)).forEach(key => next.delete(key));
    if (archived) next.set(ARCHIVED_VIEW_PARAM, '1');
    return `?${next.toString()}`;
  };
  const rememberSemesters = useCallback((next: Semester[]) => {
    setSemesters(next);
    setCachedData(cacheKey, { semesters: next });
  }, []);
  const fetchSemesters = useCallback(async (refresh = false) => {
    const generation = ++loadGeneration.current.semesters;
    setLoadingSemesters(true);
    setSemesterError(null);
    try {
      const data = await loadCachedData<{ semesters: Semester[] }>(cacheKey, async () => {
        const response = await api.get<Semester[]>('/semesters');
        return { semesters: response.data };
      }, refresh);
      if (generation === loadGeneration.current.semesters) setSemesters(data.semesters);
    } catch (error) { if (generation === loadGeneration.current.semesters) setSemesterError(apiMessage(error, 'Academic semesters could not be loaded.')); }
    finally { if (generation === loadGeneration.current.semesters) setLoadingSemesters(false); }
  }, []);
  const fetchHours = useCallback(async () => {
    const generation = ++loadGeneration.current.hours;
    setLoadingHours(true); setHoursError(null);
    try {
      const { data } = await api.get<{ settings: TimeslotSettings }>('/timeslots');
      if (generation !== loadGeneration.current.hours) return;
      setHours(data.settings); setHoursDraft(hoursDraftOf(data.settings));
    } catch (error) { if (generation === loadGeneration.current.hours) setHoursError(apiMessage(error, 'Operating hours could not be loaded.')); }
    finally { if (generation === loadGeneration.current.hours) setLoadingHours(false); }
  }, []);
  const fetchSignatories = useCallback(async () => {
    const generation = ++loadGeneration.current.signatories;
    setLoadingSignatories(true); setSignatoryError(null);
    try {
      // The print helper falls back to defaults; editable settings must report load failures.
      const { data } = await api.get<InstitutionSettings>('/institution-settings');
      if (generation !== loadGeneration.current.signatories) return;
      if (!data?.president_name?.trim() || !data?.president_title?.trim()) throw new Error('Missing signatory settings');
      const saved = normalizeInstitutionSettings(data);
      setSignatories(saved); setSignatoryDraft(saved); setCachedInstitutionSettings(saved);
    } catch (error) { if (generation === loadGeneration.current.signatories) setSignatoryError(apiMessage(error, 'Document signatories could not be loaded.')); }
    finally { if (generation === loadGeneration.current.signatories) setLoadingSignatories(false); }
  }, []);
  const fetchHistory = useCallback(async () => {
    const generation = ++loadGeneration.current.history;
    setLoadingHistory(true); setHistoryError(null);
    try {
      const response = await api.get<ActivationHistoryEntry[]>('/semesters/activation-history');
      if (generation !== loadGeneration.current.history) return;
      setHistory(response.data);
      setPagination(current => ({ ...current, pageIndex: 0 }));
      const configuredZone = response.headers?.['x-timezone'] || 'UTC';
      try { new Intl.DateTimeFormat('en', { timeZone: configuredZone }); setTimeZone(configuredZone); }
      catch { setTimeZone('UTC'); }
    } catch (error) { if (generation === loadGeneration.current.history) setHistoryError(apiMessage(error, 'Activation history could not be loaded.')); }
    finally { if (generation === loadGeneration.current.history) setLoadingHistory(false); }
  }, []);
  useEffect(() => {
    void fetchSemesters(); void fetchHours(); void fetchSignatories(); void fetchHistory();
    const generation = loadGeneration.current;
    return () => { generation.semesters++; generation.hours++; generation.signatories++; generation.history++; };
  }, [fetchSemesters, fetchHours, fetchSignatories, fetchHistory]);

  const activeSemester = semesters.find(item => item.is_active);
  const semesterCards = useMemo(() => (['1st', '2nd', 'summer'] as const).map(period => {
    const records = semesters.filter(item => item.semester === period).sort((a, b) => b.academic_year.localeCompare(a.academic_year));
    const semester = records.find(item => item.id === selectedPeriods[period]) || records.find(item => item.is_active) || records[0];
    return { period, records, semester };
  }), [semesters, selectedPeriods]);
  const yearsDirty = Object.keys(newYearDrafts).length > 0 || semesters.some(item => yearDrafts[item.id] !== undefined && yearDrafts[item.id] !== item.academic_year);
  const savedHoursDraft = hours ? hoursDraftOf(hours) : null;
  const hoursDirty = savedHoursDraft !== null && (Object.keys(hoursDraft) as (keyof typeof hoursDraft)[]).some(key => hoursDraft[key] !== savedHoursDraft[key]);
  const signatoryDirty = signatories !== null && (signatoryDraft.president_name.trim() !== signatories.president_name || signatoryDraft.president_title.trim() !== signatories.president_title);
  const signatoryComplete = !!signatoryDraft.president_name.trim() && !!signatoryDraft.president_title.trim();
  const dirty = yearsDirty || hoursDirty || signatoryDirty;
  const { state: blockerState, proceed, reset } = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blockerState !== 'blocked') return;
    let current = true;
    void confirm({ title: 'Discard unsaved changes?', message: 'You have unsaved Settings changes. Discard them to leave this page?', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', variant: 'warning' }).then(discard => {
      if (current) { if (discard) proceed(); else reset(); }
    });
    return () => { current = false; };
  }, [blockerState, proceed, reset, confirm]);
  useBeforeUnload(useCallback(event => {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
  }, [dirty]));

  const cancelNewYear = (period: SemesterPeriod) => setNewYearDrafts(current => {
    const next = { ...current }; delete next[period]; return next;
  });
  const prepareYear = (period: SemesterPeriod, semester?: Semester) => {
    const previous = semester?.academic_year || activeSemester?.academic_year;
    let start = previous ? Number(previous.slice(0, 4)) + 1 : new Date().getFullYear();
    while (semesters.some(item => item.semester === period && item.academic_year === `${start}-${start + 1}`)) start++;
    setNewYearDrafts(current => ({ ...current, [period]: `${start}-${start + 1}` }));
  };
  const createPeriod = async (period: SemesterPeriod) => {
    const academicYear = newYearDrafts[period] || '';
    if (semesterWriteRef.current || yearError(academicYear)) return;
    semesterWriteRef.current = true; setBusySemester(-1); setSemesterSaveError(null);
    try {
      const { data } = await api.post<{ semester: Semester }>('/semesters', { semester: period, academic_year: academicYear });
      clearDataCache();
      rememberSemesters([...semesters, data.semester]);
      setSelectedPeriods(current => ({ ...current, [period]: data.semester.id }));
      cancelNewYear(period);
      publishLiveTopics(['settings']);
      toast.success('Academic period created', `${SEMESTER_LABELS[period]} · AY ${academicYear}. The active semester has not changed.`);
    } catch (error) { setSemesterSaveError(apiMessage(error, 'The academic period could not be created.')); }
    finally { semesterWriteRef.current = false; setBusySemester(null); }
  };

  const saveAcademicYear = async (semester: Semester) => {
    const draft = yearDrafts[semester.id] ?? semester.academic_year;
    if (semesterWriteRef.current || yearError(draft) || draft === semester.academic_year) return;
    semesterWriteRef.current = true; setBusySemester(semester.id); setSemesterSaveError(null);
    try {
      const { data } = await api.patch<{ semester: Semester }>(`/semesters/${semester.id}`, { academic_year: joinAcademicYear(splitAcademicYear(draft)) });
      const saved = data.semester;
      rememberSemesters(semesters.map(item => item.id === saved.id ? saved : item));
      setYearDrafts(current => ({ ...current, [saved.id]: saved.academic_year }));
      publishLiveTopics(['settings']);
      toast.success('Academic year saved', `${SEMESTER_LABELS[saved.semester]} · AY ${saved.academic_year}`);
    } catch (error) { setSemesterSaveError(apiMessage(error, 'The academic year could not be saved.')); }
    finally { semesterWriteRef.current = false; setBusySemester(null); }
  };
  const toggleSummer = async (semester: Semester) => {
    if (semesterWriteRef.current || semester.is_active || activeSemester?.semester !== '2nd') return;
    semesterWriteRef.current = true; setBusySemester(semester.id); setSemesterSaveError(null);
    try {
      const { data } = await api.patch<{ semester: Semester }>(`/semesters/${semester.id}`, { is_enabled: !semester.is_enabled });
      rememberSemesters(semesters.map(item => item.id === semester.id ? data.semester : item));
      publishLiveTopics(['settings']);
      toast.success(data.semester.is_enabled ? 'Summer enabled' : 'Summer disabled', 'The active semester has not changed.');
    } catch (error) { setSemesterSaveError(apiMessage(error, 'Summer availability could not be saved.')); }
    finally { semesterWriteRef.current = false; setBusySemester(null); }
  };
  const activate = async (semester: Semester) => {
    if (semesterWriteRef.current || semester.is_active || (semester.semester === 'summer' && !semester.is_enabled)) return;
    semesterWriteRef.current = true; setBusySemester(semester.id); setSemesterSaveError(null);
    try {
      const from = activeSemester ? `${SEMESTER_LABELS[activeSemester.semester]} · AY ${activeSemester.academic_year}` : 'No active semester';
      const to = `${SEMESTER_LABELS[semester.semester]} · AY ${semester.academic_year}`;
      if (!await confirm({ title: 'Change active semester?', message: `From: ${from}\nTo: ${to}\n\nThis changes the current scheduling context. Existing schedules, sections, submissions, and Schedule History are retained.`, confirmLabel: 'Activate semester', cancelLabel: 'Cancel', variant: 'maroon' })) return;
      const { data } = await api.patch<{ semester: Semester }>(`/semesters/${semester.id}/activate`, {
        expected_active_semester_id: activeSemester?.id ?? null, expected_academic_year: semester.academic_year,
      });
      clearDataCache();
      rememberSemesters(semesters.map(item => item.id === semester.id ? data.semester : { ...item, is_active: false }));
      publishLiveTopics(['settings']);
      await Promise.all([fetchSemesters(true), fetchHistory()]);
      toast.success('Semester activated', `${to} is now active.`);
    } catch (error) {
      setSemesterSaveError(apiMessage(error, 'The semester could not be activated.'));
      if ((error as { response?: { status?: number } })?.response?.status === 409) await fetchSemesters(true);
    } finally { semesterWriteRef.current = false; setBusySemester(null); }
  };

  const hoursValidation = operatingHoursError(hoursDraft.opening_time, hoursDraft.closing_time, hoursDraft.field_end_time)
    || (!hoursDraft.field_end_time ? 'Choose a valid field class cutoff.' : null);
  const saveHours = async () => {
    if (!hours || !hoursDirty || hoursValidation || hoursWriteRef.current) return;
    hoursWriteRef.current = true; setSavingHours(true); setHoursSaveError(null);
    try {
      const { data } = await api.patch<{ settings: TimeslotSettings }>('/timeslots/settings', {
        opening_time: toApiTime(hoursDraft.opening_time), closing_time: toApiTime(hoursDraft.closing_time),
        field_end_time: toApiTime(hoursDraft.field_end_time), slot_interval: hours.slot_interval,
      });
      setHours(data.settings); setHoursDraft(hoursDraftOf(data.settings));
      publishLiveTopics(['settings']);
      toast.success('Operating hours saved', 'Schedule generation now uses the updated daily time range.');
    } catch (error) { setHoursSaveError(apiMessage(error, 'Operating hours could not be saved.')); }
    finally { hoursWriteRef.current = false; setSavingHours(false); }
  };
  const saveSignatories = async () => {
    if (!signatories || !signatoryDirty || !signatoryComplete || signatoryWriteRef.current) return;
    signatoryWriteRef.current = true; setSavingSignatory(true); setSignatorySaveError(null);
    try {
      const payload = { president_name: signatoryDraft.president_name.trim(), president_title: signatoryDraft.president_title.trim() };
      const { data } = await api.patch<{ settings: InstitutionSettings }>('/institution-settings', payload);
      const saved = normalizeInstitutionSettings(data.settings);
      setSignatories(saved); setSignatoryDraft(saved); setCachedInstitutionSettings(saved);
      toast.success('Signatory saved', 'New documents will use these details. Recorded signatories are unchanged.');
    } catch (error) { setSignatorySaveError(apiMessage(error, 'The signatory could not be saved.')); }
    finally { signatoryWriteRef.current = false; setSavingSignatory(false); }
  };

  const columns = useMemo<ColumnDef<ActivationHistoryEntry>[]>(() => [
    { accessorKey: 'semester', header: 'Semester', cell: info => <span className="font-semibold">{SEMESTER_LABELS[info.getValue() as Semester['semester']] || 'Not recorded'}</span> },
    { accessorKey: 'academic_year', header: 'Academic Year', cell: info => info.getValue() as string || 'Not recorded' },
    { accessorKey: 'action', header: 'Action', cell: info => <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${info.getValue() === 'Activated' ? 'bg-primary/10 text-primary' : 'bg-parchment text-muted'}`}>{info.getValue() as string}</span> },
    { accessorKey: 'changed_by', header: 'Changed By', cell: info => info.getValue() as string || 'Not recorded' },
    { accessorKey: 'occurred_at', header: 'Date & Time', cell: info => {
      const value = info.getValue() as string;
      if (!value || Number.isNaN(Date.parse(value))) return 'Not recorded';
      return <time dateTime={value}>{new Date(value).toLocaleString('en-US', { timeZone, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}</time>;
    } },
  ], [timeZone]);
  // TanStack owns a mutable table instance; keep this call outside compiler memoization.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: history, columns, state: { sorting, pagination }, onSortingChange: setSorting,
    onPaginationChange: setPagination, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel() });
  const opening = timeInputMinutes(hoursDraft.opening_time);
  const closing = timeInputMinutes(hoursDraft.closing_time);
  const cutoff = timeInputMinutes(hoursDraft.field_end_time);
  const previewValid = !!hours && !hoursValidation;
  const duration = previewValid ? closing! - opening! : 0;
  const durationLabel = `${Math.floor(duration / 60)}h${duration % 60 ? ` ${duration % 60}m` : ''}`;

  return <div id="settings-page" className="min-w-0 space-y-5 font-sans">
    <nav aria-label="Settings sections" className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface p-1.5 lg:grid-cols-4">
      {SECTIONS.map(({ id, label, icon: Icon }) => {
        const unsaved = id === 'academic-semesters' ? yearsDirty : id === 'operating-hours' ? hoursDirty : id === 'document-signatories' && signatoryDirty;
        return <Link key={id} to={sectionSearch(id)} aria-current={section === id ? 'page' : undefined}
          className={`selection-indicator flex min-h-12 min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${section === id ? '' : 'border-transparent text-muted hover:bg-parchment hover:text-primary'}`}>
          <Icon size={17} className="shrink-0" aria-hidden="true" /><span>{label}{unsaved && <span className="block text-xs font-normal text-stage-warnText">Unsaved changes</span>}</span>
        </Link>;
      })}
    </nav>

    {section === 'academic-semesters' && <SectionCard id="academic-semesters" icon={CalendarRange} title="Academic Semesters" description="Manage academic years and choose the current scheduling context.">
      {showArchived ? <div className="space-y-4 p-5">
        <Link className={SECONDARY} to={sectionSearch('academic-semesters')}>Back to academic semesters</Link>
        <Suspense fallback={<p role="status">Loading archived semesters…</p>}><ArchivePanel module="semesters" onRestored={() => void fetchSemesters(true)} /></Suspense>
      </div> : <>
        <div className="mx-5 mt-5 flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4">
          <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted">Current active semester</p>
            <p className="mt-1 text-base font-bold text-primary">{loadingSemesters ? 'Loading semesters…' : semesterError ? 'Semester status unavailable' : activeSemester ? `${SEMESTER_LABELS[activeSemester.semester]} · AY ${activeSemester.academic_year}` : 'No active semester'}</p>
            <p className="mt-1 text-sm text-muted">Changing the active semester retains existing schedules and Schedule History.</p>
          </div>
        </div>
        {semesterError ? <LoadError message={semesterError} retry={() => void fetchSemesters(true)} /> : <div className="grid gap-4 p-5 xl:grid-cols-3">
          {loadingSemesters ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-72 rounded-xl" />) : semesterCards.map(({ period, records, semester }) => {
            const label = SEMESTER_LABELS[period];
            const creating = newYearDrafts[period] !== undefined || !semester;
            const busy = busySemester !== null;
            if (creating) {
              const draft = newYearDrafts[period] || '';
              const duplicate = records.some(item => item.academic_year === draft);
              const error = duplicate ? 'This academic period already exists. Choose it from the saved academic years.' : yearError(draft);
              return <article key={period} aria-label={label} className="flex min-w-0 flex-col rounded-xl border border-t-4 border-border border-t-accent/60 p-4">
                <h3 className="font-sans text-base font-bold">{label}</h3><p className="mt-2 text-sm text-muted">Prepare a new academic period</p>
                <label htmlFor={`new-${period}-year`} className="mb-2 mt-4 text-sm font-semibold">Academic year</label>
                <input id={`new-${period}-year`} className={INPUT} aria-label={`${label} new academic year`} aria-describedby={`new-${period}-help`} aria-invalid={!!draft && !!error} value={draft} maxLength={9} placeholder="2026-2027" disabled={busy} onChange={event => setNewYearDrafts(current => ({ ...current, [period]: event.target.value.replace(/[–—]/g, '-') }))} />
                <p id={`new-${period}-help`} className={`mt-2 text-xs leading-5 ${draft && error ? 'text-red-700' : 'text-muted'}`}>{draft && error ? error : 'Existing academic periods and their schedules remain unchanged. The new period starts inactive.'}</p>
                {period === 'summer' && <p className="mt-2 text-xs leading-5 text-muted">New Summer periods start disabled. Enable Summer separately while 2nd Semester is active.</p>}
                <div className="mt-auto flex flex-wrap justify-end gap-2 pt-5">
                  {semester && <button type="button" className={SECONDARY} disabled={busy} onClick={() => cancelNewYear(period)}>Cancel</button>}
                  <button type="button" className={PRIMARY} disabled={!!error || busy} onClick={() => void createPeriod(period)}>{busy ? 'Creating…' : 'Create academic period'}</button>
                </div>
              </article>;
            }
            const draft = yearDrafts[semester.id] ?? semester.academic_year;
            const changed = draft !== semester.academic_year;
            const error = yearError(draft);
            const summer = semester.semester === 'summer';
            const editable = !semester.is_active && semester.can_edit_academic_year !== false;
            const offered = !summer || semester.is_enabled;
            const yearId = `semester-${semester.id}-year`;
            return <article key={period} aria-label={label} className={`flex min-w-0 flex-col rounded-xl border border-t-4 p-4 ${semester.is_active ? 'border-primary/20 border-t-primary bg-primary/[0.025]' : 'border-border border-t-accent/60 bg-white'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-sans text-base font-bold">{label}</h3><span className={`rounded-full px-2 py-1 text-xs font-semibold ${semester.is_active ? 'bg-primary/10 text-primary' : 'bg-parchment text-muted'}`}>{semester.is_active ? 'Active' : 'Inactive'}</span></div>
              <p className="mt-2 text-sm text-muted">AY {semester.academic_year}</p>
              {records.length > 1 && <label className="mt-4 block text-xs font-semibold text-muted">Saved academic years
                <select className={`${INPUT} mt-2`} aria-label={`${label} saved academic year`} value={semester.id} disabled={busy} onChange={event => setSelectedPeriods(current => ({ ...current, [period]: Number(event.target.value) }))}>
                  {records.map(item => <option key={item.id} value={item.id}>{item.academic_year}{item.is_active ? ' · Active' : ''}{yearDrafts[item.id] !== undefined && yearDrafts[item.id] !== item.academic_year ? ' · Unsaved changes' : ''}</option>)}
                </select>
              </label>}
              <label htmlFor={yearId} className="mb-1.5 mt-4 text-sm font-semibold">Academic year</label>
              <input id={yearId} type="text" value={draft} placeholder="2026-2027" maxLength={9} aria-label={`${label} academic year`} aria-invalid={changed && !!error} aria-describedby={`${yearId}-help`} disabled={!editable || busy}
                className={INPUT} onChange={event => setYearDrafts(current => ({ ...current, [semester.id]: event.target.value.replace(/[–—]/g, '-') }))} />
              <p id={`${yearId}-help`} className={`mt-2 text-xs leading-5 ${changed && error ? 'text-red-700' : 'text-muted'}`}>
                {!editable ? 'The academic year is locked to preserve this semester’s records.' : changed && error ? error : 'Two consecutive years, for example 2026-2027.'}
              </p>
              {changed && <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" disabled={busy} className={SECONDARY} onClick={() => setYearDrafts(current => ({ ...current, [semester.id]: semester.academic_year }))}>Discard changes</button>
                <button type="button" className={PRIMARY} disabled={!!error || busy || !editable} onClick={() => void saveAcademicYear(semester)}>Save academic year</button>
              </div>}
              {summer && <div className="mt-4 space-y-2 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">Enable Summer</span>
                  <button type="button" role="switch" aria-label="Enable Summer" aria-checked={semester.is_enabled} aria-describedby="summer-help" disabled={busy || semester.is_active || activeSemester?.semester !== '2nd'} onClick={() => void toggleSummer(semester)}
                    className={`flex h-11 w-14 shrink-0 items-center rounded-xl px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${semester.is_enabled ? 'bg-primary' : 'bg-border'}`}>
                    <span className={`h-6 w-6 rounded-full bg-white transition-transform ${semester.is_enabled ? 'translate-x-6' : ''}`} />
                  </button>
                </div>
                <p className="text-xs font-semibold text-muted">{semester.is_enabled ? 'Offered' : 'Not offered'}</p>
                <p id="summer-help" className="text-xs leading-5 text-muted">Enabling Summer makes it available for scheduling; it does not make it active. {semester.is_active ? 'Activate another semester before disabling Summer.' : activeSemester?.semester !== '2nd' ? 'Summer availability can be changed while 2nd Semester is active.' : ''}</p>
                {semester.is_active && !semester.is_enabled && <p role="alert" className="text-xs text-red-700">Summer is active but not enabled. Review this configuration.</p>}
              </div>}
              <div className="mt-auto pt-5">
                <button type="button" className={`${semester.is_active ? SECONDARY : PRIMARY} w-full`} disabled={semester.is_active || !offered || changed || !!error || busy} onClick={() => void activate(semester)}>
                  {busySemester === semester.id ? <LoadingSpinner className="h-4 w-4" /> : null}{semester.is_active ? 'Currently Active' : 'Set as Active'}
                </button>
                {!semester.is_active && (changed || !offered) && <p className="mt-2 text-xs text-muted">{changed ? 'Save the academic year before activating this semester.' : 'Enable Summer before setting it as active.'}</p>}
              </div>
              <button type="button" className="mt-3 min-h-11 rounded-lg px-2 py-2 text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" disabled={busy} onClick={() => prepareYear(period, semester)}>Prepare another academic year</button>
            </article>;
          })}
        </div>}
        {semesterSaveError && <p role="alert" className="mx-5 mb-5 text-sm text-red-700">{semesterSaveError}</p>}
        {isVpaa && <div className="border-t border-border px-5 py-3 text-right"><Link to={sectionSearch('academic-semesters', true)} className="rounded text-sm font-semibold text-muted underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">View archived semesters</Link></div>}
      </>}
    </SectionCard>}

    {section === 'operating-hours' && <SectionCard id="operating-hours" icon={Clock3} title="Institution Operating Hours" description="Define the daily scheduling window and the limit for field classes.">
      {loadingHours ? <div className="p-5" role="status"><Skeleton className="h-48 rounded-xl" /><span className="sr-only">Loading operating hours</span></div> : hoursError ? <LoadError message={hoursError} retry={() => void fetchHours()} /> : hours && <>
        <div className="space-y-5 p-5">
          <div className="grid gap-4 lg:grid-cols-3">
            {([
              ['opening_time', 'Opening time', 'Earliest time classes may begin.'],
              ['closing_time', 'Closing time', 'Latest time classes may finish.'],
              ['field_end_time', 'Field Class Cutoff', 'Only classes held on the field must finish by this time.'],
            ] as const).map(([key, label, help]) => {
              const invalid = !!hoursValidation && (key === 'field_end_time' ? /[Ff]ield/.test(hoursValidation) : !/[Ff]ield/.test(hoursValidation));
              return <div key={key}><label htmlFor={key} className="mb-2 block text-sm font-semibold">{label}</label>
                <input id={key} type="time" step={1800} value={hoursDraft[key]} disabled={savingHours} className={INPUT} aria-invalid={invalid} aria-describedby={`${key}-help${invalid ? ' hours-validation' : ''}`}
                  onChange={event => setHoursDraft(current => ({ ...current, [key]: event.target.value }))} />
                <p id={`${key}-help`} className="mt-2 text-xs leading-5 text-muted">{help}</p>
              </div>;
            })}
          </div>
          {hoursValidation && <p id="hours-validation" role="alert" className="flex items-center gap-2 text-sm text-red-700"><TriangleAlert size={16} aria-hidden="true" />{hoursValidation}</p>}
          <div className="rounded-xl border border-border bg-parchment/60 p-4">
            <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm"><p className="font-semibold text-primary">{previewValid ? `${durationLabel} scheduling window` : 'Choose valid hours to preview'}</p><span className="text-muted">{hoursDirty ? 'Unsaved preview' : 'Saved operating hours'}</span></div>
            <div role="img" aria-label={previewValid ? `Daily scheduling window: ${toApiTime(hoursDraft.opening_time)} to ${toApiTime(hoursDraft.closing_time)}` : 'Daily scheduling window unavailable'}>
              <div className="relative h-3 overflow-hidden rounded-full bg-border">
                {previewValid && <><div className="absolute inset-y-0 bg-primary" style={{ left: `${opening! / 1440 * 100}%`, width: `${duration / 1440 * 100}%` }} /><span className="absolute inset-y-0 w-1 bg-accent" style={{ left: `${cutoff! / 1440 * 100}%` }} /></>}
              </div>
            </div>
            {previewValid && <div className="mt-3 space-y-1 text-sm text-muted"><p>Classes: {toApiTime(hoursDraft.opening_time)}–{toApiTime(hoursDraft.closing_time)}.</p><p>Field classes: {toApiTime(hoursDraft.opening_time)}–{toApiTime(hoursDraft.field_end_time)}. <span className="font-semibold text-primary">Field cutoff: {toApiTime(hoursDraft.field_end_time)}</span></p>{cutoff === closing && <p>Field classes share the full operating window.</p>}</div>}
          </div>
          <p className="text-sm leading-6 text-muted">Updates apply to scheduling rules, conflict checks, and faculty availability. Existing classes are not automatically moved.</p>
          {hoursSaveError && <p role="alert" className="text-sm text-red-700">{hoursSaveError}</p>}
        </div>
        <SaveFooter dirty={hoursDirty} saving={savingHours} disabled={!!hoursValidation} label="Save operating hours" discard={() => { setHoursDraft(hoursDraftOf(hours)); setHoursSaveError(null); }} save={() => void saveHours()} />
      </>}
    </SectionCard>}

    {section === 'document-signatories' && <SectionCard id="document-signatories" icon={Signature} title="Document Signatories" description="Set the President’s details used on future documents.">
      {loadingSignatories ? <div className="p-5" role="status"><Skeleton className="h-48 rounded-xl" /><span className="sr-only">Loading document signatories</span></div> : signatoryError ? <LoadError message={signatoryError} retry={() => void fetchSignatories()} /> : signatories && <>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            {([['president_name', "President's Name"], ['president_title', 'Designation']] as const).map(([key, label]) => <div key={key}>
              <label htmlFor={key} className="mb-2 block text-sm font-semibold">{label}</label>
              <input id={key} value={signatoryDraft[key]} maxLength={150} disabled={savingSignatory} className={INPUT} aria-invalid={!signatoryDraft[key].trim()} aria-describedby={!signatoryDraft[key].trim() ? `${key}-error` : undefined} onChange={event => setSignatoryDraft(current => ({ ...current, [key]: event.target.value }))} />
              {!signatoryDraft[key].trim() && <p id={`${key}-error`} className="mt-2 text-xs text-red-700">{label} is required.</p>}
            </div>)}
            <p className="text-sm leading-6 text-muted">Updates apply to future documents that have not recorded a signatory. Previously recorded signatories remain unchanged.</p>
            {signatorySaveError && <p role="alert" className="text-sm text-red-700">{signatorySaveError}</p>}
          </div>
          <figure aria-label="Document signature preview" className="m-0 min-w-0 rounded-xl border border-border bg-parchment/60 p-4">
            <figcaption className="flex flex-wrap justify-between gap-2 text-sm text-muted"><span className="font-semibold">Document preview</span><span>{signatoryDirty ? 'Unsaved preview' : 'Saved signatory'}</span></figcaption>
            <div className="mt-4 rounded-lg border border-border bg-white px-5 py-6 text-center">
              <p className="text-sm text-muted">Approved by:</p><div className="mx-auto mt-8 max-w-sm border-t border-muted pt-2">
                <p className="break-words text-sm font-bold text-text">{signatoryDraft.president_name.trim() || "President's name"}</p>
                <p className="mt-1 break-words text-sm text-muted">{signatoryDraft.president_title.trim() || 'Designation'}</p>
              </div>
            </div>
          </figure>
        </div>
        <SaveFooter dirty={signatoryDirty} saving={savingSignatory} disabled={!signatoryComplete} label="Save signatory" discard={() => { setSignatoryDraft(signatories); setSignatorySaveError(null); }} save={() => void saveSignatories()} />
      </>}
    </SectionCard>}

    {section === 'activation-history' && <SectionCard id="activation-history" icon={History} title="Semester Activation History" description="A record of changes to the active academic semester.">
      <div className="space-y-2 px-5 py-4 text-sm text-muted"><p>“Ended” means the semester stopped being the active context. Its schedules are retained.</p><p>Times shown in {timeZone}. Missing legacy details are shown as “Not recorded”.</p></div>
      {historyError ? <LoadError message={historyError} retry={() => void fetchHistory()} /> : <DataTable table={table} isLoading={loadingHistory} ariaLabel="Semester activation history" scrollAriaLabel="Activation history table" scrollClassName="overflow-x-auto" tableClassName="min-w-[640px]" variant="embedded" density="compact" emptyTitle="No activation events recorded." emptyDescription="Setting a semester as active records the transition here." totalLabel="events" cellClassName={id => id === 'occurred_at' ? 'whitespace-nowrap' : ''} />}
    </SectionCard>}
  </div>;
}
