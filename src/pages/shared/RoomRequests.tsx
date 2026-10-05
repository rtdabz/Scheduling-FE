import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  Eye,
  Filter,
  LayoutGrid,
  List,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import RoomDetailContent from '../../components/ui/RoomDetailContent';
import SearchInput from '../../components/ui/SearchInput';
import Skeleton from '../../components/ui/Skeleton';
import TableActionButton from '../../components/ui/TableActionButton';
import { useToast } from '../../context/ToastContext';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import api from '../../lib/api';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import { apiErrorMessage } from '../../lib/apiError';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import {
  getStoredUserDepartmentId,
  hasStoredCapability,
} from '../../lib/storedUser';
import {
  FULL_DAY_NAMES,
  configureTimeGrid,
  formatTime12h,
  slotCount,
  slotToTime24h,
  slotToTimeLabel,
  timeToSlot,
} from '../../lib/timeGrid';
import {
  cancelRoomRequest,
  fetchRoomOccupancy,
  fetchRoomRequests,
  reviewRoomRequest,
  submitRoomRequest,
  type RoomOccupancyBlock,
  type RoomRequest,
  type RoomRequestStatus,
} from '../../lib/roomRequests';
import { useDataTable } from '../../components/ui/useDataTable';

type ViewMode = 'list' | 'grid';
type RoomType = 'lecture' | 'laboratory' | 'online' | 'field';
type ScheduleDay = (typeof FULL_DAY_NAMES)[number];

interface DepartmentRecord {
  id: number;
  department_name: string;
  department_code: string;
  rooms_count?: number;
  logo?: string | null;
}

interface RoomRecord {
  id: number;
  room_code: string;
  building: string | null;
  room_type: RoomType;
  status: 'available' | 'not available';
  department_id: number | null;
  department: DepartmentRecord | null;
}

interface ScheduleRecord {
  id: number;
  semester_id: number;
  section_id: number;
  course_id: number;
  faculty_id: number | null;
  room_id: number;
  department_id: number;
  day: ScheduleDay;
  start_time: string;
  end_time: string;
  mode: string;
  meeting_type?: 'lecture' | 'laboratory' | null;
  status: string;
  section?: { id: number; section_name: string } | null;
  course?: {
    id: number;
    course_code: string;
    course_name: string;
    course_category?: 'major' | 'minor';
    units?: number | string | null;
    lecture_hours?: number | string | null;
    lab_hours?: number | string | null;
  } | null;
  faculty?: {
    id: number;
    first_name: string;
    last_name: string;
    middle_name?: string | null;
  } | null;
}

interface RoomRequestsPageData {
  departments: DepartmentRecord[];
  rooms: RoomRecord[];
  schedules: ScheduleRecord[];
  requests: RoomRequest[];
  timeGrid: InitialDataResponse['time_grid'];
}

interface InitialDataResponse {
  schedules?: ScheduleRecord[];
  time_grid?: {
    opening_time?: string;
    closing_time?: string;
    field_end_time?: string;
    slot_minutes?: number;
    slot_count?: number;
  };
}

interface RequestRow {
  id: string;
  room: string;
  day: string;
  time: string;
  request: RoomRequest;
}

const ROOM_TYPE_STYLES: Record<RoomType, string> = {
  lecture: 'border-blue-200 bg-blue-50 text-blue-700',
  laboratory: 'border-purple-200 bg-purple-50 text-purple-700',
  online: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  field: 'border-amber-200 bg-amber-50 text-amber-700',
};

const formatRoomType = (value: RoomType) => value.charAt(0).toUpperCase() + value.slice(1);

const getOwnerId = (request: RoomRequest): number | null =>
  request.owner_department?.id ?? request.room?.department_id ?? null;

const STATUS_STYLES: Record<RoomRequestStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-600',
  revoked: 'border-orange-200 bg-orange-50 text-orange-700',
};

const formatDateCompact = (isoString?: string | null): string => {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return '-';
  }
};

/**
 * Mirrors the server's assertLendable: only another department's available
 * lecture rooms and laboratories can be borrowed. Shared rooms are already
 * usable, so they are never requested.
 */
const isLendable = (room: RoomRecord, departmentId: number | null) =>
  (room.room_type === 'lecture' || room.room_type === 'laboratory')
  && room.status === 'available'
  && room.department_id !== null
  && room.department_id !== departmentId;

/**
 * Vacant windows for one day, built from the occupancy endpoint so both the
 * room's classes and windows already lent to another department count.
 */
