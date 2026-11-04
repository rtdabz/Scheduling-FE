import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Archive as ArchiveIcon, BookOpen, ChevronLeft, ChevronRight, Eye, History, RefreshCw, RotateCcw, X } from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import { useDataTable } from '../../components/ui/useDataTable';
import SearchInput from '../../components/ui/SearchInput';
import LoadErrorBanner from '../../components/ui/LoadErrorBanner';
import { useToast } from '../../context/ToastContext';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import ArchiveRecordDialog from './archive/ArchiveRecordDialog';
import ArchiveStatusBadge from './archive/ArchiveStatusBadge';
import { useArchiveRecords, type ArchiveSort } from './archive/useArchiveRecords';
import {
  ARCHIVE_TYPES,
  ARCHIVE_TYPE_LABELS,
  PROGRAM_TYPES,
  TERM_TYPES,
  contextParts,
  formatArchiveDate,
  type ArchiveRecord,
  type ArchiveRef,
  type ArchiveType,
  type RestoreResult,
} from './archive/archiveTypes';

const controlClass = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-semibold text-gray-800 focus:border-[#5A1220] focus:outline-none focus:ring-2 focus:ring-[#5A1220]/30';
const labelClass = 'text-[10px] font-bold uppercase tracking-wider text-gray-500';
const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220] disabled:cursor-not-allowed disabled:opacity-50';

function RestoreCondition({ record }: { record: ArchiveRecord }) {
  const { state, blockers } = record.restore;
  if (state === 'blocked') {
    return (
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-800">
          <AlertTriangle size={11} aria-hidden="true" /> Blocked{blockers.length > 1 ? ` · ${blockers.length} issues` : ''}
        </span>
        <p className="mt-1 line-clamp-2 text-[11px] font-medium text-gray-600">{blockers[0]?.message}</p>
      </div>
    );
  }
  return state === 'validation'
    ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">Checked on restore</span>
    : <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">No known blockers</span>;
}

