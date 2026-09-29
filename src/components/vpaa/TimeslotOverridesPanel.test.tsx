import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TimeslotOverridesPanel, { type TimeslotOverride } from './TimeslotOverridesPanel';

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  confirm: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  default: {
    post: (...args: unknown[]) => mocks.apiPost(...args),
    patch: (...args: unknown[]) => mocks.apiPatch(...args),
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: (() => {
    const value = { toast: { success: mocks.toastSuccess, error: mocks.toastError }, confirm: mocks.confirm };
    return () => value;
  })(),
}));

const existing: TimeslotOverride = { id: 1, duration_minutes: 90, start_time: '7:30 AM', is_active: true };

describe('TimeslotOverridesPanel', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it('says every class length uses generated start times when there are no overrides', () => {
    render(<TimeslotOverridesPanel overrides={[]} onChange={vi.fn()} />);

    expect(screen.getByText(/No custom start times/)).toBeTruthy();
  });

  it('adds a start time in the 12-hour form the API expects', async () => {
    const onChange = vi.fn();
    mocks.apiPost.mockResolvedValue({ data: { override: { id: 2, duration_minutes: 60, start_time: '1:00 PM', is_active: true } } });
    render(<TimeslotOverridesPanel overrides={[existing]} onChange={onChange} />);

    fireEvent.change(document.querySelector('input[type="time"]') as HTMLInputElement, { target: { value: '13:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Add start time/ }));

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(mocks.apiPost).toHaveBeenCalledWith('/timeslots/overrides', { duration_minutes: 60, start_time: '1:00 PM', is_active: true });
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
  });

  it('refuses a start time already listed for that class length', () => {
    render(<TimeslotOverridesPanel overrides={[{ ...existing, duration_minutes: 60 }]} onChange={vi.fn()} />);

    fireEvent.change(document.querySelector('input[type="time"]') as HTMLInputElement, { target: { value: '07:30' } });

    expect(screen.getByText(/already listed/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Add start time/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it('turns a start time off without removing it', async () => {
    const onChange = vi.fn();
    mocks.apiPatch.mockResolvedValue({ data: { override: { ...existing, is_active: false } } });
    render(<TimeslotOverridesPanel overrides={[existing]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ ...existing, is_active: false }]));
    expect(mocks.apiPatch).toHaveBeenCalledWith('/timeslots/overrides/1', { is_active: false });
  });

  it('archives only after confirmation', async () => {
    const onChange = vi.fn();
    mocks.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.apiDelete.mockResolvedValue({});
    render(<TimeslotOverridesPanel overrides={[existing]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(mocks.apiDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
    expect(mocks.apiDelete).toHaveBeenCalledWith('/timeslots/overrides/1');
  });

  it('shows the server reason when a save fails', async () => {
    mocks.apiPost.mockRejectedValue({ response: { data: { message: 'The start time format is invalid.' } } });
    render(<TimeslotOverridesPanel overrides={[]} onChange={vi.fn()} />);

    fireEvent.change(document.querySelector('input[type="time"]') as HTMLInputElement, { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Add start time/ }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('Not added', 'The start time format is invalid.'));
  });
});
