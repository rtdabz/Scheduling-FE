import { describe, expect, it } from 'vitest';

import { buildApprovalSemesterTitle } from './ScheduleApprovalPreviewModal';

describe('buildApprovalSemesterTitle', () => {
  it.each([
    ['1st', '1st Semester'],
    ['2nd', '2nd Semester'],
    ['summer', 'Summer'],
  ])('uses the exact %s active semester in the approval preview', (semester, expectedLabel) => {
    expect(buildApprovalSemesterTitle({
      academic_year: '2026-2027',
      semester,
    })).toBe(`CLASS SCHEDULE AY 2026-2027    ${expectedLabel}`);
  });

  it('falls back when no active semester is available', () => {
    expect(buildApprovalSemesterTitle(null)).toBe('CLASS SCHEDULE');
  });
});
