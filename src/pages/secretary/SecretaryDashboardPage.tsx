import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Clock,
  DoorOpen,
  Layers,
  TrendingUp,
  Users,
  CheckCircle2,
  RotateCcw,
  Maximize2,
  Minimize2,
  Filter,
} from 'lucide-react';
import Skeleton from '../../components/ui/Skeleton';
import api from '../../lib/api';
import { getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useDepartmentScheduleStatus } from '../../hooks/useDepartmentScheduleStatus';
import { useSystemNotifications } from '../../hooks/useSystemNotifications';
import {
  AttentionPanel,
  ScheduleProgressCard,
  QuickActionsPanel,
  RadialProgressCard,
  SummaryMetricCard,
  TeachingLoadCard,
  type AttentionItem,
  type ProgressStage,
  type QuickAction,
  type TeachingLoadItem,
} from '../../components/overview';

interface Schedule {
  id: number;
  term_id: number;
  section_id: number;
  faculty_id?: number | null;
  room_id?: number | null;
  day: string;
  start_time: string;
  end_time: string;
  mode?: string;
  status: string;
  updated_at?: string;
  course?: {
    id: number;
    course_code: string;
    course_name: string;
  } | null;
  subject?: {
    id: number;
    subject_code: string;
    subject_name: string;
  } | null;
  faculty?: {
    id: number;
    first_name: string;
    last_name: string;
  } | null;
  room?: {
    id: number;
    room_code: string;
    building?: string;
  } | null;
  section?: {
    id: number;
    section_name: string;
    department_id: number;
    department?: {
      id: number;
      department_code: string;
      department_name: string;
    } | null;
  } | null;
  department_id?: number | null;
  department?: {
    id: number;
    department_code: string;
    department_name: string;
  } | null;
}

