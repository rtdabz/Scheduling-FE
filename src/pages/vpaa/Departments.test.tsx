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

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('Dean role department scoping', () => {
  it('filters departments to only show the assigned department when logged in as a Dean', async () => {
    sessionStorage.setItem('user', JSON.stringify({
      id: 10,
      name: 'Dean Smith',
      role: 'dean',
      department_id: 2,
      department: { id: 2, department_name: 'College of Information Technology', department_code: 'CIT' }
    }));

    render(<Departments />);

    expect(await screen.findByText('College of Information Technology')).toBeTruthy();
    expect(screen.queryByText('College of Education')).toBeNull();
    expect(screen.queryByText('Add Department')).toBeNull();
  });
});


const LOGO = 'data:image/jpeg;base64,AAAA';

const apiDepartment = (over: Record<string, unknown> & { id: number }) => ({
  department_code: 'CED',
  department_name: 'College of Education',
  logo: null,
  scheduling_profile: 'standard' as const,
  created_at: '2026-06-01T00:00:00.000000Z',
  faculties_count: 4,
  sections_count: 7,
  users: [{ name: 'Dr. Juan dela Cruz', role: 'dean' }],
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
const codeInput = () => screen.getByPlaceholderText('e.g. CIT');

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

  it('shows the code and a specialized-rooms toggle in the detail modal', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('College of Information Technology'));

    expect(screen.getByText('Department code')).toBeTruthy();
    expect(screen.getAllByText('Specialized rooms').length).toBeGreaterThan(0);
    expect(screen.getByRole('switch', { name: 'Use specialized rooms' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Departments scheduling profile toggle', () => {
  it('saves the profile straight from the detail modal', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('College of Education'));
    fireEvent.click(screen.getByRole('switch', { name: 'Use specialized rooms' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][0]).toBe('/departments/1');
    expect(patch.mock.calls[0][1]).toEqual({ scheduling_profile: 'laboratory_enabled' });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Use specialized rooms' }).getAttribute('aria-checked')).toBe('true'));
  });

  it('is no longer on the create form', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    expect(screen.queryByDisplayValue('Standard')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('Departments management takes a typed department code', () => {
  it('sends the typed code, upper-cased, on create', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.change(codeInput(), { target: { value: 'ccs' } });
    fireEvent.click(screen.getByText('Create Department'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({
      department_name: 'College of Computing Studies',
      department_code: 'CCS',
    });
  });

  it('requires a code', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.click(screen.getByText('Create Department'));

    expect(await screen.findByText('Department code is required')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks a code another department already uses', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.change(codeInput(), { target: { value: 'CIT' } });
    fireEvent.click(screen.getByText('Create Department'));

    expect(await screen.findByText('CIT is already used by College of Information Technology.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the API error when an archived department still holds the code', async () => {
    post.mockRejectedValueOnce({
      response: { status: 422, data: { errors: { department_code: ['This code belongs to an existing or archived department.'] } } },
    });
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.change(codeInput(), { target: { value: 'CCS' } });
    fireEvent.click(screen.getByText('Create Department'));

    expect(await screen.findByText('This code belongs to an existing or archived department.')).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('prefills the code when editing and saves changes to it', async () => {
    render(<Departments />);
    await openEditModalFor('College of Education');

    expect((codeInput() as HTMLInputElement).value).toBe('CED');
    fireEvent.change(codeInput(), { target: { value: 'COE' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toMatchObject({ department_name: 'College of Education', department_code: 'COE' });
    expect(patch.mock.calls[0][1]).not.toHaveProperty('scheduling_profile');
  });

  it('does not assign a secretary user as the dean when no dean is assigned', async () => {
    get.mockResolvedValueOnce({
      data: [
        apiDepartment({
          id: 1,
          department_name: 'College of Information Technology',
          department_code: 'CIT',
          users: [{ name: 'Kay Rejoice Waga', role: 'secretary' }],
        }),
      ],
    });

    render(<Departments />);
    fireEvent.click(await screen.findByText('College of Information Technology'));

    expect(await screen.findByText('Department profile')).toBeTruthy();
    expect(screen.getByText(/CIT · Dean/i).textContent).toContain('Not assigned');
    expect(screen.getByText('Kay Rejoice Waga')).toBeTruthy();
  });

  it('shows an alert and prevents submitting when inputting a duplicate department name', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Education' } });

    expect(screen.getByText(/Duplicate detected: A department named “College of Education” already exists/i)).toBeTruthy();
    fireEvent.click(screen.getByText('Create Department'));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText('A department named "College of Education" already exists.')).toBeTruthy();
  });
});


