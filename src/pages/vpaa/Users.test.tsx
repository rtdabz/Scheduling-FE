import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, toastError } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toastError: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    toast: { success: vi.fn(), error: toastError, warning: vi.fn(), info: vi.fn() },
    confirm: vi.fn(),
  }),
}));

import VpaaUsers from './Users';
import { clearDataCache } from '../../lib/dataCache';

const department = { id: 1, department_name: 'College of Computer Studies', department_code: 'CCS', logo: null };
const program = { id: 7, department_id: 1, major: null, code: 'BSIT', name: 'BS Information Technology' };
const rosterInstructor = {
  id: 5, first_name: 'Maria', middle_name: null, last_name: 'Santos',
  employment_type: 'full-time', max_units: 24, program_id: null, status: 'active',
};

const createdUser = (payload: Record<string, unknown>) => ({
  id: 99, name: 'Created', username: 'ccsdean', email: payload.email, role: payload.role,
  department_id: 1, department, is_active: true, created_at: '2026-11-07T00:00:00Z',
});

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  toastError.mockReset();
  get.mockImplementation((url: string) => {
    const data: Record<string, unknown> = {
      '/user': [],
      '/departments': [department],
      '/programs': [program],
      '/user/linkable-faculty': [rosterInstructor],
      '/user/instructor-defaults': { default_max_units: 18 },
    };
    return Promise.resolve({ data: data[url] ?? [] });
  });
  post.mockImplementation((_url: string, payload: Record<string, unknown>) =>
    Promise.resolve({ data: { data: createdUser(payload) } }));
});

afterEach(cleanup);

const openCreateModal = async () => {
  render(<VpaaUsers />);
  fireEvent.click(await screen.findByText('Add User'));
  await screen.findByText('Create New Account');
};

const fillAccount = ({ first = 'Ana', last = 'Reyes', role = 'Secretary' } = {}) => {
  fireEvent.change(screen.getByLabelText(/Last Name/), { target: { value: last } });
  fireEvent.change(screen.getByLabelText(/First Name/), { target: { value: first } });
  fireEvent.change(screen.getByLabelText(/Institutional Email/), { target: { value: 'person@school.edu.ph' } });
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: role } });
  fireEvent.change(screen.getByLabelText(/Assigned Department/), { target: { value: '1' } });
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

describe('Create New Account teaching profile', () => {
  it('has no non-teaching option and lets a Secretary skip the instructor record', async () => {
    await openCreateModal();
    fillAccount();

    expect(screen.queryByText(/Non-teaching/i)).toBeNull();
    expect(screen.getByText('Optional')).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Instructor record' })).toBeNull();

    submit();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ role: 'secretary', faculty_mode: 'none', faculty_id: null, designation_ids: [] });
  });

  it('offers both instructor options to a teaching Secretary with the configured load', async () => {
    await openCreateModal();
    fillAccount();

    fireEvent.click(screen.getByLabelText(/also teaches classes/));

    expect(screen.getByLabelText(/Link existing instructor/)).toBeTruthy();
    expect(screen.getByText('Adds a full-time instructor with a 18-unit load.')).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Create new instructor profile/));
    submit();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ faculty_mode: 'create', faculty_id: null });
  });

  it('requires a Dean to link or create, and links through the searchable selector', async () => {
    await openCreateModal();
    fillAccount({ role: 'Dean' });

    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.queryByLabelText(/also teaches classes/)).toBeNull();

    fireEvent.click(screen.getByLabelText(/Link existing instructor/));
    submit();
    expect(await screen.findByText('Select the instructor this account belongs to')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    await waitFor(() => expect((screen.getByRole('button', { name: 'Instructor' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Instructor' }));
    fireEvent.change(screen.getByPlaceholderText('Search by name'), { target: { value: 'sant' } });
    fireEvent.click(screen.getByRole('option', { name: /Santos, Maria/ }));

    submit();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ role: 'dean', faculty_mode: 'link', faculty_id: 5 });
  });

  it('blocks creating a second profile for someone already on the roster', async () => {
    await openCreateModal();
    fillAccount({ first: 'Maria', last: 'Santos', role: 'Program Head' });
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/Program \/ Major/),{ target: { value: '7' } });

    // The name match preselects the existing record.
    await waitFor(() => expect((screen.getByLabelText(/Link existing instructor/) as HTMLInputElement).checked).toBe(true));

    fireEvent.click(screen.getByLabelText(/Create new instructor profile/));
    expect(screen.getByText(/is already on this department's roster/)).toBeTruthy();

    submit();
    expect((await screen.findByRole('alert')).textContent).toMatch(/already on this department's roster/);
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Link instead' }));
    submit();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({ faculty_mode: 'link', faculty_id: 5 });
  });

  it('shows validation errors beside their fields', async () => {
    await openCreateModal();
    submit();

    expect(await screen.findByText('Institutional email is required')).toBeTruthy();
    expect(screen.getByText('Last name is required')).toBeTruthy();
    expect(screen.getByText('Department assignment is required')).toBeTruthy();

    post.mockRejectedValueOnce({
      response: { data: { message: 'The email has already been taken.', errors: { email: ['The email has already been taken.'] } } },
    });
    fillAccount();
    submit();

    expect(await screen.findByText('The email has already been taken.')).toBeTruthy();
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.getByText('Create New Account')).toBeTruthy();
  });
});