interface Room {
  id: number;
  room_code: string;
  building?: string;
  room_type: string;
  department_id?: number | null;
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
  department_id?: number | null;
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

interface InitialDataResponse extends Omit<SchedulingOverviewData, 'activeTerm'> {
  active_term: Term;
}

export default function SecretarySchedulingOperationsPage() {
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

  // Timetable Calendar Filters and state for Secretary's Department
  const daysOfWeek = useMemo(() => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], []);
  const todayShort = useMemo(() => daysOfWeek[new Date().getDay()], [daysOfWeek]);
  const [filterDay, setFilterDay] = useState<string>('all');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const currentDayName = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[now.getDay()];
  }, [now]);

  const currentDayTimeTop = useMemo(() => {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const startMinutes = 7 * 60; // 7:00 AM
    const elapsed = totalMinutes - startMinutes;
    if (elapsed < 0 || elapsed > 12 * 60) return null; // Outside 7:00 AM - 7:00 PM
    return elapsed * 0.8; // 600px height / 720 minutes = 0.8px per minute
  }, [now]);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  const timeSlots = useMemo(() => {
    const slots = [];
    for (let slot = 0; slot < 25; slot += 1) { // 25 half-hour slots from 7:00 AM to 7:30 PM (ends at 7:00 PM label)
      const totalMinutes = 7 * 60 + slot * 30;
      let hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const ampm = hours >= 12 ? "PM" : "AM";
      if (hours > 12) hours -= 12;
      if (hours === 0) hours = 12;
      slots.push({
        label: `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`,
      });
    }
    return slots;
  }, []);

  const parseTimeToSlotIndex = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(" ");
    if (parts.length < 2) return 0;
    const [time, modifier] = parts;
    let [hours, minutes] = time.split(":").map(Number);
    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    const totalMinutes = hours * 60 + minutes;
    const startMinutes = 7 * 60;
    return Math.max(0, (totalMinutes - startMinutes) / 30);
  };

  const getShortDay = (dayStr: string) => {
    if (!dayStr) return "";
    const clean = dayStr.trim().toLowerCase();
    if (clean.startsWith("sun")) return "Sun";
    if (clean.startsWith("mon")) return "Mon";
    if (clean.startsWith("tue")) return "Tue";
    if (clean.startsWith("wed")) return "Wed";
    if (clean.startsWith("thu")) return "Thu";
    if (clean.startsWith("fri")) return "Fri";
    if (clean.startsWith("sat")) return "Sat";
    return "";
  };

  const getDeptStyles = (deptCode: string) => {
    const upper = (deptCode || "").toUpperCase();
    if (upper === "CIT" || upper === "IT") return "bg-red-50 text-red-950 border-red-200 border-l-red-600 hover:bg-red-100/80";
    if (upper === "CAS") return "bg-amber-50 text-amber-950 border-amber-200 border-l-amber-600 hover:bg-amber-100/80";
    if (upper === "CBA") return "bg-emerald-50 text-emerald-950 border-emerald-200 border-l-emerald-600 hover:bg-emerald-100/80";
    if (upper === "CCJPS" || upper === "CRIM") return "bg-blue-50 text-blue-950 border-blue-200 border-l-blue-600 hover:bg-blue-100/80";
    if (upper === "CED") return "bg-purple-50 text-purple-950 border-purple-200 border-l-purple-600 hover:bg-purple-100/80";
    if (upper === "CHM") return "bg-rose-50 text-rose-950 border-rose-200 border-l-rose-600 hover:bg-rose-100/80";
    return "bg-slate-50 text-slate-900 border-slate-200 border-l-slate-600 hover:bg-slate-100/80";
  };

  const getDayLayouts = (daySchedules: Schedule[]) => {
    const slots = daySchedules.map(s => ({
      ...s,
      startIdx: parseTimeToSlotIndex(s.start_time),
      endIdx: parseTimeToSlotIndex(s.end_time)
    }));

    const layouts: { [key: number]: { col: number; totalCols: number } } = {};
    for (let i = 0; i < slots.length; i++) {
      const cur = slots[i];
      let col = 0;
      let totalCols = 1;
      const overlaps: typeof slots = [];

      for (let j = 0; j < slots.length; j++) {
        if (i === j) continue;
        const other = slots[j];
        if (cur.startIdx < other.endIdx && cur.endIdx > other.startIdx) {
          overlaps.push(other);
        }
      }

      const assignedCols = new Set<number>();
      for (const ov of overlaps) {
        if (layouts[ov.id]) {
          assignedCols.add(layouts[ov.id].col);
        }
      }

      while (assignedCols.has(col)) {
        col++;
      }

      totalCols = Math.max(overlaps.length + 1, col + 1);
      layouts[cur.id] = { col, totalCols };
    }

    return layouts;
  };

  // Calendar filtered schedules: scoped exclusively to secretary's own department
  const calendarFilteredSchedules = useMemo(() => {
    const activeTermSchedules = activeTerm?.id
      ? schedules.filter(s => Number(s.term_id) === Number(activeTerm.id))
      : schedules;

    let deptSchedules = activeTermSchedules;
    if (user?.department_id) {
      deptSchedules = activeTermSchedules.filter(s => {
        const secDept = s.section?.department_id;
        const schedDept = s.department?.id;
        return (secDept && Number(secDept) === Number(user.department_id)) ||
               (schedDept && Number(schedDept) === Number(user.department_id)) ||
               Number(s.department_id) === Number(user.department_id);
      });
    }

    if (filterDay !== 'all') {
      deptSchedules = deptSchedules.filter(s => getShortDay(s.day) === filterDay);
    }

    if (!searchQuery.trim()) {
      return deptSchedules;
    }

    const q = searchQuery.toLowerCase();
    return deptSchedules.filter(s => {
      const sectionName = s.section?.section_name?.toLowerCase() || '';
      const courseCode = s.course?.course_code?.toLowerCase() || '';
      const courseName = s.course?.course_name?.toLowerCase() || '';
      const subjectCode = s.subject?.subject_code?.toLowerCase() || '';
      const subjectName = s.subject?.subject_name?.toLowerCase() || '';
      const facultyName = s.faculty
        ? `${s.faculty.first_name} ${s.faculty.last_name}`.toLowerCase()
        : '';
      const roomCode = s.room?.room_code?.toLowerCase() || '';
      const building = s.room?.building?.toLowerCase() || '';

      return sectionName.includes(q) ||
             courseCode.includes(q) ||
             courseName.includes(q) ||
             subjectCode.includes(q) ||
             subjectName.includes(q) ||
             facultyName.includes(q) ||
             roomCode.includes(q) ||
             building.includes(q);
    });
  }, [schedules, activeTerm, user?.department_id, filterDay, searchQuery]);

  const calendarTotalClasses = calendarFilteredSchedules.length;
  const calendarRoomsInUse = useMemo(() => {
    const used = new Set(calendarFilteredSchedules.map(s => s.room_id).filter(Boolean));
    return used.size;
  }, [calendarFilteredSchedules]);
  const calendarAvailableRooms = useMemo(() => {
    const deptRooms = rooms.filter(r => !user?.department_id || !r.department_id || Number(r.department_id) === Number(user.department_id));
    return Math.max(0, deptRooms.length - calendarRoomsInUse);
  }, [rooms, user?.department_id, calendarRoomsInUse]);

  const {
    draftingProgress,
    yearLevels,
    stageCounts,
  } = useDepartmentScheduleStatus(user?.department_id);
  const { feedItems: notificationItems, unreadCount, markAllAsRead } = useSystemNotifications();

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      const shouldShowSkeleton = !hasCachedData(overviewCacheKey);
      try {
        setIsLoading(shouldShowSkeleton);

        const data = await loadCachedData<SchedulingOverviewData>(overviewCacheKey, async () => {
          const response = await api.get<InitialDataResponse>('/initial-data');

          return {
            schedules: response.data.schedules,
            rooms: response.data.rooms,
            sections: response.data.sections,
            faculties: response.data.faculties,
            subjects: response.data.subjects,
            activeTerm: response.data.active_term,
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

  const visibleSections = useMemo(() => {
    if (!user?.department_id) return sections;
    return sections.filter(section => !section.department_id || Number(section.department_id) === Number(user.department_id));
  }, [sections, user?.department_id]);

  const visibleRooms = useMemo(() => {
    if (!user?.department_id) return rooms;
    return rooms.filter(room => !room.department_id || Number(room.department_id) === Number(user.department_id));
  }, [rooms, user?.department_id]);

  const visibleSubjects = useMemo(() => {
    if (!user?.department_id) return subjects;
    return subjects.filter(subject => !subject.department_id || Number(subject.department_id) === Number(user.department_id));
  }, [subjects, user?.department_id]);

  const visibleSectionIds = useMemo(() => new Set(visibleSections.map(section => section.id)), [visibleSections]);

  const visibleSchedules = useMemo(() => schedules.filter(schedule => {
    const matchesActiveTerm = !activeTerm?.id || Number(schedule.term_id) === Number(activeTerm.id);
    return matchesActiveTerm && visibleSectionIds.has(schedule.section_id);
  }), [activeTerm?.id, schedules, visibleSectionIds]);

  const totalSchedules = visibleSchedules.length;
  const pendingApprovals = visibleSchedules.filter(schedule => schedule.status === 'submitted' || schedule.status === 'approved_by_dean').length;

  const scheduledSectionIds = useMemo(() => new Set(visibleSchedules.map(schedule => schedule.section_id)), [visibleSchedules]);
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

  const utilizedRoomIds = useMemo(() => new Set(visibleSchedules.filter(schedule => schedule.room_id).map(schedule => schedule.room_id)), [visibleSchedules]);
  const utilizationRate = visibleRooms.length > 0 ? Math.round((utilizedRoomIds.size / visibleRooms.length) * 100) : 0;

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
    <div className="space-y-5 pb-8 transition-opacity duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-muted text-xs tracking-wider uppercase">Home / Scheduling Operations</p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[#1f2937]">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Overview of scheduling activity and department progress.</p>
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

      <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${
        pendingApprovals > 0
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}>
        <Bell className={`h-5 w-5 flex-shrink-0 ${pendingApprovals > 0 ? 'text-amber-600' : 'text-emerald-500'}`} />
        <span>
          {pendingApprovals > 0
            ? `${pendingApprovals} schedule${pendingApprovals === 1 ? '' : 's'} currently require attention.`
            : 'All clear — no action items require attention right now.'}
        </span>
      </div>

      <div className="bg-[#5A1220] py-3 px-5 rounded-xl text-white border border-[#5A1220]/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="bg-white p-4 rounded-xl border-[0.5px] border-gray-200 animate-pulse min-h-[82px] flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-6 w-6 rounded-lg" />
                </div>
                <Skeleton className="h-9 w-10" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border-[0.5px] border-gray-200 animate-pulse flex flex-col justify-between min-h-[280px]">
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

            <div className="bg-white p-4 rounded-xl border-[0.5px] border-gray-200 animate-pulse flex flex-col items-center justify-center gap-4 min-h-[280px]">
              <div className="self-start">
                <Skeleton className="h-5 w-36" />
              </div>
              <Skeleton className="h-32 w-32 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>

            <div className="bg-white p-4 rounded-xl border-[0.5px] border-gray-200 animate-pulse flex flex-col justify-between min-h-[280px]">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border-[0.5px] border-gray-200 animate-pulse space-y-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
            <div className="lg:col-span-2 bg-white p-4 rounded-xl border-[0.5px] border-gray-200 animate-pulse space-y-4 min-h-[220px]">
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
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryMetricCard label="Schedules" value={totalSchedules} icon={CalendarDays} onClick={() => navigate('/secretary/schedules')} />
            <SummaryMetricCard label="Pending" value={pendingApprovals} icon={Clock} iconClassName="text-[#F5A623]" iconWrapperClassName="bg-[#F5A623]/5" />
            <SummaryMetricCard label="Faculty" value={facultyStats.total} icon={Users} onClick={() => navigate('/secretary/instructors')} />
            <SummaryMetricCard label="Rooms" value={visibleRooms.length} icon={DoorOpen} onClick={() => navigate('/secretary/rooms')} />
            <SummaryMetricCard label="Subjects" value={visibleSubjects.length} icon={BookOpen} onClick={() => navigate('/secretary/curricula')} />
          </div>

          <AttentionPanel
            title="Needs Attention"
            subtitle="Priority items for today's scheduling work"
            icon={AlertTriangle}
            items={needsAttention}
            onAction={navigate}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
              footer={`${utilizedRoomIds.size} out of ${visibleRooms.length} rooms scheduled.`}
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

          {/* Department Academic Timetable Calendar Schedule (Sunday to Saturday, 7:00 AM - 7:00 PM, 30-min slots) */}
          <div className={`${
            isFullscreen
              ? 'fixed inset-0 z-[99999] bg-white p-6 flex flex-col overflow-hidden w-screen h-screen'
              : 'bg-white p-6 rounded-2xl border border-gray-200 shadow-sm font-sans'
          }`}>
            {/* Header + Actions Row */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-gray-150 pb-4">
              <div className="space-y-3.5 flex-1">
                <div>
                  <h2 className="text-gray-850 font-bold text-lg flex items-center gap-2 leading-none">
                    <CalendarDays className="w-5 h-5 text-[#5A1220]" />
                    Department Academic Timetable
                  </h2>
                  <p className="text-xs text-gray-500 mt-1 font-semibold">
                    Weekly schedule overview, room utilization, and instructor timetables for your department.
                  </p>
                </div>

                {/* Primary Action Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Day Filter */}
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl shadow-sm">
                    <span className="font-bold text-gray-500 uppercase text-[9px] tracking-wider">Day</span>
                    <select
                      value={filterDay}
                      onChange={(e) => setFilterDay(e.target.value)}
                      className="border-none text-gray-700 bg-transparent text-xs font-semibold focus:ring-0 cursor-pointer p-0 pr-6"
                    >
                      <option value="all">All Days</option>
                      <option value="Sun">Sunday</option>
                      <option value="Mon">Monday</option>
                      <option value="Tue">Tuesday</option>
                      <option value="Wed">Wednesday</option>
                      <option value="Thu">Thursday</option>
                      <option value="Fri">Friday</option>
                      <option value="Sat">Saturday</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Top Right: Search Bar & Controls */}
              <div className="flex items-center gap-2 w-full lg:w-auto relative">
                <div className="relative flex-1 lg:w-72 lg:flex-none">
                  <input
                    type="text"
                    placeholder="Search sections, instructors, rooms..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 pl-9 border border-gray-300 text-gray-700 bg-white rounded-xl focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] text-xs font-semibold shadow-sm transition-all"
                  />
                  <Filter className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                </div>

                {/* Full Window Toggle Button */}
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="p-2 text-gray-700 hover:text-[#5A1220] hover:bg-gray-100 rounded-xl transition-all cursor-pointer border border-gray-200 bg-white shadow-sm flex items-center justify-center shrink-0"
                  title={isFullscreen ? "Exit Full Window" : "Full Window View"}
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                {/* Reset Button */}
                {(filterDay !== 'all' || searchQuery !== '') && (
                  <button
                    onClick={() => {
                      setFilterDay('all');
                      setSearchQuery('');
                    }}
                    className="p-2 text-gray-555 hover:text-[#5A1220] hover:bg-red-50 hover:border-red-200 rounded-xl transition-all cursor-pointer border border-gray-200 bg-white shadow-sm flex items-center justify-center shrink-0"
                    title="Reset Filters"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Summary Metrics Row */}
            <div className={isFullscreen ? "flex flex-wrap items-center gap-4 mt-3 mb-2 pb-2.5 border-b border-gray-150" : "grid grid-cols-1 md:grid-cols-3 gap-4 mt-4"}>
              {/* Total Classes */}
              <div className={isFullscreen ? "flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-xl" : "p-3 bg-white rounded-xl border border-gray-150 shadow-sm flex items-center justify-between hover:shadow-md transition-all duration-300"}>
                {isFullscreen ? (
                  <>
                    <CalendarDays className="w-3.5 h-3.5 text-[#5A1220]" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Classes:</span>
                    <span className="font-extrabold text-[#5A1220] text-xs">{calendarTotalClasses}</span>
                  </>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-bold text-gray-450 uppercase tracking-wider block">Total Classes</span>
                      <span className="text-xl font-black text-[#5A1220] block">{calendarTotalClasses}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-red-50 text-[#5A1220] shadow-sm shrink-0">
                      <CalendarDays className="w-4.5 h-4.5" />
                    </div>
                  </>
                )}
              </div>

              {/* Rooms in Use */}
              <div className={isFullscreen ? "flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-xl" : "p-3 bg-white rounded-xl border border-gray-150 shadow-sm flex items-center justify-between hover:shadow-md transition-all duration-300"}>
                {isFullscreen ? (
                  <>
                    <DoorOpen className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Rooms in Use:</span>
                    <span className="font-extrabold text-slate-800 text-xs">{calendarRoomsInUse}</span>
                  </>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-bold text-gray-455 uppercase tracking-wider block">Rooms in Use</span>
                      <span className="text-xl font-black text-slate-800 block">{calendarRoomsInUse}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-50 text-slate-500 shadow-sm shrink-0">
                      <DoorOpen className="w-4.5 h-4.5" />
                    </div>
                  </>
                )}
              </div>

              {/* Available Rooms */}
              <div className={isFullscreen ? "flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-200 rounded-xl" : "p-3 bg-white rounded-xl border border-gray-150 shadow-sm flex items-center justify-between hover:shadow-md transition-all duration-300"}>
                {isFullscreen ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Available Rooms:</span>
                    <span className="font-extrabold text-emerald-600 text-xs">{calendarAvailableRooms}</span>
                  </>
                ) : (
                  <>
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-bold text-gray-455 uppercase tracking-wider block">Available Rooms</span>
                      <span className="text-xl font-black text-emerald-600 block">{calendarAvailableRooms}</span>
                    </div>
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shadow-sm shrink-0">
                      <CheckCircle2 className="w-4.5 h-4.5" />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Timetable Grid (Sunday to Saturday, 7:00 AM - 7:00 PM, 30-min slots) */}
            <div className={`mt-4 ${isFullscreen ? 'flex-1 overflow-hidden flex flex-col' : ''}`}>
              <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-inner flex-1 flex flex-col">
                <div className={`min-w-[1000px] bg-white relative flex flex-row scrollbar-thin ${
                  isFullscreen 
                    ? 'flex-1 overflow-y-auto' 
                    : 'h-[660px] overflow-y-hidden'
                }`}>
                  {/* Sticky Left Corner & Time Column */}
                  <div className="w-20 shrink-0 sticky left-0 z-20 bg-gray-50 select-none border-r border-gray-200">
                    <div className="sticky top-0 left-0 z-40 h-10 border-b border-gray-200 bg-gray-100 flex items-center justify-center font-extrabold text-[9px] uppercase tracking-wider text-gray-500">
                      Time
                    </div>
                    {timeSlots.map((slot, index) => (
                      <div
                        key={index}
                        className="h-6 border-b border-gray-100 last:border-b-0 flex items-center justify-center text-[9px] font-semibold text-gray-400 bg-gray-50/90"
                      >
                        {slot.label.includes(":00") ? (
                          <span className="font-bold text-gray-600">{slot.label}</span>
                        ) : (
                          <span className="text-gray-400 font-medium text-[8px]">{slot.label}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Days Columns (Sunday to Saturday) */}
                  <div className="flex-1 flex flex-row relative">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
                      .filter(day => filterDay === 'all' || getShortDay(day) === filterDay)
                      .map((day) => {
                        const daySchedules = calendarFilteredSchedules.filter(
                          (schedule) => getShortDay(schedule.day) === day
                        );
                        
                        const isToday = day === currentDayName;
                        const layouts = getDayLayouts(daySchedules);

                        return (
                          <div
                            key={day}
                            className={`flex-1 border-r border-gray-200 last:border-r-0 relative min-w-[170px] transition-colors duration-250 ${
                              isToday ? 'bg-red-500/[0.015]' : ''
                            }`}
                          >
                            {/* Sticky Day Column Header */}
                            <div
                              className={`sticky top-0 z-10 h-10 border-b border-gray-200 flex flex-col items-center justify-center select-none ${
                                isToday
                                  ? 'bg-red-50/95 text-[#5A1220] font-black border-b-2 border-b-red-500 shadow-sm'
                                  : 'bg-gray-50 text-gray-700'
                              }`}
                            >
                              <span className="font-bold text-xs uppercase tracking-wider">{day}</span>
                              <span className="text-[8px] font-extrabold opacity-75">
                                {daySchedules.length} {daySchedules.length === 1 ? "Class" : "Classes"}
                              </span>
                            </div>

                            {/* Column Body Grid */}
                            <div className="relative" style={{ height: `${timeSlots.length * 24}px` }}>
                              {timeSlots.map((_, index) => (
                                <div key={index} className="h-6 border-b border-gray-100 last:border-b-0" />
                              ))}

                              {/* Google Calendar Time Indicator Line */}
                              {isToday && currentDayTimeTop !== null && (
                                <div
                                  className="absolute left-0 right-0 border-t-2 border-red-500 z-15 pointer-events-none flex items-center"
                                  style={{ top: `${currentDayTimeTop}px` }}
                                >
                                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-sm" />
                                </div>
                              )}

                              {/* Rendering Schedule Cards */}
                              {daySchedules.map((schedule) => {
                                const startIdx = parseTimeToSlotIndex(schedule.start_time);
                                const endIdx = parseTimeToSlotIndex(schedule.end_time);
                                const top = startIdx * 24;
                                const height = (endIdx - startIdx) * 24;

                                if (height <= 0) return null;

                                const deptCode = schedule.section?.department?.department_code || schedule.department?.department_code || 'CIT';
                                const layout = layouts[schedule.id] || { col: 0, totalCols: 1 };
                                const colWidth = 100 / layout.totalCols;
                                const left = layout.col * colWidth;

                                return (
                                  <div
                                    key={schedule.id}
                                    style={{
                                      top: `${top + 3}px`,
                                      height: `${height - 6}px`,
                                      left: `calc(${left}% + 2px)`,
                                      width: `calc(${colWidth}% - 4px)`
                                    }}
                                    className={`group absolute rounded-xl border border-l-4 p-2 overflow-hidden text-left flex flex-col justify-between font-sans shadow-sm select-none transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:z-25 ${getDeptStyles(deptCode)}`}
                                  >
                                    <div className="space-y-0.5 min-w-0">
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-extrabold text-[11px] leading-tight truncate">
                                          {schedule.course?.course_code || schedule.subject?.subject_code || 'N/A'}
                                        </span>
                                        <span className="text-[8px] font-black uppercase px-1 py-0.2 rounded bg-black/5 shrink-0">
                                          {schedule.section?.section_name || 'Sec'}
                                        </span>
                                      </div>
                                      <p className="text-[9px] font-semibold opacity-90 truncate leading-tight">
                                        {schedule.course?.course_name || schedule.subject?.subject_name || 'No title'}
                                      </p>
                                    </div>

                                    <div className="border-t border-black/5 pt-1 mt-auto flex items-center justify-between text-[8px] font-bold opacity-80">
                                      <span className="truncate max-w-[60%]">
                                        {schedule.faculty ? `${schedule.faculty.first_name[0]}. ${schedule.faculty.last_name}` : 'TBA'}
                                      </span>
                                      <span className="truncate">
                                        {schedule.room?.room_code || 'Room TBA'}
                                      </span>
                                    </div>

                                    {/* Hover Details Popover */}
                                    <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white rounded-xl shadow-2xl backdrop-blur-md z-50 border border-slate-700 text-xs space-y-2 leading-snug">
                                      <div className="flex items-center justify-between border-b border-gray-700 pb-1.5">
                                        <span className="font-bold text-[#F5A623]">
                                          {schedule.course?.course_code || schedule.subject?.subject_code}
                                        </span>
                                        <span className="text-[9px] px-1.5 py-0.5 bg-white/10 rounded font-semibold uppercase">
                                          {schedule.mode || 'Lecture'}
                                        </span>
                                      </div>
                                      
                                      <p className="font-bold text-gray-100 text-xs">
                                        {schedule.course?.course_name || schedule.subject?.subject_name || 'No subject name'}
                                      </p>

                                      <div className="border-t border-gray-700 pt-1.5 space-y-1 text-gray-300 text-[10px]">
                                        <div className="flex justify-between">
                                          <span className="font-semibold text-gray-400">Instructor:</span>
                                          <span className="font-bold text-white">
                                            {schedule.faculty ? `${schedule.faculty.first_name} ${schedule.faculty.last_name}` : 'Unassigned'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="font-semibold text-gray-400">Section:</span>
                                          <span className="font-bold text-white">{schedule.section?.section_name}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="font-semibold text-gray-400">Room:</span>
                                          <span className="font-bold text-white">
                                            {schedule.room?.building || 'Main'} &bull; {schedule.room?.room_code || 'Unassigned'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="font-semibold text-gray-400">Time:</span>
                                          <span className="font-bold text-[#F5A623]">{schedule.start_time} - {schedule.end_time}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
