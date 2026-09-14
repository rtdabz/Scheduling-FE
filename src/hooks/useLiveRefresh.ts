import { useEffect, useRef, useState } from 'react';
import { LIVE_UPDATE_EVENT, type LiveTopic, type LiveUpdateDetail } from '../lib/liveUpdates';

/**
 * Run `onRefresh` whenever another user changes one of `topics`.
 *
 * The matching dataCache groups are already invalidated when this fires, so a
 * loader that checks the cache first will fetch fresh data. Refresh silently
 * (no skeleton) -- the page already has something on screen.
 */
export function useLiveRefresh(topics: readonly LiveTopic[], onRefresh: () => void): void {
  const callbackRef = useRef(onRefresh);
  useEffect(() => {
    callbackRef.current = onRefresh;
  });

  const topicKey = topics.join('|');

  useEffect(() => {
    const wanted = new Set(topicKey.split('|'));
    const handler = (event: Event) => {
      const changed = (event as CustomEvent<LiveUpdateDetail>).detail?.topics ?? [];
      if (changed.some((topic) => wanted.has(topic))) callbackRef.current();
    };

    window.addEventListener(LIVE_UPDATE_EVENT, handler);
    return () => window.removeEventListener(LIVE_UPDATE_EVENT, handler);
  }, [topicKey]);
}

/**
 * A counter that increases when one of `topics` changes elsewhere.
 *
 * For loaders written as `useEffect(load, [deps])`: add the revision to the
 * dependency list and use `revision > 0` to skip the loading skeleton.
 */
export function useLiveRevision(topics: readonly LiveTopic[]): number {
  const [revision, setRevision] = useState(0);
  useLiveRefresh(topics, () => setRevision((value) => value + 1));
  return revision;
}
