import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Inbox, RotateCcw, Send } from 'lucide-react';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import { LoadWarning, Panel } from '../../components/vpaa/DashboardPrimitives';
import { EmptyNote } from '../../components/dashboard/Ledger';
import { DashboardContext, DistributionWithGroups, KpiCard, KpiStrip, RelatedLinks, StageRows, StatusDonut } from '../../components/dashboard/Analytics';
import { RequestQueue } from '../../components/dashboard/RequestQueue';
import { STAGE } from '../../lib/dashboardStage';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { fullSemesterLabel } from '../../lib/semesterLabel';
import api from '../../lib/api';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { workloadExceptions, type FacultyLoadFields } from '../../lib/facultyLoad';
import { recoveryError, type RoomTransferRequest } from '../../lib/roomRecovery';
import { relativeAge } from '../../lib/vpaaOverview';
import type { QueueSubmissionStatus } from '../../lib/approvalQueue';
import { oldestWaitingFirst, pendingScheduleRequests, pendingTransferRequests, reviewPath, type PendingRequest } from '../../lib/dashboardQueue';

interface Program { id:number; code?:string|null; name?:string|null }
interface Faculty extends FacultyLoadFields { id:number; department_id:number }
interface Section { id:number; section_name:string; department_id:number; program?:Program|null }
interface Schedule { id:number; semester_id:number; section_id:number; department_id?:number|null; status:string }
interface Semester { id:number; academic_year?:string; semester?:string; is_active?:boolean }
interface Submission {
  id:number; department_id:number|string; semester_id:number|string; status:QueueSubmissionStatus; revision_number?:number;
  submitted_at?:string|null; dean_reviewed_at?:string|null;
  sections?:Array<{ id:number; section_name?:string; program?:Program|null; pivot?:{ state?:'included'|'withdrawn' }|null }>|null;
  submitter?:{ name?:string }|null;
}
interface Overview { faculties:Faculty[]; sections:Section[]; schedules:Schedule[]; submissions:Submission[]; activeSemester:Semester|null; schedulesTruncated?:boolean }
interface InitialData { faculties?:Faculty[]; sections?:Section[]; schedules?:Schedule[]; schedule_submissions?:Submission[]; active_semester?:Semester; schedules_truncated?:boolean }

