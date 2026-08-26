import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  Clock,
  MapPin,
  User,
  Building2,
  Filter,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Layers,
  Printer,
  X,
  RotateCcw,
  Maximize2,
  Minimize2
} from 'lucide-react';
import api from '../../lib/api';
import Skeleton from '../../components/ui/Skeleton';
import { getCachedData, hasCachedData, setCachedData } from '../../lib/dataCache';
import { useToast } from '../../context/ToastContext';
import WeeklyTimetableGrid from '../../components/scheduling/WeeklyTimetableGrid';
import { formatTime12h, gridOpeningMinutes, slotCount, slotMinutes, slotToTimeLabel, timeToSlot } from '../../lib/timeGrid';
import { scheduleLocationLabel } from '../../lib/scheduleLocation';

interface Department {
  id: number;
  department_name: string;
  department_code: string;
  logo?: string | null;
}

interface Room {
  id: number;
  room_code: string;
  building?: string | null;
}

interface Faculty {
  id: number;
  first_name: string;
  last_name: string;
}

interface Section {
  id: number;
  section_name: string;
  department_id?: number | null;
}

interface ScheduleItem {
  id: number;
  day: string;
  start_time: string;
  end_time: string;
  meeting_type?: string | null;
  mode?: 'on-site' | 'online' | 'field';
  department_id?: number | null;
  department?: Department | null;
  room_id?: number | null;
  room?: Room | null;
  faculty_id?: number | null;
  faculty?: Faculty | null;
  section_id?: number | null;
  section?: Section | null;
  course?: { course_code?: string; course_name?: string; units?: number } | null;
  subject?: { subject_code?: string; subject_name?: string; units?: number } | null;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Card geometry, shared with the dashboard timetable grid. */
const HEADER_HEIGHT = 54;
const SLOT_HEIGHT = 24;
const TIME_COLUMN_WIDTH = 88;

const matchesDayOfWeek = (scheduleDay?: string | null, fullDayName?: string | null): boolean => {
  if (!scheduleDay || !fullDayName) return false;
  const s = scheduleDay.trim().toLowerCase();
  const targetFull = fullDayName.trim().toLowerCase();
  const targetShort = targetFull.substring(0, 3);

  if (s.includes(targetFull) || s.includes(targetShort)) return true;

  if (targetShort === 'mon' && s.includes('m') && !s.startsWith('th') && !s.includes('tth')) return true;
  if (targetShort === 'tue' && (s === 't' || s.includes('tue') || s.startsWith('t/') || s.includes('t-th') || s.includes('tth') || (s.includes('t') && !s.includes('th') && !s.includes('tth')))) return true;
  if (targetShort === 'wed' && (s.includes('w') || s.includes('wed'))) return true;
  if (targetShort === 'thu' && (s.includes('th') || s.includes('tth') || s.includes('thu'))) return true;
  if (targetShort === 'fri' && (s.includes('f') || s.includes('fri'))) return true;
  if (targetShort === 'sat' && s.includes('sat')) return true;
  if (targetShort === 'sun' && s.includes('sun')) return true;

  return false;
};

const getShortDay = (day: string): string => {
  const normalized = (day || '').trim().toLowerCase();
  if (normalized.startsWith("mon")) return "Mon";
  if (normalized.startsWith("tue")) return "Tue";
  if (normalized.startsWith("wed")) return "Wed";
  if (normalized.startsWith("thu")) return "Thu";
  if (normalized.startsWith("fri")) return "Fri";
  if (normalized.startsWith("sat")) return "Sat";
  if (normalized.startsWith("sun")) return "Sun";
  return "Mon";
};

const normalizeDepartmentKey = (code: string, name = "") => {
  const normalizedCode = (code || '').trim().toUpperCase();
  const value = name.toLowerCase();
  if (["IT", "CIT", "BSIT"].includes(normalizedCode) || value.includes("information technology") || value.includes("computing")) return "IT";
  if (["AS", "CAS"].includes(normalizedCode) || value.includes("arts and sciences")) return "AS";
  if (["EDUC", "CED", "COE"].includes(normalizedCode) || value.includes("education")) return "EDUC";
  if (["BA", "CBA", "CBM"].includes(normalizedCode) || value.includes("business")) return "BA";
  if (["HM", "CHM"].includes(normalizedCode) || value.includes("hospitality")) return "HM";
  if (["CM", "MID"].includes(normalizedCode) || value.includes("midwifery")) return "MID";
  if (["CRIM", "CCJ", "CCJPS"].includes(normalizedCode) || value.includes("criminal")) return "CRIM";
  if (["LIS", "CLIS"].includes(normalizedCode) || value.includes("library")) return "LIS";
  return "";
};

const getDeptStyles = (code: string) => {
  switch (normalizeDepartmentKey(code)) {
    case "IT": return "bg-blue-50 text-blue-800 border-blue-200 border-l-blue-600 hover:bg-blue-100/60";
    case "AS": return "bg-purple-50 text-purple-800 border-purple-200 border-l-purple-600 hover:bg-purple-100/60";
    case "EDUC": return "bg-orange-50 text-orange-850 border-orange-250 border-l-orange-500 hover:bg-orange-100/60";
    case "BA": return "bg-yellow-50/50 text-yellow-850 border-yellow-300 border-l-yellow-600 hover:bg-yellow-100/60";
    case "HM": return "bg-lime-50 text-lime-850 border-lime-300 border-l-lime-600 hover:bg-lime-100/60";
    case "MID": return "bg-emerald-50 text-emerald-850 border-emerald-300 border-l-emerald-600 hover:bg-emerald-100/60";
    case "CRIM": return "bg-[#5A1220]/5 text-[#5A1220] border-[#5A1220]/20 border-l-[#5A1220] hover:bg-[#5A1220]/10";
    case "LIS": return "bg-pink-50 text-pink-850 border-pink-300 border-l-pink-600 hover:bg-pink-100/60";
    default: return "bg-gray-50 text-gray-800 border-gray-300 border-l-gray-500 hover:bg-gray-100/60";
  }
};

/**
 * Swatch classes for one department, mirroring getDeptStyles so the footer legend
 * and the cards it explains can never drift apart.
 */
const getDeptSwatch = (code: string) => {
  switch (normalizeDepartmentKey(code)) {
    case "IT": return "border-blue-600 bg-blue-50";
    case "AS": return "border-purple-600 bg-purple-50";
    case "EDUC": return "border-orange-500 bg-orange-50";
    case "BA": return "border-yellow-600 bg-yellow-50";
    case "HM": return "border-lime-600 bg-lime-50";
    case "MID": return "border-emerald-600 bg-emerald-50";
    case "CRIM": return "border-[#5A1220] bg-[#5A1220]/5";
    case "LIS": return "border-pink-600 bg-pink-50";
    default: return "border-gray-500 bg-gray-50";
  }
};

/**
 * Chip colours for the monthly view and the day modal.
 *
 * Keyed off normalizeDepartmentKey, the same mapper getDeptStyles and
 * getDeptSwatch use, so a department is the same colour wherever the page draws
 * it and the weekly grid's footer legend stays truthful. The previous
 * `code.includes(...)` chain covered only four departments, which left CHM, MID,
 * CCJPS and CLIS sharing one maroon fallback and indistinguishable from each
 * other here while the weekly grid drew them in four different colours.
 */
const getDepartmentColor = (codeOrName?: string) => {
  const value = codeOrName ?? '';
  switch (normalizeDepartmentKey(value, value)) {
    case "IT": return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-700', badge: 'bg-blue-600 text-white' };
    case "AS": return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-700', badge: 'bg-purple-600 text-white' };
    case "EDUC": return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-700', badge: 'bg-orange-600 text-white' };
    case "BA": return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-800', badge: 'bg-yellow-600 text-white' };
    case "HM": return { bg: 'bg-lime-500/10', border: 'border-lime-500/30', text: 'text-lime-800', badge: 'bg-lime-600 text-white' };
    case "MID": return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-700', badge: 'bg-emerald-600 text-white' };
    case "CRIM": return { bg: 'bg-[#5A1220]/10', border: 'border-[#5A1220]/30', text: 'text-[#5A1220]', badge: 'bg-[#5A1220] text-white' };
    case "LIS": return { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-700', badge: 'bg-pink-600 text-white' };
    default: return { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-700', badge: 'bg-gray-600 text-white' };
  }
};

interface LayoutItem {
  schedule: ScheduleItem;
  leftPct: number;
  widthPct: number;
  hiddenCount?: number;
  overflowSchedules?: ScheduleItem[];
}

const getDayLayouts = (daySchedules: ScheduleItem[]): LayoutItem[] => {
  const sorted = [...daySchedules].sort((a, b) => {
    const aStart = timeToSlot(a.start_time);
    const bStart = timeToSlot(b.start_time);
    if (aStart !== bStart) return aStart - bStart;
    return (timeToSlot(b.end_time) - timeToSlot(b.start_time)) -
           (timeToSlot(a.end_time) - timeToSlot(a.start_time));
  });

  const clusters: ScheduleItem[][] = [];
  for (const s of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const overlaps = cluster.some((c) => {
        const sStart = timeToSlot(s.start_time);
        const sEnd = timeToSlot(s.end_time);
        const cStart = timeToSlot(c.start_time);
        const cEnd = timeToSlot(c.end_time);
        return Math.max(sStart, cStart) < Math.min(sEnd, cEnd);
      });
      if (overlaps) { cluster.push(s); placed = true; break; }
    }
    if (!placed) clusters.push([s]);
  }

  const layouts: LayoutItem[] = [];
  for (const cluster of clusters) {
    const columns: ScheduleItem[][] = [];
    for (const s of cluster) {
      let colIdx = 0;
      while (true) {
        if (!columns[colIdx]) { columns[colIdx] = [s]; break; }
        const overlapsCol = columns[colIdx].some((c) => {
          const sStart = timeToSlot(s.start_time);
          const sEnd = timeToSlot(s.end_time);
          const cStart = timeToSlot(c.start_time);
          const cEnd = timeToSlot(c.end_time);
          return Math.max(sStart, cStart) < Math.min(sEnd, cEnd);
        });
        if (!overlapsCol) { columns[colIdx].push(s); break; }
        colIdx++;
      }
    }

    const totalCols = columns.length;
    const visibleCols = Math.min(2, totalCols);

    const col0 = columns[0] || [];
    const col1 = columns[1] || [];
    const hiddenCols = columns.slice(2);
    const hiddenSchedules = hiddenCols.flat();

    col0.forEach((s, idx) => {
      const isOverflowHolder = visibleCols === 1 && idx === 0 && hiddenSchedules.length > 0;
      layouts.push({
        schedule: s,
        leftPct: 0,
        widthPct: visibleCols === 1 ? 100 : 50,
        hiddenCount: isOverflowHolder ? hiddenSchedules.length : 0,
        overflowSchedules: isOverflowHolder ? [...cluster] : [],
      });
    });

    col1.forEach((s, idx) => {
      const isOverflowHolder = idx === 0 && hiddenSchedules.length > 0;
      layouts.push({
        schedule: s,
        leftPct: 50,
        widthPct: 50,
        hiddenCount: isOverflowHolder ? hiddenSchedules.length : 0,
        overflowSchedules: isOverflowHolder ? [...cluster] : [],
      });
    });
  }
  return layouts;
};

export default function VpaaCalendarPage() {
  const { toast } = useToast();
  const cacheKey = 'page:vpaa-calendar:schedules';
  const cachedData = getCachedData<{ schedules: ScheduleItem[]; departments: Department[]; rooms: Room[] }>(cacheKey);

  const [schedules, setSchedules] = useState<ScheduleItem[]>(cachedData?.schedules ?? []);
  const [departments, setDepartments] = useState<Department[]>(cachedData?.departments ?? []);
  const [rooms, setRooms] = useState<Room[]>(cachedData?.rooms ?? []);
  const [isLoading, setIsLoading] = useState(!hasCachedData(cacheKey));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleItem | null>(null);
  const [clusterModalSchedules, setClusterModalSchedules] = useState<ScheduleItem[] | null>(null);
  const [dayModalInfo, setDayModalInfo] = useState<{ dayName: string; fullDateStr: string; date: number; schedules: ScheduleItem[] } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const fetchData = async (force = false) => {
    if (force || !hasCachedData(cacheKey)) setIsLoading(true);
    try {
      const [schedRes, deptRes, roomRes] = await Promise.all([
        api.get<ScheduleItem[]>('/schedules'),
        api.get<Department[]>('/departments'),
        api.get<Room[]>('/rooms')
      ]);
      const schedData = Array.isArray(schedRes.data) ? schedRes.data : [];
      const deptData = Array.isArray(deptRes.data) ? deptRes.data : [];
      const roomData = Array.isArray(roomRes.data) ? roomRes.data : [];
      setSchedules(schedData);
      setDepartments(deptData);
      setRooms(roomData);
      setCachedData(cacheKey, { schedules: schedData, departments: deptData, rooms: roomData });
    } catch (err) {
      console.error('Error loading calendar data:', err);
      toast.error('Error', 'Failed to load schedules calendar data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((item) => {
      if (selectedDeptId !== 'all') {
        const itemDeptId = item.department_id || item.department?.id || item.section?.department_id;
        if (itemDeptId?.toString() !== selectedDeptId) return false;
      }
      if (selectedDay !== 'all') {
        const itemDay = (item.day || '').toLowerCase();
        if (!itemDay.includes(selectedDay.toLowerCase().substring(0, 3))) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (item.course?.course_code || item.subject?.subject_code || '').toLowerCase();
        const name = (item.course?.course_name || item.subject?.subject_name || '').toLowerCase();
        const faculty = item.faculty ? `${item.faculty.first_name} ${item.faculty.last_name}`.toLowerCase() : '';
        const room = (item.room?.room_code || '').toLowerCase();
        const section = (item.section?.section_name || '').toLowerCase();

        return code.includes(q) || name.includes(q) || faculty.includes(q) || room.includes(q) || section.includes(q);
      }
      return true;
    });
  }, [schedules, selectedDeptId, selectedDay, searchQuery]);

  const metrics = useMemo(() => {
    const totalClasses = filteredSchedules.length;
    const assignedFaculties = new Set(filteredSchedules.map(s => s.faculty_id || s.faculty?.id).filter(Boolean)).size;
    const roomsUsedSet = new Set(filteredSchedules.map(s => s.room_id || s.room?.id).filter(Boolean));
    const roomsUsed = roomsUsedSet.size;
    const deptsCount = new Set(filteredSchedules.map(s => s.department_id || s.department?.id || s.section?.department_id).filter(Boolean)).size;
    return { totalClasses, assignedFaculties, roomsUsed, deptsCount };
  }, [filteredSchedules]);

  const monthCalendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells: Array<{ date: number; isCurrentMonth: boolean; dateObj: Date | null }> = [];

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      cells.push({ date: d, isCurrentMonth: false, dateObj: new Date(year, month - 1, d) });
    }

