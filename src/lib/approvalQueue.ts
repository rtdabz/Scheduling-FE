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

  if (submission.status !== 'partially_withdrawn') {
    return [{ key: String(submission.id), submission, sectionIds: allIds }];
  }

  const withdrawn = ids('withdrawn');
  const included = ids('included');
  const slices: QueueSlice<T>[] = [
    { key: `${submission.id}:recalled`, submission, sectionIds: withdrawn.length > 0 ? withdrawn : allIds },
  ];
  const stage = included.length > 0 ? stageOfScheduleStatuses(scheduleStatusesOf(included)) : null;
  if (stage !== null) {
    slices.push({ key: `${submission.id}:active`, submission: { ...submission, status: stage }, sectionIds: included });
  }
  return slices;
};
