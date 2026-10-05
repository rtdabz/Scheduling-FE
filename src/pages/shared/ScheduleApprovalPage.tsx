import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, X } from 'lucide-react';
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
import LoadErrorBanner from '../../components/ui/LoadErrorBanner';
import TruncatedDataNotice from '../../components/ui/TruncatedDataNotice';
import ScheduleApprovalPreviewModal from '../../components/scheduling/ScheduleApprovalPreviewModal';
import PreApprovalCheck from '../../components/scheduling/PreApprovalCheck';
import RevisionChangesPanel from '../../components/scheduling/RevisionChangesPanel';
import RevisionDiffPanel from '../../components/scheduling/RevisionDiffPanel';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { programLabel } from '../../lib/programLabel';
import { publishLiveTopics } from '../../lib/liveUpdates';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import {
  scheduleStatusesForSubmission,
  splitSubmission,
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
import type { ApiScheduleRecord, ScheduleItem } from '../ClassSchedules/SchedulerPanel/types';
import type { SchedulePdfInput } from '../ClassSchedules/SchedulerPanel/schedulePdf';

/**
 * The schedule approval queue for both reviewing stages.
 *
 * The Dean reviews their own department's submissions first (and may approve
 * with Room TBA, which makes the approval conditional); the VPAA then gives the
 * final approval for every department. The two used to be separate ~1,200-line
 * copies that drifted apart — the VPAA copy previewed a returned package as
 * empty and swallowed load errors that the Dean copy reported.
 */
export type ApprovalStage = 'dean' | 'vpaa';

type Mode = 'on-site' | 'online' | 'field';
type QueueTab = 'pending' | 'approved' | 'withdrawn' | 'rejected';
type RequestType = 'approval' | 'withdrawal' | 'revision';

interface ScheduleApproval {
  /** The department id; every approve/return endpoint is addressed by it. */
  id: number;
  submissionId: number;
  /** A partially recalled submission yields two entries sharing one id. */
  entryKey: string;
  department: string;
  /** The program(s) whose sections this entry holds, e.g. "BAS — Bachelor of Arts in Sociology". */
  program: string;
  section: string;
  subjectsScheduled: number;
  submittedBy: string;
  submittedAt: string;
  deanReviewedAt: string | null;
  status: ApprovalDisplayStatus;
  /** The server-side stage this entry is in; decides which meetings it holds. */
  submissionStatus: QueueSubmissionStatus;
  requestType: RequestType;
  /** Whether this version changed its sections from the recalled or rejected one before it. */
  revisionStatus: RevisionStatus;
  workflowSectionIds: string[];
  sectionCount: number;
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
  /** What was sent, recorded at submit; null on submissions from before it was kept. */
  section_count?: number | null;
  subject_count?: number | null;
  revision_status?: string;
  sections: Array<RawSection & { pivot?: { state?: 'included' | 'withdrawn' } }>;
  submitter?: { name?: string } | null;
}

interface ApprovalPayload {
  active_semester: { id: number | string } | null;
  departments?: RawDepartment[];
  sections: RawSection[];
  schedules: RawSchedule[];
  schedule_submissions: RawScheduleSubmission[];
  schedules_truncated?: boolean;
}

/**
 * Recalled and returned versions are shown as they were sent. Their meetings
 * are the department's working copy, which may since have been edited, reset
 * or resubmitted as a new version.
 */
const CLOSED_SUBMISSION_STATUSES = new Set<QueueSubmissionStatus>([
  'withdrawn',
  'partially_withdrawn',
  'rejected_by_dean',
  'rejected_by_vpaa',
]);

interface SubmissionSnapshotResponse {
  data: {
    /** False for submissions from before snapshots were linked. */
    available: boolean;
    schedules: ApiScheduleRecord[];
  };
}

/** The largest page /initial-data serves; anything past it is reported, not hidden. */
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

/** Which stage an entry waits in before this reviewer can act on it. */
const isPendingFor = (stage: ApprovalStage, status: ApprovalDisplayStatus) => (stage === 'dean'
  ? status === 'submitted'
  : status === 'approved_by_dean' || status === 'conditionally_approved');

const matchesQueueTab = (stage: ApprovalStage, entry: ScheduleApproval, tab: QueueTab): boolean => {
  if (tab === 'withdrawn') return entry.requestType === 'withdrawal';
  if (tab === 'pending') return entry.requestType === 'approval' && isPendingFor(stage, entry.status);
  if (tab === 'approved') {
    // The Dean's part is done once a package moves on to the VPAA.
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

/**
 * Submissions are made per program but recorded per department, so the
 * program is read from the sections that were sent. One program prints in
 * full; a secretary's multi-program submission lists the codes.
 */
const formatProgramSummary = (sections: RawSection[], sectionIds: string[]): string => {
  const selected = new Set(sectionIds);
  const programs = new Map<string, NonNullable<RawSection['program']>>();
  sections
    .filter((section) => selected.has(String(section.id)) && section.program)
    .forEach((section) => programs.set(String(section.program!.id), section.program!));
  const list = Array.from(programs.values());
  if (list.length === 0) return 'No program';
  if (list.length === 1) return programLabel(list[0]);
  return list.map((program) => program.code?.trim() || programLabel(program)).sort().join(', ');
};

/** How an entry is named in titles and messages: "Arts and Sciences (BAS — Bachelor of Arts in Sociology)". */
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

const previewStatusOf = (status: ApprovalDisplayStatus, pending: boolean): 'pending' | 'approved' | 'rejected' => {
  if (pending || status === 'revision' || status === 'submitted') return 'pending';
  if (status === 'rejected' || status === 'rejected_by_dean') return 'rejected';
  return 'approved';
};

/** The endpoints each reviewing stage approves and returns through. */
const STAGE_ENDPOINT: Record<ApprovalStage, { approve: string; reject: string }> = {
  dean: { approve: 'approve-by-dean', reject: 'return-by-dean' },
  vpaa: { approve: 'approve-by-vpaa', reject: 'return-by-vpaa' },
};

interface ApprovalQueueCache {
  entries: ScheduleApproval[];
  rawSchedules: RawSchedule[];
  departments: RawDepartment[];
  printSource: SchedulerCacheData | null;
  isTruncated: boolean;
}

export default function ScheduleApprovalPage({ stage }: { stage: ApprovalStage }) {
  const { toast, confirm } = useToast();
  const user = useMemo(() => getStoredUser(), []);
  // A Dean reviews one department; the VPAA reviews them all.
  const scopeDepartmentId = stage === 'dean' ? user?.department_id ?? null : null;

  // Schedules group (approval signals invalidate it too). A cached queue paints
  // on a revisit while the mount fetch below replaces it.
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

  const [selectedQueueTab, setSelectedQueueTab] = useState<QueueTab>('pending');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | ApprovalDisplayStatus>('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const [viewEntry, setViewEntry] = useState<ScheduleApproval | null>(null);
  // Open conflicts the pre-approval check found in the package being viewed;
  // null until it answers. Tagged with the entry so another package's answer
  // is never read as this one's.
  const [viewCheck, setViewCheck] = useState<{ entryKey: string; open: number } | null>(null);
  // The frozen meetings of a recalled or returned version being viewed; null
  // schedules means none were kept, so the live working copy is shown.
  const [viewSnapshot, setViewSnapshot] = useState<{ submissionId: number; schedules: ScheduleItem[] | null } | null>(null);
  const [tbaApproval, setTbaApproval] = useState<ScheduleApproval | null>(null);
  const [tbaReason, setTbaReason] = useState('');
  const [tbaError, setTbaError] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [rejectEntry, setRejectEntry] = useState<ScheduleApproval | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const liveRevision = useLiveRevision(['approvals', 'schedules']);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // A live refresh keeps the queue on screen while it reloads.
      if (liveRevision === 0 && reloadKey === 0 && !hasCachedData(cacheKey)) setIsLoading(true);
      setLoadError(null);
      try {
        // The VPAA portal is otherwise limited to approved meetings; this screen
        // has to show what is still waiting on that approval, so it asks for
        // the pending rows explicitly.
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
            // An entry holding the whole submission reports what was sent; the
            // live meetings are gone once a recalled section is regenerated.
            // A split entry holds part of it, so it can only count live.
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
              submittedBy: submission.submitter?.name ?? 'Secretary',
              submittedAt: submission.submitted_at ?? '',
              deanReviewedAt: submission.dean_reviewed_at,
              status: submissionDisplayStatus(submission),
              submissionStatus: submission.status,
              requestType: requestTypeOf(submission.status),
              revisionStatus: isRevisionStatus(submission.revision_status) ? submission.revision_status : 'initial',
              workflowSectionIds: sectionIds,
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
        setCachedData<ApprovalQueueCache>(cacheKey, {
          entries: mapped,
          rawSchedules: schedules,
          departments: data.departments ?? [],
          printSource: nextPrintSource,
          isTruncated: data.schedules_truncated === true,
        });
      } catch (error) {
        if (!active) return;
        // An empty queue after a failed load reads as "nothing to approve",
        // which is the one thing this page must never claim by mistake.
        const message = apiErrorMessage(error, 'The approval queue could not be loaded.');
        setLoadError(message);
        toast.error('Load Failed', message);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [cacheKey, liveRevision, reloadKey, scopeDepartmentId, stage, toast]);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const resetPage = () => setPagination((prev) => ({ ...prev, pageIndex: 0 }));

  const resetFilters = () => {
    setSelectedQueueTab('pending');
    setSelectedDepartmentId('all');
    setSelectedStatus('all');
    resetPage();
  };

  const tabEntries = useMemo(
    () => entries.filter((entry) => matchesQueueTab(stage, entry, selectedQueueTab)),
    [entries, selectedQueueTab, stage],
  );

  // Status choices come from what the open tab holds, so a filter can never
  // contradict the tab it sits under.
  const statusOptions = useMemo(
    () => Array.from(new Set(tabEntries.map((entry) => entry.status))),
    [tabEntries],
  );

  const filteredData = useMemo(() => tabEntries.filter((entry) => (
    (selectedDepartmentId === 'all' || String(entry.id) === selectedDepartmentId)
    && (selectedStatus === 'all' || entry.status === selectedStatus)
  )), [selectedDepartmentId, selectedStatus, tabEntries]);

  const queueCounts = useMemo(() => QUEUE_TABS.reduce<Record<QueueTab, number>>((counts, tab) => {
    counts[tab.id] = entries.filter((entry) => matchesQueueTab(stage, entry, tab.id)).length;
    return counts;
  }, { pending: 0, approved: 0, withdrawn: 0, rejected: 0 }), [entries, stage]);

  const inPackage = useCallback((entry: ScheduleApproval, schedule: RawSchedule) => (
    Number(schedule.department_id) === entry.id
    && entry.workflowSectionIds.includes(String(schedule.section_id))
  ), []);

  useEffect(() => {
    if (!viewEntry || !CLOSED_SUBMISSION_STATUSES.has(viewEntry.submissionStatus)) return undefined;
    let active = true;
    const { submissionId } = viewEntry;
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
  }, [toast, viewEntry]);

  const viewIsClosed = viewEntry !== null && CLOSED_SUBMISSION_STATUSES.has(viewEntry.submissionStatus);
  const viewSnapshotLoaded = viewSnapshot !== null && viewSnapshot.submissionId === viewEntry?.submissionId;
  const viewSnapshotLoading = viewIsClosed && !viewSnapshotLoaded;
  const viewSnapshotSchedules = viewIsClosed && viewSnapshotLoaded ? viewSnapshot.schedules : null;

  /** What the preview and its printout show: the package's meetings at its own stage. */
  const printInput = useMemo<SchedulePdfInput | null>(() => {
    if (!viewEntry || !printSource || viewSnapshotLoading) return null;
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
    };
  }, [inPackage, printSource, rawSchedules, viewEntry, viewSnapshotLoading, viewSnapshotSchedules]);

  /** The package's classes at its own stage, for the pre-approval check. */
  const viewScheduleIds = useMemo(() => {
    if (!viewEntry) return [];
    const allowed = new Set(scheduleStatusesForSubmission(viewEntry.submissionStatus));
    return rawSchedules
      .filter((schedule) => inPackage(viewEntry, schedule) && allowed.has(schedule.status))
      .map((schedule) => String(schedule.id));
  }, [inPackage, rawSchedules, viewEntry]);

  const viewEntryKey = viewEntry?.entryKey ?? null;
  const reportViewConflicts = useCallback((open: number) => {
    if (viewEntryKey !== null) setViewCheck({ entryKey: viewEntryKey, open });
  }, [viewEntryKey]);
  const viewOpenConflicts = viewCheck !== null && viewCheck.entryKey === viewEntryKey ? viewCheck.open : 0;

  const markEntry = (entry: ScheduleApproval, status: ApprovalDisplayStatus, submissionStatus: QueueSubmissionStatus) => {
    const now = new Date().toISOString();
    setEntries((prev) => prev.map((item) => (item.entryKey === entry.entryKey
      ? { ...item, status, submissionStatus, deanReviewedAt: stage === 'dean' ? now : item.deanReviewedAt }
      : item)));
    // The server leaves this tab out of its own live broadcast, so announce
    // the change here: the sidebar's pending badge refetches, and so does this
    // queue -- the meetings' new statuses are the server's to decide, read
    // back instead of guessed, so the preview keeps matching the printout.
    publishLiveTopics(['approvals']);
  };

  const submitApproval = async (entry: ScheduleApproval, overrideReason: string | null) => {
    try {
      await api.post(`/departments/${entry.id}/${STAGE_ENDPOINT[stage].approve}`, {
        schedule_submission_id: entry.submissionId,
        ...(overrideReason !== null ? { override_room_tba: true, override_reason: overrideReason } : {}),
      });
      if (stage === 'dean') {
        markEntry(entry, overrideReason !== null ? 'conditionally_approved' : 'approved_by_dean', 'pending_vpaa');
      } else {
        markEntry(entry, 'approved', 'approved');
      }
      toast.success('Approved', `${entryLabel(entry)} schedule has been approved.`);
      return true;
    } catch (error) {
      // The server decides Room TBA, not this page. When the queue was read
      // before a room went TBA, the plain approval is refused; ask for the
      // reason here instead of ending on an error the Dean cannot act on.
      const code = (error as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
      if (stage === 'dean' && overrideReason === null && code === 'room_tba_override_required') {
        setTbaReason('');
        setTbaError('');
        setTbaApproval(entry);
        toast.info('Room TBA', 'This schedule now has Room TBA classes. Give a reason to approve it conditionally.');
        refresh();
        return false;
      }
      toast.error('Approval Failed', apiErrorMessage(error, 'Failed to approve schedule.'));
      return false;
    }
  };

  const handleApprove = async (entry: ScheduleApproval) => {
    // Only the Dean may approve an on-site class that still has no room, and
    // only with a reason; that approval is conditional.
    const hasRoomTba = stage === 'dean' && rawSchedules.some((schedule) => (
      inPackage(entry, schedule) && schedule.status === 'submitted' && schedule.mode === 'on-site' && !schedule.room
    ));
    if (hasRoomTba) {
      setTbaReason('');
      setTbaError('');
      setTbaApproval(entry);
      return;
    }
    await confirm({
      title: 'Approve Schedule',
      message: `Are you sure you want to approve the complete schedule for ${entryLabel(entry)}?`,
      eyebrow: 'Approval Required',
      confirmLabel: 'Confirm Approve',
      variant: 'maroon',
      // Awaited by the dialog, which shows its spinner until the request settles.
      onConfirm: () => submitApproval(entry, null),
    });
  };

  const confirmConditionalApprove = async () => {
    if (!tbaApproval || isApproving) return;
    const reason = tbaReason.trim();
    if (reason.length < 3) {
      setTbaError('Give a reason for approving with Room TBA.');
      return;
    }
    setIsApproving(true);
    const approved = await submitApproval(tbaApproval, reason);
    setIsApproving(false);
    // Keep the dialog, and the reason typed into it, when the approval failed.
    if (approved) setTbaApproval(null);
  };

  const openReject = (entry: ScheduleApproval) => {
    setRejectEntry(entry);
    setRejectReason('');
    setRejectError('');
  };

  const confirmReject = async () => {
    if (!rejectEntry || isRejecting) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError('A reason for rejection is required.');
      return;
    }
    setIsRejecting(true);
    try {
      await api.post(`/departments/${rejectEntry.id}/${STAGE_ENDPOINT[stage].reject}`, {
        schedule_submission_id: rejectEntry.submissionId,
        rejection_reason: reason,
      });
      if (stage === 'dean') markEntry(rejectEntry, 'rejected_by_dean', 'rejected_by_dean');
      else markEntry(rejectEntry, 'rejected', 'rejected_by_vpaa');
      toast.success('Returned for Revision', `${entryLabel(rejectEntry)} schedule has been returned for revision.`);
      setRejectEntry(null);
      setRejectReason('');
    } catch (error) {
      // The dialog stays open with the reason intact so it can be resent.
      setRejectError(apiErrorMessage(error, 'Failed to return the schedule. Try again.'));
    } finally {
      setIsRejecting(false);
    }
  };

  const columns = useMemo<ColumnDef<ScheduleApproval>[]>(() => [
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
      // A count, not the names: a department submits dozens of sections and
      // listing them all pushed every other column off screen. The names stay
      // on hover and in the preview.
      id: 'sections',
      accessorFn: (entry) => entry.sectionCount,
      header: () => <div className="text-center">Sections</div>,
      cell: ({ row }) => {
        const count = row.original.sectionCount;
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
            onClick={() => setViewEntry(info.row.original)}
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
          <TableActionButton label="View" variant="view" onClick={() => setViewEntry(row.original)}>
            <Eye size={17} />
          </TableActionButton>
        </div>
      ),
    },
  ], []);

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
  const viewPending = viewEntry !== null && viewEntry.requestType === 'approval' && isPendingFor(stage, viewEntry.status);

  return (
    <div className="relative">
      <div id="schedule-approval-tabs" className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-gray-150/70 bg-white p-2 shadow-sm">
        {QUEUE_TABS.map((tab) => {
          const active = selectedQueueTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedQueueTab(tab.id);
                setSelectedStatus('all');
                resetPage();
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors ${active ? 'bg-[#4e0a10] text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-[#4e0a10]/5 hover:text-[#4e0a10]'}`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>{queueCounts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      <div id="schedule-approval-filters" className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
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
      </div>

      {loadError && (
        <LoadErrorBanner message={`${loadError} The queue below may be empty or out of date.`} onRetry={refresh} className="mb-4" />
      )}

      {isTruncated && !loadError && (
        <TruncatedDataNotice className="mb-4">
          More than {SCHEDULE_LIMIT.toLocaleString()} class meetings are in review, so some are not loaded. Previews and printouts may be missing classes — review departments one at a time before approving.
        </TruncatedDataNotice>
      )}

      <div id="schedule-approval-list">
        <DataTable
          table={table}
          isLoading={isLoading}
          totalLabel="schedules"
          ariaLabel="Schedule submissions"
          emptyTitle={loadError ? 'The queue could not be loaded.' : 'No schedules found.'}
          emptyDescription={loadError ? 'Use Retry above to load it again.' : 'Adjust your filters and try again.'}
          cellClassName={(columnId) => (['sections', 'subjectsScheduled', 'submittedAt', 'deanReviewedAt', 'status', 'revisionStatus', 'actions'].includes(columnId) ? 'whitespace-nowrap' : '')}
        />
      </div>

      {viewEntry && (
        <ScheduleApprovalPreviewModal
          open
          title={`${entryLabel(viewEntry)} Schedule${viewSnapshotSchedules ? ' (as submitted)' : ''}`}
          status={previewStatusOf(viewEntry.status, viewPending)}
          statusLabel={STATUS_LABELS[viewEntry.status]}
          printInput={printInput}
          isLoading={viewSnapshotLoading}
          canAct={viewPending}
          checks={viewPending ? (
            <>
              {viewEntry.revisionStatus === 'modified' && <RevisionDiffPanel submissionId={viewEntry.submissionId} />}
              <PreApprovalCheck
                departmentId={viewEntry.id}
                sectionIds={viewEntry.workflowSectionIds}
                scheduleIds={viewScheduleIds}
                onOpenConflicts={reportViewConflicts}
              />
            </>
          ) : viewIsClosed ? (
            <RevisionChangesPanel submissionId={viewEntry.submissionId} />
          ) : viewEntry.revisionStatus === 'modified' ? (
            <RevisionDiffPanel submissionId={viewEntry.submissionId} />
          ) : undefined}
          approveBlockedReason={viewOpenConflicts > 0
            ? `This schedule has ${viewOpenConflicts} open conflict${viewOpenConflicts === 1 ? '' : 's'}. Return it for revision.`
            : null}
          onApprove={() => { void handleApprove(viewEntry); setViewEntry(null); }}
          onReject={() => { openReject(viewEntry); setViewEntry(null); }}
          onClose={() => setViewEntry(null)}
        />
      )}

      {/* Room TBA approval: the shared confirmation modal, with the reason it must collect. */}
      <ConfirmModal
        isOpen={tbaApproval !== null}
        title="Approve Schedule"
        eyebrow="Conditional Approval"
        message={`Are you sure you want to approve the complete department schedule for ${tbaApproval?.department ?? ''}?`}
        confirmLabel="Confirm Approve"
        variant="maroon"
        isConfirming={isApproving}
        onCancel={() => { if (!isApproving) setTbaApproval(null); }}
        onConfirm={() => { void confirmConditionalApprove(); }}
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
          <p className="text-xs font-bold text-amber-800">Room TBA entries detected</p>
          <p className="mt-1 text-xs text-amber-700">This will be a conditional approval. Assign all laboratory rooms before finalization.</p>
          <textarea
            value={tbaReason}
            onChange={(e) => { setTbaReason(e.target.value); setTbaError(''); }}
            rows={3}
            placeholder="Reason for approving with Room TBA"
            className={`mt-2 w-full rounded-lg border bg-white p-2 text-xs ${tbaError ? 'border-red-500' : 'border-amber-200'}`}
          />
          {tbaError && <p className="mt-1 text-xs font-semibold text-red-600">{tbaError}</p>}
        </div>
      </ConfirmModal>

      {rejectEntry && (
        <div role="dialog" aria-modal="true" aria-labelledby="reject-schedule-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
              <h3 id="reject-schedule-title" className="text-lg font-bold text-gray-800 font-display">Return Schedule for Revision</h3>
              <button
                type="button"
                aria-label="Close"
                disabled={isRejecting}
                onClick={() => setRejectEntry(null)}
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                Please provide a reason for returning the schedule for <strong>{entryLabel(rejectEntry)}</strong>.
              </p>
              <div>
                <label htmlFor="reject-reason" className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="reject-reason"
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => { setRejectReason(e.target.value); setRejectError(''); }}
                  placeholder="Explain what needs to change..."
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 outline-none text-xs bg-white resize-none transition-all ${rejectError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'}`}
                />
                {rejectError && <p className="text-xs text-red-500 mt-1 font-semibold">{rejectError}</p>}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={isRejecting}
                  onClick={() => setRejectEntry(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer bg-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRejecting}
                  onClick={() => { void confirmReject(); }}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isRejecting ? 'Returning...' : 'Confirm Return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
