import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  ClipboardList,
  Eye,
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
  type RoomOccupancySchedule,
  type RoomRequest,
  type RoomRequestStatus,
} from '../../lib/roomRequests';
import { useDataTable } from '../../components/ui/useDataTable';
import { parseLinkedSlots, type LinkedSlot } from '../../lib/notificationLink';

type ViewMode = 'list' | 'grid';
type RequestsTab = 'requester' | 'owner';
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

interface RoomRequestsPageData {
  departments: DepartmentRecord[];
  rooms: RoomRecord[];
  requests: RoomRequest[];
  timeGrid: InitialDataResponse['time_grid'];
}

interface InitialDataResponse {
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

const isLectureRoom = (room: RoomRecord) => room.room_type === 'lecture';

const isLendable = (room: RoomRecord, departmentId: number | null) =>
  isLectureRoom(room)
  && room.status === 'available'
  && room.department_id !== null
  && room.department_id !== departmentId;

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

  const cacheKey = `page:rooms:room-requests:${departmentId ?? 'all'}`;
  const [cached] = useState(() => {
    const data = getCachedData<RoomRequestsPageData>(cacheKey);
    if (data?.timeGrid) configureTimeGrid(data.timeGrid);
    return data;
  });
  const [departments, setDepartments] = useState<DepartmentRecord[]>(cached?.departments ?? []);
  const [rooms, setRooms] = useState<RoomRecord[]>((cached?.rooms ?? []).filter(isLectureRoom));
  const [requests, setRequests] = useState<RoomRequest[]>(cached?.requests ?? []);
  const [isLoading, setIsLoading] = useState(!cached);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [globalFilter, setGlobalFilter] = useState('');
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
        api.get<InitialDataResponse>('/initial-data?include=departments'),
      ]);
      const initialData = initialResponse.data;
      configureTimeGrid(initialData.time_grid);
      const roomData = (Array.isArray(roomResponse.data) ? roomResponse.data : []).filter(isLectureRoom);
      const departmentData = Array.isArray(departmentResponse.data) ? departmentResponse.data : [];

      if (mountedRef.current) {
        setDepartments(departmentData);
        setRooms(roomData);
      }

      const requestData = await fetchRoomRequests();
      if (mountedRef.current) setRequests(requestData);
      setCachedData<RoomRequestsPageData>(cacheKey, {
        departments: departmentData,
        rooms: roomData,
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

  const [roomSchedules, setRoomSchedules] = useState<{ roomId: number; schedules: RoomOccupancySchedule[] } | null>(null);
  const [roomScheduleVersion, setRoomScheduleVersion] = useState(0);
  const selectedRoomId = selectedRoom?.id ?? null;

  useEffect(() => {
    if (selectedRoomId === null) return;
    let active = true;
    fetchRoomOccupancy(selectedRoomId)
      .then((data) => {
        if (active) setRoomSchedules({ roomId: selectedRoomId, schedules: data.schedules });
      })
      .catch((error) => {
        if (!active) return;
        setRoomSchedules({ roomId: selectedRoomId, schedules: [] });
        toast.error('Timetable Unavailable', apiErrorMessage(error, "The room's timetable could not be loaded."));
      });
    return () => { active = false; };
  }, [selectedRoomId, roomScheduleVersion, toast]);

  useLiveRefresh(['rooms'], () => {
    void loadData(true);
    setRoomScheduleVersion((version) => version + 1);
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const linkedRoomId = Number(searchParams.get('room')) || null;
  const [handledRoomLink, setHandledRoomLink] = useState<number | null>(null);
  const [linkedHighlight, setLinkedHighlight] = useState<{ roomId: number; slots: LinkedSlot[]; seq: number } | null>(null);
  if (linkedRoomId === null && handledRoomLink !== null) setHandledRoomLink(null);
  if (linkedRoomId !== null && linkedRoomId !== handledRoomLink && rooms.length > 0) {
    setHandledRoomLink(linkedRoomId);
    const room = rooms.find((candidate) => candidate.id === linkedRoomId);
    if (room) {
      setGlobalFilter('');
      setSelectedDepartment(departments.find((candidate) => candidate.id === room.department_id) ?? room.department ?? null);
      setSelectedRoom(room);
      setLinkedHighlight((current) => ({ roomId: room.id, slots: parseLinkedSlots(searchParams.get('slots')), seq: (current?.seq ?? 0) + 1 }));
    }
  }
  useEffect(() => {
    if (handledRoomLink === null || linkedRoomId !== handledRoomLink) return;
    setSearchParams((params) => {
      params.delete('room');
      params.delete('slots');
      return params;
    }, { replace: true });
  }, [handledRoomLink, linkedRoomId, setSearchParams]);

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
    let result = departments
      .filter((department) => department.id !== departmentId)
      .sort((a, b) => a.department_name.localeCompare(b.department_name));
    if (globalFilter.trim()) {
      const query = globalFilter.toLowerCase();
      result = result.filter((d) =>
        d.department_code.toLowerCase().includes(query) ||
        d.department_name.toLowerCase().includes(query),
      );
    }
    return result;
  }, [departments, departmentId, globalFilter]);

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
    return result;
  }, [rooms, selectedDepartment, globalFilter]);

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
        <RequestsButton count={pendingFromOthers} onClick={() => setShowRequests(true)} />

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
            aria-label={`Back to ${selectedDepartment?.department_code ?? 'rooms'}`}
            title={`Back to ${selectedDepartment?.department_code ?? 'rooms'}`}
            className="p-2 w-fit text-gray-500 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft size={16} />
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
          key={linkedHighlight?.seq ?? 0}
          room={{ ...selectedRoom, building: selectedRoom.building ?? '' }}
          schedules={roomSchedules?.roomId === selectedRoom.id ? roomSchedules.schedules : []}
          isLoading={roomSchedules?.roomId !== selectedRoom.id}
          initialViewMode="grid"
          highlightSlots={linkedHighlight?.roomId === selectedRoom.id ? linkedHighlight.slots : undefined}
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

      {showRequests && (
        <RequestsModal
          requests={requests}
          departmentId={departmentId}
          onClose={() => setShowRequests(false)}
          onPreview={setPreviewRequest}
          onChanged={replaceRequest}
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
            placeholder="e.g. IT 1A lecture classes; our lecture rooms are fully booked."
            className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220]"
          />
        </label>
      </form>
    </Modal>
  );
}

