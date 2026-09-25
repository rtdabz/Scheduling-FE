import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, ChevronRight, DoorOpen, House, Lock, RotateCcw, Save, Split, Users, type LucideIcon } from 'lucide-react';
import DataTable from '../../components/ui/DataTable';
import Skeleton from '../../components/ui/Skeleton';
import { useDataTable } from '../../components/ui/useDataTable';
import { useToast } from '../../context/ToastContext';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';

/**
 * How the department's programs share its rooms. Each lecture or laboratory
 * room may belong to one program (its home program); a room with none is shared
 * by every program. The policy says whether a program may go beyond its home
 * rooms. Only the secretary (`room.assign_program`) changes it; anyone else who
 * opens the page sees it read-only.
 */

type RoomSharingPolicy = 'open' | 'home_first' | 'strict';

interface ProgramOption {
  id: number;
  code: string;
  name: string | null;
}

interface ProgramRoom {
  id: number;
  room_code: string;
  building: string | null;
  room_type: string;
  status: string;
  home_program_id: number | null;
  /** Owning program per weekday, as saved; null when the rooms are not divided. */
  days: Record<string, { program_id: number; borrowable: boolean }> | null;
}

interface ProgramRoomsPayload {
  room_sharing_policy: RoomSharingPolicy;
  can_manage: boolean;
  programs: ProgramOption[];
  rooms: ProgramRoom[];
}

const POLICIES: { value: RoomSharingPolicy; title: string; description: string; icon: LucideIcon; order: string[] }[] = [
  {
    value: 'open',
    title: 'All rooms shared',
    description: "Every room is divided equally between the programs by whole days. Home programs are ignored. A program's unused days open to others once it has saved all its sections.",
    icon: Users,
    order: ['Equal days', 'Leftovers'],
  },
  {
    value: 'home_first',
    title: 'Home room first',
    description: "A program has its home rooms every day; the other rooms are divided equally by days. Its unused days open to others once it has saved all its sections.",
    icon: House,
    order: ['Home', 'Shared days', 'Leftovers'],
  },
  {
    value: 'strict',
    title: 'Home rooms only',
    description: "A program has its home rooms every day; the other rooms are divided equally by days. Never another program's days.",
    icon: Lock,
    order: ['Home', 'Shared days'],
  },
];

const DAY_LABELS: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
};

// The same badges the Room List uses.
const ROOM_TYPE_STYLES: Record<string, string> = {
  lecture: 'bg-blue-50 text-blue-700 border-blue-200',
  laboratory: 'bg-purple-50 text-purple-700 border-purple-200',
};

const SHARED = '';
const SHARED_LABEL = 'Shared (all programs)';

