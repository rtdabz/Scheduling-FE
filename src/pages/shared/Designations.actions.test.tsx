import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../../lib/dataCache';
import { emptyDesignation, type Designation } from '../../lib/designations';
import Designations from './Designations';

const { get, post, toast } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../lib/api', () => ({ default: { get, post } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast }) }));

const parent: Designation = { ...emptyDesignation(), id: 1, name: 'Director', children_count: 0, faculties_count: 0 };

beforeEach(() => {
  clearDataCache(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  sessionStorage.setItem('user', JSON.stringify({ role: 'vpaa', permissions: ['faculty.manage_designations'] }));
  get.mockResolvedValue({ data: [parent] });
  post.mockResolvedValue({ data: { data: { ...emptyDesignation(), id: 2, parent_id: 1, name: 'Networking' } } });
});
afterEach(cleanup);

describe('designation creation entry points', () => {
  it.each(['List View', 'Grid View'])('opens and saves a sub-designation through its manager in %s', async (view) => {
    render(<Designations />);
    await screen.findByRole('button', { name: 'Sub-designations under Director' });
    fireEvent.click(screen.getByTitle(view));
    fireEvent.click(screen.getByRole('button', { name: 'Sub-designations under Director' }));
    const manager = screen.getByRole('dialog', { name: 'Sub-designations under Director' });
    fireEvent.click(within(manager).getByRole('button', { name: 'Add Sub-designation' }));
    const form = screen.getByRole('dialog', { name: 'Add a sub-designation under Director' });
    expect(screen.getAllByRole('dialog').at(-1)).toBe(form);
    fireEvent.change(within(form).getByPlaceholderText("e.g. Networking Dev't"), { target: { value: 'Networking' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create Designation' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/designations', expect.objectContaining({ parent_id: 1, name: 'Networking' })));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a sub-designation under Director' })).toBeNull());
    expect(within(manager).getByText('Networking')).toBeDefined();
  });

  it('creates several sub-designations at once', async () => {
    post
      .mockResolvedValueOnce({ data: { data: { ...emptyDesignation(), id: 2, parent_id: 1, name: 'Networking', deload_units: 3 } } })
      .mockResolvedValueOnce({ data: { data: { ...emptyDesignation(), id: 3, parent_id: 1, name: 'Research', deload_units: 3 } } });
    render(<Designations />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sub-designations under Director' }));
    const manager = screen.getByRole('dialog', { name: 'Sub-designations under Director' });
    fireEvent.click(within(manager).getByRole('button', { name: 'Add Sub-designation' }));
    const form = screen.getByRole('dialog', { name: 'Add a sub-designation under Director' });
    fireEvent.change(within(form).getByLabelText('Sub-designation 1 name'), { target: { value: 'Networking' } });
    fireEvent.change(within(form).getByLabelText('Sub-designation 1 deload units'), { target: { value: '3' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add another sub-designation' }));
    fireEvent.change(within(form).getByLabelText('Sub-designation 2 name'), { target: { value: 'networking' } });
    expect(within(form).getByText('Duplicate name in this list')).toBeDefined();
    fireEvent.change(within(form).getByLabelText('Sub-designation 2 name'), { target: { value: 'Research' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create 2 Sub-designations' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenNthCalledWith(2, '/designations', expect.objectContaining({ parent_id: 1, name: 'Research', deload_units: 3 }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add a sub-designation under Director' })).toBeNull());
    expect(within(manager).getByText('Research')).toBeDefined();
  });

  it('does not offer creation without designation management access', async () => {
    sessionStorage.setItem('user', JSON.stringify({ role: 'dean', permissions: ['schedule.view'] }));
    render(<Designations />);
    await screen.findByText('Director');
    expect(screen.queryByRole('button', { name: 'Add Designation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sub-designations under Director' })).toBeNull();
  });
});
