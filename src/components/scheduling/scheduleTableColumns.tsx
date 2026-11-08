import { useMemo } from 'react';
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import type { ConflictFlags } from '../../lib/conflicts';
import { FULL_DAY_NAMES, slotToTimeLabel } from '../../lib/timeGrid';
import type { ScheduleItem } from '../../pages/ClassSchedules/SchedulerPanel/types';

/**
 * The Dean Schedules meeting table, shared with the approval Schedule details dialog: one row per
 * meeting, the same seven columns, formatting, chronological sort, badges, and conflict chips. Parents
 * own the data scope, filters, fetching, and checks, and pass ready-to-display rows.
 */
export interface ScheduleTableRow {
  id: string;
  sectionId: string;
  sectionName: string;
  subjectCode: string;
  subjectName: string;
  subjectCategory: 'major' | 'minor';
  meetingType?: 'lecture' | 'laboratory' | null;
  facultyName: string | null;
  roomName: string;
  day: string;
  /** 12-hour labels, e.g. "8:00 AM". */
  startTime: string;
  endTime: string;
  /** Chronological order: day index (Monday = 0) × 10,000 + start slot. */
  sortKey: number;
  mode: 'on-site' | 'online' | 'field';
}

/**
 * Only a successful, applicable conflict check may report "No conflict". Unknown, failed, and
 * not-applicable results stay explicit in the Status column.
 */
export type ScheduleConflictState =
  | { status: 'ready'; flags: Map<string, ConflictFlags> }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'not-checked' };

/**
 * A mapped scheduler meeting as a table row. Uses the numeric day and slot fields (no re-parsing of
 * formatted times) and the mapper's room labels, including Online, Field, and Room TBA.
 */
export const scheduleItemToTableRow = (item: ScheduleItem): ScheduleTableRow => ({
  id: item.id,
  sectionId: item.sectionId,
  sectionName: item.sectionName,
  subjectCode: item.courseCode,
  subjectName: item.courseName,
  subjectCategory: item.courseType,
  meetingType: item.meetingType ?? null,
  facultyName: item.facultyName,
  roomName: item.roomName,
  day: FULL_DAY_NAMES[item.dayIndex] ?? item.day,
  startTime: slotToTimeLabel(item.startSlot),
  endTime: slotToTimeLabel(item.startSlot + item.durationSlots),
  sortKey: item.dayIndex * 10_000 + item.startSlot,
  mode: item.mode,
});

export const getModeLabel = (mode: ScheduleTableRow['mode']) => {
  if (mode === 'on-site') return 'On-Site';
  if (mode === 'online') return 'Online';
  return 'Field';
};

export const getModeBadgeClass = (mode: ScheduleTableRow['mode']) => {
  switch (mode) {
    case 'on-site':
      return 'bg-blue-100 text-blue-700';
    case 'online':
      return 'bg-green-100 text-green-700';
    case 'field':
      return 'bg-orange-100 text-orange-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

export const getConflictLabels = (info?: ConflictFlags) => {
  if (!info) return [];
  return [
    info.faculty ? 'Instructor Conflict' : '',
    info.room ? 'Room Conflict' : '',
    info.section ? 'Section Conflict' : '',
    info.online ? 'Online Class Conflict' : '',
  ].filter(Boolean);
};

/** Conflict labels of one meeting; empty unless the check succeeded. */
export const conflictLabelsFor = (conflicts: ScheduleConflictState, id: string): string[] => (
  conflicts.status === 'ready' ? getConflictLabels(conflicts.flags.get(id)) : []
);

const UNCHECKED_STATUS: Record<Exclude<ScheduleConflictState['status'], 'ready'>, { label: string; className: string }> = {
  loading: { label: 'Checking…', className: 'text-slate-500' },
  failed: { label: 'Check unavailable', className: 'text-amber-700' },
  'not-checked': { label: 'Not checked', className: 'text-slate-500' },
};

const statusText = (conflicts: ScheduleConflictState, id: string): string => {
  if (conflicts.status !== 'ready') return UNCHECKED_STATUS[conflicts.status].label;
  return conflictLabelsFor(conflicts, id).join(', ') || 'No conflict';
};

export const scheduleTableColumns = (conflicts: ScheduleConflictState): ColumnDef<ScheduleTableRow>[] => [
  {
    id: 'course',
    header: 'Course',
    accessorFn: (row) => `${row.subjectCode} ${row.subjectName}`,
    cell: ({ row }) => {
      const schedule = row.original;
      const showMeetingType = schedule.subjectCategory === 'major' && !!schedule.meetingType;
      return (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-slate-800">{schedule.subjectCode}</span>
            {showMeetingType && (
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${schedule.meetingType === 'laboratory' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
                {schedule.meetingType === 'laboratory' ? 'Lab' : 'Lec'}
              </span>
            )}
          </div>
          <p className="max-w-[260px] truncate text-[11px] font-medium text-slate-500" title={schedule.subjectName}>{schedule.subjectName}</p>
        </div>
      );
    },
  },
  { id: 'section', header: 'Section', accessorFn: (row) => row.sectionName || 'Unassigned' },
  {
    id: 'schedule',
    header: 'Day & Time',
    accessorFn: (row) => `${row.day} ${row.startTime} - ${row.endTime}`,
    sortingFn: (left, right) => left.original.sortKey - right.original.sortKey,
    cell: ({ row }) => (
      <div>
        <p className="font-bold text-slate-800">{row.original.day}</p>
        <p className="text-[11px] font-medium text-slate-500">{row.original.startTime} - {row.original.endTime}</p>
      </div>
    ),
  },
  { id: 'room', header: 'Room', accessorFn: (row) => row.roomName || 'Unassigned' },
  { id: 'faculty', header: 'Instructor', accessorFn: (row) => row.facultyName || 'Unassigned' },
  {
    id: 'mode',
    header: 'Mode',
    accessorFn: (row) => getModeLabel(row.mode),
    cell: ({ row }) => (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getModeBadgeClass(row.original.mode)}`}>
        {getModeLabel(row.original.mode)}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (row) => statusText(conflicts, row.id),
    cell: ({ row }) => {
      if (conflicts.status !== 'ready') {
        const { label, className } = UNCHECKED_STATUS[conflicts.status];
        return <span className={`text-[11px] font-bold ${className}`}>{label}</span>;
      }
      const labels = conflictLabelsFor(conflicts, row.original.id);
      return labels.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <span key={label} className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">{label}</span>
          ))}
        </div>
      ) : (
        <span className="text-[11px] font-bold text-emerald-700">No conflict</span>
      );
    },
  },
];

export interface UseScheduleTableOptions {
  rows: ScheduleTableRow[];
  conflicts: ScheduleConflictState;
  searchTerm: string;
  onSearchTermChange: OnChangeFn<string>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
}

/** The meeting table's TanStack instance. Rows start in chronological order; the parent owns table state. */
export function useScheduleTable({
  rows, conflicts, searchTerm, onSearchTermChange, sorting, onSortingChange, pagination, onPaginationChange,
}: UseScheduleTableOptions) {
  const data = useMemo(() => [...rows].sort((left, right) => left.sortKey - right.sortKey), [rows]);
  const columns = useMemo(() => scheduleTableColumns(conflicts), [conflicts]);

  return useReactTable<ScheduleTableRow>({
    data,
    columns,
    state: { globalFilter: searchTerm, sorting, pagination },
    onGlobalFilterChange: onSearchTermChange,
    onSortingChange,
    onPaginationChange,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
}
