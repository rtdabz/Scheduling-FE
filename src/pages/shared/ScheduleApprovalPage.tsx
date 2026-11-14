import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Eye, Undo2 } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import TableActionButton from '../../components/ui/TableActionButton';
import DataTable from '../../components/ui/DataTable';
import ConfirmModal from '../../components/ui/ConfirmModal';
import RoomTransferRequests from '../../components/rooms/RoomTransferRequests';
import LoadErrorBanner from '../../components/ui/LoadErrorBanner';
import TruncatedDataNotice from '../../components/ui/TruncatedDataNotice';
import ScheduleApprovalPreviewModal from '../../components/scheduling/ScheduleApprovalPreviewModal';
import ScheduleRejectionModal from '../../components/scheduling/ScheduleRejectionModal';
import ScheduleApprovalDetailsModal from '../../components/scheduling/ScheduleApprovalDetailsModal';
import { PreApprovalCheckResults } from '../../components/scheduling/PreApprovalCheck';
import { usePreApprovalCheck } from '../../components/scheduling/usePreApprovalCheck';
import RevisionChangesPanel from '../../components/scheduling/RevisionChangesPanel';
import RevisionDiffPanel from '../../components/scheduling/RevisionDiffPanel';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { recoveryError, roomTransferDetailChanges, type RoomTransferRequest } from '../../lib/roomRecovery';
import { programLabel } from '../../lib/programLabel';
import { publishLiveTopics } from '../../lib/liveUpdates';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import {
  scheduleStatusesForSubmission,
  splitSubmission,
  stageOfScheduleStatuses,
  submissionDisplayStatus,
  type ApprovalDisplayStatus,
  type QueueSubmissionStatus,
} from '../../lib/approvalQueue';
import { useToast } from '../../context/ToastContext';
import {
  isRevisionStatus,
  REVISION_STATUS_BADGE,
  REVISION_STATUS_LABELS,
  type RevisionStatus,
} from '../../lib/submissionStatus';
import { mapApiScheduleToItem, mapInitialData, type InitialDataResponse, type SchedulerCacheData } from '../ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import type { ApiScheduleRecord, ScheduleItem, ScheduleSignatories } from '../ClassSchedules/SchedulerPanel/types';
import type { SchedulePdfInput } from '../ClassSchedules/SchedulerPanel/schedulePdf';
import FilterBar from '../../components/ui/FilterBar';
import type { RecalledSectionDetail } from '../../components/scheduling/ScheduleApprovalDetailsModal';
import type { ScheduleConflictState } from '../../components/scheduling/scheduleTableColumns';
import { conflictFlagsBySchedule } from '../../lib/conflicts';
import { academicYearLabel, semesterLabel } from '../../lib/semesterLabel';

export type ApprovalStage = 'dean' | 'vpaa';

type Mode = 'on-site' | 'online' | 'field';
type QueueTab = 'pending' | 'approved' | 'withdrawn' | 'rejected';
type RequestType = 'approval' | 'withdrawal' | 'revision' | 'room_transfer';

interface ScheduleApproval {
  id: number;
  submissionId: number;
  entryKey: string;
  department: string;
  program: string;
  section: string;
  subjectsScheduled: number;
  submittedBy: string;
  submittedAt: string;
  deanReviewedAt: string | null;
  status: ApprovalDisplayStatus;
  submissionStatus: QueueSubmissionStatus;
  requestType: RequestType;
  revisionStatus: RevisionStatus;
  workflowSectionIds: string[];
  sectionCount: number;
  /** Every section the submission was sent with, recalled ones included. */
  originalSectionCount: number;
  /** Sections recalled from the submission; kept on its record, excluded from its approval. */
  recalledSections: Array<{ id: string; name: string }>;
  transfer?: RoomTransferRequest;
  /** Officials recorded on the submission; its print never uses whoever holds the office later. */
  signatories?: ScheduleSignatories | null;
}

interface RawDepartment {
  id: number | string;
  department_name: string;
}

interface RawSection {
  id: number | string;
  section_name: string;
  department_id: number | string;
  semester_id: number | string;
  program_id?: number | string | null;
  program?: { id: number | string; code?: string | null; name?: string | null; major?: string | null } | null;
}

interface RawSchedule {
  id: number | string;
  department_id: number | string;
  section_id: number | string;
  course_id?: number | string;
  subject_id?: number | string;
  semester_id: number | string;
  mode: Mode;
  status: string;
  room?: { room_code?: string } | null;
  department?: { department_name?: string } | null;
}

interface RawScheduleSubmission {
  id: number;
  department_id: number | string;
  semester_id: number | string;
  revision_number: number;
  status: QueueSubmissionStatus;
  submitted_at: string | null;
  dean_reviewed_at: string | null;
  approval_override?: boolean;
  section_count?: number | null;
  subject_count?: number | null;
  revision_status?: string;
  sections: Array<RawSection & { pivot?: { state?: 'included' | 'withdrawn' } }>;
  submitter?: { name?: string } | null;
  signatories?: ScheduleSignatories | null;
}

interface ApprovalPayload {
  active_semester: { id: number | string } | null;
  departments?: RawDepartment[];
  sections: RawSection[];
  schedules: RawSchedule[];
  schedule_submissions: RawScheduleSubmission[];
  schedules_truncated?: boolean;
}

const CLOSED_SUBMISSION_STATUSES = new Set<QueueSubmissionStatus>([
  'withdrawn',
  'partially_withdrawn',
  'rejected_by_dean',
  'rejected_by_vpaa',
]);

interface SubmissionSnapshotResponse {
  data: {
    available: boolean;
    schedules: ApiScheduleRecord[];
  };
}

const SCHEDULE_LIMIT = 2000;

const STATUS_LABELS: Record<ApprovalDisplayStatus, string> = {
  submitted: 'Pending Dean Approval',
  approved_by_dean: 'Pending VPAA Approval',
  conditionally_approved: 'Conditional Approval — Room TBA',
  rejected_by_dean: 'Rejected by Dean',
  approved: 'Approved',
  rejected: 'Rejected by VPAA',
  revision: 'Recalled for Revision',
};

