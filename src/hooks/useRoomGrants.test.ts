import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('../lib/api', () => ({ default: { get } }));

import { useRoomGrants } from './useRoomGrants';

const grant = { kind: 'grant', day: 'Monday', start_time: '11:00', end_time: '13:00', department_code: 'CIT', label: 'Lent to CIT' };

describe('useRoomGrants', () => {
  beforeEach(() => {
    get.mockReset();
    sessionStorage.clear();
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'secretary', department_id: 1, permissions: ['room.request'] }));
  });

  it('reports a failed first load as an error, not as no grants, and recovers on retry', async () => {
    get.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useRoomGrants(501, 7));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.ready).toBe(true);
    expect(result.current.grants).toEqual([]);

    get.mockResolvedValueOnce({ data: { occupied: [grant, { ...grant, kind: 'class' }], schedules: [] } });
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.grants).toHaveLength(1));
    expect(result.current.error).toBe(false);
    expect(get).toHaveBeenLastCalledWith('/room-requests/rooms/501/occupancy', { params: { semester_id: 7 } });
  });

  it('keeps earlier grants but marks them stale when a refresh fails', async () => {
    get.mockResolvedValueOnce({ data: { occupied: [grant], schedules: [] } });
    const { result } = renderHook(() => useRoomGrants(502, 7));
    await waitFor(() => expect(result.current.grants).toHaveLength(1));

    get.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.error).toBe(false);
    expect(result.current.grants).toHaveLength(1);
  });

  it('does not reuse one semester’s grants for another', async () => {
    get.mockResolvedValueOnce({ data: { occupied: [grant], schedules: [] } });
    const { result, rerender } = renderHook(({ semesterId }) => useRoomGrants(503, semesterId), { initialProps: { semesterId: 7 } });
    await waitFor(() => expect(result.current.grants).toHaveLength(1));

    get.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ semesterId: 8 });

    expect(result.current.ready).toBe(false);
    expect(result.current.grants).toEqual([]);
  });
});
