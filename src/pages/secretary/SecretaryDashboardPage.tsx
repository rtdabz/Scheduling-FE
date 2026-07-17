import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Clock,
  DoorOpen,
  Layers,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useTour } from '../../hooks/useTour';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import {
  ActivityFeed,
  AttentionPanel,
  ScheduleProgressCard,
  QuickActionsPanel,
  RadialProgressCard,
  SummaryMetricCard,
  TeachingLoadCard,
  type ActivityFeedItem,
  type AttentionItem,
  type ProgressStage,
  type QuickAction,
  type TeachingLoadItem,
} from '../../components/overview';

interface Schedule {
  id: number;
  term_id: number;
  section_id: number;
  room_id?: number | null;
  status: string;
}

interface Room {
  id: number;
  room_code: string;
  room_name?: string;
  room_type: string;
}

interface Section {
  id: number;
  section_name: string;
  department_id?: number | null;
}

interface Faculty {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  assigned_units?: number;
  department_id: number;
  department?: {
    id: number;
    department_name: string;
    department_code: string;
  } | null;
  status: string;
}

interface Subject {
  id: number;
  subject_code: string;
  subject_name: string;
}

interface Term {
  id: number;
  term_name: string;
  status: string;
}

interface StoredUser {
  id?: number;
  name?: string;
  department_id?: number;
  role?: string;
}

interface SchedulingOverviewData {
  schedules: Schedule[];
  rooms: Room[];
  sections: Section[];
  faculties: Faculty[];
  subjects: Subject[];
  activeTerm: Term | null;
}

