import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, ClipboardList, Download, Filter, RefreshCw, Search, X } from 'lucide-react';
import api from '../../lib/api';
import Skeleton from '../../components/ui/Skeleton';

type Actor = { id: number; name: string; username: string; role: string };
type ActivityEntry = {
  id: string;
  source: 'authentication' | 'scheduling';
  category: string;
  event: string;
  occurred_at: string;
  actor: Actor | null;
  department_id: number | null;
  term_id: number | null;
  target: { type: string; id: number | null };
  metadata: Record<string, unknown>;
};
type ActivityResponse = {
  data: ActivityEntry[];
  meta: { current_page: number; per_page: number; total: number; last_page: number };
};
type Department = { id: number; department_code: string; department_name: string };
type Term = { id: number; academic_year: string; semester: string };

const categories = [
  ['authentication', 'Authentication'],
  ['user_management', 'User Management'],
  ['scheduling', 'Recommendations'],
  ['schedule_workflow', 'Schedule Workflow'],
  ['faculty_assignment', 'Faculty Assignment'],
] as const;

const formatLabel = (value: string) => value.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const formatDate = (value: string) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
}).format(new Date(value));

export default function ActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ActivityResponse['meta']>({ current_page: 1, per_page: 25, total: 0, last_page: 1 });
  const [filters, setFilters] = useState({ search: '', category: '', department_id: '', term_id: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);

  useEffect(() => {
    Promise.all([
      api.get<Department[]>('/departments'),
      api.get<Term[]>('/terms'),
    ]).then(([departmentResponse, termResponse]) => {
      setDepartments(departmentResponse.data);
      setTerms(termResponse.data);
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

  // The request synchronizes the page with the selected server-side filters.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadEntries(); }, [loadEntries]);

  const departmentMap = useMemo(() => new Map(departments.map(department => [department.id, department])), [departments]);
  const termMap = useMemo(() => new Map(terms.map(term => [term.id, term])), [terms]);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied(filters);
  };

  const clearFilters = () => {
    const empty = { search: '', category: '', department_id: '', term_id: '', from: '', to: '' };
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
    <div className="space-y-5 pb-8">
      <div className="flex justify-end">
        <div className="flex gap-2"><button onClick={() => void exportCsv()} disabled={loading || meta.total === 0} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Download className="h-4 w-4" />Export CSV</button><button onClick={() => void loadEntries()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
      </div>

      <form onSubmit={applyFilters} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-800"><Filter className="h-4 w-4 text-[#5A1220]" />Filter activity</div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="relative xl:col-span-2">
            <span className="sr-only">Search activity</span>
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input value={filters.search} onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} placeholder="Search event, actor or ID" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-[#5A1220] focus:outline-none focus:ring-1 focus:ring-[#5A1220]" />
          </label>
          <select aria-label="Category" value={filters.category} onChange={event => setFilters(current => ({ ...current, category: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All categories</option>
            {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Department" value={filters.department_id} onChange={event => setFilters(current => ({ ...current, department_id: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All departments</option>
            {departments.map(department => <option key={department.id} value={department.id}>{department.department_code}</option>)}
          </select>
          <select aria-label="Term" value={filters.term_id} onChange={event => setFilters(current => ({ ...current, term_id: event.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">All terms</option>
            {terms.map(term => <option key={term.id} value={term.id}>{term.academic_year} · {term.semester}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-lg bg-[#5A1220] px-4 py-2 text-sm font-semibold text-white hover:bg-[#47101a]">Apply</button>
            <button type="button" onClick={clearFilters} aria-label="Clear filters" className="rounded-lg border border-gray-300 px-3 text-gray-600 hover:bg-gray-50"><X className="h-4 w-4" /></button>
          </div>
          <label className="text-xs font-medium text-gray-600">From<input type="date" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800" /></label>
          <label className="text-xs font-medium text-gray-600">To<input type="date" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800" /></label>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {error ? <div role="alert" className="p-8 text-center"><p className="text-sm font-semibold text-red-700">{error}</p><button onClick={() => void loadEntries()} className="mt-3 text-sm font-bold text-[#5A1220] hover:underline">Try again</button></div>
          : loading ? <div className="space-y-3 p-6" aria-busy="true" aria-label="Loading activity">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex items-center gap-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" /></div>)}</div>
          : entries.length === 0 ? <div className="p-12 text-center"><ClipboardList className="mx-auto h-10 w-10 text-gray-300" /><p className="mt-3 font-semibold text-gray-700">No activity found</p><p className="mt-1 text-sm text-gray-500">Try clearing the filters or check again after system activity occurs.</p></div>
          : <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-bold uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Date and time</th><th className="px-5 py-3">Event</th><th className="px-5 py-3">Actor</th><th className="px-5 py-3">Department</th><th className="px-5 py-3">Source</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{entries.map(entry => {
              const department = entry.department_id ? departmentMap.get(entry.department_id) : null;
              return <tr key={entry.id} onClick={() => setSelected(entry)} className="cursor-pointer hover:bg-amber-50/40">
                <td className="whitespace-nowrap px-5 py-4 text-gray-600">{formatDate(entry.occurred_at)}</td>
                <td className="px-5 py-4"><p className="font-semibold text-gray-900">{formatLabel(entry.event)}</p><p className="text-xs text-gray-500">{formatLabel(entry.category)}</p></td>
                <td className="px-5 py-4"><p className="font-medium text-gray-800">{entry.actor?.name || 'System'}</p><p className="text-xs uppercase text-gray-500">{entry.actor?.role || 'system'}</p></td>
                <td className="px-5 py-4 text-gray-600">{department?.department_code || 'Institution-wide'}</td>
                <td className="px-5 py-4"><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{formatLabel(entry.source)}</span></td>
              </tr>;
            })}</tbody>
          </table></div>}
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-600">
          <span>{meta.total} event{meta.total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2"><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)} className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>Page {meta.current_page} of {meta.last_page}</span><button aria-label="Next page" disabled={page >= meta.last_page || loading} onClick={() => setPage(value => value + 1)} className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div>
        </div>
      </div>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="activity-title" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
          <div className="flex items-start justify-between border-b border-gray-200 p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-[#5A1220]">{formatLabel(selected.category)}</p><h2 id="activity-title" className="mt-1 text-xl font-bold text-gray-900">{formatLabel(selected.event)}</h2><p className="mt-1 text-sm text-gray-500">{formatDate(selected.occurred_at)}</p></div><button onClick={() => setSelected(null)} aria-label="Close details" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
          <div className="space-y-5 p-5 text-sm">
            <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase text-gray-500">Actor</dt><dd className="mt-1 text-gray-900">{selected.actor?.name || 'System'} {selected.actor && <span className="text-gray-500">({selected.actor.username})</span>}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-500">Role</dt><dd className="mt-1 capitalize text-gray-900">{selected.actor?.role || 'System'}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-500">Department</dt><dd className="mt-1 text-gray-900">{selected.department_id ? departmentMap.get(selected.department_id)?.department_name || `#${selected.department_id}` : 'Institution-wide'}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-500">Term</dt><dd className="mt-1 text-gray-900">{selected.term_id ? `${termMap.get(selected.term_id)?.academic_year || ''} ${termMap.get(selected.term_id)?.semester || `#${selected.term_id}`}` : 'Not applicable'}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-500">Target</dt><dd className="mt-1 text-gray-900">{formatLabel(selected.target.type)} {selected.target.id ? `#${selected.target.id}` : ''}</dd></div><div><dt className="text-xs font-bold uppercase text-gray-500">Event ID</dt><dd className="mt-1 font-mono text-xs text-gray-700">{selected.id}</dd></div></dl>
            <div><h3 className="text-xs font-bold uppercase text-gray-500">Event metadata</h3><pre className="mt-2 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">{JSON.stringify(selected.metadata, null, 2)}</pre></div>
          </div>
        </div>
      </div>}
    </div>
  );
}
