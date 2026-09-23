import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  Eye,
  Grid2X2,
  List,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import RoomDetailContent from '../../components/ui/RoomDetailContent';
import Skeleton from '../../components/ui/Skeleton';
import TableActionButton from '../../components/ui/TableActionButton';
import { useToast } from '../../context/ToastContext';
import { useLiveRefresh } from '../../hooks/useLiveRefresh';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { getStoredUserDepartmentId, hasStoredCapability } from '../../lib/storedUser';
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
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [requests, setRequests] = useState<RoomRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentRecord | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<RoomRecord | null>(null);
  const [requestRoom, setRequestRoom] = useState<RoomRecord | null>(null);
  const [requestDepartment, setRequestDepartment] = useState<DepartmentRecord | null>(null);
  const [previewRequest, setPreviewRequest] = useState<RoomRequest | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
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

      // The VPAA gets every department's requests; a department gets the ones
      // it sent and the ones for its rooms (the server scopes it either way).
      const requestData = await fetchRoomRequests({ scope: 'all' });
      if (mountedRef.current) setRequests(requestData);
    } catch (error) {
      toast.error('Room Requests Unavailable', apiErrorMessage(error, 'The department and room workspace could not be loaded.'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [toast]);

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

  const pendingByDepartment = useMemo(() => {
    const counts = new Map<number, number>();
    requests.filter((request) => request.status === 'pending').forEach((request) => {
      const ownerId = getOwnerId(request);
      if (ownerId !== null) counts.set(ownerId, (counts.get(ownerId) ?? 0) + 1);
    });
    return counts;
  }, [requests]);

  const sortedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.department_name.localeCompare(b.department_name)),
    [departments],
  );

  const departmentRooms = useMemo(
    () => selectedDepartment
      ? rooms.filter((room) => room.department_id === selectedDepartment.id).sort((a, b) => a.room_code.localeCompare(b.room_code, undefined, { numeric: true }))
      : [],
    [rooms, selectedDepartment],
  );

  const openDepartment = (department: DepartmentRecord) => {
    setSelectedDepartment(department);
    setSelectedRoom(null);
    setRequestDepartment(null);
    setViewMode('list');
  };

  const openRequests = (department: DepartmentRecord) => {
    setRequestDepartment(department);
    setPreviewRequest(null);
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
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#5A1220]/10 text-[#5A1220]"><Building2 size={17} /></span>
          <div>
            <p className="font-bold text-[#4e0a10]">{row.original.department_code}</p>
            <p className="text-xs font-semibold text-gray-500">{row.original.department_name}</p>
          </div>
        </div>
      ),
    },
    {
      id: 'rooms',
      accessorFn: (department) => rooms.filter((room) => room.department_id === department.id).length,
      header: 'Assigned Rooms',
      cell: ({ getValue }) => <span className="font-bold text-gray-700">{getValue<number>()} rooms</span>,
    },
    {
      id: 'requests',
      accessorFn: (department) => pendingByDepartment.get(department.id) ?? 0,
      header: 'Requests',
      meta: { stopRowClick: true },
      cell: ({ row }) => <RequestsButton count={pendingByDepartment.get(row.original.id) ?? 0} onClick={() => openRequests(row.original)} />,
    },
    {
      id: 'open',
      header: '',
      enableSorting: false,
      meta: { align: 'right', stopRowClick: true },
      cell: ({ row }) => (
        <TableActionButton label={`Open ${row.original.department_name}`} variant="view" onClick={() => openDepartment(row.original)}>
          <ChevronRight size={16} />
        </TableActionButton>
      ),
    },
  ], [pendingByDepartment, rooms]);

  const departmentTable = useDataTable({ data: sortedDepartments, columns: departmentColumns, pageSize: 10, getRowId: (row) => String(row.id) });

  const roomColumns = useMemo<ColumnDef<RoomRecord>[]>(() => [
    {
      id: 'room',
      accessorKey: 'room_code',
      header: 'Room',
      cell: ({ row }) => <span className="font-mono font-bold text-[#4e0a10]">{row.original.room_code}</span>,
    },
    {
      id: 'building',
      accessorKey: 'building',
      header: 'Building',
      cell: ({ getValue }) => <span className="font-semibold text-gray-600">{getValue<string | null>() || 'Unassigned'}</span>,
    },
    {
      id: 'type',
      accessorKey: 'room_type',
      header: 'Room Type',
      cell: ({ row }) => <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${ROOM_TYPE_STYLES[row.original.room_type]}`}>{formatRoomType(row.original.room_type)}</span>,
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <span className={`font-bold ${row.original.status === 'available' ? 'text-emerald-600' : 'text-gray-500'}`}>{row.original.status === 'available' ? 'Available' : 'Not available'}</span>,
    },
    {
      id: 'open',
      header: '',
      enableSorting: false,
      meta: { align: 'right', stopRowClick: true },
      cell: ({ row }) => (
        <TableActionButton label={`Open ${row.original.room_code}`} variant="view" onClick={() => setSelectedRoom(row.original)}>
          <ChevronRight size={16} />
        </TableActionButton>
      ),
    },
  ], []);

  const roomTable = useDataTable({ data: departmentRooms, columns: roomColumns, pageSize: 10, getRowId: (row) => String(row.id) });

  const renderDepartmentGrid = () => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {sortedDepartments.map((department) => {
        const assignedRooms = rooms.filter((room) => room.department_id === department.id);
        const pendingCount = pendingByDepartment.get(department.id) ?? 0;
        return (
          <article key={department.id} className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#C9952A] hover:shadow-md">
            <button type="button" onClick={() => openDepartment(department)} className="w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#5A1220]/10 text-[#5A1220]"><Building2 size={20} /></span>
                <ChevronRight size={18} className="mt-1 text-gray-300 transition group-hover:translate-x-1 group-hover:text-[#5A1220]" />
              </div>
              <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.16em] text-[#C9952A]">{department.department_code}</p>
              <h2 className="mt-1 text-base font-black text-[#4e0a10]">{department.department_name}</h2>
              <p className="mt-2 text-sm font-semibold text-gray-500">{assignedRooms.length} assigned {assignedRooms.length === 1 ? 'room' : 'rooms'}</p>
            </button>
            <div className="mt-5 border-t border-gray-100 pt-4">
              <RequestsButton count={pendingCount} onClick={() => openRequests(department)} />
            </div>
          </article>
        );
      })}
    </div>
  );

  const renderRooms = () => (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSelectedDepartment(null)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 transition hover:bg-gray-50">
            <ArrowLeft size={16} />
            Departments
          </button>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#C9952A]">{selectedDepartment?.department_code}</p>
            <h2 className="truncate text-lg font-black text-[#4e0a10]">{selectedDepartment?.department_name}</h2>
          </div>
        </div>
        <RequestsButton count={selectedDepartment ? pendingByDepartment.get(selectedDepartment.id) ?? 0 : 0} onClick={() => selectedDepartment && openRequests(selectedDepartment)} />
      </div>

      {viewMode === 'list' ? (
        <DataTable table={roomTable} totalLabel="rooms" ariaLabel="Assigned rooms" emptyTitle="No rooms assigned" emptyDescription="This department has no assigned rooms." onRowClick={setSelectedRoom} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departmentRooms.map((room) => (
            <button key={room.id} type="button" onClick={() => setSelectedRoom(room)} className="group rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#C9952A] hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#C9952A]/10 text-[#9b7118]"><DoorOpen size={20} /></span>
                <ChevronRight size={18} className="mt-1 text-gray-300 transition group-hover:translate-x-1 group-hover:text-[#5A1220]" />
              </div>
              <p className="mt-5 font-mono text-lg font-black text-[#4e0a10]">{room.room_code}</p>
              <p className="mt-1 text-sm font-semibold text-gray-500">{room.building || 'Building unassigned'}</p>
              <span className={`mt-4 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${ROOM_TYPE_STYLES[room.room_type]}`}>{formatRoomType(room.room_type)}</span>
            </button>
          ))}
          {departmentRooms.length === 0 && <EmptyState title="No rooms assigned" description="This department has no assigned rooms." />}
        </div>
      )}
    </div>
  );

  const toolbar = (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => void loadData()} disabled={isLoading} aria-label="Refresh" className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-extrabold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60">
        <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        Refresh
      </button>
      <ViewSwitcher viewMode={viewMode} onChange={setViewMode} />
    </div>
  );

  if (selectedRoom) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => setSelectedRoom(null)} className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 shadow-sm transition hover:bg-gray-50">
            <ArrowLeft size={16} />
            {selectedDepartment?.department_code ?? 'Rooms'}
          </button>
          {canRequest && isLendable(selectedRoom, departmentId) && (
            <button type="button" onClick={() => setRequestRoom(selectedRoom)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#5A1220] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#4e0a10]">
              <Send size={16} />
              Request Room
            </button>
          )}
        </div>
        <RoomDetailContent room={{ ...selectedRoom, building: selectedRoom.building ?? '' }} schedules={schedules} isLoading={false} initialViewMode="grid" />
        {requestRoom && <RequestRoomModal room={requestRoom} rooms={lendableRooms} onClose={() => setRequestRoom(null)} onSubmitted={handleSubmitted} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!selectedDepartment && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black text-[#4e0a10]">All departments</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">Select a department to see its assigned rooms.</p>
          </div>
          {toolbar}
        </div>
      )}

      {selectedDepartment ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[#4e0a10]">Assigned rooms</h2>
              <p className="mt-1 text-sm font-semibold text-gray-500">Open a room to view its weekly timetable.</p>
            </div>
            {toolbar}
          </div>
          {renderRooms()}
        </>
      ) : isLoading ? (
        <LoadingWorkspace />
      ) : sortedDepartments.length === 0 ? (
        <EmptyState title="No departments found" description="There are no departments available for room requests." />
      ) : viewMode === 'list' ? (
        <DataTable table={departmentTable} totalLabel="departments" ariaLabel="Departments" emptyTitle="No departments found" emptyDescription="There are no departments available for room requests." onRowClick={openDepartment} />
      ) : renderDepartmentGrid()}

      {requestDepartment && <RequestsModal department={requestDepartment} requests={requests} onClose={() => setRequestDepartment(null)} onPreview={setPreviewRequest} />}
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
    </div>
  );
}

function ViewSwitcher({ viewMode, onChange }: { viewMode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1" role="tablist" aria-label="View mode">
      <button type="button" role="tab" aria-selected={viewMode === 'list'} onClick={() => onChange('list')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold transition ${viewMode === 'list' ? 'bg-white text-[#4e0a10] shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
        <List size={15} /> List View
      </button>
      <button type="button" role="tab" aria-selected={viewMode === 'grid'} onClick={() => onChange('grid')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-extrabold transition ${viewMode === 'grid' ? 'bg-white text-[#4e0a10] shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
        <Grid2X2 size={15} /> Grid View
      </button>
    </div>
  );
}

function RequestsButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border border-[#5A1220]/20 bg-[#5A1220]/[0.04] px-3 py-2 text-xs font-extrabold text-[#5A1220] transition hover:bg-[#5A1220]/[0.1]">
      <ClipboardList size={15} />
      Requests
      <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] ${count > 0 ? 'bg-[#C9952A] text-white' : 'bg-gray-200 text-gray-600'}`}>{count}</span>
    </button>
  );
}

