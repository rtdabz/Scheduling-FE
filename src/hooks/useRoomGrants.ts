import { useEffect, useState } from 'react';
import { useLiveRevision } from './useLiveRefresh';
import { hasStoredCapability } from '../lib/storedUser';
import { fetchRoomOccupancy, type RoomOccupancyBlock } from '../lib/roomRequests';

/** Keyed by semester and room; a missing semester means the server's active one. */
const grantCache = new Map<string, RoomOccupancyBlock[]>();

export interface RoomGrantsState {
  grants: RoomOccupancyBlock[];
  /** True once grants are known, or once loading them has failed. */
  ready: boolean;
  /** The first load failed: no grant data is known for this room. */
  error: boolean;
  /** A refresh failed: the grants shown are from an earlier load. */
  stale: boolean;
  retry: () => void;
}

export function useRoomGrants(roomId: number | null, semesterId?: number | null): RoomGrantsState {
  const [, setRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const liveRevision = useLiveRevision(['rooms', 'schedules', 'settings']);
  const canSeeGrants = hasStoredCapability(['room.request', 'room.review_requests', 'schedule.create']);
  const enabled = canSeeGrants && roomId !== null;
  const key = roomId === null ? null : `${semesterId ?? 'active'}:${roomId}`;

  useEffect(() => {
    if (!enabled || roomId === null || key === null) return;
    let active = true;
    fetchRoomOccupancy(roomId, semesterId)
      .then((data) => {
        grantCache.set(key, data.occupied.filter((block) => block.kind === 'grant'));
        if (!active) return;
        setFailedKey((current) => (current === key ? null : current));
        setRevision((value) => value + 1);
      })
      .catch(() => { if (active) setFailedKey(key); });
    return () => { active = false; };
  }, [enabled, roomId, semesterId, key, liveRevision, attempt]);

  const cached = key !== null ? grantCache.get(key) : undefined;
  const failed = enabled && key !== null && failedKey === key;
  return {
    grants: enabled ? cached ?? EMPTY : EMPTY,
    ready: !enabled || cached !== undefined || failed,
    error: failed && cached === undefined,
    stale: failed && cached !== undefined,
    retry: () => setAttempt((value) => value + 1),
  };
}

const EMPTY: RoomOccupancyBlock[] = [];
