import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  DoorOpen,
  FileClock,
  FilePen,
  Handshake,
  Hourglass,
  KeyRound,
  Send,
  UserRoundCheck,
  type LucideIcon,
} from 'lucide-react';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import RoomRecoveryAlerts from '../../components/rooms/RoomRecoveryAlerts';
import { LoadWarning, Panel } from '../../components/vpaa/DashboardPrimitives';
import { EmptyNote, type TagTone } from '../../components/dashboard/Ledger';
import { CheckSegments, DashboardContext, KpiCard, KpiStrip, RelatedLinks, StageRows } from '../../components/dashboard/Analytics';
import { WeekGlance, type GlanceGrid } from '../../components/dashboard/WeekGlance';
import { STAGE } from '../../lib/dashboardStage';
import { DEAN_REQUIRED_MESSAGE, useDepartmentScheduleStatus, type SectionStatusItem } from '../../hooks/useDepartmentScheduleStatus';
import { fullSemesterLabel } from '../../lib/semesterLabel';
import api from '../../lib/api';
import { getStoredUser, hasStoredCapability } from '../../lib/storedUser';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import { fetchRoomRequests, type RoomRequest } from '../../lib/roomRequests';
import { INSTRUCTOR_ASSIGNABLE_STATUSES, type ScheduleStatus } from '../ClassSchedules/SchedulerPanel/types';

interface Schedule { id:number; semester_id:number; section_id:number; day?:string|null; faculty_id?:number|null; room_id?:number|null; mode?:string|null; start_time:string; end_time:string; status:string; course?:{id?:number}|null; subject?:{id?:number}|null; faculty?:{id?:number}|null; room?:{id?:number;room_type?:string}|null; department_id?:number|null }
interface Semester { id:number; status?:string; academic_year?:string|null; semester?:string|null }
interface Overview { schedules:Schedule[]; activeSemester:Semester|null; schedulesTruncated?:boolean; timeGrid?:GlanceGrid|null }
interface InitialData { schedules?:Schedule[]; active_semester?:Semester; schedules_truncated?:boolean; time_grid?:GlanceGrid|null }

interface QueueRow { key:string; label:string; value:number; action:string; icon:LucideIcon; path:string }

