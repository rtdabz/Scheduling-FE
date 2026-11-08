import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useSearchParams } from 'react-router-dom';
import RoomRecoveryAlerts from '../../components/rooms/RoomRecoveryAlerts';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ClipboardList,
  Eye,
  LayoutGrid,
  List,
  RefreshCw,
  Send,
  type LucideIcon,
} from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import RoomDetailContent from '../../components/ui/RoomDetailContent';
import SearchInput from '../../components/ui/SearchInput';
import Skeleton from '../../components/ui/Skeleton';
import TableActionButton from '../../components/ui/TableActionButton';
import { useToast } from '../../context/ToastContext';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import api from '../../lib/api';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import { publishLiveTopics } from '../../lib/liveUpdates';
import { apiErrorMessage } from '../../lib/apiError';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import {
  getStoredUserDepartmentId,
  hasStoredCapability,
} from '../../lib/storedUser';
import { configureTimeGrid } from '../../lib/timeGrid';
import {
  fetchActiveSemester,
  fetchRoomOccupancy,
  fetchRoomRequests,
  getOwnerId,
  type RoomOccupancySchedule,
  type RoomRequest,
  type RoomRequestMutationResult,
  type RoomRequestSemester,
} from '../../lib/roomRequests';
import {
  RequestPreviewModal,
  RequestRoomModal,
  RequestsModal,
  type RequestsLoadStatus,
} from './RoomRequestModals';
import { useDataTable } from '../../components/ui/useDataTable';
import { parseLinkedSlots, type LinkedSlot } from '../../lib/notificationLink';
import FilterBar from '../../components/ui/FilterBar';

type ViewMode = 'list' | 'grid';
type RoomType = 'lecture' | 'laboratory' | 'online' | 'field';

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
  /** The semester the cached requests belong to; requests are never shown for another term. */
  semester: RoomRequestSemester | null;
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

const ROOM_TYPE_STYLES: Record<RoomType, string> = {
  lecture: 'border-blue-200 bg-blue-50 text-blue-700',
  laboratory: 'border-purple-200 bg-purple-50 text-purple-700',
  online: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  field: 'border-amber-200 bg-amber-50 text-amber-700',
};

const formatRoomType = (value: RoomType) => value.charAt(0).toUpperCase() + value.slice(1);

const isLectureRoom = (room: RoomRecord) => room.room_type === 'lecture';