export default function ProgramRooms() {
  const { toast } = useToast();
  const [data, setData] = useState<ProgramRoomsPayload | null>(null);
  const [policy, setPolicy] = useState<RoomSharingPolicy>('open');
  const [homes, setHomes] = useState<Record<number, number | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const apply = useCallback((payload: ProgramRoomsPayload) => {
    setData(payload);
    setPolicy(payload.room_sharing_policy);
    setHomes(Object.fromEntries(payload.rooms.map((room) => [room.id, room.home_program_id])));
  }, []);

  useEffect(() => {
    let active = true;
    api.get<{ data: ProgramRoomsPayload }>('/program-rooms')
      .then((response) => { if (active) apply(response.data.data); })
      .catch((err) => { if (active) toast.error('Program Rooms', apiErrorMessage(err, 'Could not load the program rooms.')); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [apply, toast]);

  const rooms = useMemo(() => data?.rooms ?? [], [data]);
  const programs = useMemo(() => data?.programs ?? [], [data]);
  const canManage = data?.can_manage ?? false;

  const changedRooms = useMemo(
    () => rooms.filter((room) => (homes[room.id] ?? null) !== room.home_program_id),
    [rooms, homes],
  );
  const isDirty = data !== null && (policy !== data.room_sharing_policy || changedRooms.length > 0);

  const programCode = useCallback(
    (programId: number | null) => programs.find((program) => program.id === programId)?.code ?? SHARED_LABEL,
    [programs],
  );

  const roomsPerProgram = useMemo(() => {
    const counts = new Map<number | null, number>();
    rooms.forEach((room) => {
      const home = homes[room.id] ?? null;
      counts.set(home, (counts.get(home) ?? 0) + 1);
    });
    return counts;
  }, [rooms, homes]);

  const warnings = useMemo(() => {
    if (!data || policy === 'open') return [];
    const list: string[] = [];
    const sharedCount = roomsPerProgram.get(null) ?? 0;
    if (rooms.length > 0 && sharedCount === rooms.length) {
      list.push('No room has a home program yet, so every room is divided equally by days, the same as All rooms shared.');
    }
    if (policy === 'strict' && sharedCount === 0) {
      programs
        .filter((program) => (roomsPerProgram.get(program.id) ?? 0) === 0)
        .forEach((program) => list.push(`${program.code} has no home room and there is no shared room, so its classes cannot get a room.`));
    }
    return list;
  }, [data, policy, programs, rooms, roomsPerProgram]);

  const columns = useMemo<ColumnDef<ProgramRoom>[]>(() => [
    {
      id: 'room',
      accessorKey: 'room_code',
      header: 'Room',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4e0a10]/5 text-[#4e0a10]">
            <DoorOpen size={16} />
          </div>
          <span className="font-mono text-sm font-bold text-[#4e0a10]">{row.original.room_code}</span>
        </div>
      ),
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
      cell: ({ row }) => (
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${ROOM_TYPE_STYLES[row.original.room_type] ?? 'border-gray-200 bg-gray-50 text-gray-600'}`}>
          {row.original.room_type}
        </span>
      ),
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`font-bold ${row.original.status === 'available' ? 'text-emerald-600' : 'text-gray-500'}`}>
          {row.original.status === 'available' ? 'Available' : 'Not available'}
        </span>
      ),
    },
    {
      id: 'home_program',
      accessorFn: (room) => programCode(homes[room.id] ?? null),
      header: 'Home Program',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => {
        const room = row.original;
        if (!canManage) {
          return <span className="font-bold text-gray-700">{programCode(room.home_program_id)}</span>;
        }
        return (
          <select
            aria-label={`Home program for ${room.room_code}`}
            value={homes[room.id] ?? SHARED}
            onChange={(event) => setHomes((current) => ({ ...current, [room.id]: event.target.value === SHARED ? null : Number(event.target.value) }))}
            className="w-full max-w-[240px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 outline-none focus:border-[#5A1220]"
          >
            <option value={SHARED}>{SHARED_LABEL}</option>
            {programs.map((program) => (
              <option key={program.id} value={program.id}>{program.code}{program.name ? ` - ${program.name}` : ''}</option>
            ))}
          </select>
        );
      },
    },
    {
      id: 'days',
      header: 'Days',
      enableSorting: false,
      cell: ({ row }) => <RoomDays days={row.original.days} programCode={programCode} stale={isDirty} />,
    },
  ], [canManage, homes, isDirty, programCode, programs]);

  const table = useDataTable({ data: rooms, columns, pageSize: 10, getRowId: (row) => String(row.id) });

  const reset = () => { if (data) apply(data); };

  const save = async () => {
    if (!data || !isDirty) return;
    setIsSaving(true);
    try {
      const response = await api.put<{ data: ProgramRoomsPayload }>('/program-rooms', {
        room_sharing_policy: policy,
        assignments: changedRooms.map((room) => ({ room_id: room.id, program_id: homes[room.id] ?? null })),
      });
      apply(response.data.data);
      toast.success('Program Rooms', 'Program rooms saved.');
    } catch (err) {
      toast.error('Program Rooms', apiErrorMessage(err, 'Could not save the program rooms.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm font-semibold text-gray-500">The program rooms could not be loaded.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-100 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/5 text-[#4e0a10]">
              <Split size={18} />
            </span>
            <div>
              <h3 className="text-base font-black text-[#4e0a10]">Room Sharing</h3>
              <p className="text-xs font-semibold text-gray-500">
                {canManage ? 'Choose how your programs share the department\'s rooms.' : 'How your programs share the department\'s rooms. Only the secretary can change it.'}
              </p>
            </div>
          </div>
          {canManage && isDirty && (
            <div className="flex items-center gap-2">
              <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-700 sm:inline">Unsaved changes</span>
              <button type="button" onClick={reset} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3.5 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">
                <RotateCcw size={15} /> Reset
              </button>
              <button type="button" onClick={() => void save()} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-[#5A1220] px-4 py-2 text-sm font-extrabold text-white hover:bg-[#4e0a10] disabled:cursor-not-allowed disabled:opacity-50">
                <Save size={15} /> {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
        <div role="radiogroup" aria-label="Room sharing" className="mt-5 grid gap-3 md:grid-cols-3">
          {POLICIES.map((option) => {
            const selected = policy === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!canManage}
                onClick={() => setPolicy(option.value)}
                className={`relative flex flex-col rounded-xl border p-4 text-left transition-colors ${
                  selected
                    ? 'border-[#5A1220] bg-[#5A1220]/[0.04] ring-1 ring-[#5A1220]'
                    : 'border-gray-200 bg-white enabled:hover:border-[#5A1220]/40 enabled:hover:bg-gray-50'
                } disabled:cursor-default`}
              >
                {selected && <CheckCircle2 size={18} className="absolute right-3 top-3 text-[#5A1220]" />}
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${selected ? 'bg-[#5A1220] text-white' : 'bg-[#4e0a10]/5 text-[#4e0a10]'}`}>
                  <Icon size={17} />
                </span>
                <span className="mt-3 text-sm font-extrabold text-[#4e0a10]">{option.title}</span>
                <span className="mt-1 flex-1 text-xs font-semibold leading-relaxed text-gray-500">{option.description}</span>
                <span className="mt-3 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-3">
                  {option.order.map((step, index) => (
                    <span key={step} className="flex items-center gap-1">
                      {index > 0 && <ChevronRight size={12} className="text-gray-300" />}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${selected ? 'bg-[#5A1220]/10 text-[#5A1220]' : 'bg-gray-100 text-gray-500'}`}>{step}</span>
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {warnings.length > 0 && (
          <ul className="mt-4 space-y-2">
            {warnings.map((warning) => (
              <li key={warning} className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {warning}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-500">
            {programs.length < 2
              ? 'Your department has one program, so its rooms are not divided.'
              : isDirty
                ? 'The days update when you save.'
                : 'Days show which program uses each room. Sunday is open to every program.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {programs.map((program) => (
              <span key={program.id} className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-bold text-gray-600">
                {program.code}: {roomsPerProgram.get(program.id) ?? 0}
              </span>
            ))}
            <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-bold text-gray-600">Shared: {roomsPerProgram.get(null) ?? 0}</span>
          </div>
        </div>
        <DataTable
          table={table}
          totalLabel="rooms"
          ariaLabel="Program rooms"
          emptyTitle="No lecture or laboratory rooms"
          emptyDescription="Rooms are assigned to departments by the VPAA."
        />
      </div>
    </div>
  );
}

/** The room's days grouped by program: "X Mon · Wed · Fri", or "Y Every day" for a home room. */
function RoomDays({
  days,
  programCode,
  stale,
}: {
  days: ProgramRoom['days'];
  programCode: (programId: number | null) => string;
  stale: boolean;
}) {
  if (!days) {
    return <span className="text-xs font-semibold text-gray-400">Every day, all programs</span>;
  }

  const byProgram = new Map<number, string[]>();
  Object.entries(days).forEach(([day, share]) => {
    byProgram.set(share.program_id, [...(byProgram.get(share.program_id) ?? []), day]);
  });

  return (
    <div className={`flex flex-wrap gap-1.5 ${stale ? 'opacity-50' : ''}`}>
      {[...byProgram.entries()].map(([programId, programDays]) => (
        <span key={programId} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-gray-600">
          <span className="font-extrabold text-[#4e0a10]">{programCode(programId)}</span>
          {programDays.length === Object.keys(DAY_LABELS).length
            ? 'Every day'
            : programDays.map((day) => DAY_LABELS[day] ?? day).join(' · ')}
        </span>
      ))}
    </div>
  );
}
