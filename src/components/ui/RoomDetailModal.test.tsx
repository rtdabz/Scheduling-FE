import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoomDetailModal from './RoomDetailModal';
import api from '../../lib/api';
import { getCachedData } from '../../lib/dataCache';

vi.mock('../../lib/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../../lib/dataCache', () => ({ getCachedData: vi.fn() }));
vi.mock('./RoomDetailContent', () => ({ default: ({ room, schedules, isLoading }: {
  room: { room_code: string } | null; schedules: { id: number }[]; isLoading: boolean;
}) => <div>{isLoading ? 'Loading room' : `${room?.room_code}: ${schedules.map((s) => s.id).join(',')}`}</div> }));

const room = (id: number) => ({ id, room_code: `R${id}`, building: 'Main', room_type: 'lecture' as const,
  status: 'available' as const, department_id: null, department: null });

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => { vi.mocked(getCachedData).mockReturnValue(undefined); });

describe('room timetable data readiness', () => {
  it('waits for complete room data instead of printing truncated cached schedules', async () => {
    vi.mocked(getCachedData).mockReturnValue({ rooms: [room(1)], schedules: [{ id: 10 }] });
    let complete!: (value: unknown) => void;
    vi.mocked(api.get).mockImplementation((url) => url === '/rooms/1'
      ? Promise.resolve({ data: room(1) })
      : new Promise((resolve) => { complete = resolve; }));
    render(<RoomDetailModal isOpen roomId={1} onClose={vi.fn()} initialRoom={room(1)} initialSchedulesComplete={false} />);
    expect(screen.getByText('Loading room')).toBeTruthy();
    await act(async () => { complete({ data: [{ id: 10 }, { id: 11 }] }); });
    expect(await screen.findByText('R1: 10,11')).toBeTruthy();
  });

  it('does not refetch forever when optional initial schedules are omitted', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/rooms/1' ? room(1) : [] }));
    render(<RoomDetailModal isOpen roomId={1} onClose={vi.fn()} />);
    await screen.findByText('R1:');
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('ignores a previous room request that finishes after switching rooms', async () => {
    let oldRoom!: (value: unknown) => void;
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (url === '/rooms/1') return new Promise((resolve) => { oldRoom = resolve; });
      return Promise.resolve({ data: url === '/rooms/2' ? room(2)
        : [{ id: config?.params.room_id * 10 }] });
    });
    const close = vi.fn();
    const { rerender } = render(<RoomDetailModal isOpen roomId={1} onClose={close} />);
    rerender(<RoomDetailModal isOpen roomId={2} onClose={close} />);
    await screen.findByText('R2: 20');
    await act(async () => { oldRoom({ data: room(1) }); });
    expect(screen.getByText('R2: 20')).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
  });

  it('does not close the current room when an obsolete request fails', async () => {
    let fail!: (reason: Error) => void;
    vi.mocked(api.get).mockImplementation((url) => {
      if (url === '/rooms/1') return new Promise((_resolve, reject) => { fail = reject; });
      return Promise.resolve({ data: url === '/rooms/2' ? room(2) : [] });
    });
    const close = vi.fn();
    const { rerender } = render(<RoomDetailModal isOpen roomId={1} onClose={close} />);
    rerender(<RoomDetailModal isOpen roomId={2} onClose={close} />);
    await screen.findByText('R2:');
    await act(async () => { fail(new Error('Old request failed')); });
    await waitFor(() => expect(close).not.toHaveBeenCalled());
  });
});
