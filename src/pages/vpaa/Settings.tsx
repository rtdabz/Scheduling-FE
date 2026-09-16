import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToast } from '../../context/ToastContext';
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  Save,
  Signature,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import DataTable from '../../components/ui/DataTable';
import api from '../../lib/api';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { clearDataCache, getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
import { operatingHoursError, timeInputMinutes, toApiTime, toTimeInputValue } from '../../lib/operatingHours';
import {
  academicYearError,
  followingYear,
  isValidAcademicYear,
  joinAcademicYear,
  sanitizeYearInput,
  splitAcademicYear,
  type AcademicYearParts,
} from '../../lib/academicYear';
import {
  DEFAULT_INSTITUTION_SETTINGS,
  fetchInstitutionSettings,
  normalizeInstitutionSettings,
  setCachedInstitutionSettings,
  type InstitutionSettings,
} from '../../lib/institutionSettings';

interface Semester {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
  is_enabled: boolean;
}

interface ApiSemester {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ActivationHistoryEntry {
  id: number;
  semester: '1st' | '2nd' | 'summer';
  academic_year: string;
  is_active: boolean;
  activatedAt: string;
}

interface ApiActivationHistoryEntry {
  id: number;
  semester_id: number;
  semester: Semester['semester'];
  academic_year: string;
  is_active: boolean;
  activated_at: string;
}

interface SettingsPageData {
  semesters: Semester[];
}

interface TimeslotSettings {
  opening_time: string;
  closing_time: string;
  slot_interval: number;
}

interface TimeslotResponse {
  settings: TimeslotSettings;
}

const SEMESTER_LABELS: Record<Semester['semester'], string> = {
  '1st': '1st Semester',
  '2nd': '2nd Semester',
  summer: 'Summer',
};

const mapApiSemester = (t: ApiSemester): Semester => ({
  id: t.id,
  academic_year: t.academic_year,
  semester: t.semester,
  is_active: !!t.is_active,
  is_enabled: t.is_enabled !== undefined ? !!t.is_enabled : true
});

/** Server-supplied reasons beat generic copy, so surface them when present. */
const apiMessage = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: { message?: string } } })?.response?.data;
  return typeof data?.message === 'string' && data.message ? data.message : fallback;
};

