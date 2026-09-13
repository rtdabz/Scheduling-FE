import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Construction, DoorOpen, Plus, RefreshCw, Trash2, Undo2, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import Skeleton from '../../components/ui/Skeleton';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { getStoredUserDepartmentId, hasStoredCapability } from '../../lib/storedUser';
import { fullSemesterLabel } from '../../lib/semesterLabel';
import {
  ROOM_REQUEST_DAYS,
  cancelRoomRequest,
  describeWindow,
  fetchRoomOccupancy,
  fetchRoomRequests,
  formatClock,
  reviewRoomRequest,
  submitRoomRequest,
  toMinutes,
  windowConflicts,
  type RoomOccupancy,
  type RoomRequest,
  type RoomRequestStatus,
  type RoomRequestWindow,
} from '../../lib/roomRequests';

type Filter = 'pending' | 'approved' | 'closed' | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

const STATUS_STYLES: Record<RoomRequestStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  revoked: 'bg-orange-50 text-orange-700 border-orange-200',
};

const matchesFilter = (request: RoomRequest, filter: Filter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'closed') return ['rejected', 'cancelled', 'revoked'].includes(request.status);
  return request.status === filter;
};

interface RemarksPrompt {
  request: RoomRequest;
  action: 'reject' | 'revoke';
}

/**
 * Room requests between departments.
 *
 * A requester (room.request) asks for weekly windows in another department's
 * vacant room; a reviewer (room.review_requests, the VPAA) approves, rejects
 * or revokes. One page serves both, and an account holding both sees both.
 */