const STATUS_BADGES: Record<ApprovalDisplayStatus, string> = {
  submitted: 'bg-amber-100 text-amber-800 border-amber-200/60',
  approved_by_dean: 'bg-blue-100 text-blue-800 border-blue-200/60',
  conditionally_approved: 'bg-amber-100 text-amber-800 border-amber-200/60',
  rejected_by_dean: 'bg-rose-100 text-rose-800 border-rose-200/60',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200/60',
  rejected: 'bg-red-100 text-red-800 border-red-200/60',
  revision: 'bg-orange-100 text-orange-800 border-orange-200/60',
};


const QUEUE_TABS: Array<{ id: QueueTab; label: string }> = [
  { id: 'pending', label: 'Pending Approval' },
  { id: 'approved', label: 'Schedule Approved' },
  { id: 'withdrawn', label: 'Recalled' },
  { id: 'rejected', label: 'Rejected' },
];

const isPendingFor = (stage: ApprovalStage, status: ApprovalDisplayStatus) => (stage === 'dean'
  ? status === 'submitted'
  : status === 'approved_by_dean' || status === 'conditionally_approved');

const matchesQueueTab = (stage: ApprovalStage, entry: ScheduleApproval, tab: QueueTab): boolean => {
  if (tab === 'withdrawn') return entry.requestType === 'withdrawal';
  if (tab === 'pending') return (entry.requestType === 'approval' || entry.requestType === 'room_transfer') && isPendingFor(stage, entry.status);
  if (tab === 'approved') {
    return stage === 'dean'
      ? ['approved_by_dean', 'conditionally_approved', 'approved'].includes(entry.status)
      : entry.status === 'approved';
  }
  return entry.status === 'rejected' || entry.status === 'rejected_by_dean';
};

const requestTypeOf = (status: QueueSubmissionStatus): RequestType => {
  if (status === 'withdrawn' || status === 'partially_withdrawn') return 'withdrawal';
  if (status.startsWith('rejected_')) return 'revision';
  return 'approval';
};

const formatSectionSummary = (sections: RawSection[], sectionIds: string[]): string => {
  const selected = new Set(sectionIds);
  const visible = sections.filter((section) => selected.has(String(section.id)));
  if (visible.length === 0) return `${selected.size} section${selected.size !== 1 ? 's' : ''}`;
  return visible.map((section) => section.section_name).join(', ');
};

const formatProgramSummary = (sections: RawSection[], sectionIds: string[]): string => {
  const selected = new Set(sectionIds);
  const programs = new Map<string, NonNullable<RawSection['program']>>();
  sections
    .filter((section) => selected.has(String(section.id)) && section.program)
    .forEach((section) => programs.set(String(section.program!.id), section.program!));
  const list = Array.from(programs.values());
  if (list.length === 0) return 'No program';
  return list.map((program) => program.code?.trim() || programLabel(program)).sort().join(', ');
};

const entryLabel = (entry: Pick<ScheduleApproval, 'department' | 'program'>): string => (
  entry.program === 'No program' ? entry.department : `${entry.department} (${entry.program})`
);

