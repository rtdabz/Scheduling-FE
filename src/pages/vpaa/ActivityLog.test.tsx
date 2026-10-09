import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';

const { get } = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  default: {
    get,
    post: vi.fn(),
  },
}));

import ActivityLog from './ActivityLog';

afterEach(() => {
  cleanup();
});

describe('ActivityLog component', () => {
  beforeEach(() => {
    get.mockImplementation((url: string) => {
      if (url === '/departments') {
        return Promise.resolve({
          data: [{ id: 1, department_code: 'CCS', department_name: 'College of Computer Studies' }],
        });
      }
      if (url === '/semesters') {
        return Promise.resolve({
          data: [{ id: 1, academic_year: '2026-2027', semester: '1st Semester' }],
        });
      }
      if (url === '/activity-log') {
        return Promise.resolve({
          data: {
            data: [
              {
                id: 'evt-1',
                source: 'scheduling',
                category: 'scheduling',
                event: 'schedule_created',
                status: 'completed',
                occurred_at: '2026-10-03T10:00:00Z',
                actor: { id: 1, name: 'Kyle Vestal', username: 'kvestal', role: 'vpaa' },
                department_id: 1,
                semester_id: 1,
                target: { type: 'schedule', id: 10 },
                metadata: {},
              },
            ],
            meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it('renders table with Event and Actor columns, and does not render Event, Actor, or Academic Term filter dropdowns', async () => {
    render(<ActivityLog />);

    // Filter dropdowns that should be present
    expect(await screen.findByRole('combobox', { name: 'Category' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Department' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDefined();

    // Removed filter dropdowns should NOT exist
    expect(screen.queryByRole('combobox', { name: 'Event' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Actor' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Academic term' })).toBeNull();

    // Table columns should still show Event and Actor
    expect(screen.getByRole('columnheader', { name: /Event/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /Actor/i })).toBeDefined();

    // Log entry data rendered
    expect(await screen.findByText('Kyle Vestal')).toBeDefined();
    expect(screen.getByText('Schedule Created')).toBeDefined();
  });
});
