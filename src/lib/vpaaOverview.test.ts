import { describe, expect, it } from 'vitest';
import {
  institutionTotals,
  latestSubmissionBySection,
  queueSeverity,
  rollupDepartments,
  stageOfSection,
  type OverviewSubmission,
} from './vpaaOverview';

const departments = [
  { id: 1, department_name: 'Computer Studies', department_code: 'CCS' },
  { id: 2, department_name: 'Education', department_code: 'CED' },
];

const sections = [
  { id: 10, department_id: 1 },
  { id: 11, department_id: 1 },
  { id: 20, department_id: 2 },
];

const submission = (over: Partial<OverviewSubmission> & { id: number }): OverviewSubmission => ({
  department_id: 1,
  term_id: 1,
  revision_number: 1,
  status: 'pending_vpaa',
  sections: [],
  ...over,
});

describe('latestSubmissionBySection', () => {
  it('keeps the highest revision for a section', () => {
    const map = latestSubmissionBySection([
      submission({ id: 1, revision_number: 1, status: 'rejected_by_dean', sections: [{ id: 10 }] }),
      submission({ id: 2, revision_number: 2, status: 'pending_vpaa', sections: [{ id: 10 }] }),
    ], 1);

    expect(map.get(10)?.id).toBe(2);
  });

  it('ignores sections withdrawn from a package', () => {
    const map = latestSubmissionBySection([
      submission({ id: 1, sections: [{ id: 10, pivot: { state: 'withdrawn' } }] }),
    ], 1);

    expect(map.has(10)).toBe(false);
  });

  it('ignores submissions from another term', () => {
    const map = latestSubmissionBySection([
      submission({ id: 1, term_id: 99, sections: [{ id: 10 }] }),
    ], 1);

    expect(map.size).toBe(0);
  });
});

describe('stageOfSection', () => {
  it('reports a section with no submission as draft', () => {
    expect(stageOfSection(undefined)).toBe('draft');
  });

  it('treats a dean override as awaiting the VPAA, not as draft', () => {
    // The regression this guards: `conditionally_approved` schedule rows were
    // bucketed as draft, so override packages never reached the VPAA queue.
    expect(stageOfSection(submission({ id: 1, status: 'pending_vpaa', approval_override: true }))).toBe('pending_vpaa');
  });

  it('reports a VPAA-approved package as approved', () => {
    // Approval moves schedules.status to 'faculty_assignment'; reading the
    // submission keeps that from looking like a regression to draft.
    expect(stageOfSection(submission({ id: 1, status: 'approved' }))).toBe('approved');
  });
});

describe('rollupDepartments', () => {
  const bySection = latestSubmissionBySection([
    submission({ id: 1, department_id: 1, status: 'approved', sections: [{ id: 10 }] }),
    submission({
      id: 2,
      department_id: 1,
      status: 'pending_vpaa',
      approval_override: true,
      approval_override_reason: 'Dean waived the room-type rule',
      dean_reviewed_at: '2026-09-08T02:00:00Z',
      sections: [{ id: 11 }],
    }),
  ], 1);

  const rows = rollupDepartments(departments, sections, bySection);

  it('splits a department across stages without losing a section', () => {
    const ccs = rows.find(row => row.id === 1)!;
    expect(ccs.sectionsCount).toBe(2);
    expect(ccs.approvedCount + ccs.pendingCount + ccs.returnedCount + ccs.draftCount).toBe(2);
    expect(ccs.progressPercent).toBe(50);
  });

  it('surfaces the dean override and its reason', () => {
    const ccs = rows.find(row => row.id === 1)!;
    expect(ccs.hasOverride).toBe(true);
    expect(ccs.overrideReason).toBe('Dean waived the room-type rule');
    expect(ccs.submittedAt).toBe('2026-09-08T02:00:00Z');
  });

  it('reports a department with no submissions as draft, not approved', () => {
    const ced = rows.find(row => row.id === 2)!;
    expect(ced.approvalStatus).toBe('Draft');
    expect(ced.draftCount).toBe(1);
  });

  it('sums to the institution totals', () => {
    const totals = institutionTotals(rows);
    expect(totals.sections).toBe(3);
    expect(totals.approved).toBe(1);
    expect(totals.pendingVpaa).toBe(1);
    expect(totals.draft).toBe(1);
    expect(totals.progressPercent).toBe(33);
  });
});

describe('queueSeverity', () => {
  const now = new Date('2026-09-11T00:00:00Z');

  it('grades a fresh hand-off, an ageing one and an overdue one', () => {
    expect(queueSeverity('2026-09-10T12:00:00Z', now)).toBe('fresh');
    expect(queueSeverity('2026-09-08T12:00:00Z', now)).toBe('ageing');
    expect(queueSeverity('2026-09-01T00:00:00Z', now)).toBe('overdue');
  });
});
