import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  Send,
  Trash2,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import TableActionButton from '../../components/ui/TableActionButton';
import { useDataTable } from '../../components/ui/useDataTable';
import { useToast } from '../../context/ToastContext';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { apiErrorMessage } from '../../lib/apiError';
import { hasStoredCapability } from '../../lib/storedUser';
import WeeklyTimetableGrid from '../../components/scheduling/WeeklyTimetableGrid';
import { FULL_DAY_NAMES, formatTime12h, gridOpeningMinutes, slotCount, slotMinutes, slotToTime24h } from '../../lib/timeGrid';
import {
  cancelRoomRequest,
  classesUnderGrant,
  fetchRoomOccupancy,
  formatDuration,
  formatSemester,
  fromMinutes,
  getOwnerId,
  reviewRoomRequest,
  submitRoomRequest,
  toMinutes,
  windowConflicts,
  type RoomOccupancyBlock,
  type RoomOccupancySchedule,
  type RoomRequest,
  type RoomRequestMutationResult,
  type RoomRequestSemester,
  type RoomRequestStatus,
  type RoomRequestWindow,
} from '../../lib/roomRequests';

export interface LendableRoom {
  id: number;
  room_code: string;
  building: string | null;
  department_id: number | null;
  department: { id: number; department_code: string; department_name: string } | null;
}

export type RequestsLoadStatus = 'loading' | 'ready' | 'stale' | 'error';

type ScheduleDay = (typeof FULL_DAY_NAMES)[number];
type RequestsTab = 'sent' | 'received';


const STATUS_STYLES: Record<RoomRequestStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-600',
  revoked: 'border-orange-200 bg-orange-50 text-orange-700',
};

const fieldClass =
  'mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-[#5A1220] focus:ring-2 focus:ring-[#5A1220]/15 disabled:bg-gray-100 disabled:text-gray-400';
const labelClass = 'block text-xs font-extrabold uppercase tracking-wide text-gray-500';
const buttonBase =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]/30 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
const secondaryButton = `${buttonBase} border-gray-200 bg-white text-gray-700 hover:bg-gray-50`;
const primaryButton = `${buttonBase} border-transparent bg-[#5A1220] text-white hover:bg-[#4e0a10]`;
const dangerButton = `${buttonBase} border-red-200 bg-white text-red-700 hover:bg-red-50`;

const describeWindowLine = (window: RoomRequestWindow): string =>
  `${window.day}, ${formatTime12h(window.start_time)} – ${formatTime12h(window.end_time)}`;

const windowMinutes = (window: RoomRequestWindow): number =>
  toMinutes(window.end_time) - toMinutes(window.start_time);

