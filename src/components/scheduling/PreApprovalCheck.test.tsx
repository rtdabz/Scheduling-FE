import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PreApprovalCheck from './PreApprovalCheck';
import type { ConflictSchedule } from '../../lib/conflicts';

const lib = vi.hoisted(() => ({
  fetchConflicts: vi.fn(),
  fetchRuleIssues: vi.fn(),
}));
vi.mock('../../lib/conflicts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/conflicts')>()),
  ...lib,
}));

const row = (id: number, sectionId: number, departmentId = 5): ConflictSchedule => ({
  id,
  semester_id: 1,
  section_id: sectionId,
  course_id: 3,
  faculty_id: null,
  room_id: 9,
  department_id: departmentId,
  day: 'Monday',
  start_time: '08:00:00',
  end_time: '09:00:00',
  mode: 'on-site',
  status: 'submitted',
  course_code: 'IT 101',
  course_name: 'Programming',
  section_name: `Section ${sectionId}`,
  room_code: 'CIT 101',
  faculty_name: null,
});

describe('PreApprovalCheck', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reports only what falls in the package, and blocks on an open conflict', async () => {
    lib.fetchConflicts.mockResolvedValue([
      { id: 'room_conflict:1:2', rule: 'room_conflict', semester_id: 1, day: 'Monday', overlap_start: '08:00', overlap_end: '09:00', message: 'IT 101 and IT 101 share the same room.', resolution_options: [], schedules: [row(1, 10), row(2, 11)] },
      // Another package's sections: not this approver's concern here.
      { id: 'section_conflict:7:8', rule: 'section_conflict', semester_id: 1, day: 'Monday', overlap_start: '08:00', overlap_end: '09:00', message: 'Elsewhere.', resolution_options: [], schedules: [row(7, 99), row(8, 99)] },
    ]);
    lib.fetchRuleIssues.mockResolvedValue([
      { id: 'rule_issue:room_availability:2', rule: 'room_availability', message: 'Room CIT 101 is not available for scheduling.', schedule: row(2, 11) },
    ]);
    const onOpenConflicts = vi.fn();

    render(<PreApprovalCheck departmentId={5} sectionIds={['10', '11']} onOpenConflicts={onOpenConflicts} />);

    await waitFor(() => expect(onOpenConflicts).toHaveBeenCalledWith(1));
    expect(screen.getByText(/1 open conflict — approval is blocked/)).toBeTruthy();
    expect(screen.queryByText(/Elsewhere/)).toBeNull();
    expect(screen.getByText(/1 class no longer meets a scheduling rule/)).toBeTruthy();
  });

  it('says so when the package is clean', async () => {
    lib.fetchConflicts.mockResolvedValue([]);
    lib.fetchRuleIssues.mockResolvedValue([]);
    const onOpenConflicts = vi.fn();

    render(<PreApprovalCheck departmentId={5} sectionIds={['10']} onOpenConflicts={onOpenConflicts} />);

    expect(await screen.findByText(/No conflicts or scheduling issues found/)).toBeTruthy();
    expect(onOpenConflicts).toHaveBeenCalledWith(0);
  });
});
