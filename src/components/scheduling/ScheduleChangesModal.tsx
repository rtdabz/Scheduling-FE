import { useMemo, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../ui/DataTable';
import Modal from '../ui/Modal';
import { useDataTable } from '../ui/useDataTable';

/** A placement split into its room and its day and time, passed from the source data. */
export interface ScheduleChangePlacement {
  room: string;
  time: string;
}

export interface ScheduleChangeDetailRow {
  key: string;
  section: string;
  change: string;
  classLabel: string;
  /** Lecture, laboratory, or delivery mode; the column appears only when rows carry it. */
  sessionType?: string;
  before: string;
  after: string;
  /** When given, placements render as room over day and time, and the changed parts are marked. */
  beforePlacement?: ScheduleChangePlacement;
  afterPlacement?: ScheduleChangePlacement;
  roomChanged?: boolean;
  timeChanged?: boolean;
}

const changedMark = 'rounded bg-[#C9952A]/20 px-1 -mx-1 font-bold text-[#5A1220] box-decoration-clone';

function PlacementCell({ row, side }: { row: ScheduleChangeDetailRow; side: 'before' | 'after' }) {
  const placement = side === 'before' ? row.beforePlacement : row.afterPlacement;
  if (!placement) return <>{row[side]}</>;
  const proposed = side === 'after';
  const unchanged = !row.roomChanged && !row.timeChanged;
  const mark = (changed?: boolean) => (proposed && changed ? changedMark : '');
  return (
    <div className={proposed ? 'text-slate-900' : 'font-medium text-slate-500'}>
      <p><span className={mark(row.roomChanged)}>{placement.room}</span>{proposed && row.roomChanged && <span className="sr-only"> (new room)</span>}</p>
      <p className={`mt-0.5 text-[11px] ${proposed ? 'font-semibold' : 'font-medium'}`}>
        <span className={mark(row.timeChanged)}>{placement.time}</span>{proposed && row.timeChanged && <span className="sr-only"> (new day or time)</span>}
      </p>
      {proposed && unchanged && <p className="mt-1 text-[11px] font-medium italic text-slate-500">Same as original</p>}
    </div>
  );
}

function ChangeCell({ row }: { row: ScheduleChangeDetailRow }) {
  if (!row.afterPlacement) return <>{row.change}</>;
  const unchanged = !row.roomChanged && !row.timeChanged;
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold leading-4 ${unchanged ? 'bg-slate-100 text-slate-600' : 'bg-[#5A1220]/[0.07] text-[#5A1220]'}`}>
      {row.change}
    </span>
  );
}

const detailColumns = (withSessionType: boolean, beforeHeader: string, afterHeader: string): ColumnDef<ScheduleChangeDetailRow>[] => [
  { accessorKey: 'section', header: 'Section', meta: { cellClassName: 'whitespace-nowrap' } },
  { accessorKey: 'change', header: 'Change', meta: { cellClassName: 'w-36 min-w-28' }, cell: ({ row }) => <ChangeCell row={row.original} /> },
  { accessorKey: 'classLabel', header: 'Class', meta: { cellClassName: 'min-w-32 max-w-52' } },
  ...(withSessionType ? [{ accessorKey: 'sessionType', header: 'Session type', meta: { cellClassName: 'whitespace-nowrap' } } as ColumnDef<ScheduleChangeDetailRow>] : []),
  { accessorKey: 'before', header: beforeHeader, meta: { cellClassName: 'min-w-56' }, cell: ({ row }) => <PlacementCell row={row.original} side="before" /> },
  { accessorKey: 'after', header: afterHeader, meta: { cellClassName: 'min-w-56' }, cell: ({ row }) => <PlacementCell row={row.original} side="after" /> },
];

/** The paginated before/after table, usable inside any dialog. */
export function ScheduleChangesTable({
  data,
  ariaLabel,
  beforeHeader = 'Before',
  afterHeader = 'After',
  emptyTitle = 'No class changes.',
  emptyDescription = 'This version has the same classes as the one before it.',
  className = '',
  scrollClassName = '',
}: {
  data: ScheduleChangeDetailRow[];
  ariaLabel: string;
  beforeHeader?: string;
  afterHeader?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  scrollClassName?: string;
}) {
  const withSessionType = data.some((row) => row.sessionType !== undefined);
  const columns = useMemo(() => detailColumns(withSessionType, beforeHeader, afterHeader), [withSessionType, beforeHeader, afterHeader]);
  const table = useDataTable<ScheduleChangeDetailRow>({
    data,
    columns,
    pageSize: 25,
    getRowId: (row) => row.key,
  });

  return (
    <DataTable
      table={table}
      variant="embedded"
      density="compact"
      totalLabel="changes"
      ariaLabel={ariaLabel}
      scrollAriaLabel={`${ariaLabel} table`}
      className={`rounded-xl border border-slate-200 ${className}`}
      scrollClassName={`overflow-x-auto rounded-t-xl focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#C9952A] ${scrollClassName}`}
      tableClassName="min-w-[56rem] [&_thead]:bg-gray-50"
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
    />
  );
}

export default function ScheduleChangesModal({
  data, isOpen, onClose,
  title = 'Changes from the previous version',
  description = 'Every class that differs from the recalled or returned version. Instructor changes are not listed.',
  summary,
  beforeHeader = 'Before',
  afterHeader = 'After',
}: {
  data: ScheduleChangeDetailRow[];
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  /** Shown above the table, e.g. the request the changes belong to. */
  summary?: ReactNode;
  beforeHeader?: string;
  afterHeader?: string;
}) {
  // From the sm breakpoint the table scrolls inside its own region so its header stays visible and its
  // pagination stays in view; on phones the dialog body is the only vertical scroll area.
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" title={title} description={description} bodyClassName="sm:flex sm:flex-col">
      <div className="flex flex-col gap-4 p-4 sm:min-h-0 sm:flex-1 sm:p-5">
        {summary}
        <ScheduleChangesTable
          data={data}
          ariaLabel={title}
          beforeHeader={beforeHeader}
          afterHeader={afterHeader}
          className="sm:flex sm:min-h-[14rem] sm:flex-col sm:overflow-hidden"
          scrollClassName="sm:min-h-0 sm:flex-1 sm:overflow-y-auto"
        />
      </div>
    </Modal>
  );
}
