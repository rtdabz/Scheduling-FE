import { useMemo, useState } from 'react';
import { Archive, Plus } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { toApiTime, toTimeInputValue } from '../../lib/operatingHours';
import { useToast } from '../../context/ToastContext';
import LoadingSpinner from '../ui/LoadingSpinner';
import TableActionButton from '../ui/TableActionButton';

export interface TimeslotOverride {
  id: number;
  duration_minutes: number;
  /** 12-hour clock text such as "7:30 AM", as the API sends it. */
  start_time: string;
  is_active: boolean;
}

/** The durations the scheduler places classes in. */
const DURATIONS = [60, 90, 120, 180, 240];

const durationLabel = (minutes: number): string => {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hr` : `${minutes} min`;
};

const startMinutes = (value: string): number => {
  const input = toTimeInputValue(value);
  if (!input) return Number.MAX_SAFE_INTEGER;
  const [hour, minute] = input.split(':').map(Number);
  return hour * 60 + minute;
};

interface Props {
  overrides: TimeslotOverride[];
  onChange: (next: TimeslotOverride[]) => void;
}

/**
 * Custom start times for a class duration. While a duration has at least one
 * active override, only those start times are offered for it; with none, they
 * are generated from the institution's operating hours.
 */
export default function TimeslotOverridesPanel({ overrides, onChange }: Props) {
  const { toast, confirm } = useToast();
  const [duration, setDuration] = useState(DURATIONS[0]);
  const [startTime, setStartTime] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const grouped = useMemo(() => {
    const byDuration = new Map<number, TimeslotOverride[]>();
    for (const override of overrides) {
      byDuration.set(override.duration_minutes, [...(byDuration.get(override.duration_minutes) ?? []), override]);
    }
    return [...byDuration.entries()]
      .sort(([first], [second]) => first - second)
      .map(([minutes, rows]) => [minutes, [...rows].sort((a, b) => startMinutes(a.start_time) - startMinutes(b.start_time))] as const);
  }, [overrides]);

  const apiStart = startTime ? toApiTime(startTime) : '';
  const isDuplicate = apiStart !== '' && overrides.some(
    (override) => override.duration_minutes === duration && startMinutes(override.start_time) === startMinutes(apiStart),
  );

  const addOverride = async () => {
    if (!apiStart || isDuplicate || isAdding) return;
    setIsAdding(true);
    try {
      const { data } = await api.post<{ override: TimeslotOverride }>('/timeslots/overrides', {
        duration_minutes: duration,
        start_time: apiStart,
        is_active: true,
      });
      onChange([...overrides, data.override]);
      setStartTime('');
      toast.success('Start time added', `${apiStart} is now offered for ${durationLabel(duration)} classes.`);
    } catch (error) {
      toast.error('Not added', apiErrorMessage(error, 'Failed to add the start time.'));
    } finally {
      setIsAdding(false);
    }
  };

  const toggleOverride = async (override: TimeslotOverride) => {
    if (busyId !== null) return;
    setBusyId(override.id);
    try {
      const { data } = await api.patch<{ override: TimeslotOverride }>(`/timeslots/overrides/${override.id}`, {
        is_active: !override.is_active,
      });
      onChange(overrides.map((entry) => (entry.id === override.id ? data.override : entry)));
    } catch (error) {
      toast.error('Not updated', apiErrorMessage(error, 'Failed to update the start time.'));
    } finally {
      setBusyId(null);
    }
  };

  const archiveOverride = async (override: TimeslotOverride) => {
    if (busyId !== null) return;
    const confirmed = await confirm({
      title: 'Archive Start Time',
      message: `${override.start_time} will stop being offered for ${durationLabel(override.duration_minutes)} classes and can be restored from the Archive.`,
      eyebrow: 'Archive Record',
      confirmLabel: 'Confirm Archive',
      variant: 'danger',
    });
    if (!confirmed) return;

    setBusyId(override.id);
    try {
      await api.delete(`/timeslots/overrides/${override.id}`);
      onChange(overrides.filter((entry) => entry.id !== override.id));
      toast.success('Archived', 'Start time moved to the Archive.');
    } catch (error) {
      toast.error('Archive Failed', apiErrorMessage(error, 'Failed to archive the start time.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4">
      <p className="text-xs leading-5 text-gray-500">
        By default, start times are generated from the operating hours. Add a start time here to offer only your own
        times for that class length. Turn a start time off, or archive it, to go back to the generated ones.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Class length</span>
          <select
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            disabled={isAdding}
            className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 outline-none transition-all focus:ring-2 focus:ring-[#C9952A] disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>{durationLabel(minutes)} ({minutes} min)</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Start time</span>
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            disabled={isAdding}
            className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 outline-none transition-all focus:ring-2 focus:ring-[#C9952A] disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void addOverride()}
          disabled={!apiStart || isDuplicate || isAdding}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#4e0a10] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#C9952A] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isAdding ? <LoadingSpinner className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          Add start time
        </button>
      </div>
      {isDuplicate && (
        <p className="mt-2 text-xs font-semibold text-red-600">That start time is already listed for this class length.</p>
      )}

      <div className="mt-4 space-y-3">
        {grouped.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-xs text-slate-500">
            No custom start times. Every class length uses the generated start times.
          </p>
        ) : grouped.map(([minutes, rows]) => {
          const hasActive = rows.some((row) => row.is_active);
          return (
            <div key={minutes} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-700">{durationLabel(minutes)} classes</p>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${hasActive ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                  {hasActive ? 'Only these start times are offered' : 'Generated start times in use'}
                </span>
              </div>
              <ul className="space-y-1.5">
                {rows.map((override) => (
                  <li key={override.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className={`text-sm font-bold ${override.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {override.start_time}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={override.is_active}
                        aria-label={`${override.is_active ? 'Turn off' : 'Turn on'} ${override.start_time} for ${durationLabel(minutes)} classes`}
                        onClick={() => void toggleOverride(override)}
                        disabled={busyId !== null}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${override.is_active ? 'bg-[#4e0a10]' : 'bg-gray-300'}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${override.is_active ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                      <TableActionButton
                        label="Archive"
                        variant="archive"
                        disabled={busyId !== null}
                        onClick={() => void archiveOverride(override)}
                      >
                        <Archive size={15} />
                      </TableActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
