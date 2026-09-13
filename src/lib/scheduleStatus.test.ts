import { describe, expect, it } from 'vitest';
import { isVpaaApproved } from './scheduleStatus';

describe('isVpaaApproved', () => {
  // The status VPAA approval actually writes. Matching only 'approved' left
  // every dashboard timetable empty once approval ownership moved to
  // schedule_submissions.
  it('accepts every post-VPAA-approval status', () => {
    ['approved', 'faculty_assignment', 'reassignment', 'finalized'].forEach(status => {
      expect(isVpaaApproved(status)).toBe(true);
    });
  });

  it('accepts casing and padding variations', () => {
    expect(isVpaaApproved(' Faculty_Assignment ')).toBe(true);
  });

  it('rejects statuses that have not cleared VPAA approval', () => {
    ['draft', 'completed', 'submitted', 'approved_by_dean', 'conditionally_approved', 'revision', 'rejected', 'rejected_by_dean'].forEach(status => {
      expect(isVpaaApproved(status)).toBe(false);
    });
  });

  it('rejects missing statuses', () => {
    expect(isVpaaApproved(null)).toBe(false);
    expect(isVpaaApproved(undefined)).toBe(false);
    expect(isVpaaApproved('')).toBe(false);
  });
});
