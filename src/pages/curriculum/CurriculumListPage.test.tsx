import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { Curriculum } from '../../types/curriculum';

const role = vi.hoisted(() => ({ current: 'secretary' }));

const curriculum = (id: number, name: string, status: Curriculum['status']) => ({
  id, name, code: `C-${id}`, status, effective_school_year: '2025-2026', courses_count: 0,
  department_id: 1, program_id: 1, created_at: `2025-01-0${id}T00:00:00Z`,
}) as unknown as Curriculum;

const list = [
  curriculum(1, 'Active One', 'active'),
  curriculum(2, 'Active Two', 'active'),
  curriculum(3, 'Deactivated One', 'deactivated'),
  curriculum(4, 'Archived One', 'archived'),
];

vi.mock('../../lib/storedUser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/storedUser')>()),
  getStoredUser: () => ({ role: role.current, department_id: 1, program_id: null }),
  getStoredUserRole: () => role.current,
  getStoredUserDepartmentId: () => 1,
  hasStoredCapability: (capability: string) => capability === 'curriculum.manage' && role.current !== 'vpaa',
}));
vi.mock('../../lib/curriculumAccess', () => ({ canAuthorCurriculum: () => false }));
vi.mock('../../lib/dataCache', () => ({
  getCachedData: () => undefined,
  hasCachedData: () => false,
  loadCachedData: (_key: string, load: () => Promise<unknown>) => load(),
  setCachedData: vi.fn(),
}));
vi.mock('../../services/curriculum/curriculumService', () => ({
  curriculumService: { getCurriculumList: vi.fn(async () => list) },
}));
vi.mock('../../lib/api', () => ({ default: { get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRefresh: vi.fn() }));
vi.mock('../../hooks/useWorkflowGuide', () => ({ useWorkflowGuide: vi.fn() }));
vi.mock('../../components/help/WorkflowGuideButton', () => ({ default: () => null }));
// A stable toast, like the real context's, so the data loader is not recreated on every render.
const toastContext = vi.hoisted(() => ({ toast: { success: () => {}, error: () => {}, info: () => {} }, confirm: () => {} }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toastContext }));

import CurriculumListPage from './CurriculumListPage';

const renderPage = () => render(<MemoryRouter><CurriculumListPage /></MemoryRouter>);
const statusButton = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}\\s*\\d+$`, 'i') });

afterEach(() => {
  cleanup();
  role.current = 'secretary';
});

describe('Secretary curriculum status buttons', () => {
  it('shows only Active and Deactivated with counts, opening on Active', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByText('Active One')).toBeTruthy());
    expect(within(statusButton('Active')).getByText('2')).toBeTruthy();
    expect(within(statusButton('Deactivated')).getByText('1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Archived\s*\d+$/i })).toBeNull();
    expect(screen.queryByRole('option', { name: 'All Status' })).toBeNull();
    expect(screen.getByText('Active Two')).toBeTruthy();
    expect(screen.queryByText('Deactivated One')).toBeNull();
  });

  it('switches the listed curricula when a status is selected', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Active One')).toBeTruthy());

    fireEvent.click(statusButton('Deactivated'));
    expect(screen.getByText('Deactivated One')).toBeTruthy();
    expect(screen.queryByText('Active One')).toBeNull();
    expect(screen.queryByText('Archived One')).toBeNull();

    fireEvent.click(statusButton('Active'));
    expect(screen.getByText('Active One')).toBeTruthy();
    expect(screen.queryByText('Deactivated One')).toBeNull();
  });

  it('keeps the status dropdown for other curriculum managers', async () => {
    role.current = 'program_head';
    renderPage();
    await waitFor(() => expect(screen.getByText('Active One')).toBeTruthy());

    expect(screen.getByRole('option', { name: 'All Status' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Active\s*\d+$/i })).toBeNull();
    expect(screen.getByText('Deactivated One')).toBeTruthy();
  });

  it('leaves the VPAA view with all three status buttons', async () => {
    role.current = 'vpaa';
    renderPage();
    await waitFor(() => expect(screen.getByText('Active One')).toBeTruthy());

    expect(statusButton('Active')).toBeTruthy();
    expect(statusButton('Deactivated')).toBeTruthy();
    expect(within(statusButton('Archived')).getByText('1')).toBeTruthy();
  });
});
