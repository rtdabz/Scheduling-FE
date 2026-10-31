import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { StatusTag, type TagTone } from './Ledger';
import { queueSeverity, relativeAge } from '../../lib/vpaaOverview';
import type { PendingRequest } from '../../lib/dashboardQueue';
import { formatPhilippineDate } from '../../lib/philippineTime';

const SEVERITY_TONES: Record<ReturnType<typeof queueSeverity>, TagTone> = {
  overdue: 'returned',
  ageing: 'ready',
  fresh: 'drafting',
};

const PREVIEW_LIMIT = 6;

/**
 * Requests waiting on the reviewer, oldest first. A bounded preview always states
 * the full total, so pending work beyond the preview never looks absent.
 */
export function RequestQueue({ requests, now, title, scopeOf, onOpen, onViewAll, emptyText, incomplete }: {
  requests: PendingRequest[];
  now: Date;
  title: (request: PendingRequest) => string;
  scopeOf: (request: PendingRequest) => string;
  onOpen: (request: PendingRequest) => void;
  onViewAll: () => void;
  emptyText: string;
  /** Set when a source failed: an empty list must not read as "nothing waiting". */
  incomplete?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? requests : requests.slice(0, PREVIEW_LIMIT);

  return <>
    {incomplete && <p role="status" className="mb-3 rounded-md bg-accent/10 px-3 py-2 text-[12px] text-stage-warnText">{incomplete}</p>}
    {requests.length ? <ul className="divide-y divide-border" aria-label="Pending requests">
      {visible.map(request => {
        const severity = queueSeverity(request.waitingSince, now);
        const age = request.waitingSince ? relativeAge(request.waitingSince, now) : 'Unknown';
        const ageTitle = request.waitingSince
          ? `${request.waitingApproximate ? 'Submitted' : 'Reached you'} ${formatPhilippineDate(request.waitingSince, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}${request.waitingApproximate ? '. The Dean handoff time is not recorded.' : ''}`
          : 'The time this request reached you is not recorded.';
        return <li key={request.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
          <span className="min-w-0 flex-1 basis-56">
            <span className="flex min-w-0 items-center gap-1.5">
              <StatusTag tone={request.type === 'room_transfer' ? 'waiting' : 'approved'}>{request.type === 'room_transfer' ? 'Room transfer' : 'Schedule'}</StatusTag>
              <b className="truncate text-[13px] font-semibold text-text" title={title(request)}>{title(request)}</b>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1 text-[12px] text-muted">
              <span>{scopeOf(request)}{request.submittedBy ? ` · ${request.submittedBy}` : ''}</span>
              {request.override && <StatusTag tone="ready" title={request.overrideReason ?? 'Approved by the Dean with an override'}>Override{request.overrideReason ? `: ${request.overrideReason}` : ''}</StatusTag>}
              {request.revisionNumber > 1 && <StatusTag tone="drafting" title="This request has been through review before">Revision {request.revisionNumber}</StatusTag>}
            </span>
          </span>
          <span title={ageTitle}><StatusTag tone={request.waitingSince ? SEVERITY_TONES[severity] : 'drafting'}>{request.waitingApproximate ? `~${age}` : age}</StatusTag></span>
          <button
            type="button"
            onClick={() => onOpen(request)}
            aria-label={`Review ${title(request)}`}
            className="focus-ring rounded-md border border-primary/25 px-2.5 py-1 text-[12px] font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Review
          </button>
        </li>;
      })}
    </ul> : !incomplete && <p className="flex items-center gap-2 text-[13px] text-stage-done">
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      {emptyText}
    </p>}
    {requests.length > PREVIEW_LIMIT && <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-2.5 text-[12px] text-muted">
      <span>Showing {visible.length} of {requests.length} requests.</span>
      <button type="button" onClick={() => setExpanded(open => !open)} aria-expanded={expanded} className="focus-ring rounded font-semibold text-primary hover:underline">
        {expanded ? 'Show fewer' : 'Show all here'}
      </button>
      <button type="button" onClick={onViewAll} className="focus-ring rounded font-semibold text-primary hover:underline">Open approval queue</button>
    </div>}
  </>;
}
