import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { getRecovery, recoveryError, recoveryLink, type RecoveryData } from '../../lib/roomRecovery';
import { useLiveRevision } from '../../hooks/useLiveRefresh';

export default function RoomRecoveryAlerts() {
  const [data, setData] = useState<RecoveryData | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const live = useLiveRevision(['rooms', 'schedules', 'notifications', 'settings']);
  useEffect(() => {
    const poll = () => setRefresh(value => value + 1);
    const timer = window.setInterval(poll, 60000);
    window.addEventListener('focus', poll);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', poll); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    getRecovery(undefined, controller.signal).then(({ data }) => { if (!controller.signal.aborted) { setData(data); setError(''); } })
      .catch(error => { if (!controller.signal.aborted) setError(recoveryError(error)); });
    return () => controller.abort();
  }, [refresh, live]);
  const needsAttention = data && (data.cases.length > 0 || (data.pending_count ?? 0) > 0);
  return <>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error} <button onClick={() => setRefresh(v => v + 1)} className="underline">Retry</button></p>}
    {needsAttention && <section className="rounded-xl border border-amber-200 bg-white p-4" aria-label="Room and Laboratory Alerts">
      <div className="flex items-center gap-2 font-semibold text-slate-800"><AlertTriangle size={18} className="text-amber-600" />Room and Laboratory Alerts</div>
      <div className="mt-3 space-y-3">
      {data.cases.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-3">
        <div><p className="text-sm font-semibold">{item.room_code}: {item.meeting_count} meeting(s) need attention</p><p className="text-xs text-slate-600">{item.semester_label} · {item.reason}</p></div>
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline" to={recoveryLink(item.id, item.semester_id)}>Review affected schedules <ArrowRight size={15} /></Link>
      </div>)}
      {data.cases.length === 0 && <p className="text-sm text-slate-600">{data.pending_count} meeting(s) need attention. <Link to={recoveryLink(undefined, data.semester_id)} className="font-semibold text-primary underline">Review room schedule reassignments</Link></p>}
      {data.new_rooms.length > 0 && <p className="text-sm text-slate-600">Recently added rooms: {data.new_rooms.map(room => room.room_code).join(', ')}. <Link to={recoveryLink(undefined, data.semester_id)} className="font-semibold text-primary underline">Explore relocation</Link></p>}
      </div>
    </section>}
  </>;
}
