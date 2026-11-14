import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList, Download, Eye, History, MapPinned, RefreshCw, Search, X } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import api from '../../lib/api';
import { buildExportFilename, downloadFile } from '../../lib/exportFile';
import { PHILIPPINE_TIME_ZONE } from '../../lib/philippineTime';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import { roleLabel } from '../../lib/roles';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import TableActionButton from '../../components/ui/TableActionButton';
import { useDataTable } from '../../components/ui/useDataTable';
import ActivityDetailDrawer from './activityLog/ActivityDetailDrawer';
import LoginHistory from './activityLog/LoginHistory';
import { EMPTY_LOGIN_FILTERS, loginAuditId, loginDetailsPath, type LoginFilters } from './activityLog/loginActivityModel';
import { FIELD, SECONDARY_BUTTON } from './activityLog/styles';
import {
  actorName, actorRoleLabel, CATEGORIES, categoryLabel, entryLabel, formatDay, formatTime, initials, ROLE_FILTER_OPTIONS, STATUSES, targetLabel,
  type ActivityEntry, type ActivityResponse, type ActorFacet, type Department, type Semester,
} from './activityLog/activityLogModel';

interface ActivityLookups {
  departments: Department[];
  semesters: Semester[];
}

const LOOKUPS_CACHE_KEY = 'page:activity-log:lookups';
const EMPTY_FILTERS = { search: '', category: '', department_id: '', actor_id: '', role: '', status: '', from: '', to: '' };
type Filters = typeof EMPTY_FILTERS;
const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

const entriesCacheKey = (page: number, perPage: number, applied: Filters): string =>
  `page:activity-log:entries:${page}:${perPage}:${JSON.stringify(applied)}`;
const activeParams = (filters: Filters) => Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
const numberFormat = new Intl.NumberFormat('en-PH');

// Leaflet is only downloaded when the map tab is opened.
const LoginLocations = lazy(() => import('./activityLog/LoginLocations'));

const actorOptionLabel = (actor: ActorFacet) =>
  `${actor.name ?? `User #${actor.id} (identity not recorded)`}${actor.role ? ` — ${roleLabel(actor.role)}` : ''}`;

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-500">{label}</span>
      <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} className={`${FIELD} cursor-pointer ${value ? 'border-[#701522]/50 bg-[#F5E9EA]/40' : ''}`}>
        {children}
      </select>
    </label>
  );
}

