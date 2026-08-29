import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      if (url === '/terms') return Promise.resolve({ data: [] });
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
});
