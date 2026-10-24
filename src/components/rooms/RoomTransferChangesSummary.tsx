import { ArrowRight } from 'lucide-react';
import { roomTransferDetailChanges, type RoomTransferRequest } from '../../lib/roomRecovery';
import { formatTime12h } from '../../lib/timeGrid';

export default function RoomTransferChangesSummary({ request, onViewDetails }: { request: RoomTransferRequest; onViewDetails: (button: HTMLButtonElement) => void }) {
  const changes = roomTransferDetailChanges(request);
  const time = (row: typeof changes[number]['before']) => `${row.day} ${formatTime12h(row.start_time)}–${formatTime12h(row.end_time)}`;
  return <section aria-label="Changes Summary" className="px-4 py-3 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h3 className="text-sm font-bold text-gray-800">Changes Summary</h3><p className="text-xs text-gray-600">{changes.length} {changes.length === 1 ? 'schedule' : 'schedules'} affected</p></div>
      <button type="button" aria-haspopup="dialog" onClick={event => onViewDetails(event.currentTarget)} className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50">View Details</button>
    </div>
    {request.rejection_reason && <p className="mt-2 text-xs text-red-700">Rejection reason: {request.rejection_reason}</p>}
    <div className="mt-2">
      <ul className="divide-y divide-gray-100">{changes.slice(0, 2).map(change => <li key={change.schedule_id} className="grid gap-x-5 gap-y-1 py-2 text-xs sm:grid-cols-[minmax(8rem,1fr)_minmax(0,2fr)]">
        <p className="font-semibold text-gray-800">{change.course} · {change.section}</p>
        <div className="space-y-1 text-gray-600"><p className="flex flex-wrap items-center gap-x-2"><span><span className="sr-only">Original room: </span>{change.before.room}</span><ArrowRight size={12} aria-label="to" /><strong className="font-semibold text-[#4e0a10]"><span className="sr-only">Proposed room: </span>{change.after.room}</strong></p><p><span className="font-medium">Original:</span> {time(change.before)}<br className="sm:hidden" /><span className="hidden sm:inline"> · </span><span className="font-medium text-gray-800">Proposed:</span> {time(change.after)}</p></div>
      </li>)}</ul>
      {changes.length > 2 && <p className="pb-1 pt-2 text-xs text-gray-600">{changes.length - 2} more {changes.length - 2 === 1 ? 'schedule' : 'schedules'}. View Details to see all changes.</p>}
    </div>
  </section>;
}
