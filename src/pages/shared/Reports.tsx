import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowUpRight, CalendarDays, Check, CheckCircle2, FileText, GraduationCap, Printer, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PrintSchedule from '../ClassSchedules/SchedulerPanel/PrintSchedule';
import TeachingLoad from '../ClassSchedules/SchedulerPanel/TeachingLoad';
import type { SchedulerCacheData } from '../ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import { fullSemesterLabel } from '../../lib/semesterLabel';
import { getDeptBadgeStyles } from '../../lib/departmentTheme';
import {
  fetchReportData,
  fetchReportsOverview,
  type ReportDepartment,
  type ReportsOverview,
} from '../../lib/reports';

type ReportKind = 'schedule' | 'load';

interface PrintJob {
  kind: ReportKind;
  data: SchedulerCacheData;
}

/** One printable row: a whole department, or one program inside it. */
interface ReportRow {
  key: string;
  departmentId: number;
  programId: number | null;
  label: string;
  description: string;
  count: number;
}

const TABS: { kind: ReportKind; label: string; description: string; icon: typeof CalendarDays }[] = [
  { kind: 'schedule', label: 'Department Schedule', description: 'Approved class schedules by department or program.', icon: CalendarDays },
  { kind: 'load', label: 'Teaching Load', description: 'Instructor assignments and approved teaching loads.', icon: GraduationCap },
];

const rowsFor = (department: ReportDepartment, kind: ReportKind): ReportRow[] => {
  const countOf = (item: { complete_section_count: number; instructor_count: number }) =>
    kind === 'schedule' ? item.complete_section_count : item.instructor_count;
  const suffix = kind === 'schedule' ? 'Class Schedule' : 'Instructors Load';

  const programRows = department.programs.map((program) => ({
    key: `${department.id}:${program.id}`,
    departmentId: department.id,
    programId: program.id,
    label: `${program.code} ${suffix}`,
    description: program.name,
    count: countOf(program),
  }));

  // A department with a single program would list the same printout twice.
  if (!department.can_print_department || department.programs.length === 1) return programRows;

  return [
    {
      key: `${department.id}:all`,
      departmentId: department.id,
      programId: null,
      label: `All ${department.code} ${suffix}`,
      description: 'All programs in this department',
      count: countOf(department),
    },
    ...programRows,
  ];
};

/**
 * The college's two official printouts, the Department Schedule and the
 * Teaching Load, listed per department and program.
 *
 * Only VPAA-approved schedules are printed, and a section only once all of its
 * classes are approved; the server enforces both, so the counts shown here are
 * exactly what the PDF will contain.
 */
