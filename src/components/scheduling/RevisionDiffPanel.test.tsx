import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RevisionDiffPanel from './RevisionDiffPanel';
import api from '../../lib/api';

vi.mock('../../lib/api', () => ({ default: { get: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it('keeps regular approval changes in the shared details modal with the existing columns and formatting', async () => {
  const before = { day: 'Monday', start_time: '08:00', end_time: '09:00', mode: 'on-site', room: { room_code: 'Lab 1' }, course: { course_code: 'SCI101' } };
  vi.mocked(api.get).mockResolvedValue({ data: { data: { available: true, sections: [{
    section_id: 10, section_name: 'A', previous_status: 'withdrawn', previous_revision_number: 1,
    changes: [{ change: 'changed', before, after: { ...before, day: 'Wednesday', room: { room_code: 'Lab 2' } } }],
  }] } } });
  render(<RevisionDiffPanel submissionId={7} />);
  fireEvent.click(await screen.findByRole('button', { name: 'View details' }));
  const dialog = screen.getByRole('dialog', { name: 'Changes from the previous version' });
  expect(within(dialog).getByRole('table', { name: 'Changes from the previous version' })).toBeTruthy();
  for (const column of ['Section', 'Change', 'Class', 'Before', 'After']) {
    expect(within(dialog).getByRole('columnheader', { name: column })).toBeTruthy();
  }
  expect(within(dialog).getByText('Monday 8:00 AM–9:00 AM, Lab 1, on-site')).toBeTruthy();
  expect(within(dialog).getByText('Wednesday 8:00 AM–9:00 AM, Lab 2, on-site')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close modal' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
