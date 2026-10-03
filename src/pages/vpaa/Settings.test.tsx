import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Settings from './Settings';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mocks.apiGet(...args),
    patch: (...args: unknown[]) => mocks.apiPatch(...args),
  },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: (() => {
    const toast = { success: mocks.toastSuccess, error: mocks.toastError };
    return () => ({ toast });
  })(),
}));

vi.mock('../../lib/dataCache', () => ({
  getCachedData: () => null,
  hasCachedData: () => false,
  loadCachedData: async (_key: string, loader: () => Promise<unknown>) => loader(),
  setCachedData: vi.fn(),
}));

vi.mock('../../lib/institutionSettings', () => ({
  DEFAULT_INSTITUTION_SETTINGS: {
    president_name: 'College President',
    president_title: 'President',
  },
  fetchInstitutionSettings: async () => ({
    president_name: 'College President',
    president_title: 'President',
  }),
  normalizeInstitutionSettings: (value: unknown) => value,
  setCachedInstitutionSettings: vi.fn(),
}));

describe('VPAA Settings operating hours', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/semesters') return Promise.resolve({ data: [] });
      if (url === '/semesters/activation-history') return Promise.resolve({ data: [] });
      if (url === '/timeslots') {
        return Promise.resolve({
          data: {
            settings: {
              opening_time: '7:00 AM',
              closing_time: '7:00 PM',
              slot_interval: 30,
            },
          },
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    mocks.apiPatch.mockResolvedValue({
      data: {
        settings: {
          opening_time: '7:00 AM',
          closing_time: '8:00 PM',
          slot_interval: 30,
        },
      },
    });
  });

  it('lets an authorized user extend closing time to 8 PM', async () => {
    render(<Settings />);

    const closingTime = await screen.findByLabelText('Closing time');
    expect(closingTime).toHaveProperty('value', '19:00');

    fireEvent.change(closingTime, { target: { value: '20:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save operating hours' }));

    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledWith('/timeslots/settings', {
      opening_time: '7:00 AM',
      closing_time: '8:00 PM',
      slot_interval: 30,
    }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Operating hours saved',
      'Schedule generation now uses the updated daily time range.',
    );
  });

  it('saves a field end time and blocks one past closing', async () => {
    render(<Settings />);

    const fieldEnd = await screen.findByLabelText(/Field classes end by/);
    fireEvent.change(fieldEnd, { target: { value: '20:00' } });
    expect(screen.getByText('Field end time cannot be later than closing time.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save operating hours' })).toHaveProperty('disabled', true);

    fireEvent.change(fieldEnd, { target: { value: '18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save operating hours' }));

    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledWith('/timeslots/settings', {
      opening_time: '7:00 AM',
      closing_time: '7:00 PM',
      field_end_time: '6:00 PM',
      slot_interval: 30,
    }));
  });

  it('previews unsaved operating hours and blocks a reversed time range', async () => {
    render(<Settings />);
    await screen.findByRole('img', { name: 'Daily scheduling window: 7:00 AM to 7:00 PM' });
    fireEvent.change(screen.getByLabelText('Closing time'), { target: { value: '20:00' } });
    expect(screen.getByRole('img', { name: 'Daily scheduling window: 7:00 AM to 8:00 PM' })).toBeTruthy();
    expect(screen.getByText('13h scheduling window')).toBeTruthy();
    expect(mocks.apiPatch).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Closing time'), { target: { value: '06:00' } });
    expect(screen.getByRole('img', { name: 'Daily scheduling window unavailable' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save operating hours' })).toHaveProperty('disabled', true);
    expect(mocks.apiPatch).not.toHaveBeenCalled();
  });

  it('previews the signatory draft and saves the existing settings payload', async () => {
    const settings = { president_name: 'Dr. Jane Doe', president_title: 'President' };
    mocks.apiPatch.mockResolvedValue({ data: { settings } });
    render(<Settings />);
    const name = await screen.findByDisplayValue('College President');
    fireEvent.change(name, { target: { value: 'Dr. Jane Doe' } });
    expect(within(screen.getByRole('figure', { name: 'Document signature preview' })).getByText('Dr. Jane Doe')).toBeTruthy();
    expect(mocks.apiPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save signatory' }));
    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledWith('/institution-settings', settings));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Saved', 'Printed schedules and teaching loads will use the new name.');
  });
});
