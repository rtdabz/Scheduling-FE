import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, KeyRound, RefreshCw, ShieldAlert } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import api from '../../../lib/api';
import Badge from '../../../components/ui/Badge';
import DataTable from '../../../components/ui/DataTable';
import TableActionButton from '../../../components/ui/TableActionButton';
import { useDataTable } from '../../../components/ui/useDataTable';
import { formatDay, formatTime } from './activityLogModel';
import LoginFiltersForm from './LoginFiltersForm';
import {
  failureReason, locationLabel, LOGIN_STATUSES, loginDetailsPath, loginParams, loginUserName, loginUserRole,
  type LoginEntry, type LoginFilters, type LoginHistoryResponse,
} from './loginActivityModel';
import { SECONDARY_BUTTON } from './styles';

const numberFormat = new Intl.NumberFormat('en-PH');
const PER_PAGE = 25;

type Props = { filters: LoginFilters; onFiltersChange: (filters: LoginFilters) => void };

export default function LoginHistory({ filters, onFiltersChange }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [response, setResponse] = useState<LoginHistoryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.get<LoginHistoryResponse>('/activity-log/login-history', { params: { page, per_page: PER_PAGE, ...loginParams(filters) } });
      setResponse(result.data);
    } catch (loadError: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(loadError) ? loadError.response?.data?.message : undefined;
      setError(message || 'Login history could not be loaded. Check your connection, then try again.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const columns = useMemo<ColumnDef<LoginEntry>[]>(() => [
    {
      id: 'occurred_at',
      header: 'Date and time',
      size: 140,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="tabular-nums">
          <p className="text-xs font-semibold text-gray-800">{formatDay(row.original.occurred_at)}</p>
          <p className="text-[11px] text-gray-500">{formatTime(row.original.occurred_at)}</p>
        </div>
      ),
    },
    {
      id: 'user',
      header: 'User',
      size: 200,
      cell: ({ row }) => (
        <div className="min-w-[9rem]">
          <p className={`truncate text-xs font-semibold ${row.original.user?.name ? 'text-gray-900' : 'text-gray-500'}`}>{loginUserName(row.original)}</p>
          <p className="truncate text-[11px] text-gray-500">{loginUserRole(row.original)}</p>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      size: 160,
      cell: ({ row }) => {
        const status = LOGIN_STATUSES[row.original.status];
        const reason = failureReason(row.original.reason);
        return (
          <div>
            <Badge tone={status.tone} dot>{status.label}</Badge>
            {reason && <p className="mt-0.5 text-[11px] text-gray-500">{reason}</p>}
          </div>
        );
      },
    },
    {
      id: 'location',
      header: 'Approximate location',
      cell: ({ row }) => {
        const { location, ip_address } = row.original;
        return (
          <div className="min-w-[10rem]">
            <p className={`flex items-center gap-1 text-xs ${location.status === 'resolved' ? 'font-medium text-gray-800' : 'text-gray-500'}`}>
              {locationLabel(location)}
              {location.is_proxy && <ShieldAlert aria-label="VPN, proxy or hosting network" className="h-3.5 w-3.5 text-amber-600" />}
            </p>
            <p className="font-mono text-[11px] text-gray-500">{ip_address ?? 'IP not recorded'}</p>
          </div>
        );
      },
    },
    {
      id: 'client',
      header: 'Device and browser',
      size: 190,
      meta: { hideBelow: 'md' },
      cell: ({ row }) => (
        <div>
          <p className="text-xs text-gray-800">{row.original.client.device} · {row.original.client.os}</p>
          <p className="text-[11px] text-gray-500">{row.original.client.browser}</p>
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      size: 56,
      meta: { align: 'center', stopRowClick: true },
      cell: ({ row }) => (
        <TableActionButton
          label="View sign-in details"
          variant="view"
          onClick={() => navigate(loginDetailsPath(row.original.id), { state: { from: `${location.pathname}${location.search}` } })}
        >
          <Eye className="h-4 w-4" />
        </TableActionButton>
      ),
    },
  ], [navigate, location.pathname, location.search]);

  const entries = response?.data ?? [];
  const table = useDataTable({ data: entries, columns, pageSize: false, enableSorting: false, getRowId: entry => String(entry.id) });
  const meta = response?.meta;

  return (
    <div className="space-y-4">
      <LoginFiltersForm applied={filters} users={meta?.facets.users ?? []} onApply={next => { setPage(1); onFiltersChange(next); }} />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
          <p className="text-xs text-gray-600" aria-live="polite">
            <span className="font-semibold text-gray-900">{numberFormat.format(meta?.total ?? 0)}</span> sign-in attempt{meta?.total === 1 ? '' : 's'}
            {meta && meta.summary.failed > 0 && <span className="text-gray-500"> · {numberFormat.format(meta.summary.failed)} failed</span>}
          </p>
          <button type="button" onClick={() => void load()} disabled={loading} className={SECONDARY_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error ? (
          <div role="alert" className="p-10 text-center">
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <button type="button" onClick={() => void load()} className="mt-3 text-sm font-bold text-[#701522] hover:underline">Try again</button>
          </div>
        ) : (
          <DataTable
            table={table}
            variant="embedded"
            isLoading={loading}
            loadingRows={8}
            ariaLabel="Login history"
            onRowClick={(entry) => navigate(loginDetailsPath(entry.id), { state: { from: `${location.pathname}${location.search}` } })}
            emptyState={
              <div className="mx-auto max-w-sm">
                <KeyRound className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 text-sm font-semibold text-gray-800">No sign-in attempts found</p>
                <p className="mt-1 text-xs text-gray-500">Remove a filter or widen the date range to see more.</p>
              </div>
            }
          />
        )}

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-2.5 text-xs font-medium text-gray-500">
          <span className="tabular-nums">Page {meta?.current_page ?? 1} of {meta?.last_page ?? 1}</span>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" onClick={() => setPage(value => value - 1)} disabled={page <= 1 || loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft size={15} />
            </button>
            <button type="button" aria-label="Next page" onClick={() => setPage(value => value + 1)} disabled={page >= (meta?.last_page ?? 1) || loading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
