import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { clearDataCache, getCachedData, isCacheFresh, loadCachedData, setCachedData } from '../../lib/dataCache';

const { remove, warning } = vi.hoisted(() => ({ remove: vi.fn(), warning: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }), delete: remove } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({
  confirm: async () => true, toast: { success: vi.fn(), error: vi.fn(), warning },
}) }));
vi.mock('../../hooks/useWorkflowGuide', () => ({ useWorkflowGuide: vi.fn() }));
vi.mock('../../components/faculty/FacultyListTable', () => ({ default: ({ faculties, onArchive }: {
  faculties: Array<{ id: number }>; onArchive: (faculty: { id: number }) => void;
}) => <>{faculties.map(f => <button key={f.id} onClick={() => onArchive(f)}>Archive cached instructor</button>)}</> }));
import Faculty from './Faculty';

const keys = ['scheduler:cached', 'page:instructor-assignments:1', 'dashboard:cached', 'page:departments:cached'];
beforeEach(() => {
  clearDataCache(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
  setCachedData('page:faculty:vpaa:all:all', { faculties: [{ id: 1, first_name: 'Cache', last_name: 'Teacher',
    employment_type: 'full-time', assigned_units: 0, max_units: 21, deload_units: 0, overload_units: 0,
    status: 'active', designations: [], live_schedule_count: 2 }], departments: [], programs: [] });
  keys.forEach(key => setCachedData(key, { stale: true }));
  setCachedData('page:rooms:unrelated', { retained: true });
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