function LoadingWorkspace() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-48 rounded-2xl" />)}
    </div>
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
      .then((data) => { if (active) setOccupancy({ roomId: selectedRoom.id, blocks: data.occupied }); })
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
    <Modal isOpen onClose={onClose} title="Request Room" description="Choose a day and an available time window. The department that owns the room reviews your request." size="md" footer={
      <div className="flex w-full justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="submit" form="room-request-form" disabled={!canSubmit} className="inline-flex items-center gap-2 rounded-lg bg-[#5A1220] px-4 py-2 text-sm font-extrabold text-white hover:bg-[#4e0a10] disabled:cursor-not-allowed disabled:opacity-50"><Send size={15} /> {isSubmitting ? 'Submitting...' : 'Submit Request'}</button>
      </div>
    }>
      <form id="room-request-form" onSubmit={(event) => void submit(event)} className="space-y-5 p-5">
        <label className="block text-sm font-bold text-gray-700">
          Room
          <select value={roomId} onChange={(event) => setRoomId(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220]">
            {rooms.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.room_code} - {candidate.department?.department_code ?? 'General'}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-gray-700">
          Day
          <select value={day} onChange={(event) => setDay(event.target.value as ScheduleDay)} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220]">
            {FULL_DAY_NAMES.map((weekday) => <option key={weekday} value={weekday}>{weekday}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-gray-700">
          Available Time
          <select value={selectedTime} onChange={(event) => setTime(event.target.value)} disabled={availableTimes.length === 0} className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220] disabled:bg-gray-100">
            {isLoadingOccupancy
              ? <option value="">Checking the room's timetable...</option>
              : availableTimes.length === 0
                ? <option value="">No available windows</option>
                : availableTimes.map((option) => <option key={`${option.start}-${option.end}`} value={`${option.start}-${option.end}`}>{option.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold text-gray-700">
          Purpose
          <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={3} maxLength={1000} placeholder="e.g. IT 1A laboratory classes; our laboratories are fully booked." className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220]" />
        </label>
      </form>
    </Modal>
  );
}

function RequestsModal({
  department,
  requests,
  onClose,
  onPreview,
}: {
  department: DepartmentRecord;
  requests: RoomRequest[];
  onClose: () => void;
  onPreview: (request: RoomRequest) => void;
}) {
  // Pending requests need a decision; approved ones stay listed so a grant
  // can still be revoked or given back.
  const rows = useMemo<RequestRow[]>(() => requests
    .filter((request) => (request.status === 'pending' || request.status === 'approved') && getOwnerId(request) === department.id)
    .flatMap((request) => request.windows.map((window, index) => ({
      id: `${request.id}-${index}`,
      room: request.room?.room_code ?? 'Room unavailable',
      day: window.day,
      time: `${formatTime12h(window.start_time)} - ${formatTime12h(window.end_time)}`,
      request,
    }))), [department.id, requests]);
  const columns = useMemo<ColumnDef<RequestRow>[]>(() => [
    { id: 'room', accessorKey: 'room', header: 'Room', cell: ({ getValue }) => <span className="font-mono font-bold text-[#4e0a10]">{getValue<string>()}</span> },
    { id: 'requester', accessorFn: (row) => row.request.requesting_department?.code ?? '', header: 'Requested By', cell: ({ getValue }) => <span className="font-semibold text-gray-700">{getValue<string>() || '-'}</span> },
    { id: 'day', accessorKey: 'day', header: 'Day', cell: ({ getValue }) => <span className="font-semibold text-gray-700">{getValue<string>()}</span> },
    { id: 'time', accessorKey: 'time', header: 'Time', cell: ({ getValue }) => <span className="font-semibold text-gray-700">{getValue<string>()}</span> },
    { id: 'status', accessorFn: (row) => row.request.status, header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.request.status} /> },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { align: 'right', stopRowClick: true },
      cell: ({ row }) => <TableActionButton label={`View request for ${row.original.room}`} variant="view" onClick={() => onPreview(row.original.request)}><Eye size={15} /></TableActionButton>,
    },
  ], [onPreview]);
  const table = useDataTable({ data: rows, columns, pageSize: false, getRowId: (row) => row.id });

  return (
    <Modal isOpen onClose={onClose} title={`${department.department_code} Requests`} description="Pending and approved room requests for this department's assigned rooms." size="lg">
      <div className="p-5">
        <DataTable table={table} showPagination={false} totalLabel="requests" ariaLabel={`${department.department_code} room requests`} emptyTitle="No active requests" emptyDescription="New requests for this department will appear here." density="compact" />
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

  const actionClass = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <Modal isOpen onClose={onClose} title="Room Request" description={`${request.requesting_department?.code ?? 'Unknown'} requesting ${roomCode}`} size="sm" footer={
      <div className="flex w-full flex-wrap justify-end gap-2">
        {isOwn && (isPending || isApproved) && (
          <button type="button" disabled={isBusy} onClick={() => void cancel()} className={`${actionClass} border-gray-200 text-gray-700 hover:bg-gray-50`}><Trash2 size={15} /> {isApproved ? 'Give Back' : 'Cancel Request'}</button>
        )}
        {canReview && isPending && (
          <>
            <button type="button" disabled={isBusy || remarks.trim() === ''} onClick={() => void run(() => reviewRoomRequest(request.id, 'reject', remarks.trim()))} className={`${actionClass} border-red-200 text-red-700 hover:bg-red-50`}><X size={15} /> Reject</button>
            <button type="button" disabled={isBusy} onClick={() => void approve()} className={`${actionClass} border-transparent bg-[#5A1220] text-white hover:bg-[#4e0a10]`}><Check size={15} /> Approve</button>
          </>
        )}
        {canReview && isApproved && (
          <button type="button" disabled={isBusy || remarks.trim() === ''} onClick={() => void run(() => reviewRoomRequest(request.id, 'revoke', remarks.trim()))} className={`${actionClass} border-red-200 text-red-700 hover:bg-red-50`}><Undo2 size={15} /> Revoke</button>
        )}
        <button type="button" onClick={onClose} className={`${actionClass} border-gray-200 text-gray-700 hover:bg-gray-50`}>Close</button>
      </div>
    }>
      <div className="space-y-3 p-5 text-sm">
        <DetailLine label="Status" value={<StatusBadge status={request.status} />} />
        <DetailLine label="Room" value={request.room?.room_code ?? 'Room unavailable'} />
        <DetailLine label="Requested By" value={request.requesting_department?.code ?? 'Not specified'} />
        {request.windows.length === 0 && <DetailLine label="Schedule" value="Not specified" />}
        {request.windows.map((window, index) => (
          <DetailLine key={`${window.day}-${window.start_time}-${index}`} label={index === 0 ? 'Schedule' : ''} value={`${window.day}, ${formatTime12h(window.start_time)} - ${formatTime12h(window.end_time)}`} />
        ))}
        {request.requester && <DetailLine label="Requester" value={request.requester.name} />}
        {request.purpose && <p className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-sm text-gray-700"><span className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">Purpose</span>{request.purpose}</p>}
        {request.review_remarks && <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600"><span className="font-bold">Remarks:</span> {request.review_remarks}</p>}
        {needsRemarks && (
          <label className="block text-xs font-extrabold uppercase tracking-wide text-gray-400">
            Remarks {isPending ? '(required to reject)' : '(required to revoke)'}
            {isApproved && <span className="mt-1 block normal-case tracking-normal font-semibold text-orange-700">A grant cannot be revoked while the department still has classes in the room.</span>}
            <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={3} maxLength={1000} className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium normal-case tracking-normal text-gray-700 outline-none focus:border-[#5A1220]" />
          </label>
        )}
      </div>
    </Modal>
  );
}

function StatusBadge({ status }: { status: RoomRequestStatus }) {
  return <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${STATUS_STYLES[status]}`}>{status}</span>;
}

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-white px-3 py-2.5"><span className="text-xs font-extrabold uppercase tracking-wide text-gray-400">{label}</span><span className="text-right text-sm font-bold text-[#4e0a10]">{value}</span></div>;
}
