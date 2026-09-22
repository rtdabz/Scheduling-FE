import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, ClipboardList, Download, Filter, RefreshCw, X } from 'lucide-react';
import api from '../../lib/api';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../../components/ui/DataTable';
import { useDataTable } from '../../components/ui/useDataTable';

type Actor = { id: number; name: string; username: string; role: string };
type ActivityEntry = {
  id: string;
  source: 'authentication' | 'scheduling';
  category: string;
  event: string;
  occurred_at: string;
  actor: Actor | null;
  department_id: number | null;
  semester_id: number | null;
  target: { type: string; id: number | null };
  metadata: Record<string, unknown>;
};
type ActivityResponse = {
  data: ActivityEntry[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
};
type Department = { id: number; department_code: string; department_name: string };
type Semester = { id: number; academic_year: string; semester: string };

const categories = [
  ['schedule_workflow', 'Schedule Workflow'],
  ['scheduling', 'Scheduling'],
  ['faculty_assignment', 'Faculty Assignment'],
  ['user_management', 'User Management'],
  ['authentication', 'Authentication'],
] as const;

const EVENT_DETAILS: Record<string, { label: string; description: string; category: string }> = {
  // 1. Schedule Workflow (schedule_workflow)
  schedule_submitted: { label: 'Schedule Submitted', description: 'Schedule submitted for review and approval', category: 'schedule_workflow' },
  schedule_approved_by_dean: { label: 'Dean Approved Schedule', description: 'Department schedule approved by the Dean', category: 'schedule_workflow' },
  schedule_returned_by_dean: { label: 'Dean Returned Schedule', description: 'Schedule returned by Dean for revisions', category: 'schedule_workflow' },
  schedule_approved_by_vpaa: { label: 'VPAA Approved Schedule', description: 'Final schedule approved and published by VPAA', category: 'schedule_workflow' },
  schedule_returned_by_vpaa: { label: 'VPAA Returned Schedule', description: 'Schedule returned by VPAA for revisions', category: 'schedule_workflow' },
  schedule_unlocked: { label: 'Schedule Unlocked', description: 'Schedule submission unlocked for editing', category: 'schedule_workflow' },

  // 2. Scheduling (scheduling)
  conflict_detected: { label: 'Conflict Detected', description: 'Schedule conflict or overlap identified', category: 'scheduling' },
  recommendation_applied: { label: 'AI Recommendation Applied', description: 'AI recommendation accepted for room/time assignment', category: 'scheduling' },
  recommendation_rejected: { label: 'AI Recommendation Overridden', description: 'Manual override selected over AI recommendation', category: 'scheduling' },
  schedule_auto_generated: { label: 'Batch Schedule Generated', description: 'Automated batch schedule generation executed', category: 'scheduling' },

  // 3. Faculty Assignment (faculty_assignment)
  instructor_assigned: { label: 'Instructor Assigned', description: 'Instructor assigned to course section', category: 'faculty_assignment' },
  cross_department_assigned: { label: 'Cross-Dept Assignment', description: 'Instructor assigned across department lines', category: 'faculty_assignment' },
  designation_updated: { label: 'Designation Deload Updated', description: 'Faculty administrative designation or deload updated', category: 'faculty_assignment' },
  max_units_overridden: { label: 'Max Load Overridden', description: 'Teaching load maximum units overridden', category: 'faculty_assignment' },

  // 4. User Management (user_management)
  user_created: { label: 'User Created', description: 'New user account created', category: 'user_management' },
  user_updated: { label: 'User Updated', description: 'User profile, role, or permissions updated', category: 'user_management' },
  user_deactivated: { label: 'User Deactivated', description: 'User account deactivated or suspended', category: 'user_management' },
  department_created: { label: 'Department Created', description: 'New academic department registered', category: 'user_management' },

  // 5. Authentication (authentication)
  login_succeeded: { label: 'Login Succeeded', description: 'User successfully logged in', category: 'authentication' },
  login_failed: { label: 'Login Failed', description: 'Failed login attempt', category: 'authentication' },
  password_reset: { label: 'Password Reset', description: 'User password reset executed', category: 'authentication' },
  logout: { label: 'Logout', description: 'User logged out', category: 'authentication' },
};

const formatLabel = (value: string) =>
  EVENT_DETAILS[value]?.label || value.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const formatDate = (value: string) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
}).format(new Date(value));

