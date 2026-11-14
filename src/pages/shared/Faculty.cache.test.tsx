import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { clearDataCache, getCachedData, isCacheFresh, loadCachedData, setCachedData } from '../../lib/dataCache';
import type { FacultyDetailsRecord } from '../../components/faculty/FacultyDetailsModal';

const { get, post, remove, warning } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), remove: vi.fn(), warning: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post, delete: remove } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({
  confirm: async () => true, toast: { success: vi.fn(), error: vi.fn(), warning },
}) }));
vi.mock('../../hooks/useWorkflowGuide', () => ({ useWorkflowGuide: vi.fn() }));
vi.mock('../../components/faculty/FacultyListTable', () => ({ default: ({ faculties, canManage, onArchive, onView, onEdit }: {
  faculties: FacultyDetailsRecord[]; canManage: boolean;
  onArchive: (faculty: FacultyDetailsRecord) => void;
  onView: (faculty: FacultyDetailsRecord) => void;
  onEdit: (faculty: FacultyDetailsRecord) => void;
}) => <>{faculties.map(f => <div key={f.id}>
  <button onClick={() => onView(f)}>View cached instructor</button>
  {canManage && <button onClick={() => onEdit(f)}>Edit cached instructor</button>}
  <button onClick={() => onArchive(f)}>Archive cached instructor</button>
</div>)}</> }));
import Faculty from './Faculty';

const department = { id: 1, department_name: 'College of IT', department_code: 'CIT' };
const faculty = { id: 1, first_name: 'Cache', last_name: 'Teacher', middle_name: null,
  honorific_prefix: 'Dr.', credentials: 'PhD', department_id: 1, department, program_id: 1,
  employment_type: 'full-time', assigned_units: 0, max_units: 21, deload_units: 0, overload_units: 0,
  required_units: 21, unit_ceiling: 21, assigned_subjects: [], assigned_classes: [],
  status: 'active', designations: [], live_schedule_count: 2 };
