import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const { get, post } = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue({ data: [] }),
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
  }),
}));

vi.mock('../../hooks/useWorkflowGuide', () => ({
  useWorkflowGuide: vi.fn(),
}));

import Rooms from './Rooms';
import { clearDataCache } from '../../lib/dataCache';

afterEach(() => {
  cleanup();
});

describe('Rooms component', () => {
  beforeEach(() => {
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
                status: 'available',
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
});
