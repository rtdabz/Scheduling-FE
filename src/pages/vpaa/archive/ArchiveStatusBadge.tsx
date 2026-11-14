import type { ArchiveStatus } from './archiveTypes';

const toneClasses: Record<ArchiveStatus['tone'], string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  inactive: 'border-amber-200 bg-amber-50 text-amber-900',
  neutral: 'border-gray-200 bg-gray-50 text-gray-700',
};

/** Operational status a record keeps through archive and restore. */
export default function ArchiveStatusBadge({ status }: { status: ArchiveStatus | null }) {
  if (!status) return null;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClasses[status.tone]}`}>{status.label}</span>;
}