const pageData = { faculties: [faculty], departments: [department], programs: [] };
const keys = ['scheduler:cached', 'page:instructor-assignments:1', 'dashboard:cached', 'page:departments:cached'];
beforeEach(() => {
  clearDataCache(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  get.mockImplementation(async (url: string) => ({ data: url === '/faculties/1' ? faculty : [] }));
  sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
  setCachedData('page:faculty:vpaa:all:all', pageData);
  keys.forEach(key => setCachedData(key, { stale: true }));
  setCachedData('page:rooms:unrelated', { retained: true });
});

describe('instructor actions by role', () => {
  it.each(['List View', 'Grid View'])('keeps VPAA creation available in %s with no matching instructors', async (view) => {
    render(<MemoryRouter><Faculty /></MemoryRouter>);
    fireEvent.click(screen.getByTitle(view));
    fireEvent.change(screen.getByPlaceholderText('Search instructors by name...'), { target: { value: 'No matching name' } });
    expect(screen.queryByRole('button', { name: 'View cached instructor' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Instructor' }));
    expect(screen.getByRole('dialog', { name: 'Add New Instructor' })).toBeDefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('opens a clean VPAA creation form after editing and posts a new instructor', async () => {
    post.mockResolvedValue({ data: { ...faculty, id: 2, first_name: 'New', last_name: 'Instructor' } });
    render(<MemoryRouter><Faculty /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Edit cached instructor' }));
    expect((screen.getByLabelText('Title') as HTMLSelectElement).value).toBe('Dr.');
    expect((screen.getByLabelText('Credentials / Degrees') as HTMLInputElement).value).toBe('PhD');
    fireEvent.change(screen.getByPlaceholderText('John'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(screen.getByText('First name is required')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add Instructor' }));
    const dialog = screen.getByRole('dialog', { name: 'Add New Instructor' });
    expect((within(dialog).getByPlaceholderText('John') as HTMLInputElement).value).toBe('');
    expect((within(dialog).getByPlaceholderText('Doe') as HTMLInputElement).value).toBe('');
    expect((within(dialog).getByLabelText('Title') as HTMLSelectElement).value).toBe('');
    expect((within(dialog).getByLabelText('Credentials / Degrees') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText('First name is required')).toBeNull();
    const departmentSelect = within(dialog).getByRole('option', { name: `${department.department_code} - ${department.department_name}` }).closest('select')!;
    expect(departmentSelect.value).toBe('');
    fireEvent.change(within(dialog).getByPlaceholderText('John'), { target: { value: 'New' } });
    fireEvent.change(within(dialog).getByPlaceholderText('Doe'), { target: { value: 'Instructor' } });
    fireEvent.change(departmentSelect, { target: { value: '1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Instructor' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/faculties', expect.objectContaining({
      first_name: 'New', last_name: 'Instructor', honorific_prefix: null, credentials: null,
      department_id: 1, employment_type: 'full-time', max_units: 21,
    })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it.each([
    { role: 'vpaa', permissions: ['schedule.assign_instructor'], added: false, canEdit: false },
    { role: 'vpaa', permissions: ['schedule.assign_instructor'], added: true, canEdit: false },
    { role: 'secretary', permissions: ['schedule.assign_instructor'], added: false, canEdit: true },
    { role: 'secretary', permissions: [], added: false, canEdit: false },
    { role: 'director', permissions: ['schedule.assign_instructor'], added: false, canEdit: true },
    { role: 'program_head', permissions: ['schedule.assign_instructor'], added: true, canEdit: true },
    { role: 'dean', permissions: ['schedule.view'], added: false, canEdit: false },
  ])('shows availability controls for $role with added=$added, canEdit=$canEdit', async ({ role, permissions, added, canEdit }) => {
    const programId = role === 'program_head' ? 1 : undefined;
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role, permissions, program_id: programId }));
    setCachedData(`page:faculty:${role}:all:${programId ?? 'all'}`, pageData);
    get.mockImplementation(async (url: string) => ({ data: url.endsWith('/availabilities') ? {
      availabilities: added ? [{ day_index: 5, start_time: '07:00', end_time: '09:00' }] : [],
      standard_availabilities: [{ day_index: 0, start_time: '07:00', end_time: '20:30' }],
    } : url === '/faculties/1' ? faculty : [] }));
    render(<MemoryRouter><Faculty /></MemoryRouter>);
    if (role !== 'vpaa') expect(screen.queryByRole('button', { name: 'Add Instructor' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View cached instructor' }));
    await screen.findByText('Default full-time hours');
    const editButton = screen.queryByRole('button', { name: /Add window|Edit added windows/ });
    expect(Boolean(editButton)).toBe(canEdit);
    if (added) expect(screen.getByText('Added windows')).toBeDefined();
  });
});
afterEach(cleanup);
describe('faculty mutation cache propagation', () => {
  it('clears connected warm pages after archiving and describes retained assignments', async () => {
    remove.mockResolvedValue({ data: { released_schedule_count: 2 } });
    render(<MemoryRouter><Faculty /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Archive cached instructor'));
    await waitFor(() => expect(warning).toHaveBeenCalled());
    keys.forEach(key => expect(isCacheFresh(key)).toBe(false));
    const reload = vi.fn().mockResolvedValue({ fresh: true });
    expect(await loadCachedData(keys[0], reload)).toEqual({ fresh: true });
    expect(reload).toHaveBeenCalledOnce();
    expect(getCachedData('page:rooms:unrelated')).toEqual({ retained: true });
    expect(warning.mock.calls[0][1]).toContain('preserved for restoration');
    expect(screen.queryByText('Archive cached instructor')).toBeNull();
  });
  it('retains warm pages and the instructor when the write fails', async () => {
    remove.mockRejectedValue(new Error('Failed'));
    render(<MemoryRouter><Faculty /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Archive cached instructor'));
    await waitFor(() => expect(remove).toHaveBeenCalled());
    keys.forEach(key => expect(getCachedData(key)).toEqual({ stale: true }));
    expect(screen.getByText('Archive cached instructor')).toBeDefined();
  });
});
