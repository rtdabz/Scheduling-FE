import { splitSubmission, type QueueSubmissionLike } from './approvalQueue';
import { roomTransferMovedCount, type RoomTransferRequest } from './roomRecovery';

export type ReviewStage = 'dean' | 'vpaa';

/** One request waiting on a reviewer: a schedule submission slice or a room transfer, never mixed into section totals. */
export interface PendingRequest {
  key: string;
  type: 'schedule' | 'room_transfer';
  departmentId: number | null;
  department: string;
  sectionIds: string[];
  sectionCount: number;
  meetingCount: number;
  waitingSince: string | null;
  waitingApproximate: boolean;
  submittedBy: string | null;
  override: boolean;
  overrideReason: string | null;
  revisionNumber: number;
  transferId?: string;
  semesterId: number | null;
  semesterLabel?: string;
}

interface StageTimes { submitted_at?: string | null; dean_reviewed_at?: string | null }

/**
 * When the request entered this reviewer's stage. VPAA uses the Dean handoff;
 * without it the submission time is a stand-in, flagged so it is not shown as exact.
 */
export const waitingSinceFor = (stage: ReviewStage, times: StageTimes): { at: string | null; approximate: boolean } => {
  if (stage === 'dean') return { at: times.submitted_at || null, approximate: false };
  if (times.dean_reviewed_at) return { at: times.dean_reviewed_at, approximate: false };
  return times.submitted_at ? { at: times.submitted_at, approximate: true } : { at: null, approximate: false };
};

const PENDING_STATUS: Record<ReviewStage, 'pending_dean' | 'pending_vpaa'> = { dean: 'pending_dean', vpaa: 'pending_vpaa' };

export interface DashboardSubmission extends QueueSubmissionLike, StageTimes {
  department_id: number | string;
  semester_id: number | string;
  revision_number?: number;
  approval_override?: boolean;
  approval_override_reason?: string | null;
  submitter?: { name?: string } | null;
}

/** Same slicing as the approval workspace, so a partial withdrawal is one active request, not two. */
export const pendingScheduleRequests = <T extends DashboardSubmission>(
  stage: ReviewStage,
  submissions: T[],
  scheduleStatusesOf: (submission: T, sectionIds: string[]) => Iterable<string>,
  departmentName: (departmentId: number) => string = () => '',
): PendingRequest[] => submissions
  .flatMap(submission => splitSubmission(submission, sectionIds => scheduleStatusesOf(submission, sectionIds)))
  .filter(slice => slice.submission.status === PENDING_STATUS[stage])
  .map(({ key, submission, sectionIds }) => {
    const waiting = waitingSinceFor(stage, submission);
    const departmentId = Number(submission.department_id);
    return {
      key,
      type: 'schedule' as const,
      departmentId,
      department: departmentName(departmentId),
      sectionIds,
      sectionCount: sectionIds.length,
      meetingCount: 0,
      waitingSince: waiting.at,
      waitingApproximate: waiting.approximate,
      submittedBy: submission.submitter?.name?.trim() || null,
      override: Boolean(submission.approval_override),
      overrideReason: submission.approval_override_reason ?? null,
      revisionNumber: submission.revision_number ?? 1,
      semesterId: Number(submission.semester_id),
    };
  });

/** Room transfers the server already scoped to this reviewer; only the ones at their stage are pending. */
export const pendingTransferRequests = (stage: ReviewStage, transfers: RoomTransferRequest[]): PendingRequest[] => transfers
  .filter(transfer => transfer.status === PENDING_STATUS[stage])
  .map(transfer => {
    const waiting = waitingSinceFor(stage, transfer);
    return {
      key: `room-transfer:${transfer.id}`,
      type: 'room_transfer' as const,
      departmentId: transfer.department_id ?? null,
      department: transfer.department,
      sectionIds: [],
      sectionCount: new Set(transfer.changes.map(change => change.section)).size,
      meetingCount: roomTransferMovedCount(transfer),
      waitingSince: waiting.at,
      waitingApproximate: waiting.approximate,
      submittedBy: transfer.submitted_by || null,
      override: false,
      overrideReason: null,
      revisionNumber: 1,
      transferId: transfer.id,
      semesterId: transfer.semester_id ?? null,
      semesterLabel: transfer.semester_label,
    };
  });

export const oldestWaitingFirst = (a: { waitingSince: string | null }, b: { waitingSince: string | null }) => {
  if (!a.waitingSince) return b.waitingSince ? 1 : 0;
  if (!b.waitingSince) return -1;
  return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
};

/** Where a dashboard row opens. Transfers have a detail parameter; schedule submissions open the pending queue. */
export const reviewPath = (base: string, request: Pick<PendingRequest, 'type' | 'transferId'>) =>
  request.type === 'room_transfer' && request.transferId ? `${base}?room_transfer=${encodeURIComponent(request.transferId)}` : base;