export default function SecretarySchedulingOperationsPage() {
  useTour();
  const navigate = useNavigate();

  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const overviewCacheKey = `dashboard:${user?.role ?? 'secretary'}:${user?.id ?? user?.department_id ?? 'current'}`;
  const cachedOverviewData = getCachedData<SchedulingOverviewData>(overviewCacheKey);
  const [isLoading, setIsLoading] = useState(!hasCachedData(overviewCacheKey));
  const [lastUpdated, setLastUpdated] = useState('');

  const [schedules, setSchedules] = useState<Schedule[]>(cachedOverviewData?.schedules ?? []);
  const [rooms, setRooms] = useState<Room[]>(cachedOverviewData?.rooms ?? []);
  const [sections, setSections] = useState<Section[]>(cachedOverviewData?.sections ?? []);
  const [faculties, setFaculties] = useState<Faculty[]>(cachedOverviewData?.faculties ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(cachedOverviewData?.subjects ?? []);
  const [activeTerm, setActiveTerm] = useState<Term | null>(cachedOverviewData?.activeTerm ?? null);

  const {
    draftingProgress,
    yearLevels,
    stageCounts,
  } = useDepartmentScheduleStatus(user?.department_id);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const shouldShowSkeleton = !hasCachedData(overviewCacheKey);
      try {
        setIsLoading(shouldShowSkeleton);

        const data = await loadCachedData<SchedulingOverviewData>(overviewCacheKey, async () => {
          const [
            schedulesRes,
            roomsRes,
            sectionsRes,
            facultiesRes,
            subjectsRes,
            activeTermRes,
          ] = await Promise.all([
            api.get<Schedule[]>('/schedules'),
            api.get<Room[]>('/rooms'),
            api.get<Section[]>('/sections'),
            api.get<Faculty[]>('/faculties'),
            api.get<Subject[]>('/subjects'),
            api.get<Term>('/terms/active'),
          ]);

          return {
            schedules: schedulesRes.data,
            rooms: roomsRes.data,
            sections: sectionsRes.data,
            faculties: facultiesRes.data,
            subjects: subjectsRes.data,
            activeTerm: activeTermRes.data,
          };
        });

        if (!active) return;
        setSchedules(data.schedules);
        setRooms(data.rooms);
        setSections(data.sections);
        setFaculties(data.faculties);
        setSubjects(data.subjects);
        setActiveTerm(data.activeTerm);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } catch {
        if (active) {
          setIsLoading(false);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [overviewCacheKey]);

  const totalSchedules = schedules.length;
  const pendingApprovals = schedules.filter(schedule => schedule.status === 'submitted' || schedule.status === 'approved_by_dean').length;

  const visibleSections = useMemo(() => {
    if (!user?.department_id) return sections;
    return sections.filter(section => !section.department_id || Number(section.department_id) === Number(user.department_id));
  }, [sections, user?.department_id]);

  const scheduledSectionIds = useMemo(() => new Set(schedules.map(schedule => schedule.section_id)), [schedules]);
  const unscheduledSectionsCount = visibleSections.filter(section => !scheduledSectionIds.has(section.id)).length;

  const draftCount = stageCounts?.draft ?? 0;
  const submittedCount = stageCounts?.submitted ?? 0;
  const deanApprovedCount = stageCounts?.approved_by_dean ?? 0;
  const approvedCount = stageCounts?.approved ?? 0;
  const totalDeptSchedules = draftCount + submittedCount + deanApprovedCount + approvedCount;

  const draftPercent = totalDeptSchedules > 0 ? Math.round((draftCount / totalDeptSchedules) * 100) : 0;
  const submittedPercent = totalDeptSchedules > 0 ? Math.round((submittedCount / totalDeptSchedules) * 100) : 0;
  const deanApprovedPercent = totalDeptSchedules > 0 ? Math.round((deanApprovedCount / totalDeptSchedules) * 100) : 0;
  const approvedPercent = totalDeptSchedules > 0 ? Math.round((approvedCount / totalDeptSchedules) * 100) : 0;

  const utilizedRoomIds = useMemo(() => new Set(schedules.filter(schedule => schedule.room_id).map(schedule => schedule.room_id)), [schedules]);
  const utilizationRate = rooms.length > 0 ? Math.round((utilizedRoomIds.size / rooms.length) * 100) : 0;

  const processedFaculties = useMemo(() => {
    let list = [...faculties];

    if (user?.department_id) {
      list = list.filter(faculty => faculty.department_id !== null && Number(faculty.department_id) === Number(user.department_id));
    }

    list.sort((a, b) => {
      const pctA = (a.assigned_units || 0) / (a.max_units || 21);
      const pctB = (b.assigned_units || 0) / (b.max_units || 21);
      return pctB - pctA;
    });

    return list.slice(0, 3);
  }, [faculties, user?.department_id]);

  const facultyStats = useMemo(() => {
    const list = user?.department_id
      ? faculties.filter(faculty => faculty.department_id !== null && Number(faculty.department_id) === Number(user.department_id))
      : faculties;

    let fullyLoaded = 0;
    let underloaded = 0;
    let overloaded = 0;

    list.forEach((faculty) => {
      const assigned = faculty.assigned_units || 0;
      const max = faculty.max_units || 21;
      const pct = max > 0 ? (assigned / max) * 100 : 0;

      if (pct > 100) {
        overloaded++;
      } else if (pct === 100) {
        fullyLoaded++;
      } else {
        underloaded++;
      }
    });

    return { total: list.length, fullyLoaded, underloaded, overloaded };
  }, [faculties, user?.department_id]);

  const needsAttention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];

    if (unscheduledSectionsCount > 0) {
      items.push({
        id: 'unscheduled-sections',
        title: 'Unscheduled Sections',
        description: 'Some sections do not have schedule entries yet.',
        count: unscheduledSectionsCount,
        actionLabel: 'Open scheduler',
        path: '/secretary/schedules',
        tone: 'warning',
      });
    }

    if (pendingApprovals > 0) {
      items.push({
        id: 'pending-approvals',
        title: 'Pending Reviews',
        description: 'Schedules are waiting in the approval flow.',
        count: pendingApprovals,
        actionLabel: 'View schedules',
        path: '/secretary/schedules',
        tone: 'info',
      });
    }

    if (facultyStats.overloaded > 0) {
      items.push({
        id: 'overloaded-faculty',
        title: 'Overloaded Faculty',
        description: 'Review teaching loads before final submission.',
        count: facultyStats.overloaded,
        actionLabel: 'Review faculty',
        path: '/secretary/instructors',
        tone: 'danger',
      });
    }

    if (utilizationRate >= 90) {
      items.push({
        id: 'room-capacity',
        title: 'High Room Usage',
        description: 'Room utilization is nearing capacity.',
        count: utilizationRate,
        actionLabel: 'Check rooms',
        path: '/secretary/rooms',
        tone: 'warning',
        showPercent: true,
      });
    }

    if (items.length === 0) {
      items.push({
        id: 'ready-status',
        title: 'No Immediate Issues',
        description: 'Current schedule data has no urgent overview alerts.',
        count: draftingProgress,
        actionLabel: 'Continue scheduling',
        path: '/secretary/schedules',
        tone: 'success',
        showPercent: true,
      });
    }

    return items.slice(0, 3);
  }, [draftingProgress, facultyStats.overloaded, pendingApprovals, unscheduledSectionsCount, utilizationRate]);

  const activitySummary = useMemo<ActivityFeedItem[]>(() => {
    const activities: ActivityFeedItem[] = [];

    if (pendingApprovals > 0) {
      activities.push({
        id: 1,
        action: `${pendingApprovals} schedule${pendingApprovals === 1 ? '' : 's'} currently pending review.`,
        timestamp: lastUpdated ? `Updated ${lastUpdated}` : 'Current overview data',
      });
    }

    if (draftCount > 0) {
      activities.push({
        id: 2,
        action: `${draftCount} section${draftCount === 1 ? '' : 's'} remain in draft status.`,
        timestamp: 'Schedule stage summary',
      });
    }

    if (facultyStats.overloaded > 0) {
      activities.push({
        id: 3,
        action: `${facultyStats.overloaded} faculty member${facultyStats.overloaded === 1 ? '' : 's'} may need load balancing.`,
        timestamp: 'Faculty load overview',
      });
    }

    if (unscheduledSectionsCount > 0) {
      activities.push({
        id: 4,
        action: `${unscheduledSectionsCount} section${unscheduledSectionsCount === 1 ? '' : 's'} still need schedule entries.`,
        timestamp: 'Section readiness check',
      });
    }

    if (activities.length === 0) {
      activities.push({
        id: 5,
        action: 'No urgent schedule, room, or faculty load alerts detected.',
        timestamp: lastUpdated ? `Updated ${lastUpdated}` : 'Current overview data',
      });
    }

    return activities.slice(0, 5);
  }, [draftCount, facultyStats.overloaded, lastUpdated, pendingApprovals, unscheduledSectionsCount]);

  const progressStages = useMemo<ProgressStage[]>(() => [
    {
      id: 'draft',
      label: 'Draft',
      count: draftCount,
      percent: draftPercent,
      dotClassName: 'bg-gray-400',
      cardClassName: 'bg-gray-50 border-gray-100',
    },
    {
      id: 'submitted',
      label: 'Submitted',
      count: submittedCount,
      percent: submittedPercent,
      dotClassName: 'bg-[#F5A623]',
      cardClassName: 'bg-[#F5A623]/5 border-[#F5A623]/20',
    },
    {
      id: 'dean-approved',
      label: 'Dean Approved',
      count: deanApprovedCount,
      percent: deanApprovedPercent,
      dotClassName: 'bg-[#5A1220]',
      cardClassName: 'bg-[#5A1220]/5 border-[#5A1220]/20',
    },
    {
      id: 'approved',
      label: 'VPAA Approved',
      count: approvedCount,
      percent: approvedPercent,
      dotClassName: 'bg-gray-800',
      cardClassName: 'bg-gray-50 border-gray-200',
    },
  ], [approvedCount, approvedPercent, deanApprovedCount, deanApprovedPercent, draftCount, draftPercent, submittedCount, submittedPercent]);

  const teachingLoadItems = useMemo<TeachingLoadItem[]>(() => (
    processedFaculties.map((faculty) => {
      const middleInitial = faculty.middle_name ? `${faculty.middle_name.charAt(0)}.` : '';
      const fullName = `${faculty.last_name}, ${faculty.first_name} ${middleInitial}`.trim();

      return {
        id: faculty.id,
        name: fullName,
        assignedUnits: faculty.assigned_units || 0,
        maxUnits: faculty.max_units || 21,
        badgeLabel: faculty.department?.department_code || 'N/A',
      };
    })
  ), [processedFaculties]);

  const quickActions = useMemo<QuickAction[]>(() => [
    {
      id: 'open-scheduler',
      label: 'Open Scheduler',
      description: 'Create, place, and adjust class schedules',
      icon: CalendarPlus,
      onClick: () => navigate('/secretary/schedules'),
    },
    {
      id: 'review-rooms',
      label: 'Review Rooms',
      description: 'Check room availability and assignments',
      icon: DoorOpen,
      onClick: () => navigate('/secretary/rooms'),
    },
    {
      id: 'manage-subjects',
      label: 'Manage Subjects',
      description: 'Maintain subject details used by scheduling',
      icon: BookOpen,
      onClick: () => navigate('/secretary/subjects'),
    },
    {
      id: 'review-faculty-load',
      label: 'Review Faculty Load',
      description: 'Balance instructor assignments and units',
      icon: Users,
      onClick: () => navigate('/secretary/instructors'),
    },
  ], [navigate]);

  const progressFooterNote = useMemo(() => {
    if (!yearLevels || yearLevels.length === 0) return 'No schedule status data';

    const incompleteYearLevels = yearLevels.filter(yearLevel => !yearLevel.isComplete).map(yearLevel => yearLevel.label);

    return incompleteYearLevels.length === 0
      ? 'All year levels have moved beyond draft'
      : `Needs work: ${incompleteYearLevels.join(', ')}`;
  }, [yearLevels]);

  return (
    <div className="space-y-8 pb-12 transition-opacity duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-muted text-xs tracking-wider uppercase">Home / Scheduling Operations</p>
        </div>
        {activeTerm && (
          <div className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-150 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active Term: {activeTerm.term_name}
            {lastUpdated && (
              <span className="text-emerald-600/70 border-l border-emerald-200 pl-2">
                Updated {lastUpdated}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="bg-[#5A1220] py-4 px-6 rounded-xl text-white border border-[#5A1220]/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="font-sans text-base font-medium tracking-tight text-white">
          Welcome back, <span className="text-[#F5A623] font-medium">{user?.name || 'Secretary User'}</span>!
        </h1>
        {activeTerm && (
          <span className="text-xs sm:text-sm text-[#F5A623]/85 font-medium tracking-wide">
            {activeTerm.term_name}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="bg-white p-5 rounded-xl border-[0.5px] border-gray-200 animate-pulse min-h-[98px] flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-6 w-6 rounded-lg" />
                </div>
                <Skeleton className="h-9 w-10" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse flex flex-col justify-between min-h-[340px]">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full rounded-full mt-2" />
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              </div>
              <Skeleton className="h-10 w-full rounded-xl mt-4" />
            </div>

            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse flex flex-col items-center justify-center gap-4 min-h-[340px]">
              <div className="self-start">
                <Skeleton className="h-5 w-36" />
              </div>
              <Skeleton className="h-32 w-32 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>

            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse flex flex-col justify-between min-h-[340px]">
              <div className="space-y-4">
                <Skeleton className="h-5 w-32" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                      <Skeleton className="h-2 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              </div>
              <Skeleton className="h-4 w-28 self-end" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <div className="lg:col-span-2 bg-white p-6 rounded-xl border-[0.5px] border-gray-200 animate-pulse space-y-5 min-h-[280px]">
              <Skeleton className="h-5 w-36" />
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex gap-3 items-start">
                  <Skeleton className="h-3.5 w-3.5 rounded-full flex-shrink-0 mt-1" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
            <SummaryMetricCard label="Schedules" value={totalSchedules} icon={CalendarDays} />
            <SummaryMetricCard label="Pending" value={pendingApprovals} icon={Clock} iconClassName="text-[#F5A623]" iconWrapperClassName="bg-[#F5A623]/5" />
            <SummaryMetricCard label="Sections" value={visibleSections.length} icon={Layers} />
            <SummaryMetricCard label="Faculty" value={facultyStats.total} icon={Users} />
            <SummaryMetricCard label="Rooms" value={rooms.length} icon={DoorOpen} />
            <SummaryMetricCard label="Subjects" value={subjects.length} icon={BookOpen} />
          </div>

          <AttentionPanel
            title="Needs Attention"
            subtitle="Priority items for today's scheduling work"
            icon={AlertTriangle}
            items={needsAttention}
            onAction={navigate}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <ScheduleProgressCard
              title="Schedule Completion Status"
              icon={TrendingUp}
              progress={draftingProgress}
              emptyMessage="No scheduled section data available."
              stages={progressStages}
              footerNote={progressFooterNote}
              footerMeta={lastUpdated ? `Updated ${lastUpdated}` : 'Current data'}
              actionLabel="View details"
              onAction={() => navigate('/secretary/schedules')}
              showBadge={Boolean(user?.department_id)}
              badgeLabel={`${draftingProgress}% Ready`}
            />

            <RadialProgressCard
              title="Room Utilization"
              icon={DoorOpen}
              value={utilizationRate}
              label="Utilization"
              footer={`${utilizedRoomIds.size} out of ${rooms.length} rooms scheduled.`}
            />

            <TeachingLoadCard
              title="Faculty Load"
              icon={Users}
              items={teachingLoadItems}
              emptyMessage="No instructors found."
              actionLabel="View all faculty ->"
              onAction={() => navigate(user?.role?.toLowerCase() === 'secretary' ? '/secretary/instructors' : '/faculty')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <QuickActionsPanel title="Quick Actions" actions={quickActions} />
            <ActivityFeed
              title="Current Activity Summary"
              icon={ClipboardList}
              items={activitySummary}
              emptyMessage="No current activity summary available."
              actionLabel="Open scheduling workspace ->"
              onAction={() => navigate('/secretary/schedules')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