    for (let d = 1; d <= totalDaysInMonth; d++) {
      cells.push({ date: d, isCurrentMonth: true, dateObj: new Date(year, month, d) });
    }

    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ date: d, isCurrentMonth: false, dateObj: new Date(year, month + 1, d) });
    }

    return cells;
  }, [currentDate]);

  const now = new Date();
  const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
  const currentDayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];

  /**
   * Rows the grid renders. The shared window (07:00-19:00 by default) is the floor,
   * but it is only applied globally by the Schedule Builder's initial-data mapper,
   * and this page loads from /schedules. Stretching to the latest class keeps an
   * evening section on the grid instead of clipping it off the bottom.
   */
  const gridSlotCount = useMemo(() => {
    const latestEnd = filteredSchedules.reduce((max, s) => Math.max(max, timeToSlot(s.end_time)), 0);
    return Math.max(slotCount(), latestEnd);
  }, [filteredSchedules]);

  /** Departments present in the current view, for the grid's footer key. */
  const legendDepartments = useMemo(() => {
    const seen = new Map<string, string>();
    filteredSchedules.forEach(item => {
      const code = item.department?.department_code?.trim();
      if (code && !seen.has(code)) seen.set(code, item.department?.department_name ?? code);
    });
    return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredSchedules]);

  const currentDayTimeTop = useMemo(() => {
    const slot = (currentTotalMinutes - gridOpeningMinutes()) / slotMinutes();
    if (slot < 0 || slot > gridSlotCount) return null;
    return slot * SLOT_HEIGHT + HEADER_HEIGHT;
  }, [currentTotalMinutes, gridSlotCount]);

  const handlePrint = () => { window.print(); };

  const visibleDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter(d => selectedDay === 'all' || d === selectedDay);

  const timetableContent = (
    <div className={`${isFullscreen ? 'fixed inset-0 z-[999999] bg-white p-4 sm:p-6 flex flex-col w-screen h-screen m-0' : 'bg-white p-5 rounded-2xl border border-gray-300 shadow-md font-sans flex-1 flex flex-col'}`}>
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 border-b border-gray-150 pb-3 flex-shrink-0">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#5A1220]" />
            <h2 className="text-gray-900 font-extrabold text-base tracking-tight">Institutional Timetable Calendar</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 py-2 border border-gray-300 rounded-xl text-xs font-semibold shadow-xs outline-none" />
          </div>
          {(selectedDeptId !== 'all' || selectedDay !== 'all' || searchQuery !== '') && (
            <button onClick={() => { setSelectedDeptId('all'); setSelectedDay('all'); setSearchQuery(''); }} className="p-2 border border-gray-200 bg-white rounded-xl shadow-xs text-gray-600 hover:text-[#5A1220]">
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 border border-gray-200 bg-white rounded-xl shadow-xs">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex-1 overflow-auto bg-slate-50/70 p-4">
        <WeeklyTimetableGrid
          days={visibleDays}
          slotCount={gridSlotCount}
          headerHeight={HEADER_HEIGHT}
          timeColumnWidth={TIME_COLUMN_WIDTH}
          minWidth={850}
          slotHeight={SLOT_HEIGHT}
          getTimeLabel={slotToTimeLabel}
          getDayCount={(dayIndex) => filteredSchedules.filter(s => getShortDay(s.day) === visibleDays[dayIndex]).length}
        >
            {visibleDays.map((day, dayIndex) => {
              const daySchedules = filteredSchedules.filter(s => getShortDay(s.day) === day);
              const isToday = day === currentDayName;
              const layouts = getDayLayouts(daySchedules);
              return (
                <React.Fragment key={day}>
                    {isToday && currentDayTimeTop !== null && (
                      <div className="relative z-20 pointer-events-none" style={{ gridColumn: dayIndex + 2, gridRow: `2 / span ${gridSlotCount}` }}>
                        <div className="absolute left-0 right-0 border-t-2 border-red-500 flex items-center" style={{ top: `${currentDayTimeTop - HEADER_HEIGHT}px` }}>
                          <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shadow-xs" />
                        </div>
                      </div>
                    )}
                    {daySchedules.map((schedule) => {
                      const startIdx = timeToSlot(schedule.start_time);
                      const endIdx = Math.max(startIdx + 1, timeToSlot(schedule.end_time));
                      const duration = endIdx - startIdx;
                      const layout = layouts.find(item => item.schedule.id === schedule.id);
                      if (!layout) return null;
                      const deptCode = schedule.department?.department_code || schedule.section?.department_id?.toString() || 'GEN';
                      const hasOverflow = Boolean(layout.hiddenCount && layout.hiddenCount > 0);
                      const code = schedule.course?.course_code || schedule.subject?.subject_code || 'Class';
                      const courseTitle = schedule.course?.course_name || schedule.subject?.subject_name || '';
                      const units = schedule.course?.units ?? schedule.subject?.units;
                      const isField = (schedule.mode ?? '').toLowerCase().includes('field');
                      const timeRange = `${formatTime12h(schedule.start_time)}–${formatTime12h(schedule.end_time)}`;
                      // Four rows need roughly 72px. Below that the course title is the row
                      // to drop: the code above it already identifies the class, and the
                      // full title is one click away in the detail modal.
                      const showTitle = duration >= 3 && Boolean(courseTitle);
                      return (
                        <div
                          key={schedule.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedSchedule(schedule)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              setSelectedSchedule(schedule);
                            }
                          }}
                          style={{ gridColumn: dayIndex + 2, gridRow: `${startIdx + 2} / span ${duration}`, marginLeft: `calc(${layout.leftPct}% + 2px)`, width: `calc(${layout.widthPct}% - 4px)` }}
                          className={`group relative z-10 m-0.5 cursor-pointer overflow-hidden rounded-xl border-2 border-l-4 p-2 text-left shadow-sm transition hover:z-20 hover:shadow-md ${getDeptStyles(deptCode)}`}
                          title={`${code} · ${timeRange}${schedule.faculty ? ` · ${schedule.faculty.first_name} ${schedule.faculty.last_name}` : ''}`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <strong className="truncate text-[11px] font-black">{code}</strong>
                            <div className="flex shrink-0 items-center gap-1">
                              {isField && <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold text-amber-700">Field</span>}
                              <span className="rounded bg-black/5 px-1 py-0.5 text-[8px] font-black uppercase">{schedule.section?.section_name || 'Sec'}</span>
                              {hasOverflow && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setClusterModalSchedules(layout.overflowSchedules || []);
                                  }}
                                  className="rounded-full bg-[#C9952A] px-1.5 py-0.5 text-[8px] font-black text-white shadow-xs transition-transform hover:scale-105 hover:bg-[#a67a20]"
                                  title={`View all ${layout.overflowSchedules?.length || 0} overlapping schedules for this time slot`}
                                >
                                  +{layout.hiddenCount}
                                </button>
                              )}
                            </div>
                          </div>
                          {showTitle && <div className="mt-0.5 truncate text-[9px] font-semibold opacity-90">{courseTitle}</div>}
                          <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-700">{scheduleLocationLabel(schedule.mode, schedule.room?.room_code)}</div>
                          <div className="mt-1 flex items-center justify-between gap-1 text-[9px] text-slate-500">
                            <span className="truncate">{timeRange}</span>
                            {units ? <span className="shrink-0 rounded bg-white/80 px-1 py-0.5 font-bold">{units}u</span> : null}
                          </div>
                        </div>
                      );
                    })}
                </React.Fragment>
              );
            })}
        </WeeklyTimetableGrid>
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3 text-[11px] font-semibold text-slate-500">
          <span>Departments:</span>
          {legendDepartments.length ? legendDepartments.map(([deptCode, deptName]) => (
            <span key={deptCode} className="flex items-center gap-1.5" title={deptName}>
              <i className={`h-3 w-3 rounded-full border-2 ${getDeptSwatch(deptCode)}`} />
              {deptCode}
            </span>
          )) : <span className="italic text-slate-400">No classes in view</span>}
        </footer>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 font-sans pb-12">
      <div className="bg-gradient-to-r from-[#5A1220] via-[#7B1113] to-[#410b15] rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[#C9952A]/30">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#C9952A]/20 rounded-xl border border-[#C9952A]/40 text-[#C9952A]">
              <CalendarIcon size={22} />
            </div>
          </div>
          <p className="text-xs text-[#E8D5C4]/80 font-medium max-w-xl leading-relaxed">
            Real-time interactive master calendar displaying all academic schedules across college departments, instructors, sections, and room allocations.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => fetchData(true)} className="p-2.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-2 shadow-xs" title="Refresh Schedules Data">
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button onClick={handlePrint} className="px-4 py-2.5 bg-[#C9952A] hover:bg-[#b08123] text-[#4e0a10] rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-md hover:scale-[1.02]">
            <Printer size={15} />
            <span>Print Timetable</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-[#5A1220]/10 text-[#5A1220] border border-[#5A1220]/20">
            <BookOpen size={18} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Scheduled</span>
            {isLoading ? <Skeleton className="h-6 w-12 mt-1" /> : <span className="text-xl font-extrabold text-gray-900">{metrics.totalClasses} Classes</span>}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 border border-blue-500/20">
            <User size={18} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Active Faculty</span>
            {isLoading ? <Skeleton className="h-6 w-12 mt-1" /> : <span className="text-xl font-extrabold text-gray-900">{metrics.assignedFaculties} Instructors</span>}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <MapPin size={18} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Rooms Occupied</span>
            {isLoading ? <Skeleton className="h-6 w-12 mt-1" /> : <span className="text-xl font-extrabold text-gray-900">{metrics.roomsUsed} Rooms</span>}
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 border border-purple-500/20">
            <Building2 size={18} />
          </div>
          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Departments</span>
            {isLoading ? <Skeleton className="h-6 w-12 mt-1" /> : <span className="text-xl font-extrabold text-gray-900">{metrics.deptsCount} Depts</span>}
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search class, instructor, room, section..." className="w-full pl-11 pr-4 py-2.5 border border-gray-300 rounded-xl outline-none text-sm focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] bg-gray-50/30 focus:bg-white transition-all font-sans font-semibold text-gray-800" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-gray-400" />
            <select value={selectedDeptId} onChange={(e) => setSelectedDeptId(e.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors">
              <option value="all">All Departments</option>
              {departments.map((d) => <option key={d.id} value={d.id.toString()}>{d.department_code} - {d.department_name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays size={13} className="text-gray-400" />
            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} className="px-3 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors">
              <option value="all">All Days</option>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <option key={day} value={day}>{day}</option>)}
            </select>
          </div>
          <div className="flex items-center bg-gray-100 p-1 rounded-xl border border-gray-200 ml-auto lg:ml-0">
            <button onClick={() => setViewMode('weekly')} className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewMode === 'weekly' ? 'bg-[#5A1220] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}>Weekly Grid</button>
            <button onClick={() => setViewMode('monthly')} className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${viewMode === 'monthly' ? 'bg-[#5A1220] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'}`}>Monthly Master</button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 shadow-sm animate-pulse">
          <Skeleton className="h-6 w-48" />
          <div className="grid grid-cols-7 gap-3">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
        </div>
      ) : viewMode === 'weekly' ? (
        isFullscreen ? createPortal(timetableContent, document.body) : timetableContent
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4 font-sans">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-150 pb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-black text-gray-900 tracking-tight">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200">
                <button onClick={handlePrevMonth} className="p-1.5 rounded-lg hover:bg-white hover:shadow-2xs text-gray-700 transition-all cursor-pointer" title="Previous Month"><ChevronLeft size={16} /></button>
                <button onClick={handleToday} className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-[#5A1220] shadow-2xs hover:bg-[#5A1220] hover:text-white transition-all cursor-pointer">Today</button>
                <button onClick={handleNextMonth} className="p-1.5 rounded-lg hover:bg-white hover:shadow-2xs text-gray-700 transition-all cursor-pointer" title="Next Month"><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold bg-[#5A1220]/10 text-[#5A1220] px-3 py-1.5 rounded-full border border-[#5A1220]/20">
                {filteredSchedules.length} Scheduled Classes
              </span>
            </div>
          </div>
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/80 rounded-t-xl text-center py-2.5 text-xs font-black uppercase tracking-wider text-gray-700 divide-x divide-gray-200">
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>
          <div className="grid grid-cols-7 border-l border-t border-gray-200 divide-x divide-y divide-gray-200 rounded-b-xl overflow-hidden bg-white">
            {monthCalendarCells.map((cell, idx) => {
              const dayName = cell.dateObj ? cell.dateObj.toLocaleString('en-US', { weekday: 'long' }) : '';
              const fullDateStr = cell.dateObj ? cell.dateObj.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
              const daySchedules = filteredSchedules.filter((s) => matchesDayOfWeek(s.day, dayName));
              const isToday = cell.dateObj &&
                cell.dateObj.getDate() === now.getDate() &&
                cell.dateObj.getMonth() === now.getMonth() &&
                cell.dateObj.getFullYear() === now.getFullYear();

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (daySchedules.length > 0) {
                      setDayModalInfo({ dayName, fullDateStr, date: cell.date, schedules: daySchedules });
                    }
                  }}
                  className={`min-h-[130px] p-2 flex flex-col justify-between transition-all border ${
                    isToday
                      ? 'bg-gradient-to-b from-[#5A1220]/5 to-amber-500/5 border-[#5A1220] ring-1 ring-[#5A1220]/30 shadow-xs'
                      : cell.isCurrentMonth
                      ? 'bg-white border-gray-150 hover:bg-slate-50/80 hover:border-gray-300 cursor-pointer'
                      : 'bg-gray-50/50 text-gray-400 border-gray-100 hover:bg-gray-100/60 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-black w-6 h-6 flex items-center justify-center rounded-full transition-transform ${
                          isToday
                            ? 'bg-[#5A1220] text-white shadow-xs scale-105'
                            : cell.isCurrentMonth
                            ? 'text-gray-800 bg-gray-100'
                            : 'text-gray-400 bg-gray-100/50'
                        }`}
                      >
                        {cell.date}
                      </span>
                      {isToday && (
                        <span className="text-[8px] font-black text-[#5A1220] bg-[#5A1220]/10 border border-[#5A1220]/20 px-1.5 py-0.5 rounded-full tracking-wider uppercase">
                          Today
                        </span>
                      )}
                    </div>
                    {daySchedules.length > 0 && (
                      <span className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded-full ${cell.isCurrentMonth ? 'text-[#5A1220] bg-[#5A1220]/10 border border-[#5A1220]/20' : 'text-gray-500 bg-gray-200/60'}`}>
                        {daySchedules.length} {daySchedules.length === 1 ? 'class' : 'classes'}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 overflow-hidden flex-1">
                    {daySchedules.slice(0, 3).map((s) => {
                      const deptCode = s.department?.department_code || s.section?.department_id?.toString() || 'GEN';
                      const colors = getDepartmentColor(deptCode);
                      return (
                        <div
                          key={s.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSchedule(s);
                          }}
                          className={`px-1.5 py-1 rounded-md text-[9.5px] font-bold border ${colors.bg} ${colors.border} ${colors.text} truncate cursor-pointer hover:scale-[1.01] transition-all flex items-center justify-between gap-1 shadow-2xs`}
                          title={`${s.course?.course_code || s.subject?.subject_code} - ${formatTime12h(s.start_time)} (${s.room?.room_code || 'TBD'})`}
                        >
                          <span className="font-mono font-extrabold text-[9px] shrink-0">{formatTime12h(s.start_time)}</span>
                          <span className="truncate flex-1 font-extrabold">{s.course?.course_code || s.subject?.subject_code}</span>
                          <span className="text-[8px] font-black opacity-75 shrink-0 bg-white/50 px-1 rounded">{s.room?.room_code || 'TBD'}</span>
                        </div>
                      );
                    })}
                    {daySchedules.length > 3 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDayModalInfo({ dayName, fullDateStr, date: cell.date, schedules: daySchedules });
                        }}
                        className="text-[9px] font-black text-[#5A1220] hover:underline cursor-pointer block pt-0.5 text-left"
                      >
                        +{daySchedules.length - 3} more classes...
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Schedule Item Detail Modal */}
      {selectedSchedule && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#5A1220] to-[#7B1113] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BookOpen size={20} className="text-[#C9952A]" />
                <h3 className="text-sm font-black tracking-tight">Class Schedule Details</h3>
              </div>
              <button
                onClick={() => setSelectedSchedule(null)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 font-sans text-xs">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-1">
                <span className="text-[10px] font-bold text-[#C9952A] uppercase tracking-wider block">
                  {selectedSchedule.department?.department_name || 'Academic Department'}
                </span>
                <h4 className="text-base font-extrabold text-gray-900">
                  {selectedSchedule.course?.course_code || selectedSchedule.subject?.subject_code}
                </h4>
                {(selectedSchedule.course?.course_name || selectedSchedule.subject?.subject_name) && (
                  <p className="text-xs text-gray-600 font-medium">
                    {selectedSchedule.course?.course_name || selectedSchedule.subject?.subject_name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 font-semibold">
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Day & Time</span>
                  <div className="text-gray-900 font-bold flex items-center gap-1">
                    <Clock size={12} className="text-[#5A1220]" />
                    <span>{selectedSchedule.day} ({formatTime12h(selectedSchedule.start_time)} - {formatTime12h(selectedSchedule.end_time)})</span>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Section</span>
                  <div className="text-gray-900 font-bold flex items-center gap-1">
                    <Layers size={12} className="text-blue-600" />
                    <span>{selectedSchedule.section?.section_name || 'N/A'}</span>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Instructor</span>
                  <div className="text-gray-900 font-bold flex items-center gap-1">
                    <User size={12} className="text-emerald-600" />
                    <span>
                      {selectedSchedule.faculty
                        ? `${selectedSchedule.faculty.first_name} ${selectedSchedule.faculty.last_name}`
                        : 'Unassigned'}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-150 space-y-1">
                  <span className="text-[10px] text-gray-400 uppercase font-bold block">Assigned Room</span>
                  <div className="text-gray-900 font-bold flex items-center gap-1">
                    <MapPin size={12} className="text-purple-600" />
                    <span>{selectedSchedule.room?.room_code || 'TBD'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-150 flex justify-end">
              <button
                onClick={() => setSelectedSchedule(null)}
                className="px-4 py-2 bg-[#5A1220] hover:bg-[#410b15] text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Schedule Overview Modal */}
      {dayModalInfo && (
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-r from-[#5A1220] to-[#7B1113] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CalendarIcon size={20} className="text-[#C9952A]" />
                <div>
                  <h3 className="text-sm font-black tracking-tight">
                    {dayModalInfo.fullDateStr || dayModalInfo.dayName}
                  </h3>
                  <p className="text-[11px] text-[#E8D5C4]/90 font-medium">
                    {dayModalInfo.schedules.length} Total {dayModalInfo.schedules.length === 1 ? 'Class' : 'Classes'} Scheduled
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDayModalInfo(null)}
                className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-2.5 max-h-[60vh] overflow-y-auto font-sans">
              {dayModalInfo.schedules.map((s) => {
                const deptCode = s.department?.department_code || s.section?.department_id?.toString() || 'GEN';
                const colors = getDepartmentColor(deptCode);
                const courseCode = s.course?.course_code || s.subject?.subject_code || 'CLASS';
                const courseName = s.course?.course_name || s.subject?.subject_name || '';

                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      setDayModalInfo(null);
                      setSelectedSchedule(s);
                    }}
                    className={`p-3.5 rounded-xl border ${colors.bg} ${colors.border} shadow-2xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-3 group`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${colors.badge}`}>
                          {deptCode}
                        </span>
                        <h4 className="text-xs font-extrabold text-gray-900 truncate">{courseCode}</h4>
                        <span className="text-[9.5px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          Sec {s.section?.section_name || 'N/A'}
                        </span>
                      </div>
                      {courseName && <p className="text-[11px] text-gray-700 font-semibold truncate">{courseName}</p>}
                      <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-gray-600 font-medium pt-0.5">
                        <span className="flex items-center gap-1">
                          <User size={11} className="text-gray-400" />
                          {s.faculty ? `${s.faculty.first_name} ${s.faculty.last_name}` : 'Unassigned'}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <MapPin size={11} className="text-gray-400" />
                          Room: {s.room?.room_code || 'TBD'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-black bg-white/90 px-2.5 py-1 rounded-lg border border-gray-200 text-gray-800 shadow-2xs block">
                        {formatTime12h(s.start_time)} - {formatTime12h(s.end_time)}
                      </span>
                      <span className="text-[10px] font-bold text-[#C9952A] group-hover:underline mt-1 block">
                        View Details &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-150 flex justify-end">
              <button
                onClick={() => setDayModalInfo(null)}
                className="px-4 py-2 bg-[#5A1220] hover:bg-[#410b15] text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}{/* Overlapping Cluster Modal (+N Schedules) */}
      {clusterModalSchedules && clusterModalSchedules.length > 0 && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-150 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] font-sans">
            <div className="bg-gradient-to-r from-[#4e0a10] to-[#7B1113] p-5 text-white flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-lg leading-tight">
                  Overlapping Schedules ({clusterModalSchedules.length})
                </h3>
                <p className="text-xs text-[#E8D5C4] mt-0.5">
                  Showing max 2 visible cards on grid. Select a schedule below to view full details.
                </p>
              </div>
              <button
                onClick={() => setClusterModalSchedules(null)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5 flex-1 divide-y divide-gray-100">
              {clusterModalSchedules.map((sched) => {
                const deptCode = sched.department?.department_code || sched.section?.department_id?.toString() || 'GEN';
                return (
                  <div
                    key={sched.id}
                    onClick={() => {
                      setSelectedSchedule(sched);
                      setClusterModalSchedules(null);
                    }}
                    className="pt-2.5 first:pt-0 p-3 rounded-2xl hover:bg-gray-50 border border-gray-100 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-[#4e0a10]">
                          {sched.course?.course_code || sched.subject?.subject_code || 'CLASS'}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#4e0a10]/10 text-[#4e0a10]">
                          {sched.section?.section_name || 'Sec'}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                          {sched.day} ({sched.start_time} - {sched.end_time})
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-700">
                        {sched.course?.course_name || sched.subject?.subject_name}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium pt-0.5">
                        <span>Faculty: {sched.faculty ? `${sched.faculty.first_name} ${sched.faculty.last_name}` : 'TBA'}</span>
                        <span>•</span>
                        <span>Room: {sched.room?.room_code || 'TBD'}</span>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-[#C9952A] group-hover:translate-x-1 transition-transform">
                      View &rarr;
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setClusterModalSchedules(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
