import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
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

const describe = (entry: RevisionChangeEntry): string[] => {
  if (entry.action === 'revision_section_deleted') {
    const count = entry.changes.length;
    return [`Section ${entry.section?.section_name ?? ''} deleted with ${count} class${count === 1 ? '' : 'es'}.`];
  }
  if (entry.action === 'revision_course_changed') {
    const code = entry.changes[0]?.before?.course?.course_code ?? 'Course';
    const fields = Object.entries(entry.course_changes ?? {})
      .map(([field, { before, after }]) => `${FIELD_LABELS[field] ?? field} ${String(before ?? '—')} → ${String(after ?? '—')}`);
    return [`${code} details changed: ${fields.join('; ')}.`];
  }
  return entry.changes.map(({ change, before, after }) => (
    change === 'added'
      ? `Added ${classLabel(after)}: ${meeting(after)}`
      : change === 'removed'
        ? `Removed ${classLabel(before)}: ${meeting(before)}`
        : `Changed ${classLabel(before)}: ${meeting(before)} → ${meeting(after)}`
  ));
};

/**
 * What the department changed after this version was recalled or rejected.
 * The version itself is shown as sent; this lists the steps since, each read
 * from the history recorded at the time, so deleted sections and edited
 * courses still read as they were.
 */
export default function RevisionChangesPanel({ submissionId }: { submissionId: number }) {
  const [entries, setEntries] = useState<RevisionChangeEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

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
    <section aria-label="Changes since this version" className="max-h-44 space-y-2 overflow-y-auto px-5 py-2.5">
      <p className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <History className="h-4 w-4" />
        {entries.length === 0
          ? 'No changes to the working copy since this version.'
          : `Changes to the working copy since this version (${entries.length})`}
      </p>
      {entries.length > 0 && (
        <ol className="space-y-1.5">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
              <p className="text-[11px] font-semibold text-slate-500">
                {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
                {entry.actor ? ` · ${entry.actor.name}` : ''}
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {describe(entry).map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
