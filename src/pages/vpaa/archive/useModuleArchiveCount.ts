import { useCallback, useEffect, useState } from 'react';
import api from '../../../lib/api';
import { useLiveRefresh } from '../../../hooks/useLiveRefresh';
import type { LiveTopic } from '../../../lib/liveUpdates';
import { ARCHIVE_MODULES, type ArchiveModule, type ArchivePage } from './archiveTypes';

const LIVE_TOPICS: readonly LiveTopic[] = ['schedules', 'rooms', 'faculty', 'courses', 'departments', 'users', 'settings'];

/** Archived-record count for one module only (the server counts just the module's types). */
export function useModuleArchiveCount(module: ArchiveModule, enabled: boolean) {
  const [count, setCount] = useState<number | null>(null);
  const load = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await api.get<ArchivePage>('/archives', { params: { types: [...ARCHIVE_MODULES[module].types], per_page: 10 } });
      setCount(response.data.total_archived);
    } catch {
      setCount(null);
    }
  }, [enabled, module]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useLiveRefresh(LIVE_TOPICS, () => void load());
  return { count, reload: load };
}
