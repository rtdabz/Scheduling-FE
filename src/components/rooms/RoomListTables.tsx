import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, Pencil, Printer, Trash2 } from 'lucide-react';
import DataTable from '../ui/DataTable';
import { useDataTable } from '../ui/useDataTable';
import TableActionButton from '../ui/TableActionButton';

/*
 * The Rooms list views shared by the VPAA, Dean, Program Head and Secretary
 * pages. Each page keeps its own filtering and building grouping; these only
 * render the rows it hands over.
 */

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

const percentAvailable = (building: BuildingListRow) =>
  building.totalCount > 0 ? Math.round((building.availableCount / building.totalCount) * 100) : 0;

const roomTypeBadge: Record<RoomListRow['room_type'], string> = {
  lecture: 'bg-blue-50 text-blue-700 border-blue-200',
  laboratory: 'bg-purple-50 text-purple-700 border-purple-200',
  online: 'bg-green-50 text-green-700 border-green-200',
  field: 'bg-amber-50 text-amber-700 border-amber-200',
};

const hoverAccent = 'border-l-4 border-l-transparent transition-all group-hover:border-l-[#C9952A]';

export function BuildingsTable<T extends BuildingListRow>({
  buildings,
  onSelect,
  rowTourId,
}: {
  buildings: T[];
  onSelect: (building: T) => void;
  /** `data-tour` value on each building row, for the guided tour. */
  rowTourId?: string;
}) {
  const columns = useMemo<ColumnDef<T>[]>(() => [
    {
      id: 'name',
      accessorKey: 'name',
      header: 'Building Name',
      meta: { cellClassName: `whitespace-nowrap ${hoverAccent}` },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#4e0a10]/5 text-[#4e0a10] group-hover:bg-[#C9952A]/15 group-hover:text-[#C9952A] flex items-center justify-center transition-colors">
            <Building2 size={16} />
          </div>
          <span className="text-sm font-bold text-gray-800 group-hover:text-[#C9952A] transition-colors">
            {row.original.name}
          </span>
        </div>
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
      id: 'availability',
      accessorFn: percentAvailable,
      header: 'Availability',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ getValue }) => (
        <div className="flex items-center gap-3 max-w-xs">
          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#4e0a10] rounded-full" style={{ width: `${getValue<number>()}%` }} />
          </div>
          <span className="text-xs font-bold text-gray-500">{getValue<number>()}%</span>
        </div>
      ),
    },
  ], []);

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
  onArchive,
  onPrint,
}: {
  rooms: T[];
  getRoomStatusToday: (roomId: number) => RoomTodayStatus;
  canManage: boolean;
  onOpen: (room: T) => void;
  onEdit: (room: T) => void;
  onArchive: (room: T) => void;
  /** Adds a Print Room Timetable action; pages without printing omit it. */
  onPrint?: (room: T) => void;
}) {
  const hasActions = canManage || Boolean(onPrint);

  // Rebuilt each render: "Today's Status" reads the live clock and schedules.
  const columns: ColumnDef<T>[] = [
    {
      id: 'room_code',
      accessorKey: 'room_code',
      header: 'Room Code',
      meta: { cellClassName: `whitespace-nowrap ${hoverAccent}` },
      cell: ({ row }) => (
        <span className="text-xs font-mono font-bold bg-[#C9952A]/10 text-[#C9952A] group-hover:bg-[#C9952A] group-hover:text-white px-2.5 py-1 rounded-lg border border-[#C9952A]/20 transition-all">
          {row.original.room_code}
        </span>
      ),
    },
    {
      id: 'department',
      accessorFn: (room) => room.department?.department_code || 'General / All',
      header: 'Department',
      meta: { cellClassName: 'whitespace-nowrap text-gray-600' },
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
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
          row.original.status === 'not available' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'
        }`}>
          {row.original.status}
        </span>
      ),
    },
    {
      id: 'today',
      header: "Today's Status",
      enableSorting: false,
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const live = getRoomStatusToday(row.original.id);
        if (live.status === 'occupied') {
          return (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <p className="text-xs font-bold text-emerald-600 max-w-[200px] truncate">{live.text}</p>
            </div>
          );
        }
        return (
          <p className={`text-xs font-bold max-w-[200px] truncate ${live.status === 'upcoming' ? 'text-amber-600' : 'text-gray-500'}`}>
            {live.text}
          </p>
        );
      },
    },
    ...(hasActions ? [{
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { align: 'right' as const, cellClassName: 'whitespace-nowrap', stopRowClick: true },
      cell: ({ row }: { row: { original: T } }) => (
        <div className="flex justify-end gap-2">
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
              <TableActionButton label="Archive Room" variant="danger" onClick={() => onArchive(row.original)}>
                <Trash2 size={15} />
              </TableActionButton>
            </>
          )}
        </div>
      ),
    } satisfies ColumnDef<T>] : []),
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
      rowClassName={() => 'group'}
    />
  );
}
