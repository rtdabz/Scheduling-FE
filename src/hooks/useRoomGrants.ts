import { useEffect, useState } from 'react';
import { useLiveRevision } from './useLiveRefresh';
import { hasStoredCapability } from '../lib/storedUser';
import { fetchRoomOccupancy, type RoomOccupancyBlock } from '../lib/roomRequests';

const grantCache = new Map<number, RoomOccupancyBlock[]>();

export function useRoomGrants(roomId: number | null): { grants: RoomOccupancyBlock[]; ready: boolean } {
  const [, setRevision] = useState(0);
  const liveRevision = useLiveRevision(['rooms']);
  const canSeeGrants = hasStoredCapability(['room.request', 'room.review_requests', 'schedule.create']);
  const enabled = canSeeGrants && roomId !== null;

  useEffect(() => {
    if (!enabled || roomId === null) return;
    let active = true;
    fetchRoomOccupancy(roomId)
      .then((data) => grantCache.set(roomId, data.occupied.filter((block) => block.kind === 'grant')))
      .catch(() => { if (!grantCache.has(roomId)) grantCache.set(roomId, []); })
      .finally(() => { if (active) setRevision((value) => value + 1); });
    return () => { active = false; };
  }, [enabled, roomId, liveRevision]);

  const cached = roomId !== null ? grantCache.get(roomId) : undefined;
  return { grants: enabled ? cached ?? EMPTY : EMPTY, ready: !enabled || cached !== undefined };
}

const EMPTY: RoomOccupancyBlock[] = [];
