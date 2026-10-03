import { useEffect, useState } from 'react';
import { useLiveRevision } from './useLiveRefresh';
import { hasStoredCapability } from '../lib/storedUser';
import { fetchRoomOccupancy, type RoomOccupancyBlock } from '../lib/roomRequests';

/** Approved borrowing windows per room, kept across opens so a revisit draws at once. */
const grantCache = new Map<number, RoomOccupancyBlock[]>();

/**
 * Windows of a room approved for another department in the active semester.
 * They block the owner from scheduling there, so timetables draw them as
 * reserved time.
 *
 * `ready` stays false until the first read for a room lands, letting a view
 * hold its timetable and draw classes and borrowed windows in one pass. The
 * occupancy read is gated on the room-request capabilities, so for anyone
 * else the hook is immediately ready with no windows.
 */
export function useRoomGrants(roomId: number | null): { grants: RoomOccupancyBlock[]; ready: boolean } {
  const [, setRevision] = useState(0);
  const liveRevision = useLiveRevision(['rooms']);
  const canSeeGrants = hasStoredCapability(['room.request', 'room.review_requests']);
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
