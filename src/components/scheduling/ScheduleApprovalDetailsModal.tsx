import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal';

export interface ApprovalDetailFact {
  label: string;
  value: ReactNode;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** The schedule being reviewed, shown under the dialog title. */
  scheduleTitle: string;
  status: { label: string; badgeClassName: string };
  revision?: { label: string; badgeClassName: string };
  facts: ApprovalDetailFact[];
  /** Totals, previous-version references, return reasons, and the before/after table. */
  changes: ReactNode;
  /** Conflicts and rule issues, with their own loading and failure states. */
  checks: ReactNode;
  approveBlockedReason?: string | null;
  inert?: boolean;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wide text-[#4e0a10]">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Everything a reviewer needs besides the schedule document itself: status, revision information,
 * changes from earlier versions, and the scheduling checks that can block approval.
 */
export default function ScheduleApprovalDetailsModal({
  isOpen, onClose, scheduleTitle, status, revision, facts, changes, checks, approveBlockedReason = null, inert = false,
}: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" title="Schedule details" description={scheduleTitle} inert={inert}>
      <div className="space-y-4 p-4 sm:p-5">
        <DetailSection title="Submission information">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${status.badgeClassName}`}>
              {status.label}
            </span>
            {revision && (
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1 ring-inset ${revision.badgeClassName}`}>
                {revision.label}
              </span>
            )}
          </div>
          {facts.length > 0 && (
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {facts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="font-semibold text-slate-500">{fact.label}</dt>
                  <dd className="break-words font-bold text-slate-800">{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </DetailSection>

        <DetailSection title="Changes">{changes}</DetailSection>

        <DetailSection title="Scheduling checks">
          <div className="space-y-2">
            {approveBlockedReason && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0" /> Approval is blocked: {approveBlockedReason}
              </p>
            )}
            {checks}
          </div>
        </DetailSection>
      </div>
    </Modal>
  );
}
