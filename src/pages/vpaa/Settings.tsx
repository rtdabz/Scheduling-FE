import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useToast } from '../../context/ToastContext';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CalendarRange,
  CheckCircle2,
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
  flexRender
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData, setCachedData } from '../../lib/dataCache';
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

interface Term {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
  is_enabled: boolean;
}

interface ApiTerm {
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

interface SettingsPageData {
  terms: Term[];
}

const SEMESTER_LABELS: Record<Term['semester'], string> = {
  '1st': '1st Semester',
  '2nd': '2nd Semester',
  summer: 'Summer',
};

const mapApiTerm = (t: ApiTerm): Term => ({
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
  icon: Icon,
  title,
  description,
  aside,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/10 text-[#4e0a10]">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold text-gray-800">{title}</h2>
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
  const { toast } = useToast();
  const settingsCacheKey = 'page:settings';
  const cachedSettingsData = getCachedData<SettingsPageData>(settingsCacheKey);
  const [terms, setTerms] = useState<Term[]>(cachedSettingsData?.terms ?? []);
  const [history, setHistory] = useState<ActivationHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(!hasCachedData(settingsCacheKey));

  // Academic years are stored joined but edited as two fields, so the draft
  // halves live beside the terms until they are saved.
  const [yearDrafts, setYearDrafts] = useState<Record<number, AcademicYearParts>>({});
  const [savingYearId, setSavingYearId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [signatories, setSignatories] = useState<InstitutionSettings>(DEFAULT_INSTITUTION_SETTINGS);
  const [signatoryDraft, setSignatoryDraft] = useState<InstitutionSettings>(DEFAULT_INSTITUTION_SETTINGS);
  const [isSavingSignatory, setIsSavingSignatory] = useState(false);

  // Table States
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10
  });

  // Modal states
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [idToActivate, setIdToActivate] = useState<number | null>(null);

  const rememberTerms = useCallback((next: Term[]) => {
    setCachedData<SettingsPageData>(settingsCacheKey, { terms: next });
    return next;
  }, [settingsCacheKey]);

  const fetchTerms = useCallback(async (forceRefresh = false) => {
    setIsLoading(forceRefresh || !hasCachedData(settingsCacheKey));
    try {
      const data = await loadCachedData<SettingsPageData>(settingsCacheKey, async () => {
        const termsRes = await api.get<ApiTerm[]>('/terms');
        return {
          terms: termsRes.data ? termsRes.data.map(mapApiTerm) : [],
        };
      }, forceRefresh);
      setTerms(data.terms);
      setYearDrafts(Object.fromEntries(data.terms.map(t => [t.id, splitAcademicYear(t.academic_year)])));
    } catch {
      toast.error('Error', 'Failed to load settings data.');
    } finally {
      setIsLoading(false);
    }
  }, [settingsCacheKey, toast]);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  useEffect(() => {
    let active = true;
    fetchInstitutionSettings().then(loaded => {
      if (!active) return;
      setSignatories(loaded);
      setSignatoryDraft(loaded);
    });
    return () => { active = false; };
  }, []);

  const activeSemester = useMemo(() => terms.find(t => t.is_active)?.semester, [terms]);
  const isSummerToggleEnabled = activeSemester === '2nd';

  // Summer is not offered alongside a 1st-semester term.
  useEffect(() => {
    if (activeSemester !== '1st') return;
    setTerms(prev => {
      if (!prev.some(t => t.semester === 'summer' && t.is_enabled)) return prev;
      return rememberTerms(prev.map(t => (
        t.semester === 'summer' && t.is_enabled ? { ...t, is_enabled: false } : t
      )));
    });
  }, [activeSemester, rememberTerms]);

  const draftFor = useCallback(
    (term: Term): AcademicYearParts => yearDrafts[term.id] ?? splitAcademicYear(term.academic_year),
    [yearDrafts],
  );

  /** Typing a complete starting year fills the end year in, still editable. */
  const handleStartYearChange = (term: Term, value: string) => {
    const start = sanitizeYearInput(value);
    setYearDrafts(prev => {
      const current = prev[term.id] ?? splitAcademicYear(term.academic_year);
      const next = followingYear(start);
      return { ...prev, [term.id]: { start, end: next || (start ? current.end : '') } };
    });
  };

  const handleEndYearChange = (term: Term, value: string) => {
    setYearDrafts(prev => {
      const current = prev[term.id] ?? splitAcademicYear(term.academic_year);
      return { ...prev, [term.id]: { ...current, end: sanitizeYearInput(value) } };
    });
  };

  const saveAcademicYear = async (term: Term) => {
    const draft = draftFor(term);
    const joined = joinAcademicYear(draft);
    if (!isValidAcademicYear(draft) || !joined) return;

    setSavingYearId(term.id);
    try {
      const { data } = await api.patch<{ term: ApiTerm }>(`/terms/${term.id}`, { academic_year: joined });
      const saved = data?.term ? mapApiTerm(data.term) : { ...term, academic_year: joined };
      setTerms(prev => rememberTerms(prev.map(t => (t.id === term.id ? { ...t, ...saved } : t))));
      setYearDrafts(prev => ({ ...prev, [term.id]: splitAcademicYear(saved.academic_year) }));
      toast.success('Saved', `${SEMESTER_LABELS[term.semester]} now covers ${joined}.`);
    } catch (error) {
      toast.error('Not saved', apiMessage(error, 'Failed to update the academic year.'));
    } finally {
      setSavingYearId(null);
    }
  };

  const handleToggleEnabled = async (term: Term, enabled: boolean) => {
    setTogglingId(term.id);
    try {
      await api.patch(`/terms/${term.id}`, { is_enabled: enabled });
      setTerms(prev => rememberTerms(prev.map(t => (t.id === term.id ? { ...t, is_enabled: enabled } : t))));
      toast.success(enabled ? 'Summer enabled' : 'Summer disabled', enabled
        ? 'Summer term is now offered this academic year.'
        : 'Summer term will not be offered this academic year.');
    } catch (error) {
      toast.error('Not saved', apiMessage(error, 'Failed to update the summer term.'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleActivateClick = (id: number) => {
    setIdToActivate(id);
    setIsActivateModalOpen(true);
  };

  const confirmActivateTerm = async () => {
    if (idToActivate === null) return;
    try {
      await api.patch<{ term: ApiTerm }>(`/terms/${idToActivate}/activate`);

      setTerms(prev => rememberTerms(prev.map(t => ({ ...t, is_active: t.id === idToActivate }))));

      const termToActivate = terms.find(t => t.id === idToActivate);
      if (termToActivate) {
        setHistory(prev => [
          {
            id: prev.length + 1,
            semester: termToActivate.semester,
            academic_year: termToActivate.academic_year,
            is_active: true,
            activatedAt: new Date().toLocaleString(),
          },
          ...prev.map(h => ({ ...h, is_active: false })),
        ]);
      }

      toast.success('Activated', 'Academic term is now active');
    } catch (error) {
      toast.error('Error', apiMessage(error, 'Failed to activate academic term'));
    } finally {
      setIsActivateModalOpen(false);
      setIdToActivate(null);
    }
  };

  const signatoryDirty =
    signatoryDraft.president_name.trim() !== signatories.president_name ||
    signatoryDraft.president_title.trim() !== signatories.president_title;
  const signatoryComplete =
    signatoryDraft.president_name.trim().length > 0 && signatoryDraft.president_title.trim().length > 0;

  const saveSignatories = async () => {
    if (!signatoryDirty || !signatoryComplete) return;

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
      setIsSavingSignatory(false);
    }
  };

  const sortedTerms = useMemo(() => {
    const semesterOrder = { '1st': 1, '2nd': 2, 'summer': 3 };
    return [...terms].sort((a, b) => semesterOrder[a.semester] - semesterOrder[b.semester]);
  }, [terms]);

  const columns = useMemo<ColumnDef<ActivationHistoryEntry>[]>(
    () => [
      {
        accessorKey: 'semester',
        header: 'Term',
        cell: info => (
          <span className="font-semibold text-gray-700">{SEMESTER_LABELS[info.getValue() as Term['semester']]}</span>
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
            Superseded
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
    <div className="space-y-6 p-4 sm:p-6">
      <SectionCard
        icon={CalendarRange}
        title="Academic Terms"
        description="Set the years each term covers, then activate the one in session. Activating a term applies it system-wide."
        aside={
          <span className="rounded-full bg-[#C9952A]/15 px-2.5 py-1 text-[10px] font-bold text-[#7B1113]">
            {terms.length} terms
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
          {isLoading && terms.length === 0 ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={`card-skeleton-${index}`} className="h-64 animate-pulse rounded-2xl border border-slate-200/70 bg-slate-50" />
            ))
          ) : sortedTerms.map(term => {
            const isSummer = term.semester === 'summer';
            const isCardDisabled = isSummer && !term.is_enabled;
            const draft = draftFor(term);
            const error = academicYearError(draft);
            const joined = joinAcademicYear(draft);
            const isDirty = joined !== term.academic_year;
            const canSave = isDirty && isValidAcademicYear(draft);
            const isSaving = savingYearId === term.id;

            return (
              <article
                key={term.id}
                className={`flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all duration-200 ${
                  isCardDisabled
                    ? 'border-gray-200/60 bg-gray-50/80'
                    : term.is_active
                    ? 'border-[#4e0a10]/30 bg-[#4e0a10]/[0.03]'
                    : 'border-slate-200/80 bg-[#F7F4F0]'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold text-gray-800">{SEMESTER_LABELS[term.semester]}</h3>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${term.is_active && !isCardDisabled ? 'animate-pulse bg-green-500' : 'bg-gray-300'}`} />
                        <span className={`text-[11px] font-bold ${term.is_active && !isCardDisabled ? 'text-green-700' : 'text-gray-400'}`}>
                          {term.is_active && !isCardDisabled ? 'Active' : isCardDisabled ? 'Not offered' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    {isSummer && (
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(term, !term.is_enabled)}
                        disabled={!isSummerToggleEnabled || togglingId === term.id}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          !isSummerToggleEnabled || togglingId === term.id
                            ? 'cursor-not-allowed bg-gray-200 opacity-50'
                            : term.is_enabled
                            ? 'cursor-pointer bg-[#4e0a10]'
                            : 'cursor-pointer bg-gray-300'
                        }`}
                        title={
                          !isSummerToggleEnabled
                            ? 'Summer term can only be managed when 2nd Semester is active'
                            : term.is_enabled
                            ? 'Disable Summer Term'
                            : 'Enable Summer Term'
                        }
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            term.is_enabled ? 'translate-x-4' : 'translate-x-0'
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
                          onChange={e => handleStartYearChange(term, e.target.value)}
                          disabled={isCardDisabled}
                          placeholder="2026"
                          aria-label={`${SEMESTER_LABELS[term.semester]} starting year`}
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
                          onChange={e => handleEndYearChange(term, e.target.value)}
                          disabled={isCardDisabled}
                          placeholder="2027"
                          aria-label={`${SEMESTER_LABELS[term.semester]} end year`}
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
                      onClick={() => saveAcademicYear(term)}
                      disabled={isSaving}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#4e0a10] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#C9952A] disabled:opacity-60"
                    >
                      {isSaving ? <LoadingSpinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                      {isSaving ? 'Saving' : 'Save academic year'}
                    </button>
                  )}

                  {isCardDisabled ? (
                    <p className="py-2 text-xs italic text-gray-500">Summer term not offered this year</p>
                  ) : term.is_active ? (
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
                      onClick={() => handleActivateClick(term.id)}
                      title={isDirty ? 'Save the academic year before activating this term' : undefined}
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
        icon={Signature}
        title="Document Signatories"
        description="Printed schedules and teaching load sheets are approved by this officer. Update the name when the office changes hands."
      >
        <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
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
          <div className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F4F0] p-5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Preview on printed documents</p>
            <div className="mt-6 text-center">
              <p className="text-xs font-semibold text-gray-500">Approved by:</p>
              <p className="mt-4 border-t border-gray-400 pt-1.5 text-sm font-bold uppercase tracking-wide text-gray-800">
                {signatoryDraft.president_name.trim() || DEFAULT_INSTITUTION_SETTINGS.president_name}
              </p>
              <p className="text-[11px] font-semibold text-gray-500">
                {signatoryDraft.president_title.trim() || DEFAULT_INSTITUTION_SETTINGS.president_title}
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={History}
        title="Term Activation History"
        description="Activations made since this page was opened. This log is not stored on the server yet, so it resets on reload."
        aside={
          <span className="text-xs font-semibold text-gray-500">{history.length} logged</span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="border-b border-gray-100 bg-gray-50/75">
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      className="select-none px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-500"
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <button
                              onClick={header.column.getToggleSortingHandler()}
                              className="ml-1.5 inline-flex cursor-pointer items-center text-gray-400 hover:text-gray-600"
                            >
                              {header.column.getIsSorted() === 'asc' ? (
                                <ArrowUp size={13} className="text-[#C9952A]" />
                              ) : header.column.getIsSorted() === 'desc' ? (
                                <ArrowDown size={13} className="text-[#C9952A]" />
                              ) : (
                                <ArrowUpDown size={13} />
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center font-sans text-sm text-gray-400">
                    No activations yet. Setting a term as active records it here.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`h-12 transition-colors hover:bg-gray-50/70 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'}`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td
                        key={cell.id}
                        className={`px-4 py-2.5 align-middle text-xs ${cell.column.id === 'academic_year' ? 'whitespace-nowrap' : ''}`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {table.getFilteredRowModel().rows.length > 0 && (
          <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-100 bg-gray-50/30 px-6 py-4 sm:flex-row">
            <div className="text-xs font-semibold text-gray-500">
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )} of {table.getFilteredRowModel().rows.length} entries
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="cursor-pointer rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-bold text-gray-600 transition-all hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Prev
              </button>
              <span className="px-1 text-xs font-bold text-gray-500">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="cursor-pointer rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-bold text-gray-600 transition-all hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      {isActivateModalOpen && (
        <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm duration-200">
          <div className="animate-in zoom-in-95 w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200/80 bg-[#F7F4F0] shadow-2xl duration-200">
            <div className="space-y-4 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-100 bg-amber-50 text-[#C9952A]">
                <CheckCircle2 size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-gray-800">Activate Academic Term</h3>
                <p className="text-xs leading-relaxed text-gray-500">
                  Are you sure you want to activate this academic term? This will set all other terms to inactive and apply this term system-wide.
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsActivateModalOpen(false)}
                  className="flex-1 cursor-pointer rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmActivateTerm}
                  className="flex-1 cursor-pointer rounded-xl bg-[#4e0a10] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#C9952A]"
                >
                  Confirm Activate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import LoadingSpinner from "../../components/ui/LoadingSpinner";
