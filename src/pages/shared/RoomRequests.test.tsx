import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const { get, post } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock('../../lib/api', () => ({
  default: {
    get,
    post,
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

import RoomRequests from './RoomRequests';
import { clearDataCache } from '../../lib/dataCache';

afterEach(() => {
  cleanup();
});

describe('RoomRequests component', () => {
  beforeEach(() => {
    clearDataCache();
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem('user', JSON.stringify({
      id: 10,
      role: 'secretary',
      department_id: 1, // CAS
      permissions: ['room.request', 'room.review_requests'],
    }));

    get.mockImplementation((url: string) => {
      if (url === '/departments') {
        return Promise.resolve({
          data: [
            { id: 1, department_code: 'CAS', department_name: 'College of Arts and Sciences' },
            { id: 2, department_code: 'CCJPS', department_name: 'College of Criminal Justice' },
          ],
        });
      }
      if (url === '/rooms') {
        return Promise.resolve({
          data: [
            { id: 101, room_code: 'NEE 201', department_id: 1, status: 'available', room_type: 'lecture' },
            { id: 102, room_code: 'BUILDING 9-101', department_id: 2, status: 'available', room_type: 'lecture' },
          ],
        });
      }
      if (url.startsWith('/initial-data')) {
        return Promise.resolve({
          data: {
            schedules: [],
            time_grid: {
              days: ['Monday', 'Tuesday'],
              start_time: '07:00:00',
              end_time: '19:00:00',
              slot_minutes: 30,
            },
          },
        });
      }
      if (url.startsWith('/room-requests')) {
        return Promise.resolve({
          data: [
            {
              id: 1,
              status: 'pending',
              requesting_department: { id: 2, code: 'CCJPS', name: 'CCJPS' },
              owner_department: { id: 1, code: 'CAS', name: 'CAS' },
              room: { id: 101, room_code: 'NEE 201', department_id: 1 },
              windows: [{ day: 'Monday', start_time: '07:00:00', end_time: '08:30:00' }],
            },
            {
              id: 2,
              status: 'pending',
              requesting_department: { id: 1, code: 'CAS', name: 'CAS' },
              owner_department: { id: 2, code: 'CCJPS', name: 'CCJPS' },
              room: { id: 102, room_code: 'BUILDING 9-101', department_id: 2 },
              windows: [{ day: 'Tuesday', start_time: '13:00:00', end_time: '14:30:00' }],
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders a single Requests button with the pending-from-others badge in filter bar', async () => {
    render(
      <MemoryRouter>
        <RoomRequests />
      </MemoryRouter>
    );

    const requestsBtn = await screen.findByRole('button', { name: /Requests/i });
    expect(requestsBtn).toBeDefined();
    await waitFor(() => expect(requestsBtn.textContent).toContain('1'));
  });

  it('opens RequestsModal on Requestor and switches between Requester and Requestor tabs', async () => {
    render(
      <MemoryRouter>
        <RoomRequests />
      </MemoryRouter>
    );

    const requestsBtn = await screen.findByRole('button', { name: /Requests/i });
    fireEvent.click(requestsBtn);

    expect(await screen.findByText('Pending and approved room requests sent to or from your department.')).toBeDefined();

    expect(screen.getByText('NEE 201')).toBeDefined();
    expect(screen.queryByText('BUILDING 9-101')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Requester/i }));
    expect(screen.getByText('BUILDING 9-101')).toBeDefined();
    expect(screen.queryByText('NEE 201')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Requestor/i }));
    expect(screen.getByText('NEE 201')).toBeDefined();
    expect(screen.queryByText('BUILDING 9-101')).toBeNull();

    expect(screen.getByRole('button', { name: /View request for NEE 201/i })).toBeDefined();
  });
});