const parseApiDate = (value: string): Date => {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const date = parseApiDate(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: '2-digit', year: 'numeric' })} ${date.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}`;
};

/** Where a recalled section is now, read from its current meetings (a resubmission moves them on). */
const recalledSectionDetail = (section: { id: string; name: string }, statuses: string[]): RecalledSectionDetail => {
  const stage = stageOfScheduleStatuses(statuses);
  if (stage === 'pending_dean') return { ...section, status: 'Resubmitted · Pending Dean approval', tone: 'pending' };
  if (stage === 'pending_vpaa') return { ...section, status: 'Resubmitted · Pending VPAA approval', tone: 'pending' };
  if (stage === 'approved') return { ...section, status: 'Resubmitted · Approved', tone: 'approved' };
  if (statuses.some((status) => status === 'rejected' || status === 'rejected_by_dean')) {
    return { ...section, status: 'Resubmitted · Returned for revision', tone: 'returned' };
  }
  if (statuses.length === 0) return { ...section, status: 'Status not loaded', tone: 'revision' };
  return { ...section, status: statuses.every((status) => status === 'revision') ? 'Awaiting revision' : 'Being revised', tone: 'revision' };
};

const countLabel = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** One line describing which sections an entry's review covers; recalled history says so instead. */
const detailsScope = (entry: ScheduleApproval): { summary: string; exclusionNote: string | null } => {
  const original = entry.originalSectionCount;
  const recalled = entry.recalledSections.length;
  if (entry.requestType === 'withdrawal') {
    const count = entry.workflowSectionIds.length;
    return { summary: `${countLabel(count, 'recalled section')}${count < original ? ` of ${original}` : ''}`, exclusionNote: null };
  }
  if (recalled > 0) {
    return {
      summary: `${original - recalled} of ${original} sections included · ${recalled} recalled`,
      exclusionNote: entry.requestType === 'approval' ? 'Recalled sections are excluded from this approval.' : null,
    };
  }
  return { summary: countLabel(original, 'section'), exclusionNote: null };
};

const STAGE_ENDPOINT: Record<ApprovalStage, { approve: string; reject: string }> = {
  dean: { approve: 'approve-by-dean', reject: 'return-by-dean' },
  vpaa: { approve: 'approve-by-vpaa', reject: 'return-by-vpaa' },
};

/**
 * A queue slice's identity across refreshes. One submission can show as a recalled slice and an
 * active one at the same time, and its entry key changes from `7` to `7:active` after a partial
 * recall, so neither the submission ID nor the entry key alone identifies what the reviewer opened.
 */
const selectionKeyOf = (entry: ScheduleApproval): string => (
  entry.transfer ? `room-transfer:${entry.transfer.id}` : `${entry.submissionId}:${entry.requestType}`
);

const sectionScopeOf = (entry: ScheduleApproval): string => (
  [...entry.workflowSectionIds].sort((left, right) => Number(left) - Number(right)).join(',')
);

/** What one approval or return confirmation authorizes: this slice, at this stage, with exactly these sections. */
interface ReviewIntent {
  key: string;
  submissionId: number;
  status: ApprovalDisplayStatus;
  sectionScope: string;
}

const intentFor = (entry: ScheduleApproval): ReviewIntent => ({
  key: selectionKeyOf(entry),
  submissionId: entry.submissionId,
  status: entry.status,
  sectionScope: sectionScopeOf(entry),
});

const errorCodeOf = (error: unknown): string | undefined => (
  (error as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code
);

const SCHEDULE_CHANGED_MESSAGE = 'This schedule changed while you were reviewing it. Open it again to review the current version.';
const QUEUE_REFRESHING_MESSAGE = 'The approval queue is refreshing. Confirm again once it has loaded.';

interface ApprovalQueueCache {
  entries: ScheduleApproval[];
  rawSchedules: RawSchedule[];
  departments: RawDepartment[];
  printSource: SchedulerCacheData | null;
  isTruncated: boolean;
}

export default function ScheduleApprovalPage({ stage }: { stage: ApprovalStage }) {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const user = useMemo(() => getStoredUser(), []);
  const scopeDepartmentId = stage === 'dean' ? user?.department_id ?? null : null;

  const cacheKey = `page:approval-queue:${stage}:${scopeDepartmentId ?? 'all'}`;
  const [cached] = useState(() => getCachedData<ApprovalQueueCache>(cacheKey));
  const [entries, setEntries] = useState<ScheduleApproval[]>(cached?.entries ?? []);
  const [rawSchedules, setRawSchedules] = useState<RawSchedule[]>(cached?.rawSchedules ?? []);
  const [departments, setDepartments] = useState<RawDepartment[]>(cached?.departments ?? []);
  const [printSource, setPrintSource] = useState<SchedulerCacheData | null>(cached?.printSource ?? null);
  const [isLoading, setIsLoading] = useState(!cached);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState(cached?.isTruncated ?? false);
  const [reloadKey, setReloadKey] = useState(0);
  const [transfers, setTransfers] = useState<RoomTransferRequest[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(true);
  const [transfersError, setTransfersError] = useState('');

  const [selectedQueueTab, setSelectedQueueTab] = useState<QueueTab>('pending');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | ApprovalDisplayStatus>('all');
  const [selectedRequestType, setSelectedRequestType] = useState<'all' | 'schedule' | 'room_transfer'>('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  // Selections hold an identity, never a copied entry: what is shown and acted on is read from the latest queue.
  const [viewKey, setViewKey] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [changesFirst, setChangesFirst] = useState(false);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const [viewSnapshot, setViewSnapshot] = useState<{ submissionId: number; schedules: ScheduleItem[] | null } | null>(null);
  const [approval, setApproval] = useState<{ intent: ReviewIntent; roomTba: boolean } | null>(null);
  const [tbaReason, setTbaReason] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [rejectIntent, setRejectIntent] = useState<ReviewIntent | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const mutationRunning = useRef(false);

  const liveRevision = useLiveRevision(['approvals', 'schedules']);
  // Approval and return act only on a queue loaded for the current request. A live event or refresh
  // changes the request immediately, so actions wait until that reload succeeds. Cached data can be
  // shown but never makes an action available.
  const requestKey = `${cacheKey}|${liveRevision}|${reloadKey}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const queueFresh = loadedKey === requestKey;

  useEffect(() => {
    const controller = new AbortController();
    void api.get<{ transfers: RoomTransferRequest[] }>('/room-recovery/transfers', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setTransfers(data.transfers ?? []); setTransfersError(''); } })
      .catch(error => { if (!controller.signal.aborted) setTransfersError(recoveryError(error)); })
      .finally(() => { if (!controller.signal.aborted) setTransfersLoading(false); });
    return () => controller.abort();
  }, [liveRevision, reloadKey, stage, scopeDepartmentId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (liveRevision === 0 && reloadKey === 0 && !hasCachedData(cacheKey)) setIsLoading(true);
      setLoadError(null);
      try {
        const { data } = await api.get<ApprovalPayload>('/initial-data', {
          params: { schedule_limit: SCHEDULE_LIMIT, ...(stage === 'vpaa' ? { approval_queue: 1 } : {}) },
        });
        if (!active) return;

        const semesterId = data.active_semester ? Number(data.active_semester.id) : null;
        const inScope = (departmentId: number | string) => scopeDepartmentId === null || Number(departmentId) === Number(scopeDepartmentId);
        const inSemester = (id: number | string) => semesterId === null || Number(id) === semesterId;

        const sections = (data.sections ?? []).filter((s) => inSemester(s.semester_id) && inScope(s.department_id));
        const schedules = (data.schedules ?? []).filter((s) => inSemester(s.semester_id) && inScope(s.department_id));
        const departmentNames = new Map((data.departments ?? []).map((d) => [String(d.id), d.department_name]));

        const sectionsByDepartment = new Map<string, RawSection[]>();
        sections.forEach((section) => {
          const key = String(section.department_id);
          sectionsByDepartment.set(key, [...(sectionsByDepartment.get(key) ?? []), section]);
        });
        const schedulesByDepartment = new Map<string, RawSchedule[]>();
        schedules.forEach((schedule) => {
          const key = String(schedule.department_id);
          schedulesByDepartment.set(key, [...(schedulesByDepartment.get(key) ?? []), schedule]);
        });

        const mapped = (data.schedule_submissions ?? [])
          .filter((submission) => inSemester(submission.semester_id) && inScope(submission.department_id))
          .flatMap((submission) => {
            const departmentSchedules = schedulesByDepartment.get(String(submission.department_id)) ?? [];
            return splitSubmission(submission, (sectionIds) => departmentSchedules
              .filter((schedule) => sectionIds.includes(String(schedule.section_id)))
              .map((schedule) => schedule.status));
          })
          .map(({ key, submission, sectionIds }): ScheduleApproval => {
            const departmentId = String(submission.department_id);
            const departmentSchedules = schedulesByDepartment.get(departmentId) ?? [];
            const allowed = new Set(scheduleStatusesForSubmission(submission.status));
            const packageSchedules = departmentSchedules.filter((schedule) => (
              sectionIds.includes(String(schedule.section_id)) && allowed.has(schedule.status)
            ));
            const wholeSubmission = sectionIds.length >= submission.sections.length;
            const liveSubjects = new Set(packageSchedules.map((schedule) => String(schedule.course_id ?? schedule.subject_id))).size;
            return {
              id: Number(submission.department_id),
              submissionId: submission.id,
              entryKey: key,
              department: packageSchedules[0]?.department?.department_name
                ?? departmentNames.get(departmentId)
                ?? departmentSchedules[0]?.department?.department_name
                ?? '',
              program: formatProgramSummary(submission.sections, sectionIds),
              section: formatSectionSummary(sectionsByDepartment.get(departmentId) ?? [], sectionIds),
              subjectsScheduled: wholeSubmission ? submission.subject_count ?? liveSubjects : liveSubjects,
              sectionCount: wholeSubmission ? submission.section_count ?? sectionIds.length : sectionIds.length,
              submittedBy: submission.submitter?.name ?? 'Submitter unavailable',
              submittedAt: submission.submitted_at ?? '',
              deanReviewedAt: submission.dean_reviewed_at,
              status: submissionDisplayStatus(submission),
              submissionStatus: submission.status,
              requestType: requestTypeOf(submission.status),
              revisionStatus: isRevisionStatus(submission.revision_status) ? submission.revision_status : 'initial',
              workflowSectionIds: sectionIds,
              originalSectionCount: submission.sections.length,
              recalledSections: submission.sections
                .filter((section) => section.pivot?.state === 'withdrawn')
                .map((section) => ({ id: String(section.id), name: section.section_name }))
                .sort((left, right) => left.name.localeCompare(right.name)),
              signatories: submission.signatories ?? null,
            };
          });

        const nextPrintSource = mapInitialData(data as unknown as InitialDataResponse, {
          isVpaa: stage === 'vpaa',
          userDepartmentId: scopeDepartmentId,
        });
        setPrintSource(nextPrintSource);
        setDepartments(data.departments ?? []);
        setRawSchedules(schedules);
        setEntries(mapped);
        setIsTruncated(data.schedules_truncated === true);
        setLoadedKey(requestKey);
        setCachedData<ApprovalQueueCache>(cacheKey, {
          entries: mapped,
          rawSchedules: schedules,
          departments: data.departments ?? [],
          printSource: nextPrintSource,
          isTruncated: data.schedules_truncated === true,
        });
      } catch (error) {
        if (!active) return;
        const message = apiErrorMessage(error, 'The approval queue could not be loaded.');
        setLoadError(message);
        toast.error('Load Failed', message);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [cacheKey, liveRevision, reloadKey, requestKey, scopeDepartmentId, stage, toast]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);
  const closeTransfer = useCallback(() => {
    setViewKey(null);
    setParams(current => { const next = new URLSearchParams(current); next.delete('room_transfer'); return next; }, { replace: true });
  }, [setParams]);
  const transferReviewed = useCallback(() => { closeTransfer(); refresh(); }, [closeTransfer, refresh]);

  const queueEntries = useMemo<ScheduleApproval[]>(() => [...entries, ...transfers.map((transfer): ScheduleApproval => {
    const changes = roomTransferDetailChanges(transfer);
    const sections = [...new Set(changes.map(change => change.section))];
    const sectionRecords = changes.flatMap(change => change.preview_schedule?.section ? [change.preview_schedule.section] : []);
    return {
      id: transfer.department_id ?? Number(departments.find(department => department.department_name === transfer.department)?.id ?? 0),
      submissionId: 0,
      entryKey: `room-transfer:${transfer.id}`,
      department: transfer.department,
      program: formatProgramSummary(sectionRecords, sectionRecords.map(section => String(section.id))),
      section: sections.join(', '),
      sectionCount: sections.length,
      originalSectionCount: sections.length,
      recalledSections: [],
      subjectsScheduled: new Set(changes.map(change => change.course)).size,
      submittedBy: transfer.submitted_by,
      submittedAt: transfer.submitted_at,
      deanReviewedAt: transfer.dean_reviewed_at ?? null,
      status: transfer.status === 'pending_dean' ? 'submitted' : transfer.status === 'pending_vpaa' ? 'approved_by_dean' : transfer.status === 'rejected_by_vpaa' ? 'rejected' : transfer.status === 'applied' ? 'approved' : transfer.status,
      submissionStatus: transfer.status === 'applied' ? 'approved' : transfer.status,
      requestType: 'room_transfer',
      // A transfer changes existing schedules; the badge opens its original and proposed placements.
      revisionStatus: 'modified',
      workflowSectionIds: [],
      transfer,
    };
  })], [entries, transfers, departments]);

  const resetPage = () => setPagination((prev) => ({ ...prev, pageIndex: 0 }));

  const resetFilters = () => {
    setSelectedQueueTab('pending');
    setSelectedDepartmentId('all');
    setSelectedStatus('all');
    setSelectedRequestType('all');
    resetPage();
  };

  const tabEntries = useMemo(
    () => queueEntries.filter((entry) => matchesQueueTab(stage, entry, selectedQueueTab)),
    [queueEntries, selectedQueueTab, stage],
  );

  const statusOptions = useMemo(
    () => Array.from(new Set(tabEntries.map((entry) => entry.status))),
    [tabEntries],
  );

  const filteredData = useMemo(() => tabEntries.filter((entry) => (
    (selectedDepartmentId === 'all' || String(entry.id) === selectedDepartmentId)
    && (selectedStatus === 'all' || entry.status === selectedStatus)
    && (selectedRequestType === 'all' || (selectedRequestType === 'room_transfer' ? !!entry.transfer : !entry.transfer))
  )), [selectedDepartmentId, selectedStatus, selectedRequestType, tabEntries]);

  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(filteredData.length / pagination.pageSize) - 1);
    if (pagination.pageIndex > lastPage) setPagination(previous => ({ ...previous, pageIndex: lastPage }));
  }, [filteredData.length, pagination.pageIndex, pagination.pageSize]);

  const queueCounts = useMemo(() => QUEUE_TABS.reduce<Record<QueueTab, number>>((counts, tab) => {
    counts[tab.id] = queueEntries.filter((entry) => matchesQueueTab(stage, entry, tab.id)).length;
    return counts;
  }, { pending: 0, approved: 0, withdrawn: 0, rejected: 0 }), [queueEntries, stage]);

  const inPackage = useCallback((entry: ScheduleApproval, schedule: RawSchedule) => (
    Number(schedule.department_id) === entry.id
    && entry.workflowSectionIds.includes(String(schedule.section_id))
  ), []);

  const viewEntry = useMemo(
    () => (viewKey === null ? null : queueEntries.find((entry) => selectionKeyOf(entry) === viewKey) ?? null),
    [queueEntries, viewKey],
  );
  // The opened slice left the current queue (recalled in full, or advanced out of it): close its preview.
  if (viewKey !== null && viewEntry === null && queueFresh && !transfersLoading) {
    setViewKey(null);
    setDetailsOpen(false);
  }

  const snapshotSubmissionId = viewEntry && !viewEntry.transfer && CLOSED_SUBMISSION_STATUSES.has(viewEntry.submissionStatus)
    ? viewEntry.submissionId
    : null;
  useEffect(() => {
    if (snapshotSubmissionId === null) return undefined;
    let active = true;
    const submissionId = snapshotSubmissionId;
    api.get<SubmissionSnapshotResponse>(`/schedule-submissions/${submissionId}/snapshot`)
      .then(({ data }) => {
        if (!active) return;
        setViewSnapshot({
          submissionId,
          schedules: data.data.available ? data.data.schedules.map(mapApiScheduleToItem) : null,
        });
      })
      .catch((error) => {
        if (!active) return;
        toast.error('Submitted Version Unavailable', apiErrorMessage(error, 'Showing the current working copy instead.'));
        setViewSnapshot({ submissionId, schedules: null });
      });
    return () => { active = false; };
  }, [toast, snapshotSubmissionId]);

  const viewIsClosed = viewEntry !== null && !viewEntry.transfer && CLOSED_SUBMISSION_STATUSES.has(viewEntry.submissionStatus);
  const viewSnapshotLoaded = viewSnapshot !== null && viewSnapshot.submissionId === viewEntry?.submissionId;
  const viewSnapshotLoading = viewIsClosed && !viewSnapshotLoaded;
  const viewSnapshotSchedules = viewIsClosed && viewSnapshotLoaded ? viewSnapshot.schedules : null;

  const printInput = useMemo<SchedulePdfInput | null>(() => {
    if (!viewEntry || viewEntry.transfer || !printSource || viewSnapshotLoading) return null;
    const allowed = new Set(scheduleStatusesForSubmission(viewEntry.submissionStatus));
    const scheduleIds = new Set(rawSchedules
      .filter((schedule) => inPackage(viewEntry, schedule) && allowed.has(schedule.status))
      .map((schedule) => String(schedule.id)));
    const sectionIds = new Set(viewEntry.workflowSectionIds);
    const sections = printSource.sections
      .filter((section) => sectionIds.has(section.id))
      .sort((left, right) => left.name.localeCompare(right.name));
    return {
      sections,
      allSchedules: viewSnapshotSchedules
        ? viewSnapshotSchedules.filter((schedule) => sectionIds.has(schedule.sectionId))
        : printSource.schedules.filter((schedule) => scheduleIds.has(String(schedule.id))),
      selectedSectionId: sections[0]?.id ?? '',
      departments: printSource.departments,
      users: printSource.users,
      activeSemester: printSource.activeSemester,
      signatories: viewEntry.signatories ?? null,
    };
  }, [inPackage, printSource, rawSchedules, viewEntry, viewSnapshotLoading, viewSnapshotSchedules]);

  const viewRecalled = useMemo(() => (viewEntry?.recalledSections ?? []).map((section) => recalledSectionDetail(
    section,
    rawSchedules.filter((schedule) => String(schedule.section_id) === section.id).map((schedule) => schedule.status),
  )), [rawSchedules, viewEntry]);
  const activeSemester = printSource?.activeSemester;
  const termLabel = activeSemester?.academic_year
    ? `${semesterLabel(activeSemester.semester)}, ${academicYearLabel(activeSemester.academic_year)}`
    : '—';

  const viewPending = viewEntry !== null && !viewEntry.transfer && viewEntry.requestType === 'approval' && isPendingFor(stage, viewEntry.status);
  // The check runs whenever a pending package is open, so approval stays blocked even while details are hidden.
  const viewCheck = usePreApprovalCheck({
    departmentId: viewEntry && !viewEntry.transfer ? viewEntry.id : null,
    sectionIds: viewEntry?.workflowSectionIds ?? [],
    enabled: viewPending,
  });
  // The details table may say "No conflict" only after this package's check succeeded.
  const detailsConflicts = useMemo<ScheduleConflictState>(() => {
    if (!viewPending) return { status: 'not-checked' };
    if (viewCheck.status === 'ready') return { status: 'ready', flags: conflictFlagsBySchedule(viewCheck.result.open) };
    return { status: viewCheck.status === 'failed' ? 'failed' : 'loading' };
  }, [viewCheck, viewPending]);
  // A closed record whose submitted snapshot could not be read prints the current working copy instead.
  const viewSnapshotFellBack = viewIsClosed && viewSnapshotLoaded && viewSnapshotSchedules === null;
  const viewOpenConflicts = viewCheck.status === 'ready' ? viewCheck.result.open.length : 0;
  const approveBlockedReason = viewOpenConflicts > 0
    ? `This schedule has ${viewOpenConflicts} open conflict${viewOpenConflicts === 1 ? '' : 's'}. Return it for revision.`
    : null;

  const openView = useCallback((entry: ScheduleApproval, withDetails = false) => {
    setViewKey(selectionKeyOf(entry));
    setDetailsOpen(withDetails && !entry.transfer);
    // Opened from the Modified badge: the reviewer asked to see what changed, so start with it expanded.
    setChangesFirst(withDetails);
  }, []);
  const closeView = useCallback(() => {
    setViewKey(null);
    setDetailsOpen(false);
  }, []);
  const closeDetails = useCallback(() => setDetailsOpen(false), []);

  // Details can open straight from the queue's Modified badge; however they opened, closing them returns
  // focus to View details in the preview rather than to the control behind the preview.
  const detailsWasOpen = useRef(false);
  useEffect(() => {
    if (detailsWasOpen.current && !detailsOpen && viewEntry) detailsButtonRef.current?.focus();
    detailsWasOpen.current = detailsOpen;
  }, [detailsOpen, viewEntry]);

  const needsRoomTba = useCallback((entry: ScheduleApproval, schedules: RawSchedule[]) => stage === 'dean' && schedules.some((schedule) => (
    inPackage(entry, schedule) && schedule.status === 'submitted' && schedule.mode === 'on-site' && !schedule.room
  )), [inPackage, stage]);

  /** The entry an intent still describes, or null when its slice, stage, or section set has changed. */
  const intentTarget = useCallback((intent: ReviewIntent, queue: ScheduleApproval[]): ScheduleApproval | null => {
    const entry = queue.find((candidate) => selectionKeyOf(candidate) === intent.key);
    return entry
      && entry.requestType === 'approval'
      && isPendingFor(stage, entry.status)
      && entry.status === intent.status
      && entry.submissionId === intent.submissionId
      && sectionScopeOf(entry) === intent.sectionScope
      ? entry
      : null;
  }, [stage]);

  // Handlers read the latest queue through this ref, so a callback that outlives its render (a dialog
  // or preview control still mounted from an earlier queue) is checked against current data.
  const latest = useRef({ queueEntries, queueFresh, rawSchedules });
  useLayoutEffect(() => {
    latest.current = { queueEntries, queueFresh, rawSchedules };
  });

  // An open confirmation authorizes one slice, stage, and section set. When a current reload shows
  // something else, cancel it rather than let the reviewer confirm a package they did not review.
  useEffect(() => {
    if (!queueFresh) return;
    let changed = false;
    if (approval && !isApproving && intentTarget(approval.intent, queueEntries) === null) {
      setApproval(null);
      setTbaReason('');
      setApprovalError('');
      changed = true;
    }
    if (rejectIntent && !isRejecting && intentTarget(rejectIntent, queueEntries) === null) {
      setRejectIntent(null);
      setRejectReason('');
      setRejectError('');
      changed = true;
    }
    if (changed) toast.warning('Schedule Changed', SCHEDULE_CHANGED_MESSAGE);
  }, [approval, intentTarget, isApproving, isRejecting, queueEntries, queueFresh, rejectIntent, toast]);

  /** Open a confirmation for the slice currently identified by key, if it can be acted on now. */
  const openReview = (key: string, kind: 'approve' | 'reject'): boolean => {
    const { queueEntries: queue, queueFresh: fresh, rawSchedules: schedules } = latest.current;
    const entry = queue.find((candidate) => selectionKeyOf(candidate) === key);
    if (!fresh || mutationRunning.current || !entry || entry.requestType !== 'approval' || !isPendingFor(stage, entry.status)) {
      toast.warning('Schedule Changed', fresh ? SCHEDULE_CHANGED_MESSAGE : QUEUE_REFRESHING_MESSAGE);
      return false;
    }
    if (kind === 'approve') {
      setTbaReason('');
      setApprovalError('');
      setApproval({ intent: intentFor(entry), roomTba: needsRoomTba(entry, schedules) });
    } else {
      setRejectReason('');
      setRejectError('');
      setRejectIntent(intentFor(entry));
    }
    return true;
  };

  /**
   * Immediately before posting: the queue must be current and still show the intent's slice, stage,
   * and sections. Returns the entry to act on, or null after explaining why the action stopped.
   */
  const validatedTarget = (intent: ReviewIntent, showError: (message: string) => void): ScheduleApproval | null => {
    const { queueEntries: queue, queueFresh: fresh } = latest.current;
    if (!fresh) {
      showError(QUEUE_REFRESHING_MESSAGE);
      return null;
    }
    const entry = intentTarget(intent, queue);
    if (entry === null) {
      showError(SCHEDULE_CHANGED_MESSAGE);
      refresh();
    }
    return entry;
  };

  const confirmApproval = async () => {
    if (!approval || mutationRunning.current) return;
    const { intent } = approval;
    const entry = validatedTarget(intent, setApprovalError);
    if (!entry) return;
    const roomTba = approval.roomTba || needsRoomTba(entry, latest.current.rawSchedules);
    const reason = tbaReason.trim();
    if (roomTba && reason.length < 3) {
      setApprovalError('Give a reason for approving with Room TBA.');
      return;
    }

    mutationRunning.current = true;
    setIsApproving(true);
    try {
      await api.post(`/departments/${entry.id}/${STAGE_ENDPOINT[stage].approve}`, {
        schedule_submission_id: intent.submissionId,
        ...(roomTba ? { override_room_tba: true, override_reason: reason } : {}),
      });
      setApproval((current) => (current?.intent === intent ? null : current));
      setTbaReason('');
      toast.success('Approved', `${entryLabel(entry)} schedule has been approved.`);
      publishLiveTopics(['approvals']);
    } catch (error) {
      if (stage === 'dean' && !roomTba && errorCodeOf(error) === 'room_tba_override_required') {
        setApproval((current) => (current?.intent === intent ? { intent, roomTba: true } : current));
        setApprovalError('This schedule now has Room TBA classes. Give a reason to approve it conditionally.');
      } else {
        setApprovalError(apiErrorMessage(error, 'Failed to approve schedule.'));
        toast.error('Approval Failed', apiErrorMessage(error, 'Failed to approve schedule.'));
      }
    } finally {
      mutationRunning.current = false;
      setIsApproving(false);
      // The server decided; reload its queue instead of guessing the result locally.
      refresh();
    }
  };

  const confirmReject = async () => {
    if (!rejectIntent || mutationRunning.current) return;
    const intent = rejectIntent;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError('A reason for rejection is required.');
      return;
    }
    const entry = validatedTarget(intent, setRejectError);
    if (!entry) return;

    mutationRunning.current = true;
    setIsRejecting(true);
    try {
      await api.post(`/departments/${entry.id}/${STAGE_ENDPOINT[stage].reject}`, {
        schedule_submission_id: intent.submissionId,
        rejection_reason: reason,
      });
      setRejectIntent((current) => (current === intent ? null : current));
      setRejectReason('');
      toast.success('Returned for Revision', `${entryLabel(entry)} schedule has been returned for revision.`);
      publishLiveTopics(['approvals']);
    } catch (error) {
      // The dialog and the typed reason stay; the reload below cancels them only if the package changed.
      setRejectError(apiErrorMessage(error, 'Failed to return the schedule. Try again.'));
    } finally {
      mutationRunning.current = false;
      setIsRejecting(false);
      refresh();
    }
  };

  const approvalEntry = approval ? queueEntries.find((entry) => selectionKeyOf(entry) === approval.intent.key) ?? null : null;
  const approvalNeedsTba = approval !== null && (approval.roomTba || (approvalEntry !== null && needsRoomTba(approvalEntry, rawSchedules)));
  const rejectEntry = rejectIntent ? queueEntries.find((entry) => selectionKeyOf(entry) === rejectIntent.key) ?? null : null;
  const reviewWaiting = !queueFresh;

  const columns = useMemo<ColumnDef<ScheduleApproval>[]>(() => [
    {
      accessorKey: 'requestType',
      header: 'Request Type',
      cell: ({ row }) => <span className="whitespace-nowrap rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-800">{row.original.transfer ? 'Room Schedule Reassignment' : 'Schedule Approval'}</span>,
    },
    {
      accessorKey: 'department',
      header: 'Department',
      cell: (info) => <span className="font-bold text-gray-800">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'program',
      header: 'Program',
      cell: (info) => <span className="font-medium text-gray-700">{info.getValue() as string}</span>,
    },
    {
      id: 'sections',
      accessorFn: (entry) => entry.sectionCount,
      header: () => <div className="text-center">Sections</div>,
      cell: ({ row }) => {
        const count = row.original.sectionCount;
        const recalled = row.original.recalledSections.length;
        // A partly recalled package shows what is still in review against what was sent.
        if (recalled > 0 && row.original.requestType !== 'withdrawal') {
          return (
            <div className="flex flex-col items-center gap-1 text-center" title={row.original.section}>
              <span className="whitespace-nowrap font-semibold text-gray-700">{`${count}/${row.original.originalSectionCount} Active`}</span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                <Undo2 size={11} aria-hidden="true" />{`${recalled} Recalled`}
              </span>
            </div>
          );
        }
        return (
          <div className="text-center font-semibold text-gray-700" title={row.original.section}>
            {count} section{count === 1 ? '' : 's'}
          </div>
        );
      },
    },
    {
      accessorKey: 'subjectsScheduled',
      header: () => <div className="text-center">Subjects Scheduled</div>,
      cell: (info) => <div className="text-center font-semibold text-gray-700">{info.getValue() as number}</div>,
    },
    {
      accessorKey: 'submittedBy',
      header: 'Submitted By',
      cell: (info) => <span className="text-gray-600 font-medium">{info.getValue() as string}</span>,
    },
    {
      accessorKey: 'submittedAt',
      header: 'Submitted',
      cell: (info) => <span className="text-gray-500 font-medium">{formatDate(info.getValue() as string)}</span>,
    },
    {
      accessorKey: 'deanReviewedAt',
      header: 'Reviewed',
      cell: (info) => <span className="text-gray-500 font-medium">{formatDate(info.getValue() as string | null)}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => {
        const status = info.getValue() as ApprovalDisplayStatus;
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider ${STATUS_BADGES[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        );
      },
    },
    {
      accessorKey: 'revisionStatus',
      header: 'Revision',
      cell: (info) => {
        const revision = info.getValue() as RevisionStatus;
        const badgeClass = `px-2.5 py-0.5 rounded-full text-[11px] font-bold ring-1 ring-inset uppercase tracking-wider ${REVISION_STATUS_BADGE[revision]}`;
        return revision === 'modified' ? (
          <button
            type="button"
            title="See what changed from the previous version"
            onClick={() => openView(info.row.original, true)}
            className={`${badgeClass} cursor-pointer underline decoration-dotted underline-offset-2 hover:brightness-95`}
          >
            {REVISION_STATUS_LABELS[revision]}
          </button>
        ) : (
          <span className={badgeClass}>{REVISION_STATUS_LABELS[revision]}</span>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <TableActionButton label="View" variant="view" onClick={() => openView(row.original)}>
            <Eye size={17} />
          </TableActionButton>
        </div>
      ),
    },
  ], [openView]);

  const table = useReactTable<ScheduleApproval>({
    data: filteredData,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const selectClass = 'px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors';
  const viewTransferId = viewEntry ? viewEntry.transfer?.id : params.get('room_transfer');
  const viewTransfer = transfers.find(transfer => transfer.id === viewTransferId);

  return (
    <div className="relative">
      <div id="schedule-approval-tabs" className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-gray-150/70 bg-white p-2 shadow-sm">
        {QUEUE_TABS.map((tab) => {
          const active = selectedQueueTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelectedQueueTab(tab.id);
                setSelectedStatus('all');
                resetPage();
              }}
              className={`selection-indicator inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors ${active ? 'shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-[#4e0a10]/5 hover:text-[#4e0a10]'}`}
            >
              {tab.label}
              <span className="selection-indicator-count rounded-full px-2 py-0.5 text-[10px]">{queueCounts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      <FilterBar id="schedule-approval-filters" breakpoint="sm" className="mb-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap flex-1">
          <select aria-label="Request Type" value={selectedRequestType} onChange={event => { setSelectedRequestType(event.target.value as typeof selectedRequestType); resetPage(); }} className={selectClass}>
            <option value="all">All Request Types</option><option value="schedule">Schedule Approval</option><option value="room_transfer">Room Schedule Reassignment</option>
          </select>
          {stage === 'vpaa' && (
            <select
              aria-label="Department"
              value={selectedDepartmentId}
              onChange={(e) => { setSelectedDepartmentId(e.target.value); resetPage(); }}
              className={selectClass}
            >
              <option value="all">All Departments</option>
              {departments.map((department) => (
                <option key={department.id} value={String(department.id)}>{department.department_name}</option>
              ))}
            </select>
          )}

          {statusOptions.length > 1 && (
            <select
              aria-label="Status"
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value as 'all' | ApprovalDisplayStatus); resetPage(); }}
              className={selectClass}
            >
              <option value="all">All Status</option>
              {statusOptions.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={resetFilters}
          className="px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-xs font-bold transition-all duration-200 cursor-pointer"
        >
          Reset Filters
        </button>
      </FilterBar>

      {loadError && (
        <LoadErrorBanner message={`${loadError} The queue below may be empty or out of date.`} onRetry={refresh} className="mb-4" />
      )}
      {transfersError && <LoadErrorBanner message={`Room schedule reassignments could not be refreshed: ${transfersError} Regular schedule approvals remain available.`} onRetry={refresh} className="mb-4" />}

      {isTruncated && !loadError && (
        <TruncatedDataNotice className="mb-4">
          More than {SCHEDULE_LIMIT.toLocaleString()} class meetings are in review, so some are not loaded. Previews and printouts may be missing classes — review departments one at a time before approving.
        </TruncatedDataNotice>
      )}

      <div id="schedule-approval-list">
        <DataTable
          table={table}
          isLoading={isLoading || transfersLoading}
          totalLabel="requests"
          ariaLabel="Schedule submissions"
          onRowClick={(entry) => openView(entry)}
          scrollClassName="overflow-x-auto"
          scrollAriaLabel="Approval requests scroll area"
          emptyTitle={loadError ? 'The queue could not be loaded.' : 'No schedules found.'}
          emptyDescription={loadError ? 'Use Retry above to load it again.' : 'Adjust your filters and try again.'}
          cellClassName={(columnId) => (['status', 'revisionStatus', 'actions'].includes(columnId) ? 'whitespace-nowrap' : '')}
        />
      </div>

      {viewTransfer && <RoomTransferRequests transfers={[viewTransfer]} stage={stage} onClose={closeTransfer} onReviewed={transferReviewed} />}
      {viewEntry && !viewEntry.transfer && (
        <>
          <ScheduleApprovalPreviewModal
            open
            title={`${entryLabel(viewEntry)} Schedule${viewSnapshotSchedules ? ' (as submitted)' : ''}`}
            printInput={printInput}
            isLoading={viewSnapshotLoading}
            canAct={viewPending && queueFresh && !isApproving && !isRejecting}
            inert={detailsOpen}
            closeOnEscape
            headerActions={(
              <button
                ref={detailsButtonRef}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={detailsOpen}
                onClick={() => { setChangesFirst(false); setDetailsOpen(true); }}
                className="whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]"
              >
                View details
              </button>
            )}
            approveBlockedReason={approveBlockedReason}
            onApprove={() => { if (openReview(selectionKeyOf(viewEntry), 'approve')) closeView(); }}
            onReject={() => { if (openReview(selectionKeyOf(viewEntry), 'reject')) closeView(); }}
            onClose={closeView}
          />
          <ScheduleApprovalDetailsModal
            isOpen={detailsOpen}
            onClose={closeDetails}
            scheduleTitle={`${entryLabel(viewEntry)} Schedule${viewSnapshotSchedules ? ' (as submitted)' : ''}`}
            status={{ label: STATUS_LABELS[viewEntry.status], badgeClassName: STATUS_BADGES[viewEntry.status] }}
            facts={[
              { label: 'Term', value: termLabel },
              { label: 'Submitted by', value: `${viewEntry.submittedBy} · ${formatDate(viewEntry.submittedAt || null)}` },
            ]}
            versionLabel={!viewIsClosed && viewEntry.revisionStatus !== 'modified'
              ? (viewEntry.revisionStatus === 'reset' ? 'Reset version' : 'First submission')
              : null}
            scope={{ ...detailsScope(viewEntry), recalled: viewRecalled }}
            checks={viewPending ? <PreApprovalCheckResults state={viewCheck} variant="summary" className="" /> : null}
            notices={(viewSnapshotFellBack || isTruncated) && (
              <>
                {viewSnapshotFellBack && (
                  <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                    Submitted version unavailable — showing current working copy.
                  </p>
                )}
                {isTruncated && (
                  <TruncatedDataNotice>Not every class meeting could be loaded, so this list may be incomplete.</TruncatedDataNotice>
                )}
              </>
            )}
            meetings={{
              schedules: printInput ? printInput.allSchedules : null,
              sections: (printInput?.sections ?? []).map((section) => ({ id: section.id, name: section.name })),
              conflicts: detailsConflicts,
              sourceLabel: viewSnapshotSchedules ? 'As submitted' : viewSnapshotFellBack ? 'Current working copy' : 'Current schedule',
            }}
            changes={viewIsClosed
              ? { label: 'Changes since this submission', content: <RevisionChangesPanel submissionId={viewEntry.submissionId} />, defaultOpen: changesFirst }
              : viewEntry.revisionStatus === 'modified'
                ? { label: 'Changes from the previous version', content: <RevisionDiffPanel submissionId={viewEntry.submissionId} />, defaultOpen: changesFirst }
                : null}
          />
        </>
      )}

      <ConfirmModal
        isOpen={approval !== null && approvalEntry !== null}
        title="Approve Schedule"
        eyebrow={approvalNeedsTba ? 'Conditional Approval' : 'Approval Required'}
        message={approvalNeedsTba
          ? `Are you sure you want to approve the complete department schedule for ${approvalEntry?.department ?? ''}?`
          : `Are you sure you want to approve the complete schedule for ${approvalEntry ? entryLabel(approvalEntry) : ''}?`}
        confirmLabel="Confirm Approve"
        variant="maroon"
        isConfirming={isApproving}
        confirmDisabled={reviewWaiting}
        onCancel={() => { if (!isApproving) setApproval(null); }}
        onConfirm={() => { void confirmApproval(); }}
      >
        {(approvalNeedsTba || approvalError || reviewWaiting) && (
          <div className="space-y-2 text-left">
            {approvalNeedsTba && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800">Room TBA entries detected</p>
                <p className="mt-1 text-xs text-amber-700">This will be a conditional approval. Assign all laboratory rooms before finalization.</p>
                <textarea
                  aria-label="Reason for approving with Room TBA"
                  value={tbaReason}
                  onChange={(e) => { setTbaReason(e.target.value); setApprovalError(''); }}
                  rows={3}
                  placeholder="Reason for approving with Room TBA"
                  className={`mt-2 w-full rounded-lg border bg-white p-2 text-xs ${approvalError ? 'border-red-500' : 'border-amber-200'}`}
                />
              </div>
            )}
            {approvalError && <p role="alert" className="text-xs font-semibold text-red-600">{approvalError}</p>}
            {reviewWaiting && <p role="status" className="text-xs font-semibold text-slate-500">Refreshing the approval queue…</p>}
          </div>
        )}
      </ConfirmModal>

      {rejectIntent && rejectEntry && (
        <ScheduleRejectionModal open title="Return Schedule for Revision"
          description={<>Please provide a reason for returning the schedule for <strong>{entryLabel(rejectEntry)}</strong>.{reviewWaiting ? ' Refreshing the approval queue…' : ''}</>}
          reason={rejectReason} error={rejectError} isSubmitting={isRejecting} confirmDisabled={reviewWaiting}
          onReasonChange={value => { setRejectReason(value); setRejectError(''); }}
          onClose={() => { if (!isRejecting) setRejectIntent(null); }} onConfirm={() => { void confirmReject(); }} />
      )}
    </div>
  );
}
