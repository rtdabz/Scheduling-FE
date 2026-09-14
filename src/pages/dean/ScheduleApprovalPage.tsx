import React, { useState, useMemo, useEffect } from 'react';
import { useLiveRevision } from '../../hooks/useLiveRefresh';
import {
  Eye,
  X,
  RefreshCw,
  List,
  CalendarDays,
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import TableActionButton from '../../components/ui/TableActionButton';
import api from '../../lib/api';
import DataTable from '../../components/ui/DataTable';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import { useToast } from '../../context/ToastContext';
import WeeklyTimetableGrid, { GRID_SLOT_HEIGHT_PX, WEEK_DAYS } from '../../components/scheduling/WeeklyTimetableGrid';
import { slotCount, timeToSlot } from '../../lib/timeGrid';
import ScheduleApprovalList from '../../components/scheduling/ScheduleApprovalList';
import type { ApprovalScheduleItem } from '../../components/scheduling/ScheduleApprovalList';
import ScheduleApprovalPreviewModal from '../../components/scheduling/ScheduleApprovalPreviewModal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import { splitSubmission } from '../../lib/approvalQueue';
import { mapInitialData, type InitialDataResponse, type SchedulerCacheData } from '../ClassSchedules/SchedulerPanel/hooks/initialDataMapper';
import type { SchedulePdfInput } from '../ClassSchedules/SchedulerPanel/schedulePdf';

interface ScheduleApproval {
  id: number;
  submissionId: number;
  /** A partially recalled submission yields two entries sharing one id. */
  entryKey: string;
  department: string;
  section: string;
  subjectsScheduled: number;
  submittedBy: string;
  submittedAt: string;
  deanReviewedAt: string | null;
  status: 'submitted' | 'approved_by_dean' | 'conditionally_approved' | 'rejected_by_dean' | 'approved' | 'rejected' | 'revision';
  mode: 'on-site' | 'online' | 'field';
  requestType: 'approval' | 'withdrawal' | 'revision';
  workflowSectionIds?: string[];
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
  semester_id: number | string;
}

interface RawSchedule extends ApprovalScheduleItem {
  id: number | string;
  department_id: number | string;
  section_id: number | string;
  course_id?: number | string;
  subject_id?: number | string;
  faculty_id?: number | string | null;
  semester_id: number | string;
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
    logo?: string | null;
  } | null;
  section?: {
    section_name?: string;
  } | null;
  course?: {
    course_code?: string;
    course_name?: string;
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

interface RawScheduleSubmissionSection extends RawSection {
  pivot?: { state?: 'included' | 'withdrawn' };
}

interface RawScheduleSubmission {
  id: number;
  department_id: number | string;
  semester_id: number | string;
  revision_number: number;
  status: 'pending_dean' | 'pending_vpaa' | 'approved' | 'withdrawn' | 'partially_withdrawn' | 'rejected_by_dean' | 'rejected_by_vpaa';
  submitted_at: string | null;
  dean_reviewed_at: string | null;
  approval_override?: boolean;
  sections: RawScheduleSubmissionSection[];
  submitter?: { name?: string } | null;
}

type DeanQueueTab = 'pending' | 'approved' | 'withdrawn' | 'rejected';

const getScheduleCourseCode = (s: RawSchedule) => s.course?.course_code ?? s.subject?.subject_code ?? 'Course';
const getScheduleCourseName = (s: RawSchedule) => s.course?.course_name ?? s.subject?.subject_name ?? 'Untitled course';
const getScheduleCourseId = (s: RawSchedule) => s.course_id ?? s.subject_id;

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

/** Aliased to the shared geometry so cards keep matching the rows they sit on. */
const APPROVAL_SLOT_HEIGHT_PX = GRID_SLOT_HEIGHT_PX;

interface ApprovalSemester {
  id: number | string;
  academic_year: string;
  semester: string;
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

const formatSectionSummary = (sections: RawSection[], sectionIds?: string[]): string => {
  const selectedIds = new Set(sectionIds ?? []);
  const visibleSections = selectedIds.size > 0
    ? sections.filter((section) => selectedIds.has(String(section.id)))
    : sections;

  if (visibleSections.length === 0) {
    return selectedIds.size > 0
      ? `${selectedIds.size} selected section${selectedIds.size !== 1 ? 's' : ''}`
      : 'No sections';
  }

  if (selectedIds.size === 0) {
    return `${visibleSections.length} section${visibleSections.length !== 1 ? 's' : ''}`;
  }

  return visibleSections.map((section) => section.section_name).join(', ');
};

const submissionDisplayStatus = (submission: RawScheduleSubmission): ScheduleApproval['status'] => {
  switch (submission.status) {
    case 'pending_dean': return 'submitted';
    case 'pending_vpaa': return submission.approval_override ? 'conditionally_approved' : 'approved_by_dean';
    case 'approved': return 'approved';
    case 'rejected_by_dean': return 'rejected_by_dean';
    case 'rejected_by_vpaa': return 'rejected';
    default: return 'revision';
  }
};

const scheduleStatusesForSubmission = (status: RawScheduleSubmission['status']): string[] => {
  switch (status) {
    case 'pending_dean': return ['submitted'];
    case 'pending_vpaa': return ['approved_by_dean', 'conditionally_approved'];
    case 'approved': return ['faculty_assignment', 'reassignment', 'finalized'];
    case 'withdrawn':
    case 'partially_withdrawn':
    case 'rejected_by_dean':
    case 'rejected_by_vpaa':
      return ['draft', 'completed', 'revision', 'rejected', 'rejected_by_dean', 'rejected_by_vpaa'];
    default: return [];
  }
};

const parseApiDate = (value: string): Date => {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
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

/**
 * Kept as a thin alias so the approval grid places cards on exactly the rows
 * WeeklyTimetableGrid drew. The local copy hardcoded a 07:00 opening and a
 * 30-minute slot, which silently disagreed with a reconfigured grid window.
 */
const getSlotIndexFrom24h = (timeStr: string): number => timeToSlot(timeStr);

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
  const { toast, confirm } = useToast();
  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
  const userDeptId = user?.department_id;
  const userDeptName = user?.department?.department_name;
  const userId = user?.id;
  const [schedules, setSchedules] = useState<ScheduleApproval[]>([]);
  const [rawSchedules, setRawSchedules] = useState<RawSchedule[]>([]);
  const [rawSections, setRawSections] = useState<RawSection[]>([]);
  const [, setActiveSemester] = useState<ApprovalSemester | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [selectedQueueTab, setSelectedQueueTab] = useState<DeanQueueTab>('pending');
  const [selectedStatus, setSelectedStatus] = useState('All Status');
  const [selectedMode, setSelectedMode] = useState('All Modes');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Modals state
  const [viewSchedule, setViewScheduleState] = useState<ScheduleApproval>(null as unknown as ScheduleApproval);
  const setViewSchedule = (value: ScheduleApproval | null) => setViewScheduleState(value as ScheduleApproval);
  const [approveConfirm, setApproveConfirm] = useState<ScheduleApproval | null>(null);
  const [approvalOverrideReason, setApprovalOverrideReason] = useState('');
  const [approvalOverrideError, setApprovalOverrideError] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  // The same mapped payload Print consumes, so the preview is the printed document.
  const [printSource, setPrintSource] = useState<SchedulerCacheData | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState<ScheduleApproval | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [modalViewMode, setModalViewMode] = useState<ModalViewMode>('list');
  const [selectedModalSectionId, setSelectedModalSectionId] = useState('');

  const liveRevision = useLiveRevision(['approvals', 'schedules']);

  useEffect(() => {
    const loadData = async () => {
      try {
        // A live refresh keeps the queue on screen while it reloads.
        if (liveRevision === 0) setIsLoading(true);
        const data = await (async () => {
          const response = await api.get<{
            active_semester: ApprovalSemester | null;
            sections: RawSection[];
            schedules: RawSchedule[];
            schedule_submissions: RawScheduleSubmission[];
          }>('/initial-data');
          const semester = response.data.active_semester;
          setPrintSource(mapInitialData(response.data as unknown as InitialDataResponse, { isVpaa: false, userDepartmentId: userDeptId ?? null }));

          let filteredSections = response.data.sections;
          if (semester) {
            filteredSections = filteredSections.filter((s) => Number(s.semester_id) === Number(semester.id));
          }

          let dbSchedules = response.data.schedules;
          if (semester) {
            dbSchedules = dbSchedules.filter((s) => Number(s.semester_id) === Number(semester.id));
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

          const mappedApprovals = response.data.schedule_submissions
            .filter((submission) => !semester || Number(submission.semester_id) === Number(semester.id))
            .filter((submission) => !userDeptId || Number(submission.department_id) === Number(userDeptId))
            .flatMap((rawSubmission) => {
              const deptSchedules = schedulesByDepartment[String(rawSubmission.department_id)] ?? [];
              return splitSubmission(rawSubmission, (sectionIds) => deptSchedules
                .filter((schedule) => sectionIds.includes(String(schedule.section_id)))
                .map((schedule) => String(schedule.status)));
            })
            .map(({ key, submission, sectionIds: workflowSectionIds }): ScheduleApproval => {
              const departmentId = String(submission.department_id);
              const deptSchedules = schedulesByDepartment[departmentId] ?? [];
              const allowedStatuses = new Set(scheduleStatusesForSubmission(submission.status));
              const visibleDeptSchedules = deptSchedules.filter((schedule) =>
                workflowSectionIds.includes(String(schedule.section_id))
                && allowedStatuses.has(String(schedule.status))
              );
              const firstSchedule = visibleDeptSchedules[0] ?? deptSchedules[0];
              const status = submissionDisplayStatus(submission);
              const requestType: ScheduleApproval['requestType'] = ['withdrawn', 'partially_withdrawn'].includes(submission.status)
                ? 'withdrawal'
                : submission.status.startsWith('rejected_')
                  ? 'revision'
                  : 'approval';

              return {
                id: Number(submission.department_id),
                submissionId: submission.id,
                entryKey: key,
                department: firstSchedule?.department?.department_name ?? userDeptName ?? '',
                section: formatSectionSummary(sectionsByDepartment[departmentId] ?? [], workflowSectionIds),
                subjectsScheduled: new Set(visibleDeptSchedules.map((schedule) => getScheduleCourseId(schedule))).size,
                submittedBy: submission.submitter?.name ?? 'Secretary',
                submittedAt: submission.submitted_at ?? '',
                deanReviewedAt: submission.dean_reviewed_at,
                status,
                mode: firstSchedule?.mode ?? 'on-site',
                requestType,
                workflowSectionIds,
              };
            });

          return {
            schedules: mappedApprovals,
            rawSchedules: dbSchedules,
            rawSections: filteredSections,
            activeSemester: semester,
          };
        })();

        setRawSchedules(data.rawSchedules);
        setRawSections(data.rawSections);
        setActiveSemester(data.activeSemester);
        setSchedules(data.schedules);
      } catch {
        toast.error('Load Failed', 'Could not load schedules for approval.');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [userDeptId, userDeptName, liveRevision]);

  const resetFilters = () => {
    setSelectedQueueTab('pending');
    setSelectedStatus('All Status');
    setSelectedMode('All Modes');
  };

  const submitApproval = async (sched: ScheduleApproval, overrideReason: string | null) => {
    const withTba = overrideReason !== null;
    const approvedStatus = withTba ? 'conditionally_approved' : 'approved_by_dean';
    try {
      const now = new Date().toISOString();
      await api.post(`/departments/${sched.id}/approve-by-dean`, withTba ? { override_room_tba: true, override_reason: overrideReason } : {});

      setSchedules((prev) =>
        prev.map((s) =>
          s.entryKey === sched.entryKey
            ? { ...s, status: approvedStatus, deanReviewedAt: now }
            : s
        )
      );
      setRawSchedules((prev) =>
        prev.map((s) =>
          Number(s.department_id) === Number(sched.id)
            && (sched.workflowSectionIds?.includes(String(s.section_id)) ?? true)
            && s.status === 'submitted'
            ? { ...s, status: approvedStatus, reviewed_by_dean: userId, reviewed_at_dean: now }
            : s
        )
      );
      invalidateCacheGroups('schedules', 'approvals', 'dashboards');

      toast.success('Success', `${sched.department} schedule has been approved successfully.`);
    } catch {
      toast.error('Error', 'Failed to approve schedule.');
    }
  };

  const handleApprove = async (sched: ScheduleApproval) => {
    const sectionIds = new Set(sched.workflowSectionIds ?? []);
    const hasTba = rawSchedules.some((row) =>
      Number(row.department_id) === Number(sched.id)
      && (sectionIds.size === 0 || sectionIds.has(String(row.section_id)))
      && row.mode === 'on-site'
      && !row.room
    );

    // A Room TBA approval has to collect a reason, which the shared confirm()
    // cannot; it opens the same ConfirmModal with the field inside instead.
    if (hasTba) {
      setApprovalOverrideReason('');
      setApprovalOverrideError('');
      setApproveConfirm(sched);
      return;
    }

    await confirm({
      title: 'Approve Schedule',
      message: `Are you sure you want to approve the complete department schedule for ${sched.department}?`,
      eyebrow: 'Approval Required',
      confirmLabel: 'Confirm Approve',
      variant: 'maroon',
      onConfirm: () => submitApproval(sched, null),
    });
  };

  const confirmConditionalApprove = async () => {
    if (!approveConfirm || isApproving) return;
    const reason = approvalOverrideReason.trim();
    if (reason.length < 3) {
      setApprovalOverrideError('Give a reason for approving with Room TBA.');
      return;
    }
    setIsApproving(true);
    try {
      await submitApproval(approveConfirm, reason);
    } finally {
      setIsApproving(false);
      setApproveConfirm(null);
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
            s.entryKey === rejectConfirm.entryKey
              ? { ...s, status: 'rejected_by_dean', deanReviewedAt: now }
              : s
          )
        );
        setRawSchedules((prev) =>
          prev.map((s) =>
            Number(s.department_id) === Number(rejectConfirm.id)
              && (rejectConfirm.workflowSectionIds?.includes(String(s.section_id)) ?? true)
              && s.status === 'submitted'
              ? { ...s, status: 'rejected_by_dean', rejection_reason: rejectReason, reviewed_by_dean: userId, reviewed_at_dean: now }
              : s
          )
        );
        invalidateCacheGroups('schedules', 'approvals', 'dashboards');

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
      const matchesQueueTab = selectedQueueTab === 'pending'
        ? s.status === 'submitted'
        : selectedQueueTab === 'approved'
          ? ['approved_by_dean', 'conditionally_approved', 'approved'].includes(s.status)
          : selectedQueueTab === 'withdrawn'
            ? s.requestType === 'withdrawal'
            : ['rejected', 'rejected_by_dean', 'revision'].includes(s.status) && s.requestType !== 'withdrawal';
      if (!matchesQueueTab) {
        return false;
      }

      let matchStatus = true;
      if (selectedStatus !== 'All Status') {
        if (selectedStatus === 'Pending Dean Approval') matchStatus = s.status === 'submitted';
        else if (selectedStatus === 'Pending VPAA Approval') matchStatus = s.status === 'approved_by_dean' || s.status === 'conditionally_approved';
        else if (selectedStatus === 'Approved') matchStatus = s.status === 'approved';
        else if (selectedStatus === 'Rejected') matchStatus = s.status === 'rejected' || s.status === 'rejected_by_dean' || s.status === 'revision';
      }

      let matchMode = true;
      if (selectedMode !== 'All Modes') {
        matchMode = s.mode === selectedMode.toLowerCase().replace(' ', '-');
      }
      
      return matchStatus && matchMode;
    });
  }, [schedules, selectedQueueTab, selectedStatus, selectedMode]);

  // Format date helper
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = parseApiDate(dateStr);
      return d.toLocaleDateString('en-US', { 
        timeZone: 'Asia/Manila',
        month: 'short', 
        day: '2-digit', 
        year: 'numeric' 
      }) + ' ' + d.toLocaleTimeString('en-US', { 
        timeZone: 'Asia/Manila',
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
      case 'conditionally_approved':
        return 'bg-amber-100 text-amber-800 border-amber-200/60';
      case 'rejected_by_dean':
        return 'bg-rose-100 text-rose-805 border-rose-200/60';
      case 'approved':
        return 'bg-emerald-100 text-emerald-850 border-emerald-200/60';
      case 'revision':
        return 'bg-orange-100 text-orange-800 border-orange-200/60';
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
      case 'conditionally_approved': return 'Conditional Approval';
      case 'rejected_by_dean': return 'Rejected by Dean';
      case 'approved': return 'Approved';
      case 'revision': return 'Under Revision';
      case 'rejected': return 'Rejected';
      default: return 'UNKNOWN';
    }
  };

  const getSectionName = (item: RawSchedule) => {
    return item.section?.section_name
      ?? rawSections.find((section) => String(section.id) === String(item.section_id))?.section_name
      ?? `Section ${item.section_id}`;
  };

  const getRoomName = (item: RawSchedule) => {
    if (item.mode === 'online') return 'Online';
    if (item.mode === 'field') return 'Field';
    if (!item.room) return 'Unassigned';
    if (item.room.room_code === 'ONLINE') return 'Online';
    if (item.room.room_code === 'FIELD') return 'Field';
    return item.room.room_code;
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

  /**
   * The approval grid renders the same 7:00 AM-8:30 PM window as every other
   * timetable. It used to build its own 7:00 AM-9:00 PM label list, so an
   * approver compared a 29-row grid against the 27-row builder grid the
   * schedule was actually created on.
   */
  const approvalSlotCount = useMemo(() => slotCount(), []);

  const modalSchedules = useMemo(() => {
    if (!viewSchedule) return [];
    const workflowSectionIds = new Set(viewSchedule.workflowSectionIds ?? []);
    const allowedStatuses = new Set(scheduleStatusesForSubmission(
      viewSchedule.requestType === 'approval'
        ? (viewSchedule.status === 'submitted' ? 'pending_dean' : viewSchedule.status === 'approved_by_dean' || viewSchedule.status === 'conditionally_approved' ? 'pending_vpaa' : 'approved')
        : viewSchedule.status === 'revision' ? 'rejected_by_dean' : 'withdrawn',
    ));
    return rawSchedules
      .filter((schedule) => (
        Number(schedule.department_id) === Number(viewSchedule.id)
        && (
          workflowSectionIds.size > 0
            ? workflowSectionIds.has(String(schedule.section_id))
            : viewSchedule.status === 'submitted'
              ? schedule.status === 'submitted'
              : true
        )
        && allowedStatuses.has(String(schedule.status))
      ))
      .sort((left, right) => (
        getSectionName(left).localeCompare(getSectionName(right))
        || (dayOrder[left.day] ?? 99) - (dayOrder[right.day] ?? 99)
        || left.start_time.localeCompare(right.start_time)
      ));
  }, [rawSchedules, rawSections, viewSchedule]);

  const modalSections = useMemo<ScheduleSectionOption[]>(() => {
    if (!viewSchedule) return [];
    const sectionMap = new Map<string, string>();
    const workflowSectionIds = new Set(viewSchedule.workflowSectionIds ?? []);

    rawSections
      .filter((section) => (
        Number(section.department_id) === Number(viewSchedule.id)
        && (
          workflowSectionIds.size === 0
          || workflowSectionIds.has(String(section.id))
        )
      ))
      .forEach((section) => sectionMap.set(String(section.id), section.section_name));

    modalSchedules.forEach((schedule) => {
      sectionMap.set(String(schedule.section_id), getSectionName(schedule));
    });

    return Array.from(sectionMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [modalSchedules, rawSections, viewSchedule]);

  const printInput = useMemo<SchedulePdfInput | null>(() => {
    if (!viewSchedule || !printSource) return null;
    const scheduleIds = new Set(modalSchedules.map((schedule) => String(schedule.id)));
    const sectionIds = new Set(modalSections.map((section) => section.id));
    const sections = printSource.sections.filter((section) => sectionIds.has(section.id));
    return {
      sections,
      allSchedules: printSource.schedules.filter((schedule) => scheduleIds.has(String(schedule.id))),
      selectedSectionId: sections[0]?.id ?? '',
      departments: printSource.departments,
      users: printSource.users,
      activeSemester: printSource.activeSemester,
    };
  }, [modalSchedules, modalSections, printSource, viewSchedule]);

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
    totalScheduledSubjects: new Set(modalSchedules.map((schedule) => String(getScheduleCourseId(schedule)))).size,
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
        header: 'Submitted',
        cell: info => <span className="text-gray-500 font-medium">{formatDate(info.getValue() as string)}</span>
      },
      {
        accessorKey: 'deanReviewedAt',
        header: 'Reviewed',
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
        id: 'actions',
        header: () => <div className="text-right">Actions</div>,
        enableSorting: false,
        cell: ({ row }) => {
          const sched = row.original;
          return (
            <div className="flex justify-end gap-1.5">
              {/* View Schedule Timetable */}
              <div className="relative group">
                <TableActionButton
                  label="View"
                  variant="view"
                  onClick={() => setViewSchedule(sched)}
                >
                  <Eye size={17} />
                </TableActionButton>
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-md">
                  View
                </span>
              </div>
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

  const requestTabs: Array<{ id: DeanQueueTab; label: string }> = [
    { id: 'pending', label: 'Pending Approval' },
    { id: 'approved', label: 'Schedule Approved' },
    { id: 'withdrawn', label: 'Recalled' },
    { id: 'rejected', label: 'Rejected' },
  ];

  const matchesQueueTab = (schedule: ScheduleApproval, tab: DeanQueueTab): boolean => tab === 'pending'
    ? schedule.status === 'submitted'
    : tab === 'approved'
      ? ['approved_by_dean', 'conditionally_approved', 'approved'].includes(schedule.status)
      : tab === 'withdrawn'
        ? schedule.requestType === 'withdrawal'
        : ['rejected', 'rejected_by_dean', 'revision'].includes(schedule.status) && schedule.requestType !== 'withdrawal';

  const requestCounts = requestTabs.reduce<Record<DeanQueueTab, number>>((counts, tab) => {
    counts[tab.id] = schedules.filter((schedule) => matchesQueueTab(schedule, tab.id)).length;
    return counts;
  }, { pending: 0, approved: 0, withdrawn: 0, rejected: 0 });

  return (
    <div className="relative">
      <div id="schedule-approval-tabs" className="mb-4 flex flex-wrap gap-2 rounded-2xl border border-gray-150/70 bg-white p-2 shadow-sm">
        {requestTabs.map((tab) => {
          const active = selectedQueueTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedQueueTab(tab.id);
                setPagination((prev) => ({ ...prev, pageIndex: 0 }));
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors ${
                active
                  ? 'bg-[#4e0a10] text-white shadow-sm'
                  : 'bg-gray-50 text-gray-600 hover:bg-[#4e0a10]/5 hover:text-[#4e0a10]'
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                {requestCounts[tab.id]}
              </span>
            </button>
          );
        })}
      </div>
      {/* Filter Row */}
      <div id="schedule-approval-filters" className="bg-white p-5 rounded-2xl border border-gray-300 shadow-md flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <select 
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPagination(prev => ({ ...prev, pageIndex: 0 }));
            }}
            className="px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
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
            className="px-3.5 py-2.5 border border-gray-300 rounded-xl outline-none text-xs bg-white text-gray-800 font-sans font-bold focus:ring-1 focus:ring-[#5A1220] focus:border-[#5A1220] cursor-pointer hover:border-gray-400 transition-colors"
          >
            <option value="All Modes">All Modes</option>
            <option value="On-Site">On-Site</option>
            <option value="Online">Online</option>
            <option value="Field">Field</option>
          </select>
        </div>

        <button 
          onClick={resetFilters}
          className="px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-xs font-bold transition-all duration-200 cursor-pointer"
        >
          Reset Filters
        </button>
      </div>

      {/* Table Card wrapper */}
      <div id="schedule-approval-list">
        <DataTable
          table={table}
          isLoading={isLoading}
          totalLabel="schedules"
          ariaLabel="Schedule submissions"
          emptyTitle="No schedules found."
          emptyDescription="Adjust your status or mode filters and try again."
          cellClassName={(columnId) => (['subjectsScheduled', 'submittedAt', 'deanReviewedAt', 'status', 'actions'].includes(columnId) ? 'whitespace-nowrap' : '')}
        />
      </div>

      {/* View Weekly Timetable Modal */}
      {viewSchedule && (
        <ScheduleApprovalPreviewModal
          open={Boolean(viewSchedule)}
          title={`${viewSchedule.department} Department Schedule`}
          status={viewSchedule.status === 'submitted' ? 'pending' : viewSchedule.status.includes('reject') ? 'rejected' : 'approved'}
          statusLabel={getStatusLabel(viewSchedule.status)}
          printInput={printInput}
          canAct={viewSchedule.status === 'submitted' && viewSchedule.requestType === 'approval'}
          onApprove={() => { handleApprove(viewSchedule); setViewSchedule(null); }}
          onReject={() => { handleReject(viewSchedule); setViewSchedule(null); }}
          onClose={() => setViewSchedule(null)}
        />
      )}
      {viewSchedule ? false && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-200">
          <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-200/80 flex justify-between items-center bg-gray-50/50">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-[#1A1410] font-display">
                    {viewSchedule!.department} Department Schedule
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider ${getStatusBadge(viewSchedule.status)}`}>
                    {getStatusLabel(viewSchedule!.status)}
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
                      <ScheduleApprovalList
                        key={sectionName}
                        sectionName={sectionName}
                        schedules={sectionSchedules}
                        getCourseCode={getScheduleCourseCode}
                        getCourseName={getScheduleCourseName}
                        getRoomName={getRoomName}
                        getInstructorName={getInstructorName}
                        getModeLabel={getModeLabel}
                        formatTime={formatTime24hTo12h}
                      />
                    ))}
                  </div>
                </div>
              ) : selectedSectionSchedules.length === 0 ? (
                <div className="flex-1 min-h-[260px] flex items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400 italic">
                  The selected section has no schedule entries.
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-auto overscroll-contain w-full">
                    <WeeklyTimetableGrid
                      days={WEEK_DAYS}
                      slotCount={approvalSlotCount}
                      slotHeight={APPROVAL_SLOT_HEIGHT_PX}
                      minWidth={750}
                      getDayCount={(dayIndex) => selectedSectionSchedules.filter((item) => item.day === WEEK_DAYS[dayIndex]).length}
                    >
                      {selectedSectionSchedules.map((item) => {
                        const colMap: Record<string, number> = { Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6, Saturday: 7, Sunday: 8 };
                        const colIndex = colMap[item.day] ?? 2;
                        const startRow = getSlotIndexFrom24h(item.start_time) + 2;
                        const endRow = getSlotIndexFrom24h(item.end_time) + 2;
                        const cardHeight = (endRow - startRow) * APPROVAL_SLOT_HEIGHT_PX;
                        const showBottomRow = cardHeight > 80;
                        const colors = getDeptColorClasses(viewSchedule!.department);
                        return (
                          <div key={item.id} className={`${colors.bg} ${colors.border} ${colors.text} border-2 border-l-[4px] ${colors.accent} p-2 rounded-xl shadow-sm overflow-hidden flex flex-col justify-between leading-snug box-border`} style={{ gridColumn: colIndex, gridRowStart: startRow, gridRowEnd: endRow, height: `${cardHeight}px`, zIndex: 5 }}>
                            <div className="min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-[11px] uppercase tracking-wide">{getScheduleCourseCode(item)}</span>
                                <span className="px-1 rounded-[3px] text-[8px] font-bold border uppercase tracking-wide shrink-0 bg-white/70 border-current">{getModeLabel(item.mode)}</span>
                              </div>
                              <p className="font-semibold text-[9px] truncate opacity-90">{getScheduleCourseName(item)}</p>
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
                    </WeeklyTimetableGrid>
                </div>
              )}
            </div>

            <div className="p-3 bg-gray-50/80 border-t border-gray-200/80 flex justify-between items-center">
              <div className="flex gap-2">
                {viewSchedule!.status === 'submitted' && viewSchedule!.requestType === 'approval' && (
                  <>
                    <button 
                      onClick={() => {
                        handleApprove(viewSchedule!);
                        setViewSchedule(null);
                      }}
                      className="px-4 py-2 bg-[#4e0a10] text-white rounded-xl hover:bg-[#C9952A] text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={() => {
                        handleReject(viewSchedule!);
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
      ) : null}

      {/* Room TBA approval: the shared confirmation modal, with the reason it must collect. */}
      <ConfirmModal
        isOpen={approveConfirm !== null}
        title="Approve Schedule"
        eyebrow="Conditional Approval"
        message={`Are you sure you want to approve the complete department schedule for ${approveConfirm?.department ?? ''}?`}
        confirmLabel="Confirm Approve"
        variant="maroon"
        isConfirming={isApproving}
        onCancel={() => { if (!isApproving) setApproveConfirm(null); }}
        onConfirm={confirmConditionalApprove}
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left">
          <p className="text-xs font-bold text-amber-800">Room TBA entries detected</p>
          <p className="mt-1 text-xs text-amber-700">This will be a conditional approval. Assign all laboratory rooms before finalization.</p>
          <textarea
            value={approvalOverrideReason}
            onChange={(e) => { setApprovalOverrideReason(e.target.value); setApprovalOverrideError(''); }}
            rows={3}
            placeholder="Reason for approving with Room TBA"
            className={`mt-2 w-full rounded-lg border bg-white p-2 text-xs ${approvalOverrideError ? 'border-red-500' : 'border-amber-200'}`}
          />
          {approvalOverrideError && <p className="mt-1 text-xs font-semibold text-red-600">{approvalOverrideError}</p>}
        </div>
      </ConfirmModal>

      {/* Reject Reason Modal */}
      {rejectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
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

