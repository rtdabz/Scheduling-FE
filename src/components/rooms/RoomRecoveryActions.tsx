import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ConfirmModal from '../ui/ConfirmModal';
import api from '../../lib/api';
import { recoveryError, recoveryLink, type RecoveryRoom } from '../../lib/roomRecovery';
import { getStoredUser, hasStoredCapability } from '../../lib/storedUser';
import { publishLiveTopics } from '../../lib/liveUpdates';

export default function RoomRecoveryActions({ rooms, room, onRoomChange, onAvailabilityChanged }: {
  rooms: RecoveryRoom[];
  room: string;
  onRoomChange: (room: string) => void;
  onAvailabilityChanged: (roomId: number, status: 'available' | 'not available', message: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const role = getStoredUser()?.role;
  const selectedRoom = rooms.find(item => String(item.id) === room);
  const makingAvailable = selectedRoom?.status === 'not available';
  const updateAvailability = async () => {
    if (busy || !selectedRoom) return;
    if (!makingAvailable && !reason.trim()) {
      setError('A closure reason is required.');
      reasonRef.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const nextStatus = makingAvailable ? 'available' : 'not available';
      const { data } = makingAvailable
        ? await api.put<{ message: string }>(`/rooms/${selectedRoom.id}`, { status: nextStatus })
        : await api.post<{ message: string }>(`/rooms/${selectedRoom.id}/close`, { reason: reason.trim() });
      publishLiveTopics(['rooms', 'schedules', 'notifications']);
      onAvailabilityChanged(selectedRoom.id, nextStatus, data.message);
      onRoomChange('');
    } catch (error) {
      setError(recoveryError(error));
    } finally {
      setBusy(false);
    }
  };

  if (role === 'vpaa') {
    return <ConfirmModal
      isOpen={Boolean(selectedRoom)}
      title={makingAvailable ? 'Mark Room Available' : 'Mark Room Unavailable'}
      message={makingAvailable
        ? `Mark ${selectedRoom?.room_code ?? 'this room'} as available? This restores the room's availability without changing existing schedules or records.`
        : `Mark ${selectedRoom?.room_code ?? 'this room'} as unavailable? It will be excluded from new room transfers. Existing schedules and records will be preserved, and affected departments will be notified.`}
      confirmLabel={makingAvailable ? 'Mark Available' : 'Mark Unavailable'}
      variant={makingAvailable ? 'success' : 'warning'}
      isConfirming={busy}
      onCancel={() => { if (!busy) onRoomChange(''); }}
      onConfirm={updateAvailability}
    >
      {!makingAvailable && <label className="block text-xs font-bold text-gray-600">
        Closure reason (required)
        <textarea ref={reasonRef} autoFocus disabled={busy} value={reason} maxLength={1000} rows={3} required
          onChange={event => { setReason(event.target.value); setError(''); }}
          className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal disabled:opacity-50" />
      </label>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </ConfirmModal>;
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="font-semibold text-slate-800">Room and laboratory recovery</h2>
    {(role === 'secretary' || role === 'program_head') && hasStoredCapability('schedule.view') && <Link to={recoveryLink()} className="mt-2 inline-block text-sm font-semibold text-primary underline">Review affected schedules or explore relocation</Link>}
  </section>;
}
