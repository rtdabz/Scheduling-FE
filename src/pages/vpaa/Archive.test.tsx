import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

const { get, post, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('../../lib/api', () => ({ default: { get, post } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));

import Archive from './Archive';
import { clearDataCache } from '../../lib/dataCache';
import type { ArchiveDetail, ArchivePage, ArchiveRecord } from './archive/archiveTypes';

const counts = { users: 0, departments: 0, programs: 0, rooms: 0, faculties: 0, designations: 0, courses: 0, semesters: 0, schedules: 0, 'schedule-splits': 0 };

const record = (over: Partial<ArchiveRecord> = {}): ArchiveRecord => ({
  key: 'users:5',
  id: 5,
  type: 'users',
  type_label: 'Account',
  label: 'Maria Santos',
  subtitle: '@msantos · Secretary',
  context: { department: { id: 1, code: 'CBA', name: 'Business', archived: false }, program: null, term: null },
  status: { label: 'Inactive account', tone: 'inactive' },
  deleted_at: '2026-10-01T08:00:00+08:00',
  restore: { state: 'clear', blockers: [] },
  ...over,
});

const pageOf = (data: ArchiveRecord[], over: Partial<ArchivePage> = {}): ArchivePage => ({
  data,
  meta: { current_page: 1, per_page: 25, total: data.length, last_page: 1, from: data.length ? 1 : 0, to: data.length },
  counts: { ...counts, users: data.length },
  total_archived: data.length,
  options: { departments: [{ id: 1, code: 'CBA', name: 'Business', archived: false }], programs: [], semesters: [] },
  checked_at: '2026-11-01T09:00:00+08:00',
  ...over,
});

function LocationProbe() {
  return <output data-testid="location">{useLocation().search}</output>;
}

const renderArchive = (entry = '/archive') => render(
  <MemoryRouter initialEntries={[entry]}>
    <Archive />
    <LocationProbe />
  </MemoryRouter>,
);

beforeEach(() => {
  clearDataCache();
  get.mockReset();
  post.mockReset();
  Object.values(toast).forEach((fn) => fn.mockReset());
});

afterEach(() => cleanup());

describe('VPAA Archive', () => {
  it('requests server pages from URL state and resets to the first page when a filter changes', async () => {
    get.mockResolvedValue({ data: pageOf([record()]) });
    renderArchive('/archive?type=users&page=2&q=santos');

    await screen.findByText('Maria Santos');
    expect(get).toHaveBeenLastCalledWith('/archives', { params: expect.objectContaining({ type: 'users', page: 2, search: 'santos', per_page: 25 }) });
    expect(screen.getByText('@msantos · Secretary')).toBeTruthy();
    expect(screen.getByLabelText('Search')).toHaveProperty('value', 'santos');

    fireEvent.change(screen.getByLabelText('Department'), { target: { value: '1' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/archives', { params: expect.objectContaining({ department_id: '1', page: 1 }) }));
    expect(screen.getByTestId('location').textContent).not.toContain('page=');
    expect(screen.getByTestId('location').textContent).toContain('department=1');
  });

  it('distinguishes an empty archive from filters with no matches', async () => {
    get.mockResolvedValueOnce({ data: pageOf([], { total_archived: 0 }) });
    renderArchive();
    expect(await screen.findByText('Nothing has been archived')).toBeTruthy();
    cleanup();

    get.mockResolvedValueOnce({ data: pageOf([], { total_archived: 7 }) });
    renderArchive('/archive?q=zzz');
    expect(await screen.findByText('No records match these filters')).toBeTruthy();
    expect(screen.getByText(/7 archived records exist/)).toBeTruthy();
  });

  it('never lets an older response overwrite a newer query', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    get.mockResolvedValueOnce({ data: pageOf([record({ key: 'rooms:9', id: 9, type: 'rooms', label: 'LAB-201', subtitle: null })]) });
    renderArchive();

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Record type'), { target: { value: 'rooms' } });
    expect(await screen.findByText('LAB-201')).toBeTruthy();

    await act(async () => resolveOld({ data: pageOf([record({ label: 'Stale Result' })]) }));
    expect(screen.queryByText('Stale Result')).toBeNull();
    expect(screen.getByText('LAB-201')).toBeTruthy();
  });

  it('keeps loaded results with a warning when a refresh fails', async () => {
    get.mockResolvedValueOnce({ data: pageOf([record()]) });
    renderArchive();
    await screen.findByText('Maria Santos');

    get.mockRejectedValueOnce({ config: { method: 'get' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(await screen.findByText(/Couldn’t refresh/)).toBeTruthy();
    expect(screen.getByText('Maria Santos')).toBeTruthy();
  });

  it('confirms every linked record, restores, and reloads the list from the server', async () => {
    const schedule = record({
      key: 'schedules:11', id: 11, type: 'schedules', type_label: 'Class schedule', label: 'IT 101 · BSIT 1A · Monday 08:00-09:00 · LAB-1',
      subtitle: null, status: { label: 'Stage: Draft', tone: 'neutral' }, restore: { state: 'validation', blockers: [] },
    });
    const detail: ArchiveDetail = {
      ...schedule,
      identity: [{ label: 'Course', value: 'IT 101' }],
      outcome: ['The class returns to the live timetable at its archived approval stage after current scheduling rules and conflicts are checked.'],
      provenance: { archived_at: schedule.deleted_at, recorded: false, actor: null, event: null, note: null, reason: null },
      linked: [
        { type: 'schedules', id: 12, label: 'IT 101 · BSIT 1A · Tuesday 08:00-09:00 · LAB-1', archived: true, restores: true, relation: 'Restored together (required meeting pattern)' },
        { type: 'schedule-splits', id: 3, label: 'Meeting of IT 101', archived: true, restores: true, relation: 'Split metadata restored with its class' },
      ],
    };
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/archives' ? pageOf([schedule]) : { data: detail } }));
    post.mockResolvedValue({ data: { message: 'Class schedule restored with 2 linked records.', already_restored: false, affected_count: 3, restored: [
      { type: 'schedules', id: 11, label: schedule.label, status: schedule.status, outcome: [] },
      { type: 'schedules', id: 12, label: 'Tuesday class', status: schedule.status, outcome: [] },
      { type: 'schedule-splits', id: 3, label: 'Meeting of IT 101', status: null, outcome: [] },
    ] } });
    renderArchive();

    fireEvent.click(await screen.findByRole('button', { name: `Restore ${schedule.label}` }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/these 3 records/)).toBeTruthy();
    expect(within(dialog).getByText('Meeting of IT 101')).toBeTruthy();
    expect(within(dialog).getByText(/checked when you confirm/)).toBeTruthy();

    const listCalls = get.mock.calls.filter(([url]) => url === '/archives').length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore 3 records' }));

    expect(await within(dialog).findByText('Class schedule restored with 2 linked records.')).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/archives/schedules/11/restore');
    await waitFor(() => expect(get.mock.calls.filter(([url]) => url === '/archives').length).toBeGreaterThan(listCalls));
    expect(toast.success).toHaveBeenCalledWith('3 records restored', 'Class schedule restored with 2 linked records.');
  });

  it('shows every scheduling violation and keeps the investigation open when a restore fails', async () => {
    const schedule = record({ key: 'schedules:11', id: 11, type: 'schedules', label: 'IT 101 class', restore: { state: 'validation', blockers: [] } });
    const detail = { ...schedule, identity: [], outcome: ['Returns to the timetable.'], provenance: { archived_at: null, recorded: false, actor: null, event: null, note: null, reason: null }, linked: [] };
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/archives' ? pageOf([schedule]) : { data: detail } }));
    post.mockRejectedValue({ response: { status: 422, data: { message: 'This class cannot be restored because it would conflict with the current timetable.', code: 'schedule_violations', violations: [
      { rule: 'room_conflict', message: 'LAB-1 is already used on Monday 08:00-09:00.' },
      { rule: 'faculty_conflict', message: 'The instructor already teaches on Monday 08:00-09:00.' },
    ] } } });
    renderArchive();

    fireEvent.click(await screen.findByRole('button', { name: 'Restore IT 101 class' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Restore record' }));

    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText('2 scheduling violations:')).toBeTruthy();
    expect(within(alert).getByText('LAB-1 is already used on Monday 08:00-09:00.')).toBeTruthy();
    expect(within(alert).getByText('The instructor already teaches on Monday 08:00-09:00.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Review restore/ })).toBeTruthy();
  });

  it('explains blockers, links to the archived parent, and says an inactive account stays inactive', async () => {
    const account = record({ restore: { state: 'blocked', blockers: [{ code: 'archived_parent', message: 'Restore the CBA department from Archives first.', record: { type: 'departments', id: 1, label: 'Business', archived: true } }] } });
    const accountDetail: ArchiveDetail = {
      ...account,
      identity: [{ label: 'Username', value: 'msantos' }],
      outcome: ['The account returns to Users but stays inactive. It cannot sign in until it is activated from Users.'],
      provenance: { archived_at: account.deleted_at, recorded: true, actor: { id: 1, name: 'Demo VPAA', username: 'vpaa.demo', role: 'vpaa' }, event: 'user_archived', note: null, reason: null },
      linked: [],
    };
    const departmentDetail: ArchiveDetail = { ...accountDetail, key: 'departments:1', id: 1, type: 'departments', label: 'Business', subtitle: null, status: null, restore: { state: 'clear', blockers: [] }, outcome: ['The department returns to Departments.'], provenance: { ...accountDetail.provenance, recorded: false, actor: null } };
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/archives' ? pageOf([account]) : { data: url.includes('departments') ? departmentDetail : accountDetail } }));
    renderArchive();

    expect((await screen.findAllByText('Blocked')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'View details for Maria Santos' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/stays inactive/)).toBeTruthy();
    expect(within(dialog).getByText('Demo VPAA (@vpaa.demo)')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Review restore/ })).toHaveProperty('disabled', true);

    fireEvent.click(within(dialog).getByRole('button', { name: /View archived department: Business/ }));
    expect(await within(dialog).findByText('The department returns to Departments.')).toBeTruthy();
    expect(within(dialog).getByText(/so who archived it is unknown/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Back to Maria Santos/ }));
    expect(await within(dialog).findByText(/stays inactive/)).toBeTruthy();
  });
});
