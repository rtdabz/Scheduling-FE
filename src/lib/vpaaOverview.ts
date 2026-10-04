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

export type SectionStage = 'draft' | 'pending_dean' | 'pending_vpaa' | 'approved' | 'returned';

export interface DepartmentRollup {
  id: number;
  department_name: string;
  department_code: string;
  sectionsCount: number;
  approvedCount: number;
  pendingCount: number;
  pendingVpaaCount: number;
  returnedCount: number;
  draftCount: number;
  submittedAt: string | null;
  hasOverride: boolean;
  overrideReason: string | null;
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

const newestFirst = (a: OverviewSubmission, b: OverviewSubmission) => {
  if (a.revision_number !== b.revision_number) return b.revision_number - a.revision_number;
  const stamp = (s: OverviewSubmission) =>
    s.vpaa_reviewed_at ?? s.dean_reviewed_at ?? s.submitted_at ?? '';
  return stamp(b).localeCompare(stamp(a));
};

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
