import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Info, LoaderCircle, Search } from 'lucide-react';
import Modal from '../ui/Modal';
import ConfirmModal from '../ui/ConfirmModal';
import SecretaryRoomTransferRequests from './SecretaryRoomTransferRequests';
import RoomTransferRequests from './RoomTransferRequests';
import api from '../../lib/api';
import { getRecovery, recoveryError, ROOM_TRANSFER_STATUS_LABELS, type RecoveryData, type RecoveryPlan, type RoomTransferRequest } from '../../lib/roomRecovery';
import { getStoredUser, hasStoredCapability } from '../../lib/storedUser';
import { publishLiveTopics } from '../../lib/liveUpdates';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { formatTime12h } from '../../lib/timeGrid';
import './RoomReassignmentPanel.css';

const roomTypeLabel = (type?: string | null) => type === 'laboratory' ? 'Laboratory' : type === 'field' ? 'Field' : 'Lecture room';
const meetingTime = (row: { day: string; start_time: string; end_time: string }) => `${row.day} ${formatTime12h(row.start_time)}–${formatTime12h(row.end_time)}`;

export default function RoomReassignmentPanel({ semesterId, onTransferred, onPendingCountChange }: { semesterId?: number; onTransferred?: () => void; onPendingCountChange?: (count: number) => void }) {
  const [params, setParams] = useSearchParams();
  const open = params.has('recovery');
  const [data, setData] = useState<RecoveryData | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [allowTime, setAllowTime] = useState(false);
  const [plan, setPlan] = useState<RecoveryPlan | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [activePendingCount, setActivePendingCount] = useState<number | null>(null);
  const loaded = useRef<{ key: string; at: number; data: RecoveryData } | null>(null);
  const requestVersion = useRef(0);
  const modalContent = useRef<HTMLDivElement>(null);
  const live = useLiveRevision(['rooms', 'schedules', 'approvals', 'courses', 'sections', 'departments', 'settings']);
  const canEdit = hasStoredCapability('schedule.update');
  const isSecretary = getStoredUser()?.role === 'secretary';
  const canSubmit = canEdit && isSecretary;
  const caseId = Number(params.get('recovery')) || 0;
  const transferId = params.get('room_transfer');
  const requestsOpen = isSecretary && open && !!data && (params.has('transfer_requests') || Boolean(transferId && data.transfers?.some(item => item.id === transferId)));
  const linkedScope = `${params.get('recovery')}|${params.get('recovery_semester')}|${params.get('recovery_room')}|${transferId}|${semesterId}`;
  const [previousScope, setPreviousScope] = useState(linkedScope);
  if (previousScope !== linkedScope) {
    setPreviousScope(linkedScope);
    setPlan(null); setSelected([]); setGroups([]); setMessage(''); setAllowTime(false);
  }
  useEffect(() => {
    if (activePendingCount !== null) onPendingCountChange?.(activePendingCount);
  }, [activePendingCount, onPendingCountChange]);
  useEffect(() => {
    if (open) return;
    const poll = () => setRefresh(value => value + 1);
    const timer = window.setInterval(poll, 60000);
    window.addEventListener('focus', poll);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', poll); };
  }, [open]);
  useEffect(() => {
    const controller = new AbortController();
    const versionRef = requestVersion;
    const task = window.setTimeout(() => {
      ++requestVersion.current;
      // Reuse the just-fetched list when opening the modal. Source changes always invalidate it.
      const key = `${caseId}|${semesterId}|${refresh}|${live}`;
      const cached = loaded.current?.key === key && Date.now() - loaded.current.at < 10000 ? loaded.current.data : null;
      setLoading(!cached); setPlan(null); setConfirmSubmit(false); setError(''); setSelected([]);
      const load = async () => {
        // The API detects the active semester. Only a verified incident can select an older term.
        let data = cached;
        if (!data) {
          ({ data } = await getRecovery(undefined, controller.signal, true));
          if (controller.signal.aborted) return;
          setActivePendingCount(data.pending_count ?? data.schedules.filter(row => row.needs_attention).length);
        }
        const incident = open ? data.cases.find(item => item.id === caseId) : undefined;
        let linkedSemester = incident?.semester_id;
        if (open && transferId && !data.transfers?.some(item => item.id === transferId)) {
          const response = await api.get<{ transfers: RoomTransferRequest[] }>('/room-recovery/transfers', { signal: controller.signal });
          linkedSemester = response.data.transfers?.find(item => item.id === transferId)?.semester_id ?? linkedSemester;
        }
        if (linkedSemester && linkedSemester !== data.semester_id) {
          ({ data } = await getRecovery(linkedSemester, controller.signal, true));
        }
        if (controller.signal.aborted) return;
        loaded.current = { key, at: cached ? loaded.current!.at : Date.now(), data };
        setData(data);
        const ids = incident?.schedule_ids ?? data.schedules.filter(row => row.needs_attention).map(row => row.id);
        setSelected(ids.filter(id => data.schedules.some(row => row.id === id && !row.pending_transfer_id)).slice(0, 30));
      };
      void load().catch(error => { if (!controller.signal.aborted) { setData(null); setError(recoveryError(error)); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { window.clearTimeout(task); controller.abort(); ++versionRef.current; };
  }, [open, caseId, semesterId, refresh, live, linkedScope, transferId]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = requestsOpen ? document.querySelector<HTMLElement>('.submitted-transfers-modal') : confirmSubmit ? dialogs[dialogs.length - 1] : modalContent.current?.closest<HTMLElement>('[role="dialog"]');
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? []);
    const timer = window.setTimeout(() => { if (!dialog?.contains(document.activeElement)) controls()[0]?.focus(); }, 0);
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = controls();
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      window.clearTimeout(timer); document.removeEventListener('keydown', trapFocus);
      if ((confirmSubmit || requestsOpen) && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open, confirmSubmit, requestsOpen]);
  const invalidate = () => { setPlan(null); setConfirmSubmit(false); setGroups([]); setMessage(''); ++requestVersion.current; };
  const close = () => {
    if (busy || confirmSubmit || requestsOpen) return;
    setParams(current => {
      const next = new URLSearchParams(current);
      ['recovery', 'recovery_semester', 'recovery_room', 'room_transfer', 'transfer_requests'].forEach(key => next.delete(key));
      return next;
    }, { replace: true });
  };
  const preview = async () => {
    const version = ++requestVersion.current;
    setBusy(true); setError(''); setPlan(null); setMessage('');
    try {
      const { data } = await api.post<RecoveryPlan>('/room-recovery/preview', { schedule_ids: selected, destination_room_ids: [], allow_time_changes: allowTime });
      if (version === requestVersion.current) { setPlan(data); setGroups(data.groups.map(group => group.key)); }
    } catch (error) { if (version === requestVersion.current) setError(recoveryError(error)); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!plan || busy || !canSubmit || !groups.length) return;
    setBusy(true); setError('');
    try {
      const { data } = await api.post<{ message: string; applied: boolean }>(`/room-recovery/plans/${plan.plan_id}/submit`, { group_keys: groups });
      setMessage(data.message); setPlan(null); setGroups([]); setRefresh(v => v + 1);
      publishLiveTopics(['approvals', 'rooms', 'notifications']);
      if (data.applied) onTransferred?.();
    } catch (error) { setError(recoveryError(error)); setPlan(null); }
    finally { setBusy(false); setConfirmSubmit(false); }
  };
  const roomName = (id: number | null, fallback?: string) => data?.rooms.find(room => room.id === id)?.room_code ?? fallback ?? (id === null ? 'Room TBA' : 'Room details unavailable');
  const meeting = (id: number) => plan?.meetings?.find(row => row.id === id) ?? data?.schedules.find(row => row.id === id);
  const affected = data?.schedules.filter(row => row.needs_attention) ?? [];
  const term = data?.semesters.find(item => item.id === data.semester_id);
  const termName = term?.semester === '2nd' ? 'Second Semester' : term?.semester === '1st' ? 'First Semester' : term?.semester;
  const incidentTerm = term?.is_active != null && !term.is_active;
  return <>
    {!open && error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Unable to check room availability. <button type="button" onClick={() => setRefresh(v => v + 1)} className="font-semibold underline">Retry</button></p>}
    <Modal isOpen={open} onClose={close} title="Room Transfer" description={loading ? 'Loading semester…' : term ? `${incidentTerm ? 'Incident semester' : 'Current semester'}: ${term.academic_year} · ${termName}` : error ? 'Semester details unavailable' : 'No active semester configured'} size="xl" className="room-transfer-modal" inert={requestsOpen} closeOnEscape={!busy && !confirmSubmit && !requestsOpen} closeOnOverlayClick={!busy && !confirmSubmit && !requestsOpen} showCloseButton={!busy && !confirmSubmit && !requestsOpen}>
      <div ref={modalContent} className="room-transfer">
        {message && <p role="status" className="transfer-alert transfer-success"><CheckCircle2 size={18} aria-hidden="true" />{message}</p>}
        {error && <div role="alert" className="transfer-alert transfer-error"><p>{error}</p><button type="button" disabled={busy} onClick={() => setRefresh(v => v + 1)}>Refresh</button></div>}
        {loading && <p role="status" className="transfer-loading"><LoaderCircle size={18} className="transfer-spinner" aria-hidden="true" />Loading schedules…</p>}
        {data && isSecretary && <SecretaryRoomTransferRequests requests={data.transfers ?? []} isOpen={requestsOpen} loading={loading} linkedId={transferId}
          onOpen={() => setParams(current => { const next = new URLSearchParams(current); next.delete('room_transfer'); next.set('transfer_requests', 'open'); return next; }, { replace: true })}
          onClose={() => setParams(current => { const next = new URLSearchParams(current); next.delete('room_transfer'); next.delete('transfer_requests'); return next; }, { replace: true })} />}
        {data && !loading && !isSecretary && <RoomTransferRequests transfers={data.transfers ?? []} />}
        {data && !loading && <div className="transfer-layout">
          <section aria-label="Schedules" className="transfer-schedules">
            <div className="transfer-section-heading">
              <h3><span className="transfer-step" aria-hidden="true">1</span>Schedules</h3>
              <span role="status" className="transfer-selection-count">{selected.length} selected</span>
            </div>
            <p className="transfer-description">{affected.length > 0 ? `${affected.length} need a room. Select up to 30 schedules.` : data.semester_id ? 'No schedules currently need a replacement room.' : 'An active semester is needed to load schedules.'}</p>
            <div className="transfer-table-scroll" role="region" aria-label="Schedule list" tabIndex={0}>
              <table className="transfer-table" role="table">
                <caption className="sr-only">Schedules requiring a replacement room</caption>
                <thead role="rowgroup"><tr role="row"><th scope="col"><span className="sr-only">Select</span></th><th scope="col">Class / section</th><th scope="col">Room / time</th><th scope="col">Status</th></tr></thead>
                <tbody role="rowgroup">
                  {affected.map(row => <tr key={row.id} role="row" data-selected={selected.includes(row.id)}>
                    <td role="cell" className="transfer-select-cell"><label className="transfer-checkbox-target"><input aria-label={`Select ${row.course} ${row.section}, ${meetingTime(row)}`} type="checkbox" disabled={busy || !canEdit || !!row.pending_transfer_id || (!selected.includes(row.id) && selected.length >= 30)} checked={selected.includes(row.id)} onChange={() => { invalidate(); setSelected(ids => ids.includes(row.id) ? ids.filter(id => id !== row.id) : [...ids, row.id]); }} /></label></td>
                    <td role="cell" className="transfer-class-cell"><p className="transfer-course">{row.course}</p><p>{row.section}</p><p className="transfer-meta">{roomTypeLabel(row.required_room_type ?? row.meeting_type)}</p></td>
                    <td role="cell" className="transfer-room-cell"><p className="transfer-room-name">{row.room}</p><p className="transfer-meta transfer-meeting-time">{meetingTime(row)}</p></td>
                    <td role="cell" className="transfer-status-cell"><span className="transfer-notice">{row.pending_transfer_id ? ROOM_TRANSFER_STATUS_LABELS[row.pending_transfer_status ?? 'pending_dean'] : row.attention_reason ?? 'Room needs attention'}</span>{row.status === 'faculty_assignment' && <p className="transfer-meta">Day/time changes allowed when enabled</p>}{(row.revision_required ?? !['draft', 'completed', 'revision', 'faculty_assignment'].includes(row.status)) && <p className="transfer-meta">Revision required</p>}</td>
                  </tr>)}
                  {affected.length === 0 && <tr><td colSpan={4} className="transfer-table-empty"><CheckCircle2 size={22} aria-hidden="true" /><p>{data.schedules.length === 0 ? 'No on-site schedules in this semester.' : 'No room transfers needed.'}</p></td></tr>}
                </tbody>
              </table>
            </div>
            <p className="transfer-help"><Info size={15} aria-hidden="true" /><span>Lab classes need a lab. Locked schedules require revision.</span></p>
          </section>
          <section aria-label="Review proposed room transfers" className="transfer-review">
            <div className="transfer-section-heading"><h3><span className="transfer-step" aria-hidden="true">2</span>Review proposed room transfers</h3></div>
            <p className="transfer-description">Find rooms, review changes, then submit for approval.</p>
            <div role="group" aria-label="Room transfer actions" className="transfer-workflow">
              <div className="transfer-finder">
                <label className="transfer-time-option"><input type="checkbox" disabled={busy || !canEdit} checked={allowTime} onChange={event => { invalidate(); setAllowTime(event.target.checked); }} />Allow day and time changes</label>
                <p className="transfer-meta">Search all days, including Sunday, while keeping linked schedules and instructors conflict-free.</p>
                {!canEdit && <p className="transfer-meta">View only. Schedule update permission is required to transfer.</p>}
                <button type="button" disabled={busy || !canEdit || !selected.length || !data.semester_id} onClick={preview} className={`transfer-button ${plan && plan.groups.length > 0 ? 'transfer-button-secondary' : 'transfer-button-primary'}`}>{busy && !plan ? <LoaderCircle size={17} className="transfer-spinner" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}{busy && !plan ? 'Finding rooms…' : 'Find suitable rooms'}</button>
                {!selected.length && affected.length > 0 && <p className="transfer-meta">Select at least one schedule to find rooms.</p>}
              </div>
              <article aria-label="Proposed room transfers" className="transfer-results">
                <div className="transfer-results-heading"><h4>Available room suggestions</h4>{plan && <span>{plan.groups.length} ready</span>}</div>
                <p role="status" className="sr-only">{busy ? (plan ? 'Submitting room transfers…' : 'Checking room availability…') : plan ? `${plan.groups.length} proposed transfers. ${plan.unresolved.length} unresolved.` : ''}</p>
                <div className="transfer-results-scroll" role="region" aria-label="Room suggestions" tabIndex={0} aria-busy={busy}>
                  {!plan && <div className="transfer-empty"><p>{busy ? 'Checking room availability…' : affected.length ? 'Available rooms will appear here.' : 'No room suggestions needed.'}</p><p className="transfer-meta">{busy ? 'Matching room types and checking schedule conflicts.' : !affected.length ? 'Room suggestions appear when schedules need a replacement.' : selected.length ? 'Find suitable rooms for the selected schedules.' : 'Choose schedules from the list to get started.'}</p></div>}
                  {plan && <>
                    {plan.groups.map(group => <div key={group.key} className="transfer-proposal" data-selected={groups.includes(group.key)}>
                      <label className="transfer-proposal-select"><input aria-label={`Transfer ${[...new Set(group.after.map(row => { const label = meeting(row.id); return label ? `${label.course} ${label.section}` : 'linked meeting'; }))].join(', ')}`} type="checkbox" disabled={busy || !canEdit} checked={groups.includes(group.key)} onChange={() => setGroups(keys => keys.includes(group.key) ? keys.filter(key => key !== group.key) : [...keys, group.key])} /><span>Transfer this class</span><span className="transfer-proposal-state">{groups.includes(group.key) ? 'Selected' : 'Not selected'}</span></label>
                      {group.after.map(row => {
                        const before = group.before.find(item => item.id === row.id);
                        if (!before) return null;
                        const label = meeting(row.id);
                        const sameTime = meetingTime(before) === meetingTime(row);
                        const unchanged = sameTime && before.room_id === row.room_id;
                        const location = label?.mode === 'online' ? 'Online' : roomName(before.room_id, label?.room);
                        const replacement = data.rooms.find(room => room.id === row.room_id);
                        return <div key={row.id} className="transfer-proposal-meeting">
                          <p className="transfer-course">{label ? `${label.course} · ${label.section}` : 'Linked meeting'}</p>
                          {unchanged ? <p className="transfer-meta">{location} · {meetingTime(row)} · Unchanged linked meeting</p> : <>
                            <p className="transfer-meta">Current: {location} · {meetingTime(before)}</p>
                            <div className="transfer-replacement"><p className="transfer-meta">Replacement</p><p><strong>{label?.mode === 'online' ? 'Online' : roomName(row.room_id)} · {meetingTime(row)}</strong></p>
                              {label?.mode !== 'online' && <p className="transfer-meta">{replacement ? roomTypeLabel(replacement.room_type) : 'Room type not recorded'} · Capacity not recorded</p>}
                              <p className="transfer-available"><CheckCircle2 size={14} aria-hidden="true" />Available for this schedule</p>
                            </div>
                            {sameTime && <p className="transfer-meta">Day and time unchanged</p>}
                          </>}
                        </div>;
                      })}
                    </div>)}
                    {plan.groups.length === 0 && <p className="transfer-empty">No transfers ready. See the reasons below.</p>}
                    {plan.unresolved.map((item, index) => {
                      const meetings = item.schedule_ids.map(meeting).filter(row => row !== undefined);
                      const classes = [...new Set(meetings.map(row => `${row.course} · ${row.section}`))];
                      return <div key={index} className="transfer-unresolved">
                        <p className="font-semibold">Could not transfer: {classes.join(', ') || 'Class details unavailable'}</p>
                        <ul>{meetings.map(row => <li key={row.id}>{meetingTime(row)} · {row.mode === 'online' ? 'Online' : row.room}</li>)}</ul>
                        <p>{item.reason}</p>
                      </div>;
                    })}
                    {plan.search_limit_reached && plan.unresolved.length > 0 && <p className="transfer-unresolved">Search limit reached. Try fewer classes.</p>}
                  </>}
                </div>
              </article>
              {plan && plan.groups.length > 0 && <div className="transfer-confirm">
                <p role="status" className="transfer-confirm-count">{groups.length} of {plan.groups.length} classes selected for transfer</p>
                <p className="transfer-meta">Existing schedules stay unchanged until Dean and VPAA approval. Linked meetings stay together and availability is rechecked at final approval.</p>
                {!canSubmit && <p className="transfer-meta">Only the Secretary can submit room transfers.</p>}
                <button type="button" disabled={busy || !groups.length || !canSubmit} onClick={() => setConfirmSubmit(true)} className="transfer-button transfer-button-primary">{busy && <LoaderCircle size={17} className="transfer-spinner" aria-hidden="true" />}{busy ? 'Submitting…' : 'Submit for approval'}</button>
              </div>}
            </div>
          </section>
        </div>}
      </div>
    </Modal>
    <ConfirmModal isOpen={open && confirmSubmit} title="Submit room transfer" message="Are you sure you want to submit this room transfer for approval?"
      confirmLabel="Submit request" variant="maroon" isConfirming={busy} onConfirm={submit} onCancel={() => { if (!busy) setConfirmSubmit(false); }} />
  </>;
}
