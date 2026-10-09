import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Award,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  GaugeCircle,
  GraduationCap,
  LayoutGrid,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Skeleton from '../../components/ui/Skeleton';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import DashboardMetricCard from '../../components/overview/DashboardMetricCard';
import PrintSchedule from '../ClassSchedules/SchedulerPanel/PrintSchedule';
import TeachingLoad from '../ClassSchedules/SchedulerPanel/TeachingLoad';
import type { Room, Course } from '../ClassSchedules/SchedulerPanel/types';
import type { SchedulerCacheData } from '../ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import { getDeptBadgeStyles } from '../../lib/departmentTheme';
import api from '../../lib/api';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import { getStoredUser } from '../../lib/storedUser';
import {
  fetchReportData,
  fetchReportsOverview,
  type ReportDepartment,
  type ReportsOverview,
} from '../../lib/reports';

export type ReportKind = 'schedule' | 'load' | 'room' | 'curriculum' | 'approval';

interface PrintJob {
  kind: 'schedule' | 'load';
  data: SchedulerCacheData;
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
    description: 'Facility occupancy, lecture vs laboratory capacity, and booked hours.',
    icon: Building2,
  },
  {
    kind: 'curriculum',
    label: 'Curriculums & Courses',
    description: 'Active curriculum course offerings, lecture/lab units, and scheduled sections.',
    icon: BookOpen,
  },
  {
    kind: 'approval',
    label: 'Approval & Readiness',
    description: 'Workflow stages from department drafting to Dean review and VPAA approval.',
    icon: ClipboardCheck,
  },
];

