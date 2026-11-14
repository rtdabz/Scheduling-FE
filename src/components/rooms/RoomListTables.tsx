import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Printer, Archive, Ban, CheckCircle2, ArrowLeftRight } from 'lucide-react';
import DataTable from '../ui/DataTable';
import { useDataTable } from '../ui/useDataTable';
import TableActionButton from '../ui/TableActionButton';
import type { RoomReassignmentActivity } from '../../lib/roomRecovery';

const classCount = (count: number) => `${count} ${count === 1 ? 'class' : 'classes'}`;

// Shown beside a room code while classes in that room are being reassigned.
export function RoomReassignBadge({ activity }: { activity?: RoomReassignmentActivity }) {
  if (!activity || (activity.needs === 0 && activity.pending === 0)) return null;
  const detail = [
    activity.needs > 0 && `${classCount(activity.needs)} need a replacement room`,
    activity.pending > 0 && `${classCount(activity.pending)} awaiting Dean or VPAA approval`,
  ].filter(Boolean).join(' · ');
  return (
    <span
      title={detail}
      aria-label={`Reassignment in progress: ${detail}`}
      className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-orange-700 whitespace-nowrap"
    >
      <ArrowLeftRight size={11} aria-hidden="true" />
      Reassigning
    </span>
  );
}

export interface BuildingListRow {
  name: string;
  totalCount: number;
  availableCount: number;
}

export interface RoomListRow {
  id: number;
  room_code: string;
  room_type: 'lecture' | 'laboratory' | 'online' | 'field';
  status: 'available' | 'not available';
  department: { department_code?: string | null } | null;
}

export interface RoomTodayStatus {
  status: string;
  text: string;
}

const roomTypeBadge: Record<RoomListRow['room_type'], string> = {
  lecture: 'bg-blue-50 text-blue-700 border-blue-200',
  laboratory: 'bg-purple-50 text-purple-700 border-purple-200',
  online: 'bg-green-50 text-green-700 border-green-200',
  field: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function BuildingsTable<T extends BuildingListRow>({
  buildings,
  onSelect,
  onEdit,
  onArchive,
  rowTourId,
}: {
  buildings: T[];
  onSelect: (building: T) => void;
  onEdit?: (building: T) => void;
  onArchive?: (building: T) => void;
  rowTourId?: string;
}) {
  const columns = useMemo<ColumnDef<T>[]>(() => [
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Building Name',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span className="text-sm font-bold text-gray-800">
          {row.original.name}
        </span>
      ),
    },
    { id: 'total', accessorKey: 'totalCount', header: 'Total Rooms', meta: { cellClassName: 'whitespace-nowrap text-gray-600' } },
    { id: 'available', accessorKey: 'availableCount', header: 'Available Rooms', meta: { cellClassName: 'whitespace-nowrap text-emerald-600' } },
    {
      id: 'unavailable',
      accessorFn: (building) => building.totalCount - building.availableCount,
      header: 'Unavailable Rooms',
      meta: { cellClassName: 'whitespace-nowrap text-red-600' },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { align: 'right', cellClassName: 'whitespace-nowrap', stopRowClick: true },
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <TableActionButton label="View Rooms" variant="view" onClick={() => onSelect(row.original)}>
            <Eye size={17} />
          </TableActionButton>
          {onEdit && (
            <TableActionButton label="Edit Building" variant="edit" onClick={() => onEdit(row.original)}>
              <Pencil size={15} />
            </TableActionButton>
          )}
          {onArchive && (
            <TableActionButton label="Archive Building" variant="archive" onClick={() => onArchive(row.original)}>
              <Archive size={15} />
            </TableActionButton>
          )}
        </div>
      ),
    },
  ], [onSelect, onEdit, onArchive]);

  const table = useDataTable<T>({ data: buildings, columns, pageSize: 10, getRowId: (building) => building.name });

  return (
    <DataTable
      table={table}
      className="font-sans"
      totalLabel="buildings"
      ariaLabel="Buildings"
      emptyTitle="No buildings found."
      emptyDescription="Try a different search or room type."
      onRowClick={onSelect}
      rowClassName={() => 'group'}
      getRowAttributes={rowTourId ? () => ({ 'data-tour': rowTourId }) : undefined}
    />
  );
}

