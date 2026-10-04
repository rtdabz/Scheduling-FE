export const VPAA_APPROVED_STATUSES = ['approved', 'faculty_assignment', 'reassignment', 'finalized'] as const;

export type VpaaApprovedStatus = typeof VPAA_APPROVED_STATUSES[number];

export const isVpaaApproved = (status?: string | null): boolean =>
  VPAA_APPROVED_STATUSES.includes((status ?? '').trim().toLowerCase() as VpaaApprovedStatus);
