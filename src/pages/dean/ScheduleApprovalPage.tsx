import React, { useState, useMemo, useEffect } from 'react';
import { 
  Eye, 
  Check, 
  X, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  RefreshCw,
  List,
  CalendarDays
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import api from '../../lib/api';
import Skeleton from '../../components/ui/Skeleton';
import { clearDataCache, getCachedData, hasCachedData, loadCachedData } from '../../lib/dataCache';
import { useToast } from '../../context/ToastContext';

interface ScheduleApproval {
  id: number;
  department: string;
  section: string;
  subjectsScheduled: number;
  submittedBy: string;
  submittedAt: string;
  deanReviewedAt: string | null;
  status: 'submitted' | 'approved_by_dean' | 'rejected_by_dean' | 'approved' | 'rejected';
  mode: 'on-site' | 'online' | 'field';
}

interface StoredUser {
  id?: number;
  department_id?: number;
  department?: {
    department_name?: string;
  };
}

interface RawSection {
  id: number | string;
  section_name: string;
  department_id: number | string;
  term_id: number | string;
}

interface RawSchedule {
  id: number | string;
  department_id: number | string;
  section_id: number | string;
  subject_id: number | string;
  faculty_id?: number | string | null;
  term_id: number | string;
  day: string;
  start_time: string;
  end_time: string;
  mode: 'on-site' | 'online' | 'field';
  status: ScheduleApproval['status'];
  created_at?: string;
  reviewed_at_dean?: string | null;
  rejection_reason?: string | null;
  reviewed_by_dean?: number | string | null;
  department?: {
    department_name?: string;
  } | null;
  section?: {
    section_name?: string;
  } | null;
  subject?: {
    subject_code?: string;
    subject_name?: string;
  } | null;
  faculty?: {
    first_name?: string;
    last_name?: string;
  } | null;
  room?: {
    room_code?: string;
    building?: string | null;
  } | null;
}

interface ScheduleSectionOption {
  id: string;
  name: string;
}

type ModalViewMode = 'list' | 'grid';

const dayOrder: Record<string, number> = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

const APPROVAL_SLOT_HEIGHT_PX = 24;

const getDepartmentApprovalStatus = (items: RawSchedule[]): ScheduleApproval['status'] => {
  const statuses = items.map((item) => item.status);
  if (statuses.includes('submitted')) return 'submitted';
  if (statuses.includes('rejected_by_dean')) return 'rejected_by_dean';
  if (statuses.includes('approved_by_dean')) return 'approved_by_dean';
  if (statuses.includes('rejected')) return 'rejected';
  return 'approved';
};

interface ScheduleApprovalPageData {
  schedules: ScheduleApproval[];
  rawSchedules: RawSchedule[];
  rawSections: RawSection[];
}

const normalizeDepartmentKey = (dept: string) => {
  const value = dept.toLowerCase();
  if (value.includes('information technology')) return 'IT';
  if (value.includes('arts and sciences')) return 'AS';
  if (value.includes('education')) return 'EDUC';
  if (value.includes('business')) return 'BA';
  if (value.includes('hospitality')) return 'HM';
  if (value === 'cm' || value.includes('midwifery')) return 'MID';
  if (value.includes('criminal')) return 'CRIM';
  if (value.includes('library')) return 'LIS';
  return '';
};

const getDeptColorClasses = (dept: string) => {
  switch (normalizeDepartmentKey(dept)) {
    case 'AS':
      return {
        bg: 'bg-[#7C3AED]/10',
        border: 'border-[#7C3AED]/40',
        text: 'text-[#7C3AED]',
        accent: 'border-l-[#7C3AED]'
      };
    case 'IT':
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-400',
        text: 'text-blue-900',
        accent: 'border-l-blue-700'
      };
    case 'EDUC':
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-400',
        text: 'text-orange-900',
        accent: 'border-l-orange-600'
      };
    case 'BA':
      return {
        bg: 'bg-yellow-50',
        border: 'border-yellow-400',
        text: 'text-yellow-900',
        accent: 'border-l-yellow-600'
      };
    case 'HM':
      return {
        bg: 'bg-lime-50',
        border: 'border-lime-400',
        text: 'text-lime-900',
        accent: 'border-l-lime-600'
      };
    case 'MID':
      return {
        bg: 'bg-green-50',
        border: 'border-green-400',
        text: 'text-green-900',
        accent: 'border-l-green-600'
      };
    case 'CRIM':
      return {
        bg: 'bg-[#4e0a10]/10',
        border: 'border-[#6b0f1a]',
        text: 'text-[#4e0a10]',
        accent: 'border-l-[#4e0a10]'
      };
    case 'LIS':
      return {
        bg: 'bg-pink-50',
        border: 'border-pink-400',
        text: 'text-pink-900',
        accent: 'border-l-pink-600'
      };
    default:
      return {
        bg: 'bg-purple-50',
        border: 'border-purple-400',
        text: 'text-purple-900',
        accent: 'border-l-purple-600'
      };
  }
};