function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  aside,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm target:border-[#C9952A]">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/10 text-[#4e0a10]">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="font-sans text-sm font-bold text-slate-800">{title}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{description}</p>
          </div>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

export default function Settings() {
  const { toast, confirm } = useToast();
  const settingsCacheKey = 'page:settings';
  const cachedSettingsData = getCachedData<SettingsPageData>(settingsCacheKey);
  const [semesters, setSemesters] = useState<Semester[]>(cachedSettingsData?.semesters ?? []);
  const [history, setHistory] = useState<ActivationHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(!hasCachedData(settingsCacheKey));

  // Academic years are stored joined but edited as two fields, so the draft
  // halves live beside the semesters until they are saved.
  const [yearDrafts, setYearDrafts] = useState<Record<number, AcademicYearParts>>({});
  const [savingYearId, setSavingYearId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [signatories, setSignatories] = useState<InstitutionSettings>(DEFAULT_INSTITUTION_SETTINGS);
  const [signatoryDraft, setSignatoryDraft] = useState<InstitutionSettings>(DEFAULT_INSTITUTION_SETTINGS);
  const [isSavingSignatory, setIsSavingSignatory] = useState(false);
  const [operatingHours, setOperatingHours] = useState<TimeslotSettings | null>(null);
  const [operatingHoursDraft, setOperatingHoursDraft] = useState({ opening_time: '', closing_time: '' });
  const [isLoadingOperatingHours, setIsLoadingOperatingHours] = useState(true);
  const [isSavingOperatingHours, setIsSavingOperatingHours] = useState(false);
  // State-driven disabled props update after a render. These synchronous
  // guards also reject a second click that arrives in the same event loop.
  const savingYearIdsRef = useRef(new Set<number>());
  const togglingIdsRef = useRef(new Set<number>());
  const activatingRef = useRef(false);
  const savingSignatoryRef = useRef(false);
  const savingOperatingHoursRef = useRef(false);

  // Table States
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10
  });

  // Modal states

  const rememberSemesters = useCallback((next: Semester[]) => {
    setCachedData<SettingsPageData>(settingsCacheKey, { semesters: next });
    return next;
  }, [settingsCacheKey]);

  const fetchSemesters = useCallback(async (forceRefresh = false) => {
    setIsLoading(forceRefresh || !hasCachedData(settingsCacheKey));
    try {
      const data = await loadCachedData<SettingsPageData>(settingsCacheKey, async () => {
        const semestersRes = await api.get<ApiSemester[]>('/semesters');
        return {
          semesters: semestersRes.data ? semestersRes.data.map(mapApiSemester) : [],
        };
      }, forceRefresh);
      setSemesters(data.semesters);
      setYearDrafts(Object.fromEntries(data.semesters.map(t => [t.id, splitAcademicYear(t.academic_year)])));
    } catch {
      toast.error('Error', 'Failed to load settings data.');
    } finally {
      setIsLoading(false);
    }
  }, [settingsCacheKey, toast]);

  const fetchActivationHistory = useCallback(async () => {
    try {
      const { data } = await api.get<ApiActivationHistoryEntry[]>('/semesters/activation-history');
      setHistory((data ?? []).map(entry => ({
        id: entry.id,
        semester: entry.semester,
        academic_year: entry.academic_year,
        is_active: entry.is_active,
        activatedAt: new Date(entry.activated_at).toLocaleString(),
      })));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    fetchSemesters();
    fetchActivationHistory();
  }, [fetchSemesters, fetchActivationHistory]);

  useEffect(() => {
    let active = true;
    fetchInstitutionSettings().then(loaded => {
      if (!active) return;
      setSignatories(loaded);
      setSignatoryDraft(loaded);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;

    api.get<TimeslotResponse>('/timeslots')
      .then(({ data }) => {
        if (!active) return;
        setOperatingHours(data.settings);
        setOperatingHoursDraft({
          opening_time: toTimeInputValue(data.settings.opening_time),
          closing_time: toTimeInputValue(data.settings.closing_time),
        });
      })
      .catch((error) => toast.error('Error', apiMessage(error, 'Failed to load operating hours.')))
      .finally(() => {
        if (active) setIsLoadingOperatingHours(false);
      });

    return () => { active = false; };
  }, [toast]);

  const activePeriod = useMemo(() => semesters.find(t => t.is_active)?.semester, [semesters]);
  const isSummerToggleEnabled = activePeriod === '2nd';

  // Summer is not offered alongside a 1st semester.
  useEffect(() => {
    if (activePeriod !== '1st') return;
    setSemesters(prev => {
      if (!prev.some(t => t.semester === 'summer' && t.is_enabled)) return prev;
      return rememberSemesters(prev.map(t => (
        t.semester === 'summer' && t.is_enabled ? { ...t, is_enabled: false } : t
      )));
    });
  }, [activePeriod, rememberSemesters]);

  const draftFor = useCallback(
    (semester: Semester): AcademicYearParts => yearDrafts[semester.id] ?? splitAcademicYear(semester.academic_year),
    [yearDrafts],
  );

  /** Typing a complete starting year fills the end year in, still editable. */
  const handleStartYearChange = (semester: Semester, value: string) => {
    const start = sanitizeYearInput(value);
    setYearDrafts(prev => {
      const current = prev[semester.id] ?? splitAcademicYear(semester.academic_year);
      const next = followingYear(start);
      return { ...prev, [semester.id]: { start, end: next || (start ? current.end : '') } };
    });
  };

  const handleEndYearChange = (semester: Semester, value: string) => {
    setYearDrafts(prev => {
      const current = prev[semester.id] ?? splitAcademicYear(semester.academic_year);
      return { ...prev, [semester.id]: { ...current, end: sanitizeYearInput(value) } };
    });
  };

  const saveAcademicYear = async (semester: Semester) => {
    const draft = draftFor(semester);
    const joined = joinAcademicYear(draft);
    if (!isValidAcademicYear(draft) || !joined) return;
    if (savingYearIdsRef.current.has(semester.id)) return;

    savingYearIdsRef.current.add(semester.id);
    setSavingYearId(semester.id);
    try {
      const { data } = await api.patch<{ semester: ApiSemester }>(`/semesters/${semester.id}`, { academic_year: joined });
      const saved = data?.semester ? mapApiSemester(data.semester) : { ...semester, academic_year: joined };
      setSemesters(prev => rememberSemesters(prev.map(t => (t.id === semester.id ? { ...t, ...saved } : t))));
      setYearDrafts(prev => ({ ...prev, [semester.id]: splitAcademicYear(saved.academic_year) }));
      toast.success('Saved', `${SEMESTER_LABELS[semester.semester]} now covers ${joined}.`);
    } catch (error) {
      toast.error('Not saved', apiMessage(error, 'Failed to update the academic year.'));
    } finally {
      savingYearIdsRef.current.delete(semester.id);
      setSavingYearId(null);
    }
  };

  const handleToggleEnabled = async (semester: Semester, enabled: boolean) => {
    if (togglingIdsRef.current.has(semester.id)) return;
    togglingIdsRef.current.add(semester.id);
    setTogglingId(semester.id);
    try {
      await api.patch(`/semesters/${semester.id}`, { is_enabled: enabled });
      setSemesters(prev => rememberSemesters(prev.map(t => (t.id === semester.id ? { ...t, is_enabled: enabled } : t))));
      toast.success(enabled ? 'Summer enabled' : 'Summer disabled', enabled
        ? 'Summer semester is now offered this academic year.'
        : 'Summer semester will not be offered this academic year.');
    } catch (error) {
      toast.error('Not saved', apiMessage(error, 'Failed to update the summer semester.'));
    } finally {
      togglingIdsRef.current.delete(semester.id);
      setTogglingId(null);
    }
  };

  const handleActivateClick = async (id: number) => {
    const confirmed = await confirm({
      title: 'Activate Academic Semester',
      message: 'Are you sure you want to activate this academic semester? This will set all other semesters to inactive and apply this semester system-wide.',
      eyebrow: 'Confirmation Required',
      confirmLabel: 'Confirm Activate',
      variant: 'maroon',
    });
    if (!confirmed) return;

    // The dialog is gone by now, so this ref is what stops a second activation
    // from overlapping the first.
    if (activatingRef.current) return;
    activatingRef.current = true;
    try {
      await api.patch<{ semester: ApiSemester }>(`/semesters/${id}/activate`);

      // The active semester scopes scheduler sections, courses, and schedules.
      // Discard snapshots created for the previous semester before navigating back.
      clearDataCache();
      setSemesters(prev => rememberSemesters(prev.map(t => ({ ...t, is_active: t.id === id }))));

      await fetchActivationHistory();

      toast.success('Activated', 'Academic semester is now active');
    } catch (error) {
      toast.error('Error', apiMessage(error, 'Failed to activate academic semester'));
    } finally {
      activatingRef.current = false;
    }
  };

  const signatoryDirty =
    signatoryDraft.president_name.trim() !== signatories.president_name ||
    signatoryDraft.president_title.trim() !== signatories.president_title;
  const signatoryComplete =
    signatoryDraft.president_name.trim().length > 0 && signatoryDraft.president_title.trim().length > 0;

  const saveSignatories = async () => {
    if (!signatoryDirty || !signatoryComplete) return;
    if (savingSignatoryRef.current) return;

    savingSignatoryRef.current = true;
    setIsSavingSignatory(true);
    try {
      const payload = {
        president_name: signatoryDraft.president_name.trim(),
        president_title: signatoryDraft.president_title.trim(),
      };
      const { data } = await api.patch<{ settings: InstitutionSettings }>('/institution-settings', payload);
      const saved = normalizeInstitutionSettings(data?.settings ?? payload);
      setSignatories(saved);
      setSignatoryDraft(saved);
      setCachedInstitutionSettings(saved);
      toast.success('Saved', 'Printed schedules and teaching loads will use the new name.');
    } catch (error) {
      toast.error('Not saved', apiMessage(error, 'Failed to update the signatory.'));
    } finally {
      savingSignatoryRef.current = false;
      setIsSavingSignatory(false);
    }
  };

  const saveOperatingHours = async () => {
    if (!operatingHours) return;
    if (savingOperatingHoursRef.current) return;

    const validationError = operatingHoursError(
      operatingHoursDraft.opening_time,
      operatingHoursDraft.closing_time,
    );
    if (validationError) {
      toast.error('Invalid operating hours', validationError);
      return;
    }

    savingOperatingHoursRef.current = true;
    setIsSavingOperatingHours(true);
    try {
      const { data } = await api.patch<TimeslotResponse>('/timeslots/settings', {
        opening_time: toApiTime(operatingHoursDraft.opening_time),
        closing_time: toApiTime(operatingHoursDraft.closing_time),
        slot_interval: operatingHours.slot_interval,
      });
      setOperatingHours(data.settings);
      setOperatingHoursDraft({
        opening_time: toTimeInputValue(data.settings.opening_time),
        closing_time: toTimeInputValue(data.settings.closing_time),
      });
      toast.success('Operating hours saved', 'Schedule generation now uses the updated daily time range.');
    } catch (error) {
      toast.error('Not saved', apiMessage(error, 'Failed to update operating hours.'));
    } finally {
      savingOperatingHoursRef.current = false;
      setIsSavingOperatingHours(false);
    }
  };

  const savedOperatingHoursDraft = operatingHours ? {
    opening_time: toTimeInputValue(operatingHours.opening_time),
    closing_time: toTimeInputValue(operatingHours.closing_time),
  } : null;
  const operatingHoursDirty = savedOperatingHoursDraft !== null && (
    operatingHoursDraft.opening_time !== savedOperatingHoursDraft.opening_time
    || operatingHoursDraft.closing_time !== savedOperatingHoursDraft.closing_time
  );
  const operatingHoursValidationError = operatingHoursError(
    operatingHoursDraft.opening_time,
    operatingHoursDraft.closing_time,
  );

  const sortedSemesters = useMemo(() => {
    const semesterOrder = { '1st': 1, '2nd': 2, 'summer': 3 };
    return [...semesters].sort((a, b) => semesterOrder[a.semester] - semesterOrder[b.semester]);
  }, [semesters]);

  const activeSemester = semesters.find(semester => semester.is_active);
  const openingMinutes = timeInputMinutes(operatingHoursDraft.opening_time);
  const closingMinutes = timeInputMinutes(operatingHoursDraft.closing_time);
  const hoursPreviewValid = !isLoadingOperatingHours && operatingHours !== null && !operatingHoursValidationError;
  const dailyMinutes = hoursPreviewValid ? closingMinutes! - openingMinutes! : 0;
  const durationLabel = `${Math.floor(dailyMinutes / 60)}h${dailyMinutes % 60 ? ` ${dailyMinutes % 60}m` : ''}`;
  const settingsSections = [
    { id: 'academic-semesters', label: 'Academic semesters', icon: CalendarRange, detail: activeSemester ? SEMESTER_LABELS[activeSemester.semester] : isLoading ? 'Loading semesters' : 'No active semester' },
    { id: 'operating-hours', label: 'Operating hours', icon: Clock3, detail: 'Daily scheduling window' },
    { id: 'document-signatories', label: 'Document signatories', icon: Signature, detail: 'Printed approval details' },
    { id: 'activation-history', label: 'Activation history', icon: History, detail: 'Semester changes' },
  ];

  const columns = useMemo<ColumnDef<ActivationHistoryEntry>[]>(
    () => [
      {
        accessorKey: 'semester',
        header: 'Semester',
        cell: info => (
          <span className="font-semibold text-gray-700">{SEMESTER_LABELS[info.getValue() as Semester['semester']]}</span>
        )
      },
      {
        accessorKey: 'academic_year',
        header: 'Academic Year',
        cell: info => <span className="font-mono text-sm font-bold text-gray-800">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: info => (info.getValue() as boolean) ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-500">
            End
          </span>
        )
      },
      {
        accessorKey: 'activatedAt',
        header: 'Date Activated',
        cell: info => <span className="text-sm text-gray-600">{info.getValue() as string}</span>
      }
    ],
    []
  );

  const table = useReactTable<ActivationHistoryEntry>({
    data: history,
    columns,
    state: {
      sorting,
      pagination
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  return (
    <div id="settings-page" className="grid items-start gap-4 font-sans xl:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-2 sm:grid-cols-4 xl:sticky xl:top-4 xl:grid-cols-1">
        {settingsSections.map(({ id, label, icon: Icon, detail }) => (
          <a key={id} href={`#${id}`} className="group flex min-w-0 items-start gap-2.5 rounded-xl p-2.5 transition-colors hover:bg-[#5A1220]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#5A1220]" aria-hidden="true" />
            <span className="min-w-0"><span className="block text-xs font-bold text-slate-700 group-hover:text-[#5A1220]">{label}</span><span className="mt-1 hidden text-[11px] leading-snug text-slate-500 xl:block">{detail}</span></span>
          </a>
        ))}
      </nav>
      <div className="min-w-0 space-y-4">
      <SectionCard
        id="academic-semesters"
        icon={CalendarRange}
        title="Academic Semesters"
        description="Manage academic years and the semester used across the institution."
        aside={
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${activeSemester ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {activeSemester && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {activeSemester ? `AY ${activeSemester.academic_year}` : isLoading ? 'Loading…' : 'No active semester'}
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          {isLoading && semesters.length === 0 ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={`card-skeleton-${index}`} className="h-64 animate-pulse rounded-2xl border border-slate-200/70 bg-slate-50" />
            ))
          ) : sortedSemesters.length === 0 ? (
            <p className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">No academic semesters available.</p>
          ) : sortedSemesters.map(semester => {
            const isSummer = semester.semester === 'summer';
            const isCardDisabled = isSummer && !semester.is_enabled;
            const draft = draftFor(semester);
            const error = academicYearError(draft);
            const joined = joinAcademicYear(draft);
            const isDirty = joined !== semester.academic_year;
            const canSave = isDirty && isValidAcademicYear(draft);
            const isSaving = savingYearId === semester.id;

            return (
              <article
                key={semester.id}
                className={`relative flex flex-col justify-between rounded-xl border border-t-4 p-4 transition-colors ${
                  isCardDisabled
                    ? 'border-gray-200/60 bg-gray-50/80'
                    : semester.is_active
                    ? 'border-[#5A1220]/20 border-t-[#5A1220] bg-[#5A1220]/[0.03]'
                    : 'border-slate-200 border-t-[#C9952A]/60 bg-white'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-sans text-base font-bold text-slate-800">{SEMESTER_LABELS[semester.semester]}</h3>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${semester.is_active && !isCardDisabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className={`text-[11px] font-bold ${semester.is_active && !isCardDisabled ? 'text-green-700' : 'text-gray-400'}`}>
                          {semester.is_active && !isCardDisabled ? 'Active' : isCardDisabled ? 'Not offered' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    {isSummer && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={semester.is_enabled}
                        aria-label="Offer Summer semester"
                        onClick={() => handleToggleEnabled(semester, !semester.is_enabled)}
                        disabled={!isSummerToggleEnabled || togglingId === semester.id}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          !isSummerToggleEnabled || togglingId === semester.id
                            ? 'cursor-not-allowed bg-gray-200 opacity-50'
                            : semester.is_enabled
                            ? 'cursor-pointer bg-[#4e0a10]'
                            : 'cursor-pointer bg-gray-300'
                        }`}
                        title={
                          !isSummerToggleEnabled
                            ? 'Summer semester can only be managed when 2nd Semester is active'
                            : semester.is_enabled
                            ? 'Disable Summer'
                            : 'Enable Summer'
                        }
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            semester.is_enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    )}
                  </div>

                  {/* Academic year: one field per year rather than a YYYY-YYYY string. */}
                  <div>
                    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Academic Year
                    </span>
                    <div className="flex items-end gap-2">
                      <label className="min-w-0 flex-1">
                        <span className="mb-1 block text-[10px] font-semibold text-gray-400">Starting year</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={draft.start}
                          onChange={e => handleStartYearChange(semester, e.target.value)}
                          disabled={isCardDisabled}
                          placeholder="2026"
                          aria-label={`${SEMESTER_LABELS[semester.semester]} starting year`}
                          className={`w-full rounded-xl border bg-white px-3 py-2 text-center font-mono text-sm outline-none transition-all ${
                            isCardDisabled
                              ? 'cursor-not-allowed border-gray-200 bg-gray-100/50 text-gray-400'
                              : error
                              ? 'border-red-400 text-red-700 focus:ring-2 focus:ring-red-400'
                              : 'border-gray-200 focus:ring-2 focus:ring-[#C9952A]'
                          }`}
                        />
                      </label>
                      <ArrowRight className="mb-2.5 h-3.5 w-3.5 shrink-0 text-gray-300" />
                      <label className="min-w-0 flex-1">
                        <span className="mb-1 block text-[10px] font-semibold text-gray-400">End year</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          value={draft.end}
                          onChange={e => handleEndYearChange(semester, e.target.value)}
                          disabled={isCardDisabled}
                          placeholder="2027"
                          aria-label={`${SEMESTER_LABELS[semester.semester]} end year`}
                          className={`w-full rounded-xl border bg-white px-3 py-2 text-center font-mono text-sm outline-none transition-all ${
                            isCardDisabled
                              ? 'cursor-not-allowed border-gray-200 bg-gray-100/50 text-gray-400'
                              : error
                              ? 'border-red-400 text-red-700 focus:ring-2 focus:ring-red-400'
                              : 'border-gray-200 focus:ring-2 focus:ring-[#C9952A]'
                          }`}
                        />
                      </label>
                    </div>
                    {error ? (
                      <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-red-500">
                        <TriangleAlert className="h-3 w-3" />{error}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[10px] text-gray-400">
                        {isDirty ? 'Unsaved change.' : 'Two consecutive years, e.g. 2026 → 2027.'}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t border-gray-200/70 pt-3">
                  {canSave && (
                    <button
                      type="button"
                      onClick={() => saveAcademicYear(semester)}
                      disabled={isSaving}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#4e0a10] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#C9952A] disabled:opacity-60"
                    >
                      {isSaving ? <LoadingSpinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                      {isSaving ? 'Saving' : 'Save academic year'}
                    </button>
                  )}

                  {isCardDisabled ? (
                    <p className="py-2 text-xs italic text-gray-500">Summer semester not offered this year</p>
                  ) : semester.is_active ? (
                    <button
                      type="button"
                      disabled
                      className="w-full cursor-not-allowed rounded-xl border border-[#4e0a10]/30 bg-[#4e0a10]/10 py-2 text-xs font-semibold text-[#4e0a10]"
                    >
                      Currently Active
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!isValidAcademicYear(draft) || isDirty}
                      onClick={() => { void handleActivateClick(semester.id); }}
                      title={isDirty ? 'Save the academic year before activating this semester' : undefined}
                      className={`w-full rounded-xl border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700 transition-colors ${
                        !isValidAcademicYear(draft) || isDirty
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      Set as Active
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        id="operating-hours"
        icon={Clock3}
        title="Institution Operating Hours"
        description="Define when classes can run during the day."
        aside={operatingHours && (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${operatingHoursDirty ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
            {operatingHoursDirty ? 'Unsaved changes' : 'Saved'}
          </span>
        )}
      >
        <div className="mx-4 mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-700">Daily hours preview</p>
            <span className="text-xs font-semibold text-[#5A1220]">{hoursPreviewValid ? `${durationLabel} scheduling window` : isLoadingOperatingHours ? 'Loading hours…' : 'Choose valid hours to preview'}</span>
          </div>
          <div role="img" aria-label={hoursPreviewValid ? `Daily scheduling window: ${toApiTime(operatingHoursDraft.opening_time)} to ${toApiTime(operatingHoursDraft.closing_time)}` : 'Daily scheduling window unavailable'}>
            <div className="relative h-10 overflow-hidden rounded-lg bg-slate-200/80">
              {hoursPreviewValid && <div className="absolute inset-y-0 rounded-lg bg-[#5A1220]" style={{ left: `${openingMinutes! / 1440 * 100}%`, width: `${dailyMinutes / 1440 * 100}%` }} />}
              {[6, 12, 18].map(hour => <span key={hour} className="absolute inset-y-0 border-l border-white/50" style={{ left: `${hour / 24 * 100}%` }} />)}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-semibold text-slate-500"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div>
          </div>
          {hoursPreviewValid && <p className="mt-3 flex items-center gap-2 text-xs text-slate-600"><span className="h-2 w-2 rounded-full bg-[#5A1220]" />{toApiTime(operatingHoursDraft.opening_time)} – {toApiTime(operatingHoursDraft.closing_time)}<span className="ml-auto text-[11px] text-slate-500">{operatingHoursDirty ? 'Preview of unsaved hours' : 'Current operating hours'}</span></p>}
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Opening time</span>
            <input
              type="time"
              step={1800}
              value={operatingHoursDraft.opening_time}
              onChange={event => setOperatingHoursDraft(current => ({ ...current, opening_time: event.target.value }))}
              disabled={isLoadingOperatingHours || isSavingOperatingHours}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 outline-none transition-all focus:ring-2 focus:ring-[#C9952A] disabled:cursor-not-allowed disabled:bg-gray-100"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Closing time</span>
            <input
              type="time"
              step={1800}
              value={operatingHoursDraft.closing_time}
              onChange={event => setOperatingHoursDraft(current => ({ ...current, closing_time: event.target.value }))}
              disabled={isLoadingOperatingHours || isSavingOperatingHours}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 outline-none transition-all focus:ring-2 focus:ring-[#C9952A] disabled:cursor-not-allowed disabled:bg-gray-100"
            />
          </label>
          <p className="text-xs leading-5 text-gray-500 sm:col-span-2">
            Changes apply to schedule generation, conflict checks, and faculty availability. Course-specific start-time overrides still apply.
          </p>
          {operatingHoursValidationError && !isLoadingOperatingHours && (
            <p className="flex items-center gap-1 text-xs font-semibold text-red-600 sm:col-span-2">
              <TriangleAlert className="h-3.5 w-3.5" />
              {operatingHoursValidationError}
            </p>
          )}
          <button
            type="button"
            onClick={saveOperatingHours}
            disabled={!operatingHoursDirty || !!operatingHoursValidationError || isLoadingOperatingHours || isSavingOperatingHours}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4e0a10] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#C9952A] disabled:cursor-not-allowed disabled:opacity-50 sm:col-start-2 sm:justify-self-end"
          >
            {isSavingOperatingHours ? <LoadingSpinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {isSavingOperatingHours ? 'Saving' : 'Save operating hours'}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        id="document-signatories"
        icon={Signature}
        title="Document Signatories"
        description="Set the approval name and designation used on printed documents."
        aside={<span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${signatoryDirty ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{signatoryDirty ? 'Unsaved changes' : 'Print settings'}</span>}
      >
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                President's name
              </span>
              <input
                type="text"
                value={signatoryDraft.president_name}
                onChange={e => setSignatoryDraft(prev => ({ ...prev, president_name: e.target.value }))}
                maxLength={150}
                placeholder="ATTY. NADYA B. EMANO-ELIPE"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm uppercase outline-none transition-all focus:ring-2 focus:ring-[#C9952A]"
              />
              <span className="mt-1 block text-[10px] text-gray-400">
                Printed above the signature line, exactly as typed.
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Designation
              </span>
              <input
                type="text"
                value={signatoryDraft.president_title}
                onChange={e => setSignatoryDraft(prev => ({ ...prev, president_title: e.target.value }))}
                maxLength={150}
                placeholder="OIC-College President"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-[#C9952A]"
              />
              <span className="mt-1 block text-[10px] text-gray-400">
                Drop "OIC-" once the appointment is permanent.
              </span>
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={saveSignatories}
                disabled={!signatoryDirty || !signatoryComplete || isSavingSignatory}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#4e0a10] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#C9952A] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSavingSignatory ? <LoadingSpinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {isSavingSignatory ? 'Saving' : 'Save signatory'}
              </button>
              {signatoryDirty && !isSavingSignatory && (
                <button
                  type="button"
                  onClick={() => setSignatoryDraft(signatories)}
                  className="text-[11px] font-semibold text-gray-500 transition-colors hover:text-[#4e0a10]"
                >
                  Discard
                </button>
              )}
              {!signatoryComplete && (
                <span className="text-[10px] font-semibold text-red-500">Both fields are required.</span>
              )}
            </div>
          </div>

          {/* What the print builders will stamp, so it can be checked before saving. */}
          <figure aria-label="Document signature preview" className="m-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <figcaption className="flex items-center gap-2 text-[11px] font-semibold text-slate-500"><FileText className="h-4 w-4" />Preview on printed documents</figcaption>
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-5">
            <div aria-hidden="true" className="mb-8 space-y-2"><div className="h-1.5 w-2/3 rounded bg-slate-100" /><div className="h-1.5 w-full rounded bg-slate-100" /><div className="h-1.5 w-4/5 rounded bg-slate-100" /></div>
            <div className="text-center">
              <p className="text-xs font-semibold text-gray-500">Approved by:</p>
              <p className="mt-4 border-t border-gray-400 pt-1.5 text-sm font-bold uppercase tracking-wide text-gray-800">
                {signatoryDraft.president_name.trim() || 'President’s name'}
              </p>
              <p className="text-[11px] font-semibold text-gray-500">
                {signatoryDraft.president_title.trim() || 'Designation'}
              </p>
            </div>
            </div>
          </figure>
        </div>
      </SectionCard>

      <SectionCard
        id="activation-history"
        icon={History}
        title="Semester Activation History"
        description="A record of semester changes across the institution."
        aside={
          <span className="text-xs font-semibold text-gray-500">{history.length} logged</span>
        }
      >
        <DataTable
          table={table}
          emptyTitle="No activations yet."
          emptyDescription="Setting a semester as active records it here."
          totalLabel="entries"
          cellClassName={columnId => columnId === 'academic_year' ? 'whitespace-nowrap' : ''}
        />
      </SectionCard>
      </div>
    </div>
  );
}
