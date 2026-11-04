import { CalendarDays, CheckCircle2, Clock, OctagonAlert, XCircle } from 'lucide-react';
import { roomTransferDetailChanges, roomTransferMovedCount, roomTransferStatusClass, ROOM_TRANSFER_STATUS_LABELS, type RoomTransferRequest } from '../../lib/roomRecovery';

const recordedAt = (value?: string | null) => (value ? new Date(value).toLocaleString() : null);
const recorded = (facts: [string, string | null][]) => facts.filter((fact): fact is [string, string] => Boolean(fact[1]));

function Facts({ facts, className }: { facts: [string, string][]; className: string }) {
  return <dl className={`grid gap-x-6 gap-y-3 text-xs ${className}`}>
    {facts.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-slate-900">{value}</dd>
    </div>)}
  </dl>;
}

// The request the listed changes belong to, as it was stored; fields it never recorded are left out.
export default function RoomTransferChangesSummary({ request }: { request: RoomTransferRequest }) {
  const changes = roomTransferDetailChanges(request);
  const moved = roomTransferMovedCount(request);
  const online = changes.length - moved;
  const vpaaDecided = request.status === 'approved' || request.status === 'rejected_by_vpaa';
  const StatusIcon = request.status.startsWith('pending_') ? Clock : request.status.startsWith('rejected_') ? XCircle : CheckCircle2;
  const facts = recorded([
    ['Department', request.department],
    ['Academic year and semester', request.semester_label],
    ['Requested by', request.submitted_by],
    ['Submitted', recordedAt(request.submitted_at)],
  ]);
  const reviews = recorded([
    ['Dean reviewed', recordedAt(request.dean_reviewed_at)],
    ['VPAA reviewed', vpaaDecided ? recordedAt(request.reviewed_at) : null],
  ]);
  return <section aria-label="Changes Summary" className="shrink-0 space-y-3">
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-100 px-4 py-3">
        <p className="flex items-center"><span className="sr-only">Approval status: </span>
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold ${roomTransferStatusClass(request.status)}`}>
            <StatusIcon size={14} aria-hidden="true" />{ROOM_TRANSFER_STATUS_LABELS[request.status]}
          </span>
        </p>
        <p className="flex items-baseline gap-1.5 text-xs text-slate-600"><span className="text-lg font-bold tabular-nums text-[#5A1220]">{moved}</span><span>affected {moved === 1 ? 'meeting' : 'meetings'}</span></p>
        <p className="flex items-baseline gap-1.5 text-xs text-slate-600"><span className="text-lg font-bold tabular-nums text-[#5A1220]">{online}</span><span>linked online {online === 1 ? 'session' : 'sessions'}</span></p>
      </div>
      <Facts facts={facts} className="px-4 py-3 sm:grid-cols-2 lg:grid-cols-4" />
      {reviews.length > 0 && <Facts facts={reviews} className="border-t border-slate-100 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4" />}
    </div>
    {request.enables_sunday && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <CalendarDays size={14} aria-hidden="true" className="mt-px shrink-0" /><p>Final approval also enables Sunday classes for {request.department}.</p>
    </div>}
    {request.rejection_reason && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
      <OctagonAlert size={14} aria-hidden="true" className="mt-px shrink-0" /><p>Rejection reason: {request.rejection_reason}</p>
    </div>}
  </section>;
}
