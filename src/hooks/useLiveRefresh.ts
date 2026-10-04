import { useEffect, useRef, useState } from 'react';
import { LIVE_UPDATE_EVENT, type LiveTopic, type LiveUpdateDetail } from '../lib/liveUpdates';

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

export function useLiveRevision(topics: readonly LiveTopic[]): number {
  const [revision, setRevision] = useState(0);
  useLiveRefresh(topics, () => setRevision((value) => value + 1));
  return revision;
}
