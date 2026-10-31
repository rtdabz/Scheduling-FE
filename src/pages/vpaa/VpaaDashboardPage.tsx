import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Building2, FilePen, Inbox, RotateCcw, Scale, ShieldAlert, UserX, type LucideIcon } from 'lucide-react';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import { LoadWarning, Panel } from '../../components/vpaa/DashboardPrimitives';
import { EmptyNote } from '../../components/dashboard/Ledger';
import BuildingUtilizationPanel from '../../components/vpaa/BuildingUtilizationPanel';
import type { VpaaInsights } from '../../lib/vpaaInsights';
import { DashboardContext, DistributionWithGroups, KpiCard, KpiStrip, RelatedLinks, StageRows, StatusDonut } from '../../components/dashboard/Analytics';
import { RequestQueue } from '../../components/dashboard/RequestQueue';
import { STAGE } from '../../lib/dashboardStage';
import { grouped } from '../../lib/dashboardFormat';
import { workloadExceptions, type FacultyLoadFields } from '../../lib/facultyLoad';
import { fullSemesterLabel } from '../../lib/semesterLabel';
import api from '../../lib/api';
import { getStoredUser } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { recoveryError, type RoomTransferRequest } from '../../lib/roomRecovery';
import { oldestWaitingFirst, pendingScheduleRequests, pendingTransferRequests, reviewPath, type PendingRequest } from '../../lib/dashboardQueue';
import {
  institutionTotals,
  latestSubmissionBySection,
  relativeAge,
  rollupDepartments,
  type DepartmentRollup,
  type OverviewSubmission,
} from '../../lib/vpaaOverview';

interface Schedule { id:number; semester_id:number; section_id:number; department_id?:number|null; status:string }
interface Section { id:number; section_name:string; department_id:number }
interface Faculty extends FacultyLoadFields { id:number; department_id:number }
interface Department { id:number; department_name:string; department_code:string }
interface Semester { id:number; academic_year:string; semester:'1st'|'2nd'|'summer'; is_active:boolean }

interface DashboardData {
  schedules:Schedule[]; sections:Section[]; faculties:Faculty[];
  departments:Department[]; activeSemester:Semester|null;
  submissions:OverviewSubmission[];
}
interface InitialDataResponse {
  schedules?:Schedule[]; sections?:Section[]; faculties?:Faculty[];
  departments?:Department[]; active_semester?:Semester;
  schedule_submissions?:OverviewSubmission[];
}

const SCHEDULE_PREVIEW_LIMIT = 2000;
const APPROVAL_PATH = '/schedules/approval';

const DASHBOARD_LIVE_TOPICS = ['schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty', 'departments', 'settings'] as const;

type SourceState = 'loading' | 'ready' | 'error';