const getSlotIndexFrom24h = (timeStr: string): number => {
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const totalMinutes = (hours * 60 + minutes) - (7 * 60);
  return Math.max(0, Math.floor(totalMinutes / 30));
};

const formatTime24hTo12h = (timeStr: string): string => {
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
};

export default function DeanScheduleApprovalPage() {
  const { toast } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const userDeptId = user?.department_id;
  const userDeptName = user?.department?.department_name;
  const userId = user?.id;
  const approvalCacheKey = `page:dean-schedule-approval:${userDeptId ?? 'all'}`;
  const cachedApprovalData = getCachedData<ScheduleApprovalPageData>(approvalCacheKey);
  const [schedules, setSchedules] = useState<ScheduleApproval[]>(cachedApprovalData?.schedules ?? []);
  const [rawSchedules, setRawSchedules] = useState<RawSchedule[]>(cachedApprovalData?.rawSchedules ?? []);
  const [rawSections, setRawSections] = useState<RawSection[]>(cachedApprovalData?.rawSections ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!hasCachedData(approvalCacheKey));
  
  // Filters
  const [selectedStatus, setSelectedStatus] = useState('All Status');
  const [selectedMode, setSelectedMode] = useState('All Modes');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Modals state
  const [viewSchedule, setViewSchedule] = useState<ScheduleApproval | null>(null);
  const [approveConfirm, setApproveConfirm] = useState<ScheduleApproval | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState<ScheduleApproval | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [modalViewMode, setModalViewMode] = useState<ModalViewMode>('list');
  const [selectedModalSectionId, setSelectedModalSectionId] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(!hasCachedData(approvalCacheKey));
        const data = await loadCachedData<ScheduleApprovalPageData>(approvalCacheKey, async () => {
          const response = await api.get<{
            active_term: { id: number | string } | null;
            sections: RawSection[];
            schedules: RawSchedule[];
          }>('/initial-data');
          const term = response.data.active_term;

          let filteredSections = response.data.sections;
          if (term) {
            filteredSections = filteredSections.filter((s) => Number(s.term_id) === Number(term.id));
          }

          let dbSchedules = response.data.schedules;
          if (term) {
            dbSchedules = dbSchedules.filter((s) => Number(s.term_id) === Number(term.id));
          }

          const sectionsByDepartment: Record<string, RawSection[]> = {};
          filteredSections.forEach((section) => {
            if (userDeptId && Number(section.department_id) !== Number(userDeptId)) {
              return;
            }

            const departmentId = section.department_id?.toString();
            if (!departmentId) return;

            if (!sectionsByDepartment[departmentId]) {
              sectionsByDepartment[departmentId] = [];
            }
            sectionsByDepartment[departmentId].push(section);
          });

          // Group schedules by department ID
          const schedulesByDepartment: Record<string, RawSchedule[]> = {};
          dbSchedules.forEach((s) => {
            const departmentId = s.department_id?.toString();
            if (!departmentId || !sectionsByDepartment[departmentId]) return;

            if (!schedulesByDepartment[departmentId]) {
              schedulesByDepartment[departmentId] = [];
            }
            schedulesByDepartment[departmentId].push(s);
          });

          const mappedApprovals: ScheduleApproval[] = [];
          Object.entries(schedulesByDepartment).forEach(([departmentId, deptSchedules]) => {
            if (deptSchedules.length === 0) return;

            const firstSched = deptSchedules[0];
            const status = getDepartmentApprovalStatus(deptSchedules);
            if (status === 'approved') return;
            const departmentSections = sectionsByDepartment[departmentId] ?? [];
            mappedApprovals.push({
              id: Number(departmentId),
              department: firstSched.department?.department_name ?? userDeptName ?? "",
              section: `${departmentSections.length} section${departmentSections.length !== 1 ? 's' : ''}`,
              subjectsScheduled: new Set(deptSchedules.map((s) => s.subject_id)).size,
              submittedBy: "Coordinator",
              submittedAt: firstSched.created_at ?? "",
              deanReviewedAt: firstSched.reviewed_at_dean ?? null,
              status: status,
              mode: firstSched.mode ?? "on-site"
            });
          });

          return {
            schedules: mappedApprovals,
            rawSchedules: dbSchedules,
            rawSections: filteredSections,
          };
        });

        setRawSchedules(data.rawSchedules);
        setRawSections(data.rawSections);
        setSchedules(data.schedules);
      } catch {
        toast.error('Load Failed', 'Could not load schedules for approval.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [approvalCacheKey, userDeptId, userDeptName]);

  const resetFilters = () => {
    setSelectedStatus('All Status');
    setSelectedMode('All Modes');
  };

  const handleApprove = (sched: ScheduleApproval) => {
    setApproveConfirm(sched);
  };

  const confirmApprove = async () => {
    if (approveConfirm) {
      try {
        const now = new Date().toISOString();
        await api.post(`/departments/${approveConfirm.id}/approve-by-dean`);

        setSchedules((prev) =>
          prev.map((s) =>
            s.id === approveConfirm.id
              ? { ...s, status: 'approved_by_dean', deanReviewedAt: now }
              : s
          )
        );
        setRawSchedules((prev) =>
          prev.map((s) =>
            Number(s.department_id) === Number(approveConfirm.id)
              ? { ...s, status: 'approved_by_dean', reviewed_by_dean: userId, reviewed_at_dean: now }
              : s
          )
        );
        clearDataCache();

        toast.success('Success', `${approveConfirm.department} schedule has been approved successfully.`);
      } catch (err) {
        toast.error('Error', 'Failed to approve schedule.');
      } finally {
        setApproveConfirm(null);
      }
    }
  };

  const handleReject = (sched: ScheduleApproval) => {
    setRejectConfirm(sched);
    setRejectReason('');
    setRejectError('');
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      setRejectError('A reason for rejection is required.');
      return;
    }
    if (rejectConfirm) {
      try {
        const now = new Date().toISOString();
        await api.post(`/departments/${rejectConfirm.id}/return-by-dean`, {
          rejection_reason: rejectReason
        });

        setSchedules((prev) =>
          prev.map((s) =>
            s.id === rejectConfirm.id
              ? { ...s, status: 'rejected_by_dean', deanReviewedAt: now }
              : s
          )
        );
        setRawSchedules((prev) =>
          prev.map((s) =>
            Number(s.department_id) === Number(rejectConfirm.id)
              ? { ...s, status: 'rejected_by_dean', rejection_reason: rejectReason, reviewed_by_dean: userId, reviewed_at_dean: now }
              : s
          )
        );
        clearDataCache();

        toast.error('Rejected', `${rejectConfirm.department} schedule has been returned for revision.`);
      } catch (err) {
        toast.error('Error', 'Failed to reject schedule.');
      } finally {
        setRejectConfirm(null);
        setRejectReason('');
      }
    }
  };

  // Filter schedules
  const filteredData = useMemo(() => {
    return schedules.filter(s => {
      let matchStatus = true;
      if (selectedStatus !== 'All Status') {
        if (selectedStatus === 'Pending Dean Approval') matchStatus = s.status === 'submitted';
        else if (selectedStatus === 'Pending VPAA Approval') matchStatus = s.status === 'approved_by_dean';
        else if (selectedStatus === 'Approved') matchStatus = s.status === 'approved';
        else if (selectedStatus === 'Rejected') matchStatus = s.status === 'rejected' || s.status === 'rejected_by_dean';
      }

      let matchMode = true;
      if (selectedMode !== 'All Modes') {
        matchMode = s.mode === selectedMode.toLowerCase().replace(' ', '-');
      }
      
      return matchStatus && matchMode;
    });
  }, [schedules, selectedStatus, selectedMode]);

  // Format date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { 
        month: 'short', 
        day: '2-digit', 
        year: 'numeric' 
      }) + ' ' + d.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '—';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'bg-amber-100 text-amber-800 border-amber-200/60';
      case 'approved_by_dean':
        return 'bg-blue-100 text-blue-800 border-blue-200/60';
      case 'rejected_by_dean':
        return 'bg-rose-100 text-rose-805 border-rose-200/60';
      case 'approved':
        return 'bg-emerald-100 text-emerald-850 border-emerald-200/60';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200/60';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'submitted': return 'Pending Dean Approval';
      case 'approved_by_dean': return 'Pending VPAA Approval';
      case 'rejected_by_dean': return 'Rejected by Dean';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  const getSectionName = (item: RawSchedule) => {
    return item.section?.section_name
      ?? rawSections.find((section) => String(section.id) === String(item.section_id))?.section_name
      ?? `Section ${item.section_id}`;
  };

  const getRoomName = (item: RawSchedule) => {
    if (!item.room) return 'Unassigned';
    if (item.room.room_code === 'ONLINE') return 'Online';
    if (item.room.room_code === 'FIELD') return 'Field';
    return item.room.building ? `${item.room.room_code} - ${item.room.building}` : item.room.room_code;
  };

  const getInstructorName = (item: RawSchedule) => {
    if (!item.faculty) return 'Unassigned';
    return `${item.faculty.first_name ?? ''} ${item.faculty.last_name ?? ''}`.trim() || 'Unassigned';
  };

  const getModeLabel = (mode: RawSchedule['mode']) => {
    if (mode === 'on-site') return 'On-Site';
    if (mode === 'online') return 'Online';
    return 'Field';
  };

  // Timetable Grid Slot Generator (7:00 AM to 9:00 PM)
  const timeSlots = useMemo(() => {
    const slots = [];
    let hour = 7;
    let mins = 0;
    while (hour < 21 || (hour === 21 && mins === 0)) {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHr = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const slotStr = `${displayHr}:${mins === 0 ? '00' : '30'} ${ampm}`;
      slots.push(slotStr);
      mins += 30;
      if (mins === 60) {
        mins = 0;
        hour += 1;
      }
    }
    return slots;
  }, []);

  const modalSchedules = useMemo(() => {
    if (!viewSchedule) return [];
    return rawSchedules
      .filter((schedule) => Number(schedule.department_id) === Number(viewSchedule.id))
      .sort((left, right) => (
        getSectionName(left).localeCompare(getSectionName(right))
        || (dayOrder[left.day] ?? 99) - (dayOrder[right.day] ?? 99)
        || left.start_time.localeCompare(right.start_time)
      ));
  }, [rawSchedules, rawSections, viewSchedule]);

  const modalSections = useMemo<ScheduleSectionOption[]>(() => {
    if (!viewSchedule) return [];
    const sectionMap = new Map<string, string>();

    rawSections
      .filter((section) => Number(section.department_id) === Number(viewSchedule.id))
      .forEach((section) => sectionMap.set(String(section.id), section.section_name));

    modalSchedules.forEach((schedule) => {
      sectionMap.set(String(schedule.section_id), getSectionName(schedule));
    });

    return Array.from(sectionMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [modalSchedules, rawSections, viewSchedule]);

  useEffect(() => {
    if (!viewSchedule) {
      setModalViewMode('list');
      setSelectedModalSectionId('');
      return;
    }

    setModalViewMode('list');
  }, [viewSchedule]);

  useEffect(() => {
    if (!viewSchedule || modalSections.length === 0) return;
    if (!selectedModalSectionId || !modalSections.some((section) => section.id === selectedModalSectionId)) {
      setSelectedModalSectionId(modalSections[0].id);
    }
  }, [modalSections, selectedModalSectionId, viewSchedule]);

  const selectedSectionSchedules = useMemo(() => {
    return modalSchedules.filter((schedule) => String(schedule.section_id) === selectedModalSectionId);
  }, [modalSchedules, selectedModalSectionId]);

  const groupedModalSchedules = useMemo(() => {
    const groups = new Map<string, RawSchedule[]>();
    modalSchedules.forEach((schedule) => {
      const sectionName = getSectionName(schedule);
      groups.set(sectionName, [...(groups.get(sectionName) ?? []), schedule]);
    });
    return Array.from(groups.entries());
  }, [modalSchedules, rawSections]);

  const modalSummary = useMemo(() => ({
    totalSections: modalSections.length,
    totalScheduledSubjects: new Set(modalSchedules.map((schedule) => String(schedule.subject_id))).size,
    unassignedInstructors: modalSchedules.filter((schedule) => !schedule.faculty_id).length,
    totalScheduleEntries: modalSchedules.length,
  }), [modalSchedules, modalSections]);

  const columns = useMemo<ColumnDef<ScheduleApproval>[]>(
    () => [
      {
        accessorKey: 'department',
        header: 'Department',
        cell: info => <span className="font-bold text-gray-800">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'section',
        header: 'Submission',
        cell: info => <span className="text-gray-700 font-semibold">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'subjectsScheduled',
        header: () => <div className="text-center">Subjects Scheduled</div>,
        cell: info => <div className="text-center font-semibold text-gray-700">{info.getValue() as number}</div>
      },
      {
        accessorKey: 'submittedBy',
        header: 'Submitted By',
        cell: info => <span className="text-gray-600 font-medium">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'submittedAt',
        header: 'Submitted At',
        cell: info => <span className="text-gray-500 font-medium">{formatDate(info.getValue() as string)}</span>
      },
      {
        accessorKey: 'deanReviewedAt',
        header: 'Dean Reviewed At',
        cell: info => <span className="text-gray-500 font-medium">{formatDate(info.getValue() as string | null)}</span>
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: info => {
          const status = info.getValue() as string;
          return (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider ${getStatusBadge(status)}`}>
              {getStatusLabel(status)}
            </span>
          );
        }
      },
      {
        accessorKey: 'mode',
        header: 'Mode',
        cell: info => {
          const mode = info.getValue() as 'on-site' | 'online' | 'field';
          return (
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider ${
              mode === 'on-site'
                ? 'bg-blue-100 text-blue-850 border-blue-200/60'
                : mode === 'online'
                ? 'bg-emerald-100 text-emerald-850 border-emerald-200/60'
                : 'bg-amber-100 text-amber-850 border-amber-200/60'
            }`}>
              {mode === 'on-site' ? 'On-Site' : mode === 'online' ? 'Online' : 'Field'}
            </span>
          );
        }
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        enableSorting: false,
        cell: ({ row }) => {
          const sched = row.original;
          const isActable = sched.status === 'submitted';
          return (
            <div className="flex justify-end gap-1.5">
              {/* View Schedule Timetable */}
              <div className="relative group">
                <button 
                  onClick={() => setViewSchedule(sched)}
                  className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                >
                  <Eye size={17} />
                </button>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-md">
                  View
                </span>
              </div>

              {isActable && (
                <>
                  {/* Approve */}
                  <div className="relative group">
                    <button 
                      onClick={() => handleApprove(sched)}
                      className="p-1.5 text-[#C9952A] hover:bg-[#C9952A]/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <Check size={17} />
                    </button>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-md">
                      Approve
                    </span>
                  </div>

                  {/* Reject */}
                  <div className="relative group">
                    <button 
                      onClick={() => handleReject(sched)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <X size={17} />
                    </button>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-md">
                      Reject
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        }
      }
    ],
    [schedules]
  );

  const table = useReactTable<ScheduleApproval>({
    data: filteredData,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });



  return (
    <div className="p-6 relative">
      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-gray-150/70 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <select 
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPagination(prev => ({ ...prev, pageIndex: 0 }));
            }}
            className="px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-xs bg-white text-gray-700 font-semibold cursor-pointer"
          >
            <option value="All Status">All Status</option>
            <option value="Pending Dean Approval">Pending Dean Approval</option>
            <option value="Pending VPAA Approval">Pending VPAA Approval</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>

          <select 
            value={selectedMode}
            onChange={(e) => {
              setSelectedMode(e.target.value);
              setPagination(prev => ({ ...prev, pageIndex: 0 }));
            }}
            className="px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-xs bg-white text-gray-700 font-semibold cursor-pointer"
          >
            <option value="All Modes">All Modes</option>
            <option value="On-Site">On-Site</option>
            <option value="Online">Online</option>
            <option value="Field">Field</option>
          </select>
        </div>

        <button 
          onClick={resetFilters}
          className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-xs font-bold transition-all duration-200 cursor-pointer"
        >
          Reset Filters
        </button>
      </div>

      {/* Table Card wrapper */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="bg-gray-50/75 border-b border-gray-100">
                  {headerGroup.headers.map(header => (
                    <th 
                      key={header.id} 
                      className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-gray-500 select-none"
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <button
                              onClick={header.column.getToggleSortingHandler()}
                              className="ml-1.5 text-gray-400 hover:text-gray-600 inline-flex items-center cursor-pointer"
                            >
                              {header.column.getIsSorted() === 'asc' ? (
                                <ArrowUp size={13} className="text-[#C9952A]" />
                              ) : header.column.getIsSorted() === 'desc' ? (
                                <ArrowDown size={13} className="text-[#C9952A]" />
                              ) : (
                                <ArrowUpDown size={13} />
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr 
                    key={`skeleton-row-${index}`} 
                    className={`h-12 border-b border-gray-100 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                    }`}
                  >
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-12 mx-auto" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap">
                      <Skeleton className="h-4 w-36" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap">
                      <Skeleton className="h-4 w-36" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-24 rounded-full" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs">
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-2.5 align-middle text-xs whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <Skeleton className="h-8 w-8 rounded-lg" />
                        <Skeleton className="h-8 w-8 rounded-lg" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-base font-semibold">No schedules found.</p>
                      <p className="text-xs">Adjust your status or mode filters and try again.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, index) => (
                  <tr 
                    key={row.id} 
                    className={`transition-colors h-12 hover:bg-gray-50/70 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/20'
                    }`}
                  >
                    {row.getVisibleCells().map(cell => {
                      const isNoWrap = ['section', 'subjectsScheduled', 'submittedAt', 'deanReviewedAt', 'status', 'actions'].includes(cell.column.id);
                      return (
                        <td 
                          key={cell.id} 
                          className={`px-4 py-2.5 align-middle text-xs ${
                            isNoWrap ? 'whitespace-nowrap' : ''
                          }`}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {filteredData.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/30">
            <div className="flex items-center gap-4">
              <div className="text-xs font-semibold text-gray-500">
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}–
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length
                )} of {table.getFilteredRowModel().rows.length} schedules
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-semibold">Show</span>
                <select
                  value={table.getState().pagination.pageSize}
                  onChange={e => {
                    table.setPageSize(Number(e.target.value));
                  }}
                  className="text-xs border border-gray-200 rounded-lg p-1 bg-white outline-none focus:ring-1 focus:ring-[#C9952A]"
                >
                  {[10, 25, 50].map(pageSize => (
                    <option key={pageSize} value={pageSize}>
                      {pageSize}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
              >
                First
              </button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
              >
                Prev
              </button>
              <span className="text-xs font-bold text-gray-500 px-1">
                Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
              >
                Next
              </button>
              <button
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="px-2 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer font-bold text-gray-600"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View Weekly Timetable Modal */}
      {viewSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-[#1A1410] font-display">
                    {viewSchedule.department} Department Schedule
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getStatusBadge(viewSchedule.status)}`}>
                    {getStatusLabel(viewSchedule.status)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-medium mt-1">View Only - No edits allowed</p>
              </div>
              <button 
                onClick={() => setViewSchedule(null)} 
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 p-4 bg-white overflow-hidden flex flex-col gap-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  ['Total sections', modalSummary.totalSections],
                  ['Scheduled subjects', modalSummary.totalScheduledSubjects],
                  ['Unassigned instructors', modalSummary.unassignedInstructors],
                  ['Schedule entries', modalSummary.totalScheduleEntries],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
                    <p className="text-lg font-black text-[#4e0a10] leading-tight">{value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 w-fit">
                  <button type="button" onClick={() => setModalViewMode('list')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${modalViewMode === 'list' ? 'bg-[#4e0a10] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                    <List size={14} />
                    List View
                  </button>
                  <button type="button" onClick={() => setModalViewMode('grid')} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${modalViewMode === 'grid' ? 'bg-[#4e0a10] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                    <CalendarDays size={14} />
                    Weekly Grid
                  </button>
                </div>

                {modalViewMode === 'grid' && (
                  <select value={selectedModalSectionId} onChange={(event) => setSelectedModalSectionId(event.target.value)} className="w-full md:w-64 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-[#C9952A]">
                    {modalSections.map((section) => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {modalSchedules.length === 0 ? (
                <div className="flex-1 min-h-[260px] flex items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 italic">
                  This department has no schedule entries.
                </div>
              ) : modalViewMode === 'list' ? (
                <div className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                  <div className="divide-y divide-gray-100">
                    {groupedModalSchedules.map(([sectionName, sectionSchedules]) => (
                      <div key={sectionName}>
                        <div className="sticky top-0 z-10 bg-gray-50 px-3 py-2 border-b border-gray-100">
                          <p className="text-xs font-black text-[#4e0a10]">{sectionName}</p>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {sectionSchedules.map((item) => (
                            <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_0.8fr_1fr_0.7fr] gap-2 px-3 py-2.5 text-xs">
                              <div className="min-w-0">
                                <p className="font-black text-gray-800 truncate">{item.subject?.subject_code ?? 'Subject'}</p>
                                <p className="text-gray-500 truncate">{item.subject?.subject_name ?? 'Untitled subject'}</p>
                              </div>
                              <div className="font-semibold text-gray-700">{item.day}, {formatTime24hTo12h(item.start_time)} - {formatTime24hTo12h(item.end_time)}</div>
                              <div className="text-gray-600 truncate">{getRoomName(item)}</div>
                              <div className={`truncate ${item.faculty_id ? 'text-gray-600' : 'text-red-500 font-semibold'}`}>{getInstructorName(item)}</div>
                              <div>
                                <span className="inline-flex rounded-full border border-[#C9952A]/30 bg-[#C9952A]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#4e0a10]">
                                  {getModeLabel(item.mode)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedSectionSchedules.length === 0 ? (
                <div className="flex-1 min-h-[260px] flex items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 italic">
                  The selected section has no schedule entries.
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col border border-gray-200 rounded-xl overflow-hidden w-full overflow-x-auto overscroll-contain">
                  <div className="grid grid-cols-[80px_repeat(6,1fr)] bg-gray-50 border-b border-gray-200 text-xs text-center font-bold text-gray-500 min-w-[750px] shrink-0">
                    <div className="bg-gray-50 border-r border-gray-200 p-2.5 sticky left-0 z-20 text-right pr-3">Time</div>
                    <div className="border-r border-gray-200 p-2.5">Mon</div>
                    <div className="border-r border-gray-200 p-2.5">Tue</div>
                    <div className="border-r border-gray-200 p-2.5">Wed</div>
                    <div className="border-r border-gray-200 p-2.5">Thu</div>
                    <div className="border-r border-gray-200 p-2.5">Fri</div>
                    <div className="p-2.5">Sat</div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-white min-w-[750px] relative">
                    <div className="grid grid-cols-[80px_repeat(6,1fr)] text-xs relative" style={{ gridTemplateRows: `repeat(${timeSlots.length}, ${APPROVAL_SLOT_HEIGHT_PX}px)` }}>
                      {timeSlots.map((slot, rowIndex) => {
                        const gridRow = rowIndex + 1;
                        return (
                          <React.Fragment key={rowIndex}>
                            {rowIndex % 2 === 0 && (
                              <div className="bg-gray-50 border-b border-r border-gray-200 p-1.5 text-[10px] font-bold text-gray-400 text-right sticky left-0 z-10 flex items-center justify-end pr-3" style={{ gridColumn: 1, gridRow: `${gridRow} / span 2`, height: `${APPROVAL_SLOT_HEIGHT_PX * 2}px` }}>
                                {slot}
                              </div>
                            )}
                            {Array.from({ length: 6 }).map((_, colIndex) => (
                              <div key={colIndex} className="border-b border-r border-gray-200 bg-white h-6" style={{ gridColumn: colIndex + 2, gridRowStart: gridRow, gridRowEnd: gridRow + 1 }} />
                            ))}
                          </React.Fragment>
                        );
                      })}
                      {selectedSectionSchedules.map((item) => {
                        const colMap: Record<string, number> = { Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6, Saturday: 7 };
                        const colIndex = colMap[item.day] ?? 2;
                        const startRow = getSlotIndexFrom24h(item.start_time) + 1;
                        const endRow = getSlotIndexFrom24h(item.end_time) + 1;
                        const cardHeight = (endRow - startRow) * APPROVAL_SLOT_HEIGHT_PX;
                        const showBottomRow = cardHeight > 80;
                        const colors = getDeptColorClasses(viewSchedule.department);
                        return (
                          <div key={item.id} className={`${colors.bg} ${colors.border} ${colors.text} border-2 border-l-[4px] ${colors.accent} p-2 rounded-xl shadow-sm overflow-hidden flex flex-col justify-between leading-snug box-border`} style={{ gridColumn: colIndex, gridRowStart: startRow, gridRowEnd: endRow, height: `${cardHeight}px`, zIndex: 5 }}>
                            <div className="min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-[10px] uppercase tracking-wide">{item.subject?.subject_code ?? 'Subject'}</span>
                                <span className="px-1 rounded-[3px] text-[8px] font-bold border uppercase tracking-wide shrink-0 bg-white/70 border-current">{getModeLabel(item.mode)}</span>
                              </div>
                              <p className="font-semibold text-[9px] truncate opacity-90">{item.subject?.subject_name ?? 'Untitled subject'}</p>
                              <p className="text-[9px] opacity-80 truncate">{getInstructorName(item)}</p>
                            </div>
                            {showBottomRow && (
                              <div className="flex justify-between items-center text-[9px] opacity-80 mt-1 font-semibold border-t border-black/5 pt-0.5">
                                <span className="truncate">{getRoomName(item)}</span>
                                <span className="shrink-0">{formatTime24hTo12h(item.start_time)} - {formatTime24hTo12h(item.end_time)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50/80 border-t border-gray-200/80 flex justify-between items-center">
              <div className="flex gap-2">
                {viewSchedule.status === 'submitted' && (
                  <>
                    <button 
                      onClick={() => {
                        handleApprove(viewSchedule);
                        setViewSchedule(null);
                      }}
                      className="px-4 py-2 bg-[#4e0a10] text-white rounded-xl hover:bg-[#C9952A] text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={() => {
                        handleReject(viewSchedule);
                        setViewSchedule(null);
                      }}
                      className="px-4 py-2 border border-red-500 text-red-500 bg-white rounded-xl hover:bg-red-50 text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
              <button 
                onClick={() => setViewSchedule(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-xl hover:bg-gray-50 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {approveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-[#C9952A]/10 text-[#C9952A] rounded-full flex items-center justify-center mx-auto border border-[#C9952A]/20">
                <Check size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-gray-800 font-display">Approve Schedule</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Are you sure you want to approve the complete department schedule for <strong>{approveConfirm.department}</strong>?
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setApproveConfirm(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer bg-white"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmApprove}
                  className="flex-1 px-4 py-2.5 bg-[#4e0a10] text-white rounded-xl hover:bg-[#C9952A] transition-colors text-xs font-semibold cursor-pointer"
                >
                  Confirm Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-gray-250 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-850 font-display">Reject Schedule</h3>
              <button 
                onClick={() => setRejectConfirm(null)}
                className="text-gray-400 hover:text-gray-650 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                Please provide a reason for returning the complete department schedule for <strong>{rejectConfirm.department}</strong>.
              </p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    setRejectError('');
                  }}
                  placeholder="Explain why this schedule is rejected..."
                  className={`w-full px-3 py-2 border rounded-xl focus:ring-2 outline-none text-xs bg-white resize-none transition-all ${
                    rejectError 
                      ? 'border-red-500 focus:ring-red-500' 
                      : 'border-gray-200 focus:ring-[#C9952A]'
                  }`}
                />
                {rejectError && <p className="text-xs text-red-500 mt-1 font-semibold">{rejectError}</p>}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setRejectConfirm(null)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer bg-white"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-xs font-semibold cursor-pointer"
                >
                  Confirm Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

