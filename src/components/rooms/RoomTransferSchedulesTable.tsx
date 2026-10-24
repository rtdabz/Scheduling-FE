import { useMemo } from 'react';
import { getCoreRowModel, getPaginationRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import DataTable from '../ui/DataTable';
import { ROOM_TRANSFER_STATUS_LABELS, roomTransferDetailChanges, type RoomTransferRequest } from '../../lib/roomRecovery';
import { formatTime12h } from '../../lib/timeGrid';

type Status = RoomTransferRequest['status'];
type ScheduleRow = RoomTransferRequest['changes'][number] & { request: RoomTransferRequest };
const time = (row: ScheduleRow['before']) => `${row.day} ${formatTime12h(row.start_time)}–${formatTime12h(row.end_time)}`;
const statusClass = (status: Status) => status.startsWith('pending_') ? 'bg-amber-50 text-amber-900' : status.startsWith('rejected_') ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800';

export default function RoomTransferSchedulesTable({ requests, loading = false }: { requests: RoomTransferRequest[]; loading?: boolean }) {
  const rows = useMemo(() => requests.flatMap(request => roomTransferDetailChanges(request).map(change => ({ ...change, request }))), [requests]);
  const columns = useMemo<ColumnDef<ScheduleRow>[]>(() => [
    { id: 'class', header: 'Class / section', cell: ({ row: { original: row } }) => <div className="min-w-0 sm:min-w-36">
      <p className="font-bold text-slate-900">{row.course} · {row.section}</p>
      <p className="mt-1 text-xs font-normal text-slate-600">{row.request.semester_label}</p>
      <p className="mt-1 text-xs font-normal text-slate-600">Request {row.request.id.slice(0, 8)}</p>
      <div className="mt-3 space-y-2 text-xs font-normal sm:hidden">
        <p className="text-slate-600">Original: {row.before.room}<br />{time(row.before)}</p>
        <p className="font-semibold text-primary">Proposed: {row.after.room}<br />{time(row.after)}</p>
        <span className={`inline-block rounded-md px-2 py-1 text-[11px] font-semibold ${statusClass(row.request.status)}`}>{ROOM_TRANSFER_STATUS_LABELS[row.request.status]}</span>
        {row.request.rejection_reason && <p className="text-red-800">Rejection reason: {row.request.rejection_reason}</p>}
      </div>
    </div> },
    { id: 'original_room', header: 'Original room', meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' }, cell: ({ row }) => <span className="block min-w-24 font-normal text-slate-600">{row.original.before.room}</span> },
    { id: 'proposed_room', header: 'Proposed room', meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' }, cell: ({ row }) => <span className="block min-w-24 font-bold text-primary">{row.original.after.room}</span> },
    { id: 'time', header: 'Day & time', meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' }, cell: ({ row: { original: row } }) => <div className="min-w-44"><p className="font-normal text-slate-600">Original: {time(row.before)}</p><p className="mt-1 text-slate-800">Proposed: {time(row.after)}</p></div> },
    { id: 'status', header: 'Approval status', meta: { headerClassName: 'hidden sm:table-cell', cellClassName: 'hidden sm:table-cell' }, cell: ({ row }) => <div className="min-w-28"><span className={`inline-block rounded-md px-2 py-1 text-[11px] font-semibold ${statusClass(row.original.request.status)}`}>{ROOM_TRANSFER_STATUS_LABELS[row.original.request.status]}</span>{row.original.request.rejection_reason && <p className="mt-2 text-xs font-normal text-red-800">Rejection reason: {row.original.request.rejection_reason}</p>}</div> },
  ], []);
  const table = useReactTable({ data: rows, columns, defaultColumn: { enableSorting: false }, getCoreRowModel: getCoreRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 10 } } });
  return <DataTable table={table} isLoading={loading} ariaLabel="Submitted room transfer schedules" scrollAriaLabel="Submitted room transfer schedules scroll area" variant="embedded" density="compact" totalLabel="schedules" scrollClassName="max-h-[50dvh] overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" className="overflow-hidden rounded-lg border border-slate-200 [&_button]:min-h-10 [&_button]:min-w-10" tableClassName="sm:min-w-[900px]" emptyTitle="No submitted schedules with this status." emptyDescription="" />;
}
