import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal';
import { ModalButton } from '../../components/ui/ModalForm';
import {
  AlertCircle,
  Award,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  FlaskConical,
  FileSpreadsheet,
  FileText,
  GaugeCircle,
  GraduationCap,
  LayoutGrid,
  Printer,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DashboardMetricCard from '../../components/overview/DashboardMetricCard';
import DepartmentLogo from '../../components/ui/DepartmentLogo';
import PrintSchedule from '../ClassSchedules/SchedulerPanel/PrintSchedule';
import TeachingLoad from '../ClassSchedules/SchedulerPanel/TeachingLoad';
import type { Room } from '../ClassSchedules/SchedulerPanel/types';
import type { SchedulerCacheData } from '../ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import { getDeptBadgeStyles } from '../../lib/departmentTheme';
import api from '../../lib/api';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import { getStoredUser } from '../../lib/storedUser';
import { basicLoadOf } from '../../lib/facultyLoad';
import { dayNameToIndex } from '../../lib/timeGrid';
import { openPdfPreview } from '../../lib/pdfPreview';
import { fullSemesterLabel } from '../../lib/semesterLabel';
import { buildRoomUtilizationPdf, getRoomUtilizationPdfFilename, type RoomUtilizationPdfInput } from '../../lib/roomUtilizationPdf';
import {
  RoomRequestsTable,
  RoomUtilizationTable,
  ScheduleClassesTable,
  ScheduleGroupsTable,
  TeachingLoadTable,
  type ReportRoom,
} from '../../components/reports/ReportDetailTables';
import {
  defaultReportTerm,
  fetchReportData,
  fetchReportsOverview,
  type ReportDepartment,
  type ReportData,
  type ReportsOverview,
} from '../../lib/reports';

export type ReportKind = 'schedule' | 'load' | 'room';

interface PrintJob {
  kind: 'schedule' | 'load';
  data: SchedulerCacheData;
}

interface DetailState {
  row: ReportRow;
  kind: ReportKind;
  data: ReportData;
  generatedAt: Date;
}

interface ReportRow {
  key: string;
  departmentId: number;
  programId: number | null;
  label: string;
  description: string;
  count: number;
}

const TABS: { kind: ReportKind; label: string; description: string; icon: typeof CalendarDays }[] = [
  {
    kind: 'schedule',
    label: 'Department Schedule',
    description: 'Approved class schedules and section meeting times by department, all programs included.',
    icon: CalendarDays,
  },
  {
    kind: 'load',
    label: 'Teaching Load',
    description: 'Instructor assignments, basic load, deload units, and overload capacity.',
    icon: GraduationCap,
  },
  {
    kind: 'room',
    label: 'Room Utilization',
    description: 'Facilities occupancy, lecture vs laboratory capacity, and booked hours.',
    icon: Building2,
  },
];

const rowsFor = (department: ReportDepartment, kind: ReportKind): ReportRow[] => {
  const countOf = (item: { complete_section_count: number; instructor_count: number }) => {
    if (kind === 'schedule') return item.complete_section_count;
    if (kind === 'load') return item.instructor_count;
    // Room use is measured from fully approved sections, so that is what makes the report ready.
    return item.complete_section_count;
  };

  const suffix =
    kind === 'schedule' ? 'Class Schedule' :
    kind === 'load' ? 'Instructors Load' :
    'Room Utilization';

  if (!department.can_print_department) {
    return department.programs.map((program) => ({
      key: `${department.id}:${program.id}`,
      departmentId: department.id,
      programId: program.id,
      label: `${program.code} ${suffix}`,
      description: program.name,
      count: countOf(program),
    }));
  }

  return [{
    key: `${department.id}:all`,
    departmentId: department.id,
    programId: null,
    label: `${department.code} ${suffix}`,
    description: department.programs.length > 0
      ? `All programs: ${department.programs.map((program) => program.code).join(', ')}`
      : 'All programs in this department',
    count: countOf(department),
  }];
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

function readyDetail(kind: ReportKind, count: number): string {
  if (kind === 'load') return `${plural(count, 'instructor')} with approved load`;
  if (kind === 'room') return `From ${plural(count, 'approved section')}`;
  return plural(count, 'approved section');
}

function notReadyReason(kind: ReportKind, noApprovedTerm: boolean): string {
  if (noApprovedTerm) return 'No term has VPAA-approved schedules yet.';
  if (kind === 'load') return 'No instructor has a VPAA-approved load this term.';
  if (kind === 'room') return 'Needs a fully VPAA-approved section this term.';
  return 'No section is fully VPAA-approved this term.';
}

function ReadinessBadge({ ready }: { ready: boolean }) {
  return ready ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-stage-done/20 bg-stage-done/10 px-2 py-0.5 text-[11px] font-semibold text-stage-done">
      <CheckCircle2 size={12} aria-hidden="true" />
      Ready
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-parchment px-2 py-0.5 text-[11px] font-semibold text-muted">
      <Clock size={12} aria-hidden="true" />
      Not ready
    </span>
  );
}

const formatGeneratedAt = (date: Date) =>
  date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

interface ReportDetailModalProps {
  row: ReportRow;
  kind: ReportKind;
  data: ReportData;
  generatedAt: Date;
  onClose: () => void;
  onPrint?: () => void;
  isPrinting?: boolean;
}

function reportRooms(data: SchedulerCacheData): Pick<Room, 'id' | 'name' | 'building' | 'roomType' | 'status'>[] {
  if (data.rooms?.length) return data.rooms;
  const rooms = new Map<string, Pick<Room, 'id' | 'name' | 'building' | 'roomType' | 'status'>>();
  data.schedules.forEach((schedule) => {
    if (schedule.roomName && !rooms.has(schedule.roomName)) {
      rooms.set(schedule.roomName, { id: schedule.roomId ?? '', name: schedule.roomName, roomType: 'lecture', status: 'available' });
    }
  });
  return Array.from(rooms.values());
}


/** Every room in the report scope, including unused ones when the room summary lists them. */
function roomInventory(data: ReportData): ReportRoom[] {
  if (!data.roomSummary?.rooms) return reportRooms(data);
  return data.roomSummary.rooms.map((room) => ({
    id: String(room.id), name: room.room_code, building: room.building,
    roomType: room.room_type, status: room.status,
  }));
}

/** Scheduled class count and weekday-ordered short day names for one room. */
function roomUsage(data: SchedulerCacheData, room: ReportRoom): { classCount: number; days: string } {
  const schedules = data.schedules.filter(
    (s) => (s.roomId && s.roomId === room.id) || (s.roomName && s.roomName === room.name),
  );
  const days = Array.from(new Set(schedules.map((s) => s.day).filter(Boolean)))
    .sort((a, b) => dayNameToIndex(a) - dayNameToIndex(b))
    .map((day) => day.slice(0, 3))
    .join(', ');
  return { classCount: schedules.length, days };
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function ReportDetailModal({ row, kind, data, generatedAt, onClose, onPrint, isPrinting = false }: ReportDetailModalProps) {
  const [scheduleView, setScheduleView] = useState<'classes' | 'sections' | 'instructors' | 'rooms'>('classes');
  const [loadView, setLoadView] = useState<'instructors' | 'assigned' | 'overloaded' | 'average'>('instructors');
  const [showRoomRequests, setShowRoomRequests] = useState(false);
  const [roomRequestOption, setRoomRequestOption] = useState<'requester' | 'requested_by' | null>(null);
  const [roomInventoryView, setRoomInventoryView] = useState<'all' | 'laboratory' | 'unavailable' | null>(null);

  const roomList = useMemo(
    () => (roomInventoryView === null ? reportRooms(data) : roomInventory(data)),
    [data, roomInventoryView],
  );
  const roomRequests = data.roomSummary?.requests.filter((request) =>
    request.direction === (roomRequestOption === 'requester' ? 'sent' : 'received'),
  ) ?? [];
  const roomRequestTitle = roomRequestOption === 'requester' ? 'Requester requests' : 'Requestee requests';

  const filteredFaculty = useMemo(() => {
    const faculties = data.faculties.filter((f) => {
      if (loadView === 'assigned' && (f.assignedUnits || 0) <= 0) return false;
      if (loadView === 'overloaded' && (f.assignedUnits || 0) <= basicLoadOf(f.maxUnits, f.deloadUnits)) return false;
      return true;
    });
    if (loadView === 'average') faculties.sort((a, b) => (b.assignedUnits || 0) - (a.assignedUnits || 0));
    return faculties;
  }, [data.faculties, loadView]);

  const scheduleGroups = useMemo(() => {
    if (scheduleView === 'classes') return [];
    const field = scheduleView === 'sections' ? 'sectionName' : scheduleView === 'instructors' ? 'facultyName' : 'roomName';
    const groups = new Map<string, { name: string; classCount: number; days: Set<string> }>();
    for (const schedule of data.schedules) {
      const name = schedule[field];
      if (!name) continue;
      const group = groups.get(name) ?? { name, classCount: 0, days: new Set<string>() };
      group.classCount++;
      if (schedule.day) group.days.add(schedule.day);
      groups.set(name, group);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.schedules, scheduleView]);

  const scheduleCards = [
    { view: 'classes', label: 'Classes Scheduled', value: `Total ${data.schedules.length}`, icon: CalendarDays, iconClassName: 'text-[#4e0a10]' },
    { view: 'sections', label: 'Active Sections', value: `Total ${new Set(data.schedules.map((s) => s.sectionName).filter(Boolean)).size}`, icon: LayoutGrid, iconClassName: 'text-emerald-600' },
    { view: 'instructors', label: 'Instructors Teaching', value: `Total ${new Set(data.schedules.map((s) => s.facultyName).filter(Boolean)).size}`, icon: Users, iconClassName: 'text-sky-600' },
    { view: 'rooms', label: 'Rooms Occupied', value: `Total ${new Set(data.schedules.map((s) => s.roomName).filter(Boolean)).size}`, icon: Building2, iconClassName: 'text-amber-600' },
  ] as const;
  const assignedUnits = data.faculties.reduce((sum, f) => sum + (f.assignedUnits || 0), 0);
  const loadCards = [
    { view: 'instructors', label: 'Instructors', value: `Total ${data.faculties.length}`, icon: Users, iconClassName: 'text-[#4e0a10]' },
    { view: 'assigned', label: 'Assigned Units', value: `Total ${assignedUnits}`, icon: Award, iconClassName: 'text-emerald-600' },
    { view: 'overloaded', label: 'Overloaded', value: `Total ${data.faculties.filter((f) => (f.assignedUnits || 0) > basicLoadOf(f.maxUnits, f.deloadUnits)).length}`, icon: GaugeCircle, iconClassName: 'text-amber-600' },
    { view: 'average', label: 'Average Load', value: `${data.faculties.length ? (assignedUnits / data.faculties.length).toFixed(1) : 0} units`, icon: CheckCircle2, iconClassName: 'text-sky-600' },
  ] as const;
  const scheduleViewLabel = scheduleCards.find((card) => card.view === scheduleView)!.label;
  const loadViewLabel = loadCards.find((card) => card.view === loadView)!.label;
  const scheduleGroupHeading = scheduleView === 'sections' ? 'Section' : scheduleView === 'instructors' ? 'Instructor' : 'Room';
  const summaryCardClass = (active: boolean) =>
    `flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? 'border-primary/30 bg-primary/5 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:border-primary/30 hover:bg-primary/5'}`;

  const filteredRooms = useMemo(() => {
    return roomInventoryView === 'laboratory'
      ? roomList.filter((room) => room.roomType === 'laboratory')
      : roomInventoryView === 'unavailable'
        ? roomList.filter((room) => room.status === 'not available')
        : roomList;
  }, [roomList, roomInventoryView]);

  const roomRows = useMemo(
    () => filteredRooms.map((room) => ({ room, ...roomUsage(data, room) })),
    [data, filteredRooms],
  );

  const showRoomStatus = roomInventoryView === 'unavailable';

  const selectRoomView = (view: 'all' | 'laboratory' | 'unavailable') => {
    setRoomInventoryView(view);
    setShowRoomRequests(false);
    setRoomRequestOption(null);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={row.label}
      description={row.description}
      icon={kind === 'schedule' ? <CalendarDays size={18} /> : kind === 'load' ? <GraduationCap size={18} /> : <Building2 size={18} />}
      size={kind === 'room' ? 'wide' : 'xl'}
      bodyClassName="flex flex-col !overflow-hidden !bg-white"
      footerClassName="!justify-between"
      headerActions={onPrint && (
        <button
          type="button"
          onClick={onPrint}
          disabled={isPrinting}
          title="Generate a printable PDF of this report"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-bold text-[#4e0a10] transition-colors hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPrinting ? <LoadingSpinner size={13} className="animate-spin" /> : <Printer size={13} aria-hidden="true" />}
          {isPrinting ? 'Preparing PDF...' : 'Generate PDF'}
        </button>
      )}
      footer={<>
        <p className="min-w-0 flex-1 text-xs text-slate-500">
          The PDF opens in a preview tab, where it can be printed or saved.
        </p>
        <ModalButton onClick={onClose}>Close</ModalButton>
      </>}
    >
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-slate-100 bg-parchment/60 px-4 py-2 text-xs sm:px-5">
          <div className="flex items-center gap-1.5">
            <CalendarDays size={13} aria-hidden="true" className="text-primary/70" />
            <dt className="sr-only">Academic term</dt>
            <dd className="font-semibold text-text">{data.activeSemester ? fullSemesterLabel(data.activeSemester) : 'All terms'}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={13} aria-hidden="true" className="text-muted" />
            <dt className="text-muted">Generated</dt>
            <dd className="font-medium text-text">{formatGeneratedAt(generatedAt)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={13} aria-hidden="true" className="text-stage-done" />
            <dt className="sr-only">Approval</dt>
            <dd className="text-muted">
              {kind === 'room' ? 'Class usage from VPAA-approved schedules' : 'VPAA-approved records; signatories from approval history'}
            </dd>
          </div>
        </dl>
        <div className={kind === 'room' ? 'min-h-0 flex-1 overflow-auto' : 'contents'}>
        <>
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 bg-white px-4 py-3 sm:grid-cols-4 sm:gap-3 sm:px-5">
          {kind === 'schedule' && (
            <>
              {scheduleCards.map(({ view, label, value, icon: Icon, iconClassName }) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={scheduleView === view}
                  aria-controls="department-schedule-table"
                  onClick={() => setScheduleView(view)}
                  className={summaryCardClass(scheduleView === view)}
                >
                  <Icon size={16} className={`shrink-0 ${iconClassName}`} />
                  <div>
                    <div className="text-xs font-semibold leading-4 text-slate-500">{value}</div>
                    <div className="font-display text-base font-bold leading-6 text-slate-800">{label}</div>
                  </div>
                </button>
              ))}
            </>
          )}

          {kind === 'load' && (
            <>
              {loadCards.map(({ view, label, value, icon: Icon, iconClassName }) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={loadView === view}
                  aria-controls="teaching-load-table"
                  onClick={() => setLoadView(view)}
                  className={summaryCardClass(loadView === view)}
                >
                  <Icon size={16} className={`shrink-0 ${iconClassName}`} />
                  <div>
                    <div className="text-xs font-semibold leading-4 text-slate-500">{value}</div>
                    <div className="font-display text-base font-bold leading-6 text-slate-800">{label}</div>
                  </div>
                </button>
              ))}
            </>
          )}

          {kind === 'room' && (
            <>
              <button
                type="button"
                aria-pressed={roomInventoryView === 'all'}
                aria-controls="room-utilization-table"
                onClick={() => selectRoomView('all')}
                className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${roomInventoryView === 'all' ? 'border-[#4e0a10]/20 bg-[#4e0a10]/5' : 'border-slate-100 bg-slate-50/50 hover:border-[#4e0a10]/20 hover:bg-[#4e0a10]/5'}`}
              >
                <Building2 size={16} className="text-[#4e0a10]" />
                <div>
                  <div className="text-xs font-semibold leading-4 text-slate-500">Total {data.roomSummary?.total_rooms ?? roomList.length}</div>
                  <div className="font-display text-base font-bold leading-6 text-slate-800">Rooms</div>
                </div>
              </button>
              <button
                type="button"
                aria-pressed={roomInventoryView === 'laboratory'}
                aria-controls="room-utilization-table"
                onClick={() => selectRoomView('laboratory')}
                className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40 ${roomInventoryView === 'laboratory' ? 'border-purple-200 bg-purple-50' : 'border-slate-100 bg-slate-50/50 hover:border-purple-200 hover:bg-purple-50/50'}`}
              >
                <FlaskConical size={16} className="text-purple-600" />
                <div>
                  <div className="text-xs font-semibold leading-4 text-slate-500">
                    Total {data.roomSummary?.total_laboratories ?? roomList.filter((r) => (r.roomType || '').toLowerCase().includes('lab')).length}
                  </div>
                  <div className="font-display text-base font-bold leading-6 text-slate-800">Laboratory</div>
                </div>
              </button>
              <button
                type="button"
                aria-expanded={showRoomRequests}
                aria-controls="room-request-details"
                onClick={() => {
                  setShowRoomRequests((open) => !open);
                  setRoomRequestOption(null);
                  setRoomInventoryView(null);
                }}
                className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${showRoomRequests ? 'border-sky-200 bg-sky-50' : 'border-slate-100 bg-slate-50/50 hover:border-sky-200 hover:bg-sky-50/50'}`}
              >
                <CalendarDays size={16} className="shrink-0 text-sky-600" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold leading-4 text-slate-500">
                    Total {data.roomSummary?.requests.length ?? '—'}
                  </div>
                  <div className="font-display text-base font-bold leading-6 text-slate-800">Room Request</div>
                </div>
                <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-slate-400 transition-transform ${showRoomRequests ? 'rotate-180' : ''}`} />
              </button>
              <button
                type="button"
                aria-pressed={roomInventoryView === 'unavailable'}
                aria-controls="room-utilization-table"
                onClick={() => selectRoomView('unavailable')}
                className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 ${roomInventoryView === 'unavailable' ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50/50 hover:border-amber-200 hover:bg-amber-50/50'}`}
              >
                <AlertCircle size={16} className="text-amber-600" />
                <div>
                  <div className="text-xs font-semibold leading-4 text-slate-500">
                    Total {data.roomSummary?.unavailable_rooms ?? roomList.filter((r) => r.status === 'not available').length}
                  </div>
                  <div className="font-display text-base font-bold leading-6 text-slate-800">Room/Lab Unavailable</div>
                </div>
              </button>
              {showRoomRequests && (
                <>
                <div className="col-span-2 sm:col-span-4">
                <div className="w-max max-w-full space-y-1">
                <div id="room-request-details" role="group" aria-label="Room request options" className="grid grid-cols-2 items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/90 p-1">
                  {([
                    { key: 'requester', label: 'Requester', direction: 'sent' },
                    { key: 'requested_by', label: 'Requestee', direction: 'received' },
                  ] as const).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={roomRequestOption === option.key}
                      aria-controls="room-request-table"
                      aria-describedby={`room-request-${option.key}-description`}
                      onClick={() => setRoomRequestOption(option.key)}
                      className={`selection-indicator inline-flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]/30 ${roomRequestOption === option.key ? 'shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span>{option.label}</span>
                        <span className="selection-indicator-count min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold">
                          {data.roomSummary?.requests.filter((request) => request.direction === option.direction).length ?? 0}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="grid px-1 text-sm font-medium leading-5 text-gray-600">
                  <p id="room-request-requester-description" className={`col-start-1 row-start-1 ${roomRequestOption === 'requester' ? '' : 'invisible'}`}>Sends a request</p>
                  <p id="room-request-requested_by-description" className={`col-start-1 row-start-1 ${roomRequestOption === 'requested_by' ? '' : 'invisible'}`}>Receives a request</p>
                </div>
                </div>
                </div>
                </>
              )}
            </>
          )}

        </div>

        {!(kind === 'room' && showRoomRequests) && (
        <div className="flex items-center border-b border-slate-200 bg-slate-50/50 px-4 py-3 sm:px-5 sm:py-2.5">
          <span className="text-xs font-bold text-slate-500">
            {kind === 'schedule' && (scheduleView === 'classes' ? `${data.schedules.length} classes` : `${scheduleGroups.length} ${scheduleView}`)}
            {kind === 'load' && `${filteredFaculty.length} instructors${loadView === 'average' ? ' · Highest load first' : ''}`}
            {kind === 'room' && `${filteredRooms.length} ${roomInventoryView === 'laboratory' ? 'laboratories' : roomInventoryView === 'unavailable' ? 'unavailable rooms' : 'rooms'}`}
          </span>
        </div>
        )}
        </>

        <div
          role={kind !== 'room' ? 'region' : undefined}
          aria-label={kind === 'schedule' ? `${scheduleViewLabel} table` : kind === 'load' ? `${loadViewLabel} table` : undefined}
          tabIndex={kind !== 'room' ? 0 : undefined}
          className="min-h-0 min-w-0 flex-1 overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
        >
          {kind === 'schedule' && scheduleView !== 'classes' && (
            <ScheduleGroupsTable
              id="department-schedule-table"
              label={scheduleViewLabel}
              heading={scheduleGroupHeading}
              groups={scheduleGroups}
              emptyTitle={`No ${scheduleView} available.`}
            />
          )}
          {kind === 'schedule' && scheduleView === 'classes' && (
            <ScheduleClassesTable id="department-schedule-table" label={scheduleViewLabel} schedules={data.schedules} />
          )}

          {kind === 'load' && (
            <TeachingLoadTable
              id="teaching-load-table"
              label={loadViewLabel}
              faculties={filteredFaculty}
              schedules={data.schedules}
              emptyTitle={loadView === 'overloaded' ? 'No overloaded instructors.' : loadView === 'assigned' ? 'No instructors have assigned units.' : 'No instructor records available.'}
            />
          )}

          {kind === 'room' && showRoomRequests && roomRequestOption && (
            <div key={roomRequestOption} id="room-request-table" role="region" aria-label={roomRequestTitle}>
              <RoomRequestsTable
                label={roomRequestTitle}
                requests={roomRequests}
                showOwner={roomRequestOption === 'requester'}
                emptyTitle={!data.roomSummary ? 'Room request details are unavailable.' : roomRequestOption === 'requester' ? 'No outgoing room requests.' : 'No incoming room requests.'}
              />
            </div>
          )}

          {kind === 'room' && !showRoomRequests && (
            <RoomUtilizationTable id="room-utilization-table" rows={roomRows} showStatus={showRoomStatus} />
          )}

        </div>

        </div>
    </Modal>
  );
}

export default function Reports() {
  const { toast } = useToast();
  const cacheKey = `dashboard:reports:${getStoredUser()?.id ?? 'current'}`;
  const [overview, setOverview] = useState<ReportsOverview | null>(() => getCachedData<ReportsOverview>(cacheKey) ?? null);
  const [isLoading, setIsLoading] = useState(() => !hasCachedData(cacheKey));
  const [kind, setKind] = useState<ReportKind>('schedule');
  const [loadingRowKey, setLoadingRowKey] = useState<string | null>(null);
  const [loadingDetailKey, setLoadingDetailKey] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DetailState | null>(null);
  const [job, setJob] = useState<PrintJob | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const initialTermId = useRef(overview?.semester?.id ?? null);

  /** Loads the directory for one term; without one, opens on the default term once the term list is known. */
  const load = useCallback(
    async (requestedTermId: number | null) => {
      try {
        let data = await fetchReportsOverview(requestedTermId);
        const terms = data.terms;
        const stillListed = requestedTermId !== null && terms?.some((term) => term.id === requestedTermId);
        if (terms && terms.length > 0 && !stillListed) {
          const term = defaultReportTerm(terms);
          if (term && term.id !== requestedTermId) data = await fetchReportsOverview(term.id);
        }
        setCachedData(cacheKey, data);
        setOverview(data);
        setLoadError(false);
      } catch {
        setLoadError(true);
        toast.error('Reports Unavailable', 'The report list could not be loaded.');
      } finally {
        setIsLoading(false);
      }
    },
    [cacheKey, toast],
  );

  useEffect(() => {
    void load(initialTermId.current);
  }, [load]);

  const terms = overview?.terms;
  const selectedTerm = overview?.semester ?? null;
  // Older API responses carry no term list; their counts already span every term.
  const termsSupported = terms !== undefined;
  const noApprovedTerm = termsSupported && terms.length === 0;
  const isBusy = loadingRowKey !== null || loadingDetailKey !== null;

  const refresh = () => {
    setIsLoading(true);
    void load(selectedTerm?.id ?? null);
  };

  const changeTerm = (termId: number) => {
    if (termId === selectedTerm?.id) return;
    setIsLoading(true);
    void load(termId);
  };

  const logDownload = (row: ReportRow, reportKind: ReportKind, data: ReportData) => {
    void api
      .post('/reports/log-download', {
        report_type: reportKind,
        department_id: row.departmentId,
        program_id: row.programId,
        semester_id: data.activeSemester?.id ?? null,
      })
      .catch(() => {});
  };

  /** The room PDF is generated here and shown in a preview tab opened before any await. */
  const printRoomPdf = async (row: ReportRow, data: ReportData) => {
    const preview = openPdfPreview();
    setLoadingRowKey(row.key);
    try {
      const input: RoomUtilizationPdfInput = {
        title: row.label,
        academicYear: data.activeSemester?.academic_year,
        semester: data.activeSemester?.semester,
        totals: {
          rooms: data.roomSummary?.total_rooms ?? reportRooms(data).length,
          laboratories: data.roomSummary?.total_laboratories ?? reportRooms(data).filter((r) => r.roomType === 'laboratory').length,
          unavailable: data.roomSummary?.unavailable_rooms ?? reportRooms(data).filter((r) => r.status === 'not available').length,
        },
        rows: roomInventory(data).map((room) => {
          const { classCount, days } = roomUsage(data, room);
          return {
            code: room.name,
            building: room.building || 'Main Campus',
            roomType: capitalize(room.roomType || 'Lecture Room'),
            scheduledClasses: classCount,
            daysUtilized: days,
            status: room.status === 'not available' ? 'Unavailable' : classCount > 0 ? 'In Use' : 'Available',
          };
        }),
      };
      await preview.show(await buildRoomUtilizationPdf(input), getRoomUtilizationPdfFilename(input));
      logDownload(row, 'room', data);
    } catch {
      preview.close();
      toast.error('PDF Not Generated', 'The room utilization PDF could not be generated.');
    } finally {
      setLoadingRowKey(null);
    }
  };

  /** Generates the PDF from the data shown in the preview, so the document matches what was reviewed. */
  const generatePdf = async ({ row, kind: reportKind, data }: DetailState) => {
    if (loadingRowKey) return;
    if (reportKind === 'room') {
      await printRoomPdf(row, data);
      return;
    }
    if (reportKind === 'schedule' && data.sections.length === 0) {
      toast.warning('Nothing to Print', 'No section in this scope has a fully approved schedule for this term.');
      return;
    }
    setJob({ kind: reportKind, data });
    setIsPrintOpen(true);
    logDownload(row, reportKind, data);
  };

  const openDetail = async (row: ReportRow) => {
    if (isBusy) return;
    setLoadingDetailKey(row.key);
    try {
      const data = await fetchReportData(row.departmentId, row.programId, selectedTerm?.id ?? null);
      setDetailData({ row, kind, data, generatedAt: new Date() });
    } catch {
      toast.error('Could Not Open Report', 'The report data could not be loaded.');
    } finally {
      setLoadingDetailKey(null);
    }
  };

  const departments = useMemo(() => overview?.departments ?? [], [overview]);
  const activeTab = TABS.find((tab) => tab.kind === kind) ?? TABS[0];
  const reportGroups = departments
    .map((department) => ({ department, rows: rowsFor(department, kind) }))
    .filter((group) => group.rows.length > 0);
  const availableCount = reportGroups.reduce((total, group) => total + group.rows.filter((row) => row.count > 0).length, 0);
  const totalScopeCount = reportGroups.reduce((total, group) => total + group.rows.length, 0);
  const totalSectionsCount = departments.reduce((acc, d) => acc + d.complete_section_count, 0);
  const totalInstructorsCount = departments.reduce((acc, d) => acc + d.instructor_count, 0);
  const metricsLoading = isLoading && !overview;
  const termText = selectedTerm ? fullSemesterLabel(selectedTerm) : termsSupported ? null : 'All terms';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-text">Institutional reports</h2>
            <p className="mt-0.5 text-xs leading-snug text-muted">
              Built only from VPAA-approved schedules and assigned workloads.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {termsSupported && (
            <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted sm:flex-row sm:items-center sm:gap-2">
              <span className="shrink-0">Academic term</span>
              <select
                value={selectedTerm?.id ?? ''}
                onChange={(event) => changeTerm(Number(event.target.value))}
                disabled={noApprovedTerm || isLoading || isBusy}
                className="h-9 w-full min-w-0 cursor-pointer rounded-lg border border-border bg-white px-2.5 text-xs font-semibold text-text transition-colors hover:border-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 sm:w-[17rem]"
              >
                {noApprovedTerm && <option value="">No approved terms yet</option>}
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {fullSemesterLabel(term)}{term.is_active ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            aria-label="Refresh"
            title="Refresh reports"
            onClick={refresh}
            disabled={isLoading}
            className="inline-flex h-9 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 sm:w-auto text-xs font-semibold text-text transition-colors hover:border-primary/30 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={14} aria-hidden="true" className={isLoading ? 'animate-spin' : ''} />
            <span>{isLoading ? 'Refreshing' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <DashboardMetricCard
          label="Approved Sections"
          value={totalSectionsCount}
          detail="Every class VPAA-approved"
          icon={LayoutGrid}
          tone="brand"
          loading={metricsLoading}
        />
        <DashboardMetricCard
          label="Active Instructors"
          value={totalInstructorsCount}
          detail="With an approved teaching load"
          icon={Users}
          tone="accent"
          loading={metricsLoading}
        />
        <DashboardMetricCard
          label="Reports Ready"
          value={availableCount}
          detail={`${availableCount} of ${totalScopeCount} ${activeTab.label} report${totalScopeCount === 1 ? '' : 's'}`}
          icon={FileSpreadsheet}
          tone="good"
          loading={metricsLoading}
        />
      </div>

      <div
        role="tablist"
        aria-label="Report type"
        className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {TABS.map(({ kind: tabKind, label, description, icon: Icon }) => {
          const selected = kind === tabKind;
          return (
            <button
              key={tabKind}
              id={`report-tab-${tabKind}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="report-directory"
              tabIndex={selected ? 0 : -1}
              onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const currentIndex = TABS.findIndex((t) => t.kind === tabKind);
                let nextIndex = currentIndex;
                if (event.key === 'Home') nextIndex = 0;
                else if (event.key === 'End') nextIndex = TABS.length - 1;
                else if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length;
                else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
                const nextKind = TABS[nextIndex].kind;
                setKind(nextKind);
                document.getElementById(`report-tab-${nextKind}`)?.focus();
              }}
              onClick={() => setKind(tabKind)}
              disabled={isBusy}
              className={`flex h-full w-[240px] shrink-0 snap-start cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${
                selected
                  ? 'border-primary/35 bg-primary/[0.04]'
                  : 'border-border bg-white hover:border-primary/20 hover:bg-parchment'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  selected ? 'bg-primary text-white' : 'bg-parchment text-primary/70'
                }`}
              >
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-bold leading-5 ${selected ? 'text-primary' : 'text-text'}`}>{label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted line-clamp-2">{description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {loadError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          <p>{overview ? 'The report list could not be refreshed. Previously loaded reports are shown.' : 'The report list could not be loaded. Use Refresh to try again.'}</p>
        </div>
      )}

      <section
        id="report-directory"
        role="tabpanel"
        aria-labelledby={`report-tab-${kind}`}
        aria-busy={isLoading}
        className="overflow-hidden rounded-xl border border-border bg-white"
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-sm font-bold text-text">{activeTab.label} reports</h2>
          {termText && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
              <CalendarDays size={13} aria-hidden="true" />
              {termText}
            </span>
          )}
        </div>

        {isLoading && !overview ? (
          <div role="status" aria-label="Loading reports" className="divide-y divide-border/70">
            {[0, 1, 2].map((rowIndex) => (
              <div key={rowIndex} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                <Skeleton className="h-9 w-11 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-48 rounded" />
                  <Skeleton className="h-3 w-72 max-w-full rounded" />
                </div>
                <Skeleton className="hidden h-6 w-20 shrink-0 rounded-full sm:block" />
                <Skeleton className="h-8 w-20 shrink-0 rounded-lg" />
              </div>
            ))}
          </div>
        ) : !overview && loadError ? (
          <div className="px-5 py-10 text-center text-sm text-muted">Reports are temporarily unavailable.</div>
        ) : reportGroups.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-10 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-parchment text-muted">
              <FileText size={21} aria-hidden="true" />
            </span>
            <p className="text-sm font-bold text-text">
              {departments.length === 0 ? 'No departments available' : 'No reports available'}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">
              Reports appear here once departments and programs are set up.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {reportGroups.map(({ department, rows }) => (
              <section key={department.id} aria-label={department.name}>
                <ul className="divide-y divide-border/70">
                  {rows.map((row) => {
                    const ready = row.count > 0;
                    const isDetailLoading = loadingDetailKey === row.key;
                    return (
                      <li
                        key={row.key}
                        className="grid gap-x-4 gap-y-2.5 px-4 py-3.5 sm:px-5 md:grid-cols-[minmax(0,1fr)_7rem] md:items-center lg:grid-cols-[minmax(0,1fr)_minmax(14rem,19rem)_7rem]"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <DepartmentLogo
                            name={department.name}
                            logo={department.logo}
                            className="h-10 w-10"
                            iconSize={18}
                            fallbackClassName={getDeptBadgeStyles(department.code, department.name)}
                          />
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold leading-5 text-text">{row.label}</h3>
                            <p className="mt-0.5 text-xs leading-snug text-muted">
                              <span>{department.name}</span>
                              <span aria-hidden="true">, </span>
                              <span>{row.description}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pl-[3.25rem] md:col-start-1 md:row-start-2 lg:col-start-2 lg:row-start-1 lg:pl-0">
                          <ReadinessBadge ready={ready} />
                          <span className="min-w-0 text-xs leading-snug text-muted">
                            {ready ? readyDetail(kind, row.count) : notReadyReason(kind, noApprovedTerm)}
                          </span>
                        </div>

                        <div className="flex justify-end pl-[3.25rem] md:col-start-2 md:row-span-2 md:row-start-1 md:pl-0 lg:col-start-3 lg:row-span-1">
                          {ready && (
                            <button
                              type="button"
                              onClick={() => void openDetail(row)}
                              disabled={isBusy}
                              aria-label={`Preview: ${row.label}`}
                              className="inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-text transition-colors hover:border-primary/30 hover:bg-primary/[0.04] hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                            >
                              {isDetailLoading ? <LoadingSpinner size={13} className="animate-spin" /> : <Eye size={13} aria-hidden="true" className="text-primary" />}
                              Preview
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="flex items-start gap-2 border-t border-border bg-parchment/60 px-4 py-2.5 sm:px-5">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-stage-done" aria-hidden="true" />
          <p className="text-xs leading-relaxed text-muted">
            Only VPAA-approved schedules and officially assigned workloads are reported. Signatories use the identities recorded in approval history.
          </p>
        </div>
      </section>

      {detailData && (
        <ReportDetailModal
          row={detailData.row}
          kind={detailData.kind}
          data={detailData.data}
          generatedAt={detailData.generatedAt}
          onClose={() => setDetailData(null)}
          onPrint={() => { void generatePdf(detailData); }}
          isPrinting={loadingRowKey === detailData.row.key}
        />
      )}

      {job?.kind === 'schedule' && (
        <PrintSchedule
          sections={job.data.sections}
          isPrintModalOpen={isPrintOpen}
          setIsPrintModalOpen={setIsPrintOpen}
          allSchedules={job.data.schedules}
          selectedSectionId={job.data.sections[0]?.id ?? ''}
          departments={job.data.departments}
          users={job.data.users}
          activeSemester={job.data.activeSemester}
        />
      )}

      {job?.kind === 'load' && (
        <TeachingLoad
          faculties={job.data.faculties}
          allSchedules={job.data.schedules}
          isTeachingLoadOpen={isPrintOpen}
          setIsTeachingLoadOpen={setIsPrintOpen}
          sections={job.data.sections}
          activeSemester={job.data.activeSemester}
          users={job.data.users}
          departments={job.data.departments}
          selectedSectionId=""
        />
      )}
    </div>
  );
}
