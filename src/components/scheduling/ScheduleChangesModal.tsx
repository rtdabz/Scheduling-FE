import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../ui/DataTable';
import Modal from '../ui/Modal';
import { useDataTable } from '../ui/useDataTable';

export interface ScheduleChangeDetailRow {
  key: string;
  section: string;
  change: string;
  classLabel: string;
  before: string;
  after: string;
}

const detailColumns: ColumnDef<ScheduleChangeDetailRow>[] = [
  { accessorKey: 'section', header: 'Section', meta: { cellClassName: 'whitespace-nowrap' } },
  { accessorKey: 'change', header: 'Change', meta: { cellClassName: 'whitespace-nowrap' } },
  { accessorKey: 'classLabel', header: 'Class', meta: { cellClassName: 'whitespace-nowrap' } },
  { accessorKey: 'before', header: 'Before' },
  { accessorKey: 'after', header: 'After' },
];

export default function ScheduleChangesModal({
  data, isOpen, onClose,
  title = 'Changes from the previous version',
  description = 'Every class that differs from the recalled or returned version. Instructor changes are not listed.',
}: {
  data: ScheduleChangeDetailRow[];
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}) {
  const table = useDataTable<ScheduleChangeDetailRow>({
    data,
    columns: detailColumns,
    pageSize: 25,
    getRowId: (row) => row.key,
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" title={title} description={description}>
      <DataTable
        table={table}
        variant="embedded"
        density="compact"
        totalLabel="changes"
        ariaLabel={title}
        emptyTitle="No class changes."
        emptyDescription="This version has the same classes as the one before it."
      />
    </Modal>
  );
}