function useGiveBack(onChanged: (request: RoomRequest) => void) {
  const { toast, confirm } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  const giveBack = async (request: RoomRequest) => {
    if (busyId !== null) return;
    const roomCode = request.room?.room_code ?? 'the room';
    const isApproved = request.status === 'approved';
    const confirmed = await confirm({
      title: isApproved ? 'Give Back Room' : 'Cancel Request',
      message: isApproved
        ? `Your department will no longer be able to schedule into ${roomCode}. Classes you hold in it under this grant will become Room TBA.`
        : `Withdraw your request for ${roomCode}?`,
      eyebrow: 'Room Request',
      confirmLabel: isApproved ? 'Give Back' : 'Cancel Request',
      cancelLabel: 'Keep',
      variant: 'warning',
    });
    if (!confirmed) return;

    setBusyId(request.id);
    try {
      const result = await cancelRoomRequest(request.id);
      toast.success('Room Request', result.message);
      onChanged(result.data);
    } catch (error) {
      toast.error('Action Failed', apiErrorMessage(error, 'The request could not be updated.'));
    } finally {
      setBusyId(null);
    }
  };

  return { giveBack, busyId };
}

const canGiveBack = (request: RoomRequest, departmentId: number | null): boolean =>
  hasStoredCapability('room.request')
  && departmentId !== null
  && request.requesting_department?.id === departmentId
  && (request.status === 'pending' || request.status === 'approved');

