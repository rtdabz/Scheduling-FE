import type { Table } from '@tanstack/react-table';
import DataTable from '../ui/DataTable';
import { conflictLabelsFor, type ScheduleConflictState, type ScheduleTableRow } from './scheduleTableColumns';

interface Props {
  table: Table<ScheduleTableRow>;
  conflicts: ScheduleConflictState;
  ariaLabel: string;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: ScheduleTableRow) => void;
  className?: string;
  scrollClassName?: string;
  scrollAriaLabel?: string;
}

/** Renders the shared meeting table: conflicting meetings are highlighted only after a successful check. */
export default function ScheduleMeetingsTable({
  table, conflicts, ariaLabel, isLoading = false, emptyTitle = 'No schedules match the selected filters.',
  emptyDescription = 'Try another search, section, or class mode.', onRowClick, className, scrollClassName, scrollAriaLabel,
}: Props) {
  return (
    <DataTable
      table={table}
      isLoading={isLoading}
      variant="embedded"
      totalLabel="classes"
      ariaLabel={ariaLabel}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      onRowClick={onRowClick}
      className={className}
      scrollClassName={scrollClassName}
      scrollAriaLabel={scrollAriaLabel}
      rowClassName={(row) => (conflictLabelsFor(conflicts, row.id).length > 0 ? '!bg-red-50/60' : '')}
    />
  );
}
