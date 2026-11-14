import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../../lib/api';
import { apiErrorMessage } from '../../../lib/apiError';
import { getCachedData, setCachedData } from '../../../lib/dataCache';
import { useLiveRefresh } from '../../../hooks/useLiveRefresh';
import type { LiveTopic } from '../../../lib/liveUpdates';
import { ARCHIVE_TYPES, type ArchivePage, type ArchiveType } from './archiveTypes';

export type ArchiveSort = 'newest' | 'oldest' | 'type';

export interface ArchiveQuery {
  search: string;
  type: ArchiveType | '';
  department: string;
  program: string;
  term: string;
  from: string;
  to: string;
  sort: ArchiveSort;
  page: number;
  size: number;
}

const FILTER_KEYS = ['search', 'type', 'department', 'program', 'term', 'from', 'to'] as const;
const PARAM_NAMES: Record<keyof ArchiveQuery, string> = {
  search: 'q', type: 'type', department: 'department', program: 'program', term: 'term', from: 'from', to: 'to', sort: 'sort', page: 'page', size: 'size',
};
const SIZES = [10, 25, 50, 100];
const LIVE_TOPICS: readonly LiveTopic[] = ['schedules', 'rooms', 'faculty', 'courses', 'departments', 'users', 'settings'];

const readQuery = (raw: URLSearchParams, prefix: string, scope: readonly ArchiveType[]): ArchiveQuery => {
  const get = (name: string) => raw.get(`${prefix}${name}`);
  const type = get('type') ?? '';
  const sort = get('sort') ?? '';
  const size = Number(get('size'));
  return {
    search: (get('q') ?? '').slice(0, 100),
    // A type outside the module scope (for example from an edited URL) is ignored.
    type: (scope as readonly string[]).includes(type) ? type as ArchiveType : '',
    department: get('department') ?? '',
    program: get('program') ?? '',
    term: get('term') ?? '',
    from: get('from') ?? '',
    to: get('to') ?? '',
    sort: sort === 'oldest' || sort === 'type' ? sort : 'newest',
    page: Math.max(1, Number(get('page')) || 1),
    size: SIZES.includes(size) ? size : 10,
  };
};

const apiParams = (query: ArchiveQuery, scope: readonly ArchiveType[]): Record<string, string | number | string[]> => {
  // The module scope is always sent, so clearing filters can never widen the listing.
  const params: Record<string, string | number | string[]> = { page: query.page, per_page: query.size, types: [...scope] };
  if (query.search.trim()) params.search = query.search.trim();
  if (query.type) params.type = query.type;
  if (query.department) params.department_id = query.department;
  if (query.program) params.program_id = query.program;
  if (query.term) params.semester_id = query.term;
  if (query.from) params.archived_from = query.from;
  if (query.to) params.archived_to = query.to;
  if (query.sort === 'oldest') Object.assign(params, { sort: 'archived_at', direction: 'asc' });
  if (query.sort === 'type') Object.assign(params, { sort: 'type', direction: 'asc' });
  return params;
};

export interface ArchiveScopeOptions {
  /** Fixed record types of the module this listing belongs to. */
  types?: readonly ArchiveType[];
  /** URL parameter prefix, so the listing never collides with the host page's parameters. */
  prefix?: string;
}

/**
 * Server-paginated archive listing whose query lives in the URL. Each load gets a sequence
 * number so a slower, older response can never replace a newer one, and a failed refresh keeps
 * the last good page on screen with a warning instead of an error page.
 */
export function useArchiveRecords({ types = ARCHIVE_TYPES, prefix = '' }: ArchiveScopeOptions = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const scopeKey = types.join(',');
  const scope = useMemo(() => scopeKey.split(',') as ArchiveType[], [scopeKey]);
  const query = useMemo(() => readQuery(searchParams, prefix, scope), [prefix, scope, searchParams]);
  const requestParams = useMemo(() => apiParams(query, scope), [query, scope]);
  const cacheKey = `page:archive:${JSON.stringify(requestParams)}`;

  // While a new query loads, the previous page stays visible (marked as checking).
  const [page, setPage] = useState<ArchivePage | null>(() => getCachedData<ArchivePage>(cacheKey) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const response = await api.get<ArchivePage>('/archives', { params: requestParams });
      if (id !== sequence.current) return;
      setPage(response.data);
      setCachedData<ArchivePage>(cacheKey, response.data);
      if (response.data.meta.current_page !== query.page && query.page > 1) {
        // The requested page no longer exists after other changes; follow the server's clamp.
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.set(`${prefix}page`, String(response.data.meta.current_page));
          return next;
        }, { replace: true });
      }
    } catch (requestError) {
      if (id !== sequence.current) return;
      setError(apiErrorMessage(requestError, 'Unable to load archived records.'));
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [cacheKey, prefix, query.page, requestParams, setSearchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useLiveRefresh(LIVE_TOPICS, () => void load());

  const update = useCallback((changes: Partial<ArchiveQuery>) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes) as [keyof ArchiveQuery, string | number][]) {
        const name = `${prefix}${PARAM_NAMES[key]}`;
        const isDefault = value === '' || (key === 'sort' && value === 'newest') || (key === 'page' && value === 1) || (key === 'size' && value === 10);
        if (isDefault) next.delete(name);
        else next.set(name, String(value));
      }
      // Any change other than paging returns to the first page of the new result.
      if (!('page' in changes)) next.delete(`${prefix}page`);
      return next;
    }, { replace: true });
  }, [prefix, setSearchParams]);

  const clearFilters = useCallback(() => {
    update(Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])) as Partial<ArchiveQuery>);
  }, [update]);

  const hasFilters = FILTER_KEYS.some((key) => query[key] !== '');

  return { query, page, loading, error, hasFilters, refresh: load, update, clearFilters };
}
