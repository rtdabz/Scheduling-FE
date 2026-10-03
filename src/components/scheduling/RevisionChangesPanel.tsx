import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { History } from 'lucide-react';
import DataTable from '../ui/DataTable';
import LoadingSpinner from '../ui/LoadingSpinner';
import Modal from '../ui/Modal';
import { useDataTable } from '../ui/useDataTable';
import api from '../../lib/api';
import { formatTime12h } from '../../lib/timeGrid';

interface ChangedRow {
  day?: string;
  start_time?: string;
  end_time?: string;
  course?: { course_code?: string | null; course_name?: string | null } | null;
  section?: { section_name?: string | null } | null;
  room?: { room_code?: string | null } | null;
}

interface RevisionChangeEntry {
  id: number;
  action: 'revision_schedules_changed' | 'revision_section_deleted' | 'revision_course_changed';
  operation: string | null;
  created_at: string | null;
  actor: { name: string } | null;
  section: { section_name: string } | null;
  course_changes: Record<string, { before: unknown; after: unknown }> | null;
  changes: Array<{ schedule_id: number; change: 'added' | 'removed' | 'updated'; before: ChangedRow | null; after: ChangedRow | null }>;
}

const FIELD_LABELS: Record<string, string> = {
  course_code: 'code',
  course_name: 'name',
  course_category: 'category',
  units: 'units',
  lecture_hours: 'lecture hours',
  lab_hours: 'lab hours',
  room_type_required: 'room type',
};

const meeting = (row: ChangedRow | null): string => {
  if (!row) return '';
  const time = `${row.day ?? ''} ${formatTime12h(row.start_time)}–${formatTime12h(row.end_time)}`.trim();
  return [time, row.room?.room_code].filter(Boolean).join(', ');
};

const classLabel = (row: ChangedRow | null): string => (
  [row?.course?.course_code, row?.section?.section_name].filter(Boolean).join(' · ') || 'Class'
);

/** One line of the details table: a single meeting or course edit. */
interface ChangeDetailRow {
  key: string;
  when: string;
  by: string;
  change: string;
  classLabel: string;
  before: string;
  after: string;
}

const toDetailRows = (entries: RevisionChangeEntry[]): ChangeDetailRow[] => entries.flatMap((entry) => {
  const when = entry.created_at ? new Date(entry.created_at).toLocaleString() : '';
  const by = entry.actor?.name ?? '';

  if (entry.action === 'revision_course_changed') {
    const fields = Object.entries(entry.course_changes ?? {});
    return [{
      key: `${entry.id}`,
      when,
      by,
      change: 'Course details',
      classLabel: entry.changes[0]?.before?.course?.course_code ?? 'Course',
      before: fields.map(([field, { before }]) => `${FIELD_LABELS[field] ?? field}: ${String(before ?? '—')}`).join('; '),
      after: fields.map(([field, { after }]) => `${FIELD_LABELS[field] ?? field}: ${String(after ?? '—')}`).join('; '),
    }];
  }

  return entry.changes.map(({ schedule_id, change, before, after }) => ({
    key: `${entry.id}-${schedule_id}-${change}`,
    when,
    by,
    change: entry.action === 'revision_section_deleted'
      ? 'Section deleted'
      : change === 'added' ? 'Added' : change === 'removed' ? 'Removed' : 'Changed',
    classLabel: classLabel(before ?? after),
    before: meeting(before) || '—',
    after: meeting(after) || '—',
  }));
});

const detailColumns: ColumnDef<ChangeDetailRow>[] = [
  { accessorKey: 'when', header: 'When', meta: { cellClassName: 'whitespace-nowrap' } },
  { accessorKey: 'by', header: 'By' },
  { accessorKey: 'change', header: 'Change', meta: { cellClassName: 'whitespace-nowrap' } },
  { accessorKey: 'classLabel', header: 'Class' },
  { accessorKey: 'before', header: 'Before' },
  { accessorKey: 'after', header: 'After' },
];

function ChangeDetailsModal({ entries, isOpen, onClose }: { entries: RevisionChangeEntry[]; isOpen: boolean; onClose: () => void }) {
  const data = useMemo(() => toDetailRows(entries), [entries]);
  const table = useDataTable<ChangeDetailRow>({
    data,
    columns: detailColumns,
    pageSize: 25,
    getRowId: (row) => row.key,
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title="Changes to the working copy"
      description="Every change made since this version was recalled or returned."
    >
      <DataTable
        table={table}
        variant="embedded"
        density="compact"
        totalLabel="changes"
        ariaLabel="Changes since this version"
        emptyTitle="No changes recorded."
        emptyDescription="Nothing has changed in the working copy since this version."
      />
    </Modal>
  );
}

/**
 * What the department changed after this version was recalled or rejected.
 * The version itself is shown as sent; this lists the steps since, each read
 * from the history recorded at the time, so deleted sections and edited
 * courses still read as they were.
 */
export default function RevisionChangesPanel({ submissionId }: { submissionId: number }) {
  const [entries, setEntries] = useState<RevisionChangeEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.get<{ data: RevisionChangeEntry[] }>(`/schedule-submissions/${submissionId}/changes`, { signal: controller.signal })
      .then(({ data }) => setEntries(data.data))
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [submissionId]);

  if (failed) {
    return <p className="px-5 py-2 text-xs font-semibold text-amber-700">The changes made since this version could not be loaded.</p>;
  }
  if (entries === null) {
    return (
      <p className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-gray-500">
        <LoadingSpinner size={14} className="animate-spin" /> Loading changes made since this version…
      </p>
    );
  }

  return (
    <section aria-label="Changes since this version" className="px-5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <History className="h-4 w-4" />
          {entries.length === 0
            ? 'No changes to the working copy since this version.'
            : `Changes to the working copy since this version (${entries.length})`}
        </p>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            View details
          </button>
        )}
      </div>
      <ChangeDetailsModal entries={entries} isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </section>
  );
}