export default function Archive() {
  const { toast } = useToast();
  const { query, page, loading, error, hasFilters, refresh, update, clearFilters } = useArchiveRecords();
  const [searchDraft, setSearchDraft] = useState(query.search);
  const [dialog, setDialog] = useState<{ target: ArchiveRef; step: 'details' | 'confirm' } | null>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  const closeDialog = useCallback(() => {
    setDialog(null);
    // A restored row disappears with its button; land on the result summary instead of the page body.
    window.setTimeout(() => {
      if (document.activeElement === document.body) summaryRef.current?.focus();
    }, 0);
  }, []);

  // Search is typed freely and committed to the URL after a short pause.
  useEffect(() => {
    if (searchDraft === query.search) return undefined;
    const timer = window.setTimeout(() => update({ search: searchDraft }), 300);
    return () => window.clearTimeout(timer);
  }, [query.search, searchDraft, update]);

  const options = page?.options;
  const programOptions = useMemo(
    () => (options?.programs ?? []).filter((program) => !query.department || String(program.department_id) === query.department),
    [options?.programs, query.department],
  );
  const showProgram = query.type === '' || PROGRAM_TYPES.includes(query.type);
  const showTerm = query.type === '' || TERM_TYPES.includes(query.type);
  const records = page?.data ?? [];
  const meta = page?.meta;
  const initialLoad = loading && !page;

  const openRecord = useCallback((record: ArchiveRecord, step: 'details' | 'confirm') => {
    setDialog({ target: { type: record.type, id: record.id, label: record.label }, step });
  }, []);

  const handleRestored = useCallback((result: RestoreResult) => {
    // Restores touch other screens' data; the archive list itself is re-read from the server.
    invalidateCacheGroups('archive', 'users', 'departments', 'rooms', 'faculty', 'courses', 'schedules', 'settings', 'assignments', 'dashboards');
    void refresh();
    if (result.already_restored) toast.info('Already restored', result.message);
    else toast.success(result.affected_count > 1 ? `${result.affected_count} records restored` : 'Record restored', result.message);
  }, [refresh, toast]);

  const columns = useMemo<ColumnDef<ArchiveRecord>[]>(() => [
    {
      id: 'record',
      header: 'Record',
      cell: ({ row: { original: record } }) => (
        <div className="min-w-[10rem]">
          <p className="text-sm font-semibold text-gray-900">{record.label}</p>
          {record.subtitle && <p className="text-xs font-medium text-gray-500">{record.subtitle}</p>}
          <p className="mt-0.5 text-[11px] font-medium text-gray-500 md:hidden">{record.type_label}{contextParts(record.context).length ? ` · ${contextParts(record.context).join(' · ')}` : ''}</p>
          <div className="mt-1.5 md:hidden"><RestoreCondition record={record} /></div>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      meta: { headerClassName: 'hidden md:table-cell', cellClassName: 'hidden md:table-cell' },
      cell: ({ row: { original: record } }) => (
        <div className="space-y-1">
          <span className="inline-flex whitespace-nowrap rounded-lg border border-gray-200 bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">{record.type_label}</span>
          <div><ArchiveStatusBadge status={record.status} /></div>
        </div>
      ),
    },
    {
      id: 'context',
      header: 'Context',
      meta: { headerClassName: 'hidden lg:table-cell', cellClassName: 'hidden lg:table-cell text-gray-600' },
      cell: ({ row: { original: record } }) => contextParts(record.context).join(' · ') || <span className="text-gray-400">Institution-wide</span>,
    },
    {
      id: 'archived',
      header: 'Archived',
      meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell whitespace-nowrap text-gray-600' },
      cell: ({ row: { original: record } }) => formatArchiveDate(record.deleted_at),
    },
    {
      id: 'condition',
      header: 'Restore condition',
      meta: { headerClassName: 'hidden md:table-cell w-56', cellClassName: 'hidden md:table-cell' },
      cell: ({ row: { original: record } }) => <RestoreCondition record={record} />,
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { align: 'right', cellClassName: 'whitespace-nowrap' },
      cell: ({ row: { original: record } }) => (
        <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => openRecord(record, 'details')} aria-label={`View details for ${record.label}`} className={buttonClass}>
            <Eye size={14} aria-hidden="true" /> <span>Details</span>
          </button>
          <button
            type="button"
            onClick={() => openRecord(record, record.restore.state === 'blocked' ? 'details' : 'confirm')}
            aria-label={record.restore.state === 'blocked' ? `Restore ${record.label} (blocked, view reasons)` : `Restore ${record.label}`}
            className={`${buttonClass} border-[#5A1220]/40 text-[#5A1220] hover:bg-[#5A1220]/5`}
          >
            <RotateCcw size={14} aria-hidden="true" /> <span>Restore</span>
          </button>
        </div>
      ),
    },
  ], [openRecord]);

  const table = useDataTable({ data: records, columns, pageSize: false, enableSorting: false, getRowId: (record) => record.key });

  const typeSelectOptions = ARCHIVE_TYPES.map((type: ArchiveType) => (
    <option key={type} value={type}>{ARCHIVE_TYPE_LABELS[type]} ({page?.counts[type] ?? 0})</option>
  ));

  const resultSummary = !meta ? '' : meta.total === 0
    ? (hasFilters ? 'No records match these filters.' : 'The archive is empty.')
    : `Showing ${meta.from}–${meta.to} of ${meta.total} ${hasFilters ? 'matching ' : ''}record${meta.total === 1 ? '' : 's'}`;

  return (
    <div id="archive-page" className="space-y-4 font-sans">
      <section aria-labelledby="archive-scope-title" className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2 id="archive-scope-title" className="text-sm font-bold text-gray-900">Deleted records that can be recovered</h2>
            <p className="mt-1 text-xs leading-5 text-gray-600">
              Accounts, departments, programs, rooms, instructors, designations, courses, semesters, and class schedules removed with Archive or Delete.
              Restoring brings a record back <strong className="font-semibold text-gray-800">without changing whether it is active</strong>; inspect a record to see its blockers and exact outcome first.
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              <div className="flex gap-1.5"><dt className="text-gray-500">Archived records</dt><dd className="font-bold text-gray-900">{page ? page.total_archived : '—'}</dd></div>
              <div className="flex gap-1.5">
                <dt className="text-gray-500">Last checked</dt>
                <dd className="font-bold text-gray-900">{page ? formatArchiveDate(page.checked_at) : '—'}{loading && page ? <span className="ml-1.5 font-medium text-gray-500">· checking…</span> : null}</dd>
              </div>
            </dl>
          </div>
          <nav aria-label="Other archives" className="grid gap-2 sm:grid-cols-2 lg:w-[26rem] lg:grid-cols-1">
            <Link to="/curriculum?view=archived" className="group flex gap-2.5 rounded-xl border border-gray-200 p-3 transition hover:border-[#5A1220]/40 hover:bg-[#5A1220]/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]">
              <BookOpen size={16} className="mt-0.5 shrink-0 text-[#5A1220]" aria-hidden="true" />
              <span><span className="block text-xs font-bold text-gray-900 group-hover:underline">Archived curricula</span><span className="block text-[11px] text-gray-500">Curricula are archived by status on the Curriculum page and restored there by their authors.</span></span>
            </Link>
            <Link to="/schedule-history" className="group flex gap-2.5 rounded-xl border border-gray-200 p-3 transition hover:border-[#5A1220]/40 hover:bg-[#5A1220]/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]">
              <History size={16} className="mt-0.5 shrink-0 text-[#5A1220]" aria-hidden="true" />
              <span><span className="block text-xs font-bold text-gray-900 group-hover:underline">Schedule History</span><span className="block text-[11px] text-gray-500">Timetables from past semesters are kept read-only there and cannot be restored.</span></span>
            </Link>
          </nav>
        </div>
      </section>

      <section aria-label="Find archived records" className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-3 lg:col-span-2">
            <label htmlFor="archive-search" className={labelClass}>Search</label>
            <SearchInput id="archive-search" value={searchDraft} maxLength={100} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Name, username, code, room…" containerClassName="relative" className="!py-2 !text-xs" />
          </div>
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <label htmlFor="archive-type" className={labelClass}>Record type</label>
            <select id="archive-type" value={query.type} onChange={(event) => update({ type: event.target.value as ArchiveType | '' })} className={controlClass}>
              <option value="">All types ({page ? Object.values(page.counts).reduce((sum, count) => sum + count, 0) : 0})</option>
              {typeSelectOptions}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="archive-department" className={labelClass}>Department</label>
            <select id="archive-department" value={query.department} onChange={(event) => update({ department: event.target.value, program: '' })} className={controlClass}>
              <option value="">All departments</option>
              {(options?.departments ?? []).map((department) => <option key={department.id} value={department.id}>{department.code}{department.archived ? ' (archived)' : ''}</option>)}
            </select>
          </div>
          {showProgram && (
            <div className="flex flex-col gap-1">
              <label htmlFor="archive-program" className={labelClass}>Program</label>
              <select id="archive-program" value={query.program} onChange={(event) => update({ program: event.target.value })} className={controlClass}>
                <option value="">All programs</option>
                {programOptions.map((program) => <option key={program.id} value={program.id}>{program.code}{program.archived ? ' (archived)' : ''}</option>)}
              </select>
            </div>
          )}
          {showTerm && (
            <div className="flex flex-col gap-1">
              <label htmlFor="archive-term" className={labelClass}>Term</label>
              <select id="archive-term" value={query.term} onChange={(event) => update({ term: event.target.value })} className={controlClass}>
                <option value="">All terms</option>
                {(options?.semesters ?? []).map((semester) => <option key={semester.id} value={semester.id}>{semester.label}{semester.active ? ' (active)' : ''}{semester.archived ? ' (archived)' : ''}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="archive-from" className={labelClass}>Archived from</label>
            <input id="archive-from" type="date" value={query.from} max={query.to || undefined} onChange={(event) => update({ from: event.target.value })} className={controlClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="archive-to" className={labelClass}>Archived to</label>
            <input id="archive-to" type="date" value={query.to} min={query.from || undefined} onChange={(event) => update({ to: event.target.value })} className={controlClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="archive-sort" className={labelClass}>Sort</label>
            <select id="archive-sort" value={query.sort} onChange={(event) => update({ sort: event.target.value as ArchiveSort })} className={controlClass}>
              <option value="newest">Newest archived</option>
              <option value="oldest">Oldest archived</option>
              <option value="type">Record type</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
          <p ref={summaryRef} tabIndex={-1} role="status" aria-live="polite" className="rounded text-xs font-semibold text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]">{initialLoad ? 'Loading archived records…' : resultSummary}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setSearchDraft(''); clearFilters(); }} disabled={!hasFilters} className={buttonClass}>
              <X size={14} aria-hidden="true" /> Clear filters
            </button>
            <button type="button" onClick={() => void refresh()} disabled={loading} className={buttonClass}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {error && !page && <LoadErrorBanner message={error} onRetry={() => void refresh()} />}
      {error && page && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">Couldn’t refresh: {error} Showing saved results from {formatArchiveDate(page.checked_at)}.</span>
          <button type="button" onClick={() => void refresh()} className="rounded-md border border-amber-300 bg-white px-2.5 py-1.5 font-bold hover:bg-amber-100">Retry</button>
        </div>
      )}

      {(page || initialLoad) && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <DataTable
            table={table}
            variant="embedded"
            isLoading={initialLoad}
            ariaLabel="Archived records"
            emptyState={page && page.total_archived === 0 ? (
              <div className="py-8">
                <ArchiveIcon className="mx-auto mb-3 text-gray-300" size={36} aria-hidden="true" />
                <p className="text-sm font-semibold text-gray-700">Nothing has been archived</p>
                <p className="mt-1 text-xs text-gray-500">Records archived from Users, Departments, Facilities, Instructors, Designations, Courses, Semesters, or the scheduler will appear here.</p>
              </div>
            ) : (
              <div className="py-8">
                <ArchiveIcon className="mx-auto mb-3 text-gray-300" size={36} aria-hidden="true" />
                <p className="text-sm font-semibold text-gray-700">No records match these filters</p>
                <p className="mt-1 text-xs text-gray-500">{page?.total_archived ?? 0} archived records exist. Change or clear the filters to see them.</p>
                <button type="button" onClick={() => { setSearchDraft(''); clearFilters(); }} className={`${buttonClass} mt-3`}>Clear filters</button>
              </div>
            )}
          />
          {meta && meta.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <label htmlFor="archive-page-size" className="font-semibold">Rows per page</label>
                <select id="archive-page-size" value={query.size} onChange={(event) => update({ size: Number(event.target.value) })} className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#5A1220]/30">
                  {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>
              <nav aria-label="Archive pages" className="flex items-center gap-2">
                <button type="button" aria-label="Previous page" disabled={meta.current_page <= 1 || loading} onClick={() => update({ page: meta.current_page - 1 })} className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220] disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
                <span className="font-semibold">Page {meta.current_page} of {meta.last_page}</span>
                <button type="button" aria-label="Next page" disabled={meta.current_page >= meta.last_page || loading} onClick={() => update({ page: meta.current_page + 1 })} className="rounded-md border border-gray-300 p-1.5 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220] disabled:opacity-40"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
              </nav>
            </div>
          )}
        </div>
      )}

      {dialog && (
        <ArchiveRecordDialog
          key={`${dialog.target.type}:${dialog.target.id}:${dialog.step}`}
          target={dialog.target}
          initialStep={dialog.step}
          onClose={closeDialog}
          onRestored={handleRestored}
          onStale={refresh}
        />
      )}
    </div>
  );
}
