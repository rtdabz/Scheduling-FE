import { useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import Modal from '../ui/Modal';
import RoomTransferSchedulesTable from './RoomTransferSchedulesTable';
import { ROOM_TRANSFER_STATUS_LABELS, roomTransferMovedCount, type RoomTransferRequest } from '../../lib/roomRecovery';

type Status = RoomTransferRequest['status'];
export default function SecretaryRoomTransferRequests({ requests, isOpen, loading, onOpen, onClose, linkedId }: {
  requests: RoomTransferRequest[]; isOpen: boolean; loading: boolean; onOpen: () => void; onClose: () => void; linkedId: string | null;
}) {
  const [status, setStatus] = useState<Status | 'all'>('all');
  const opener = useRef<HTMLButtonElement>(null);
  const pending = requests.filter(item => item.status === 'pending_dean' || item.status === 'pending_vpaa');
  const linked = requests.find(item => item.id === linkedId);
  const selectedStatus = linked?.status ?? status;
  if (!requests.length && !isOpen) return null;
  const deanCount = pending.filter(item => item.status === 'pending_dean').length;
  const vpaaCount = pending.length - deanCount;
  const close = () => { onClose(); window.setTimeout(() => opener.current?.focus(), 0); };

  return <>
    <section aria-label="Submitted room transfer requests" className="mb-4 flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:px-4">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="text-sm font-bold text-slate-900">Room transfer requests</h3><span role="status" aria-label="Pending room transfer requests" className="text-xs font-semibold text-slate-600">{pending.length} pending {pending.length === 1 ? 'request' : 'requests'}</span></div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          {deanCount > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">Pending Dean Approval: {deanCount}</span>}
          {vpaaCount > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">Pending VPAA Approval: {vpaaCount}</span>}
          {pending.length === 0 && <span className="text-slate-600">No requests awaiting approval.</span>}
        </div>
      </div>
      <button ref={opener} type="button" disabled={loading} onClick={() => { setStatus('all'); onOpen(); }} aria-haspopup="dialog" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-md bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 sm:self-auto"><Eye size={15} aria-hidden="true" />View Details</button>
    </section>
    <Modal isOpen={isOpen} onClose={close} title="Submitted room transfers" description="Track Dean and VPAA approval. Your schedules stay unchanged until final approval." size="xl" className="submitted-transfers-modal">
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-sm font-semibold text-slate-800">{requests.length} submitted requests · {requests.reduce((count, item) => count + roomTransferMovedCount(item), 0)} schedules</p>
          <label className="text-xs font-semibold text-slate-600">Approval status<select aria-label="Submitted transfer approval status" value={selectedStatus} onChange={event => { setStatus(event.target.value as Status | 'all'); if (linkedId) onOpen(); }} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 sm:w-auto"><option value="all">All requests</option>{Object.entries(ROOM_TRANSFER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <RoomTransferSchedulesTable requests={requests.filter(item => selectedStatus === 'all' || item.status === selectedStatus)} loading={loading} />
      </div>
    </Modal>
  </>;
}
