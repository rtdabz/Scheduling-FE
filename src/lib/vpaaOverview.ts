/**
 * Institution-wide approval rollup for the VPAA dashboard.
 *
 * Approval state is read from `schedule_submissions`, never from
 * `schedules.status`. Two things make the schedule row the wrong source:
 *
 *  1. `/initial-data` caps its `schedules` array (500 rows by default, 2,000 at
 *     most), and `schedules.day` is one row per meeting — so an institution-wide
 *     viewer sees a truncated slice and every section past the cut looks
 *     unscheduled. `schedule_submissions` ships uncapped.
 *  2. VPAA approval does not set `schedules.status` to 'approved'. It moves the
 *     rows to 'faculty_assignment', then on to 'reassignment' and 'finalized'.
 *     Counting `status === 'approved'` therefore made a department's completion
 *     fall the moment it was approved. See lib/scheduleStatus.ts.
 *
 * The submission statuses are a clean six-state model and are what the approval
 * screens already read, so the dashboard now agrees with them by construction.
 */

export type SubmissionStatus =
  | 'pending_dean'
  | 'pending_vpaa'
  | 'approved'
  | 'withdrawn'
  | 'partially_withdrawn'
  | 'rejected_by_dean'
  | 'rejected_by_vpaa';

export interface OverviewSubmissionSection {
  id: number;
  pivot?: { state?: 'included' | 'withdrawn' } | null;
}

export interface OverviewSubmission {
  id: number;
  department_id: number | string;
  semester_id: number | string;
  revision_number: number;
  status: SubmissionStatus;
  submitted_at?: string | null;
  dean_reviewed_at?: string | null;
  vpaa_reviewed_at?: string | null;
  approval_override?: boolean;
  approval_override_reason?: string | null;
  rejection_reason?: string | null;
  sections?: OverviewSubmissionSection[] | null;
  submitter?: { name?: string } | null;
  deanReviewer?: { name?: string } | null;
}

/** Where one section sits in the pipeline, as the dashboard reports it. */
export type SectionStage = 'draft' | 'pending_dean' | 'pending_vpaa' | 'approved' | 'returned';

export interface DepartmentRollup {
  id: number;
  department_name: string;
  department_code: string;
  sectionsCount: number;
  approvedCount: number;
  /** With the Dean or with the VPAA — anywhere in review. */
  pendingCount: number;
  /** Dean-cleared and waiting on the VPAA. This queue. */
  pendingVpaaCount: number;
  returnedCount: number;
  draftCount: number;
  /** Newest Dean hand-off among the sections waiting on the VPAA. */
  submittedAt: string | null;
  /** The Dean approved with an override on the package now awaiting the VPAA. */
  hasOverride: boolean;
  overrideReason: string | null;
  /** Highest revision seen; > 1 means the package has been round the loop. */
  revisionNumber: number;
  approvalStatus: 'Fully Approved' | 'Pending Review' | 'Returned' | 'Partially Approved' | 'Draft';
  progressPercent: number;
}

const STAGE_OF_STATUS: Partial<Record<SubmissionStatus, SectionStage>> = {
  pending_dean: 'pending_dean',
  pending_vpaa: 'pending_vpaa',
  approved: 'approved',
  rejected_by_dean: 'returned',
  rejected_by_vpaa: 'returned',
};

export const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

/**
 * Newest submission first.
 *
 * Revision number is the authoritative ordering — it is what the backend
 * increments on every resubmission — with the review timestamps only breaking
 * ties between two revisions of the same number. The previous dashboard sorted
 * schedule rows by `created_at` and then read `updated_at` off the winner, which
 * are different clocks and could report a stale status with a fresh age.
 */
const newestFirst = (a: OverviewSubmission, b: OverviewSubmission) => {
  if (a.revision_number !== b.revision_number) return b.revision_number - a.revision_number;
  const stamp = (s: OverviewSubmission) =>
    s.vpaa_reviewed_at ?? s.dean_reviewed_at ?? s.submitted_at ?? '';
  return stamp(b).localeCompare(stamp(a));
};

/**
 * The live submission for each section — its newest revision that still has the
 * section included. A section withdrawn from a package is back with its
 * department and must not be reported as in review.
 */
export const latestSubmissionBySection = (
  submissions: OverviewSubmission[],
  activeSemesterId?: number | null,
): Map<number, OverviewSubmission> => {
  const map = new Map<number, OverviewSubmission>();

  [...submissions]
    .filter(s => activeSemesterId == null || Number(s.semester_id) === Number(activeSemesterId))
    .sort(newestFirst)
    .forEach(submission => {
      (submission.sections ?? []).forEach(section => {
        if (section.pivot?.state === 'withdrawn') return;
        const id = Number(section.id);
        if (!map.has(id)) map.set(id, submission);
      });
    });

  return map;
};

export const stageOfSection = (submission?: OverviewSubmission | null): SectionStage => {
  if (!submission) return 'draft';
  return STAGE_OF_STATUS[submission.status] ?? 'draft';
};

export interface SectionLike {
  id: number;
  department_id: number;
}

export interface DepartmentLike {
  id: number;
  department_name: string;
  department_code: string;
}

