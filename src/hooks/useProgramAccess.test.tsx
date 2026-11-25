import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentUser } from '../lib/currentUser';
import { LIVE_UPDATE_EVENT } from '../lib/liveUpdates';
import { officeCanManageProgram } from '../lib/storedUser';
import { useProgramAccess } from './useProgramAccess';

vi.mock('../lib/currentUser', () => ({ fetchCurrentUser: vi.fn() }));

afterEach(() => { cleanup(); sessionStorage.clear(); vi.resetAllMocks(); });

describe('live program permissions', () => {
  it.each(['secretary', 'director'])('updates %s access after assignment, deactivation and archival', async role => {
    const user = { role, department_id: 1, department_program_count: 2, can_edit_program_ids: [7, 8] };
    sessionStorage.setItem('user', JSON.stringify(user));
    vi.mocked(fetchCurrentUser).mockResolvedValue(user);
    const { result } = renderHook(() => useProgramAccess());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(officeCanManageProgram(7, result.current.user)).toBe(true);

    for (const ids of [[8], [7, 8], [8], [7, 8]]) {
      vi.mocked(fetchCurrentUser).mockResolvedValue({ ...user, can_edit_program_ids: ids });
      act(() => { window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: { topics: ['users'] } })); });
      expect(result.current.ready).toBe(false);
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(officeCanManageProgram(7, result.current.user)).toBe(ids.includes(7));
      expect(officeCanManageProgram(8, result.current.user)).toBe(true);
    }
  });

  it('keeps writes blocked if permission refresh fails and retries on focus', async () => {
    vi.mocked(fetchCurrentUser).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useProgramAccess());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.ready).toBe(false);
    vi.mocked(fetchCurrentUser).mockResolvedValue({ role: 'secretary', can_edit_program_ids: [7] });
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(result.current.ready).toBe(true));
  });
});