const makeTimeOptions = (day: string, blocks: RoomOccupancyBlock[]) => {
  const totalSlots = slotCount();
  const durationSlots = 3;
  const occupied = blocks
    .filter((block) => block.day === day)
    .map((block) => ({ start: timeToSlot(block.start_time), end: timeToSlot(block.end_time) }));

  return Array.from({ length: Math.max(0, totalSlots - durationSlots + 1) }, (_, startSlot) => {
    const endSlot = startSlot + durationSlots;
    const isOccupied = occupied.some((window) => window.start < endSlot && startSlot < window.end);
    return {
      start: slotToTime24h(startSlot),
      end: slotToTime24h(endSlot),
      label: `${slotToTimeLabel(startSlot)} - ${slotToTimeLabel(endSlot)}`,
      isOccupied,
    };
  }).filter((option) => !option.isOccupied);
};

export default function RoomRequests() {
  const { toast } = useToast();
  const canRequest = hasStoredCapability('room.request');
  const departmentId = getStoredUserDepartmentId();
  const mountedRef = useRef(true);

  // Rooms group, so room and room-request writes invalidate it. A cached copy
  // paints on a revisit while the mount fetch below replaces it.
  const cacheKey = `page:rooms:room-requests:${departmentId ?? 'all'}`;
  const [cached] = useState(() => {
    const data = getCachedData<RoomRequestsPageData>(cacheKey);
    if (data?.timeGrid) configureTimeGrid(data.timeGrid);
    return data;
  });
  const [departments, setDepartments] = useState<DepartmentRecord[]>(cached?.departments ?? []);
  const [rooms, setRooms] = useState<RoomRecord[]>(cached?.rooms ?? []);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>(cached?.schedules ?? []);
  const [requests, setRequests] = useState<RoomRequest[]>(cached?.requests ?? []);
  const [isLoading, setIsLoading] = useState(!cached);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [globalFilter, setGlobalFilter] = useState('');
  const [roomTypeFilter, setRoomTypeFilter] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentRecord | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomRecord | null>(null);
  const [requestRoom, setRequestRoom] = useState<RoomRecord | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [requestsModalTab, setRequestsModalTab] = useState<'all' | 'requester' | 'requestor'>('all');
  const [previewRequest, setPreviewRequest] = useState<RoomRequest | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent && !hasCachedData(cacheKey)) setIsLoading(true);
    try {
      const [departmentResponse, roomResponse, initialResponse] = await Promise.all([
        api.get<DepartmentRecord[]>('/departments'),
        api.get<RoomRecord[]>('/rooms'),
        api.get<InitialDataResponse>('/initial-data?include=schedules&schedule_limit=2000'),
      ]);
      const initialData = initialResponse.data;
      configureTimeGrid(initialData.time_grid);
      const roomData = Array.isArray(roomResponse.data) ? roomResponse.data : [];
      const departmentData = Array.isArray(departmentResponse.data) ? departmentResponse.data : [];

      if (mountedRef.current) {
        setDepartments(departmentData);
        setRooms(roomData);
        setSchedules(initialData.schedules ?? []);
      }

      // The department's own requests and the ones for its rooms.
      const requestData = await fetchRoomRequests();
      if (mountedRef.current) setRequests(requestData);
      setCachedData<RoomRequestsPageData>(cacheKey, {
        departments: departmentData,
        rooms: roomData,
        schedules: initialData.schedules ?? [],
        requests: requestData,
        timeGrid: initialData.time_grid,
      });
    } catch (error) {
      toast.error('Room Requests Unavailable', apiErrorMessage(error, 'The department and room workspace could not be loaded.'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [cacheKey, toast]);

  useEffect(() => {
    mountedRef.current = true;
    const task = window.setTimeout(() => { void loadData(); }, 0);
    return () => {
      window.clearTimeout(task);
      mountedRef.current = false;
    };
  }, [loadData]);

  useLiveRefresh(['rooms'], () => {
    void loadData(true);
  });

  const replaceRequest = (updated: RoomRequest) =>
    setRequests((current) => current.map((request) => (request.id === updated.id ? updated : request)));

  const pendingOwnRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending' && request.requesting_department?.id === departmentId).length,
    [departmentId, requests],
  );

  const pendingFromOthers = useMemo(
    () => requests.filter((request) => request.status === 'pending' && (request.requesting_department?.id !== departmentId || getOwnerId(request) === departmentId)).length,
    [departmentId, requests],
  );

  const pendingTotal = useMemo(
    () => pendingOwnRequests + pendingFromOthers,
    [pendingOwnRequests, pendingFromOthers],
  );

  const sortedDepartments = useMemo(() => {
    let result = [...departments].sort((a, b) => a.department_name.localeCompare(b.department_name));
    if (globalFilter.trim()) {
      const query = globalFilter.toLowerCase();
      result = result.filter((d) =>
        d.department_code.toLowerCase().includes(query) ||
        d.department_name.toLowerCase().includes(query),
      );
    }
    return result;
  }, [departments, globalFilter]);

  const departmentRooms = useMemo(() => {
    if (!selectedDepartment) return [];
    let result = rooms
      .filter((room) => room.department_id === selectedDepartment.id)
      .sort((a, b) => a.room_code.localeCompare(b.room_code, undefined, { numeric: true }));
    if (globalFilter.trim()) {
      const query = globalFilter.toLowerCase();
      result = result.filter((room) =>
        room.room_code.toLowerCase().includes(query) ||
        (room.building && room.building.toLowerCase().includes(query)),
      );
    }
    if (roomTypeFilter) {
      result = result.filter((room) => room.room_type === roomTypeFilter);
    }
    return result;
  }, [rooms, selectedDepartment, globalFilter, roomTypeFilter]);

  const openDepartment = (department: DepartmentRecord) => {
    setSelectedDepartment(department);
    setSelectedRoom(null);
    setViewMode('list');
  };

  const handleSubmitted = (request: RoomRequest, message: string) => {
    setRequests((current) => [request, ...current]);
    setRequestRoom(null);
    toast.success('Request Submitted', message);
  };

  const lendableRooms = useMemo(
    () => rooms.filter((room) => isLendable(room, departmentId)),
    [departmentId, rooms],
  );

  const departmentColumns = useMemo<ColumnDef<DepartmentRecord>[]>(() => [
    {
      id: 'department',
      accessorFn: (department) => `${department.department_code} ${department.department_name}`,
      header: 'Department',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#4e0a10]/5 text-[#4e0a10] flex items-center justify-center transition-colors">
            <Building2 size={16} />
          </div>
          <div>
            <span className="text-sm font-bold text-gray-800">{row.original.department_code}</span>
            <p className="text-xs font-semibold text-gray-500">{row.original.department_name}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'rooms',
      accessorFn: (department) => rooms.filter((room) => room.department_id === department.id).length,
      header: 'Assigned Rooms',
      meta: { cellClassName: 'whitespace-nowrap text-gray-600' },
    },
    {
      id: 'actions',
      header: 'Actions',
      size: 60,
      enableSorting: false,
      meta: { align: 'right', stopRowClick: true, cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <TableActionButton
          label={`View ${row.original.department_code} rooms`}
          variant="view"
          onClick={() => openDepartment(row.original)}
        >
          <Eye size={15} />
        </TableActionButton>
      ),
    },
  ], [rooms]);

  const departmentTable = useDataTable({
    data: sortedDepartments,
    columns: departmentColumns,
    pageSize: 10,
    getRowId: (row) => String(row.id),
  });

  const roomColumns = useMemo<ColumnDef<RoomRecord>[]>(() => [
    {
      id: 'room_code',
      accessorKey: 'room_code',
      header: 'Room Code',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span className="text-xs font-mono font-bold bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-lg border border-[#C9952A]/20">
          {row.original.room_code}
        </span>
      ),
    },
    {
      id: 'building',
      accessorFn: (room) => room.building || 'Unassigned',
      header: 'Building',
      meta: { cellClassName: 'whitespace-nowrap text-gray-600' },
    },
    {
      id: 'room_type',
      accessorKey: 'room_type',
      header: 'Room Type',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${ROOM_TYPE_STYLES[row.original.room_type]}`}>
          {formatRoomType(row.original.room_type)}
        </span>
      ),
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <span className={`font-bold ${row.original.status === 'available' ? 'text-emerald-600' : 'text-gray-500'}`}>
          {row.original.status === 'available' ? 'Available' : 'Not available'}
        </span>
      ),
    },
  ], []);

  const roomTable = useDataTable({
    data: departmentRooms,
    columns: roomColumns,
    pageSize: 10,
    getRowId: (row) => String(row.id),
  });

  const renderDepartmentGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {sortedDepartments.map((department) => {
        const assignedRooms = rooms.filter((room) => room.department_id === department.id);
        return (
          <article
            key={department.id}
            className={`bg-white border border-gray-100 rounded-2xl p-6 shadow-sm cursor-pointer flex flex-col justify-between space-y-4 group relative overflow-hidden font-sans ${GRID_CARD_HOVER}`}
            onClick={() => openDepartment(department)}
          >
            {/* Centered Background Department Watermark Logo */}
            {department.logo && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 p-4 overflow-hidden">
                <img
                  src={department.logo}
                  alt="Department Watermark"
                  className="w-36 h-36 max-w-[75%] max-h-[75%] object-contain opacity-[0.32] select-none transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            )}
            <div className="flex items-center justify-between relative z-10">
              <div className="w-12 h-12 rounded-xl bg-[#4e0a10]/5 text-[#4e0a10] flex items-center justify-center">
                <Building2 size={24} />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider bg-gray-50 text-gray-500 border border-gray-150 px-2 py-0.5 rounded-full">
                {assignedRooms.length} {assignedRooms.length === 1 ? 'room' : 'rooms'}
              </span>
            </div>
            <div className="relative z-10">
              <h3 className="text-base font-bold text-gray-800 font-sans leading-tight">{department.department_code}</h3>
              <p className="text-xs text-gray-400 mt-1 font-semibold">{department.department_name}</p>
            </div>
          </article>
        );
      })}
      {sortedDepartments.length === 0 && (
        <EmptyState title="No departments found" description="Try adjusting your search criteria." />
      )}
    </div>
  );

  const renderRooms = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSelectedDepartment(null)}
            className="p-2 text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-lg font-bold text-gray-855 font-sans">{selectedDepartment?.department_code} Rooms</h2>
            <p className="text-xs text-gray-400 font-sans font-semibold">Viewing rooms in {selectedDepartment?.department_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider bg-[#4e0a10]/5 text-[#4e0a10] border border-[#4e0a10]/15 px-3 py-1 rounded-full w-max font-sans">
            {departmentRooms.length} {departmentRooms.length === 1 ? 'Room' : 'Rooms'} Total
          </span>
        </div>
      </div>

      {departmentRooms.length === 0 ? (
        <div className="py-16 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl bg-white font-sans">
          <p className="text-base font-semibold">No rooms match your search in this department.</p>
          <p className="text-xs">Adjust search parameters or check another department.</p>
        </div>
      ) : viewMode === 'list' ? (
        <DataTable
          table={roomTable}
          className="font-sans"
          totalLabel="rooms"
          ariaLabel="Assigned rooms"
          emptyTitle="No rooms assigned"
          emptyDescription="This department has no assigned rooms."
          onRowClick={setSelectedRoom}
          rowClassName={() => 'group'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departmentRooms.map((room) => {
            const deptLogo = room.department?.logo || (room.department_id ? departments.find((d) => d.id === room.department_id)?.logo : null) || selectedDepartment?.logo || null;

            return (
              <div
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className={`bg-white border border-gray-150 rounded-2xl p-5 shadow-sm cursor-pointer flex flex-col justify-between space-y-4 group relative overflow-hidden font-sans ${GRID_CARD_HOVER}`}
              >
                {/* Centered Background Department Watermark Logo */}
                {deptLogo && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 p-4 overflow-hidden">
                    <img
                      src={deptLogo}
                      alt="Department Watermark"
                      className="w-36 h-36 max-w-[75%] max-h-[75%] object-contain opacity-[0.32] select-none transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="flex items-start justify-between relative z-10">
                  <div className="space-y-1">
                    <span className="text-sm font-mono font-bold bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-lg uppercase border border-[#C9952A]/20">
                      {room.room_code}
                    </span>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider pt-1.5 font-semibold">
                      {room.department?.department_code ? `${room.department.department_code} Department` : 'General / All'}
                    </p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${ROOM_TYPE_STYLES[room.room_type]}`}>
                    {formatRoomType(room.room_type)}
                  </span>
                </div>
                <p className="text-sm font-semibold text-gray-500 relative z-10">{room.building || 'Building unassigned'}</p>
                <div className="border-t border-gray-100 pt-3 flex items-center justify-between relative z-10">
                  <span className={`font-bold text-xs ${room.status === 'available' ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {room.status === 'available' ? 'Available' : 'Not available'}
                  </span>
                  {canRequest && isLendable(room, departmentId) && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setRequestRoom(room); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#5A1220] px-3 py-1.5 text-[10px] font-extrabold text-white transition hover:bg-[#4e0a10] cursor-pointer"
                    >
                      <Send size={12} /> Request
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const filterBar = (
    <div className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between font-sans">
      <SearchInput
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        placeholder={selectedDepartment ? 'Search rooms...' : 'Search departments...'}
      />
      <div className="flex flex-wrap items-center gap-3">
        <RequestsButton
          label="Requests"
          icon={ClipboardList}
          title="View room requests"
          count={pendingTotal}
          onClick={() => {
            setRequestsModalTab('all');
            setShowRequests(true);
          }}
        />
        {selectedDepartment && (
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <select
              value={roomTypeFilter}
              onChange={(e) => setRoomTypeFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
            >
              <option value="">All Types</option>
              <option value="lecture">Lecture</option>
              <option value="laboratory">Laboratory</option>
            </select>
          </div>
        )}

        <div className="flex items-center bg-gray-100/90 border border-gray-200 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-[#5A1220] text-white shadow-sm font-bold'
                : 'text-gray-500 hover:text-gray-800'
            }`}
            title="Grid View"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-all duration-200 cursor-pointer ${
              viewMode === 'list'
                ? 'bg-[#5A1220] text-white shadow-sm font-bold'
                : 'text-gray-500 hover:text-gray-800'
            }`}
            title="List View"
          >
            <List size={15} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => { setIsLoading(true); void loadData(); }}
          disabled={isLoading}
          aria-label="Refresh"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-extrabold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>
  );

  if (selectedRoom) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setSelectedRoom(null)}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 shadow-sm transition hover:bg-gray-50 cursor-pointer"
          >
            <ArrowLeft size={16} />
            {selectedDepartment?.department_code ?? 'Rooms'}
          </button>
          {canRequest && isLendable(selectedRoom, departmentId) && (
            <button
              type="button"
              onClick={() => setRequestRoom(selectedRoom)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5A1220] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#4e0a10] cursor-pointer"
            >
              <Send size={16} />
              Request Room
            </button>
          )}
        </div>
        <RoomDetailContent
          room={{ ...selectedRoom, building: selectedRoom.building ?? '' }}
          schedules={schedules}
          isLoading={false}
          initialViewMode="grid"
        />
        {requestRoom && (
          <RequestRoomModal
            room={requestRoom}
            rooms={lendableRooms}
            onClose={() => setRequestRoom(null)}
            onSubmitted={handleSubmitted}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {filterBar}

      {selectedDepartment ? (
        renderRooms()
      ) : isLoading ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4 shadow-sm animate-pulse">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
                <Skeleton className="h-1.5 w-full rounded" />
                <div className="flex justify-between items-center">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden font-sans">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        )
      ) : viewMode === 'list' ? (
        <DataTable
          table={departmentTable}
          className="font-sans"
          totalLabel="departments"
          ariaLabel="Departments"
          emptyTitle="No departments found"
          emptyDescription="There are no departments available for room requests."
          onRowClick={openDepartment}
          rowClassName={() => 'group'}
        />
      ) : (
        renderDepartmentGrid()
      )}

      {/* Modals */}
      {showRequests && (
        <RequestsModal
          requests={requests}
          departmentId={departmentId}
          initialTab={requestsModalTab}
          onClose={() => setShowRequests(false)}
          onPreview={setPreviewRequest}
        />
      )}

      {previewRequest && (
        <RequestPreviewModal
          request={previewRequest}
          departmentId={departmentId}
          onClose={() => setPreviewRequest(null)}
          onChanged={(updated) => {
            replaceRequest(updated);
            setPreviewRequest(null);
          }}
        />
      )}

      {requestRoom && (
        <RequestRoomModal
          room={requestRoom}
          rooms={lendableRooms}
          onClose={() => setRequestRoom(null)}
          onSubmitted={handleSubmitted}
        />
      )}
    </div>
  );
}


function RequestsButton({
  label = 'Requests',
  icon: Icon = ClipboardList,
  count,
  onClick,
  title,
}: {
  label?: string;
  icon?: LucideIcon;
  count: number;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-2 rounded-lg border border-[#5A1220]/20 bg-[#5A1220]/[0.04] px-3 py-2 text-xs font-extrabold text-[#5A1220] transition hover:bg-[#5A1220]/[0.1] cursor-pointer"
    >
      <Icon size={14} />
      {label}
      <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] ${count > 0 ? 'bg-[#C9952A] text-white font-extrabold' : 'bg-gray-200 text-gray-600 font-bold'}`}>
        {count}
      </span>
    </button>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center shadow-sm">
      <CalendarDays size={24} className="mx-auto text-gray-300" />
      <p className="mt-3 text-sm font-extrabold text-gray-700">{title}</p>
      <p className="mt-1 text-xs font-semibold text-gray-400">{description}</p>
    </div>
  );
}