const percent = (part:number, total:number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const deliveryOf = (schedule:Schedule) => {
  const mode = `${schedule.mode ?? ''} ${schedule.room?.room_type ?? ''}`.toLowerCase();
  if (mode.includes('online')) return 'online';
  if (mode.includes('field')) return 'field';
  return 'on-site';
};

// Rows the department is still preparing. Submitted, reviewed and approved rows are out of the secretary's hands.
const PREPARATION_STATUSES = new Set(['draft', 'completed', 'revision', 'rejected', 'rejected_by_dean']);
const ASSIGNABLE = new Set<string>(INSTRUCTOR_ASSIGNABLE_STATUSES as ScheduleStatus[]);

const YEAR_LABELS: Record<number, string> = { 1: '1st year', 2: '2nd year', 3: '3rd year', 4: '4th year' };

interface SecretaryDashboardPageProps {
  role?: 'secretary' | 'program_head';
}

const DASHBOARD_LIVE_TOPICS = ['schedules', 'approvals', 'assignments', 'sections', 'rooms', 'faculty', 'courses', 'curriculum', 'departments'] as const;

type SourceState = 'idle' | 'loading' | 'ready' | 'error';

export default function SecretaryDashboardPage({ role = 'secretary' }: SecretaryDashboardPageProps) {
  const navigate = useNavigate();

  const user = useMemo(() => getStoredUser(), []);
  const departmentId = user?.department_id ?? null;
  const canViewSchedules = hasStoredCapability('schedule.view');
  const canUpdateSchedules = hasStoredCapability('schedule.update');
  const canAssignInstructors = hasStoredCapability('schedule.assign_instructor');
  const canAssignCrossDepartment = hasStoredCapability('schedule.assign_instructor_cross_department');
  const isProgramHead = role === 'program_head';
  // Room Requests is a Secretary route; owner review also needs its review capability.
  const canReviewBorrowing = !isProgramHead && hasStoredCapability('room.request') && hasStoredCapability('room.review_requests') && departmentId != null;
  const base = isProgramHead ? '/program_head' : '/secretary';
  const paths = {
    schedules: `${base}/schedule-management`,
    instructorAssignment: `${base}/instructor-assignment`,
    rooms: `${base}/facilities`,
    crossDepartment: `${base}/cross-department-assignments`,
    history: `${base}/schedule-history`,
    roomRequests: '/secretary/room-requests',
  };
  const roomAssignmentPath = canUpdateSchedules ? paths.schedules : paths.rooms;
  const cacheKey = `dashboard:${user?.role ?? 'secretary'}:${user?.id ?? departmentId ?? 'current'}`;
  const cached = getCachedData<Overview>(cacheKey);

  const [loading, setLoading] = useState(!hasCachedData(cacheKey));
  const [hasData, setHasData] = useState(Boolean(cached));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const liveRevision = useLiveRevision(DASHBOARD_LIVE_TOPICS);
  const [schedules, setSchedules] = useState<Schedule[]>(cached?.schedules ?? []);
  const [semester, setSemester] = useState<Semester | null>(cached?.activeSemester ?? null);
  const [schedulesTruncated, setSchedulesTruncated] = useState(cached?.schedulesTruncated === true);
  const [timeGrid, setTimeGrid] = useState<GlanceGrid | null>(cached?.timeGrid ?? null);
  const [borrowing, setBorrowing] = useState<RoomRequest[]>([]);
  const [borrowingState, setBorrowingState] = useState<SourceState>(canReviewBorrowing ? 'loading' : 'idle');

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(liveRevision === 0 && !hasCachedData(cacheKey));
      setLoadError(null);
      try {
        const overview = await loadCachedData<Overview>(cacheKey, async () => {
          const { data = {} } = await api.get<InitialData>('/initial-data');
          return {
            schedules: Array.isArray(data.schedules) ? data.schedules : [],
            activeSemester: data.active_semester || null,
            schedulesTruncated: data.schedules_truncated === true,
            timeGrid: data.time_grid ?? null,
          };
        }, reloadKey > 0);

        if (!active) return;
        setSchedules(overview.schedules ?? []);
        setSemester(overview.activeSemester ?? null);
        setSchedulesTruncated(overview.schedulesTruncated === true);
        setTimeGrid(overview.timeGrid ?? null);
        setHasData(true);
      } catch {
        if (active) setLoadError('Could not load scheduling data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [cacheKey, reloadKey, liveRevision]);

  useEffect(() => {
    if (!canReviewBorrowing) return;
    let active = true;
    fetchRoomRequests({ status: 'pending' })
      .then(requests => {
        if (!active) return;
        setBorrowing(Array.isArray(requests) ? requests : []);
        setBorrowingState('ready');
      })
      .catch(() => { if (active) setBorrowingState('error'); });
    return () => { active = false; };
  }, [canReviewBorrowing, reloadKey, liveRevision]);

  const {
    sections: statusSections,
    stageCounts,
    yearLevels,
    totalSections,
    hasDean,
    crossDepartmentPending,
    loading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useDepartmentScheduleStatus(departmentId);

  const retry = useCallback(() => {
    setReloadKey(k => k + 1);
    refetchStatus();
  }, [refetchStatus]);

  const semesterId = semester?.id ?? null;
  const statusKnown = !statusError || statusSections.length > 0;
  const sectionIds = useMemo(() => new Set(statusSections.map(s => Number(s.id))), [statusSections]);
  const visibleSchedules = useMemo(
    () => schedules.filter(s =>
      semesterId != null && Number(s.semester_id) === Number(semesterId) &&
      (sectionIds.has(Number(s.section_id)) || (departmentId != null && Number(s.department_id) === Number(departmentId)))),
    [schedules, semesterId, sectionIds, departmentId],
  );

  const scheduledSectionIds = useMemo(() => new Set(visibleSchedules.map(s => Number(s.section_id))), [visibleSchedules]);
  // A capped schedule list cannot prove that a section has no meetings.
  const unscheduled = schedulesTruncated ? 0 : statusSections.filter(s => !scheduledSectionIds.has(Number(s.id))).length;
  const preparing = visibleSchedules.filter(s => PREPARATION_STATUSES.has(s.status));
  const noRoom = preparing.filter(s => deliveryOf(s) === 'on-site' && !s.room_id && !s.room).length;
  const incomplete = preparing.filter(s => (!s.course && !s.subject) || !s.start_time || !s.end_time).length;
  // Instructors are assigned only after VPAA approval, and finalized work is locked.
  const assignmentsDue = canAssignInstructors
    ? visibleSchedules.filter(s => ASSIGNABLE.has(s.status) && !s.faculty_id && !s.faculty).length
    : 0;
  const borrowingDue = borrowing.filter(r => r.status === 'pending' && (r.owner_department?.id ?? r.room?.department_id ?? null) === departmentId).length;

  const returned = stageCounts.revision;
  const toDraft = Math.max(0, stageCounts.draft - stageCounts.revision);
  const drafted = stageCounts.completed;
  const withDean = stageCounts.submitted;
  const withVpaa = stageCounts.approved_by_dean + stageCounts.conditionally_approved;
  const approved = stageCounts.approved;
  const allYearsDrafted = yearLevels.length > 0 && yearLevels.every(y => y.isComplete);
  const readyToSubmit = allYearsDrafted && drafted > 0;

  const queue: QueueRow[] = [
    ...(canViewSchedules ? [{ key: 'returned', label: 'Sections returned for revision', value: returned, action: 'Revise', icon: FileClock, path: paths.schedules }] : []),
    ...(canUpdateSchedules ? [{ key: 'unscheduled', label: 'Sections with no meetings yet', value: unscheduled, action: 'Draft', icon: CalendarDays, path: paths.schedules }] : []),
    { key: 'rooms', label: 'On-site meetings without a room', value: noRoom, action: 'Assign', icon: DoorOpen, path: roomAssignmentPath },
    ...(canUpdateSchedules ? [{ key: 'incomplete', label: 'Incomplete meeting entries', value: incomplete, action: 'Complete', icon: ClipboardCheck, path: paths.schedules }] : []),
    ...(canUpdateSchedules && readyToSubmit ? [{ key: 'submit', label: 'Drafted sections ready to submit', value: drafted, action: 'Submit', icon: Send, path: paths.schedules }] : []),
    ...(canAssignInstructors ? [{ key: 'assign', label: 'Approved meetings without an instructor', value: assignmentsDue, action: 'Assign', icon: UserRoundCheck, path: paths.instructorAssignment }] : []),
    ...(canAssignCrossDepartment ? [{ key: 'delegated', label: 'Delegated meetings without an instructor', value: crossDepartmentPending, action: 'Assign', icon: Handshake, path: paths.crossDepartment }] : []),
    ...(canReviewBorrowing ? [{ key: 'borrowing', label: 'Room borrowing requests to review', value: borrowingDue, action: 'Review', icon: KeyRound, path: paths.roomRequests }] : []),
  ];
  const openQueue = queue.filter(row => row.value > 0);
  const queueIncomplete = [
    !statusKnown && 'Section status could not be loaded, so returned and unscheduled sections may be missing.',
    schedulesTruncated && 'Only part of the semester\'s meetings loaded, so meeting counts may be low.',
    borrowingState === 'error' && 'Room borrowing requests could not be loaded.',
  ].filter(Boolean) as string[];

  const yearRows = useMemo(() => {
    const groups = new Map<number, SectionStatusItem[]>();
    statusSections.forEach(s => groups.set(s.year_level, [...(groups.get(s.year_level) ?? []), s]));
    return [...groups.entries()].sort(([a], [b]) => a - b).map(([year, group]) => {
      const count = (...statuses: string[]) => group.filter(s => statuses.includes(s.status)).length;
      return {
        year,
        label: YEAR_LABELS[year] ?? `Year ${year}`,
        total: group.length,
        drafting: count('draft'),
        returned: count('revision'),
        drafted: count('completed'),
        review: count('submitted', 'approved_by_dean', 'conditionally_approved'),
        approved: count('approved'),
      };
    });
  }, [statusSections]);

  // Preparation guidance only: the server validates again on submission.
  const checks: ReadonlyArray<readonly [string, boolean]> = [
    ['Every active section has meetings', !schedulesTruncated && unscheduled === 0],
    ['On-site meetings being prepared have rooms', noRoom === 0],
    ['Meeting entries are complete', incomplete === 0],
    ['Every year level has left the draft stage', allYearsDrafted],
    ['A Department Dean is assigned to receive the submission', hasDean],
  ];
  const passedChecks = checks.filter(([, done]) => done).length;
  const showChecks = canViewSchedules && (toDraft > 0 || returned > 0 || drafted > 0);

  if (loading || statusLoading) {
    return <DashboardSkeleton variant="secretary" secretaryLayout={{ queueRowCount: Math.min(queue.length, 6), showDraftingProgress: canViewSchedules }} />;
  }

  const links = [
    ...(canViewSchedules ? [{ label: 'Schedule Management', onClick: () => navigate(paths.schedules) }] : []),
    ...(canAssignInstructors ? [{ label: 'Instructor Assignment', onClick: () => navigate(paths.instructorAssignment) }] : []),
    ...(canAssignCrossDepartment ? [{ label: 'Cross-Department', onClick: () => navigate(paths.crossDepartment) }] : []),
    ...(canReviewBorrowing ? [{ label: 'Room Requests', onClick: () => navigate(paths.roomRequests) }] : []),
    ...(canViewSchedules ? [{ label: 'Schedule History', onClick: () => navigate(paths.history) }] : []),
  ];

  if (departmentId == null || !hasData || !semester) {
    const reason = departmentId == null
      ? { status: 'No department', summary: 'Your account has no department, so there is no scheduling work to show. Ask an administrator to assign one.' }
      : !hasData
        ? { status: 'Data unavailable', summary: 'Work items are hidden until scheduling data loads.' }
        : { status: 'No active semester', summary: 'Scheduling work is scoped to the active semester. Nothing is shown until one is activated.' };
    return <div id="dashboard-overview" className="space-y-4 pb-8 text-text">
      {loadError && <LoadWarning message={loadError} onRetry={retry} />}
      <DashboardContext term={semester ? fullSemesterLabel(semester) : reason.status} status={reason.status} statusTone="drafting" summary={reason.summary} />
      <RelatedLinks links={links} />
    </div>;
  }

  // Concurrent work: every non-empty stage is reported, and the action opens the most urgent one.
  const concurrent = [
    returned && `${returned} returned`,
    toDraft && `${toDraft} drafting`,
    drafted && `${drafted} drafted, not submitted`,
    withDean && `${withDean} with the Dean`,
    withVpaa && `${withVpaa} with the VPAA`,
    approved && `${approved} approved`,
  ].filter(Boolean).join(' · ');

  let stage: { label: string; tone: TagTone; summary: string; action?: { label: string; path: string; title?: string } };
  if (!statusKnown) stage = { label: 'Status unavailable', tone: 'drafting', summary: 'Section stages could not be loaded.' };
  else if (totalSections === 0) stage = { label: 'No active sections', tone: 'drafting', summary: 'No active sections found for this department yet.' };
  else if (returned > 0) stage = { label: 'Revision needed', tone: 'returned', summary: concurrent, action: { label: 'Revise returned sections', path: paths.schedules } };
  else if (toDraft > 0) stage = { label: 'Drafting', tone: 'drafting', summary: concurrent, action: { label: 'Continue drafting', path: paths.schedules } };
  else if (readyToSubmit) stage = {
    label: 'Ready to submit', tone: 'ready',
    summary: hasDean ? concurrent : `${concurrent}. ${DEAN_REQUIRED_MESSAGE}`,
    action: { label: 'Submit in schedule workflow', path: paths.schedules, title: 'Submission is done from the schedule workflow' },
  };
  else if (assignmentsDue > 0) stage = { label: 'Instructor assignment', tone: 'ready', summary: concurrent, action: { label: 'Assign instructors', path: paths.instructorAssignment } };
  else if (withDean + withVpaa > 0) stage = { label: 'Under review', tone: 'waiting', summary: `${concurrent}. Nothing is needed from you for the sections under review.` };
  else stage = { label: 'Approved', tone: 'done', summary: canAssignInstructors ? 'Every section is approved by the VPAA, and no approved meeting is waiting for an instructor.' : 'Every section is approved by the VPAA.' };

  const draftedSections = totalSections - toDraft - returned;
  const approvedMeetings = visibleSchedules.filter(s => ASSIGNABLE.has(s.status)).length;
  const showReadiness = canViewSchedules && showChecks;
  const unknown = '—';
  const kpis = [
    <KpiCard
      key="drafted"
      label="Sections drafted"
      icon={FilePen}
      value={statusKnown ? draftedSections : unknown}
      of={statusKnown ? `/ ${totalSections}` : undefined}
      meter={statusKnown ? { value: percent(draftedSections, totalSections), color: returned ? STAGE.returned : STAGE.done } : undefined}
      status={!statusKnown ? 'Section status unavailable' : returned ? `${returned} returned for revision` : toDraft ? `${toDraft} still drafting` : 'Every section drafted'}
      tone={!statusKnown ? 'neutral' : returned ? 'alert' : toDraft ? 'attention' : 'good'}
      onClick={canViewSchedules ? () => navigate(paths.schedules) : undefined}
      actionLabel="Open schedules"
    />,
    <KpiCard
      key="review"
      label="Under review"
      icon={Hourglass}
      value={statusKnown ? withDean + withVpaa : unknown}
      of={statusKnown ? `of ${totalSections}` : undefined}
      status={statusKnown ? `${withDean} with the Dean · ${withVpaa} with the VPAA` : 'Section status unavailable'}
      tone="neutral"
    />,
    <KpiCard
      key="approved"
      label="Approved by the VPAA"
      icon={BadgeCheck}
      value={statusKnown ? approved : unknown}
      of={statusKnown ? `/ ${totalSections}` : undefined}
      meter={statusKnown ? { value: percent(approved, totalSections), color: STAGE.approved } : undefined}
      status={!statusKnown ? 'Section status unavailable' : totalSections > 0 && approved === totalSections ? 'Every section approved' : `${totalSections - approved} not yet approved`}
      tone={statusKnown && totalSections > 0 && approved === totalSections ? 'good' : 'neutral'}
    />,
    canAssignInstructors && <KpiCard
      key="assign"
      label="Instructors assigned"
      icon={UserRoundCheck}
      value={(approvedMeetings - assignmentsDue).toLocaleString()}
      of={`/ ${approvedMeetings.toLocaleString()} meetings`}
      meter={approvedMeetings ? { value: percent(approvedMeetings - assignmentsDue, approvedMeetings), color: STAGE.done } : undefined}
      status={assignmentsDue ? `${assignmentsDue.toLocaleString()} approved meetings unassigned` : approvedMeetings ? 'Every approved meeting has an instructor' : 'Assigned after VPAA approval'}
      tone={assignmentsDue ? 'attention' : approvedMeetings ? 'good' : 'neutral'}
      onClick={() => navigate(paths.instructorAssignment)}
      actionLabel="Open instructor assignment"
    />,
  ].filter(Boolean);

  const yearSegments = (row: typeof yearRows[number]) => [
    { key: 'approved', label: 'approved', value: row.approved, color: STAGE.approved },
    { key: 'review', label: 'under review', value: row.review, color: STAGE.waiting },
    { key: 'drafted', label: 'not submitted', value: row.drafted, color: STAGE.ready },
    { key: 'returned', label: 'returned', value: row.returned, color: STAGE.returned },
    { key: 'drafting', label: 'drafting', value: row.drafting, color: STAGE.drafting },
  ];

  return <div id="dashboard-overview" className="space-y-4 pb-8 text-text">
    {canViewSchedules && <RoomRecoveryAlerts />}
    {(loadError || statusError) && <LoadWarning message={`${loadError || statusError} Figures below may be out of date.`} onRetry={retry} />}

    <DashboardContext
      term={fullSemesterLabel(semester)}
      status={stage.label}
      statusTone={stage.tone}
      summary={stage.summary}
      action={stage.action ? { label: stage.action.label, title: stage.action.title, onClick: () => navigate(stage.action!.path) } : undefined}
    />

    <KpiStrip count={kpis.length}>{kpis}</KpiStrip>

    <div id="dashboard-work-queue" className="grid items-start gap-4 xl:grid-cols-12">
      <Panel
        title="What's left to do"
        subtitle={openQueue.length ? `${openQueue.length} ${openQueue.length === 1 ? 'item needs' : 'items need'} attention.` : undefined}
        className={showReadiness ? 'xl:col-span-7' : 'xl:col-span-12'}
      >
        {queueIncomplete.map(note => <p key={note} role="status" className="mb-3 rounded-md bg-accent/10 px-3 py-2 text-[12px] text-stage-warnText">{note}</p>)}
        {openQueue.length ? <ul className="-mx-2 divide-y divide-border">
          {openQueue.map(({ key, label, value, action, icon: Icon, path }) => <li key={key}>
            <button
              type="button"
              onClick={() => navigate(path)}
              className="focus-ring group flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-parchment"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-stage-warnText"><Icon className="h-4 w-4" aria-hidden="true"/></span>
              <span className="min-w-0 flex-1 text-[13px] font-semibold text-text">{label}</span>
              <b className="shrink-0 text-right text-[15px] font-semibold tabular-nums text-stage-warnText">{value.toLocaleString()}</b>
              <span className="rounded-md border border-primary/25 px-2.5 py-1 text-[12px] font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-white">{action}</span>
            </button>
          </li>)}
        </ul> : queueIncomplete.length === 0 && <p className="flex items-center gap-2 text-[13px] text-stage-done">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true"/>
          Nothing is left to do right now.
        </p>}
      </Panel>

      {showReadiness && <Panel
        title="Submission readiness"
        subtitle={`${passedChecks} of ${checks.length} checks pass.`}
        className="xl:col-span-5"
      >
        <CheckSegments checks={checks} />
        <ul className="mt-3.5 space-y-2">
          {checks.map(([label, done]) => <li key={label} className="flex items-start gap-2.5">
            <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${done ? 'bg-stage-done/10 text-stage-done' : 'bg-accent/15 text-stage-warnText'}`}>
              {done ? <Check className="h-3 w-3" aria-hidden="true"/> : <AlertTriangle className="h-3 w-3" aria-hidden="true"/>}
            </span>
            <span className={`min-w-0 flex-1 text-[13px] leading-snug ${done ? 'text-muted' : 'font-semibold text-text'}`}>
              {label}
              <span className="sr-only">{done ? ' (passed)' : ' (not yet)'}</span>
            </span>
          </li>)}
        </ul>
        <p className="mt-3 border-t border-border pt-2.5 text-[12px] text-muted">Guidance only. Submission is validated again in the schedule workflow.</p>
      </Panel>}
    </div>

    {canViewSchedules && <div className="grid items-start gap-4 xl:grid-cols-12">
      <Panel
        title="Week at a glance"
        subtitle="Class meetings per hour across the department."
        action="Open schedules"
        onAction={() => navigate(paths.schedules)}
        className="xl:col-span-7"
      >
        {schedulesTruncated && <p role="status" className="mb-3 rounded-md bg-accent/10 px-3 py-2 text-[12px] text-stage-warnText">Only part of the semester's meetings loaded, so this preview may be incomplete.</p>}
        <WeekGlance meetings={visibleSchedules} grid={timeGrid} />
      </Panel>

      <Panel title="Progress by year level" subtitle="Sections by stage, per year level." className="xl:col-span-5">
        {!statusKnown ? <EmptyNote>Section status could not be loaded, so progress is unavailable.</EmptyNote>
          : yearRows.length ? <StageRows
            label="Year level progress"
            rows={yearRows.map(row => ({
              key: String(row.year),
              label: row.label,
              summary: `${row.total - row.drafting - row.returned} / ${row.total} drafted`,
              segments: yearSegments(row),
            }))}
          /> : <EmptyNote>No active sections found for this department yet.</EmptyNote>}
      </Panel>
    </div>}

    <RelatedLinks links={links} />
  </div>;
}
