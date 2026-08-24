import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { clearDataCache, getCachedData, hasCachedData, loadCachedData, setCachedData } from '../lib/dataCache';

export interface RoomsPageDepartment {
  id: number;
  department_name: string;
  department_code: string;
}

export interface RoomsPageRoom {
  id: number;
  room_code: string;
  building: string;
  room_type: 'lecture' | 'laboratory' | 'online' | 'field';
  allow_lecture_usage: boolean;
  status: 'available' | 'not available';
  department_id: number | null;
  department: RoomsPageDepartment | null;
  createdAt?: string;
}

export interface RoomsPageSchedule {
  id: number;
  term_id: number;
  section_id: number;
  course_id: number;
  faculty_id: number | null;
  room_id: number;
  department_id: number;
  day: string;
  start_time: string;
  end_time: string;
  mode: string;
  status: string;
  section?: { id: number; section_name: string } | null;
  course?: { id: number; course_code: string; course_name: string } | null;
  faculty?: { id: number; first_name: string; last_name: string; middle_name?: string | null } | null;
}

export interface RoomsPageData {
  rooms: RoomsPageRoom[];
  departments: RoomsPageDepartment[];
  schedules: RoomsPageSchedule[];
  activeTerm: unknown | null;
}

interface ApiRoom extends Omit<RoomsPageRoom, 'allow_lecture_usage' | 'createdAt'> {
  allow_lecture_usage?: boolean;
  created_at: string;
}

const mapRoom = (room: ApiRoom): RoomsPageRoom => ({
  ...room,
  building: room.building || '',
  allow_lecture_usage: !!room.allow_lecture_usage,
  createdAt: room.created_at,
});

export function useRoomsPageData(role: string | undefined, departmentId: number | null | undefined, onError?: () => void) {
  const cacheKey = `page:rooms:${role ?? 'user'}:${departmentId ?? 'all'}`;
  const cached = getCachedData<RoomsPageData>(cacheKey);
  const [data, setData] = useState<RoomsPageData>({
    rooms: cached?.rooms ?? [],
    departments: cached?.departments ?? [],
    schedules: cached?.schedules ?? [],
    activeTerm: cached?.activeTerm ?? null,
  });
  const [isLoading, setIsLoading] = useState(!hasCachedData(cacheKey));
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refresh = useCallback(async (forceRefresh = false) => {
    setIsLoading(forceRefresh || !hasCachedData(cacheKey));
    try {
      const next = await loadCachedData<RoomsPageData>(cacheKey, async () => {
        const response = await api.get<{ rooms?: ApiRoom[]; departments?: RoomsPageDepartment[]; schedules?: RoomsPageSchedule[]; active_term?: unknown }>('/initial-data');
        return {
          rooms: (response.data.rooms ?? []).map(mapRoom),
          departments: response.data.departments ?? [],
          schedules: response.data.schedules ?? [],
          activeTerm: response.data.active_term ?? null,
        };
      }, forceRefresh);
      setData(next);
    } catch {
      onErrorRef.current?.();
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  const commit = useCallback((next: RoomsPageData) => {
    clearDataCache();
    setData(next);
    setCachedData(cacheKey, next);
  }, [cacheKey]);

  const updateRoom = useCallback((room: RoomsPageRoom) => {
    commit({ ...data, rooms: data.rooms.map(item => item.id === room.id ? room : item) });
  }, [commit, data]);

  const addRoom = useCallback((room: RoomsPageRoom) => {
    commit({ ...data, rooms: [room, ...data.rooms] });
  }, [commit, data]);

  const removeRoom = useCallback((id: number) => {
    commit({ ...data, rooms: data.rooms.filter(room => room.id !== id) });
  }, [commit, data]);

  return { ...data, isLoading, refresh, updateRoom, addRoom, removeRoom };
}

export { mapRoom };
