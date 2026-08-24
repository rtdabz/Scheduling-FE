import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above the module body, so the spies have to be
// hoisted with them rather than declared as plain top-level consts.
const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post, patch, delete: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }),
}));

import Departments from './Departments';
import { clearDataCache } from '../../lib/dataCache';

afterEach(cleanup);

const LOGO = 'data:image/jpeg;base64,AAAA';

const apiDepartment = (over: Record<string, unknown> & { id: number }) => ({
  department_code: 'CED',
  department_name: 'College of Education',
  logo: null,
  scheduling_profile: 'standard' as const,
  created_at: '2026-06-01T00:00:00.000000Z',
  faculties_count: 4,
  sections_count: 7,
  users: [{ name: 'Dr. Juan dela Cruz' }],
  ...over,
});

const departments = [
  apiDepartment({ id: 1 }),
  apiDepartment({
    id: 2,
    department_code: 'CIT',
    department_name: 'College of Information Technology',
    logo: LOGO,
    scheduling_profile: 'laboratory_enabled',
  }),
];

const nameInput = () => screen.getByPlaceholderText('e.g. College of Computing Studies');

/** Reaches the edit form the way a user does: row -> detail modal -> Edit. */
const openEditModalFor = async (departmentName: string) => {
  fireEvent.click(await screen.findByText(departmentName));
  fireEvent.click(screen.getByText('Edit Department'));
};

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  get.mockResolvedValue({ data: departments });
  post.mockImplementation((_url: string, payload: Record<string, unknown>) =>
    Promise.resolve({ data: apiDepartment({ id: 3, ...payload }) }));
  patch.mockImplementation((_url: string, payload: Record<string, unknown>) =>
    Promise.resolve({ data: apiDepartment({ id: 1, ...payload }) }));
});

describe('Departments management identifies departments by logo', () => {
  it('replaces the code column with a logo column', async () => {
    render(<Departments />);

    expect(await screen.findByText('Logo')).toBeTruthy();
    expect(screen.queryByText('Code')).toBeNull();
    expect(screen.queryByText('CED')).toBeNull();
    expect(screen.queryByText('CIT')).toBeNull();
  });

  it('shows the uploaded logo, and a placeholder for departments without one', async () => {
    render(<Departments />);

    const uploaded = await screen.findByAltText('College of Information Technology logo');
    expect(uploaded.getAttribute('src')).toBe(LOGO);
    expect(screen.getByLabelText('College of Education — no logo uploaded')).toBeTruthy();
  });

  it('reports the scheduling profile instead of the code in the detail modal', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('College of Information Technology'));

    expect(screen.queryByText('Department Code')).toBeNull();
    expect(screen.getAllByText('Scheduling Profile').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Laboratory-enabled').length).toBeGreaterThan(0);
  });
});

describe('Departments management derives the code that other pages still show', () => {
  it('has no code input, and derives the code from the name on create', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    expect(screen.queryByPlaceholderText('e.g. CCS')).toBeNull();

    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.click(screen.getByText('Create Department'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({
      department_name: 'College of Computing Studies',
      department_code: 'CCS',
    });
  });

  it('sidesteps a code already in use', async () => {
    get.mockResolvedValue({
      data: [...departments, apiDepartment({ id: 3, department_code: 'CCS', department_name: 'Center for Community Service' })],
    });
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.click(screen.getByText('Create Department'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ department_code: 'CCS2' });
  });

  it('retries when the API rejects the derived code, which soft-deleted rows still reserve', async () => {
    post.mockRejectedValueOnce({
      response: { status: 422, data: { errors: { department_code: ['The department code has already been taken.'] } } },
    });
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.click(screen.getByText('Create Department'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[0][1]).toMatchObject({ department_code: 'CCS' });
    expect(post.mock.calls[1][1]).toMatchObject({ department_code: 'CCS2' });
  });

  it('re-derives the code when the department is renamed', async () => {
    render(<Departments />);
    await openEditModalFor('College of Education');

    fireEvent.change(nameInput(), { target: { value: 'College of Engineering' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toMatchObject({
      department_name: 'College of Engineering',
      department_code: 'CE',
    });
  });

  it('leaves a hand-picked code alone when the name is untouched', async () => {
    render(<Departments />);
    await openEditModalFor('College of Education');

    fireEvent.change(screen.getByDisplayValue('Standard'), { target: { value: 'laboratory_enabled' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toMatchObject({ scheduling_profile: 'laboratory_enabled' });
    expect(patch.mock.calls[0][1]).not.toHaveProperty('department_code');
  });
});
