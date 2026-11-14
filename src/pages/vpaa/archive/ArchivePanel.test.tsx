import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

const { get, post, toast } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('../../../lib/api', () => ({ default: { get, post } }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));

import ArchivePanel from './ArchivePanel';
import ModuleArchiveTabs from './ModuleArchiveTabs';
import { archiveRedirectTarget } from './archiveTypes';
import { clearDataCache } from '../../../lib/dataCache';
import type { ArchiveDetail, ArchiveModule, ArchivePage, ArchiveRecord } from './archiveTypes';

const counts = { users: 0, departments: 0, programs: 0, buildings: 0, rooms: 0, faculties: 0, designations: 0, courses: 0, semesters: 0 };

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

const renderArchive = (entry = '/users?archived=1', module: ArchiveModule = 'users') => render(
  <MemoryRouter initialEntries={[entry]}>
    <ArchivePanel module={module} />
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

describe('Module archive panel', () => {
  it('keeps an unavailable archive actor distinct from the archived account', async () => {
    const account = record();
    const detail: ArchiveDetail = {
      ...account, identity: [], outcome: [], linked: [],
      provenance: {
        archived_at: account.deleted_at, recorded: true,
        actor: { id: 8, name: null, username: null, role: null },
        event: 'user_archived', note: null, reason: null,
      },
    };
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/archives' ? pageOf([account]) : { data: detail } }));
    renderArchive();

    fireEvent.click(await screen.findByRole('button', { name: 'View details for Maria Santos' }, { timeout: 10000 }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Actor unavailable')).toBeTruthy();
    expect(dialog.textContent).not.toContain('@null');
    expect(within(dialog).getByText('Archived by').nextElementSibling?.textContent).toBe('Actor unavailable');
  });

  it('requests server pages from URL state and resets to the first page when a filter changes', async () => {
    get.mockResolvedValue({ data: pageOf([record()]) });
    renderArchive('/users?archived=1&ar_type=users&ar_page=2&ar_q=santos');

    await screen.findByText('Maria Santos');
    expect(get).toHaveBeenLastCalledWith('/archives', { params: expect.objectContaining({ types: ['users'], type: 'users', page: 2, search: 'santos', per_page: 10 }) });
    expect(screen.getByText('@msantos · Secretary')).toBeTruthy();
    expect(screen.getByLabelText('Search')).toHaveProperty('value', 'santos');

    fireEvent.change(screen.getByLabelText('Department'), { target: { value: '1' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/archives', { params: expect.objectContaining({ department_id: '1', page: 1 }) }));
    expect(screen.getByTestId('location').textContent).not.toContain('page=');
    expect(screen.getByTestId('location').textContent).toContain('ar_department=1');
  });

  it('distinguishes an empty archive from filters with no matches', async () => {
    get.mockResolvedValueOnce({ data: pageOf([], { total_archived: 0 }) });
    renderArchive();
    expect(await screen.findByText('Nothing has been archived here')).toBeTruthy();
    cleanup();

    get.mockResolvedValueOnce({ data: pageOf([], { total_archived: 7 }) });
    renderArchive('/users?archived=1&ar_q=zzz');
    expect(await screen.findByText('No records match these filters')).toBeTruthy();
    expect(screen.getByText(/7 archived records exist/)).toBeTruthy();
  });

  it('never lets an older response overwrite a newer query', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    get.mockResolvedValueOnce({ data: pageOf([record({ key: 'rooms:9', id: 9, type: 'rooms', label: 'LAB-201', subtitle: null })]) });
    renderArchive('/facilities?archived=1', 'facilities');

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
    const building = record({
      key: 'buildings:21', id: 21, type: 'buildings', type_label: 'Building', label: 'Annex',
      subtitle: '2 rooms · AN-101, AN-102', status: { label: '2 rooms', tone: 'neutral' }, restore: { state: 'clear', blockers: [] },
    });
    const detail: ArchiveDetail = {
      ...building,
      identity: [{ label: 'Building', value: 'Annex' }],
      outcome: ['Every archived room in the building returns to Facilities.'],
      provenance: { archived_at: building.deleted_at, recorded: false, actor: null, event: null, note: null, reason: null },
      linked: [
        { type: 'rooms', id: 21, label: 'AN-101', archived: true, restores: true, relation: 'Room in this building (restored together)' },
        { type: 'rooms', id: 22, label: 'AN-102', archived: true, restores: true, relation: 'Room in this building (restored together)' },
      ],
    };
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/archives' ? pageOf([building]) : { data: detail } }));
    post.mockResolvedValue({ data: { message: 'Building “Annex” was restored with 2 linked records.', already_restored: false, affected_count: 3, restored: [
      { type: 'buildings', id: 21, label: 'Annex', status: building.status, outcome: [] },
      { type: 'rooms', id: 21, label: 'AN-101', status: null, outcome: [] },
      { type: 'rooms', id: 22, label: 'AN-102', status: null, outcome: [] },
    ] } });
    renderArchive('/facilities?archived=1', 'facilities');

    fireEvent.click(await screen.findByRole('button', { name: 'Restore Annex' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/these 3 records/)).toBeTruthy();
    expect(within(dialog).getByText('AN-102')).toBeTruthy();

    const listCalls = get.mock.calls.filter(([url]) => url === '/archives').length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore 3 records' }));

    expect(await within(dialog).findByText('Building “Annex” was restored with 2 linked records.')).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/archives/buildings/21/restore');
    await waitFor(() => expect(get.mock.calls.filter(([url]) => url === '/archives').length).toBeGreaterThan(listCalls));
    expect(toast.success).toHaveBeenCalledWith('3 records restored', 'Building “Annex” was restored with 2 linked records.');
  });

  it('shows the blockers found at restore time and keeps the investigation open', async () => {
    const room = record({ key: 'rooms:9', id: 9, type: 'rooms', type_label: 'Room', label: 'LAB-201', subtitle: null, status: null });
    const detail = { ...room, identity: [], outcome: ['The room returns to Facilities.'], provenance: { archived_at: null, recorded: false, actor: null, event: null, note: null, reason: null }, linked: [] };
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/archives' ? pageOf([room]) : { data: detail } }));
    post.mockRejectedValue({ response: { status: 422, data: { message: 'This record cannot be restored yet.', blockers: [
      { code: 'unique_conflict', message: 'An active room already uses this room code. Rename or archive it first.' },
    ] } } });
    renderArchive('/facilities?archived=1', 'facilities');

    fireEvent.click(await screen.findByRole('button', { name: 'Restore LAB-201' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Restore record' }));

    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText(/An active room already uses this room code/)).toBeTruthy();
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

  it('keeps the module record types fixed against URL edits and cleared filters', async () => {
    get.mockResolvedValue({ data: pageOf([]) });
    renderArchive('/facilities?archived=1&ar_type=designations&ar_q=lab', 'facilities');

    await waitFor(() => expect(get).toHaveBeenCalled());
    const first = get.mock.calls.at(-1)?.[1]?.params;
    expect(first.types).toEqual(['buildings', 'rooms']);
    expect(first.type).toBeUndefined();

    fireEvent.click(await screen.findByRole('button', { name: /Clear filters/ }));
    await waitFor(() => expect(get.mock.calls.at(-1)?.[1]?.params.search).toBeUndefined());
    expect(get.mock.calls.at(-1)?.[1]?.params.types).toEqual(['buildings', 'rooms']);
    expect([...(screen.getByLabelText('Record type') as HTMLSelectElement).options].map((option) => option.value)).toEqual(['', 'buildings', 'rooms']);
  });
});

describe('Module archive tabs', () => {
  const storeRole = (role: string) => localStorage.setItem('user', JSON.stringify({ id: 1, role }));
  afterEach(() => localStorage.clear());

  it('shows the Archived tab with a module-specific count to the VPAA only', async () => {
    storeRole('vpaa');
    get.mockResolvedValue({ data: pageOf([], { counts: { departments: 2, programs: 1 }, total_archived: 3 }) });
    render(<MemoryRouter initialEntries={['/departments']}><ModuleArchiveTabs module="departments" activeLabel="Departments & programs"><p>Live departments</p></ModuleArchiveTabs><LocationProbe /></MemoryRouter>);

    expect(screen.getByText('Live departments')).toBeTruthy();
    expect(await screen.findByRole('tab', { name: 'Archived (3)' })).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/archives', { params: { types: ['departments', 'programs'], per_page: 10 } });
    fireEvent.click(screen.getByRole('tab', { name: 'Archived (3)' }));
    expect(screen.getByTestId('location').textContent).toContain('archived=1');
    expect(await screen.findByText('Archived departments & programs')).toBeTruthy();
    expect(screen.queryByText('Live departments')).toBeNull();
    cleanup();

    storeRole('secretary');
    get.mockClear();
    render(<MemoryRouter initialEntries={['/secretary/curriculum?archived=1']}><ModuleArchiveTabs module="curriculum" activeLabel="Curricula"><p>Live curricula</p></ModuleArchiveTabs></MemoryRouter>);
    expect(screen.getByText('Live curricula')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('redirects former Archive links to the owning module', () => {
    expect(archiveRedirectTarget('?type=rooms&q=lab')).toBe('/facilities?archived=1&ar_q=lab&ar_type=rooms');
    expect(archiveRedirectTarget('?type=programs')).toBe('/departments?archived=1&ar_type=programs');
    expect(archiveRedirectTarget('?type=schedule-splits')).toBe('/schedules/approval');
    expect(archiveRedirectTarget('?type=schedules&q=it')).toBe('/schedules/approval');
    expect(archiveRedirectTarget('?type=semesters')).toBe('/settings?archived=1&ar_type=semesters');
    expect(archiveRedirectTarget('?type=courses')).toBe('/curriculum/archived-courses?ar_type=courses');
    expect(archiveRedirectTarget('')).toBe('/users?archived=1');
  });
});
