/**
 * Schedule lifecycle statuses, and the subset that counts as published.
 *
 * `schedules.status` is not flipped to 'approved' when the VPAA approves a
 * submission: DepartmentScheduleController::approveByVpaa() moves the rows to
 * 'faculty_assignment', and instructor reassignment and semester lock-in move them
 * on again to 'reassignment' and 'finalized'. Approval ownership itself lives
 * on schedule_submissions.status, which is where the plain 'approved' value
 * appears. 'approved' survives on schedules only for rows written before that
 * split.
 *
 * Mirrors ScheduleSemesterArchiver::VPAA_APPROVED_STATUSES on the backend — keep
 * the two lists in step.
 */
export const VPAA_APPROVED_STATUSES = ['approved', 'faculty_assignment', 'reassignment', 'finalized'] as const;

export type VpaaApprovedStatus = typeof VPAA_APPROVED_STATUSES[number];

/**
 * True once a schedule has cleared VPAA approval and may be plotted on a
 * published view such as a dashboard timetable. Draft, submitted and
 * dean-approved rows stay confined to their workflow screens.
 */
export const isVpaaApproved = (status?: string | null): boolean =>
  VPAA_APPROVED_STATUSES.includes((status ?? '').trim().toLowerCase() as VpaaApprovedStatus);