/**
 * Per-department totals, plus the institution-wide spread, from one pass over
 * the sections. Every section is counted exactly once and lands in exactly one
 * stage, so the buckets always sum to the section total — which the old
 * status-matching rollup did not guarantee, because it had no branch for
 * `completed`, `faculty_assignment`, `reassignment`, `finalized`, `revision` or
 * `conditionally_approved` and silently called all six "draft".
 */
export const rollupDepartments = (
  departments: DepartmentLike[],
  sections: SectionLike[],
  bySection: Map<number, OverviewSubmission>,
): DepartmentRollup[] => {
  const sectionsByDepartment = new Map<number, SectionLike[]>();
  sections.forEach(section => {
    const key = Number(section.department_id);
    const list = sectionsByDepartment.get(key);
    if (list) list.push(section);
    else sectionsByDepartment.set(key, [section]);
  });

  return departments.map(department => {
    const own = sectionsByDepartment.get(Number(department.id)) ?? [];
    let approvedCount = 0;
    let pendingVpaaCount = 0;
    let pendingDeanCount = 0;
    let returnedCount = 0;
    let draftCount = 0;
    let submittedAt: string | null = null;
    let hasOverride = false;
    let overrideReason: string | null = null;
    let revisionNumber = 0;

    own.forEach(section => {
      const submission = bySection.get(Number(section.id));
      const stage = stageOfSection(submission);

      if (submission) revisionNumber = Math.max(revisionNumber, submission.revision_number ?? 0);

      switch (stage) {
        case 'approved':
          approvedCount++;
          break;
        case 'pending_vpaa': {
          pendingVpaaCount++;
          const handoff = submission?.dean_reviewed_at ?? submission?.submitted_at ?? null;
          // ISO-8601 sorts chronologically as text, so no Date churn per row.
          if (handoff && (!submittedAt || handoff > submittedAt)) submittedAt = handoff;
          if (submission?.approval_override) {
            hasOverride = true;
            overrideReason = submission.approval_override_reason ?? overrideReason;
          }
          break;
        }
        case 'pending_dean':
          pendingDeanCount++;
          break;
        case 'returned':
          returnedCount++;
          break;
        default:
          draftCount++;
      }
    });

    const sectionsCount = own.length;
    const pendingCount = pendingVpaaCount + pendingDeanCount;

    let approvalStatus: DepartmentRollup['approvalStatus'] = 'Draft';
    if (sectionsCount > 0 && approvedCount === sectionsCount) approvalStatus = 'Fully Approved';
    else if (returnedCount > 0) approvalStatus = 'Returned';
    else if (pendingCount > 0) approvalStatus = 'Pending Review';
    else if (approvedCount > 0) approvalStatus = 'Partially Approved';

    return {
      id: department.id,
      department_name: department.department_name,
      department_code: department.department_code,
      sectionsCount,
      approvedCount,
      pendingCount,
      pendingVpaaCount,
      returnedCount,
      draftCount,
      submittedAt,
      hasOverride,
      overrideReason,
      revisionNumber,
      approvalStatus,
      progressPercent: percent(approvedCount, sectionsCount),
    };
  });
};

export interface InstitutionTotals {
  sections: number;
  approved: number;
  pendingVpaa: number;
  pendingDean: number;
  returned: number;
  draft: number;
  progressPercent: number;
}

export const institutionTotals = (rollups: DepartmentRollup[]): InstitutionTotals => {
  const totals = rollups.reduce(
    (acc, row) => ({
      sections: acc.sections + row.sectionsCount,
      approved: acc.approved + row.approvedCount,
      pendingVpaa: acc.pendingVpaa + row.pendingVpaaCount,
      pendingDean: acc.pendingDean + (row.pendingCount - row.pendingVpaaCount),
      returned: acc.returned + row.returnedCount,
      draft: acc.draft + row.draftCount,
    }),
    { sections: 0, approved: 0, pendingVpaa: 0, pendingDean: 0, returned: 0, draft: 0 },
  );

  return { ...totals, progressPercent: percent(totals.approved, totals.sections) };
};

/** Ageing bands for the approval queue, so a stale package reads as stale. */
export type QueueSeverity = 'fresh' | 'ageing' | 'overdue';

export const AGEING_DAYS = 2;
export const OVERDUE_DAYS = 5;

export const queueSeverity = (submittedAt: string | null, reference: Date): QueueSeverity => {
  if (!submittedAt) return 'fresh';
  const then = new Date(submittedAt).getTime();
  if (Number.isNaN(then)) return 'fresh';
  const days = (reference.getTime() - then) / 86_400_000;
  if (days >= OVERDUE_DAYS) return 'overdue';
  if (days >= AGEING_DAYS) return 'ageing';
  return 'fresh';
};

/**
 * "3 days ago" — how long a package has been sitting in the VPAA queue.
 *
 * `reference` is the dashboard's minute ticker rather than a fresh Date, so every
 * row in a render agrees on "now".
 */
export const relativeAge = (value: string | null | undefined, reference: Date) => {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.max(0, Math.floor((reference.getTime() - then) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