function RequestRoomModal({
  room,
  rooms,
  onClose,
  onSubmitted,
}: {
  room: RoomRecord;
  rooms: RoomRecord[];
  onClose: () => void;
  onSubmitted: (request: RoomRequest, message: string) => void;
}) {
  const { toast } = useToast();
  const [roomId, setRoomId] = useState(String(room.id));
  const [day, setDay] = useState<ScheduleDay>('Monday');
  const [time, setTime] = useState('');
  const [purpose, setPurpose] = useState('');
  const [occupancy, setOccupancy] = useState<{ roomId: number; blocks: RoomOccupancyBlock[] } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedRoom = rooms.find((candidate) => candidate.id === Number(roomId)) ?? room;
  const isLoadingOccupancy = occupancy?.roomId !== selectedRoom.id;

  useEffect(() => {
    let active = true;
    fetchRoomOccupancy(selectedRoom.id)
      .then((data) => {
        if (active) setOccupancy({ roomId: selectedRoom.id, blocks: data.occupied });
      })
      .catch((error) => {
        if (!active) return;
        setOccupancy({ roomId: selectedRoom.id, blocks: [] });
        toast.error('Occupancy Unavailable', apiErrorMessage(error, 'The room\'s timetable could not be loaded.'));
      });
    return () => { active = false; };
  }, [selectedRoom.id, toast]);

  const availableTimes = useMemo(
    () => (isLoadingOccupancy ? [] : makeTimeOptions(day, occupancy?.blocks ?? [])),
    [day, isLoadingOccupancy, occupancy],
  );
  const firstTime = availableTimes[0] ? `${availableTimes[0].start}-${availableTimes[0].end}` : '';
  const selectedTime = availableTimes.some((option) => `${option.start}-${option.end}` === time) ? time : firstTime;
  const canSubmit = selectedTime !== '' && purpose.trim() !== '' && !isSubmitting;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    const [start_time, end_time] = selectedTime.split('-');
    setIsSubmitting(true);
    try {
      const result = await submitRoomRequest({
        room_id: selectedRoom.id,
        purpose: purpose.trim(),
        windows: [{ day, start_time, end_time }],
      });
      onSubmitted(result.data, result.message);
    } catch (error) {
      toast.error('Request Failed', apiErrorMessage(error, 'The room request could not be submitted.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Request Room"
      description="Choose a day and an available time window. The department that owns the room reviews your request."
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="room-request-form"
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-[#5A1220] px-4 py-2 text-sm font-extrabold text-white hover:bg-[#4e0a10] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <Send size={15} />
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      }
    >
      <form id="room-request-form" onSubmit={(event) => void submit(event)} className="space-y-5 p-5">
        <label className="block text-sm font-bold text-gray-700">
          Room
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220]"
          >
            {rooms.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.room_code} - {candidate.department?.department_code ?? 'General'}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold text-gray-700">
          Day
          <select
            value={day}
            onChange={(event) => setDay(event.target.value as ScheduleDay)}
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220]"
          >
            {FULL_DAY_NAMES.map((weekday) => (
              <option key={weekday} value={weekday}>{weekday}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-bold text-gray-700">
          Available Time
          <select
            value={selectedTime}
            onChange={(event) => setTime(event.target.value)}
            disabled={availableTimes.length === 0}
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220] disabled:bg-gray-100"
          >
            {isLoadingOccupancy ? (
              <option value="">Checking the room's timetable...</option>
            ) : availableTimes.length === 0 ? (
              <option value="">No available windows</option>
            ) : (
              availableTimes.map((option) => (
                <option key={`${option.start}-${option.end}`} value={`${option.start}-${option.end}`}>
                  {option.label}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="block text-sm font-bold text-gray-700">
          Purpose
          <textarea
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. IT 1A laboratory classes; our laboratories are fully booked."
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220]"
          />
        </label>
      </form>
    </Modal>
  );
}

function RequestsModal({
  requests,
  departmentId,
  initialTab = 'all',
  onClose,
  onPreview,
}: {
  requests: RoomRequest[];
  departmentId: number | null;
  initialTab?: 'all' | 'requester' | 'requestor';
  onClose: () => void;
  onPreview: (request: RoomRequest) => void;
}) {
  const [filterTab, setFilterTab] = useState<'all' | 'requester' | 'requestor'>(initialTab);

  const activeRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending' || request.status === 'approved'),
    [requests],
  );

  const requesterRequests = useMemo(
    () => activeRequests.filter((r) => departmentId == null || r.requesting_department?.id === departmentId),
    [activeRequests, departmentId],
  );

  const requestorRequests = useMemo(
    () => activeRequests.filter((r) => departmentId == null || getOwnerId(r) === departmentId || r.requesting_department?.id !== departmentId),
    [activeRequests, departmentId],
  );

  const filteredRequests = useMemo(() => {
    if (filterTab === 'requester') return requesterRequests;
    if (filterTab === 'requestor') return requestorRequests;
    return activeRequests;
  }, [filterTab, requesterRequests, requestorRequests, activeRequests]);

  const rows = useMemo<RequestRow[]>(
    () =>
      filteredRequests.flatMap((request) =>
        request.windows.map((window, index) => ({
          id: `${request.id}-${index}`,
          room: request.room?.room_code ?? 'Room unavailable',
          day: window.day,
          time: `${formatTime12h(window.start_time)} - ${formatTime12h(window.end_time)}`,
          request,
        })),
      ),
    [filteredRequests],
  );

  const columns = useMemo<ColumnDef<RequestRow>[]>(
    () => [
      {
        id: 'room',
        accessorKey: 'room',
        header: 'Room',
        size: 110,
        meta: { cellClassName: 'whitespace-nowrap font-mono font-bold text-[#4e0a10]' },
        cell: ({ getValue }) => <span>{getValue<string>()}</span>,
      },
      {
        id: 'requester',
        accessorFn: (row) => row.request.requesting_department?.code ?? '',
        header: 'Requested By',
        size: 120,
        meta: { cellClassName: 'whitespace-nowrap font-semibold text-gray-700' },
        cell: ({ getValue }) => <span>{getValue<string>() || '-'}</span>,
      },
      {
        id: 'owner',
        accessorFn: (row) => row.request.owner_department?.code ?? '',
        header: 'Room Owner',
        size: 120,
        meta: { cellClassName: 'whitespace-nowrap font-semibold text-gray-700' },
        cell: ({ getValue }) => <span>{getValue<string>() || '-'}</span>,
      },
      {
        id: 'day',
        accessorKey: 'day',
        header: 'Day',
        size: 90,
        meta: { cellClassName: 'whitespace-nowrap font-semibold text-gray-700' },
        cell: ({ getValue }) => <span>{getValue<string>()}</span>,
      },
      {
        id: 'time',
        accessorKey: 'time',
        header: 'Time',
        size: 140,
        meta: { cellClassName: 'whitespace-nowrap font-semibold text-gray-700 text-xs' },
        cell: ({ getValue }) => <span>{getValue<string>()}</span>,
      },
      {
        id: 'status',
        accessorFn: (row) => row.request.status,
        header: 'Status',
        size: 90,
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => <StatusBadge status={row.original.request.status} />,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        size: 50,
        meta: { align: 'right', stopRowClick: true, cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <TableActionButton
            label={`View request for ${row.original.room}`}
            variant="view"
            onClick={() => onPreview(row.original.request)}
          >
            <Eye size={15} />
          </TableActionButton>
        ),
      },
    ],
    [onPreview],
  );

  const table = useDataTable({ data: rows, columns, pageSize: false, getRowId: (row) => row.id });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Room Requests"
      description="Pending and approved room requests sent to or from your department."
      size="xl"
      className="max-w-4xl sm:max-w-5xl w-full"
    >
      <div className="p-5 font-sans space-y-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-150 pb-3">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'all'
                ? 'bg-[#5A1220] text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            All
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filterTab === 'all' ? 'bg-white/20 text-white font-extrabold' : 'bg-gray-100 text-gray-600 font-bold'}`}>
              {activeRequests.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('requester')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'requester'
                ? 'bg-[#5A1220] text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Send size={12} />
            Requester
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filterTab === 'requester' ? 'bg-white/20 text-white font-extrabold' : 'bg-gray-100 text-gray-600 font-bold'}`}>
              {requesterRequests.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('requestor')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'requestor'
                ? 'bg-[#5A1220] text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Building2 size={12} />
            Requestor
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filterTab === 'requestor' ? 'bg-white/20 text-white font-extrabold' : 'bg-gray-100 text-gray-600 font-bold'}`}>
              {requestorRequests.length}
            </span>
          </button>
        </div>

        <DataTable
          table={table}
          showPagination={false}
          totalLabel="requests"
          ariaLabel="Room requests"
          emptyTitle="No active requests"
          emptyDescription={
            filterTab === 'requester'
              ? 'No active requests sent by your department.'
              : filterTab === 'requestor'
                ? 'No active requests received from other departments.'
                : 'New room requests will appear here.'
          }
          density="compact"
          scrollClassName="overflow-x-auto lg:overflow-x-visible"
        />
      </div>
    </Modal>
  );
}

function RequestPreviewModal({
  request,
  departmentId,
  onClose,
  onChanged,
}: {
  request: RoomRequest;
  departmentId: number | null;
  onClose: () => void;
  onChanged: (request: RoomRequest) => void;
}) {
  const { toast, confirm } = useToast();
  const [remarks, setRemarks] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Only the secretary of the department that owns the room decides; the VPAA only watches.
  const canReview = hasStoredCapability('room.review_requests') && departmentId !== null && getOwnerId(request) === departmentId;
  const isOwn = hasStoredCapability('room.request') && departmentId !== null && request.requesting_department?.id === departmentId;
  const isPending = request.status === 'pending';
  const isApproved = request.status === 'approved';
  const needsRemarks = canReview && (isPending || isApproved);
  const roomCode = request.room?.room_code ?? 'the room';

  const run = async (action: () => Promise<{ message: string; data: RoomRequest }>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const result = await action();
      toast.success('Room Request', result.message);
      onChanged(result.data);
    } catch (error) {
      toast.error('Action Failed', apiErrorMessage(error, 'The request could not be updated.'));
    } finally {
      setIsBusy(false);
    }
  };

  const approve = async () => {
    const confirmed = await confirm({
      title: 'Approve Room Request',
      message: `${request.requesting_department?.code ?? 'The department'} will be able to schedule classes in ${roomCode} during the requested windows.`,
      eyebrow: 'Room Request',
      confirmLabel: 'Approve',
      variant: 'success',
    });
    if (confirmed) await run(() => reviewRoomRequest(request.id, 'approve', remarks.trim()));
  };

  // Rejecting and revoking are as final as approving, and used to act on the
  // first click while approving asked first.
  const reject = async () => {
    const confirmed = await confirm({
      title: 'Reject Room Request',
      message: `${request.requesting_department?.code ?? 'The department'} will not be able to use ${roomCode} for these windows.`,
      eyebrow: 'Room Request',
      confirmLabel: 'Reject',
      variant: 'danger',
    });
    if (confirmed) await run(() => reviewRoomRequest(request.id, 'reject', remarks.trim()));
  };

  const revoke = async () => {
    const confirmed = await confirm({
      title: 'Revoke Room Grant',
      message: `${request.requesting_department?.code ?? 'The department'} will lose access to ${roomCode}. This is refused while it still has classes in the room.`,
      eyebrow: 'Room Request',
      confirmLabel: 'Revoke',
      variant: 'danger',
    });
    if (confirmed) await run(() => reviewRoomRequest(request.id, 'revoke', remarks.trim()));
  };

  const cancel = async () => {
    const confirmed = await confirm({
      title: isApproved ? 'Give Back Room' : 'Cancel Request',
      message: isApproved
        ? `Your department will no longer be able to schedule into ${roomCode}. Move any classes out of it first.`
        : `Withdraw your request for ${roomCode}?`,
      eyebrow: 'Room Request',
      confirmLabel: isApproved ? 'Give Back' : 'Cancel Request',
      cancelLabel: 'Keep',
      variant: 'warning',
    });
    if (confirmed) await run(() => cancelRoomRequest(request.id));
  };

  const actionClass =
    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

  return (
    <Modal isOpen onClose={onClose} title="Room Request" description={`${request.requesting_department?.code ?? 'Unknown'} requesting ${roomCode}`} size="sm" footer={
      <div className="flex w-full flex-wrap justify-end gap-2">
        {isOwn && (isPending || isApproved) && (
          <button type="button" disabled={isBusy} onClick={() => void cancel()} className={`${actionClass} border-gray-200 text-gray-700 hover:bg-gray-50`}><Trash2 size={15} /> {isApproved ? 'Give Back' : 'Cancel Request'}</button>
        )}
        {canReview && isPending && (
          <>
            <button type="button" disabled={isBusy || remarks.trim() === ''} onClick={() => void reject()} className={`${actionClass} border-red-200 text-red-700 hover:bg-red-50`}><X size={15} /> Reject</button>
            <button type="button" disabled={isBusy} onClick={() => void approve()} className={`${actionClass} border-transparent bg-[#5A1220] text-white hover:bg-[#4e0a10]`}><Check size={15} /> Approve</button>
          </>
        )}
        {canReview && isApproved && (
          <button type="button" disabled={isBusy || remarks.trim() === ''} onClick={() => void revoke()} className={`${actionClass} border-red-200 text-red-700 hover:bg-red-50`}><Undo2 size={15} /> Revoke</button>
        )}
        <button type="button" onClick={onClose} className={`${actionClass} border-gray-200 text-gray-700 hover:bg-gray-50`}>Close</button>
      </div>
    }>
      <div className="space-y-3 p-5 text-sm font-sans">
        <DetailLine label="Status" value={<StatusBadge status={request.status} />} />
        <DetailLine label="Room" value={request.room?.room_code ?? 'Room unavailable'} />
        <DetailLine label="Requested By" value={request.requesting_department?.code ?? 'Not specified'} />
        <DetailLine label="Owner Department" value={request.owner_department?.code ?? 'Not specified'} />
        {request.windows.length === 0 && <DetailLine label="Schedule" value="Not specified" />}
        {request.windows.map((window, index) => (
          <DetailLine
            key={`${window.day}-${window.start_time}-${index}`}
            label={index === 0 ? 'Schedule' : ''}
            value={`${window.day}, ${formatTime12h(window.start_time)} - ${formatTime12h(window.end_time)}`}
          />
        ))}
        {request.requester && <DetailLine label="Requester" value={request.requester.name} />}
        {request.reviewer && <DetailLine label="Reviewer" value={request.reviewer.name} />}
        {request.reviewed_at && (
          <DetailLine label="Reviewed Date" value={formatDateCompact(request.reviewed_at)} />
        )}
        {request.purpose && (
          <p className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-sm text-gray-700">
            <span className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">Purpose</span>
            {request.purpose}
          </p>
        )}
        {request.review_remarks && (
          <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
            <span className="font-bold">Remarks:</span> {request.review_remarks}
          </p>
        )}
        {needsRemarks && (
          <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
            Remarks {isPending ? '(required to reject)' : '(required to revoke)'}
            {isApproved && (
              <span className="mt-1 block normal-case tracking-normal font-semibold text-orange-700">
                A grant cannot be revoked while the department still has classes in the room.
              </span>
            )}
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={3}
              maxLength={1000}
              className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-gray-700 outline-none focus:border-[#5A1220]"
            />
          </label>
        )}
      </div>
    </Modal>
  );
}

function StatusBadge({ status }: { status: RoomRequestStatus }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-white px-3 py-2.5">
      <span className="text-xs font-extrabold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="text-right text-sm font-bold text-[#4e0a10]">{value}</span>
    </div>
  );
}
