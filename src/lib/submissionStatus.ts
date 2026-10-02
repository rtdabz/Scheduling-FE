/**
 * The two statuses a section's schedule is shown with, derived on the server
 * (SubmissionStatusResolver) from its submissions and their snapshots.
 *
 * Submission: where the latest submitted version stands. A recalled or rejected
 * version stays so until it is resubmitted, whatever the working copy does.
 * Revision: whether the working copy (or the version resubmitted from it)
 * differs from the last recalled or rejected version.
 */
export type SubmissionStatus = 'draft' | 'submitted' | 'dean_approved' | 'vpaa_approved' | 'recalled' | 'rejected';
export type RevisionStatus = 'initial' | 'modified' | 'reset';

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  dean_approved: 'Dean Approved',
  vpaa_approved: 'VPAA Approved',
  recalled: 'Recalled',
  rejected: 'Rejected',
};

export const REVISION_STATUS_LABELS: Record<RevisionStatus, string> = {
  initial: 'Initial',
  modified: 'Modified',
  reset: 'Reset',
};

export const SUBMISSION_STATUS_BADGE: Record<SubmissionStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  submitted: 'bg-amber-50 text-amber-700 ring-amber-200',
  dean_approved: 'bg-blue-50 text-blue-700 ring-blue-200',
  vpaa_approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  recalled: 'bg-orange-50 text-orange-700 ring-orange-200',
  rejected: 'bg-red-50 text-red-700 ring-red-200',
};

export const REVISION_STATUS_BADGE: Record<RevisionStatus, string> = {
  initial: 'bg-slate-50 text-slate-600 ring-slate-200',
  modified: 'bg-violet-50 text-violet-700 ring-violet-200',
  reset: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export const isSubmissionStatus = (value: unknown): value is SubmissionStatus =>
  typeof value === 'string' && value in SUBMISSION_STATUS_LABELS;

export const isRevisionStatus = (value: unknown): value is RevisionStatus =>
  value === 'initial' || value === 'modified' || value === 'reset';
