import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, FileText, GraduationCap, Printer, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PrintSchedule from '../ClassSchedules/SchedulerPanel/PrintSchedule';
import TeachingLoad from '../ClassSchedules/SchedulerPanel/TeachingLoad';
import type { SchedulerCacheData } from '../ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import { fullSemesterLabel } from '../../lib/semesterLabel';
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
  count: number;
}

const TABS: { kind: ReportKind; label: string; icon: typeof CalendarDays }[] = [
  { kind: 'schedule', label: 'Department Schedule', icon: CalendarDays },
  { kind: 'load', label: 'Teaching Load', icon: GraduationCap },
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

  // State is only set once the request settles, so the effect below does not
  // cascade renders; the Refresh button raises the loading flag itself.
  const load = useCallback(
    () =>
      fetchReportsOverview()
        .then(setOverview)
        .catch(() => toast.error('Reports Unavailable', 'The report list could not be loaded.'))
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

  return (
    <div className="space-y-6">
      {/* The page title is rendered by the layout's PageHeader. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {overview?.active_semester ? fullSemesterLabel(overview.active_semester) : 'No active semester'}
          </p>
          <p className="text-xs text-gray-400">
            Only schedules approved by the VPAA are included. A section appears once all of its classes are approved.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isLoading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div role="tablist" aria-label="Report type" className="flex gap-2 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm sm:w-fit">
        {TABS.map(({ kind: tabKind, label, icon: Icon }) => (
          <button
            key={tabKind}
            type="button"
            role="tab"
            aria-selected={kind === tabKind}
            onClick={() => setKind(tabKind)}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition sm:flex-none ${
              kind === tabKind ? 'bg-[#5A1220] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {isLoading && !overview ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : departments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          No departments are available to report on.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {departments.map((department) => (
            <section key={department.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <header className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5A1220]/10 text-[#5A1220]">
                  <FileText size={18} />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-[#5A1220]">{department.name}</h2>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{department.code}</p>
                </div>
              </header>

              <ul className="divide-y divide-gray-100">
                {rowsFor(department, kind).map((row) => {
                  const isBusy = loadingRowKey === row.key;
                  const unit = kind === 'schedule' ? 'approved section' : 'instructor';
                  return (
                    <li key={row.key} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-800">{row.label}</p>
                        <p className="text-xs text-gray-500">
                          {row.count} {unit}{row.count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void print(row)}
                        disabled={row.count === 0 || loadingRowKey !== null}
                        title={row.count === 0 ? 'Nothing approved to print yet' : 'Open PDF'}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#4e0a10]/20 px-3 py-1.5 text-xs font-bold text-[#4e0a10] transition-colors hover:border-[#4e0a10]/40 hover:bg-[#4e0a10]/5 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isBusy ? <LoadingSpinner size={14} className="animate-spin" /> : <Printer size={14} />}
                        PDF
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

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