export default function RoomRequests() {
  const { toast, confirm } = useToast();
  const canRequest = hasStoredCapability('room.request');
  const canReview = hasStoredCapability('room.review_requests');
  const departmentId = getStoredUserDepartmentId();

  const [requests, setRequests] = useState<RoomRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [remarksPrompt, setRemarksPrompt] = useState<RemarksPrompt | null>(null);

  const load = useCallback(
    () =>
      fetchRoomRequests()
        .then(setRequests)
        .catch((error) => toast.error('Room Requests Unavailable', apiErrorMessage(error, 'The requests could not be loaded.')))
        .finally(() => setIsLoading(false)),
    [toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setIsLoading(true);
    void load();
  };

  const replace = (updated: RoomRequest) =>
    setRequests((current) => current.map((request) => (request.id === updated.id ? updated : request)));

  const visible = useMemo(() => requests.filter((request) => matchesFilter(request, filter)), [requests, filter]);
  const pendingCount = requests.filter((request) => request.status === 'pending').length;

  const run = async (request: RoomRequest, action: () => Promise<{ message: string; data: RoomRequest }>) => {
    if (busyId !== null) return;
    setBusyId(request.id);
    try {
      const result = await action();
      replace(result.data);
      toast.success('Room Request', result.message);
    } catch (error) {
      toast.error('Action Failed', apiErrorMessage(error, 'The request could not be updated.'));
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (request: RoomRequest) => {
    const confirmed = await confirm({
      title: 'Approve Room Request',
      message: `${request.requesting_department?.code ?? 'The department'} will be able to schedule classes in ${request.room?.room_code} during ${request.windows.map(describeWindow).join(', ')}.`,
      eyebrow: 'Room Request',
      confirmLabel: 'Approve',
      variant: 'success',
    });
    if (confirmed) await run(request, () => reviewRoomRequest(request.id, 'approve'));
  };

  const cancel = async (request: RoomRequest) => {
    const confirmed = await confirm({
      title: request.status === 'approved' ? 'Give Back Room' : 'Cancel Request',
      message: request.status === 'approved'
        ? `Your department will no longer be able to schedule into ${request.room?.room_code}. Move any classes out of it first.`
        : `Withdraw your request for ${request.room?.room_code}?`,
      eyebrow: 'Room Request',
      confirmLabel: request.status === 'approved' ? 'Give Back' : 'Cancel Request',
      cancelLabel: 'Keep',
      variant: 'warning',
    });
    if (confirmed) await run(request, () => cancelRoomRequest(request.id));
  };

  return (
    <div className="space-y-6">
      <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
        <Construction size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="text-sm">
          <p className="font-bold">Under Implementation</p>
          <p className="text-amber-700">Room Requests is still being rolled out. Some features may change or behave unexpectedly.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-gray-500">
          {canReview
            ? 'Departments ask here to use another department’s vacant room. An approved request lets them schedule into the room only during the approved windows.'
            : 'Ask the VPAA to use another department’s vacant room. Once approved, the room appears in your schedule builder and generator during the approved windows.'}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {canRequest && departmentId !== null && (
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#5A1220] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#4e0a10]"
            >
              <Plus size={16} />
              Request a Room
            </button>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Request status" className="flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm sm:w-fit">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
              filter === id ? 'bg-[#5A1220] text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {label}
            {id === 'pending' && pendingCount > 0 && (
              <span className={`rounded-full px-2 text-[11px] ${filter === id ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading && requests.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((index) => <Skeleton key={index} className="h-44 rounded-2xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          No {filter === 'all' ? '' : `${FILTERS.find((item) => item.id === filter)?.label.toLowerCase()} `}room requests.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((request) => {
            const isOwn = departmentId !== null && request.requesting_department?.id === departmentId;
            const isBusy = busyId === request.id;
            return (
              <article key={request.id} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5A1220]/10 text-[#5A1220]">
                      <DoorOpen size={18} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-black text-[#5A1220]">
                        {request.room?.room_code ?? 'Room removed'}
                        <span className="ml-2 text-xs font-bold capitalize text-gray-400">{request.room?.room_type}</span>
                      </h2>
                      <p className="flex items-center gap-1 text-xs font-bold text-gray-500">
                        {request.owner_department?.code ?? 'Unassigned'}
                        <ArrowRight size={12} />
                        {request.requesting_department?.code}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${STATUS_STYLES[request.status]}`}>
                    {request.status}
                  </span>
                </header>

                <div className="flex-1 space-y-3 px-5 py-4 text-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {request.windows.map((window) => (
                      <span key={`${window.day}-${window.start_time}`} className="rounded-lg bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">
                        {describeWindow(window)}
                      </span>
                    ))}
                  </div>
                  {request.purpose && <p className="text-gray-700">{request.purpose}</p>}
                  {request.review_remarks && (
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <span className="font-bold">Remarks:</span> {request.review_remarks}
                    </p>
                  )}
                  <p className="text-xs text-gray-400">
                    {request.academic_semester ? fullSemesterLabel(request.academic_semester) : ''}
                    {request.requester ? ` · Requested by ${request.requester.name}` : ''}
                    {request.reviewer ? ` · Reviewed by ${request.reviewer.name}` : ''}
                  </p>
                </div>

                {(canReview || isOwn) && ['pending', 'approved'].includes(request.status) && (
                  <footer className="flex flex-wrap justify-end gap-2 border-t border-gray-100 px-5 py-3">
                    {isBusy && <LoadingSpinner size={16} className="animate-spin self-center" />}
                    {isOwn && (
                      <ActionButton onClick={() => void cancel(request)} disabled={busyId !== null} icon={Trash2} tone="neutral">
                        {request.status === 'approved' ? 'Give Back' : 'Cancel'}
                      </ActionButton>
                    )}
                    {canReview && request.status === 'pending' && (
                      <>
                        <ActionButton onClick={() => setRemarksPrompt({ request, action: 'reject' })} disabled={busyId !== null} icon={X} tone="danger">
                          Reject
                        </ActionButton>
                        <ActionButton onClick={() => void approve(request)} disabled={busyId !== null} icon={Check} tone="primary">
                          Approve
                        </ActionButton>
                      </>
                    )}
                    {canReview && request.status === 'approved' && (
                      <ActionButton onClick={() => setRemarksPrompt({ request, action: 'revoke' })} disabled={busyId !== null} icon={Undo2} tone="danger">
                        Revoke
                      </ActionButton>
                    )}
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}

      {isFormOpen && (
        <NewRoomRequestModal
          departmentId={departmentId}
          onClose={() => setIsFormOpen(false)}
          onSubmitted={(created) => {
            setRequests((current) => [created, ...current]);
            setFilter('pending');
            setIsFormOpen(false);
          }}
        />
      )}

      {remarksPrompt && (
        <RemarksModal
          prompt={remarksPrompt}
          onClose={() => setRemarksPrompt(null)}
          onSubmit={async (remarks) => {
            const { request, action } = remarksPrompt;
            setRemarksPrompt(null);
            await run(request, () => reviewRoomRequest(request.id, action, remarks));
          }}
        />
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon: Icon,
  tone,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: typeof Check;
  tone: 'primary' | 'danger' | 'neutral';
  children: React.ReactNode;
}) {
  const tones = {
    primary: 'bg-[#5A1220] text-white hover:bg-[#4e0a10] border-transparent',
    danger: 'border-red-200 text-red-700 hover:bg-red-50',
    neutral: 'border-gray-200 text-gray-700 hover:bg-gray-50',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]}`}
    >
      <Icon size={14} />
      {children}
    </button>
  );
}

function RemarksModal({
  prompt,
  onClose,
  onSubmit,
}: {
  prompt: RemarksPrompt;
  onClose: () => void;
  onSubmit: (remarks: string) => Promise<void>;
}) {
  const [remarks, setRemarks] = useState('');
  const title = prompt.action === 'reject' ? 'Reject Room Request' : 'Revoke Room Grant';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      description={`${prompt.request.requesting_department?.code} · ${prompt.request.room?.room_code}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
            Back
          </button>
          <button
            type="button"
            disabled={remarks.trim() === ''}
            onClick={() => void onSubmit(remarks.trim())}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {prompt.action === 'reject' ? 'Reject' : 'Revoke'}
          </button>
        </div>
      }
    >
      {prompt.action === 'revoke' && (
        <p className="mb-3 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
          A grant cannot be revoked while the department still has classes in the room. They must be moved first.
        </p>
      )}
      <label className="block text-xs font-bold text-gray-600" htmlFor="room-request-remarks">Reason (sent to the department)</label>
      <textarea
        id="room-request-remarks"
        value={remarks}
        onChange={(event) => setRemarks(event.target.value)}
        rows={4}
        maxLength={1000}
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#5A1220] focus:outline-none"
      />
    </Modal>
  );
}

interface RoomOption {
  id: number;
  room_code: string;
  building: string | null;
  room_type: string;
  status: string;
  department_id: number | null;
  department: { id: number; department_code: string; department_name: string } | null;
}

const blankWindow = (): RoomRequestWindow => ({ day: 'Monday', start_time: '13:00', end_time: '15:00' });

function NewRoomRequestModal({
  departmentId,
  onClose,
  onSubmitted,
}: {
  departmentId: number | null;
  onClose: () => void;
  onSubmitted: (created: RoomRequest) => void;
}) {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [occupancy, setOccupancy] = useState<RoomOccupancy | null>(null);
  const [isLoadingOccupancy, setIsLoadingOccupancy] = useState(false);
  const [windows, setWindows] = useState<RoomRequestWindow[]>([blankWindow()]);
  const [purpose, setPurpose] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<RoomOption[]>('/rooms')
      .then(({ data }) => {
        if (!active) return;
        // Only another department's real, available rooms can be borrowed;
        // shared rooms are already usable and ONLINE/FIELD are not rooms.
        setRooms(
          data
            .filter((room) => ['lecture', 'laboratory'].includes(room.room_type))
            .filter((room) => room.status === 'available')
            .filter((room) => room.department_id !== null && room.department_id !== departmentId)
            .sort((a, b) =>
              (a.department?.department_code ?? '').localeCompare(b.department?.department_code ?? '')
              || a.room_code.localeCompare(b.room_code)),
        );
      })
      .catch((error) => toast.error('Rooms Unavailable', apiErrorMessage(error, 'The room list could not be loaded.')))
      .finally(() => { if (active) setIsLoadingRooms(false); });
    return () => { active = false; };
  }, [departmentId, toast]);

  useEffect(() => {
    if (roomId === null) return;
    let active = true;
    fetchRoomOccupancy(roomId)
      .then((data) => { if (active) setOccupancy(data); })
      .catch((error) => toast.error('Occupancy Unavailable', apiErrorMessage(error, 'The room’s timetable could not be loaded.')))
      .finally(() => { if (active) setIsLoadingOccupancy(false); });
    return () => { active = false; };
  }, [roomId, toast]);

  const chooseRoom = (value: string) => {
    const id = value === '' ? null : Number(value);
    setOccupancy(null);
    setIsLoadingOccupancy(id !== null);
    setRoomId(id);
  };

  const updateWindow = (index: number, patch: Partial<RoomRequestWindow>) =>
    setWindows((current) => current.map((window, position) => (position === index ? { ...window, ...patch } : window)));

  const occupied = occupancy?.occupied ?? [];
  const problems = windows.map((window, index) => {
    if (toMinutes(window.end_time) <= toMinutes(window.start_time)) return 'Ends before it starts.';
    if (occupancy && (toMinutes(window.start_time) < toMinutes(occupancy.opening_time) || toMinutes(window.end_time) > toMinutes(occupancy.closing_time))) {
      return `Outside operating hours (${formatClock(occupancy.opening_time)} – ${formatClock(occupancy.closing_time)}).`;
    }
    const overlapsSibling = windows.some((other, position) => position !== index
      && other.day === window.day
      && toMinutes(other.start_time) < toMinutes(window.end_time)
      && toMinutes(window.start_time) < toMinutes(other.end_time));
    if (overlapsSibling) return 'Overlaps another requested window.';
    const clashes = windowConflicts(window, occupied);
    return clashes.length > 0 ? `Not vacant: overlaps ${clashes.map((block) => block.label || block.department_code).join(', ')}.` : null;
  });
  const canSubmit = roomId !== null && occupancy !== null && purpose.trim() !== '' && windows.length > 0 && problems.every((problem) => problem === null);

  const submit = async () => {
    if (!canSubmit || roomId === null || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await submitRoomRequest({ room_id: roomId, purpose: purpose.trim(), windows });
      toast.success('Request Sent', result.message);
      onSubmitted(result.data);
    } catch (error) {
      toast.error('Request Failed', apiErrorMessage(error, 'The room request could not be submitted.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sunday is shown only when something already uses it or is being asked for.
  const days = ROOM_REQUEST_DAYS.filter((day) => day !== 'Sunday'
    || occupied.some((block) => block.day === 'Sunday')
    || windows.some((window) => window.day === 'Sunday'));

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title="Request a Room"
      description="Pick another department's room, check when it is vacant, and ask the VPAA for those windows."
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[#5A1220] px-4 py-2 text-sm font-bold text-white hover:bg-[#4e0a10] disabled:opacity-50"
          >
            {isSubmitting && <LoadingSpinner size={14} className="animate-spin" />}
            Send to VPAA
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="room-request-room" className="block text-xs font-bold text-gray-600">Room</label>
          <select
            id="room-request-room"
            value={roomId ?? ''}
            onChange={(event) => chooseRoom(event.target.value)}
            disabled={isLoadingRooms}
            className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#5A1220] focus:outline-none"
          >
            <option value="">
              {isLoadingRooms ? 'Loading rooms…' : rooms.length === 0 ? 'No other department has a room to lend' : 'Select a room'}
            </option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.department?.department_code} · {room.room_code} ({room.room_type}{room.building ? `, ${room.building}` : ''})
              </option>
            ))}
          </select>
        </div>

        {roomId !== null && (
          <div>
            <p className="text-xs font-bold text-gray-600">Weekly occupancy</p>
            {isLoadingOccupancy || !occupancy ? (
              <Skeleton className="mt-2 h-40 rounded-xl" />
            ) : (
              <OccupancyBars occupancy={occupancy} windows={windows} days={days} />
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-gray-600">Requested windows</p>
            <button
              type="button"
              onClick={() => setWindows((current) => [...current, blankWindow()])}
              disabled={windows.length >= 21}
              className="inline-flex items-center gap-1 text-xs font-bold text-[#5A1220] hover:underline disabled:opacity-50"
            >
              <Plus size={14} /> Add window
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {windows.map((window, index) => (
              <div key={index}>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Day"
                    value={window.day}
                    onChange={(event) => updateWindow(index, { day: event.target.value })}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
                  >
                    {ROOM_REQUEST_DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                  <input
                    aria-label="Start time"
                    type="time"
                    step={1800}
                    value={window.start_time}
                    onChange={(event) => updateWindow(index, { start_time: event.target.value })}
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    aria-label="End time"
                    type="time"
                    step={1800}
                    value={window.end_time}
                    onChange={(event) => updateWindow(index, { end_time: event.target.value })}
                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    aria-label="Remove window"
                    onClick={() => setWindows((current) => current.filter((_, position) => position !== index))}
                    disabled={windows.length === 1}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30"
                  >
                    <X size={16} />
                  </button>
                </div>
                {problems[index] && <p className="mt-1 text-xs font-semibold text-red-600">{problems[index]}</p>}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="room-request-purpose" className="block text-xs font-bold text-gray-600">Purpose</label>
          <textarea
            id="room-request-purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="e.g. IT 1A laboratory classes; our laboratories are fully booked."
            className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#5A1220] focus:outline-none"
          />
        </div>
      </div>
    </Modal>
  );
}

/** One bar per day from opening to closing: grey is taken, maroon outline is what is being asked for. */
function OccupancyBars({ occupancy, windows, days }: { occupancy: RoomOccupancy; windows: RoomRequestWindow[]; days: string[] }) {
  const open = toMinutes(occupancy.opening_time);
  const span = Math.max(1, toMinutes(occupancy.closing_time) - open);
  const position = (start: string, end: string) => {
    const left = Math.max(0, Math.min(100, ((toMinutes(start) - open) / span) * 100));
    const right = Math.max(0, Math.min(100, ((toMinutes(end) - open) / span) * 100));
    return { left: `${left}%`, width: `${Math.max(0, right - left)}%` };
  };

  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-1 flex justify-between pl-12 text-[10px] font-bold text-gray-400">
        <span>{formatClock(occupancy.opening_time)}</span>
        <span>{formatClock(occupancy.closing_time)}</span>
      </div>
      <div className="space-y-1.5">
        {days.map((day) => (
          <div key={day} className="flex items-center gap-2">
            <span className="w-10 text-[11px] font-bold text-gray-500">{day.slice(0, 3)}</span>
            <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-emerald-50">
              {occupancy.occupied.filter((block) => block.day === day).map((block, index) => (
                <span
                  key={`o-${index}`}
                  title={`${block.label} · ${formatClock(block.start_time)} – ${formatClock(block.end_time)}`}
                  className={`absolute inset-y-0 border-x border-white ${block.kind === 'grant' ? 'bg-orange-300' : 'bg-gray-400'}`}
                  style={position(block.start_time, block.end_time)}
                />
              ))}
              {windows.filter((window) => window.day === day).map((window, index) => (
                <span
                  key={`w-${index}`}
                  title={`Requested · ${formatClock(window.start_time)} – ${formatClock(window.end_time)}`}
                  className="absolute inset-y-1 rounded-sm border-2 border-[#5A1220] bg-[#5A1220]/25"
                  style={position(window.start_time, window.end_time)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold text-gray-500">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-50 ring-1 ring-emerald-200" /> Vacant</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-gray-400" /> Class</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-orange-300" /> Lent to another department</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border-2 border-[#5A1220] bg-[#5A1220]/25" /> Your request</span>
      </div>
    </div>
  );
}
