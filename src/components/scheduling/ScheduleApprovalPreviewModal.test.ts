import { describe, expect, it } from 'vitest';

import { buildApprovalTermTitle } from './ScheduleApprovalPreviewModal';

describe('buildApprovalTermTitle', () => {
  it.each([
    ['1st', '1st Semester'],
    ['2nd', '2nd Semester'],
    ['summer', 'Summer'],
  ])('uses the exact %s active term in the approval preview', (semester, expectedLabel) => {
    expect(buildApprovalTermTitle({
      academic_year: '2026-2027',
      semester,
    })).toBe(`CLASS SCHEDULE AY 2026-2027    ${expectedLabel}`);
  });

  it('falls back when no active term is available', () => {
    expect(buildApprovalTermTitle(null)).toBe('CLASS SCHEDULE');
  });
});