export default function Reports() {
  const { toast } = useToast();
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [kind, setKind] = useState<ReportKind>('schedule');
  const [loadingRowKey, setLoadingRowKey] = useState<string | null>(null);
  const [job, setJob] = useState<PrintJob | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [readyOnly, setReadyOnly] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // State is only set once the request settles, so the effect below does not
  // cascade renders; the Refresh button raises the loading flag itself.
  const load = useCallback(
    () =>
      fetchReportsOverview()
        .then((data) => { setOverview(data); setLoadError(false); })
        .catch(() => {
          setLoadError(true);
          toast.error('Reports Unavailable', 'The report list could not be loaded.');
        })
        .finally(() => setIsLoading(false)),
    [toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setIsLoading(true);
    void load();
  };

  const print = async (row: ReportRow) => {
    if (loadingRowKey) return;
    setLoadingRowKey(row.key);
    try {
      const data = await fetchReportData(row.departmentId, row.programId);
      if (kind === 'schedule' && data.sections.length === 0) {
        toast.warning('Nothing to Print', 'No section in this scope has a fully approved schedule yet.');
        return;
      }
      setJob({ kind, data });
      setIsPrintOpen(true);
    } catch {
      toast.error('Print Failed', 'The report data could not be loaded.');
    } finally {
      setLoadingRowKey(null);
    }
  };

  const departments = overview?.departments ?? [];
  const query = search.trim().toLowerCase();
  const reportGroups = departments.map((department) => ({ department, rows: rowsFor(department, kind) }));
  const availableCount = reportGroups.reduce((total, group) => total + group.rows.filter((row) => row.count > 0).length, 0);
  const visibleGroups = reportGroups.map(({ department, rows }) => ({
    department,
    rows: rows.filter((row) => (!readyOnly || row.count > 0) &&
      `${department.code} ${department.name} ${row.label} ${row.description}`.toLowerCase().includes(query)),
  })).filter((group) => group.rows.length > 0);
  const visibleCount = visibleGroups.reduce((total, group) => total + group.rows.length, 0);

  return (
    <div className="space-y-4">
      {/* The layout supplies the page title; keep the workspace header compact. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-600">
          <CalendarDays size={16} className="shrink-0 text-[#4e0a10]" />
          {isLoading && !overview ? <Skeleton className="h-4 w-48" /> : (
            <span>{overview?.active_semester ? fullSemesterLabel(overview.active_semester) : loadError ? 'Semester unavailable' : 'No active semester'}</span>
          )}
        </div>
        <button type="button" onClick={refresh} disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-[#4e0a10]/30 hover:text-[#4e0a10] disabled:opacity-50">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <div role="tablist" aria-label="Report type" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TABS.map(({ kind: tabKind, label, description, icon: Icon }) => (
          <button key={tabKind} id={`report-tab-${tabKind}`} type="button" role="tab"
            aria-selected={kind === tabKind} aria-controls="report-directory"
            tabIndex={kind === tabKind ? 0 : -1}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const nextKind = event.key === 'Home' ? 'schedule' : event.key === 'End' ? 'load' : tabKind === 'schedule' ? 'load' : 'schedule';
              setKind(nextKind);
              document.getElementById(`report-tab-${nextKind}`)?.focus();
            }}
            onClick={() => setKind(tabKind)} disabled={loadingRowKey !== null}
            className={`group flex items-center gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] disabled:opacity-60 ${
              kind === tabKind ? 'border-[#4e0a10]/25 bg-[#4e0a10]/5 ring-1 ring-[#4e0a10]/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${kind === tabKind ? 'bg-[#4e0a10] text-white shadow-sm' : 'bg-slate-100 text-slate-500'}`}>
              <Icon size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-[#4e0a10]">{label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span>
            </span>
            <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${kind === tabKind ? 'border-[#4e0a10] bg-[#4e0a10] text-white' : 'border-slate-300'}`}>
              {kind === tabKind && <Check size={12} />}
            </span>
          </button>
        ))}
      </div>

      {loadError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <AlertCircle size={16} className="shrink-0" />
          <p>{overview ? 'The report list could not be refreshed. Previously loaded reports are shown.' : 'The report list could not be loaded. Use Refresh to try again.'}</p>
        </div>
      )}

      <section id="report-directory" role="tabpanel" aria-labelledby={`report-tab-${kind}`} aria-busy={isLoading}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">Report directory</h2>
            <p className="mt-0.5 text-xs text-slate-500">Choose a department or program to open its PDF.</p>
          </div>
          {overview && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
            <CheckCircle2 size={13} />{availableCount} available PDF{availableCount === 1 ? '' : 's'}
          </span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
          <div className="relative min-w-0 flex-1 basis-56 sm:max-w-md">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="search" aria-label="Search departments or programs" placeholder="Search departments or programs..." value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:border-[#4e0a10]/40 focus:ring-2 focus:ring-[#4e0a10]/5" />
          </div>
          <button type="button" aria-pressed={readyOnly} onClick={() => setReadyOnly(!readyOnly)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${readyOnly ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>
            <CheckCircle2 size={14} />Available only
          </button>
          {(search || readyOnly) && <button type="button" onClick={() => { setSearch(''); setReadyOnly(false); }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#4e0a10]">
            <X size={13} />Clear filters
          </button>}
          {overview && <span role="status" className="ml-auto text-[11px] font-semibold text-slate-400">{visibleCount} report{visibleCount === 1 ? '' : 's'}</span>}
        </div>

        {isLoading && !overview ? (
          <div role="status" aria-label="Loading reports" className="space-y-3 p-5">
            {[0, 1, 2].map((index) => <Skeleton key={index} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : !overview && loadError ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Reports are temporarily unavailable.</div>
        ) : visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FileText size={23} /></span>
            <p className="text-sm font-bold text-slate-700">{departments.length === 0 ? 'No departments available' : search || readyOnly ? 'No matching reports' : 'No reports available'}</p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{search || readyOnly ? 'Try a different search or clear the filters to see all reports.' : 'Reports will appear here when departments and programs are available.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {visibleGroups.map(({ department, rows }) => (
              <section key={department.id} aria-label={department.name} className="grid lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,2fr)]">
                <header className="flex items-start gap-3 bg-slate-50/50 px-4 py-4 sm:px-5 lg:border-r lg:border-slate-100">
                  <span className={`inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border px-2 text-[11px] font-black ${getDeptBadgeStyles(department.code, department.name)}`}>{department.code}</span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold leading-relaxed text-slate-700">{department.name}</h3>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">{rows.length} report{rows.length === 1 ? '' : 's'}</p>
                  </div>
                </header>
                <ul className="min-w-0 divide-y divide-slate-100">
                  {rows.map((row) => {
                    const isBusy = loadingRowKey === row.key;
                    const unit = kind === 'schedule' ? 'approved section' : 'instructor';
                    return (
                      <li key={row.key} className="flex flex-wrap items-center gap-3 px-4 py-4 transition hover:bg-slate-50/70 sm:px-5">
                        <span className={`hidden h-9 w-8 shrink-0 items-center justify-center rounded-lg border sm:flex ${row.count > 0 ? 'border-[#4e0a10]/10 bg-[#4e0a10]/5 text-[#4e0a10]' : 'border-slate-100 bg-slate-50 text-slate-300'}`}><FileText size={17} /></span>
                        <div className="min-w-0 flex-1 basis-36">
                          <p className="text-xs font-bold text-slate-800">{row.label}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{row.description}</p>
                          <p className={`mt-1.5 flex items-center gap-1 text-[10px] font-semibold ${row.count > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {row.count > 0 && <CheckCircle2 size={11} />}
                            {row.count > 0 ? `${row.count} ${unit}${row.count === 1 ? '' : 's'}` : 'Awaiting approved schedules'}
                          </p>
                        </div>
                        <button type="button" onClick={() => void print(row)} disabled={row.count === 0 || loadingRowKey !== null}
                          aria-label={`Open PDF: ${row.label}`} title={row.count === 0 ? 'Nothing approved to print yet' : 'Open PDF'}
                          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#6b1520] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none">
                          {isBusy ? <LoadingSpinner size={14} className="animate-spin" /> : <Printer size={14} />}
                          {isBusy ? 'Preparing...' : 'Open PDF'}
                          {!isBusy && <ArrowUpRight size={12} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
          <p className="text-[11px] leading-relaxed text-slate-500">Only VPAA-approved schedules are included. A section appears once all of its classes are approved.</p>
        </div>
      </section>

      {job?.kind === 'schedule' && (
        <PrintSchedule
          sections={job.data.sections}
          isPrintModalOpen={isPrintOpen}
          setIsPrintModalOpen={setIsPrintOpen}
          allSchedules={job.data.schedules}
          selectedSectionId={job.data.sections[0]?.id ?? ''}
          departments={job.data.departments}
          users={job.data.users}
          activeSemester={job.data.activeSemester}
        />
      )}

      {job?.kind === 'load' && (
        <TeachingLoad
          faculties={job.data.faculties}
          allSchedules={job.data.schedules}
          isTeachingLoadOpen={isPrintOpen}
          setIsTeachingLoadOpen={setIsPrintOpen}
          sections={job.data.sections}
          activeSemester={job.data.activeSemester}
          users={job.data.users}
          departments={job.data.departments}
          selectedSectionId=""
        />
      )}
    </div>
  );
}
