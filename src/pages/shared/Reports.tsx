import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  Layers,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PrintSchedule from '../ClassSchedules/SchedulerPanel/PrintSchedule';
import TeachingLoad from '../ClassSchedules/SchedulerPanel/TeachingLoad';
import type { SchedulerCacheData } from '../ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import { getDeptBadgeStyles } from '../../lib/departmentTheme';
import api from '../../lib/api';
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
 * The college's official printouts, the Department Schedule and the
 * Teaching Load, presented in an Executive Academic Intelligence Hub.
 */
export default function Reports() {
  const { toast } = useToast();
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [kind, setKind] = useState<ReportKind>('schedule');
  const [loadingRowKey, setLoadingRowKey] = useState<string | null>(null);
  const [exportingRowKey, setExportingRowKey] = useState<string | null>(null);
  const [job, setJob] = useState<PrintJob | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [readyOnly, setReadyOnly] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [loadError, setLoadError] = useState(false);

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
    if (loadingRowKey || exportingRowKey) return;
    setLoadingRowKey(row.key);
    try {
      const data = await fetchReportData(row.departmentId, row.programId);
      if (kind === 'schedule' && data.sections.length === 0) {
        toast.warning('Nothing to Print', 'No section in this scope has a fully approved schedule yet.');
        return;
      }
      setJob({ kind, data });
      setIsPrintOpen(true);
      void api.post('/reports/log-download', {
        report_type: kind,
        department_id: row.departmentId,
        program_id: row.programId,
      }).catch(() => {});
    } catch {
      toast.error('Print Failed', 'The report data could not be loaded.');
    } finally {
      setLoadingRowKey(null);
    }
  };

  const exportCsv = async (row: ReportRow) => {
    if (loadingRowKey || exportingRowKey) return;
    setExportingRowKey(row.key);
    try {
      const data = await fetchReportData(row.departmentId, row.programId);
      let csvLines: string[] = [];

      if (kind === 'schedule') {
        csvLines.push(['Department', 'Section', 'Course Code', 'Course Title', 'Day', 'Time', 'Room', 'Instructor'].join(','));
        data.schedules.forEach((s) => {
          const dept = data.departments.find(d => Number(d.id) === Number(s.departmentId))?.department_code ?? '';
          const sec = s.sectionName || '';
          const code = s.courseCode || s.subjectCode || '';
          const title = s.courseName || s.subjectName || '';
          const day = s.day || '';
          const time = `${s.startTime || ''} - ${s.endTime || ''}`;
          const room = s.roomName || '';
          const faculty = s.facultyName || '';

          csvLines.push([
            `"${dept}"`, `"${sec}"`, `"${code}"`, `"${title}"`,
            `"${day}"`, `"${time}"`, `"${room}"`, `"${faculty}"`,
          ].join(','));
        });
      } else {
        csvLines.push(['Instructor Name', 'Employment Type', 'Max Units', 'Assigned Units', 'Status'].join(','));
        data.faculties.forEach((f) => {
          // Report data arrives already mapped to the camelCase Faculty shape.
          csvLines.push([
            `"${f.name || ''}"`,
            `"${f.employmentType || 'full-time'}"`,
            `"${f.maxUnits || 0}"`,
            `"${f.assignedUnits || 0}"`,
            `"${f.status || 'Active'}"`,
          ].join(','));
        });
      }

      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${row.label.replace(/[^a-zA-Z0-9]/g, '_')}_${kind}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Export Complete', `${row.label} data exported to CSV.`);
    } catch {
      toast.error('Export Failed', 'Could not export CSV data.');
    } finally {
      setExportingRowKey(null);
    }
  };

  const departments = overview?.departments ?? [];
  const query = search.trim().toLowerCase();
  const reportGroups = departments.map((department) => ({ department, rows: rowsFor(department, kind) }));
  const availableCount = reportGroups.reduce((total, group) => total + group.rows.filter((row) => row.count > 0).length, 0);

  const totalSectionsCount = useMemo(
    () => departments.reduce((acc, d) => acc + d.complete_section_count, 0),
    [departments]
  );
  const totalInstructorsCount = useMemo(
    () => departments.reduce((acc, d) => acc + d.instructor_count, 0),
    [departments]
  );

  const visibleGroups = reportGroups
    .filter(({ department }) => deptFilter === 'all' || String(department.id) === deptFilter)
    .map(({ department, rows }) => ({
      department,
      rows: rows.filter(
        (row) =>
          (!readyOnly || row.count > 0) &&
          `${department.code} ${department.name} ${row.label} ${row.description}`.toLowerCase().includes(query)
      ),
    }))
    .filter((group) => group.rows.length > 0);

  const visibleCount = visibleGroups.reduce((total, group) => total + group.rows.length, 0);

  return (
    <div className="space-y-5">
      {/* Workspace Sub-header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-600">
          <CalendarDays size={16} className="shrink-0 text-[#4e0a10]" />
          <span>All semesters</span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-[#4e0a10]/30 hover:text-[#4e0a10] disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {/* Executive Academic Intelligence KPI Strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-[#C9952A]">
            <FileSpreadsheet size={20} />
          </span>
          <div>
            <div className="text-lg font-black leading-none text-[#4e0a10]">
              {isLoading && !overview ? <Skeleton className="h-6 w-12" /> : availableCount}
            </div>
            <div className="mt-1 text-[11px] font-bold text-slate-500">Available PDFs</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <div className="text-lg font-black leading-none text-[#4e0a10]">
              {isLoading && !overview ? <Skeleton className="h-6 w-12" /> : totalSectionsCount}
            </div>
            <div className="mt-1 text-[11px] font-bold text-slate-500">Approved Sections</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Users size={20} />
          </span>
          <div>
            <div className="text-lg font-black leading-none text-[#4e0a10]">
              {isLoading && !overview ? <Skeleton className="h-6 w-12" /> : totalInstructorsCount}
            </div>
            <div className="mt-1 text-[11px] font-bold text-slate-500">Active Instructors</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
            <Award size={20} />
          </span>
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-rose-800">ALCU / CHED</div>
            <div className="mt-0.5 text-[11px] font-bold text-slate-500">VPAA Verified</div>
          </div>
        </div>
      </div>

      {/* Report Kind Selector Tabs */}
      <div role="tablist" aria-label="Report type" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TABS.map(({ kind: tabKind, label, description, icon: Icon }) => (
          <button
            key={tabKind}
            id={`report-tab-${tabKind}`}
            type="button"
            role="tab"
            aria-selected={kind === tabKind}
            aria-controls="report-directory"
            tabIndex={kind === tabKind ? 0 : -1}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const nextKind = event.key === 'Home' ? 'schedule' : event.key === 'End' ? 'load' : tabKind === 'schedule' ? 'load' : 'schedule';
              setKind(nextKind);
              document.getElementById(`report-tab-${nextKind}`)?.focus();
            }}
            onClick={() => setKind(tabKind)}
            disabled={loadingRowKey !== null || exportingRowKey !== null}
            className={`group flex items-center gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] disabled:opacity-60 ${
              kind === tabKind
                ? 'border-[#4e0a10]/25 bg-[#4e0a10]/5 ring-1 ring-[#4e0a10]/10 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                kind === tabKind ? 'bg-[#4e0a10] text-white shadow-sm' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
              }`}
            >
              <Icon size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold text-[#4e0a10]">{label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span>
            </span>
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                kind === tabKind ? 'border-[#4e0a10] bg-[#4e0a10] text-white' : 'border-slate-300'
              }`}
            >
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

      {/* Main Report Directory Section */}
      <section
        id="report-directory"
        role="tabpanel"
        aria-labelledby={`report-tab-${kind}`}
        aria-busy={isLoading}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">Report directory</h2>
            <p className="mt-0.5 text-xs text-slate-500">Choose a department or program to view options, open PDF, or export raw CSV data.</p>
          </div>
          {overview && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              <CheckCircle2 size={13} />
              {availableCount} available PDF{availableCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
          <div className="relative min-w-0 flex-1 basis-56 sm:max-w-md">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Search departments or programs"
              placeholder="Search departments or programs..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:border-[#4e0a10]/40 focus:ring-2 focus:ring-[#4e0a10]/5"
            />
          </div>

          {departments.length > 1 && (
            <div className="relative inline-flex items-center">
              <Filter size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                aria-label="Filter by department"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs font-bold text-slate-600 outline-none transition hover:border-slate-300 focus:border-[#4e0a10]/40"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            aria-pressed={readyOnly}
            onClick={() => setReadyOnly(!readyOnly)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
              readyOnly ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 size={14} />Available only
          </button>

          {(search || readyOnly || deptFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setReadyOnly(false);
                setDeptFilter('all');
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#4e0a10]"
            >
              <X size={13} />Clear filters
            </button>
          )}

          {overview && (
            <span role="status" className="ml-auto text-[11px] font-semibold text-slate-400">
              {visibleCount} report{visibleCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {isLoading && !overview ? (
          <div role="status" aria-label="Loading reports" className="divide-y divide-slate-100">
            {[0, 1].map((deptIndex) => (
              <div key={deptIndex} className="grid lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,2fr)]">
                <div className="flex items-start gap-3 bg-slate-50/50 px-4 py-4 sm:px-5 lg:border-r lg:border-slate-100">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-3 w-16 rounded" />
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {[0, 1].map((rowIndex) => (
                    <div key={rowIndex} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                      <Skeleton className="hidden h-9 w-8 shrink-0 rounded-lg sm:flex" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-48 rounded" />
                        <Skeleton className="h-3 w-64 max-w-full rounded" />
                        <Skeleton className="h-2.5 w-28 rounded" />
                      </div>
                      <Skeleton className="h-8 w-24 shrink-0 rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : !overview && loadError ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Reports are temporarily unavailable.</div>
        ) : visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <FileText size={23} />
            </span>
            <p className="text-sm font-bold text-slate-700">
              {departments.length === 0 ? 'No departments available' : search || readyOnly || deptFilter !== 'all' ? 'No matching reports' : 'No reports available'}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
              {search || readyOnly || deptFilter !== 'all'
                ? 'Try a different search or clear the filters to see all reports.'
                : 'Reports will appear here when departments and programs are available.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {visibleGroups.map(({ department, rows }) => (
              <section key={department.id} aria-label={department.name} className="grid lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,2fr)]">
                <header className="flex items-start gap-3 bg-slate-50/50 px-4 py-4 sm:px-5 lg:border-r lg:border-slate-100">
                  <span className={`inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border px-2 text-[11px] font-black ${getDeptBadgeStyles(department.code, department.name)}`}>
                    {department.code}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold leading-relaxed text-slate-700">{department.name}</h3>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      {rows.length} report{rows.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </header>

                <ul className="min-w-0 divide-y divide-slate-100">
                  {rows.map((row) => {
                    const isBusy = loadingRowKey === row.key;
                    const isExporting = exportingRowKey === row.key;
                    const unit = kind === 'schedule' ? 'approved section' : 'instructor';

                    return (
                      <li key={row.key} className="flex flex-wrap items-center gap-3 px-4 py-4 transition hover:bg-slate-50/70 sm:px-5">
                        <span
                          className={`hidden h-9 w-8 shrink-0 items-center justify-center rounded-lg border sm:flex ${
                            row.count > 0 ? 'border-[#4e0a10]/10 bg-[#4e0a10]/5 text-[#4e0a10]' : 'border-slate-100 bg-slate-50 text-slate-300'
                          }`}
                        >
                          <FileText size={17} />
                        </span>

                        <div className="min-w-0 flex-1 basis-36">
                          <p className="text-xs font-bold text-slate-800">{row.label}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{row.description}</p>
                          <p className={`mt-1.5 flex items-center gap-1 text-[10px] font-semibold ${row.count > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {row.count > 0 && <CheckCircle2 size={11} />}
                            {row.count > 0 ? `${row.count} ${unit}${row.count === 1 ? '' : 's'}` : 'Awaiting approved schedules'}
                          </p>
                        </div>

                        <div className="ml-auto flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void exportCsv(row)}
                            disabled={row.count === 0 || loadingRowKey !== null || exportingRowKey !== null}
                            aria-label={`Export CSV: ${row.label}`}
                            title={row.count === 0 ? 'Nothing approved to export yet' : 'Export CSV data'}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isExporting ? <LoadingSpinner size={13} className="animate-spin" /> : <Download size={13} />}
                            <span className="hidden sm:inline">CSV</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void print(row)}
                            disabled={row.count === 0 || loadingRowKey !== null || exportingRowKey !== null}
                            aria-label={`Open PDF: ${row.label}`}
                            title={row.count === 0 ? 'Nothing approved to print yet' : 'Open PDF'}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#6b1520] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                          >
                            {isBusy ? <LoadingSpinner size={14} className="animate-spin" /> : <Printer size={14} />}
                            {isBusy ? 'Preparing...' : 'Open PDF'}
                            {!isBusy && <ArrowUpRight size={12} />}
                          </button>
                        </div>
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
          <p className="text-[11px] leading-relaxed text-slate-500">
            Only VPAA-approved schedules are included. A section appears once all of its classes are approved. Official signatories are dynamically attached from Institution Settings.
          </p>
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