function SummaryStrip({ summary, loading }: { summary?: NonNullable<ActivityResponse['meta']['summary']>; loading: boolean }) {
  const cells: { label: string; value?: number; accent: string; hint: string }[] = [
    { label: 'Events', value: summary?.total, accent: 'bg-[#701522]', hint: 'Matching the current filters' },
    { label: 'Approvals', value: summary?.approved, accent: 'bg-emerald-500', hint: 'Schedule and room approvals' },
    { label: 'Returned or rejected', value: summary === undefined ? undefined : summary.returned + summary.rejected, accent: 'bg-amber-500', hint: 'Sent back for revision or declined' },
    { label: 'Failed sign-ins', value: summary?.failed, accent: 'bg-red-500', hint: 'Unsuccessful login attempts' },
    { label: 'People involved', value: summary?.actors, accent: 'bg-sky-500', hint: 'Distinct recorded actors' },
  ];
  return (
    <section aria-label="Activity summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-100 sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell, index) => (
        <div key={cell.label} title={cell.hint} className={`bg-white px-4 py-3 ${index === cells.length - 1 ? 'col-span-2 lg:col-span-1' : ''}`}>
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${cell.accent}`} />
            <span className="text-[11px] font-medium text-gray-500">{cell.label}</span>
          </div>
          <p className="mt-1 font-jakarta text-xl font-bold tabular-nums text-gray-900">
            {cell.value === undefined ? (loading ? <span className="inline-block h-5 w-10 animate-pulse rounded bg-gray-100 align-middle" /> : '—') : numberFormat.format(cell.value)}
          </p>
        </div>
      ))}
    </section>
  );
}

function PagerButton({ label, onClick, disabled, children, className = '' }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#701522]/30 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>
      {children}
    </button>
  );
}

function AllActivities() {
  const navigate = useNavigate();
  const location = useLocation();
  const [initialEntries] = useState(() => getCachedData<ActivityResponse>(entriesCacheKey(1, DEFAULT_PAGE_SIZE, EMPTY_FILTERS)));
  const [initialLookups] = useState(() => getCachedData<ActivityLookups>(LOOKUPS_CACHE_KEY));
  const [entries, setEntries] = useState<ActivityEntry[]>(initialEntries?.data ?? []);
  const [departments, setDepartments] = useState<Department[]>(initialLookups?.departments ?? []);
  const [semesters, setSemesters] = useState<Semester[]>(initialLookups?.semesters ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialEntries);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [meta, setMeta] = useState<ActivityResponse['meta']>(initialEntries?.meta ?? { current_page: 1, per_page: DEFAULT_PAGE_SIZE, total: 0, last_page: 1 });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Department[]>('/departments'),
      api.get<Semester[]>('/semesters'),
    ]).then(([departmentResponse, semesterResponse]) => {
      setDepartments(departmentResponse.data);
      setSemesters(semesterResponse.data);
      setCachedData<ActivityLookups>(LOOKUPS_CACHE_KEY, { departments: departmentResponse.data, semesters: semesterResponse.data });
    }).catch(() => {});
  }, []);

  const loadEntries = useCallback(async () => {
    const cacheKey = entriesCacheKey(page, perPage, applied);
    const cached = getCachedData<ActivityResponse>(cacheKey);
    if (cached) {
      setEntries(cached.data);
      setMeta(cached.meta);
    }
    if (!hasCachedData(cacheKey)) setLoading(true);
    setError('');
    try {
      const response = await api.get<ActivityResponse>('/activity-log', { params: { page, per_page: perPage, ...activeParams(applied) } });
      setEntries(response.data.data);
      setMeta(response.data.meta);
      setUpdatedAt(new Date());
      setCachedData<ActivityResponse>(cacheKey, response.data);
    } catch (loadError: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(loadError) ? loadError.response?.data?.message : undefined;
      setError(message || 'The activity log could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [applied, page, perPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadEntries(), 0);
    return () => window.clearTimeout(timer);
  }, [loadEntries]);

  const departmentMap = useMemo(() => new Map(departments.map(department => [department.id, department])), [departments]);
  const semesterMap = useMemo(() => new Map(semesters.map(semester => [semester.id, semester])), [semesters]);

  const actorOptions = useMemo(() => {
    const options = [...(meta.facets?.actors ?? [])];
    // Keep the applied actor selectable even when the other filters no longer return them.
    if (applied.actor_id && !options.some(actor => String(actor.id) === applied.actor_id)) {
      options.unshift({ id: Number(applied.actor_id), name: null, username: null, role: null });
    }
    return options;
  }, [meta.facets, applied.actor_id]);

  const columns = useMemo<ColumnDef<ActivityEntry>[]>(() => [
    {
      id: 'occurred_at',
      header: 'Date and time',
      size: 150,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="tabular-nums">
          <p className="text-xs font-semibold text-gray-800">{formatDay(row.original.occurred_at)}</p>
          <p className="text-[11px] text-gray-500">{formatTime(row.original.occurred_at)}</p>
        </div>
      ),
    },
    {
      id: 'event',
      header: 'Event',
      cell: ({ row }) => {
        const department = row.original.department_id ? departmentMap.get(row.original.department_id)?.department_code : undefined;
        return (
          <div className="min-w-[12rem]">
            <p className="text-[13px] font-semibold leading-snug text-gray-900">{entryLabel(row.original)}</p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">
              {targetLabel(row.original)}{department ? <span className="text-gray-400"> · {department}</span> : null}
            </p>
          </div>
        );
      },
    },
    {
      id: 'category',
      header: 'Category',
      size: 170,
      meta: { hideBelow: 'lg' },
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORIES[row.original.category]?.dot ?? 'bg-gray-400'}`} />
          {categoryLabel(row.original.category)}
        </span>
      ),
    },
    {
      id: 'actor',
      header: 'Actor',
      size: 220,
      cell: ({ row }) => {
        const entry = row.original;
        const recorded = Boolean(entry.actor?.name);
        return (
          <div className="flex min-w-[10rem] items-center gap-2.5">
            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${recorded ? 'bg-[#F5E9EA] text-[#701522]' : 'bg-gray-100 text-gray-400'}`}>
              {recorded ? initials(entry.actor!.name!) : entry.actor_type === 'system' ? 'S' : '?'}
            </span>
            <div className="min-w-0">
              <p className={`truncate text-xs font-semibold ${recorded ? 'text-gray-900' : 'text-gray-500'}`}>{actorName(entry)}</p>
              <p className="truncate text-[11px] text-gray-500">{actorRoleLabel(entry)}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      size: 120,
      cell: ({ row }) => {
        const status = STATUSES[row.original.status] ?? STATUSES.completed;
        return <Badge tone={status.tone} dot>{status.label}</Badge>;
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      size: 56,
      meta: { align: 'center', stopRowClick: true },
      cell: ({ row }) => {
        const auditId = loginAuditId(row.original);
        if (auditId === null) return null;
        return (
          <TableActionButton
            label="View sign-in details"
            variant="view"
            onClick={event => {
              event.stopPropagation();
              navigate(loginDetailsPath(auditId), { state: { from: `${location.pathname}${location.search}` } });
            }}
          >
            <Eye className="h-4 w-4" />
          </TableActionButton>
        );
      },
    },
  ], [departmentMap, navigate, location.pathname, location.search]);

  const table = useDataTable({ data: entries, columns, pageSize: false, enableSorting: false, getRowId: entry => entry.id });

  const dateError = filters.from && filters.to && filters.from > filters.to ? 'The start date must be on or before the end date.' : '';
  const dirty = JSON.stringify(filters) !== JSON.stringify(applied);
  const appliedCount = Object.values(applied).filter(Boolean).length;

  const applyFilters = (event?: FormEvent) => {
    event?.preventDefault();
    if (dateError) return;
    setPage(1);
    setApplied({ ...filters, search: filters.search.trim() });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const removeFilter = (key: keyof Filters) => {
    setFilters(current => ({ ...current, [key]: '' }));
    setApplied(current => ({ ...current, [key]: '' }));
    setPage(1);
  };

  const setFilter = (key: keyof Filters) => (value: string) => setFilters(current => ({ ...current, [key]: value }));

  const exportCsv = async () => {
    setExporting(true);
    setNotice('');
    try {
      const response = await api.get('/activity-log', { params: { export: 'csv', ...activeParams(applied) }, responseType: 'blob' });
      const timestamp = new Intl.DateTimeFormat('sv-SE', {
        timeZone: PHILIPPINE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(new Date());
      downloadFile(response.data, buildExportFilename('csv', 'vpaa-activity-log', timestamp));
    } catch (exportError: unknown) {
      let message = '';
      if (axios.isAxiosError(exportError) && exportError.response?.data instanceof Blob) {
        try { message = (JSON.parse(await exportError.response.data.text()) as { message?: string }).message ?? ''; } catch { /* non-JSON body */ }
      }
      setNotice(message || 'The CSV export did not complete. Try again, or narrow the filters.');
    } finally {
      setExporting(false);
    }
  };

  const chips: { key: keyof Filters; label: string }[] = [];
  if (applied.search) chips.push({ key: 'search', label: `“${applied.search}”` });
  if (applied.category) chips.push({ key: 'category', label: categoryLabel(applied.category) });
  if (applied.department_id) chips.push({ key: 'department_id', label: departmentMap.get(Number(applied.department_id))?.department_code ?? `Department #${applied.department_id}` });
  if (applied.actor_id) {
    const actor = actorOptions.find(option => String(option.id) === applied.actor_id);
    chips.push({ key: 'actor_id', label: actor?.name ?? `User #${applied.actor_id}` });
  }
  if (applied.role) chips.push({ key: 'role', label: `Role: ${ROLE_FILTER_OPTIONS.find(([value]) => value === applied.role)?.[1] ?? applied.role}` });
  if (applied.status) chips.push({ key: 'status', label: STATUSES[applied.status]?.label ?? applied.status });
  if (applied.from) chips.push({ key: 'from', label: `From ${applied.from}` });
  if (applied.to) chips.push({ key: 'to', label: `To ${applied.to}` });

  const selectedIndex = selectedId ? entries.findIndex(entry => entry.id === selectedId) : -1;
  const selected = selectedIndex >= 0 ? entries[selectedIndex] : null;
  const rangeStart = meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1;
  const rangeEnd = Math.min(meta.current_page * meta.per_page, meta.total);

  return (
    <div className="space-y-4">

      <SummaryStrip summary={meta.summary} loading={loading} />

      <form onSubmit={applyFilters} aria-label="Filter activity" className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-gray-500">Search</span>
            <span className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                aria-label="Search activity"
                value={filters.search}
                maxLength={100}
                onChange={event => setFilter('search')(event.target.value)}
                placeholder="Search events, people, sections or records"
                className={`${FIELD} pl-9`}
              />
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2 lg:w-[19rem]">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-gray-500">From</span>
              <input type="date" aria-label="From date" value={filters.from} max={filters.to || undefined} onChange={event => setFilter('from')(event.target.value)} className={FIELD} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-gray-500">To</span>
              <input type="date" aria-label="To date" value={filters.to} min={filters.from || undefined} onChange={event => setFilter('to')(event.target.value)} className={FIELD} />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={Boolean(dateError)}
              className="relative inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#701522] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#4A0D16] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] disabled:cursor-not-allowed disabled:opacity-50 lg:flex-none"
            >
              Apply filters
              {dirty && <span aria-hidden="true" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#F5A623] ring-2 ring-white" />}
            </button>
            <button type="button" onClick={clearFilters} disabled={appliedCount === 0 && !dirty} className={SECONDARY_BUTTON}>
              Clear filters
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField label="Category" value={filters.category} onChange={setFilter('category')}>
            <option value="">All categories</option>
            {Object.entries(CATEGORIES).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
          </SelectField>
          <SelectField label="Department" value={filters.department_id} onChange={setFilter('department_id')}>
            <option value="">All departments</option>
            {departments.map(department => <option key={department.id} value={department.id}>{department.department_code} — {department.department_name}</option>)}
          </SelectField>
          <SelectField label="Actor" value={filters.actor_id} onChange={setFilter('actor_id')}>
            <option value="">All actors</option>
            {actorOptions.map(actor => <option key={actor.id} value={actor.id}>{actorOptionLabel(actor)}</option>)}
          </SelectField>
          <SelectField label="Role" value={filters.role} onChange={setFilter('role')}>
            <option value="">All roles</option>
            {ROLE_FILTER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </SelectField>
          <SelectField label="Status" value={filters.status} onChange={setFilter('status')}>
            <option value="">All statuses</option>
            {Object.entries(STATUSES).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}
          </SelectField>
        </div>

        {(dateError || dirty || chips.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {dateError && <p role="alert" className="mr-2 text-xs font-medium text-red-700">{dateError}</p>}
            {!dateError && dirty && <p className="mr-2 text-xs font-medium text-[#8a5a00]">You have changes that are not applied yet.</p>}
            {chips.map(chip => (
              <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-[#F5E9EA] py-0.5 pl-2.5 pr-1 text-[11px] font-semibold text-[#701522]">
                {chip.label}
                <button type="button" onClick={() => removeFilter(chip.key)} aria-label={`Remove filter ${chip.label}`} className="rounded-full p-0.5 hover:bg-[#701522]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#701522]/40">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
          <p className="text-xs text-gray-600" aria-live="polite">
            <span className="font-semibold text-gray-900">{numberFormat.format(meta.total)}</span> event{meta.total === 1 ? '' : 's'}
            {appliedCount > 0 && <span className="text-gray-500"> matching {appliedCount} filter{appliedCount === 1 ? '' : 's'}</span>}
            {updatedAt && <span className="text-gray-400"> · updated {formatTime(updatedAt.toISOString())}</span>}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setLoading(true); void loadEntries(); }} disabled={loading} className={SECONDARY_BUTTON}>
              <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button type="button" onClick={() => void exportCsv()} disabled={loading || exporting || meta.total === 0} className={SECONDARY_BUTTON} title="Exports every event matching the applied filters (up to 10,000)">
              <Download className="h-3.5 w-3.5 text-gray-500" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>
        {notice && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">{notice}</p>}

        {error ? (
          <div role="alert" className="p-10 text-center">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <button type="button" onClick={() => void loadEntries()} className="mt-3 text-sm font-bold text-[#701522] hover:underline">Try again</button>
          </div>
        ) : (
          <DataTable
            table={table}
            variant="embedded"
            isLoading={loading}
            loadingRows={Math.min(perPage, 10)}
            ariaLabel="Activity log"
            onRowClick={entry => setSelectedId(entry.id)}
            rowClassName={entry => (entry.id === selectedId ? '!bg-[#F5E9EA]' : '')}
            emptyState={
              <div className="mx-auto max-w-sm">
                <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 text-sm font-semibold text-gray-800">{appliedCount > 0 ? 'No events match these filters' : 'No activity recorded yet'}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {appliedCount > 0 ? 'Remove a filter or widen the date range to see more events.' : 'Events appear here as people sign in and work in WICARS.'}
                </p>
                {appliedCount > 0 && <button type="button" onClick={clearFilters} className="mt-3 text-xs font-semibold text-[#701522] hover:underline">Clear filters</button>}
              </div>
            }
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-gray-200 px-4 py-2.5 text-xs font-medium text-gray-500">
          <span className="tabular-nums">
            Showing <span className="font-semibold text-gray-800">{numberFormat.format(rangeStart)}–{numberFormat.format(rangeEnd)}</span> of <span className="font-semibold text-gray-800">{numberFormat.format(meta.total)}</span>
          </span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="max-sm:sr-only">Rows per page</span>
              <select aria-label="Rows per page" value={perPage} onChange={event => { setPerPage(Number(event.target.value)); setPage(1); }}
                className="h-8 cursor-pointer rounded-lg border border-gray-200 bg-white pl-2 pr-1 text-xs font-semibold text-gray-700 outline-none hover:border-gray-300 focus:border-[#701522] focus:ring-1 focus:ring-[#701522]">
                {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <PagerButton label="First page" className="max-sm:hidden" onClick={() => setPage(1)} disabled={page <= 1 || loading}><ChevronsLeft size={15} /></PagerButton>
              <PagerButton label="Previous page" onClick={() => setPage(value => value - 1)} disabled={page <= 1 || loading}><ChevronLeft size={15} /></PagerButton>
              <span className="min-w-[5.5rem] px-1 text-center font-semibold tabular-nums text-gray-700">Page {meta.current_page} of {meta.last_page}</span>
              <PagerButton label="Next page" onClick={() => setPage(value => value + 1)} disabled={page >= meta.last_page || loading}><ChevronRight size={15} /></PagerButton>
              <PagerButton label="Last page" className="max-sm:hidden" onClick={() => setPage(meta.last_page)} disabled={page >= meta.last_page || loading}><ChevronsRight size={15} /></PagerButton>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <ActivityDetailDrawer
          entry={selected}
          departments={departmentMap}
          semesters={semesterMap}
          onClose={() => setSelectedId(null)}
          onPrevious={selectedIndex > 0 ? () => setSelectedId(entries[selectedIndex - 1].id) : undefined}
          onNext={selectedIndex < entries.length - 1 ? () => setSelectedId(entries[selectedIndex + 1].id) : undefined}
          position={`${rangeStart + selectedIndex} of ${numberFormat.format(meta.total)}`}
        />
      )}
    </div>
  );
}

const TABS = [
  { id: 'all', label: 'All Activities', icon: ClipboardList },
  { id: 'locations', label: 'Login Locations', icon: MapPinned },
  { id: 'history', label: 'Login History', icon: History },
] as const;
type TabId = typeof TABS[number]['id'];

const initialTab = (): TabId => {
  const requested = new URLSearchParams(window.location.search).get('tab');
  return TABS.some(tab => tab.id === requested) ? requested as TabId : 'all';
};

export default function ActivityLog() {
  const [tab, setTab] = useState<TabId>(initialTab);
  // Login Locations and Login History share one set of filters so switching tabs keeps context.
  const [loginFilters, setLoginFilters] = useState<LoginFilters>(EMPTY_LOGIN_FILTERS);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectTab = (next: TabId) => {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === 'all') url.searchParams.delete('tab'); else url.searchParams.set('tab', next);
    window.history.replaceState(window.history.state, '', url);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!offset) return;
    event.preventDefault();
    const nextIndex = (index + offset + TABS.length) % TABS.length;
    selectTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div id="activity-log-page" className="space-y-4">
      <div role="tablist" aria-label="Activity log views" className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map(({ id, label, icon: Icon }, index) => {
          const active = tab === id;
          return (
            <button
              key={id}
              ref={element => { tabRefs.current[index] = element; }}
              type="button"
              role="tab"
              id={`activity-tab-${id}`}
              aria-selected={active}
              aria-controls={`activity-panel-${id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(id)}
              onKeyDown={event => onTabKeyDown(event, index)}
              className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#701522]/30 ${active ? 'border-[#701522] text-[#701522]' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800'}`}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`activity-panel-${tab}`} aria-labelledby={`activity-tab-${tab}`}>
        {tab === 'all' && <AllActivities />}
        {tab === 'locations' && (
          <Suspense fallback={<div className="h-[36rem] animate-pulse rounded-xl border border-gray-200 bg-white" aria-label="Loading map" />}>
            <LoginLocations filters={loginFilters} onFiltersChange={setLoginFilters} />
          </Suspense>
        )}
        {tab === 'history' && <LoginHistory filters={loginFilters} onFiltersChange={setLoginFilters} />}
      </div>
    </div>
  );
}