const isLendable = (room: RoomRecord, departmentId: number | null) =>
  isLectureRoom(room)
  && room.status === 'available'
  && room.department_id !== null
  && room.department_id !== departmentId;

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
  const [semester, setSemester] = useState<RoomRequestSemester | null>(cached?.semester ?? null);
  const [timeGrid, setTimeGrid] = useState<InitialDataResponse['time_grid']>(cached?.timeGrid);
  const [requestsStatus, setRequestsStatus] = useState<RequestsLoadStatus>(cached ? 'ready' : 'loading');
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!cached);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [globalFilter, setGlobalFilter] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentRecord | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomRecord | null>(null);
  const [requestRoom, setRequestRoom] = useState<RoomRecord | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<RoomRequest | null>(null);

  const semesterRef = useRef(semester);
  useEffect(() => { semesterRef.current = semester; }, [semester]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent && !hasCachedData(cacheKey)) setIsLoading(true);
    let workspace: Omit<RoomRequestsPageData, 'requests'>;
    try {
      const [departmentResponse, roomResponse, initialResponse, activeSemester] = await Promise.all([
        api.get<DepartmentRecord[]>('/departments'),
        api.get<RoomRecord[]>('/rooms'),
        api.get<InitialDataResponse>('/initial-data?include=departments'),
        fetchActiveSemester(),
      ]);
      const initialData = initialResponse.data;
      configureTimeGrid(initialData.time_grid);
      workspace = {
        departments: Array.isArray(departmentResponse.data) ? departmentResponse.data : [],
        rooms: (Array.isArray(roomResponse.data) ? roomResponse.data : []).filter(isLectureRoom),
        timeGrid: initialData.time_grid,
        semester: activeSemester,
      };
    } catch (error) {
      toast.error('Room Requests Unavailable', apiErrorMessage(error, 'The department and room workspace could not be loaded.'));
      if (mountedRef.current) {
        setIsLoading(false);
        setRequestsError(apiErrorMessage(error, 'Room requests could not be loaded.'));
        setRequestsStatus((current) => (current === 'ready' || current === 'stale' ? 'stale' : 'error'));
      }
      return;
    }

    const semesterChanged = (semesterRef.current?.id ?? null) !== (workspace.semester?.id ?? null);
    if (mountedRef.current) {
      setDepartments(workspace.departments);
      setRooms(workspace.rooms);
      setTimeGrid(workspace.timeGrid);
      setSemester(workspace.semester);
      // Never show one term's requests under another term's label.
      if (semesterChanged) {
        setRequests([]);
        setRequestsStatus('loading');
      }
    }

    try {
      // The list is bound to the same semester used for occupancy and submission.
      const requestData = await fetchRoomRequests(workspace.semester ? { semester_id: workspace.semester.id } : undefined);
      if (mountedRef.current) {
        setRequests(requestData);
        setRequestsStatus('ready');
        setRequestsError(null);
      }
      setCachedData<RoomRequestsPageData>(cacheKey, { ...workspace, requests: requestData });
    } catch (error) {
      if (mountedRef.current) {
        setRequestsError(apiErrorMessage(error, 'Room requests could not be loaded.'));
        setRequestsStatus((current) => (!semesterChanged && (current === 'ready' || current === 'stale') ? 'stale' : 'error'));
      }
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

  const [roomSchedules, setRoomSchedules] = useState<{ key: string; schedules: RoomOccupancySchedule[] } | null>(null);
  const [roomSchedulesError, setRoomSchedulesError] = useState<{ key: string; message: string } | null>(null);
  const [roomScheduleVersion, setRoomScheduleVersion] = useState(0);
  const selectedRoomId = selectedRoom?.id ?? null;
  const semesterId = semester?.id ?? null;
  const roomScheduleKey = selectedRoomId === null ? null : `${semesterId ?? 'active'}:${selectedRoomId}`;

  useEffect(() => {
    if (selectedRoomId === null || roomScheduleKey === null) return;
    let active = true;
    fetchRoomOccupancy(selectedRoomId, semesterId)
      .then((data) => {
        if (!active) return;
        setRoomSchedules({ key: roomScheduleKey, schedules: data.schedules });
        setRoomSchedulesError((current) => (current?.key === roomScheduleKey ? null : current));
      })
      .catch((error) => {
        if (active) setRoomSchedulesError({ key: roomScheduleKey, message: apiErrorMessage(error, "The room's timetable could not be loaded.") });
      });
    return () => { active = false; };
  }, [selectedRoomId, semesterId, roomScheduleKey, roomScheduleVersion]);

  useLiveRefresh(['rooms', 'schedules', 'settings'], () => {
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

  /**
   * Apply a successful mutation locally. The server excludes this client's socket from its
   * own live broadcast, so other views' caches are invalidated here rather than over WebSockets.
   */
  const applyMutation = (result: RoomRequestMutationResult, previousStatus: RoomRequest['status'] | null) => {
    const updated = result.data;
    const next = requests.some((request) => request.id === updated.id)
      ? requests.map((request) => (request.id === updated.id ? updated : request))
      : [updated, ...requests];
    const grantChanged = updated.status === 'approved' || previousStatus === 'approved';
    setRequests(next);
    publishLiveTopics(grantChanged ? ['rooms', 'schedules', 'notifications'] : ['rooms', 'notifications']);
    setCachedData<RoomRequestsPageData>(cacheKey, { departments, rooms, requests: next, timeGrid, semester });
    if (grantChanged) setRoomScheduleVersion((version) => version + 1);
  };

  const pendingFromOthers = useMemo(
    () => requests.filter((request) => request.status === 'pending' && (request.requesting_department?.id !== departmentId || getOwnerId(request) === departmentId)).length,
    [departmentId, requests],
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

  const handleSubmitted = (result: RoomRequestMutationResult) => {
    applyMutation(result, null);
    setRequestRoom(null);
    toast.success('Request Submitted', result.message);
  };


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
    <FilterBar>
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
    </FilterBar>
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
        {roomSchedulesError?.key === roomScheduleKey && roomSchedules?.key !== roomScheduleKey ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center font-sans">
            <p className="text-sm font-extrabold text-red-800">The timetable for {selectedRoom.room_code} could not be loaded.</p>
            <p className="mt-1 text-xs font-semibold text-red-700">{roomSchedulesError.message}</p>
            <button
              type="button"
              onClick={() => setRoomScheduleVersion((version) => version + 1)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-extrabold text-red-800 hover:bg-red-100 cursor-pointer"
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        ) : (
          <>
            {roomSchedulesError?.key === roomScheduleKey && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-sans text-xs font-semibold text-amber-800">
                <span>The timetable could not be refreshed; it may be out of date.</span>
                <button type="button" onClick={() => setRoomScheduleVersion((version) => version + 1)} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-bold hover:bg-amber-100 cursor-pointer">Retry</button>
              </div>
            )}
            <RoomDetailContent
              key={linkedHighlight?.seq ?? 0}
              room={{ ...selectedRoom, building: selectedRoom.building ?? '' }}
              schedules={roomSchedules?.key === roomScheduleKey ? roomSchedules.schedules : []}
              isLoading={roomSchedules?.key !== roomScheduleKey}
              initialViewMode="grid"
              highlightSlots={linkedHighlight?.roomId === selectedRoom.id ? linkedHighlight.slots : undefined}
              semesterId={semesterId}
            />
          </>
        )}
        {requestRoom && (
          <RequestRoomModal
            room={requestRoom}
            semester={semester}
            onClose={() => setRequestRoom(null)}
            onSubmitted={handleSubmitted}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RoomRecoveryAlerts />
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
          status={requestsStatus}
          errorMessage={requestsError}
          semester={semester}
          departmentId={departmentId}
          onRetry={() => { void loadData(true); }}
          onClose={() => setShowRequests(false)}
          onPreview={setPreviewRequest}
          onChanged={(result) => applyMutation(result, requests.find((request) => request.id === result.data.id)?.status ?? null)}
        />
      )}

      {previewRequest && (
        <RequestPreviewModal
          request={previewRequest}
          departmentId={departmentId}
          onClose={() => setPreviewRequest(null)}
          onChanged={(result) => {
            applyMutation(result, previewRequest.status);
            setPreviewRequest(null);
          }}
        />
      )}

      {requestRoom && (
        <RequestRoomModal
          room={requestRoom}
          semester={semester}
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