const formatDate = (isoString?: string | null): string => {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const shortSemester = (semester: { academic_year: string; semester: string } | null | undefined): string =>
  semester ? `${semester.semester} Sem · AY ${semester.academic_year}` : '—';

export function StatusBadge({ status }: { status: RoomRequestStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#4e0a10]">{children}</h3>
      {aside}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
      <dt className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-bold text-gray-800">{children}</dd>
    </div>
  );
}

function Notice({ tone, icon, children, action }: { tone: 'info' | 'success' | 'warning' | 'danger' | 'muted'; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const tones = {
    info: 'border-blue-200 bg-blue-50 text-blue-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    danger: 'border-red-200 bg-red-50 text-red-800',
    muted: 'border-gray-200 bg-gray-50 text-gray-600',
  } as const;
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs font-semibold ${tones[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function RetryButton({ onClick, label = 'Retry' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-md border border-current/30 bg-white px-2.5 py-1 text-xs font-bold hover:bg-white/70 cursor-pointer">
      <RefreshCw size={12} /> {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Occupancy: loaded per room and semester, never reused across them. */
/* ------------------------------------------------------------------ */

interface OccupancyData {
  key: string;
  blocks: RoomOccupancyBlock[];
  schedules: RoomOccupancySchedule[];
}

type OccupancyStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error';

function useOccupancy(roomId: number | null, semesterId: number | null) {
  const key = roomId !== null && semesterId !== null ? `${semesterId}:${roomId}` : null;
  const [data, setData] = useState<OccupancyData | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const liveRevision = useLiveRevision(['rooms', 'schedules']);

  useEffect(() => {
    if (key === null || roomId === null || semesterId === null) return;
    let active = true;
    fetchRoomOccupancy(roomId, semesterId)
      .then((response) => {
        if (!active) return;
        setData({ key, blocks: response.occupied, schedules: response.schedules });
        setFailure((current) => (current?.key === key ? null : current));
      })
      .catch((error) => {
        if (active) setFailure({ key, message: apiErrorMessage(error, "The room's timetable could not be loaded.") });
      });
    // A late response for a previous room or semester is ignored.
    return () => { active = false; };
  }, [key, roomId, semesterId, attempt, liveRevision]);

  const current = data?.key === key ? data : null;
  const failed = failure !== null && failure.key === key;
  const status: OccupancyStatus = key === null
    ? 'idle'
    : current
      ? (failed ? 'stale' : 'ready')
      : (failed ? 'error' : 'loading');

  return {
    status,
    blocks: current?.blocks ?? [],
    schedules: current?.schedules ?? [],
    message: failed ? failure.message : null,
    retry: () => setAttempt((value) => value + 1),
  };
}

/* ------------------------------------------------------------------ */
/* Request Room                                                        */
/* ------------------------------------------------------------------ */

/** A recurring weekday window for the displayed semester, not a calendar date. */
interface ScheduleChoice {
  day: string;
  start: string;
  duration: number;
}

const REQUEST_DURATIONS = [
  { minutes: 90, label: '1.5 hours' },
  { minutes: 180, label: '3 hours' },
] as const;

const PICKER_SLOT_HEIGHT_PX = 20;

const durationLabel = (minutes: number): string =>
  REQUEST_DURATIONS.find((option) => option.minutes === minutes)?.label ?? formatDuration(minutes);

const choiceEnd = (choice: ScheduleChoice): string => fromMinutes(toMinutes(choice.start) + choice.duration);

const choiceWindow = (choice: ScheduleChoice): RoomRequestWindow => ({
  day: choice.day,
  start_time: choice.start,
  end_time: choiceEnd(choice),
});

/** Operating hours of the configured time grid, in minutes. */
const gridBounds = () => {
  const opening = gridOpeningMinutes();
  return { opening, closing: opening + slotCount() * slotMinutes() };
};

/** The whole interval must stay inside operating hours and clear every booking, compared to the minute. */
const fitsSchedule = (choice: ScheduleChoice, blocks: RoomOccupancyBlock[]): boolean => {
  const { opening, closing } = gridBounds();
  const start = toMinutes(choice.start);
  return start >= opening
    && start + choice.duration <= closing
    && windowConflicts(choiceWindow(choice), blocks).length === 0;
};

/** Places an interval on the grid at its exact minutes, even when it does not fall on slot boundaries. */
const exactPlacement = (dayIndex: number, startTime: string, endTime: string) => {
  const { opening, closing } = gridBounds();
  const step = slotMinutes();
  const from = Math.max(toMinutes(startTime), opening) - opening;
  const to = Math.min(toMinutes(endTime), closing) - opening;
  if (to <= from) return null;
  const firstRow = Math.floor(from / step);
  const lastRow = Math.ceil(to / step);
  return {
    gridColumn: dayIndex + 2,
    gridRow: `${firstRow + 2} / ${lastRow + 2}`,
    marginTop: ((from - firstRow * step) / step) * PICKER_SLOT_HEIGHT_PX,
    marginBottom: ((lastRow * step - to) / step) * PICKER_SLOT_HEIGHT_PX,
  };
};

type Occupancy = ReturnType<typeof useOccupancy>;

function SchedulePickerModal({
  roomCode,
  semester,
  occupancy,
  initial,
  onCancel,
  onConfirm,
}: {
  roomCode: string;
  semester: RoomRequestSemester | null;
  occupancy: Occupancy;
  initial: ScheduleChoice | null;
  onCancel: () => void;
  onConfirm: (choice: ScheduleChoice) => void;
}) {
  const ids = useId();
  const [duration, setDuration] = useState<number>(initial?.duration ?? REQUEST_DURATIONS[0].minutes);
  const [pick, setPick] = useState<{ day: string; start: string } | null>(
    initial ? { day: initial.day, start: initial.start } : null,
  );
  const step = slotMinutes();
  const starts = useMemo(() => Array.from({ length: slotCount() }, (_, slot) => slotToTime24h(slot)), []);
  const isReady = occupancy.status === 'ready';
  const blocks = occupancy.blocks;
  const choice = pick ? { ...pick, duration } : null;
  const choiceFits = choice !== null && isReady && fitsSchedule(choice, blocks);
  const hasAnyStart = isReady && FULL_DAY_NAMES.some((day) => starts.some((start) => fitsSchedule({ day, start, duration }, blocks)));

  const selection = choice ? exactPlacement(FULL_DAY_NAMES.indexOf(choice.day as ScheduleDay), choice.start, choiceEnd(choice)) : null;

  const renderCell = (dayIndex: number, slot: number) => {
    const day = FULL_DAY_NAMES[dayIndex];
    const start = starts[slot];
    const end = fromMinutes(toMinutes(start) + step);
    const occupied = windowConflicts({ day, start_time: start, end_time: end }, blocks).length > 0;
    const startable = isReady && fitsSchedule({ day, start, duration }, blocks);
    const isPicked = pick?.day === day && pick.start === start;
    const label = `${day} ${formatTime12h(start)} to ${formatTime12h(fromMinutes(toMinutes(start) + duration))}`;
    return (
      <button
        key={`${day}-${start}`}
        type="button"
        disabled={!startable}
        aria-pressed={isPicked}
        aria-label={startable ? `Start ${label}` : `${label}, unavailable`}
        title={startable ? `Start here: ${formatTime12h(start)} – ${formatTime12h(fromMinutes(toMinutes(start) + duration))}` : occupied ? 'Booked' : 'Not enough free time before the next booking or closing time'}
        onClick={() => setPick({ day, start })}
        className={`border-b border-r border-b-slate-100 border-r-slate-100 transition focus:outline-none focus-visible:relative focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5A1220] ${
          startable
            ? 'cursor-pointer bg-white hover:bg-emerald-50'
            : occupied
              ? 'cursor-not-allowed bg-white'
              : 'cursor-not-allowed bg-slate-50 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(148,163,184,0.12)_4px,rgba(148,163,184,0.12)_8px)]'
        }`}
        style={{ gridColumn: dayIndex + 2, gridRow: slot + 2 }}
      />
    );
  };

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="Choose Schedule"
      description={`A weekly time in ${roomCode} for ${formatSemester(semester)} — the same weekday and time every week, not a single date.`}
      size="xl"
      className="!max-w-4xl"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-gray-600" aria-live="polite">
            {choice && choiceFits
              ? <>Selected: <strong>{choice.day}, {formatTime12h(choice.start)} – {formatTime12h(choiceEnd(choice))}</strong> ({durationLabel(duration)})</>
              : choice && isReady
                ? `${choice.day} ${formatTime12h(choice.start)} does not fit ${durationLabel(duration)}. Pick another start.`
                : 'Pick a day and an available starting time.'}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button>
            <button type="button" disabled={!choiceFits} onClick={() => choice && onConfirm(choice)} className={primaryButton}>
              <Check size={15} /> Confirm Schedule
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 p-4 font-sans sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Duration</legend>
            <span aria-hidden="true" className={labelClass}>Duration</span>
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/90 p-1">
              {REQUEST_DURATIONS.map((option) => (
                <label
                  key={option.minutes}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-extrabold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#5A1220]/30 ${
                    duration === option.minutes ? 'bg-[#5A1220] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${ids}-duration`}
                    value={option.minutes}
                    checked={duration === option.minutes}
                    onChange={() => setDuration(option.minutes)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <ul className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-gray-500" aria-label="Legend">
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-slate-200 bg-white" /> Available</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border border-red-200 bg-red-100" /> Class</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-dashed border-orange-300 bg-orange-50" /> Lent</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm border-2 border-[#C9952A] bg-[#C9952A]/20" /> Selected</li>
          </ul>
        </div>

        <div role="status" aria-live="polite">
          {occupancy.status === 'error' && (
            <Notice tone="danger" icon={<XCircle size={14} />} action={<RetryButton onClick={occupancy.retry} />}>
              <p>The room’s timetable could not be loaded. {occupancy.message}</p>
              <p className="font-medium">No time is shown as free until it loads.</p>
            </Notice>
          )}
          {occupancy.status === 'stale' && (
            <Notice tone="warning" icon={<AlertTriangle size={14} />} action={<RetryButton onClick={occupancy.retry} />}>
              The timetable could not be refreshed. Retry before choosing a time.
            </Notice>
          )}
          {isReady && !hasAnyStart && (
            <Notice tone="muted" icon={<AlertTriangle size={14} />}>
              No free {durationLabel(duration)} window in {roomCode} this semester.
              {duration > REQUEST_DURATIONS[0].minutes && ' Try 1.5 hours.'}
            </Notice>
          )}
        </div>

        {occupancy.status !== 'error' && (
          <div className="overflow-x-auto">
            <WeeklyTimetableGrid
              days={FULL_DAY_NAMES}
              slotCount={slotCount()}
              slotHeight={PICKER_SLOT_HEIGHT_PX}
              headerHeight={36}
              timeColumnWidth={64}
              minWidth={680}
              isLoading={occupancy.status === 'loading' || occupancy.status === 'idle'}
              renderCell={occupancy.status === 'loading' || occupancy.status === 'idle' ? undefined : renderCell}
            >
              {(isReady || occupancy.status === 'stale') && blocks.map((block, index) => {
                const placement = exactPlacement(FULL_DAY_NAMES.indexOf(block.day as ScheduleDay), block.start_time, block.end_time);
                if (!placement) return null;
                return (
                  <div
                    key={`${block.kind}-${block.day}-${block.start_time}-${index}`}
                    aria-hidden="true"
                    title={`${block.kind === 'grant' ? 'Lent' : 'Class'}: ${formatTime12h(block.start_time)} – ${formatTime12h(block.end_time)} · ${block.label || block.department_code || ''}`}
                    className={`pointer-events-none z-10 mx-0.5 overflow-hidden rounded-md px-1.5 py-0.5 text-[9px] font-bold leading-tight ${
                      block.kind === 'grant'
                        ? 'border-2 border-dashed border-orange-300 bg-orange-50/95 text-orange-800'
                        : 'border border-red-200 bg-red-100/95 text-red-800'
                    }`}
                    style={placement}
                  >
                    {formatTime12h(block.start_time)}–{formatTime12h(block.end_time)}
                    <span className="block truncate font-semibold">{block.label || block.department_code}</span>
                  </div>
                );
              })}
              {selection && (
                <div
                  aria-hidden="true"
                  className={`pointer-events-none z-10 mx-0.5 rounded-md border-2 px-1.5 py-0.5 text-[9px] font-black leading-tight ring-2 ${
                    choiceFits ? 'border-[#C9952A] bg-[#C9952A]/20 text-[#7a5410] ring-[#C9952A]/25' : 'border-red-500 bg-red-500/10 text-red-700 ring-red-500/20'
                  }`}
                  style={selection}
                >
                  {choice && <>{formatTime12h(choice.start)}–{formatTime12h(choiceEnd(choice))}</>}
                </div>
              )}
            </WeeklyTimetableGrid>
          </div>
        )}
        <p className="text-[11px] font-semibold text-gray-400">
          Click a starting time. The whole {durationLabel(duration)} must be free and end by {formatTime12h(fromMinutes(gridBounds().closing))}.
        </p>
      </div>
    </Modal>
  );
}

export function RequestRoomModal({
  room,
  semester,
  onClose,
  onSubmitted,
}: {
  room: LendableRoom;
  semester: RoomRequestSemester | null;
  onClose: () => void;
  onSubmitted: (result: RoomRequestMutationResult) => void;
}) {
  const { toast } = useToast();
  const ids = useId();
  const [choice, setChoice] = useState<ScheduleChoice | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const scheduleButtonRef = useRef<HTMLButtonElement>(null);
  const wasPicking = useRef(false);
  const [purpose, setPurpose] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [openedSemesterId] = useState(semester?.id ?? null);

  const occupancy = useOccupancy(room.id, semester?.id ?? null);

  // The picker cannot hand focus back while this form is still inert, so do it once the form is active again.
  useEffect(() => {
    if (wasPicking.current && !isPicking) scheduleButtonRef.current?.focus();
    wasPicking.current = isPicking;
  }, [isPicking]);

  const conflicts = choice ? windowConflicts(choiceWindow(choice), occupancy.blocks) : [];
  const choiceValid = choice !== null && occupancy.status === 'ready' && fitsSchedule(choice, occupancy.blocks);
  const purposeMissing = purpose.trim() === '';
  const canSubmit = semester !== null && choiceValid && !purposeMissing && !isSubmitting;
  const submitHint = semester === null
    ? 'There is no active semester to request a room for.'
    : choice === null
      ? 'Choose a schedule to continue.'
      : occupancy.status === 'loading' || occupancy.status === 'idle'
        ? 'Waiting for the room’s availability.'
        : occupancy.status === 'error' || occupancy.status === 'stale'
          ? 'Availability must load successfully before you can submit.'
          : !choiceValid
            ? 'The chosen time is no longer free. Change the schedule.'
            : purposeMissing
              ? 'Enter a purpose to continue.'
              : null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || semester === null || choice === null) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitRoomRequest({
        room_id: room.id,
        semester_id: semester.id,
        purpose: purpose.trim(),
        windows: [choiceWindow(choice)],
      });
      onSubmitted(result);
    } catch (error) {
      const message = apiErrorMessage(error, 'The room request could not be submitted.');
      setSubmitError(message);
      toast.error('Request Failed', message);
      // The room may have been booked meanwhile; refresh availability, keeping the entered values.
      occupancy.retry();
    } finally {
      setIsSubmitting(false);
    }
  };

  const ownerCode = room.department?.department_code ?? 'the owning department';

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        inert={isPicking}
        closeOnEscape={!isPicking}
        title="Request Room"
        description="Ask another department to lend one of its lecture rooms. Its secretary reviews the request."
        size="lg"
        className="!max-w-2xl"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p id={`${ids}-hint`} className="text-xs font-semibold text-gray-500" aria-live="polite">{submitHint ?? ''}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
              <button
                type="submit"
                form={`${ids}-form`}
                disabled={!canSubmit}
                aria-describedby={submitHint ? `${ids}-hint` : undefined}
                className={primaryButton}
              >
                {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {isSubmitting ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        }
      >
        <form id={`${ids}-form`} onSubmit={(event) => void submit(event)} className="space-y-6 p-5 font-sans" noValidate>
          <section aria-labelledby={`${ids}-room-title`}>
            <SectionTitle><span id={`${ids}-room-title`}>Room</span></SectionTitle>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Fact label="Selected room">
                <span className="font-mono text-[#4e0a10]">{room.room_code}</span>
                <span className="block text-xs font-semibold text-gray-500">{room.building || 'No building assigned'}</span>
              </Fact>
              <Fact label="Owning department">
                {room.department ? room.department.department_code : 'Not assigned'}
                {room.department && <span className="block text-xs font-semibold text-gray-500">{room.department.department_name}</span>}
              </Fact>
              <Fact label="Academic semester">{formatSemester(semester)}</Fact>
            </dl>
            {semester !== null && openedSemesterId !== null && semester.id !== openedSemesterId && (
              <div className="mt-2">
                <Notice tone="info" icon={<RefreshCw size={14} />}>
                  The active semester changed while this form was open. Availability was reloaded for {formatSemester(semester)}.
                </Notice>
              </div>
            )}
          </section>

          <section aria-labelledby={`${ids}-time-title`}>
            <SectionTitle><span id={`${ids}-time-title`}>Requested time</span></SectionTitle>
            {choice === null ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-gray-500">
                  Pick a weekly day and time, 1.5 or 3 hours long, from {room.room_code}’s timetable.
                </p>
                <button ref={scheduleButtonRef} type="button" onClick={() => setIsPicking(true)} disabled={semester === null} className={`${primaryButton} shrink-0 whitespace-nowrap`}>
                  <CalendarClock size={15} /> Choose Schedule
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border border-[#C9952A]/30 bg-[#C9952A]/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <CalendarClock size={20} className="shrink-0 text-[#C9952A]" />
                  <div>
                    <p className="text-sm font-extrabold text-gray-800">Every {choice.day}</p>
                    <p className="text-sm font-semibold text-gray-700">
                      {formatTime12h(choice.start)} – {formatTime12h(choiceEnd(choice))}
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-[#C9952A]/30 bg-white px-2 py-0.5 text-[11px] font-extrabold text-[#8a6416]">
                        <Clock size={11} /> {durationLabel(choice.duration)}
                      </span>
                    </p>
                  </div>
                </div>
                <button ref={scheduleButtonRef} type="button" onClick={() => setIsPicking(true)} className={`${secondaryButton} shrink-0 whitespace-nowrap`}>
                  <CalendarClock size={15} /> Change Schedule
                </button>
              </div>
            )}

            <div className="mt-3" role="status" aria-live="polite">
              {choice !== null && (occupancy.status === 'loading' || occupancy.status === 'idle') && (
                <Notice tone="muted" icon={<Loader2 size={14} className="animate-spin" />}>Checking {room.room_code}’s timetable…</Notice>
              )}
              {choice !== null && (occupancy.status === 'error' || occupancy.status === 'stale') && (
                <Notice tone="danger" icon={<XCircle size={14} />} action={<RetryButton onClick={occupancy.retry} />}>
                  Availability could not be confirmed. Retry before sending.
                </Notice>
              )}
              {choice !== null && occupancy.status === 'ready' && !choiceValid && (
                <Notice tone="danger" icon={<XCircle size={14} />}>
                  <p>This time is no longer free{conflicts.length > 0 ? ':' : '.'}</p>
                  {conflicts.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 font-medium">
                      {conflicts.map((block, index) => (
                        <li key={`${block.kind}-${block.start_time}-${index}`}>
                          {formatTime12h(block.start_time)} – {formatTime12h(block.end_time)} · {block.label || block.department_code || 'Booked'}
                        </li>
                      ))}
                    </ul>
                  )}
                </Notice>
              )}
              {choiceValid && (
                <Notice tone="success" icon={<CheckCircle2 size={14} />}>{room.room_code} is free at this time.</Notice>
              )}
            </div>
          </section>

          <section aria-labelledby={`${ids}-purpose-title`}>
            <SectionTitle><span id={`${ids}-purpose-title`}>Purpose</span></SectionTitle>
            <label htmlFor={`${ids}-purpose`} className={labelClass}>
              Why do you need this room? <span className="text-red-600" aria-hidden="true">*</span>
            </label>
            <textarea
              id={`${ids}-purpose`}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              rows={3}
              maxLength={1000}
              required
              aria-required="true"
              placeholder="e.g. IT 1A lecture classes; our lecture rooms are fully booked."
              className={fieldClass}
            />
          </section>

          <section aria-labelledby={`${ids}-summary-title`} className="rounded-xl border border-[#5A1220]/15 bg-[#5A1220]/[0.03] p-4">
            <SectionTitle><span id={`${ids}-summary-title`}>Summary</span></SectionTitle>
            <p className="text-sm font-semibold text-gray-700">
              Ask <strong>{ownerCode}</strong> to lend <strong>{room.room_code}</strong>
              {choice
                ? <> every <strong>{choice.day}</strong>, {formatTime12h(choice.start)} – {formatTime12h(choiceEnd(choice))} ({durationLabel(choice.duration)})</>
                : ' at a weekly time you choose'}
              , for <strong>{formatSemester(semester)}</strong>.
            </p>
          </section>

          {submitError && (
            <div role="alert">
              <Notice tone="danger" icon={<XCircle size={14} />}>
                <p>{submitError}</p>
                <p className="font-medium">Your entries are kept. Adjust them and send again.</p>
              </Notice>
            </div>
          )}
        </form>
      </Modal>

      {isPicking && (
        <SchedulePickerModal
          roomCode={room.room_code}
          semester={semester}
          occupancy={occupancy}
          initial={choice}
          onCancel={() => setIsPicking(false)}
          onConfirm={(confirmed) => {
            setChoice(confirmed);
            setSubmitError(null);
            setIsPicking(false);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Requests list                                                       */
/* ------------------------------------------------------------------ */

const canGiveBack = (request: RoomRequest, departmentId: number | null): boolean =>
  hasStoredCapability('room.request')
  && departmentId !== null
  && request.requesting_department?.id === departmentId
  && (request.status === 'pending' || request.status === 'approved');

const roomTbaMessage = (request: RoomRequest, affected: RoomOccupancySchedule[] | null): string => {
  const roomCode = request.room?.room_code ?? 'the room';
  if (affected === null) {
    return `Classes held in ${roomCode} under this grant will move to Room TBA and need a new room.`;
  }
  if (affected.length === 0) {
    return `No classes are scheduled in ${roomCode} under this grant, so no class will move to Room TBA.`;
  }
  const names = affected.slice(0, 5)
    .map((schedule) => `${schedule.course?.course_code ?? 'Class'} ${schedule.section?.section_name ?? ''} (${schedule.day.slice(0, 3)} ${formatTime12h(schedule.start_time)})`.replace(/\s+/g, ' '))
    .join(', ');
  return `${affected.length} class meeting${affected.length === 1 ? '' : 's'} will move to Room TBA and need a new room: ${names}${affected.length > 5 ? ', …' : ''}.`;
};

function useGiveBack(onChanged: (result: RoomRequestMutationResult) => void) {
  const { toast, confirm } = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);

  const giveBack = async (request: RoomRequest, affected: RoomOccupancySchedule[] | null = null) => {
    if (busyId !== null) return;
    const roomCode = request.room?.room_code ?? 'the room';
    const isApproved = request.status === 'approved';
    const confirmed = await confirm({
      title: isApproved ? 'Give Back Room' : 'Cancel Request',
      message: isApproved
        ? `Your department will no longer be able to schedule into ${roomCode}. ${roomTbaMessage(request, affected)}`
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
      onChanged(result);
    } catch (error) {
      toast.error('Action Failed', apiErrorMessage(error, 'The request could not be updated.'));
    } finally {
      setBusyId(null);
    }
  };

  return { giveBack, busyId };
}

export function RequestsModal({
  requests,
  status,
  errorMessage,
  semester,
  departmentId,
  onRetry,
  onClose,
  onPreview,
  onChanged,
}: {
  requests: RoomRequest[];
  status: RequestsLoadStatus;
  errorMessage: string | null;
  semester: RoomRequestSemester | null;
  departmentId: number | null;
  onRetry: () => void;
  onClose: () => void;
  onPreview: (request: RoomRequest) => void;
  onChanged: (result: RoomRequestMutationResult) => void;
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
  // Until the user picks a tab, open the one with decisions waiting, even if the list loads after opening.
  const [chosenTab, setTab] = useState<RequestsTab | null>(null);
  const tab: RequestsTab = chosenTab ?? (receivedRequests.some((request) => request.status === 'pending') ? 'received' : 'sent');
  const visibleRequests = !hasTabs ? activeRequests : tab === 'sent' ? sentRequests : receivedRequests;

  const columns = useMemo<ColumnDef<RoomRequest>[]>(() => [
    {
      id: 'room',
      accessorFn: (request) => request.room?.room_code ?? '',
      header: 'Room',
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-mono text-sm font-bold text-[#4e0a10]">{row.original.room?.room_code ?? 'Room unavailable'}</span>
          <p className="text-[11px] font-semibold text-gray-400">
            {row.original.room?.is_archived ? 'Archived room' : row.original.room?.building || 'No building'}
          </p>
        </div>
      ),
    },
    {
      id: 'department',
      accessorFn: (request) => (tab === 'sent' ? request.owner_department?.code : request.requesting_department?.code) ?? '',
      header: tab === 'sent' ? 'Room Owner' : 'Requested By',
      cell: ({ getValue }) => <span className="font-semibold text-gray-700">{getValue<string>() || '—'}</span>,
    },
    {
      id: 'semester',
      accessorFn: (request) => shortSemester(request.academic_semester),
      header: 'Semester',
      cell: ({ getValue }) => <span className="whitespace-nowrap text-xs font-semibold text-gray-600">{getValue<string>()}</span>,
    },
    {
      id: 'window',
      accessorFn: (request) => request.windows.map(describeWindowLine).join('; '),
      header: 'Requested Window',
      cell: ({ row }) => (
        <ul className="space-y-0.5">
          {row.original.windows.length === 0 && <li className="text-xs text-gray-400">Not specified</li>}
          {row.original.windows.map((window, index) => (
            <li key={`${window.day}-${window.start_time}-${index}`} className="whitespace-nowrap text-xs">
              <span className="font-bold text-gray-800">{window.day}</span>{' '}
              <span className="font-semibold text-gray-600">{formatTime12h(window.start_time)} – {formatTime12h(window.end_time)}</span>{' '}
              <span className="text-gray-400">· {formatDuration(windowMinutes(window))}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'status',
      accessorFn: (request) => request.status,
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.original.status} />
          {row.original.owner_changed && row.original.status === 'pending' && (
            <span className="text-[10px] font-bold text-amber-700">Room reassigned</span>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { align: 'right', stopRowClick: true },
      cell: ({ row }) => {
        const request = row.original;
        const roomCode = request.room?.room_code ?? 'room';
        const isApproved = request.status === 'approved';
        return (
          <div className="flex justify-end gap-1.5">
            <TableActionButton
              label={`View request for ${roomCode}`}
              variant="view"
              onClick={() => onPreview(request)}
              className="!w-auto gap-1.5 px-3 text-xs font-extrabold"
            >
              <Eye size={15} />
              View
            </TableActionButton>
            {canGiveBack(request, departmentId) && (
              <TableActionButton
                label={isApproved ? `Give back ${roomCode}` : `Cancel request for ${roomCode}`}
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
  ], [onPreview, departmentId, busyId, giveBack, tab]);

  const table = useDataTable({ data: visibleRequests, columns, pageSize: false, getRowId: (row) => String(row.id) });

  const tabButtonClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]/30 cursor-pointer ${
      active ? 'bg-[#5A1220] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
    }`;
  const tabCountClass = (active: boolean) =>
    `min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`;

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next: RequestsTab = tab === 'sent' ? 'received' : 'sent';
    setTab(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Room Requests"
      description={`Pending and approved requests sent from or received by your department${semester ? ` for ${formatSemester(semester)}` : ''}.`}
      size="lg"
      className="!max-w-5xl"
    >
      <div className="space-y-4 p-5 font-sans">
        {hasTabs && (
          <div className="flex w-max items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/90 p-1" role="tablist" aria-label="Room request direction" onKeyDown={onTabKeyDown}>
            {(['sent', 'received'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                data-tab={value}
                id={`room-requests-tab-${value}`}
                aria-controls="room-requests-panel"
                aria-selected={tab === value}
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
                className={tabButtonClass(tab === value)}
              >
                {value === 'sent' ? 'Sent' : 'Received'}
                <span className={tabCountClass(tab === value)}>{value === 'sent' ? sentRequests.length : receivedRequests.length}</span>
              </button>
            ))}
          </div>
        )}
        <div id="room-requests-panel" role={hasTabs ? 'tabpanel' : undefined} aria-labelledby={hasTabs ? `room-requests-tab-${tab}` : undefined}>
          {status === 'error' ? (
            <div role="alert">
              <Notice tone="danger" icon={<XCircle size={14} />} action={<RetryButton onClick={onRetry} />}>
                <p>Room requests could not be loaded.</p>
                {errorMessage && <p className="font-medium">{errorMessage}</p>}
              </Notice>
            </div>
          ) : (
            <div className="space-y-3">
              {status === 'stale' && (
                <Notice tone="warning" icon={<AlertTriangle size={14} />} action={<RetryButton onClick={onRetry} />}>
                  Requests could not be refreshed. The list below may be out of date.
                </Notice>
              )}
              <DataTable
                table={table}
                isLoading={status === 'loading'}
                loadingRows={3}
                showPagination={false}
                totalLabel="requests"
                ariaLabel="Room requests"
                emptyTitle="No active requests"
                emptyDescription={
                  tab === 'sent'
                    ? 'Your department has no pending or approved requests this semester.'
                    : 'No other department has a pending or approved request for your rooms this semester.'
                }
                density="compact"
                scrollClassName="overflow-x-auto"
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Request details and review                                          */
/* ------------------------------------------------------------------ */

const remarksHeading: Partial<Record<RoomRequestStatus, string>> = {
  approved: 'Approval remarks',
  rejected: 'Reason for rejection',
  revoked: 'Reason for revoking',
};

export function RequestPreviewModal({
  request,
  departmentId,
  onClose,
  onChanged,
}: {
  request: RoomRequest;
  departmentId: number | null;
  onClose: () => void;
  onChanged: (result: RoomRequestMutationResult) => void;
}) {
  const { toast, confirm } = useToast();
  const ids = useId();
  const [remarks, setRemarks] = useState('');
  const [remarksMissing, setRemarksMissing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const remarksRef = useRef<HTMLTextAreaElement>(null);

  const isPending = request.status === 'pending';
  const isApproved = request.status === 'approved';
  const canReview = hasStoredCapability('room.review_requests') && departmentId !== null && getOwnerId(request) === departmentId;
  const isOwn = canGiveBack(request, departmentId);
  const { giveBack, busyId } = useGiveBack(onChanged);
  const isStale = Boolean(request.owner_changed);
  const isArchived = Boolean(request.room?.is_archived);
  const canApprove = canReview && isPending && !isStale && !isArchived;
  const roomCode = request.room?.room_code ?? 'the room';
  const requester = request.requesting_department?.code ?? 'The department';

  // Which classes would become Room TBA, from the same room/semester timetable the server releases.
  const showsImpact = isApproved && (canReview || isOwn);
  const impact = useOccupancy(showsImpact ? request.room?.id ?? null : null, request.academic_semester?.id ?? null);
  const affected = impact.status === 'ready' ? classesUnderGrant(request, impact.schedules) : null;

  const run = async (action: () => Promise<RoomRequestMutationResult>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const result = await action();
      toast.success('Room Request', result.message);
      onChanged(result);
    } catch (error) {
      toast.error('Action Failed', apiErrorMessage(error, 'The request could not be updated.'));
    } finally {
      setIsBusy(false);
    }
  };

  const requireRemarks = (): boolean => {
    if (remarks.trim() !== '') return true;
    setRemarksMissing(true);
    remarksRef.current?.focus();
    remarksRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return false;
  };

  const approve = async () => {
    const confirmed = await confirm({
      title: 'Approve Room Request',
      message: `${requester} will be able to schedule classes in ${roomCode} during the requested windows for ${formatSemester(request.academic_semester)}.`,
      eyebrow: 'Room Request',
      confirmLabel: 'Approve',
      variant: 'success',
    });
    if (confirmed) await run(() => reviewRoomRequest(request.id, 'approve', remarks.trim()));
  };

  const reject = async () => {
    if (!requireRemarks()) return;
    const confirmed = await confirm({
      title: 'Reject Room Request',
      message: `${requester} will not be able to use ${roomCode} for these windows.`,
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
      message: `${requester} will lose access to ${roomCode}. ${roomTbaMessage(request, affected)}`,
      eyebrow: 'Room Request',
      confirmLabel: 'Revoke',
      variant: 'danger',
    });
    if (confirmed) await run(() => reviewRoomRequest(request.id, 'revoke', remarks.trim()));
  };

  const needsRemarks = canReview && (isPending || isApproved);
  const remarksLabel = isApproved ? 'Reason for revoking' : canApprove ? 'Remarks' : 'Reason for rejecting';
  const remarksHint = isApproved
    ? 'Required to revoke. The borrowing department sees it.'
    : canApprove
      ? 'Optional when approving; required to reject.'
      : 'Required to reject.';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Room Request"
      description={`${requester} requesting ${roomCode}`}
      size="lg"
      className="!max-w-2xl"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Close</button>
          {isOwn && (
            <button type="button" disabled={isBusy || busyId !== null} onClick={() => void giveBack(request, affected)} className={isApproved ? dangerButton : secondaryButton}>
              <Trash2 size={15} /> {isApproved ? 'Give Back Room' : 'Cancel Request'}
            </button>
          )}
          {canReview && isPending && (
            <button type="button" disabled={isBusy} onClick={() => void reject()} className={dangerButton}>
              <X size={15} /> Reject
            </button>
          )}
          {canApprove && (
            <button type="button" disabled={isBusy} onClick={() => void approve()} className={primaryButton}>
              <Check size={15} /> Approve
            </button>
          )}
          {canReview && isApproved && (
            <button type="button" disabled={isBusy} onClick={() => void revoke()} className={dangerButton}>
              <Undo2 size={15} /> Revoke Grant
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-5 p-5 font-sans">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={request.status} />
            <span className="text-xs font-semibold text-gray-400">Sent {formatDate(request.created_at)}</span>
          </div>
          <span className="font-mono text-sm font-bold text-[#4e0a10]">{roomCode}</span>
        </div>

        {isPending && isStale && (
          <Notice tone="warning" icon={<AlertTriangle size={14} />}>
            {roomCode} was reassigned after this request was sent, so it can no longer be approved.
            {isOwn ? ' Cancel it and send a new request to the room’s current owner.' : ' It can still be rejected.'}
          </Notice>
        )}
        {isPending && isArchived && !isStale && (
          <Notice tone="warning" icon={<AlertTriangle size={14} />}>
            {roomCode} has been archived, so this request can no longer be approved.
          </Notice>
        )}

        <section aria-labelledby={`${ids}-who`}>
          <SectionTitle><span id={`${ids}-who`}>Details</span></SectionTitle>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Fact label="Requested by">
              {request.requesting_department?.code ?? 'Not specified'}
              {request.requester && <span className="block text-xs font-semibold text-gray-500">{request.requester.name}</span>}
            </Fact>
            <Fact label="Room owner">
              {request.owner_department?.code ?? 'Not specified'}
              {request.room?.building && <span className="block text-xs font-semibold text-gray-500">{request.room.building}</span>}
            </Fact>
            <Fact label="Academic semester">{formatSemester(request.academic_semester)}</Fact>
            <Fact label="Room">{roomCode}{isArchived && <span className="ml-1 text-xs font-semibold text-gray-500">(archived)</span>}</Fact>
          </dl>
        </section>

        <section aria-labelledby={`${ids}-windows`}>
          <SectionTitle><span id={`${ids}-windows`}>Requested window{request.windows.length === 1 ? '' : 's'}</span></SectionTitle>
          {request.windows.length === 0 ? (
            <p className="text-sm font-semibold text-gray-500">Not specified</p>
          ) : (
            <ul className="space-y-1.5">
              {request.windows.map((window, index) => (
                <li key={`${window.day}-${window.start_time}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-bold text-gray-800">
                    <CalendarClock size={15} className="text-[#C9952A]" />
                    {describeWindowLine(window)}
                  </span>
                  <span className="text-xs font-semibold text-gray-500">{formatDuration(windowMinutes(window))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby={`${ids}-purpose`}>
          <SectionTitle><span id={`${ids}-purpose`}>Purpose</span></SectionTitle>
          <p className="whitespace-pre-line rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5 text-sm text-gray-700">
            {request.purpose || 'No purpose given.'}
          </p>
        </section>

        {(request.reviewer || request.review_remarks) && (
          <section aria-labelledby={`${ids}-review`}>
            <SectionTitle><span id={`${ids}-review`}>Review</span></SectionTitle>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Fact label="Reviewed by">{request.reviewer?.name ?? '—'}</Fact>
              <Fact label="Reviewed on">{formatDate(request.reviewed_at)}</Fact>
            </dl>
            {request.review_remarks && (
              <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2.5 text-sm text-gray-700">
                <span className="block text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{remarksHeading[request.status] ?? 'Remarks'}</span>
                {request.review_remarks}
              </div>
            )}
          </section>
        )}

        {showsImpact && (
          <section aria-labelledby={`${ids}-impact`}>
            <SectionTitle><span id={`${ids}-impact`}>If this grant ends</span></SectionTitle>
            {impact.status === 'loading' || impact.status === 'idle' ? (
              <Notice tone="muted" icon={<Loader2 size={14} className="animate-spin" />}>Checking which classes use this grant…</Notice>
            ) : impact.status === 'error' || impact.status === 'stale' ? (
              <Notice tone="warning" icon={<AlertTriangle size={14} />} action={<RetryButton onClick={impact.retry} />}>
                <p>The affected classes could not be loaded.</p>
                <p className="font-medium">Classes held in {roomCode} under this grant will still move to Room TBA.</p>
              </Notice>
            ) : affected && affected.length > 0 ? (
              <Notice tone="warning" icon={<AlertTriangle size={14} />}>
                <p>{affected.length} class meeting{affected.length === 1 ? '' : 's'} will move to <strong>Room TBA</strong> and need a new room. Their schedule status does not change.</p>
                <ul className="list-disc space-y-0.5 pl-4 font-medium">
                  {affected.map((schedule) => (
                    <li key={schedule.id}>
                      {schedule.course?.course_code ?? 'Class'} {schedule.section?.section_name ?? ''} · {schedule.day}, {formatTime12h(schedule.start_time)} – {formatTime12h(schedule.end_time)}
                    </li>
                  ))}
                </ul>
              </Notice>
            ) : (
              <Notice tone="info" icon={<CheckCircle2 size={14} />}>
                No classes are scheduled in {roomCode} under this grant. Ending it moves nothing to Room TBA.
              </Notice>
            )}
          </section>
        )}

        {needsRemarks && (
          <section aria-labelledby={`${ids}-remarks-title`}>
            <SectionTitle><span id={`${ids}-remarks-title`}>Your decision</span></SectionTitle>
            <label htmlFor={`${ids}-remarks`} className={labelClass}>
              {remarksLabel} {!canApprove && <span className="text-red-600" aria-hidden="true">*</span>}
            </label>
            <textarea
              id={`${ids}-remarks`}
              ref={remarksRef}
              value={remarks}
              onChange={(event) => {
                setRemarks(event.target.value);
                if (event.target.value.trim() !== '') setRemarksMissing(false);
              }}
              rows={3}
              maxLength={1000}
              aria-invalid={remarksMissing}
              aria-describedby={`${ids}-remarks-hint`}
              placeholder={isPending ? 'e.g. The room is reserved for our own classes on Mondays.' : 'Why is this grant being revoked?'}
              className={`${fieldClass} ${remarksMissing ? '!border-red-400' : ''}`}
            />
            <p id={`${ids}-remarks-hint`} className={`mt-1 text-xs font-semibold ${remarksMissing ? 'text-red-600' : 'text-gray-400'}`}>
              {remarksMissing ? `Enter a reason to ${isPending ? 'reject this request' : 'revoke this grant'}.` : remarksHint}
            </p>
          </section>
        )}
      </div>
    </Modal>
  );
}
