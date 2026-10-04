import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { GitCompare } from 'lucide-react';
import DataTable from '../ui/DataTable';
import LoadingSpinner from '../ui/LoadingSpinner';
import Modal from '../ui/Modal';
import { useDataTable } from '../ui/useDataTable';
import api from '../../lib/api';
import { formatTime12h } from '../../lib/timeGrid';

interface DiffRow {
  day?: string;
  start_time?: string;
  end_time?: string;
  mode?: string;
  course?: { course_code?: string | null; course_name?: string | null } | null;
  room?: { room_code?: string | null } | null;
}

interface MeetingChange {
  change: 'added' | 'removed' | 'changed';
  before: DiffRow | null;
  after: DiffRow | null;
}

interface SectionDiff {
  section_id: number;
  section_name: string | null;
  previous_revision_number: number | null;
  previous_status: string;
  previous_rejection_reason: string | null;
  changes: MeetingChange[];
}

interface RevisionDiffResponse {
  data: { available: boolean; sections: SectionDiff[] };
}

const meeting = (row: DiffRow | null): string => {
  if (!row) return '';
  const time = `${row.day ?? ''} ${formatTime12h(row.start_time)}–${formatTime12h(row.end_time)}`.trim();
  // Online and field meetings have no room by design; only an on-site meeting
  // without one is still waiting on a room (TBA).
  const room = row.mode === 'online' || row.mode === 'field'
    ? null
    : row.room?.room_code ?? 'Room TBA';
  return [time, room, row.mode].filter(Boolean).join(', ');
};

const CHANGE_STYLES: Record<MeetingChange['change'], { label: string; className: string }> = {
  added: { label: 'Added', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  removed: { label: 'Removed', className: 'bg-red-50 text-red-700 ring-red-200' },
  changed: { label: 'Changed', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

const previousLabel = (status: string): string => (
  status === 'rejected_by_dean' || status === 'rejected_by_vpaa' ? 'returned' : 'recalled'
);

/** One line of the details table: a single class meeting change. */
interface DiffDetailRow {
  key: string;
  section: string;
  change: string;
  classLabel: string;
  before: string;
  after: string;
}

const toDetailRows = (sections: SectionDiff[]): DiffDetailRow[] => sections.flatMap((section) => (
  section.changes.map((change, index) => ({
    key: `${section.section_id}-${index}`,
    section: section.section_name ?? 'Section',
    change: CHANGE_STYLES[change.change].label,
    classLabel: (change.after ?? change.before)?.course?.course_code ?? 'Class',
    before: meeting(change.before) || '—',
    after: meeting(change.after) || '—',
  }))
));

const detailColumns: ColumnDef<DiffDetailRow>[] = [
  { accessorKey: 'section', header: 'Section', meta: { cellClassName: 'whitespace-nowrap' } },
  { accessorKey: 'change', header: 'Change', meta: { cellClassName: 'whitespace-nowrap' } },
  { accessorKey: 'classLabel', header: 'Class', meta: { cellClassName: 'whitespace-nowrap' } },
  { accessorKey: 'before', header: 'Before' },
  { accessorKey: 'after', header: 'After' },
];

function DiffDetailsModal({ sections, isOpen, onClose }: { sections: SectionDiff[]; isOpen: boolean; onClose: () => void }) {
  const data = useMemo(() => toDetailRows(sections), [sections]);
  const table = useDataTable<DiffDetailRow>({
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
      title="Changes from the previous version"
      description="Every class that differs from the recalled or returned version. Instructor changes are not listed."
    >
      <DataTable
        table={table}
        variant="embedded"
        density="compact"
        totalLabel="changes"
        ariaLabel="Changes from the previous version"
        emptyTitle="No class changes."
        emptyDescription="This version has the same classes as the one before it."
      />
    </Modal>
  );
}

/**
 * What a resubmitted (Modified) version changed from the recalled or returned
 * version before it, so a reviewer sees the difference instead of a badge.
 * Read from both submit snapshots; instructor changes are not counted.
 */
export default function RevisionDiffPanel({ submissionId }: { submissionId: number }) {
  const [sections, setSections] = useState<SectionDiff[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.get<RevisionDiffResponse>(`/schedule-submissions/${submissionId}/revision-diff`, { signal: controller.signal })
      .then(({ data }) => setSections(data.data.available ? data.data.sections : []))
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [submissionId]);

  if (failed) {
    return <p className="px-5 py-2 text-xs font-semibold text-amber-700">The changes from the previous version could not be loaded.</p>;
  }
  if (sections === null) {
    return (
      <p className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-gray-500">
        <LoadingSpinner size={14} className="animate-spin" /> Loading changes from the previous version…
      </p>
    );
  }

  const total = sections.reduce((sum, section) => sum + section.changes.length, 0);

  return (
    <section aria-label="Changes from the previous version" className="max-h-56 space-y-2 overflow-y-auto px-5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold text-violet-700">
          <GitCompare className="h-4 w-4" />
          {total === 0
            ? 'No class changes from the previous version (instructor changes are not listed).'
            : `Changes from the previous version (${total} class${total === 1 ? '' : 'es'})`}
        </p>
        {total > 0 && (
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
          >
            View details
          </button>
        )}
      </div>
      <DiffDetailsModal sections={sections} isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} />
      {sections.map((section) => (
        <div key={section.section_id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-bold text-slate-800">
            {section.section_name ?? 'Section'}
            <span className="ml-1 font-semibold text-slate-500">
              vs. {previousLabel(section.previous_status)} version{section.previous_revision_number ? ` #${section.previous_revision_number}` : ''}
            </span>
          </p>
          {section.previous_rejection_reason && (
            <p className="mt-0.5 text-[11px] italic text-slate-500">Return reason: {section.previous_rejection_reason}</p>
          )}
          <ul className="mt-1 space-y-1">
            {section.changes.map((change, index) => {
              const style = CHANGE_STYLES[change.change];
              const row = change.after ?? change.before;
              return (
                <li key={index} className="flex flex-wrap items-baseline gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${style.className}`}>{style.label}</span>
                  <span className="font-semibold">{row?.course?.course_code ?? 'Class'}</span>
                  {change.change === 'changed' ? (
                    <span>
                      <span className="text-slate-500 line-through">{meeting(change.before)}</span>
                      {' → '}
                      <span className="font-semibold">{meeting(change.after)}</span>
                    </span>
                  ) : (
                    <span className={change.change === 'removed' ? 'text-slate-500 line-through' : ''}>{meeting(row)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
