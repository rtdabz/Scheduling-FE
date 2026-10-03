import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RevisionChangesPanel from './RevisionChangesPanel';

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('../../lib/api', () => ({
  default: { get: (...args: unknown[]) => mocks.apiGet(...args) },
}));

const row = (day: string, start: string, end: string) => ({
  day,
  start_time: start,
  end_time: end,
  course: { course_code: 'IT 101', course_name: 'Programming' },
  section: { section_name: 'BSIT 1A' },
  room: { room_code: 'CIT 101' },
});

describe('RevisionChangesPanel', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it('lists moved, removed and deleted-section changes as they were recorded', async () => {
    mocks.apiGet.mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            action: 'revision_schedules_changed',
            operation: 'update',
            created_at: '2026-09-29T08:00:00Z',
            actor: { name: 'Sam Secretary' },
            section: null,
            course_changes: null,
            changes: [{ schedule_id: 5, change: 'updated', before: row('Monday', '08:00', '09:00'), after: row('Thursday', '08:00', '09:00') }],
          },
          {
            id: 2,
            action: 'revision_course_changed',
            operation: null,
            created_at: '2026-09-29T09:00:00Z',
            actor: null,
            section: null,
            course_changes: { units: { before: 1, after: 3 } },
            changes: [{ schedule_id: 5, change: 'updated', before: row('Thursday', '08:00', '09:00'), after: row('Thursday', '08:00', '09:00') }],
          },
          {
            id: 3,
            action: 'revision_section_deleted',
            operation: null,
            created_at: '2026-09-29T10:00:00Z',
            actor: null,
            section: { section_name: 'BSIT 1A' },
            course_changes: null,
            changes: [{ schedule_id: 5, change: 'removed', before: row('Thursday', '08:00', '09:00'), after: null }],
          },
        ],
      },
    });

    render(<RevisionChangesPanel submissionId={7} />);

    expect(await screen.findByText(/Changes to the working copy since this version \(3\)/)).toBeTruthy();
    expect(mocks.apiGet.mock.calls[0][0]).toBe('/schedule-submissions/7/changes');
    // The list lives in the details modal, not inline.
    expect(screen.queryByText('Sam Secretary')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'View details' }));

    expect(await screen.findByText('Sam Secretary')).toBeTruthy();
    expect(screen.getByText('Changed')).toBeTruthy();
    expect(screen.getAllByText(/Monday .*CIT 101/)).toHaveLength(1);
    expect(screen.getAllByText(/Thursday .*CIT 101/).length).toBeGreaterThan(0);
    expect(screen.getByText('Course details')).toBeTruthy();
    expect(screen.getByText('units: 1')).toBeTruthy();
    expect(screen.getByText('units: 3')).toBeTruthy();
    expect(screen.getByText('Section deleted')).toBeTruthy();
  });

  it('says so when nothing changed', async () => {
    mocks.apiGet.mockResolvedValue({ data: { data: [] } });

    render(<RevisionChangesPanel submissionId={7} />);

    expect(await screen.findByText('No changes to the working copy since this version.')).toBeTruthy();
  });
});