const percent = (part:number, total:number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const APPROVAL_PATH = '/dean/schedules/approval';
const NO_PROGRAM = 'No program';

const programLabel = (program?:Program|null) => program?.code?.trim() || program?.name?.trim() || NO_PROGRAM;

interface ProgramProgress {
  code:string;
  total:number;
  drafting:number;
  ready:number;
  withYou:number;
  withVpaa:number;
  approved:number;
  returned:number;
}

const DASHBOARD_LIVE_TOPICS = ['schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty', 'users', 'departments'] as const;

type SourceState = 'loading' | 'ready' | 'error';

export default function DeanDashboardPage() {
  const navigate = useNavigate();

  const user = useMemo(() => getStoredUser(), []);
  const departmentId = user?.department_id ?? null;
  const cacheKey = `dashboard:${user?.role ?? 'dean'}:${user?.id ?? departmentId ?? 'current'}`;
  const cached = getCachedData<Overview>(cacheKey);

  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [hasData, setHasData] = useState(Boolean(cached));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schedulesTruncated, setSchedulesTruncated] = useState(cached?.schedulesTruncated === true);
  const [reloadKey, setReloadKey] = useState(0);
  const liveRevision = useLiveRevision(DASHBOARD_LIVE_TOPICS);
  const [faculties, setFaculties] = useState<Faculty[]>(cached?.faculties ?? []);
  const [sections, setSections] = useState<Section[]>(cached?.sections ?? []);
  const [schedules, setSchedules] = useState<Schedule[]>(cached?.schedules ?? []);
  const [submissions, setSubmissions] = useState<Submission[]>(cached?.submissions ?? []);
  const [semester, setSemester] = useState<Semester | null>(cached?.activeSemester ?? null);
  const [transfers, setTransfers] = useState<RoomTransferRequest[]>([]);
  const [transferState, setTransferState] = useState<SourceState>('loading');
  const [transferError, setTransferError] = useState('');

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(liveRevision === 0 && !hasCachedData(cacheKey));
      setLoadError(null);
      try {
        const overview = await loadCachedData<Overview>(cacheKey, async () => {
          const { data = {} } = await api.get<InitialData>('/initial-data', { params: { schedule_limit: 2000 } });
          return {
            faculties: Array.isArray(data.faculties) ? data.faculties : [],
            sections: Array.isArray(data.sections) ? data.sections : [],
            schedules: Array.isArray(data.schedules) ? data.schedules : [],
            submissions: Array.isArray(data.schedule_submissions) ? data.schedule_submissions : [],
            activeSemester: data.active_semester || null,
            schedulesTruncated: data.schedules_truncated === true,
          };
        }, reloadKey > 0);

        if (!active) return;
        setFaculties(overview.faculties ?? []);
        setSections(overview.sections ?? []);
        setSchedules(overview.schedules ?? []);
        setSubmissions(overview.submissions ?? []);
        setSemester(overview.activeSemester ?? null);
        setSchedulesTruncated(overview.schedulesTruncated === true);
        setHasData(true);
      } catch {
        if (active) setLoadError('Could not load department scheduling data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [cacheKey, reloadKey, liveRevision]);

  // Room transfers share the Dean approval workspace; the server scopes them to this department.
  useEffect(() => {
    const controller = new AbortController();
    api.get<{ transfers?: RoomTransferRequest[] }>('/room-recovery/transfers', { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setTransfers(Array.isArray(data?.transfers) ? data.transfers : []);
        setTransferState('ready');
        setTransferError('');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setTransferState('error');
        setTransferError(recoveryError(error));
      });
    return () => controller.abort();
  }, [reloadKey, liveRevision]);

  const {
    sections: statusSections,
    stageCounts,
    totalSections,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useDepartmentScheduleStatus(departmentId);

  const retry = useCallback(() => {
    setReloadKey(k => k + 1);
    refetchStatus();
  }, [refetchStatus]);

  const semesterId = semester?.id ?? null;
  const inScope = useCallback(
    (item: { department_id?: number | string | null }) => departmentId != null && Number(item.department_id) === Number(departmentId),
    [departmentId],
  );

  const deptSections = useMemo(() => sections.filter(inScope), [sections, inScope]);
  const sectionById = useMemo(() => new Map(deptSections.map(s => [String(s.id), s])), [deptSections]);
  const deptFaculties = useMemo(() => faculties.filter(inScope), [faculties, inScope]);
  const exceptions = useMemo(() => workloadExceptions(deptFaculties), [deptFaculties]);

  const scheduleStatusesBySection = useMemo(() => {
    const map = new Map<string, string[]>();
    schedules.forEach(schedule => {
      const key = String(schedule.section_id);
      map.set(key, [...(map.get(key) ?? []), schedule.status]);
    });
    return map;
  }, [schedules]);

  const requests = useMemo<PendingRequest[]>(() => {
    if (!semesterId || departmentId == null) return [];
    const scheduleRequests = pendingScheduleRequests(
      'dean',
      submissions
        .filter(s => Number(s.semester_id) === Number(semesterId) && inScope(s))
        .map(s => ({ ...s, sections: s.sections ?? [] })),
      (_submission, sectionIds) => sectionIds.flatMap(id => scheduleStatusesBySection.get(id) ?? []),
    );
    return [...scheduleRequests, ...pendingTransferRequests('dean', transfers)].sort(oldestWaitingFirst);
  }, [semesterId, departmentId, submissions, inScope, scheduleStatusesBySection, transfers]);

  const submissionSections = useMemo(() => {
    const map = new Map<string, { name?: string; program?: Program | null }>();
    submissions.forEach(s => (s.sections ?? []).forEach(section => map.set(String(section.id), { name: section.section_name, program: section.program })));
    return map;
  }, [submissions]);

  const requestTitle = (request: PendingRequest) => {
    if (request.type === 'room_transfer') return 'Room transfer request';
    const programs = new Set(request.sectionIds.map(id => programLabel(sectionById.get(id)?.program ?? submissionSections.get(id)?.program)));
    programs.delete(NO_PROGRAM);
    return programs.size ? `${[...programs].sort().join(', ')} schedule` : 'Schedule submission';
  };
  const requestScope = (request: PendingRequest) => {
    if (request.type === 'room_transfer') return `${request.meetingCount} ${request.meetingCount === 1 ? 'meeting' : 'meetings'} moved`;
    const names = request.sectionIds.map(id => sectionById.get(id)?.section_name ?? submissionSections.get(id)?.name).filter(Boolean) as string[];
    if (!names.length) return `${request.sectionCount} ${request.sectionCount === 1 ? 'section' : 'sections'}`;
    return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ');
  };

  const programRows = useMemo<ProgramProgress[]>(() => {
    const groups = new Map<string, ProgramProgress>();
    statusSections.forEach(section => {
      const code = programLabel(sectionById.get(String(section.id))?.program);
      const row = groups.get(code) ?? { code, total: 0, drafting: 0, ready: 0, withYou: 0, withVpaa: 0, approved: 0, returned: 0 };
      row.total++;
      if (section.status === 'submitted') row.withYou++;
      else if (section.status === 'approved_by_dean' || section.status === 'conditionally_approved') row.withVpaa++;
      else if (section.status === 'approved') row.approved++;
      else if (section.status === 'revision') row.returned++;
      else if (section.status === 'completed') row.ready++;
      else row.drafting++;
      groups.set(code, row);
    });
    const rank = (row: ProgramProgress) => (row.withYou ? 0 : row.returned ? 1 : row.approved === row.total ? 3 : 2);
    return [...groups.values()].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
  }, [statusSections, sectionById]);

  const forwardedPending = stageCounts.approved_by_dean + stageCounts.conditionally_approved;
  const returned = stageCounts.revision;
  const statusKnown = !statusError || statusSections.length > 0;
  const transfersKnown = transferState === 'ready';
  const scheduleRequestCount = requests.filter(r => r.type === 'schedule').length;
  const transferRequestCount = requests.length - scheduleRequestCount;
  const oldest = requests.find(r => r.waitingSince);

  const openApproval = () => navigate(APPROVAL_PATH);
  const openRequest = (request: PendingRequest) => navigate(reviewPath(APPROVAL_PATH, request));

  if (loading || statusLoading) return <DashboardSkeleton variant="dean" />;

  const term = fullSemesterLabel(semester);
  const links = [
    { label: 'Department schedules', onClick: () => navigate('/dean/schedules') },
    { label: 'Instructors', onClick: () => navigate('/dean/instructors') },
    { label: 'Facilities', onClick: () => navigate('/dean/facilities') },
    { label: 'Reports', onClick: () => navigate('/dean/reports') },
  ];
  const exceptionNote = exceptions.overLimit > 0
    ? `${exceptions.overLimit} ${exceptions.overLimit === 1 ? 'instructor is' : 'instructors are'} over their permitted workload limit.`
    : undefined;

  if (departmentId == null || !hasData || (hasData && !semester)) {
    const reason = departmentId == null
      ? { status: 'No department', summary: 'Your account has no department, so there is nothing to review here. Ask an administrator to assign one.' }
      : !hasData
        ? { status: 'Data unavailable', summary: 'Review figures are hidden until the department data loads.' }
        : { status: 'No active semester', summary: 'Reviews are scoped to the active semester. Nothing is shown until one is activated.' };
    return <div id="dashboard-overview" className="space-y-4 pb-8 text-text">
      {loadError && <LoadWarning message={loadError} onRetry={retry} />}
      <DashboardContext term={semester ? term : reason.status} status={reason.status} statusTone="drafting" summary={reason.summary} />
    </div>;
  }

  const contextStatus = requests.length > 0
    ? { label: `${requests.length} ${requests.length === 1 ? 'request' : 'requests'} to review`, tone: 'ready' as const }
    : !transfersKnown
      ? { label: 'Room transfers unavailable', tone: 'drafting' as const }
      : statusKnown && totalSections > 0 && stageCounts.approved === totalSections
        ? { label: 'All sections approved', tone: 'done' as const }
        : { label: 'Nothing to review', tone: 'drafting' as const };
  const contextSummary = oldest
    ? `Oldest request reached you ${relativeAge(oldest.waitingSince, now)}.`
    : returned > 0
      ? `${returned} ${returned === 1 ? 'section is' : 'sections are'} back with the programs for revision.`
      : 'New submissions appear here as programs send them.';

  const unknown = '—';
  const statusSegments = [
    { key: 'with-you', label: 'Awaiting you', value: stageCounts.submitted, color: STAGE.ready },
    { key: 'with-vpaa', label: 'With the VPAA', value: forwardedPending, color: STAGE.waiting },
    { key: 'approved', label: 'Approved', value: stageCounts.approved, color: STAGE.approved },
    { key: 'returned', label: 'Returned', value: returned, color: STAGE.returned },
    { key: 'drafted', label: 'Drafted, not submitted', value: stageCounts.completed, color: STAGE.done },
    { key: 'drafting', label: 'Drafting', value: Math.max(0, stageCounts.draft - returned), color: STAGE.drafting },
  ];
  const programSegments = (row: ProgramProgress) => [
    { key: 'with-you', label: 'awaiting you', value: row.withYou, color: STAGE.ready },
    { key: 'with-vpaa', label: 'with VPAA', value: row.withVpaa, color: STAGE.waiting },
    { key: 'approved', label: 'approved', value: row.approved, color: STAGE.approved },
    { key: 'returned', label: 'returned', value: row.returned, color: STAGE.returned },
    { key: 'drafted', label: 'drafted', value: row.ready, color: STAGE.done },
    { key: 'drafting', label: 'drafting', value: row.drafting, color: STAGE.drafting },
  ];

  return <div id="dashboard-overview" className="space-y-4 pb-8 text-text">
    {(loadError || statusError) && <LoadWarning message={`${loadError || statusError} Figures below may be out of date.`} onRetry={retry} />}

    <DashboardContext
      term={term}
      status={contextStatus.label}
      statusTone={contextStatus.tone}
      summary={contextSummary}
      action={requests.length > 0 ? { label: 'Review schedules', onClick: openApproval } : undefined}
    />

    <KpiStrip count={4}>
      <KpiCard
        label="Awaiting your review"
        icon={Inbox}
        value={transfersKnown || requests.length ? requests.length : unknown}
        of="requests"
        status={`${scheduleRequestCount} schedule · ${transfersKnown ? `${transferRequestCount} room transfer` : 'room transfers unavailable'}`}
        tone={requests.length ? 'attention' : transfersKnown ? 'good' : 'neutral'}
        onClick={openApproval}
        actionLabel="Open the approval queue"
      />
      <KpiCard
        label="With the VPAA"
        icon={Send}
        value={statusKnown ? forwardedPending : unknown}
        of={statusKnown ? `of ${totalSections} sections` : undefined}
        status={!statusKnown ? 'Section status unavailable'
          : stageCounts.conditionally_approved ? `${stageCounts.conditionally_approved} forwarded with an override`
          : forwardedPending ? 'Forwarded, awaiting decision' : 'None awaiting the VPAA'}
        tone={statusKnown && stageCounts.conditionally_approved ? 'attention' : 'neutral'}
      />
      <KpiCard
        label="Returned for revision"
        icon={RotateCcw}
        value={statusKnown ? returned : unknown}
        of={statusKnown ? `of ${totalSections} sections` : undefined}
        status={!statusKnown ? 'Section status unavailable' : returned ? 'With the programs' : 'None returned'}
        tone={!statusKnown ? 'neutral' : returned ? 'alert' : 'good'}
      />
      <KpiCard
        label="Approved by the VPAA"
        icon={BadgeCheck}
        value={statusKnown ? stageCounts.approved : unknown}
        of={statusKnown ? `/ ${totalSections} sections` : undefined}
        meter={statusKnown ? { value: percent(stageCounts.approved, totalSections), color: STAGE.approved } : undefined}
        status={!statusKnown ? 'Section status unavailable' : totalSections > 0 && stageCounts.approved === totalSections ? 'Every section approved' : `${percent(stageCounts.approved, totalSections)}% of the department`}
        tone={statusKnown && totalSections > 0 && stageCounts.approved === totalSections ? 'good' : 'neutral'}
      />
    </KpiStrip>

    {schedulesTruncated && <p className="rounded-md bg-accent/10 px-3 py-2 text-[12px] text-stage-warnText">
      The department has more class meetings than load at once. Request counts are unaffected, but partially recalled submissions may be incomplete; the approval queue has the full list.
    </p>}

    <Panel
      title="Review queue"
      subtitle={requests.length ? 'Schedule submissions and room transfers, longest-waiting first.' : undefined}
      badge={requests.length}
      action="Open approval queue"
      onAction={openApproval}
    >
      <RequestQueue
        requests={requests}
        now={now}
        title={requestTitle}
        scopeOf={requestScope}
        onOpen={openRequest}
        onViewAll={openApproval}
        emptyText="Nothing is waiting on your review."
        incomplete={transferState === 'error' ? `Room transfers could not be loaded (${transferError}). Only schedule submissions are listed; open the approval queue to check transfers.` : undefined}
      />
    </Panel>

    <Panel title="Department status" subtitle="Every active section by review stage, with programs needing you first.">
      {!statusKnown ? <EmptyNote>Section status could not be loaded, so program progress is unavailable.</EmptyNote>
        : <DistributionWithGroups
          groupsTitle="Program progress"
          distribution={<StatusDonut segments={statusSegments} total={totalSections} centerLabel="sections" label="Department sections by stage" />}
        >
          {programRows.length ? <StageRows
            label="Program progress"
            rows={programRows.map(row => ({
              key: row.code,
              label: row.code,
              summary: `${row.withVpaa + row.approved} / ${row.total} forwarded`,
              segments: programSegments(row),
            }))}
          /> : <EmptyNote>No program has active sections this semester.</EmptyNote>}
        </DistributionWithGroups>}
    </Panel>

    <RelatedLinks links={links} note={exceptionNote} />
  </div>;
}
