/**
 * Queue entries for the Dean and VPAA Schedule Approval pages.
 *
 * Recalling some sections of a submission marks the whole submission
 * `partially_withdrawn` on the server, but only the recalled sections left the
 * workflow: the rest are still approved (or still waiting on a reviewer). The
 * pages used to show such a submission once, as a recall of just the withdrawn
 * sections, so every section that stayed approved vanished from the Approved
 * tab as if it had been deleted.
 *
 * A partially recalled submission is therefore split into two entries: the
 * recalled sections, and the sections still in the workflow at the stage their
 * meetings are actually in.
 */

export type QueueSubmissionStatus =
  | 'pending_dean'
  | 'pending_vpaa'
  | 'approved'
  | 'withdrawn'
  | 'partially_withdrawn'
  | 'rejected_by_dean'
  | 'rejected_by_vpaa';

export interface QueueSubmissionLike {
  id: number;
  status: QueueSubmissionStatus;
  sections: Array<{ id: number | string; pivot?: { state?: 'included' | 'withdrawn' } | null }>;
}

export interface QueueSlice<T extends QueueSubmissionLike> {
  /** Unique per entry; a split submission yields two entries with one id. */
  key: string;
  /** The submission as this entry should be read, status included. */
  submission: T;
  sectionIds: string[];
}

/**
 * The submission stage the still-included sections are in, read from their
 * meetings. The most conservative stage wins, so a section still with the
 * Dean is never reported as approved.
 */
export const stageOfScheduleStatuses = (
  statuses: Iterable<string>,
): Extract<QueueSubmissionStatus, 'pending_dean' | 'pending_vpaa' | 'approved'> | null => {
  const present = new Set(statuses);
  if (present.has('submitted')) return 'pending_dean';
  if (present.has('approved_by_dean') || present.has('conditionally_approved')) return 'pending_vpaa';
  if (['approved', 'faculty_assignment', 'reassignment', 'finalized'].some((status) => present.has(status))) {
    return 'approved';
  }
  return null;
};

export const splitSubmission = <T extends QueueSubmissionLike>(
  submission: T,
  scheduleStatusesOf: (sectionIds: string[]) => Iterable<string>,
): QueueSlice<T>[] => {
  const ids = (state: 'included' | 'withdrawn') => submission.sections
    .filter((section) => (section.pivot?.state ?? 'included') === state)
    .map((section) => String(section.id));
  const allIds = submission.sections.map((section) => String(section.id));

  if (submission.status === 'withdrawn') {
    const withdrawn = ids('withdrawn');
    return [{ key: `${submission.id}:recalled`, submission, sectionIds: withdrawn.length > 0 ? withdrawn : allIds }];
  }

  const withdrawn = ids('withdrawn');
  const included = ids('included');

  // A Dean or VPAA return after a partial recall marks the submission returned,
  // but the recalled sections were never part of that return: they stay a
  // recall entry, and the returned entry holds only the sections reviewed.
  if ((submission.status === 'rejected_by_dean' || submission.status === 'rejected_by_vpaa') && withdrawn.length > 0) {
    return [
      { key: `${submission.id}:recalled`, submission: { ...submission, status: 'partially_withdrawn' }, sectionIds: withdrawn },
      { key: `${submission.id}:returned`, submission, sectionIds: included },
    ];
  }

  if (submission.status !== 'partially_withdrawn') {
    return [{ key: String(submission.id), submission, sectionIds: allIds }];
  }

  const slices: QueueSlice<T>[] = [
    { key: `${submission.id}:recalled`, submission, sectionIds: withdrawn.length > 0 ? withdrawn : allIds },
  ];
  const stage = included.length > 0 ? stageOfScheduleStatuses(scheduleStatusesOf(included)) : null;
  if (stage !== null) {
    slices.push({ key: `${submission.id}:active`, submission: { ...submission, status: stage }, sectionIds: included });
  }
  return slices;
};

/** How a queue entry reads on the Dean and VPAA approval pages. */
export type ApprovalDisplayStatus =
  | 'submitted'
  | 'approved_by_dean'
  | 'conditionally_approved'
  | 'rejected_by_dean'
  | 'approved'
  | 'rejected'
  | 'revision';

export const submissionDisplayStatus = (
  submission: { status: QueueSubmissionStatus; approval_override?: boolean },
): ApprovalDisplayStatus => {
  switch (submission.status) {
    case 'pending_dean': return 'submitted';
    case 'pending_vpaa': return submission.approval_override ? 'conditionally_approved' : 'approved_by_dean';
    case 'approved': return 'approved';
    case 'rejected_by_dean': return 'rejected_by_dean';
    case 'rejected_by_vpaa': return 'rejected';
    default: return 'revision';
  }
};

/**
 * The meeting statuses that belong to a submission at a given stage — what the
 * preview and the printout of that submission may contain. The two approval
 * pages used to keep their own copies of this; the VPAA copy read a returned
 * package as still "submitted", so its preview came up empty.
 */
export const scheduleStatusesForSubmission = (status: QueueSubmissionStatus): string[] => {
  switch (status) {
    case 'pending_dean': return ['submitted'];
    case 'pending_vpaa': return ['approved_by_dean', 'conditionally_approved'];
    case 'approved': return ['approved', 'faculty_assignment', 'reassignment', 'finalized'];
    case 'withdrawn':
    case 'partially_withdrawn':
    case 'rejected_by_dean':
    case 'rejected_by_vpaa':
      return ['draft', 'completed', 'revision', 'rejected', 'rejected_by_dean', 'rejected_by_vpaa'];
    default: return [];
  }
};
