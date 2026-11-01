import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import { isLinkedOnlineSession, recoveryError, roomTransferClassLabel, roomTransferDetailChanges, roomTransferMovedCount, ROOM_TRANSFER_STATUS_LABELS, type RoomTransferPlacement, type RoomTransferRequest } from '../../lib/roomRecovery';
import { formatTime12h } from '../../lib/timeGrid';
import { publishLiveTopics } from '../../lib/liveUpdates';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import ConfirmModal from '../ui/ConfirmModal';
import ScheduleApprovalPreviewModal from '../scheduling/ScheduleApprovalPreviewModal';
import ScheduleChangesModal from '../scheduling/ScheduleChangesModal';
import ScheduleRejectionModal from '../scheduling/ScheduleRejectionModal';
import RoomTransferChangesSummary from './RoomTransferChangesSummary';
import { roomTransferPreview } from '../../lib/roomTransferPreview';

const placement = (row: RoomTransferPlacement) => `${row.room} · ${row.day} ${formatTime12h(row.start_time)}–${formatTime12h(row.end_time)}`;

export default function RoomTransferRequests({ transfers, stage, onClose, onReviewed }: {
  transfers?: RoomTransferRequest[]; stage?: 'dean' | 'vpaa'; onClose?: () => void; onReviewed?: () => void;
}) {
  const review = stage !== undefined;
  const [requests, setRequests] = useState<RoomTransferRequest[]>([]);
  const [loading, setLoading] = useState(transfers === undefined);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [decision, setDecision] = useState<{ request: RoomTransferRequest; action: 'approve' | 'reject' } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const details = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [params] = useSearchParams();
  const live = useLiveRevision(['approvals', 'rooms']);
  useEffect(() => {
    if (transfers !== undefined) return;
    const controller = new AbortController();
    void api.get<{ transfers: RoomTransferRequest[] }>('/room-recovery/transfers', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setRequests(data.transfers ?? []); setError(''); } })
      .catch(error => { if (!controller.signal.aborted) setError(recoveryError(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [transfers, refresh, live]);
  const items = transfers ?? requests;
  const selectedRequest = items[0];
  const printInput = useMemo(() => selectedRequest ? roomTransferPreview(selectedRequest) : null, [selectedRequest]);
  const detailRows = useMemo(() => selectedRequest ? roomTransferDetailChanges(selectedRequest).map(change => ({
    key: String(change.schedule_id), section: change.section, change: 'Changed', classLabel: isLinkedOnlineSession(change) ? `${change.course} (linked online session)` : change.course,
    before: `${change.before.day} ${formatTime12h(change.before.start_time)}–${formatTime12h(change.before.end_time)}, ${change.before.room}, ${change.mode ?? 'on-site'}`,
    after: `${change.after.day} ${formatTime12h(change.after.start_time)}–${formatTime12h(change.after.end_time)}, ${change.after.room}, ${change.mode ?? 'on-site'}`,
  })) : [], [selectedRequest]);
  useEffect(() => {
    if (!onClose) return;
    const previous = document.activeElement;
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [onClose]);
  useEffect(() => {
    if (!onClose) return;
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = decision || detailsOpen ? dialogs[dialogs.length - 1] : details.current?.closest<HTMLElement>('[role="dialog"]');
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), select, textarea:not(:disabled), iframe, [tabindex="0"]') ?? []);
    const timer = window.setTimeout(() => {
      const target = !decision && !detailsOpen && returnFocus.current?.isConnected ? returnFocus.current : controls()[0];
      target?.focus();
    }, 0);
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = controls(); const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => {
      window.clearTimeout(timer); document.removeEventListener('keydown', trap);
    };
  }, [onClose, decision, detailsOpen]);
  const decide = async () => {
    if (!decision || busy) return;
    if (decision.action === 'reject' && !reason.trim()) { setError('A rejection reason is required.'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await api.post<{ message: string }>(`/room-recovery/plans/${decision.request.id}/${decision.action}`,
        decision.action === 'reject' ? { reason: reason.trim() } : {});
      setMessage(data.message); setDecision(null); setRefresh(value => value + 1);
      publishLiveTopics(['approvals', 'schedules', 'rooms', 'notifications', 'settings']);
      onReviewed?.();
    } catch (error) { setError(recoveryError(error)); }
    finally { setBusy(false); }
  };
  const cancelDecision = () => { if (!busy) { setDecision(null); setError(''); } };
  const sundayNotice = decision?.request.enables_sunday
    ? ` This transfer moves classes to Sunday, so final approval also enables Sunday classes for ${decision.request.department}.` : '';
  const confirmation = <>
    <ConfirmModal isOpen={decision?.action === 'approve'} title="Approve room schedule reassignment"
      message={(stage === 'dean' ? 'Approve this room schedule reassignment and forward it to the VPAA? Existing schedules will remain unchanged.' : 'Approve these proposed room schedule reassignments and apply the schedule changes?') + sundayNotice}
      confirmLabel="Approve transfer" variant="maroon" onConfirm={decide} onCancel={cancelDecision} isConfirming={busy}>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </ConfirmModal>
    <ScheduleRejectionModal open={decision?.action === 'reject'} title="Reject room schedule reassignment"
      description="Reject this request and retain the original schedules?" reasonLabel="Rejection reason"
      reason={reason} error={error} isSubmitting={busy} maxLength={1000} closeOnEscape
      confirmLabel="Reject transfer" submittingLabel="Rejecting..." onReasonChange={value => { setReason(value); setError(''); }}
      onClose={cancelDecision} onConfirm={() => { void decide(); }} />
  </>;
  if (review && onClose) return <>
    {selectedRequest && <ScheduleApprovalPreviewModal open title="Room Schedule Reassignment Details"
      status={selectedRequest.status.startsWith('rejected_') ? 'rejected' : selectedRequest.status === 'approved' || selectedRequest.status === 'applied' ? 'approved' : 'pending'}
      statusLabel={ROOM_TRANSFER_STATUS_LABELS[selectedRequest.status]} printInput={printInput}
      canAct={selectedRequest.status === `pending_${stage}`} inert={decision !== null || detailsOpen} closeOnEscape onClose={onClose}
      emptyMessage="The proposed schedule preview is unavailable. View Details to review every proposed change."
      checks={<div ref={details}><RoomTransferChangesSummary request={selectedRequest} onViewDetails={button => { returnFocus.current = button; setDetailsOpen(true); }} /></div>}
      onApprove={() => { setDecision({ request: selectedRequest, action: 'approve' }); setReason(''); setError(''); }}
      onReject={() => { setDecision({ request: selectedRequest, action: 'reject' }); setReason(''); setError(''); }} />}
    <ScheduleChangesModal data={detailRows} isOpen={detailsOpen} onClose={() => setDetailsOpen(false)}
      title="Room schedule reassignment changes" description="Every proposed room schedule reassignment, with the original and proposed schedule placements." />
    {confirmation}
  </>;
  if (!review && items.length === 0) return null;
  return <section id="room-transfers" aria-label="Room schedule reassignment requests" className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="text-base font-bold text-slate-900">Room schedule reassignment requests</h2>
    <p className="mt-1 text-sm text-slate-600">Room schedule reassignments require Dean approval followed by VPAA approval. Original schedules stay unchanged until final approval, when availability is checked again.</p>
    {loading && <p role="status" className="mt-3 text-sm">Loading room schedule reassignment requests…</p>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p>}
    {error && !decision && <p role="alert" className="mt-3 text-sm text-red-700">{error} <button type="button" onClick={() => setRefresh(value => value + 1)} className="font-semibold underline">Retry</button></p>}
    {!loading && !error && items.length === 0 && <p className="mt-3 text-sm text-slate-500">No room schedule reassignment requests.</p>}
    {(['pending_dean', 'pending_vpaa', 'approved', 'applied', 'rejected_by_dean', 'rejected_by_vpaa'] as const).flatMap(status => items.filter(item => item.status === status)).map(item => <details key={item.id} open={params.get('room_transfer') === item.id || (review && item.status === `pending_${stage}`)} className="mt-3 rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">{ROOM_TRANSFER_STATUS_LABELS[item.status]} · {item.department} · {item.semester_label} · {roomTransferMovedCount(item)} meeting(s)</summary>
      <p className="mt-2 text-xs text-slate-500">Submitted by {item.submitted_by} · {new Date(item.submitted_at).toLocaleString()}</p>
      <ul className="mt-2 space-y-2 text-sm">{roomTransferDetailChanges(item).map(change => <li key={change.schedule_id}>
        <p className="font-semibold">{roomTransferClassLabel(change)}</p>
        <p className="text-slate-500">Original: {placement(change.before)}</p>
        <p>Proposed: {placement(change.after)}</p>
      </li>)}</ul>
      {item.enables_sunday && <p className="mt-2 text-sm text-amber-900">Final approval also enables Sunday classes for {item.department}.</p>}
      {item.rejection_reason && <p className="mt-2 text-sm text-red-800">Rejection reason: {item.rejection_reason}</p>}
      {review && item.status === `pending_${stage}` && <div className="mt-3 flex gap-2">
        {(['approve', 'reject'] as const).map(action => <button key={action} type="button" disabled={busy} onClick={() => { setDecision({ request: item, action }); setReason(''); setError(''); }} className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50">{action === 'approve' ? 'Approve' : 'Reject'}</button>)}
      </div>}
    </details>)}
    {confirmation}
  </section>;
}