const rowsFor = (department: ReportDepartment, kind: ReportKind): ReportRow[] => {
  const countOf = (item: { complete_section_count: number; instructor_count: number }) => {
    if (kind === 'schedule' || kind === 'approval') return item.complete_section_count;
    if (kind === 'load') return item.instructor_count;
    if (kind === 'room' || kind === 'curriculum') return item.complete_section_count > 0 ? 1 : 0;
    return item.complete_section_count;
  };

  const suffix =
    kind === 'schedule' ? 'Class Schedule' :
    kind === 'load' ? 'Instructors Load' :
    kind === 'room' ? 'Room Utilization' :
    kind === 'curriculum' ? 'Curriculum Courses' :
    'Approval Status';

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

interface ReportDetailModalProps {
  row: ReportRow;
  kind: ReportKind;
  data: SchedulerCacheData;
  onClose: () => void;
  onPrint?: () => void;
  onExportCsv: () => void;
}

function reportRooms(data: SchedulerCacheData): Pick<Room, 'id' | 'name' | 'building' | 'roomType'>[] {
  if (data.rooms?.length) return data.rooms;
  const rooms = new Map<string, Pick<Room, 'id' | 'name' | 'building' | 'roomType'>>();
  data.schedules.forEach((schedule) => {
    if (schedule.roomName && !rooms.has(schedule.roomName)) {
      rooms.set(schedule.roomName, { id: schedule.roomId ?? '', name: schedule.roomName, roomType: 'lecture' });
    }
  });
  return Array.from(rooms.values());
}

function reportCourses(data: SchedulerCacheData): Pick<Course, 'id' | 'code' | 'name' | 'units' | 'lectureHours' | 'labHours'>[] {
  if (data.subjects?.length) return data.subjects;
  const courses = new Map<string, Pick<Course, 'id' | 'code' | 'name' | 'units' | 'lectureHours' | 'labHours'>>();
  data.schedules.forEach((schedule) => {
    const code = schedule.courseCode || schedule.subjectCode;
    if (code && !courses.has(code)) {
      courses.set(code, {
        id: schedule.courseId ?? '', code, name: schedule.courseName || schedule.subjectName || code,
        units: 3, lectureHours: 3, labHours: 0,
      });
    }
  });
  return Array.from(courses.values());
}

function ReportDetailModal({ row, kind, data, onClose, onPrint, onExportCsv }: ReportDetailModalProps) {
  const [query, setQuery] = useState('');

  const roomList = useMemo(() => reportRooms(data), [data]);
  const courseList = useMemo(() => reportCourses(data), [data]);

  const q = query.trim().toLowerCase();

  const filteredSchedules = useMemo(() => {
    if (!q) return data.schedules;
    return data.schedules.filter((s) =>
      `${s.sectionName} ${s.courseCode} ${s.courseName} ${s.subjectCode} ${s.subjectName} ${s.roomName} ${s.facultyName} ${s.day}`
        .toLowerCase()
        .includes(q)
    );
  }, [data.schedules, q]);

  const filteredFaculty = useMemo(() => {
    if (!q) return data.faculties;
    return data.faculties.filter((f) => `${f.name} ${f.employmentType} ${f.status}`.toLowerCase().includes(q));
  }, [data.faculties, q]);

  const filteredRooms = useMemo(() => {
    if (!q) return roomList;
    return roomList.filter((r) => `${r.name} ${r.building || ''} ${r.roomType || ''}`.toLowerCase().includes(q));
  }, [roomList, q]);

  const filteredCourses = useMemo(() => {
    if (!q) return courseList;
    return courseList.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q));
  }, [courseList, q]);

  const filteredSections = useMemo(() => {
    if (!q) return data.sections;
    return data.sections.filter((s) => `${s.name} Year ${s.yearLevel || 1}`.toLowerCase().includes(q));
  }, [data.sections, q]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${row.label} - Detailed Report`}
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
    >
      <div className="relative my-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4e0a10] text-white shadow-sm">
              {kind === 'schedule' && <CalendarDays size={20} />}
              {kind === 'load' && <GraduationCap size={20} />}
              {kind === 'room' && <Building2 size={20} />}
              {kind === 'curriculum' && <BookOpen size={20} />}
              {kind === 'approval' && <ClipboardCheck size={20} />}
            </span>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">{row.label}</h2>
              <p className="text-xs text-slate-500">{row.description} &bull; Detailed Breakdown</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Download size={13} /> Export CSV
            </button>
            {onPrint && (
              <button
                type="button"
                onClick={onPrint}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#6b1520]"
              >
                <Printer size={13} /> Print PDF
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail modal"
              className="ml-2 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-white px-5 py-3 sm:grid-cols-4">
          {kind === 'schedule' && (
            <>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <CalendarDays size={16} className="text-[#4e0a10]" />
                <div>
                  <div className="text-xs font-black text-slate-800">{data.schedules.length}</div>
                  <div className="text-[10px] font-semibold text-slate-500">Classes Scheduled</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <LayoutGrid size={16} className="text-emerald-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {new Set(data.schedules.map((s) => s.sectionName).filter(Boolean)).size}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Active Sections</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <Users size={16} className="text-sky-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {new Set(data.schedules.map((s) => s.facultyName).filter(Boolean)).size}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Instructors Teaching</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <Building2 size={16} className="text-amber-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {new Set(data.schedules.map((s) => s.roomName).filter(Boolean)).size}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Rooms Occupied</div>
                </div>
              </div>
            </>
          )}

          {kind === 'load' && (
            <>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <Users size={16} className="text-[#4e0a10]" />
                <div>
                  <div className="text-xs font-black text-slate-800">{data.faculties.length}</div>
                  <div className="text-[10px] font-semibold text-slate-500">Total Instructors</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <Award size={16} className="text-emerald-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {data.faculties.reduce((sum, f) => sum + (f.assignedUnits || 0), 0)}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Assigned Units</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <GaugeCircle size={16} className="text-amber-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {data.faculties.filter((f) => (f.assignedUnits || 0) > Math.max(0, (f.maxUnits || 0) - (f.deloadUnits || 0))).length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Overloaded</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <CheckCircle2 size={16} className="text-sky-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {data.faculties.length
                      ? (data.faculties.reduce((sum, f) => sum + (f.assignedUnits || 0), 0) / data.faculties.length).toFixed(1)
                      : 0} units
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Average Load</div>
                </div>
              </div>
            </>
          )}

          {kind === 'room' && (
            <>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <Building2 size={16} className="text-[#4e0a10]" />
                <div>
                  <div className="text-xs font-black text-slate-800">{roomList.length}</div>
                  <div className="text-[10px] font-semibold text-slate-500">Rooms Reported</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {roomList.filter((r) => data.schedules.some((s) => s.roomName === r.name || s.roomId === r.id)).length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Rooms in Use</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <CalendarDays size={16} className="text-sky-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {data.schedules.filter((s) => Boolean(s.roomName)).length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Room Bookings</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <FileSpreadsheet size={16} className="text-purple-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {roomList.filter((r) => (r.roomType || '').toLowerCase().includes('lab')).length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Laboratories</div>
                </div>
              </div>
            </>
          )}

          {kind === 'curriculum' && (
            <>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <BookOpen size={16} className="text-[#4e0a10]" />
                <div>
                  <div className="text-xs font-black text-slate-800">{courseList.length}</div>
                  <div className="text-[10px] font-semibold text-slate-500">Curriculum Offerings</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <Award size={16} className="text-emerald-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {courseList.reduce((sum, c) => sum + (c.units || 3), 0)}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Total Units</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <LayoutGrid size={16} className="text-sky-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {new Set(data.schedules.map((s) => s.sectionName).filter(Boolean)).size}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">Sections Served</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <CheckCircle2 size={16} className="text-purple-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">
                    {courseList.filter((c) => (c.labHours ?? 0) > 0).length}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500">With Lab Hours</div>
                </div>
              </div>
            </>
          )}

          {kind === 'approval' && (
            <>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <LayoutGrid size={16} className="text-[#4e0a10]" />
                <div>
                  <div className="text-xs font-black text-slate-800">{data.sections.length}</div>
                  <div className="text-[10px] font-semibold text-slate-500">Total Sections</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">{data.sections.length}</div>
                  <div className="text-[10px] font-semibold text-slate-500">VPAA Approved</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <CalendarDays size={16} className="text-sky-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">{data.schedules.length}</div>
                  <div className="text-[10px] font-semibold text-slate-500">Classes Placed</div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <ShieldCheck size={16} className="text-emerald-600" />
                <div>
                  <div className="text-xs font-black text-emerald-700">100%</div>
                  <div className="text-[10px] font-semibold text-slate-500">Readiness Rate</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-2.5">
          <div className="relative max-w-sm flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search records in this report..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 outline-none transition focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
            />
          </div>
          <span className="text-xs font-bold text-slate-500">
            {kind === 'schedule' && `${filteredSchedules.length} classes`}
            {kind === 'load' && `${filteredFaculty.length} instructors`}
            {kind === 'room' && `${filteredRooms.length} rooms`}
            {kind === 'curriculum' && `${filteredCourses.length} courses`}
            {kind === 'approval' && `${filteredSections.length} sections`}
          </span>
        </div>

        <div>
          {kind === 'schedule' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-sm border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Section</th>
                  <th className="px-4 py-2.5">Course Code & Title</th>
                  <th className="px-4 py-2.5">Schedule Slot</th>
                  <th className="px-4 py-2.5">Room</th>
                  <th className="px-4 py-2.5">Instructor</th>
                  <th className="px-4 py-2.5">Mode</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSchedules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs italic text-slate-400">
                      No schedule records matched your query.
                    </td>
                  </tr>
                ) : (
                  filteredSchedules.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-2.5 font-bold text-slate-800 whitespace-nowrap">{item.sectionName}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-bold text-primary">{item.courseCode || item.subjectCode}</span>
                        <span className="block text-[11px] text-slate-500 truncate max-w-xs">{item.courseName || item.subjectName}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          {item.day}
                        </span>
                        <span className="block text-[11px] text-slate-600 mt-0.5 font-semibold">
                          {item.startTime} - {item.endTime}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                          <Building2 size={11} /> {item.roomName || 'TBA'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        {item.facultyName || <span className="italic text-slate-400">Unassigned</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            item.mode?.toLowerCase().includes('online')
                              ? 'bg-sky-50 text-sky-700'
                              : item.mode?.toLowerCase().includes('field')
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {item.mode || 'on-site'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          <CheckCircle2 size={11} /> Approved
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {kind === 'load' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-sm border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Instructor</th>
                  <th className="px-4 py-2.5">Employment</th>
                  <th className="px-4 py-2.5 text-right">Max Units</th>
                  <th className="px-4 py-2.5 text-right">Deload</th>
                  <th className="px-4 py-2.5 text-right">Basic Load</th>
                  <th className="px-4 py-2.5 text-right">Assigned Units</th>
                  <th className="px-4 py-2.5 text-right">Load Status</th>
                  <th className="px-4 py-2.5 text-right">Classes</th>
                  <th className="px-4 py-2.5 text-right">Standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFaculty.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-xs italic text-slate-400">
                      No instructor records matched your query.
                    </td>
                  </tr>
                ) : (
                  filteredFaculty.map((f) => {
                    const max = f.maxUnits || 0;
                    const deload = f.deloadUnits || 0;
                    const basic = Math.max(0, max - deload);
                    const assigned = f.assignedUnits || 0;
                    const over = Math.max(0, assigned - basic);
                    const remaining = Math.max(0, basic - assigned);
                    const classCount = data.schedules.filter((s) => s.facultyId === f.id || s.facultyName === f.name).length;

                    return (
                      <tr key={f.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-2.5 font-bold text-slate-800">{f.name}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 capitalize">
                            {f.employmentType || 'full-time'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-600">{max}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-500">
                          {deload > 0 ? `-${deload}` : '0'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-700">{basic}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-black text-primary">{assigned}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {over > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              +{over} overload
                            </span>
                          ) : remaining > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                              {remaining} available
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              Complete
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-600">{classCount}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            {f.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {kind === 'room' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-sm border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Room Code</th>
                  <th className="px-4 py-2.5">Building</th>
                  <th className="px-4 py-2.5">Room Type</th>
                  <th className="px-4 py-2.5 text-right">Scheduled Classes</th>
                  <th className="px-4 py-2.5">Days Utilized</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRooms.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs italic text-slate-400">
                      No room records matched your query.
                    </td>
                  </tr>
                ) : (
                  filteredRooms.map((r) => {
                    const classCount = data.schedules.filter(
                      (s) => (s.roomId && s.roomId === r.id) || (s.roomName && s.roomName === r.name)
                    ).length;
                    const days = Array.from(
                      new Set(
                        data.schedules
                          .filter((s) => (s.roomId && s.roomId === r.id) || (s.roomName && s.roomName === r.name))
                          .map((s) => s.day)
                          .filter(Boolean)
                      )
                    ).join(', ');

                    return (
                      <tr key={r.id || r.name} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-2.5 font-bold text-primary">{r.name}</td>
                        <td className="px-4 py-2.5 text-slate-600">{r.building || 'Main Campus'}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {r.roomType || 'Lecture Room'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-black text-slate-800">{classCount}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-[11px]">{days || '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              classCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {classCount > 0 ? 'In Use' : 'Available'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {kind === 'curriculum' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-sm border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Course Code</th>
                  <th className="px-4 py-2.5">Course Title</th>
                  <th className="px-4 py-2.5 text-right">Lec Hours</th>
                  <th className="px-4 py-2.5 text-right">Lab Hours</th>
                  <th className="px-4 py-2.5 text-right">Total Units</th>
                  <th className="px-4 py-2.5 text-right">Scheduled Classes</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCourses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs italic text-slate-400">
                      No curriculum course records matched your query.
                    </td>
                  </tr>
                ) : (
                  filteredCourses.map((c) => {
                    const scheduledCount = data.schedules.filter(
                      (s) => s.courseCode === c.code || s.subjectCode === c.code
                    ).length;

                    return (
                      <tr key={c.id || c.code} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-2.5 font-bold text-primary">{c.code}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{c.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.lectureHours ?? 3}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.labHours ?? 0}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-black text-slate-800">{c.units ?? 3}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-emerald-700">{scheduledCount}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            Offered
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {kind === 'approval' && (
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-sm border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Section Name</th>
                  <th className="px-4 py-2.5">Year Level</th>
                  <th className="px-4 py-2.5 text-right">Classes Scheduled</th>
                  <th className="px-4 py-2.5 text-right">Instructors Placed</th>
                  <th className="px-4 py-2.5 text-right">Rooms Booked</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSections.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs italic text-slate-400">
                      No section records matched your query.
                    </td>
                  </tr>
                ) : (
                  filteredSections.map((sec) => {
                    const classCount = data.schedules.filter(
                      (s) => s.sectionId === sec.id || s.sectionName === sec.name
                    ).length;
                    const instructorsCount = data.schedules.filter(
                      (s) => (s.sectionId === sec.id || s.sectionName === sec.name) && Boolean(s.facultyName)
                    ).length;
                    const roomsCount = data.schedules.filter(
                      (s) => (s.sectionId === sec.id || s.sectionName === sec.name) && Boolean(s.roomName)
                    ).length;

                    return (
                      <tr key={sec.id || sec.name} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-2.5 font-bold text-slate-800">{sec.name}</td>
                        <td className="px-4 py-2.5 text-slate-600">Year {sec.yearLevel || 1}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-black text-slate-800">{classCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-600">{instructorsCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-600">{roomsCount}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 size={11} /> VPAA Approved
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-5 py-3">
          <p className="text-[11px] font-medium text-slate-500">
            Source: Official VPAA validated academic repository &bull; Generated from live schedule data
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const { toast } = useToast();
  const cacheKey = `dashboard:reports:${getStoredUser()?.id ?? 'current'}`;
  const [overview, setOverview] = useState<ReportsOverview | null>(() => getCachedData<ReportsOverview>(cacheKey) ?? null);
  const [isLoading, setIsLoading] = useState(() => !hasCachedData(cacheKey));
  const [kind, setKind] = useState<ReportKind>('schedule');
  const [loadingRowKey, setLoadingRowKey] = useState<string | null>(null);
  const [exportingRowKey, setExportingRowKey] = useState<string | null>(null);
  const [loadingDetailKey, setLoadingDetailKey] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{ row: ReportRow; data: SchedulerCacheData } | null>(null);
  const [job, setJob] = useState<PrintJob | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [readyOnly, setReadyOnly] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(
    () =>
      fetchReportsOverview()
        .then((data) => { setCachedData(cacheKey, data); setOverview(data); setLoadError(false); })
        .catch(() => {
          setLoadError(true);
          toast.error('Reports Unavailable', 'The report list could not be loaded.');
        })
        .finally(() => setIsLoading(false)),
    [cacheKey, toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = () => {
    setIsLoading(true);
    void load();
  };

  const print = async (row: ReportRow) => {
    if (loadingRowKey || exportingRowKey || loadingDetailKey) return;
    setLoadingRowKey(row.key);
    try {
      const data = await fetchReportData(row.departmentId, row.programId);
      if (kind === 'schedule' && data.sections.length === 0) {
        toast.warning('Nothing to Print', 'No section in this scope has a fully approved schedule yet.');
        return;
      }
      setJob({ kind: kind === 'load' ? 'load' : 'schedule', data });
      setIsPrintOpen(true);
      void api
        .post('/reports/log-download', {
          report_type: kind,
          department_id: row.departmentId,
          program_id: row.programId,
        })
        .catch(() => {});
    } catch {
      toast.error('Print Failed', 'The report data could not be loaded.');
    } finally {
      setLoadingRowKey(null);
    }
  };

  const openDetail = async (row: ReportRow) => {
    if (loadingRowKey || exportingRowKey || loadingDetailKey) return;
    setLoadingDetailKey(row.key);
    try {
      const data = await fetchReportData(row.departmentId, row.programId);
      setDetailData({ row, data });
    } catch {
      toast.error('Could Not Open Report', 'The detailed report data could not be loaded.');
    } finally {
      setLoadingDetailKey(null);
    }
  };

  const exportCsv = async (row: ReportRow) => {
    if (loadingRowKey || exportingRowKey || loadingDetailKey) return;
    setExportingRowKey(row.key);
    try {
      const data = await fetchReportData(row.departmentId, row.programId);
      const csvLines: string[] = [];

      if (kind === 'schedule') {
        csvLines.push(['Department', 'Section', 'Course Code', 'Course Title', 'Day', 'Time', 'Room', 'Instructor', 'Mode'].join(','));
        data.schedules.forEach((s) => {
          const dept = data.departments.find((d) => Number(d.id) === Number(s.departmentId))?.department_code ?? '';
          const sec = s.sectionName || '';
          const code = s.courseCode || s.subjectCode || '';
          const title = s.courseName || s.subjectName || '';
          const day = s.day || '';
          const time = `${s.startTime || ''} - ${s.endTime || ''}`;
          const room = s.roomName || '';
          const faculty = s.facultyName || '';
          const mode = s.mode || 'on-site';

          csvLines.push([`"${dept}"`, `"${sec}"`, `"${code}"`, `"${title}"`, `"${day}"`, `"${time}"`, `"${room}"`, `"${faculty}"`, `"${mode}"`].join(','));
        });
      } else if (kind === 'load') {
        csvLines.push(['Instructor Name', 'Employment Type', 'Max Units', 'Deload Units', 'Basic Load', 'Assigned Units', 'Status'].join(','));
        data.faculties.forEach((f) => {
          const basic = Math.max(0, (f.maxUnits || 0) - (f.deloadUnits || 0));
          csvLines.push([
            `"${f.name || ''}"`,
            `"${f.employmentType || 'full-time'}"`,
            `"${f.maxUnits || 0}"`,
            `"${f.deloadUnits || 0}"`,
            `"${basic}"`,
            `"${f.assignedUnits || 0}"`,
            `"${f.status || 'Active'}"`,
          ].join(','));
        });
      } else if (kind === 'room') {
        csvLines.push(['Room Code', 'Building', 'Room Type', 'Classes Scheduled', 'Status'].join(','));
        const roomMap = new Map<string, number>();
        data.schedules.forEach((s) => {
          if (s.roomName) roomMap.set(s.roomName, (roomMap.get(s.roomName) || 0) + 1);
        });
        const rList = reportRooms(data);
        rList.forEach((r) => {
          const count = roomMap.get(r.name) || 0;
          csvLines.push([`"${r.name}"`, `"${r.building || 'Main Campus'}"`, `"${r.roomType || 'Lecture Room'}"`, `"${count}"`, `"${count > 0 ? 'In Use' : 'Available'}"`].join(','));
        });
      } else if (kind === 'curriculum') {
        csvLines.push(['Course Code', 'Course Title', 'Lecture Hours', 'Lab Hours', 'Total Units', 'Scheduled Classes'].join(','));
        const cList = reportCourses(data);
        cList.forEach((c) => {
          const scheduledCount = data.schedules.filter((s) => (s.courseCode || s.subjectCode) === c.code).length;
          csvLines.push([`"${c.code}"`, `"${c.name}"`, `"${c.lectureHours ?? 3}"`, `"${c.labHours ?? 0}"`, `"${c.units ?? 3}"`, `"${scheduledCount}"`].join(','));
        });
      } else if (kind === 'approval') {
        csvLines.push(['Section Name', 'Year Level', 'Classes Scheduled', 'Status'].join(','));
        data.sections.forEach((sec) => {
          const count = data.schedules.filter((s) => s.sectionId === sec.id || s.sectionName === sec.name).length;
          csvLines.push([`"${sec.name}"`, `"Year ${sec.yearLevel || 1}"`, `"${count}"`, '"VPAA Approved"'].join(','));
        });
      }

      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${row.label.replace(/[^a-zA-Z0-9]/g, '_')}_${kind}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Export Complete', `${row.label} data exported to CSV.`);
    } catch {
      toast.error('Export Failed', 'Could not export CSV data.');
    } finally {
      setExportingRowKey(null);
    }
  };

  const departments = useMemo(() => overview?.departments ?? [], [overview]);
  const query = search.trim().toLowerCase();
  const reportGroups = departments.map((department) => ({ department, rows: rowsFor(department, kind) }));
  const availableCount = reportGroups.reduce((total, group) => total + group.rows.filter((row) => row.count > 0).length, 0);

  const totalSectionsCount = useMemo(
    () => departments.reduce((acc, d) => acc + d.complete_section_count, 0),
    [departments]
  );
  const totalInstructorsCount = useMemo(
    () => departments.reduce((acc, d) => acc + d.instructor_count, 0),
    [departments]
  );

  const visibleGroups = reportGroups
    .filter(({ department }) => deptFilter === 'all' || String(department.id) === deptFilter)
    .map(({ department, rows }) => ({
      department,
      rows: rows.filter(
        (row) =>
          (!readyOnly || row.count > 0) &&
          `${department.code} ${department.name} ${row.label} ${row.description} ${department.programs.map((program) => program.name).join(' ')}`.toLowerCase().includes(query)
      ),
    }))
    .filter((group) => group.rows.length > 0);

  const visibleCount = visibleGroups.reduce((total, group) => total + group.rows.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-600">
          <CalendarDays size={16} className="shrink-0 text-[#4e0a10]" />
          <span>Institutional Academic Reports Repository</span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-[#4e0a10]/30 hover:text-[#4e0a10] disabled:opacity-50"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <DashboardMetricCard
          label="Approved Sections"
          value={isLoading && !overview ? '—' : totalSectionsCount}
          detail="VPAA verified sections"
          icon={LayoutGrid}
          tone="brand"
        />
        <DashboardMetricCard
          label="Active Instructors"
          value={isLoading && !overview ? '—' : totalInstructorsCount}
          detail="Instructors with approved load"
          icon={Users}
          tone="accent"
        />
        <DashboardMetricCard
          label="Available Reports"
          value={isLoading && !overview ? '—' : availableCount}
          detail={`${departments.length} department${departments.length === 1 ? '' : 's'} reporting`}
          icon={FileSpreadsheet}
          tone="good"
        />
      </div>

      <div role="tablist" aria-label="Report type" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {TABS.map(({ kind: tabKind, label, description, icon: Icon }) => (
          <button
            key={tabKind}
            id={`report-tab-${tabKind}`}
            type="button"
            role="tab"
            aria-selected={kind === tabKind}
            aria-controls="report-directory"
            tabIndex={kind === tabKind ? 0 : -1}
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
            disabled={loadingRowKey !== null || exportingRowKey !== null || loadingDetailKey !== null}
            className={`group flex flex-col justify-between rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] disabled:opacity-60 ${
              kind === tabKind
                ? 'border-[#4e0a10]/30 bg-[#4e0a10]/5 ring-1 ring-[#4e0a10]/15 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                  kind === tabKind ? 'bg-[#4e0a10] text-white shadow-sm' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                }`}
              >
                <Icon size={18} />
              </span>
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  kind === tabKind ? 'border-[#4e0a10] bg-[#4e0a10] text-white' : 'border-slate-300'
                }`}
              >
                {kind === tabKind && <Check size={10} />}
              </span>
            </div>
            <div className="mt-2.5">
              <span className="block text-xs font-extrabold text-[#4e0a10]">{label}</span>
              <span className="mt-0.5 block text-[10px] leading-snug text-slate-500 line-clamp-2">{description}</span>
            </div>
          </button>
        ))}
      </div>

      {loadError && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <AlertCircle size={16} className="shrink-0" />
          <p>{overview ? 'The report list could not be refreshed. Previously loaded reports are shown.' : 'The report list could not be loaded. Use Refresh to try again.'}</p>
        </div>
      )}

      <section
        id="report-directory"
        role="tabpanel"
        aria-labelledby={`report-tab-${kind}`}
        aria-busy={isLoading}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-sm font-extrabold text-slate-800">Report directory</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Browse detailed breakdown tables, open official PDFs, or export CSV data for any department or program.
            </p>
          </div>
          {overview && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              <CheckCircle2 size={13} />
              {availableCount} available scope{availableCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
          <div className="relative min-w-0 flex-1 basis-56 sm:max-w-md">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              aria-label="Search departments or programs"
              placeholder="Search departments or programs..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:border-[#4e0a10]/40 focus:ring-2 focus:ring-[#4e0a10]/5"
            />
          </div>

          {departments.length > 1 && (
            <div className="relative inline-flex items-center">
              <Filter size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                aria-label="Filter by department"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-7 text-xs font-bold text-slate-600 outline-none transition hover:border-slate-300 focus:border-[#4e0a10]/40"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            aria-pressed={readyOnly}
            onClick={() => setReadyOnly(!readyOnly)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${
              readyOnly ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CheckCircle2 size={14} />Available only
          </button>

          {(search || readyOnly || deptFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setReadyOnly(false);
                setDeptFilter('all');
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#4e0a10]"
            >
              <X size={13} />Clear filters
            </button>
          )}

          {overview && (
            <span role="status" className="ml-auto text-[11px] font-semibold text-slate-400">
              {visibleCount} report{visibleCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {isLoading && !overview ? (
          <div role="status" aria-label="Loading reports" className="divide-y divide-slate-100">
            {[0, 1].map((deptIndex) => (
              <div key={deptIndex} className="grid lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,2fr)]">
                <div className="flex items-start gap-3 bg-slate-50/50 px-4 py-4 sm:px-5 lg:border-r lg:border-slate-100">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-3 w-16 rounded" />
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {[0, 1].map((rowIndex) => (
                    <div key={rowIndex} className="flex items-center gap-3 px-4 py-4 sm:px-5">
                      <Skeleton className="hidden h-9 w-8 shrink-0 rounded-lg sm:flex" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-48 rounded" />
                        <Skeleton className="h-3 w-64 max-w-full rounded" />
                        <Skeleton className="h-2.5 w-28 rounded" />
                      </div>
                      <Skeleton className="h-8 w-24 shrink-0 rounded-lg" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : !overview && loadError ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">Reports are temporarily unavailable.</div>
        ) : visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <FileText size={23} />
            </span>
            <p className="text-sm font-bold text-slate-700">
              {departments.length === 0 ? 'No departments available' : search || readyOnly || deptFilter !== 'all' ? 'No matching reports' : 'No reports available'}
            </p>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
              {search || readyOnly || deptFilter !== 'all'
                ? 'Try a different search or clear the filters to see all reports.'
                : 'Reports will appear here when departments and programs are available.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {visibleGroups.map(({ department, rows }) => (
              <section key={department.id} aria-label={department.name} className="grid lg:grid-cols-[minmax(220px,0.85fr)_minmax(0,2fr)]">
                <header className="flex items-start gap-3 bg-slate-50/50 px-4 py-4 sm:px-5 lg:border-r lg:border-slate-100">
                  <span className={`inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border px-2 text-[11px] font-black ${getDeptBadgeStyles(department.code, department.name)}`}>
                    {department.code}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold leading-relaxed text-slate-700">{department.name}</h3>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      {rows.length} report{rows.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </header>

                <ul className="min-w-0 divide-y divide-slate-100">
                  {rows.map((row) => {
                    const isBusy = loadingRowKey === row.key;
                    const isExporting = exportingRowKey === row.key;
                    const isDetailLoading = loadingDetailKey === row.key;
                    const unit =
                      kind === 'schedule' ? 'approved section' :
                      kind === 'load' ? 'instructor' :
                      kind === 'room' ? 'room' :
                      kind === 'curriculum' ? 'curriculum offering' :
                      'section package';

                    return (
                      <li key={row.key} className="flex flex-wrap items-center gap-3 px-4 py-4 transition hover:bg-slate-50/70 sm:px-5">
                        <span
                          className={`hidden h-9 w-8 shrink-0 items-center justify-center rounded-lg border sm:flex ${
                            row.count > 0 ? 'border-[#4e0a10]/10 bg-[#4e0a10]/5 text-[#4e0a10]' : 'border-slate-100 bg-slate-50 text-slate-300'
                          }`}
                        >
                          <FileText size={17} />
                        </span>

                        <div className="min-w-0 flex-1 basis-36">
                          <p className="text-xs font-bold text-slate-800">{row.label}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{row.description}</p>
                          <p className={`mt-1.5 flex items-center gap-1 text-[10px] font-semibold ${row.count > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            {row.count > 0 && <CheckCircle2 size={11} />}
                            {row.count > 0 ? `${row.count} ${unit}${row.count === 1 ? '' : 's'}` : 'Awaiting approved schedules'}
                          </p>
                        </div>

                        <div className="ml-auto flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void openDetail(row)}
                            disabled={row.count === 0 || loadingRowKey !== null || exportingRowKey !== null || loadingDetailKey !== null}
                            aria-label={`View Details: ${row.label}`}
                            title={row.count === 0 ? 'Nothing approved to display yet' : 'View detailed report breakdown'}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-700 shadow-sm transition hover:border-[#4e0a10]/40 hover:bg-[#4e0a10]/5 hover:text-[#4e0a10] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isDetailLoading ? <LoadingSpinner size={13} className="animate-spin" /> : <Eye size={13} className="text-[#4e0a10]" />}
                            <span>View Details</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void exportCsv(row)}
                            disabled={row.count === 0 || loadingRowKey !== null || exportingRowKey !== null || loadingDetailKey !== null}
                            aria-label={`Export CSV: ${row.label}`}
                            title={row.count === 0 ? 'Nothing approved to export yet' : 'Export CSV data'}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isExporting ? <LoadingSpinner size={13} className="animate-spin" /> : <Download size={13} />}
                            <span className="hidden sm:inline">CSV</span>
                          </button>

                          {(kind === 'schedule' || kind === 'load') && (
                            <button
                              type="button"
                              onClick={() => void print(row)}
                              disabled={row.count === 0 || loadingRowKey !== null || exportingRowKey !== null || loadingDetailKey !== null}
                              aria-label={`Open PDF: ${row.label}`}
                              title={row.count === 0 ? 'Nothing approved to print yet' : 'Open PDF'}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#6b1520] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
                            >
                              {isBusy ? <LoadingSpinner size={14} className="animate-spin" /> : <Printer size={14} />}
                              {isBusy ? 'Preparing...' : 'Open PDF'}
                              {!isBusy && <ArrowUpRight size={12} />}
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

        <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
          <p className="text-[11px] leading-relaxed text-slate-500">
            Only VPAA-approved schedules and officially assigned workloads are reported. Signatories are dynamically attached from Institution Settings.
          </p>
        </div>
      </section>

      {detailData && (
        <ReportDetailModal
          row={detailData.row}
          kind={kind}
          data={detailData.data}
          onClose={() => setDetailData(null)}
          onPrint={kind === 'schedule' || kind === 'load' ? () => { void print(detailData.row); } : undefined}
          onExportCsv={() => { void exportCsv(detailData.row); }}
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
