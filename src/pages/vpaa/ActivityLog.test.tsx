import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import { MemoryRouter } from 'react-router-dom';
import ActivityLog from './ActivityLog';
import { clearDataCache } from '../../lib/dataCache';

afterEach(() => {
  cleanup();
});

describe('ActivityLog component', () => {
  beforeEach(() => {
    clearDataCache();
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

  it('shows an unavailable actor without an empty username in event details', async () => {
    get.mockImplementation((url: string) => Promise.resolve(url === '/activity-log' ? {
      data: {
        data: [{
          id: 'scheduling:10', source: 'scheduling', category: 'scheduling', event: 'schedule_created', status: 'completed',
          occurred_at: '2026-11-01T10:00:00Z', actor: { id: 8, name: null, username: null, role: null }, actor_type: 'unknown',
          department_id: null, semester_id: null, target: { type: 'schedule', id: 42 }, metadata: {},
        }],
        meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
      },
    } : { data: [] }));

    render(<MemoryRouter><ActivityLog /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Schedule Created'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Actor unavailable')).toBeTruthy();
    expect(dialog.textContent).not.toContain('()');
    expect(dialog.textContent).not.toContain('null');
  });

  it('renders the toolbar with category, department, actor, role and status filters plus keyword search', async () => {
    render(<MemoryRouter><ActivityLog /></MemoryRouter>);

    expect(await screen.findByRole('combobox', { name: 'Category' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Department' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Actor' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDefined();
    expect(screen.getByRole('searchbox', { name: 'Search activity' })).toBeDefined();
    expect(screen.queryByRole('combobox', { name: 'Event' })).toBeNull();

    expect(screen.getByRole('columnheader', { name: /Event/i })).toBeDefined();
    expect(screen.getByRole('columnheader', { name: /Actor/i })).toBeDefined();
    expect(await screen.findByText('Kyle Vestal')).toBeDefined();
    expect(screen.getByText('Schedule Created')).toBeDefined();
  });

  it('sends applied filters with every page request and keeps them while paging', async () => {
    get.mockImplementation((url: string) => Promise.resolve(url === '/activity-log' ? {
      data: {
        data: [],
        meta: {
          current_page: 1, per_page: 25, total: 60, last_page: 3,
          summary: { total: 60, approved: 4, returned: 1, rejected: 2, failed: 0, actors: 7 },
          facets: { actors: [{ id: 5, name: 'Dean Recorded', username: 'dean', role: 'dean' }] },
        },
      },
    } : { data: [] }));

    render(<MemoryRouter><ActivityLog /></MemoryRouter>);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Role' }), { target: { value: 'dean' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search activity' }), { target: { value: 'approved' } });
    expect(screen.getByText('You have changes that are not applied yet.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Apply filters/ }));

    await waitFor(() => expect(get).toHaveBeenCalledWith('/activity-log', { params: { page: 1, per_page: 10, search: 'approved', role: 'dean' } }));
    expect(await screen.findByRole('option', { name: 'Dean Recorded — Dean' })).toBeDefined();
    expect(screen.getByText('Role: Dean')).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Activity summary' })).getByText('7')).toBeDefined();

    await waitFor(() => expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/activity-log', { params: { page: 2, per_page: 10, search: 'approved', role: 'dean' } }));
  });

  it('distinguishes Dean and VPAA approval stages', async () => {
    get.mockImplementation((url: string) => Promise.resolve(url === '/activity-log' ? {
      data: {
        data: ['schedule_approved_by_dean', 'schedule_approved_by_vpaa'].map((event, index) => ({
          id: `scheduling:${index}`, source: 'scheduling', category: 'approval', event, status: 'approved',
          occurred_at: '2026-11-01T10:00:00Z', actor: { id: 1, name: 'Kyle Vestal', username: 'kvestal', role: 'vpaa' },
          department_id: null, semester_id: null, target: { type: 'schedule_workflow', id: null }, metadata: {},
        })),
        meta: { current_page: 1, per_page: 25, total: 2, last_page: 1 },
      },
    } : { data: [] }));

    render(<MemoryRouter><ActivityLog /></MemoryRouter>);
    expect(await screen.findByText('Schedule Approved by Dean')).toBeDefined();
    expect(screen.getByText('Schedule Approved by VPAA')).toBeDefined();
  });

  it('shows recorded previous and new values in the detail drawer', async () => {
    get.mockImplementation((url: string) => Promise.resolve(url === '/activity-log' ? {
      data: {
        data: [{
          id: 'authentication:3', source: 'authentication', category: 'account_access', event: 'user_updated', status: 'completed',
          occurred_at: '2026-11-01T10:00:00Z', actor: { id: 1, name: 'Kyle Vestal', username: 'kvestal', role: 'vpaa', provenance: 'recorded' },
          department_id: null, semester_id: null, target: { type: 'user', id: 9 },
          metadata: { before: { name: 'Ana Cruz', role: 'dean' }, after: { name: 'Ana Cruz', role: 'program_head' } },
        }],
        meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
      },
    } : { data: [] }));

    render(<MemoryRouter><ActivityLog /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Account Updated'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Previous')).toBeDefined();
    expect(within(dialog).getByText('dean')).toBeDefined();
    expect(within(dialog).getByText('program_head')).toBeDefined();
    expect(within(dialog).queryByText('Name')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('labels a restore by the restored entity and category instead of scheduling', async () => {
    get.mockImplementation((url: string) => Promise.resolve(url === '/activity-log' ? {
      data: {
        data: [{
          id: 'scheduling:9', source: 'scheduling', category: 'account_access', event: 'record_restored', status: 'completed',
          occurred_at: '2026-11-01T10:00:00Z', actor: { id: 1, name: 'Kyle Vestal', username: 'kvestal', role: 'vpaa' },
          department_id: 1, semester_id: null, target: { type: 'user', id: 42 }, metadata: { type: 'users', id: 42, label: 'Maria Santos' },
        }],
        meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
      },
    } : { data: [] }));

    render(<MemoryRouter><ActivityLog /></MemoryRouter>);

    expect(await screen.findByText('Account Restored')).toBeDefined();
    expect(screen.getByText('Account & Access', { selector: 'span' })).toBeDefined();
    fireEvent.click(screen.getByText('Account Restored'));
    expect(within(await screen.findByRole('dialog')).getByText('Account #42 — Maria Santos')).toBeDefined();
  });
});
