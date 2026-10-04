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
  key: string;
  submission: T;
  sectionIds: string[];
}

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
