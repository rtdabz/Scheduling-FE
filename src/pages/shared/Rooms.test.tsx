import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const { get, post, put, toast } = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: [] }),
  post: vi.fn().mockResolvedValue({ data: {} }),
  put: vi.fn().mockResolvedValue({ data: {} }),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../../lib/api', () => ({
  default: {
    get,
    post,
    put,
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('../../hooks/useWorkflowGuide', () => ({
  useWorkflowGuide: vi.fn(),
}));

vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRevision: () => 0 }));
vi.mock('../../lib/liveUpdates', () => ({ publishLiveTopics: vi.fn() }));

import Rooms from './Rooms';
import { clearDataCache } from '../../lib/dataCache';
import { publishLiveTopics } from '../../lib/liveUpdates';

afterEach(() => {
  cleanup();
});

describe('Rooms component', () => {
  let roomStatus = 'available';
  beforeEach(() => {
    vi.clearAllMocks();
    roomStatus = 'available';
    clearDataCache();
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('user', JSON.stringify({
      id: 1,
      role: 'secretary',
      department_id: 1,
    }));

    get.mockImplementation((url: string) => {
      if (url === '/program-rooms') {
        return Promise.resolve({
          data: {
            data: {
              rooms: [],
            },
          },
        });
      }
      if (url === '/initial-data') {
        return Promise.resolve({
          data: {
            rooms: [
              {
                id: 1,
                room_code: 'LAB-101',
                building: 'Main Bldg',
                room_type: 'laboratory',
                status: roomStatus,
                department_id: 1,
              },
            ],
            departments: [
              { id: 1, department_name: 'CCS', department_code: 'CCS' },
            ],
            schedules: [],
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders without crashing for secretary and displays buildings and filters', async () => {
    render(
      <MemoryRouter>
        <Rooms />
      </MemoryRouter>
    );

    expect(await screen.findByPlaceholderText(/Search buildings/i)).toBeDefined();
    expect(screen.getByText('All Types')).toBeDefined();
    expect(await screen.findByText('Main Bldg')).toBeDefined();
  });

  const editAsVpaa = async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Main Bldg'));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Room' }));
    await screen.findByText('Edit Room Details');
  };

  it.each(['List View', 'Grid View'])('confirms availability changes from the last action in %s', async (view) => {
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Main Bldg'));
    fireEvent.click(screen.getByRole('button', { name: view }));
    const workspace = view === 'List View' ? screen.getByRole('table', { name: 'Rooms' }) : document.getElementById('rooms-workspace')!;
    const markUnavailable = within(workspace).getByRole('button', { name: 'Mark Unavailable' });
    expect(markUnavailable.parentElement?.lastElementChild).toBe(markUnavailable);
    fireEvent.click(markUnavailable);

    const dialog = screen.getByRole('dialog', { name: 'Mark Room Unavailable' });
    expect(within(dialog).getByText(/Mark LAB-101 as unavailable\?/)).toBeTruthy();
    expect(screen.queryByLabelText('Room to close')).toBeNull();
    expect(screen.queryByText('Edit Room Details')).toBeNull();
    expect(post).not.toHaveBeenCalled();
    post.mockResolvedValueOnce({ data: { message: 'Room marked unavailable.' } });
    fireEvent.change(within(dialog).getByLabelText('Closure reason (required)'), { target: { value: ' Laboratory maintenance ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Unavailable' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(post).toHaveBeenCalledExactlyOnceWith('/rooms/1/close', { reason: 'Laboratory maintenance' });
    expect(put).not.toHaveBeenCalled();
    expect(publishLiveTopics).toHaveBeenCalledWith(['rooms', 'schedules', 'notifications']);
    expect(toast.success).toHaveBeenCalledWith('Room unavailable', 'Room marked unavailable.');
    expect(within(workspace).queryByRole('button', { name: 'Mark Unavailable' })).toBeNull();
    expect(within(workspace).getByText('Unavailable')).toBeTruthy();
    const markAvailable = within(workspace).getByRole('button', { name: 'Mark Available' });
    expect(markAvailable.parentElement?.lastElementChild).toBe(markAvailable);
    fireEvent.click(markAvailable);
    const reopenDialog = screen.getByRole('dialog', { name: 'Mark Room Available' });
    expect(within(reopenDialog).getByText(/Mark LAB-101 as available\?/)).toBeTruthy();
    expect(within(reopenDialog).queryByRole('textbox')).toBeNull();
    expect(put).not.toHaveBeenCalled();
    put.mockResolvedValueOnce({ data: { message: 'Room updated successfully.' } });
    fireEvent.click(within(reopenDialog).getByRole('button', { name: 'Mark Available' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(put).toHaveBeenCalledExactlyOnceWith('/rooms/1', { status: 'available' });
    expect(post).toHaveBeenCalledTimes(1);
    expect(publishLiveTopics).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenLastCalledWith('Room available', 'Room updated successfully.');
    expect(within(workspace).queryByText('Unavailable')).toBeNull();
    expect(within(workspace).getByRole('button', { name: 'Mark Unavailable' })).toBeTruthy();
    expect(within(workspace).queryByRole('button', { name: 'Mark Available' })).toBeNull();
  });

  it.each(['available', 'not available'])('edits room details without a status control or status write for %s rooms', async (currentStatus) => {
    roomStatus = currentStatus;
    await editAsVpaa();
    const form = within(document.getElementById('room-form')!);
    expect(form.queryByLabelText('Room status')).toBeNull();
    expect(form.queryByRole('button', { name: /Mark (Unavailable|Available)/ })).toBeNull();
    expect(put).not.toHaveBeenCalled();
    fireEvent.change(form.getByDisplayValue('LAB-101'), { target: { value: 'LAB-102' } });
    put.mockResolvedValueOnce({ data: { room: {
      id: 1, room_code: 'LAB-102', building: 'Main Bldg', room_type: 'laboratory', status: currentStatus, department_id: 1,
    } } });
    fireEvent.click(form.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(screen.queryByText('Edit Room Details')).toBeNull());
    expect(put).toHaveBeenCalledExactlyOnceWith('/rooms/1', expect.objectContaining({ room_code: 'LAB-102' }));
    expect(put.mock.calls[0][1]).not.toHaveProperty('status');
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: currentStatus === 'available' ? 'Mark Unavailable' : 'Mark Available' })).toBeTruthy();
  });

  it('requires a reason, allows cancellation, and clears it on reopening', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Main Bldg'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Unavailable' }));
    let dialog = screen.getByRole('dialog', { name: 'Mark Room Unavailable' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Unavailable' }));
    expect(within(dialog).getByRole('alert').textContent).toBe('A closure reason is required.');
    fireEvent.change(within(dialog).getByLabelText('Closure reason (required)'), { target: { value: 'Unsaved reason' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Unavailable' }));
    dialog = screen.getByRole('dialog', { name: 'Mark Room Unavailable' });
    expect(within(dialog).getByLabelText('Closure reason (required)')).toHaveProperty('value', '');
    expect(within(dialog).queryByRole('alert')).toBeNull();
  });

  it('keeps the room available and the confirmation open if closure fails', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Main Bldg'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Unavailable' }));
    const dialog = screen.getByRole('dialog', { name: 'Mark Room Unavailable' });
    fireEvent.change(within(dialog).getByLabelText('Closure reason (required)'), { target: { value: 'Maintenance' } });
    post.mockRejectedValueOnce({ response: { data: { message: 'Unable to close this room.' } } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Unavailable' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Unable to close this room.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Mark Unavailable' })).toBeTruthy();
    expect(publishLiveTopics).not.toHaveBeenCalled();
  });

  it('shows Mark Available for unavailable rooms and hides availability actions for secretary users', async () => {
    roomStatus = 'not available';
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    const view = render(<MemoryRouter><Rooms /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Main Bldg'));
    fireEvent.click(screen.getByRole('button', { name: 'List View' }));
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark Unavailable' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark Available' })).toBeTruthy();
    view.unmount();
    roomStatus = 'available';
    sessionStorage.setItem('user', JSON.stringify({ id: 2, role: 'secretary', department_id: 1 }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Main Bldg'));
    fireEvent.click(screen.getByRole('button', { name: 'List View' }));
    expect(screen.queryByRole('button', { name: 'Mark Unavailable' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark Available' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('allows cancelling reopening and retains unavailable status when reopening fails', async () => {
    roomStatus = 'not available';
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Main Bldg'));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Available' }));
    let dialog = screen.getByRole('dialog', { name: 'Mark Room Available' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Available' }));
    dialog = screen.getByRole('dialog', { name: 'Mark Room Available' });
    put.mockRejectedValueOnce({ response: { data: { message: 'Unable to reopen this room.' } } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark Available' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Unable to reopen this room.');
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(publishLiveTopics).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows expected edit validation inside the form instead of a system-error dialog', async () => {
    roomStatus = 'not available';
    await editAsVpaa();
    put.mockRejectedValueOnce({ response: { status: 422, data: { errors: { department_id: ['Resolve the room assignment first.'] } } } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Resolve the room assignment first.');
    expect(screen.getByText('Edit Room Details')).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledWith('/rooms/1', expect.objectContaining({ room_code: 'LAB-101' }));
    expect(put.mock.calls[0][1]).not.toHaveProperty('status');
  });
  it('creates a building only from the details of its real first room', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    await screen.findByText('Main Bldg');
    fireEvent.click(screen.getByRole('button', { name: 'Add Building' }));
    const form = within(document.getElementById('room-form')!);
    fireEvent.change(form.getByPlaceholderText(/NEE Building/), { target: { value: '  North   Hall ' } });
    fireEvent.click(form.getByRole('button', { name: 'Create Building' }));
    expect(await form.findByText('Room code is required')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(form.getByPlaceholderText('e.g. CCS-LAB1'), { target: { value: 'nh-lab1' } });
    fireEvent.change(form.getByDisplayValue('Lecture'), { target: { value: 'laboratory' } });
    fireEvent.click(form.getByRole('checkbox'));
    fireEvent.change(form.getByLabelText('Room status'), { target: { value: 'not available' } });
    post.mockResolvedValueOnce({ data: { room: { id: 9, room_code: 'NH-LAB1', building: 'North Hall', room_type: 'laboratory', allow_lecture_usage: true, status: 'not available', department_id: null, department: null } } });
    fireEvent.click(form.getByRole('button', { name: 'Create Building' }));
    await waitFor(() => expect(post).toHaveBeenCalledExactlyOnceWith('/rooms', expect.objectContaining({
      room_code: 'NH-LAB1', building: 'North Hall', room_type: 'laboratory', allow_lecture_usage: true, status: 'not available',
    })));
    expect(await screen.findByText('North Hall')).toBeTruthy();
  });

  it('refuses a new building whose name differs from an existing one only in case or spacing', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    await screen.findByText('Main Bldg');
    fireEvent.click(screen.getByRole('button', { name: 'Add Building' }));
    const form = within(document.getElementById('room-form')!);
    fireEvent.change(form.getByPlaceholderText(/NEE Building/), { target: { value: ' main   BLDG' } });
    expect(form.getByText(/A building named .Main Bldg. already exists/)).toBeTruthy();
  });

  it('groups rooms whose building names differ only in case or spacing', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/initial-data' ? {
      rooms: [
        { id: 1, room_code: 'MB-101', building: 'Main Bldg', room_type: 'lecture', status: 'available', department_id: 1 },
        { id: 2, room_code: 'MB-102', building: ' main  bldg ', room_type: 'lecture', status: 'available', department_id: 1 },
      ],
      departments: [{ id: 1, department_name: 'CCS', department_code: 'CCS' }],
      schedules: [],
    } : [] }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Main Bldg'));
    expect(screen.queryByText('main  bldg')).toBeNull();
    expect(screen.getByText('MB-101')).toBeTruthy();
    expect(screen.getByText('MB-102')).toBeTruthy();
  });

  it.each(['vpaa', 'secretary'])('offers room details in both views and no per-room archive for %s users', async (role) => {
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role, department_id: 1 }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Main Bldg'));
    fireEvent.click(screen.getByRole('button', { name: 'List View' }));
    expect(screen.getByRole('button', { name: 'View Room Details' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Archive Room' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Grid View' }));
    expect(screen.getByRole('button', { name: 'View details of LAB-101' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Archive$/ })).toBeNull();
  });

  it('gives only the secretary the Reassign Room Schedule entry point', async () => {
    const view = render(<MemoryRouter><Rooms /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /Reassign Room Schedule/ })).toBeTruthy();
    view.unmount();
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    render(<MemoryRouter><Rooms /></MemoryRouter>);
    await screen.findByText('Main Bldg');
    expect(screen.queryByRole('button', { name: /Reassign Room Schedule/ })).toBeNull();
  });
});
