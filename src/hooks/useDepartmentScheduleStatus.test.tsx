import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearDataCache, setCachedData } from '../lib/dataCache';
import { LIVE_UPDATE_EVENT } from '../lib/liveUpdates';
import { useDepartmentScheduleStatus } from './useDepartmentScheduleStatus';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/api', () => ({ default: { get } }));

const status = (pending: number) => ({ department_id: 6, department_name: 'CAS', sections: [], cross_department_pending: pending });

beforeEach(() => {
  clearDataCache(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ id: 17, role: 'secretary', department_id: 6 }));
  get.mockResolvedValue({ data: status(0) });
});
afterEach(cleanup);

it('does not show a receiving program heads cached pending count to its secretary', async () => {
  setCachedData('department-schedule-status:v2:6:program_head:19:9', status(15));
  const { result } = renderHook(() => useDepartmentScheduleStatus(6));
  expect(result.current.crossDepartmentPending).toBe(0);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.crossDepartmentPending).toBe(0);
});

it.each(['users', 'assignments'])('refreshes pending counts after %s change receiving access', async (topic) => {
  const { result } = renderHook(() => useDepartmentScheduleStatus(6));
  await waitFor(() => expect(result.current.loading).toBe(false));
  get.mockResolvedValue({ data: status(2) });
  act(() => window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: { topics: [topic] } })));
  await waitFor(() => expect(result.current.crossDepartmentPending).toBe(2));
  expect(get).toHaveBeenCalledTimes(2);
});