export default function VpaaDashboardPage() {
  const navigate = useNavigate();

  const user = useMemo(() => getStoredUser(), []);
  const cacheKey = `dashboard:${user?.role ?? 'vpaa'}:${user?.id ?? 'current'}`;
  const cached = getCachedData<DashboardData>(cacheKey);

  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [hasData, setHasData] = useState(Boolean(cached));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const liveRevision = useLiveRevision(DASHBOARD_LIVE_TOPICS);
  const [schedules, setSchedules] = useState<Schedule[]>(cached?.schedules ?? []);
  const [sections, setSections] = useState<Section[]>(cached?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cached?.faculties ?? []);
  const [departments, setDepartments] = useState<Department[]>(cached?.departments ?? []);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(cached?.activeSemester ?? null);
  const [submissions, setSubmissions] = useState<OverviewSubmission[]>(cached?.submissions ?? []);
  const [transfers, setTransfers] = useState<RoomTransferRequest[]>([]);
  const [transferState, setTransferState] = useState<SourceState>('loading');
  const [transferError, setTransferError] = useState('');
  const [insights, setInsights] = useState<VpaaInsights | null>(null);
  const [insightsState, setInsightsState] = useState<SourceState>('loading');

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
        const data = await loadCachedData<DashboardData>(cacheKey, async () => {
          const response = await api.get<InitialDataResponse>('/initial-data', {
            params: { schedule_limit: SCHEDULE_PREVIEW_LIMIT },
          });
          const d = response.data || {};
          return {
            schedules: Array.isArray(d.schedules) ? d.schedules : [],
            sections: Array.isArray(d.sections) ? d.sections : [],
            faculties: Array.isArray(d.faculties) ? d.faculties : [],
            departments: Array.isArray(d.departments) ? d.departments : [],
            activeSemester: d.active_semester || null,
            submissions: Array.isArray(d.schedule_submissions) ? d.schedule_submissions : [],
          };
        }, reloadKey > 0);

        if (!active) return;
        setSchedules(data.schedules ?? []);
        setSections(data.sections ?? []);
        setFaculties(data.faculties ?? []);
        setDepartments(data.departments ?? []);
        setActiveSemester(data.activeSemester ?? null);
        setSubmissions(data.submissions ?? []);
        setHasData(true);
      } catch {
        if (active) setLoadError('Could not load institution-wide scheduling data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [cacheKey, reloadKey, liveRevision]);

  // Room use is computed server-side; a failed or malformed response shows as unavailable, never as zero rooms.
  useEffect(() => {
    const controller = new AbortController();
    api.get<VpaaInsights>('/vpaa/dashboard-insights', { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (!data?.utilization || !Array.isArray(data.utilization.buildings)) throw new Error('Malformed insights');
        setInsights(data);
        setInsightsState('ready');
      })
      .catch(() => { if (!controller.signal.aborted) setInsightsState('error'); });
    return () => controller.abort();
  }, [reloadKey, liveRevision]);

  // The approval workspace lists room transfers beside submissions, so the dashboard reads the same source.
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

  const retry = useCallback(() => setReloadKey(k => k + 1), []);

  const activeSemesterId = activeSemester?.id ?? null;
  const noSemester = hasData && !activeSemester;

  const submissionBySection = useMemo(
    () => latestSubmissionBySection(submissions, activeSemesterId),
    [submissions, activeSemesterId],
  );

  const departmentStats = useMemo<DepartmentRollup[]>(
    () => rollupDepartments(departments, sections, submissionBySection),
    [departments, sections, submissionBySection],
  );

  const totals = useMemo(() => institutionTotals(departmentStats), [departmentStats]);
  const fullyApprovedDepartments = departmentStats.filter(d => d.approvalStatus === 'Fully Approved').length;

  // Departments needing follow-up first: decisions for the VPAA, then returns, then work with the Deans.
  const progressRows = useMemo(
    () => [...departmentStats].sort((a, b) => attentionRank(a) - attentionRank(b)
      || a.progressPercent - b.progressPercent
      || a.department_code.localeCompare(b.department_code)),
    [departmentStats],
  );

  const departmentNames = useMemo(
    () => new Map(departments.map(d => [Number(d.id), d.department_name])),
    [departments],
  );

  const scheduleStatusesBySection = useMemo(() => {
    const map = new Map<string, string[]>();
    schedules.forEach(schedule => {
      const key = String(schedule.section_id);
      map.set(key, [...(map.get(key) ?? []), schedule.status]);
    });
    return map;
  }, [schedules]);

  const requests = useMemo<PendingRequest[]>(() => {
    if (!activeSemesterId) return [];
    const scheduleRequests = pendingScheduleRequests(
      'vpaa',
      submissions
        .filter(s => Number(s.semester_id) === Number(activeSemesterId))
        .map(s => ({ ...s, sections: s.sections ?? [] })),
      (_submission, sectionIds) => sectionIds.flatMap(id => scheduleStatusesBySection.get(id) ?? []),
      id => departmentNames.get(id) ?? 'Department',
    );
    return [...scheduleRequests, ...pendingTransferRequests('vpaa', transfers)].sort(oldestWaitingFirst);
  }, [activeSemesterId, submissions, scheduleStatusesBySection, departmentNames, transfers]);

  const scheduleRequestCount = requests.filter(r => r.type === 'schedule').length;
  const transferRequestCount = requests.length - scheduleRequestCount;
  const transfersKnown = transferState === 'ready';
  const oldest = requests.find(r => r.waitingSince);

  const exceptions = useMemo(() => workloadExceptions(faculties), [faculties]);

  const openApproval = () => navigate(APPROVAL_PATH);
  const openRequest = (request: PendingRequest) => navigate(reviewPath(APPROVAL_PATH, request));

  if (loading) return <DashboardSkeleton variant="vpaa" />;

  const term = fullSemesterLabel(activeSemester);
  const links = [
    { label: 'Open master calendar', onClick: () => navigate('/calendar') },
    { label: 'Reports', onClick: () => navigate('/reports') },
  ];

  if (!hasData) {
    return <div id="dashboard-overview" className="space-y-4 pb-8 text-text">
      <LoadWarning message={loadError ?? 'Scheduling data is unavailable.'} onRetry={retry} />
      <DashboardContext term={term} status="Data unavailable" statusTone="returned" summary="Approval figures are hidden until the data loads." />
    </div>;
  }

  if (noSemester) {
    return <div id="dashboard-overview" className="space-y-4 pb-8 text-text">
      {loadError && <LoadWarning message={`${loadError} Figures below may be out of date.`} onRetry={retry} />}
      <DashboardContext
        term="No active semester"
        status="No active semester"
        statusTone="drafting"
        summary="Approval progress is scoped to the active semester. Activate a semester to see decisions and department progress."
      />
      <RelatedLinks links={links} />
    </div>;
  }

  const decisionLabel = `${grouped(requests.length)} ${requests.length === 1 ? 'decision' : 'decisions'} awaiting you`;
  const contextStatus = requests.length > 0
    ? { label: decisionLabel, tone: 'ready' as const }
    : !transfersKnown
      ? { label: 'Room transfers unavailable', tone: 'drafting' as const }
      : totals.sections > 0 && totals.approved === totals.sections
        ? { label: 'All departments approved', tone: 'done' as const }
        : { label: 'Nothing awaiting you', tone: 'drafting' as const };
  const contextSummary = oldest
    ? `${oldest.department} has waited longest, ${relativeAge(oldest.waitingSince, now)}.`
    : !transfersKnown
      ? 'Schedule submissions are listed below; room transfers could not be checked.'
      : 'Requests appear here once a Dean forwards them.';

  const decisionParts = [
    `${scheduleRequestCount} schedule`,
    transfersKnown ? `${transferRequestCount} room transfer` : 'room transfers unavailable',
  ].join(' · ');

  const activeDepartments = progressRows.filter(row => row.sectionsCount > 0);
  const idleDepartments = progressRows.filter(row => row.sectionsCount === 0);
  const returnedDepartments = activeDepartments.filter(row => row.returnedCount > 0).length;
  const overridesWaiting = requests.filter(request => request.override).length;
  const notSubmitted = activeDepartments.filter(row => row.draftCount > 0).length;

  const institutionSegments = [
    { key: 'awaiting', label: 'Awaiting you', value: totals.pendingVpaa, color: STAGE.ready },
    { key: 'dean', label: 'With the Deans', value: totals.pendingDean, color: STAGE.waiting },
    { key: 'approved', label: 'Approved', value: totals.approved, color: STAGE.approved },
    { key: 'returned', label: 'Returned', value: totals.returned, color: STAGE.returned },
    { key: 'draft', label: 'Not yet submitted', value: totals.draft, color: STAGE.drafting },
  ];
  const departmentSegments = (row: DepartmentRollup) => [
    { key: 'awaiting', label: `awaiting you${row.hasOverride ? ' · override' : ''}`, value: row.pendingVpaaCount, color: STAGE.ready },
    { key: 'dean', label: 'with the Dean', value: row.pendingCount - row.pendingVpaaCount, color: STAGE.waiting },
    { key: 'approved', label: 'approved', value: row.approvedCount, color: STAGE.approved },
    { key: 'returned', label: 'returned', value: row.returnedCount, color: STAGE.returned },
    { key: 'draft', label: 'drafting', value: row.draftCount, color: STAGE.drafting },
  ];

  const exceptionRows: Array<{ key: string; label: string; value: number; tone: 'alert' | 'attention' | 'neutral'; icon: LucideIcon; onClick: () => void; action: string }> = [
    { key: 'over-limit', label: 'Instructors over their limit', value: exceptions.overLimit, tone: 'alert', icon: UserX, onClick: () => navigate('/instructors'), action: 'View instructors' },
    { key: 'overload', label: 'On overload, within limit', value: exceptions.overload, tone: 'attention', icon: Scale, onClick: () => navigate('/instructors'), action: 'View instructors' },
    { key: 'overrides', label: 'Dean overrides awaiting you', value: overridesWaiting, tone: 'attention', icon: ShieldAlert, onClick: openApproval, action: 'Open approval queue' },
    { key: 'not-submitted', label: 'Departments still drafting', value: notSubmitted, tone: 'neutral', icon: FilePen, onClick: () => navigate('/departments'), action: 'View departments' },
  ];
  const EXCEPTION_TONES = {
    alert: 'bg-stage-returned/10 text-stage-returned',
    attention: 'bg-accent/15 text-stage-warnText',
    neutral: 'bg-primary/[0.07] text-primary',
  } as const;

  return <div id="dashboard-overview" className="space-y-4 pb-8 text-text">
    {loadError && <LoadWarning message={`${loadError} Figures below may be out of date.`} onRetry={retry} />}

    <DashboardContext
      term={term}
      status={contextStatus.label}
      statusTone={contextStatus.tone}
      summary={contextSummary}
      action={requests.length > 0 ? { label: 'Review approvals', onClick: openApproval } : undefined}
    />

    <KpiStrip count={4}>
      <KpiCard
        label="Decisions awaiting you"
        icon={Inbox}
        value={transfersKnown || requests.length ? grouped(requests.length) : '—'}
        of={transfersKnown ? 'requests' : 'requests so far'}
        status={decisionParts}
        tone={requests.length ? 'attention' : transfersKnown ? 'good' : 'neutral'}
        onClick={openApproval}
        actionLabel="Open the approval queue"
      />
      <KpiCard
        label="Sections approved"
        icon={BadgeCheck}
        value={grouped(totals.approved)}
        of={`/ ${grouped(totals.sections)}`}
        meter={{ value: totals.progressPercent, color: STAGE.approved }}
        status={totals.sections > 0 && totals.progressPercent === 100 ? 'Every section approved' : `${totals.progressPercent}% across the institution`}
        tone={totals.sections > 0 && totals.progressPercent === 100 ? 'good' : 'neutral'}
      />
      <KpiCard
        label="Departments complete"
        icon={Building2}
        value={grouped(fullyApprovedDepartments)}
        of={`/ ${grouped(activeDepartments.length)} scheduling`}
        status={idleDepartments.length
          ? `${idleDepartments.length} ${idleDepartments.length === 1 ? 'department has' : 'departments have'} no sections`
          : 'Every department is scheduling'}
        tone={activeDepartments.length > 0 && fullyApprovedDepartments === activeDepartments.length ? 'good' : 'neutral'}
        onClick={() => navigate('/departments')}
        actionLabel="View departments"
      />
      <KpiCard
        label="Returned for revision"
        icon={RotateCcw}
        value={grouped(totals.returned)}
        of={`of ${grouped(totals.sections)} sections`}
        status={totals.returned ? `In ${returnedDepartments} ${returnedDepartments === 1 ? 'department' : 'departments'}` : 'None returned'}
        tone={totals.returned ? 'alert' : 'good'}
      />
    </KpiStrip>

    <Panel
      title="Waiting on your decision"
      subtitle={requests.length ? 'Schedule submissions and room transfers, longest-waiting first.' : undefined}
      badge={requests.length}
      action="Open approval queue"
      onAction={openApproval}
    >
      <RequestQueue
        requests={requests}
        now={now}
        title={request => request.department}
        scopeOf={request => request.type === 'room_transfer'
          ? `${request.meetingCount} ${request.meetingCount === 1 ? 'meeting' : 'meetings'} moved${request.semesterId && request.semesterId !== activeSemesterId && request.semesterLabel ? ` · ${request.semesterLabel}` : ''}`
          : `${request.sectionCount} ${request.sectionCount === 1 ? 'section' : 'sections'}`}
        onOpen={openRequest}
        onViewAll={openApproval}
        emptyText="Nothing is waiting on your decision."
        incomplete={transferState === 'error' ? `Room transfers could not be loaded (${transferError}). Only schedule submissions are listed; open the approval queue to check transfers.` : undefined}
      />
    </Panel>

    <Panel
      title="Institution status"
      subtitle="Every active section by approval stage, with departments needing follow-up first."
      action="View departments"
      onAction={() => navigate('/departments')}
    >
      <DistributionWithGroups
        groupsTitle="Department progress"
        distribution={<StatusDonut segments={institutionSegments} total={totals.sections} centerLabel="sections" label="Sections by approval stage" />}
      >
        {activeDepartments.length ? <StageRows
          label="Department progress"
          rows={activeDepartments.map(row => ({
            key: String(row.id),
            label: row.department_code,
            sublabel: row.department_name.replace(/^College of /, ''),
            summary: `${grouped(row.approvedCount)} / ${grouped(row.sectionsCount)} approved`,
            title: row.department_name,
            segments: departmentSegments(row),
          }))}
        /> : <EmptyNote>{departments.length ? 'No department has active sections this semester.' : 'No departments are set up yet. Add them under Departments.'}</EmptyNote>}
        {activeDepartments.length > 0 && idleDepartments.length > 0 && <p className="mt-3 border-t border-border pt-2.5 text-[12px] text-muted">
          No sections this semester: {idleDepartments.map(row => row.department_code).join(', ')}
        </p>}
      </DistributionWithGroups>
    </Panel>

    <div className="grid items-start gap-4 xl:grid-cols-12">
      <BuildingUtilizationPanel
        insights={insights}
        state={insightsState}
        onRetry={retry}
        onOpenDetails={() => navigate('/reports')}
        className="xl:col-span-7"
      />

      <Panel title="Exceptions to watch" subtitle="Workload and scheduling cases outside the norm." className="xl:col-span-5">
        <ul className="-mx-2 -my-1 divide-y divide-border">
          {exceptionRows.map(({ key, label, value, tone, icon: Icon, onClick, action }) => <li key={key}>
            <button type="button" onClick={onClick} title={action} className="focus-ring flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-parchment">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${value ? EXCEPTION_TONES[tone] : 'bg-stage-idle/60 text-muted'}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className={`min-w-0 flex-1 text-[13px] ${value ? 'font-semibold text-text' : 'text-muted'}`}>{label}</span>
              <b className={`shrink-0 text-[15px] font-semibold tabular-nums ${value ? 'text-text' : 'text-muted'}`}>{grouped(value)}</b>
              <span className="sr-only">. {action}</span>
            </button>
          </li>)}
        </ul>
      </Panel>
    </div>

    <RelatedLinks links={links} />
  </div>;
}

const attentionRank = (row: DepartmentRollup) => {
  if (row.pendingVpaaCount > 0) return 0;
  if (row.returnedCount > 0) return 1;
  if (row.pendingCount > 0) return 2;
  if (row.approvalStatus === 'Fully Approved') return 4;
  return 3;
};
