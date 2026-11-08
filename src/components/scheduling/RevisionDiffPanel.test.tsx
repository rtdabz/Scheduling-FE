import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RevisionDiffPanel from './RevisionDiffPanel';
import api from '../../lib/api';

vi.mock('../../lib/api', () => ({ default: { get: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const before = { day: 'Monday', start_time: '08:00', end_time: '09:00', mode: 'on-site', room: { room_code: 'Lab 1' }, course: { course_code: 'SCI101' } };

it('shows totals, the compared version, the return reason, and the before/after table inline', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: { available: true, sections: [{
    section_id: 10, section_name: 'A', previous_status: 'rejected_by_dean', previous_revision_number: 1,
    previous_rejection_reason: 'Move the lab.',
    changes: [{ change: 'changed', before, after: { ...before, day: 'Wednesday', room: { room_code: 'Lab 2' } } }],
  }] } } });
  render(<RevisionDiffPanel submissionId={7} />);

  expect(await screen.findByText('1 changed class')).toBeTruthy();
  // A comparison never claims to cover instructors.
  expect(screen.getByText('Instructor changes are not included.')).toBeTruthy();
  // The table is part of the panel; there is no nested dialog to open.
  expect(screen.queryByRole('button', { name: 'View details' })).toBeNull();
  expect(screen.getByText('vs. returned version #1')).toBeTruthy();
  expect(screen.getByText('Return reason: Move the lab.')).toBeTruthy();
  const table = screen.getByRole('table', { name: 'Changes from the previous version' });
  for (const column of ['Section', 'Change', 'Class', 'Before', 'After']) {
    expect(within(table).getByRole('columnheader', { name: column })).toBeTruthy();
  }
  expect(within(table).getByText('Monday 8:00 AM–9:00 AM, Lab 1, on-site')).toBeTruthy();
  expect(within(table).getByText('Wednesday 8:00 AM–9:00 AM, Lab 2, on-site')).toBeTruthy();
});

it('pages through a large list of changes', async () => {
  const changes = Array.from({ length: 60 }, (_, index) => ({
    change: 'added', before: null, after: { ...before, course: { course_code: `C${index}` } },
  }));
  vi.mocked(api.get).mockResolvedValue({ data: { data: { available: true, sections: [{
    section_id: 10, section_name: 'A', previous_status: 'withdrawn', previous_revision_number: 2, previous_rejection_reason: null, changes,
  }] } } });
  render(<RevisionDiffPanel submissionId={7} />);

  const table = await screen.findByRole('table', { name: 'Changes from the previous version' });
  expect(screen.getByText('60 changed classes')).toBeTruthy();
  expect(within(table).getAllByRole('row')).toHaveLength(26);
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(within(table).getByText('C25')).toBeTruthy();
});

it('says so when there are no class changes, and when the changes cannot load', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: { available: false, sections: [] } } });
  render(<RevisionDiffPanel submissionId={7} />);
  expect(await screen.findByText(/No class changes from the previous version/)).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  cleanup();

  vi.mocked(api.get).mockRejectedValue(new Error('offline'));
  render(<RevisionDiffPanel submissionId={7} />);
  expect(await screen.findByText('The changes from the previous version could not be loaded.')).toBeTruthy();
});