export default function ActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [users, setUsers] = useState<Actor[]>([]);
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ActivityResponse['meta']>({ current_page: 1, per_page: 25, total: 0, last_page: 1 });
  const [filters, setFilters] = useState({ search: '', category: '', event: '', department_id: '', actor_id: '', semester_id: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);

  useEffect(() => {
    Promise.all([
      api.get<Department[]>('/departments'),
      api.get<Semester[]>('/semesters'),
      api.get<{ data?: Actor[] } | Actor[]>('/user'),
    ]).then(([departmentResponse, semesterResponse, userResponse]) => {
      setDepartments(departmentResponse.data);
      setSemesters(semesterResponse.data);
      const rawUsers = userResponse.data;
      const userList = Array.isArray(rawUsers) ? rawUsers : rawUsers.data ?? [];
      setUsers(userList);
    }).catch(() => {});
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<ActivityResponse>('/activity-log', {
        params: { page, per_page: 25, ...Object.fromEntries(Object.entries(applied).filter(([, value]) => value)) },
      });
      setEntries(response.data.data);
      setMeta(response.data.meta);
    } catch (loadError: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(loadError) ? loadError.response?.data?.message : undefined;
      setError(message || 'Unable to load the activity log.');
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const departmentMap = useMemo(() => new Map(departments.map(department => [department.id, department])), [departments]);
  const semesterMap = useMemo(() => new Map(semesters.map(semester => [semester.id, semester])), [semesters]);

  const availableEvents = useMemo(() => {
    const all = Object.entries(EVENT_DETAILS);
    if (!filters.category) return all;
    return all.filter(([, info]) => info.category === filters.category);
  }, [filters.category]);

  const columns = useMemo<ColumnDef<ActivityEntry>[]>(() => [
    { id: 'occurred_at', header: 'Date and time', meta: { cellClassName: 'whitespace-nowrap font-medium text-gray-600' }, cell: ({ row }) => formatDate(row.original.occurred_at) },
    {
      id: 'event',
      header: 'Event',
      cell: ({ row }) => {
        const detail = EVENT_DETAILS[row.original.event];
        const categoryLabel = categories.find(c => c[0] === row.original.category)?.[1] || formatLabel(row.original.category);
        return (
          <div>
            <p className="text-sm font-semibold text-gray-900">{detail?.label || formatLabel(row.original.event)}</p>
            <p className="text-xs text-gray-500 truncate max-w-xs">{detail?.description || categoryLabel}</p>
          </div>
        );
      },
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) => {
        const categoryLabel = categories.find(c => c[0] === row.original.category)?.[1] || formatLabel(row.original.category);
        return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{categoryLabel}</span>;
      },
    },
    {
      id: 'actor',
      header: 'Actor',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-gray-800">{row.original.actor?.name || 'System'}</p>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{row.original.actor?.role || 'system'}</p>
        </div>
      ),
    },
    {
      id: 'department',
      header: 'Department',
      meta: { cellClassName: 'font-medium text-gray-600' },
      cell: ({ row }) => (row.original.department_id ? departmentMap.get(row.original.department_id)?.department_code : null) || 'Institution-wide',
    },
  ], [departmentMap]);

  const table = useDataTable({ data: entries, columns, pageSize: false, enableSorting: false, getRowId: (entry) => entry.id });

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied(filters);
  };

  const clearFilters = () => {
    const empty = { search: '', category: '', event: '', department_id: '', actor_id: '', semester_id: '', from: '', to: '' };
    setFilters(empty);
    setApplied(empty);
    setPage(1);
  };

  const exportCsv = async () => {
    try {
      const response = await api.get('/activity-log', {
        params: { export: 'csv', ...Object.fromEntries(Object.entries(applied).filter(([, value]) => value)) },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vpaa-activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Unable to export the activity log.');
    }
  };

  return (
    <div id="activity-log-page" className="space-y-4">
      <form onSubmit={applyFilters} className="rounded-xl border border-gray-200 bg-white p-3 shadow-xs">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
            <Filter className="h-3.5 w-3.5 text-[#5A1220]" />
            Filter activity
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2.5 text-xs">
          <div className="flex flex-col gap-0.5 min-w-[140px] max-w-[200px] flex-1">
            <select
              aria-label="Category"
              value={filters.category}
              onChange={event => setFilters(current => ({ ...current, category: event.target.value, event: '' }))}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#5A1220]"
            >
              <option value="">All categories</option>
              {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-0.5 min-w-[150px] max-w-[200px] flex-1">
            <select
              aria-label="Event"
              value={filters.event}
              onChange={event => setFilters(current => ({ ...current, event: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#5A1220]"
            >
              <option value="">All event types</option>
              {availableEvents.map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-0.5 min-w-[150px] max-w-[220px] flex-1">
            <select
              aria-label="Department"
              value={filters.department_id}
              onChange={event => setFilters(current => ({ ...current, department_id: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#5A1220]"
            >
              <option value="">All departments</option>
              {departments.map(department => <option key={department.id} value={department.id}>{department.department_code} — {department.department_name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-0.5 min-w-[150px] max-w-[200px] flex-1">
            <select
              aria-label="Actor"
              value={filters.actor_id}
              onChange={event => setFilters(current => ({ ...current, actor_id: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#5A1220]"
            >
              <option value="">All actors / users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-0.5 min-w-[140px] max-w-[190px] flex-1">
            <select
              aria-label="Semester"
              value={filters.semester_id}
              onChange={event => setFilters(current => ({ ...current, semester_id: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#5A1220]"
            >
              <option value="">All semesters</option>
              {semesters.map(semester => <option key={semester.id} value={semester.id}>{semester.academic_year} · {semester.semester}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-0.5 w-[135px]">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">From</span>
            <input
              type="date"
              aria-label="From date"
              value={filters.from}
              onChange={event => setFilters(current => ({ ...current, from: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#5A1220]"
            />
          </div>

          <div className="flex flex-col gap-0.5 w-[135px]">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">To</span>
            <input
              type="date"
              aria-label="To date"
              value={filters.to}
              onChange={event => setFilters(current => ({ ...current, to: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#5A1220]"
            />
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-[#5A1220] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#47101a] transition cursor-pointer"
            >
              Apply
            </button>

            <button
              type="button"
              onClick={clearFilters}
              aria-label="Clear filters"
              title="Clear filters"
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-1.5 text-gray-500 hover:bg-gray-50 transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={loading || meta.total === 0}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-gray-500" />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => void loadEntries()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {error ? (
          <div role="alert" className="p-8 text-center">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <button onClick={() => void loadEntries()} className="mt-3 text-sm font-bold text-[#5A1220] hover:underline">Try again</button>
          </div>
        ) : (
          <DataTable
            table={table}
            variant="embedded"
            isLoading={loading}
            ariaLabel="Activity log"
            onRowClick={(entry) => setSelected(entry)}
            emptyState={
              <>
                <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 font-semibold text-gray-700">No activity found</p>
                <p className="mt-1 text-xs text-gray-500">Try clearing the filters or check again after system activity occurs.</p>
              </>
            }
          />
        )}
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-600">
          <span>{meta.total} event{meta.total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)} className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span>Page {meta.current_page} of {meta.last_page}</span>
            <button aria-label="Next page" disabled={page >= meta.last_page || loading} onClick={() => setPage(value => value + 1)} className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="activity-title" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-200 p-5">
              <div>
                <span className="inline-flex rounded-full bg-[#5A1220]/10 px-2.5 py-0.5 text-xs font-bold text-[#5A1220]">
                  {categories.find(c => c[0] === selected.category)?.[1] || formatLabel(selected.category)}
                </span>
                <h2 id="activity-title" className="mt-1.5 text-xl font-bold text-gray-900">
                  {EVENT_DETAILS[selected.event]?.label || formatLabel(selected.event)}
                </h2>
                <p className="mt-1 text-xs font-medium text-gray-600">
                  {EVENT_DETAILS[selected.event]?.description || ''}
                </p>
                <p className="mt-1 text-xs text-gray-400">{formatDate(selected.occurred_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close details" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-5 p-5 text-sm">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase text-gray-500">Actor</dt>
                  <dd className="mt-1 text-gray-900 font-semibold">{selected.actor?.name || 'System'} {selected.actor && <span className="text-gray-500 font-normal">({selected.actor.username})</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-gray-500">Role</dt>
                  <dd className="mt-1 capitalize text-gray-900 font-semibold">{selected.actor?.role || 'System'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-gray-500">Department</dt>
                  <dd className="mt-1 text-gray-900 font-semibold">{selected.department_id ? departmentMap.get(selected.department_id)?.department_name || `#${selected.department_id}` : 'Institution-wide'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-gray-500">Semester</dt>
                  <dd className="mt-1 text-gray-900 font-semibold">{selected.semester_id ? `${semesterMap.get(selected.semester_id)?.academic_year || ''} ${semesterMap.get(selected.semester_id)?.semester || `#${selected.semester_id}`}` : 'Not applicable'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-gray-500">Target Entity</dt>
                  <dd className="mt-1 text-gray-900 font-semibold">{formatLabel(selected.target.type)} {selected.target.id ? `#${selected.target.id}` : ''}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-gray-500">Event ID</dt>
                  <dd className="mt-1 font-mono text-xs text-gray-700">{selected.id}</dd>
                </div>
              </dl>
              <div>
                <h3 className="text-xs font-bold uppercase text-gray-500">Event metadata</h3>
                <pre className="mt-2 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">{JSON.stringify(selected.metadata, null, 2)}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
