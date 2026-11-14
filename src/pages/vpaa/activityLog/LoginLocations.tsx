import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Info, MapPin, RefreshCw } from 'lucide-react';
import api from '../../../lib/api';
import LoginDetails from './LoginDetails';
import LoginFiltersForm from './LoginFiltersForm';
import LoginMap from './LoginMap';
import { groupByLocation, loginParams, type LoginFilters, type LoginLocationsResponse } from './loginActivityModel';
import { SECONDARY_BUTTON } from './styles';

const numberFormat = new Intl.NumberFormat('en-PH');

type Props = { filters: LoginFilters; onFiltersChange: (filters: LoginFilters) => void };

export default function LoginLocations({ filters, onFiltersChange }: Props) {
  const [response, setResponse] = useState<LoginLocationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get<LoginLocationsResponse>('/activity-log/login-locations', { params: loginParams(filters) });
      setResponse(result.data);
    } catch (loadError: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(loadError) ? loadError.response?.data?.message : undefined;
      setError(message || 'Sign-in locations could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const groups = useMemo(() => groupByLocation(response?.data ?? []), [response]);
  const selected = groups.find(group => group.key === selectedKey) ?? null;
  const meta = response?.meta;
  const unlocated = meta ? meta.total - meta.located : 0;

  const cells = [
    { label: 'Sign-in attempts', value: meta?.total, accent: 'bg-[#701522]' },
    { label: 'Shown on map', value: meta?.located, accent: 'bg-sky-500' },
    { label: 'Failed attempts', value: meta?.summary.failed, accent: 'bg-red-500' },
    { label: 'Distinct users', value: meta?.summary.users, accent: 'bg-emerald-500' },
  ];

  return (
    <div className="space-y-4">
      <LoginFiltersForm applied={filters} users={meta?.facets.users ?? []} onApply={next => { setSelectedKey(null); onFiltersChange(next); }} />

      <section aria-label="Sign-in location summary" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-100 lg:grid-cols-4">
        {cells.map(cell => (
          <div key={cell.label} className="bg-white px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${cell.accent}`} />
              <span className="text-[11px] font-medium text-gray-500">{cell.label}</span>
            </div>
            <p className="mt-1 font-jakarta text-xl font-bold tabular-nums text-gray-900">
              {cell.value === undefined ? <span className="inline-block h-5 w-10 animate-pulse rounded bg-gray-100 align-middle" /> : numberFormat.format(cell.value)}
            </p>
          </div>
        ))}
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-sm font-bold text-[#701522] hover:underline">Try again</button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
              <p className="text-xs text-gray-600" aria-live="polite">
                <span className="font-semibold text-gray-900">{numberFormat.format(groups.length)}</span> location{groups.length === 1 ? '' : 's'}
                {unlocated > 0 && <span className="text-gray-500"> · {numberFormat.format(unlocated)} attempt{unlocated === 1 ? '' : 's'} without a location</span>}
              </p>
              <button type="button" onClick={() => void load()} disabled={loading} className={SECONDARY_BUTTON}>
                <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <div className="h-[28rem]">
              <LoginMap groups={groups} selectedKey={selectedKey} onSelect={setSelectedKey} />
            </div>
            {meta?.truncated && (
              <p className="border-t border-gray-100 bg-amber-50 px-4 py-2 text-[11px] font-medium text-amber-800">
                Showing the latest {numberFormat.format(meta.max_points)} located sign-ins. Narrow the date range to see older ones.
              </p>
            )}
          </div>

          <aside aria-label="Location details" className="flex max-h-[33rem] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {selected ? (
              <>
                <div className="border-b border-gray-200 px-4 py-3">
                  <button type="button" onClick={() => setSelectedKey(null)} className="mb-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#701522] hover:underline">
                    <ArrowLeft className="h-3 w-3" /> All locations
                  </button>
                  <h3 className="text-sm font-semibold text-gray-900">{selected.label}</h3>
                  <p className="text-[11px] text-gray-500">
                    {selected.entries.length} sign-in{selected.entries.length === 1 ? '' : 's'}{selected.failed ? ` · ${selected.failed} failed` : ''} · approximate
                  </p>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50/60 p-3">
                  {selected.entries.map(entry => <LoginDetails key={entry.id} entry={entry} />)}
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-gray-200 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">Locations</h3>
                  <p className="text-[11px] text-gray-500">Select a pin or a location to see who signed in from there.</p>
                </div>
                <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
                  {loading && !response && Array.from({ length: 4 }, (_, index) => (
                    <li key={index} className="px-4 py-3"><span className="block h-4 w-2/3 animate-pulse rounded bg-gray-100" /></li>
                  ))}
                  {!loading && groups.length === 0 && (
                    <li className="px-4 py-10 text-center">
                      <MapPin className="mx-auto h-8 w-8 text-gray-300" />
                      <p className="mt-2 text-xs font-semibold text-gray-800">No located sign-ins</p>
                      <p className="mt-1 text-[11px] text-gray-500">Sign-ins from private networks, or where the lookup failed, are listed in Login History.</p>
                    </li>
                  )}
                  {groups.map(group => (
                    <li key={group.key}>
                      <button type="button" onClick={() => setSelectedKey(group.key)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#F5E9EA]/50 focus:outline-none focus-visible:bg-[#F5E9EA]/60">
                        <MapPin aria-hidden="true" className={`h-4 w-4 shrink-0 ${group.failed === group.entries.length ? 'text-red-600' : group.failed ? 'text-amber-600' : 'text-[#701522]'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-gray-900">{group.label}</span>
                          <span className="block text-[11px] text-gray-500">{group.failed ? `${group.failed} failed` : 'All successful'}</span>
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-700">{group.entries.length}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      )}

      <p className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-[11px] leading-relaxed text-sky-900">
        <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          Locations are estimated from the sign-in IP address and are accurate to about the city level. Mobile data, VPNs and campus networks can place a pin at the provider's location instead.
          WICARS does not use device GPS. Location details are deleted after {meta?.retention_days ?? 90} days; the sign-in record itself stays in the audit log.
        </span>
      </p>
    </div>
  );
}
