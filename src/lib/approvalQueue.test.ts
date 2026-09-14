import { describe, expect, it } from 'vitest';
import { splitSubmission, stageOfScheduleStatuses, type QueueSubmissionLike } from './approvalQueue';

const submission = (
  status: QueueSubmissionLike['status'],
  sections: Array<[number, 'included' | 'withdrawn']>,
): QueueSubmissionLike => ({
  id: 16,
  status,
  sections: sections.map(([id, state]) => ({ id, pivot: { state } })),
});

describe('splitSubmission', () => {
  it('keeps the still-approved sections of a partially recalled submission in the Approved queue', () => {
    const statuses: Record<string, string> = { 97: 'revision', 99: 'faculty_assignment', 100: 'finalized' };
    const slices = splitSubmission(
      submission('partially_withdrawn', [[97, 'withdrawn'], [99, 'included'], [100, 'included']]),
      (ids) => ids.map((id) => statuses[id]),
    );

    expect(slices).toEqual([
      expect.objectContaining({ key: '16:recalled', sectionIds: ['97'], submission: expect.objectContaining({ status: 'partially_withdrawn' }) }),
      expect.objectContaining({ key: '16:active', sectionIds: ['99', '100'], submission: expect.objectContaining({ status: 'approved' }) }),
    ]);
  });

  it('reports sections still with a reviewer at that review stage', () => {
    const slices = splitSubmission(
      submission('partially_withdrawn', [[97, 'withdrawn'], [99, 'included']]),
      () => ['approved_by_dean'],
    );

    expect(slices[1]).toEqual(expect.objectContaining({ submission: expect.objectContaining({ status: 'pending_vpaa' }) }));
  });

  it('shows a fully recalled submission once, as its recalled sections', () => {
    const slices = splitSubmission(submission('withdrawn', [[97, 'withdrawn'], [99, 'withdrawn']]), () => []);

    expect(slices).toEqual([expect.objectContaining({ key: '16:recalled', sectionIds: ['97', '99'] })]);
  });

  it('leaves an ordinary submission as a single entry', () => {
    const slices = splitSubmission(submission('approved', [[97, 'included'], [99, 'included']]), () => []);

    expect(slices).toEqual([expect.objectContaining({ key: '16', sectionIds: ['97', '99'] })]);
  });
});

describe('stageOfScheduleStatuses', () => {
  it('uses the least advanced stage present', () => {
    expect(stageOfScheduleStatuses(['faculty_assignment', 'submitted'])).toBe('pending_dean');
    expect(stageOfScheduleStatuses(['finalized', 'conditionally_approved'])).toBe('pending_vpaa');
    expect(stageOfScheduleStatuses(['reassignment'])).toBe('approved');
    expect(stageOfScheduleStatuses(['revision'])).toBeNull();
  });
});