export function RoomsTable<T extends RoomListRow>({
  rooms,
  getRoomStatusToday,
  canManage,
  onOpen,
  onEdit,
  onPrint,
  onAvailabilityChange,
  reassignActivity,
}: {
  rooms: T[];
  reassignActivity?: Record<string, RoomReassignmentActivity>;
  getRoomStatusToday: (roomId: number) => RoomTodayStatus;
  canManage: boolean;
  onOpen: (room: T) => void;
  onEdit: (room: T) => void;
  onPrint?: (room: T) => void;
  onAvailabilityChange: (room: T) => void;
}) {

  const columns: ColumnDef<T>[] = [
    {
      id: 'room_code',
      accessorKey: 'room_code',
      header: 'Room Code',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-lg border border-[#C9952A]/20">
            {row.original.room_code}
          </span>
          <RoomReassignBadge activity={reassignActivity?.[row.original.room_code]} />
        </div>
      ),
    },
    {
      id: 'department',
      accessorFn: (room) => room.department?.department_code || 'General / All',
      header: 'Department',
      meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap text-gray-600' },
    },
    {
      id: 'room_type',
      accessorKey: 'room_type',
      header: 'Room Type',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roomTypeBadge[row.original.room_type] ?? roomTypeBadge.lecture}`}>
          {row.original.room_type}
        </span>
      ),
    },
    {
      id: 'today',
      header: "Today's Status",
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        if (row.original.status === 'not available') {
          return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold capitalize text-red-700 whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Unavailable
            </span>
          );
        }
        const live = getRoomStatusToday(row.original.id);
        if (live.status === 'occupied') {
          return (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <p className="text-xs font-bold text-emerald-600 whitespace-nowrap" title={live.text}>{live.text}</p>
            </div>
          );
        }
        return (
          <p className="text-xs font-bold text-gray-500 whitespace-nowrap">
            Vacant
          </p>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { align: 'right' as const, cellClassName: 'whitespace-nowrap', stopRowClick: true },
      cell: ({ row }: { row: { original: T } }) => (
        <div className="flex justify-end gap-2">
          <TableActionButton label="View Room Details" variant="view" onClick={() => onOpen(row.original)}>
            <Eye size={17} />
          </TableActionButton>
          {onPrint && (
            <TableActionButton label="Print Room Timetable" variant="print" onClick={() => onPrint(row.original)}>
              <Printer size={15} />
            </TableActionButton>
          )}
          {canManage && (
            <>
              <TableActionButton label="Edit Room" variant="edit" onClick={() => onEdit(row.original)}>
                <Pencil size={15} />
              </TableActionButton>
              {!['online', 'field'].includes(row.original.room_type) && (
                <TableActionButton label={row.original.status === 'available' ? 'Mark Unavailable' : 'Mark Available'} variant={row.original.status === 'available' ? 'danger' : 'success'} onClick={() => onAvailabilityChange(row.original)}>
                  {row.original.status === 'available' ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                </TableActionButton>
              )}
            </>
          )}
        </div>
      ),
    } satisfies ColumnDef<T>,
  ];

  const table = useDataTable<T>({ data: rooms, columns, pageSize: 10, getRowId: (room) => String(room.id) });

  return (
    <DataTable
      table={table}
      className="font-sans"
      totalLabel="rooms"
      ariaLabel="Rooms"
      emptyTitle="No rooms found."
      emptyDescription="Try a different search or room type."
      onRowClick={onOpen}
      rowClassName={(room: T) => (room.status === 'not available' ? 'group bg-red-50/40' : 'group')}
    />
  );
}