function RequestsModal({
  requests,
  departmentId,
  onClose,
  onPreview,
  onChanged,
}: {
  requests: RoomRequest[];
  departmentId: number | null;
  onClose: () => void;
  onPreview: (request: RoomRequest) => void;
  onChanged: (request: RoomRequest) => void;
}) {
  const { giveBack, busyId } = useGiveBack(onChanged);
  const activeRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending' || request.status === 'approved'),
    [requests],
  );
  const sentRequests = useMemo(
    () => activeRequests.filter((request) => request.requesting_department?.id === departmentId),
    [activeRequests, departmentId],
  );
  const receivedRequests = useMemo(
    () => activeRequests.filter((request) => getOwnerId(request) === departmentId),
    [activeRequests, departmentId],
  );
  const hasTabs = departmentId !== null;
  const [tab, setTab] = useState<RequestsTab>(() =>
    receivedRequests.some((request) => request.status === 'pending') ? 'owner' : 'requester',
  );
  const visibleRequests = !hasTabs ? activeRequests : tab === 'requester' ? sentRequests : receivedRequests;

  const rows = useMemo<RequestRow[]>(
    () =>
      visibleRequests
        .flatMap((request) =>
          request.windows.map((window, index) => ({
            id: `${request.id}-${index}`,
            room: request.room?.room_code ?? 'Room unavailable',
            day: window.day,
            time: `${formatTime12h(window.start_time)} - ${formatTime12h(window.end_time)}`,
            request,
          })),
        ),
    [visibleRequests],
  );

  const columns = useMemo<ColumnDef<RequestRow>[]>(
    () => {
      const all: ColumnDef<RequestRow>[] = [
        {
          id: 'room',
          accessorKey: 'room',
          header: 'Room',
          cell: ({ getValue }) => <span className="font-mono font-bold text-[#4e0a10]">{getValue<string>()}</span>,
        },
        {
          id: 'requester',
          accessorFn: (row) => row.request.requesting_department?.code ?? '',
          header: 'Requested By',
          cell: ({ getValue }) => <span className="font-semibold text-gray-700">{getValue<string>() || '-'}</span>,
        },
        {
          id: 'owner',
          accessorFn: (row) => row.request.owner_department?.code ?? '',
          header: 'Room Owner',
          cell: ({ getValue }) => <span className="font-semibold text-gray-700">{getValue<string>() || '-'}</span>,
        },
        {
          id: 'day',
          accessorKey: 'day',
          header: 'Day',
          cell: ({ getValue }) => <span className="font-semibold text-gray-700">{getValue<string>()}</span>,
        },
        {
          id: 'time',
          accessorKey: 'time',
          header: 'Time',
          cell: ({ getValue }) => <span className="font-semibold text-gray-700">{getValue<string>()}</span>,
        },
        {
          id: 'status',
          accessorFn: (row) => row.request.status,
          header: 'Status',
          cell: ({ row }) => <StatusBadge status={row.original.request.status} />,
        },
        {
          id: 'actions',
          header: 'Actions',
          enableSorting: false,
          meta: { align: 'right', stopRowClick: true },
          cell: ({ row }) => {
            const { request } = row.original;
            const isApproved = request.status === 'approved';
            return (
              <div className="flex justify-end gap-1.5">
                <TableActionButton
                  label={`View request for ${row.original.room}`}
                  variant="view"
                  onClick={() => onPreview(request)}
                  className="!w-auto gap-1.5 px-3 text-xs font-extrabold"
                >
                  <Eye size={15} />
                  View
                </TableActionButton>
                {canGiveBack(request, departmentId) && (
                  <TableActionButton
                    label={isApproved ? `Give back ${row.original.room}` : `Cancel request for ${row.original.room}`}
                    variant="remove"
                    disabled={busyId !== null}
                    onClick={() => void giveBack(request)}
                    className="!w-auto gap-1.5 px-3 text-xs font-extrabold"
                  >
                    <Undo2 size={15} />
                    {isApproved ? 'Give Back' : 'Cancel'}
                  </TableActionButton>
                )}
              </div>
            );
          },
        },
      ];
      const hidden = tab === 'requester' ? 'requester' : 'owner';
      return hasTabs ? all.filter((column) => column.id !== hidden) : all;
    },
    [onPreview, departmentId, busyId, giveBack, hasTabs, tab],
  );

  const table = useDataTable({ data: rows, columns, pageSize: false, getRowId: (row) => row.id });

  const tabButtonClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all duration-200 cursor-pointer ${
      active ? 'bg-[#5A1220] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
    }`;
  const tabCountClass = (active: boolean) =>
    `min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Room Requests"
      description="Pending and approved room requests sent to or from your department."
      size="lg"
      className="!max-w-4xl"
    >
      <div className="space-y-4 p-5 font-sans">
        {hasTabs && (
          <div className="flex w-max items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/90 p-1" role="tablist" aria-label="Room request view">
            <button type="button" role="tab" aria-selected={tab === 'requester'} onClick={() => setTab('requester')} className={tabButtonClass(tab === 'requester')}>
              Requester
              <span className={tabCountClass(tab === 'requester')}>{sentRequests.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === 'owner'} onClick={() => setTab('owner')} className={tabButtonClass(tab === 'owner')}>
              Requestor
              <span className={tabCountClass(tab === 'owner')}>{receivedRequests.length}</span>
            </button>
          </div>
        )}
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
  const [remarksMissing, setRemarksMissing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const remarksRef = useRef<HTMLTextAreaElement>(null);

  const canReview = hasStoredCapability('room.review_requests') && departmentId !== null && getOwnerId(request) === departmentId;
  const isOwn = canGiveBack(request, departmentId);
  const { giveBack, busyId } = useGiveBack(onChanged);
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

  const requireRemarks = (): boolean => {
    if (remarks.trim() !== '') return true;
    setRemarksMissing(true);
    remarksRef.current?.focus();
    remarksRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  };

  const reject = async () => {
    if (!requireRemarks()) return;
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
    if (!requireRemarks()) return;
    const confirmed = await confirm({
      title: 'Revoke Room Grant',
      message: `${request.requesting_department?.code ?? 'The department'} will lose access to ${roomCode}. Its classes held in the room under this grant will become Room TBA.`,
      eyebrow: 'Room Request',
      confirmLabel: 'Revoke',
      variant: 'danger',
    });
    if (confirmed) await run(() => reviewRoomRequest(request.id, 'revoke', remarks.trim()));
  };

  const actionClass =
    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';

  return (
    <Modal isOpen onClose={onClose} title="Room Request" description={`${request.requesting_department?.code ?? 'Unknown'} requesting ${roomCode}`} size="sm" footer={
      <div className="flex w-full flex-wrap justify-end gap-2">
        {isOwn && (
          <button type="button" disabled={isBusy || busyId !== null} onClick={() => void giveBack(request)} className={`${actionClass} border-gray-200 text-gray-700 hover:bg-gray-50`}><Trash2 size={15} /> {isApproved ? 'Give Back' : 'Cancel Request'}</button>
        )}
        {canReview && isPending && (
          <>
            <button type="button" disabled={isBusy} onClick={() => void reject()} className={`${actionClass} border-red-200 text-red-700 hover:bg-red-50`}><X size={15} /> Reject</button>
            <button type="button" disabled={isBusy} onClick={() => void approve()} className={`${actionClass} border-transparent bg-[#5A1220] text-white hover:bg-[#4e0a10]`}><Check size={15} /> Approve</button>
          </>
        )}
        {canReview && isApproved && (
          <button type="button" disabled={isBusy} onClick={() => void revoke()} className={`${actionClass} border-red-200 text-red-700 hover:bg-red-50`}><Undo2 size={15} /> Revoke</button>
        )}
        <button type="button" onClick={onClose} className={`${actionClass} border-gray-200 text-gray-700 hover:bg-gray-50`}>Close</button>
      </div>
    }>
      <div className="space-y-3 p-5 text-sm font-sans">
        <DetailLine label="Status" value={<StatusBadge status={request.status} />} />
        <DetailLine label="Room" value={request.room?.room_code ?? 'Room unavailable'} />
        <DetailLine label="Requested By" value={request.requesting_department?.code ?? 'Not specified'} />
        <DetailLine label="Department" value={request.owner_department?.code ?? 'Not specified'} />
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
                Revoking moves the department's classes in this room to Room TBA.
              </span>
            )}
            <textarea
              ref={remarksRef}
              value={remarks}
              onChange={(event) => {
                setRemarks(event.target.value);
                if (event.target.value.trim() !== '') setRemarksMissing(false);
              }}
              rows={3}
              maxLength={1000}
              aria-invalid={remarksMissing}
              placeholder={isPending ? 'Why is this request rejected?' : 'Why is this grant revoked?'}
              className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm font-medium normal-case tracking-normal text-gray-700 outline-none focus:border-[#5A1220] ${remarksMissing ? 'border-red-400' : 'border-gray-200'}`}
            />
            {remarksMissing && (
              <span className="mt-1 block normal-case tracking-normal font-semibold text-red-600">
                Enter a reason to {isPending ? 'reject this request' : 'revoke this grant'}.
              </span>
            )}
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
