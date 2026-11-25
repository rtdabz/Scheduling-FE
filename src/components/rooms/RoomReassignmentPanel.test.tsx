import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../lib/api';
import { LIVE_UPDATE_EVENT } from '../../lib/liveUpdates';
import type { RecoveryData, RecoveryPlan } from '../../lib/roomRecovery';
import RoomReassignmentPanel from './RoomReassignmentPanel';

vi.mock('../../lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('./SecretaryRoomTransferRequests', () => ({ default: () => null }));
vi.mock('./RoomTransferRequests', () => ({ default: () => null }));

afterEach(() => { cleanup(); sessionStorage.clear(); vi.resetAllMocks(); });

describe('program ownership in room reassignment', () => {
  it.each(['secretary', 'director'])('invalidates an open %s confirmation when a head is assigned', async role => {
    sessionStorage.setItem('user', JSON.stringify({ role, permissions: ['schedule.update'] }));
    const data: RecoveryData = {
      cases: [], semester_id: 1, semesters: [{ id: 1, academic_year: '2026-2027', semester: '1st', is_active: true }],
      rooms: [{ id: 2, room_code: 'R2', room_type: 'lecture', status: 'available' }], new_rooms: [], transfers: [],
      schedules: [{ id: 10, course: 'A101', section: 'A-1', room: 'Room TBA', day: 'Monday', start_time: '08:00', end_time: '09:00', meeting_type: 'lecture', status: 'faculty_assignment', needs_attention: true, can_reassign: true }],
    };
    const plan: RecoveryPlan = {
      plan_id: 'plan-1', groups: [{ key: 'single-10', workflow: 'approval',
        before: [{ id: 10, room_id: null, day: 'Monday', start_time: '08:00', end_time: '09:00' }],
        after: [{ id: 10, room_id: 2, day: 'Monday', start_time: '08:00', end_time: '09:00' }],
      }], unresolved: [], search_limit_reached: false, expires_at: '2026-11-26T00:00:00Z',
    };
    vi.mocked(api.get).mockResolvedValue({ data });
    vi.mocked(api.post).mockResolvedValue({ data: plan });
    render(<MemoryRouter initialEntries={['/?recovery=open']}><RoomReassignmentPanel /></MemoryRouter>);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Find suitable rooms' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Find suitable rooms' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit for approval' }));
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeDefined();

    vi.mocked(api.get).mockResolvedValue({ data: { ...data, schedules: [{ ...data.schedules[0], can_reassign: false }] } });
    act(() => { window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: { topics: ['users'] } })); });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Submit request' })).toBeNull());
    await waitFor(() => expect((screen.getByRole('checkbox', { name: /Select A101/ }) as HTMLInputElement).disabled).toBe(true));
    expect(screen.getByText('Managed by its Program Head: view only')).toBeDefined();
    expect(api.post).toHaveBeenCalledTimes(1);

    vi.mocked(api.get).mockResolvedValue({ data });
    act(() => { window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: { topics: ['users'] } })); });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Find suitable rooms' }) as HTMLButtonElement).disabled).toBe(false));
    let releasePreview!: (value: { data: RecoveryPlan }) => void;
    vi.mocked(api.post).mockReturnValueOnce(new Promise(resolve => { releasePreview = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Find suitable rooms' }));
    vi.mocked(api.get).mockResolvedValue({ data: { ...data, schedules: [{ ...data.schedules[0], can_reassign: false }] } });
    act(() => { window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: { topics: ['users'] } })); });
    await waitFor(() => expect((screen.getByRole('checkbox', { name: /Select A101/ }) as HTMLInputElement).disabled).toBe(true));
    await act(async () => { releasePreview({ data: plan }); });
    expect(screen.queryByRole('button', { name: 'Submit for approval' })).toBeNull();
  });
});
