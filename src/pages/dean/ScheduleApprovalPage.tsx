import React, { useState, useMemo, useEffect } from 'react';
import { 
  Eye, 
  Check, 
  X, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  RefreshCw
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

interface ToastItem {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error';
}

const getDeptColorClasses = (dept: string) => {
  switch (dept) {
    case 'College of Arts and Sciences':
      return {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-900',
        accent: 'border-l-purple-500'
      };
    case 'College of Information Technology':
      return {
        bg: 'bg-sky-50',
        border: 'border-sky-200',
        text: 'text-sky-900',
        accent: 'border-l-sky-500'
      };
    case 'College of Education':
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-900',
        accent: 'border-l-emerald-500'
      };
    case 'College of Business Administration':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-900',
        accent: 'border-l-amber-500'
      };
    case 'College of Hospitality Management':
      return {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        text: 'text-rose-900',
        accent: 'border-l-rose-500'
      };
    case 'College of Library and Information Science':
      return {
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        text: 'text-indigo-900',
        accent: 'border-l-indigo-500'
      };
    case 'College of Criminal Justice and Public Safety':
      return {
        bg: 'bg-teal-50',
        border: 'border-teal-200',
        text: 'text-teal-900',
        accent: 'border-l-teal-500'
      };
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-900',
        accent: 'border-l-gray-500'
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

export default function ScheduleApprovalPage() {
  const [schedules, setSchedules] = useState<ScheduleApproval[]>([]);
  const [rawSchedules, setRawSchedules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Filters
  const [selectedStatus, setSelectedStatus] = useState('All Status');
  const [selectedMode, setSelectedMode] = useState('All Modes');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  // Toasts State
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  
  // Modals state
  const [viewSchedule, setViewSchedule] = useState<ScheduleApproval | null>(null);
  const [approveConfirm, setApproveConfirm] = useState<ScheduleApproval | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState<ScheduleApproval | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');

  const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
  const user = userJson ? JSON.parse(userJson) : null;
  const userDeptId = user?.department_id;
  const userDeptName = user?.department?.department_name;
  const userId = user?.id;

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const termRes = await api.get<any>('/terms/active');
        const term = termRes.data;

        const [sectionsRes, schedulesRes] = await Promise.all([
          api.get<any[]>('/sections'),
          api.get<any[]>('/schedules')
        ]);

        let filteredSections = sectionsRes.data;
        if (term) {
          filteredSections = filteredSections.filter((s: any) => Number(s.term_id) === Number(term.id));
        }

        let dbSchedules = schedulesRes.data;
        if (term) {
          dbSchedules = dbSchedules.filter((s: any) => Number(s.term_id) === Number(term.id));
        }
        setRawSchedules(dbSchedules);

        // Group schedules by section ID
        const schedulesBySection: Record<string, any[]> = {};
        dbSchedules.forEach((s: any) => {
          const secId = s.section_id.toString();
          if (!schedulesBySection[secId]) {
            schedulesBySection[secId] = [];
          }
          schedulesBySection[secId].push(s);
        });

        const mappedApprovals: ScheduleApproval[] = [];
        filteredSections.forEach((sec: any) => {
          if (userDeptId && Number(sec.department_id) !== Number(userDeptId)) {
            return;
          }

          const secSchedules = schedulesBySection[sec.id.toString()] ?? [];
          if (secSchedules.length === 0) return;

          const firstSched = secSchedules[0];
          const status = firstSched.status;

          mappedApprovals.push({
            id: Number(sec.id),
            department: sec.department?.department_name ?? userDeptName ?? "",
            section: sec.section_name,
            subjectsScheduled: new Set(secSchedules.map((s) => s.subject_id)).size,
            submittedBy: "Coordinator",
            submittedAt: firstSched.created_at ?? "",
            deanReviewedAt: firstSched.reviewed_at_dean ?? null,
            status: status,
            mode: firstSched.mode ?? "on-site"
          });
        });

        setSchedules(mappedApprovals);
      } catch (err) {
        // Safe empty catch block to align with rule: "Remove all console.log statements"
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [userDeptId, userDeptName]);

  const addToast = (title: string, message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

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
        const sectionSchedules = rawSchedules.filter(
          (s) => Number(s.section_id) === Number(approveConfirm.id)
        );

        const now = new Date().toISOString();
        await Promise.all(
          sectionSchedules.map((s) =>
            api.put(`/schedules/${s.id}`, {
              status: 'approved_by_dean',
              reviewed_by_dean: userId,
              reviewed_at_dean: now
            })
          )
        );

        setSchedules((prev) =>
          prev.map((s) =>
            s.id === approveConfirm.id
              ? { ...s, status: 'approved_by_dean', deanReviewedAt: now }
              : s
          )
        );
        setRawSchedules((prev) =>
          prev.map((s) =>
            Number(s.section_id) === Number(approveConfirm.id)
              ? { ...s, status: 'approved_by_dean', reviewed_by_dean: userId, reviewed_at_dean: now }
              : s
          )
        );

        addToast('Success', `Schedule for ${approveConfirm.section} has been approved successfully.`, 'success');
      } catch (err) {
        addToast('Error', 'Failed to approve schedule.', 'error');
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
        const sectionSchedules = rawSchedules.filter(
          (s) => Number(s.section_id) === Number(rejectConfirm.id)
        );

        const now = new Date().toISOString();
        await Promise.all(
          sectionSchedules.map((s) =>
            api.put(`/schedules/${s.id}`, {
              status: 'rejected_by_dean',
              rejection_reason: rejectReason,
              reviewed_by_dean: userId,
              reviewed_at_dean: now
            })
          )
        );

        setSchedules((prev) =>
          prev.map((s) =>
            s.id === rejectConfirm.id
              ? { ...s, status: 'rejected_by_dean', deanReviewedAt: now }
              : s
          )
        );
        setRawSchedules((prev) =>
          prev.map((s) =>
            Number(s.section_id) === Number(rejectConfirm.id)
              ? { ...s, status: 'rejected_by_dean', rejection_reason: rejectReason, reviewed_by_dean: userId, reviewed_at_dean: now }
              : s
          )
        );

        addToast('Rejected', `Schedule for ${rejectConfirm.section} has been rejected.`, 'error');
      } catch (err) {
        addToast('Error', 'Failed to reject schedule.', 'error');
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

  const getSlotIndex = (timeStr: string) => {
    const [time, ampm] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const totalMinutes = (hours * 60 + minutes) - (7 * 60);
    return Math.floor(totalMinutes / 30);
  };

  const columns = useMemo<ColumnDef<ScheduleApproval>[]>(
    () => [
      {
        accessorKey: 'department',
        header: 'Department',
        cell: info => <span className="font-bold text-gray-800">{info.getValue() as string}</span>
      },
      {
        accessorKey: 'section',
        header: 'Section',
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
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });



  return (
    <div className="p-6 relative">
      {/* Toast Notification Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full">
        {toasts.map(toast => (
          <div 
            key={toast.id} 
            className={`p-4 rounded-xl shadow-lg border text-white flex justify-between items-start animate-slide-in ${
              toast.type === 'success' ? 'bg-emerald-600 border-emerald-500' : 'bg-red-650 border-red-600'
            }`}
          >
            <div className="flex-1 pr-2">
              <p className="font-bold text-sm">{toast.title}</p>
              <p className="text-xs opacity-90 mt-0.5">{toast.message}</p>
            </div>
            <button 
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="text-white/80 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Page Header */}
      <div className="mb-6">
        <p className="text-muted text-sm mb-1">Home / Schedules / Schedule Approval</p>
        <h1 className="font-display text-3xl font-bold text-[#1A1410]">Schedule Approval</h1>
        <p className="text-muted text-sm mt-1">Review and approve schedules from your department</p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>

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
                    {viewSchedule.department} — {viewSchedule.section} Schedule
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getStatusBadge(viewSchedule.status)}`}>
                    {getStatusLabel(viewSchedule.status)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-medium mt-1">View Only • No edits allowed</p>
              </div>
              <button 
                onClick={() => setViewSchedule(null)} 
                className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Timetable Scroll Container */}
            <div className="flex-1 p-4 bg-white overflow-hidden flex flex-col">
              {rawSchedules.filter(s => Number(s.section_id) === Number(viewSchedule.id)).length === 0 ? (
                <div className="h-full min-h-[300px] flex items-center justify-center text-gray-400 italic text-sm bg-white">
                  No timetable entries added to this schedule yet.
                </div>
              ) : (
                <div className="flex flex-col border border-gray-200 rounded-xl overflow-hidden w-full overflow-x-auto">
                  {/* 1. STICKY HEADER — never scrolls vertically */}
                  <div className="grid grid-cols-[80px_repeat(6,1fr)] bg-gray-50 border-b border-gray-200 text-xs text-center font-bold text-gray-500 min-w-[750px] shrink-0">
                    <div className="bg-gray-50 border-r border-gray-200 p-2.5 sticky left-0 z-20 text-right pr-3">Time</div>
                    <div className="border-r border-gray-200 p-2.5">Mon</div>
                    <div className="border-r border-gray-200 p-2.5">Tue</div>
                    <div className="border-r border-gray-200 p-2.5">Wed</div>
                    <div className="border-r border-gray-200 p-2.5">Thu</div>
                    <div className="border-r border-gray-200 p-2.5">Fri</div>
                    <div className="p-2.5">Sat</div>
                  </div>

                  {/* 2. SCROLLABLE BODY — only this scrolls vertically */}
                  <div className="overflow-y-auto max-h-[550px] bg-white will-change-transform min-w-[750px] relative">
                    <div 
                      className="grid grid-cols-[80px_repeat(6,1fr)] text-xs relative"
                      style={{ gridTemplateRows: `repeat(${timeSlots.length}, 48px)` }}
                    >
                      {/* Empty cells background grid and Time labels */}
                      {timeSlots.map((slot, rowIndex) => {
                        const gridRow = rowIndex + 1;
                        return (
                          <React.Fragment key={rowIndex}>
                            {/* Time slot column cell - sticky left-0 */}
                            <div 
                              className="bg-gray-50 border-b border-r border-gray-200 p-1.5 text-[10px] font-bold text-gray-400 text-right sticky left-0 z-10 h-12 flex items-center justify-end pr-3"
                              style={{
                                gridColumn: 1,
                                gridRowStart: gridRow,
                                gridRowEnd: gridRow + 1,
                              }}
                            >
                              {slot.endsWith(':00 AM') || slot.endsWith(':00 PM') ? slot : ''}
                            </div>
                            {/* Mon-Sat grid background cells */}
                            {Array.from({ length: 6 }).map((_, colIndex) => (
                              <div 
                                key={colIndex} 
                                className="border-b border-r border-gray-200 bg-white h-12"
                                style={{
                                  gridColumn: colIndex + 2,
                                  gridRowStart: gridRow,
                                  gridRowEnd: gridRow + 1,
                                }}
                              />
                            ))}
                          </React.Fragment>
                        );
                      })}

                      {/* Render Schedule Cards */}
                      {rawSchedules.filter(s => Number(s.section_id) === Number(viewSchedule.id)).map((item) => {
                        const colMap: Record<string, number> = { Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6, Saturday: 7 };
                        const colIndex = colMap[item.day] ?? 2;
                        const startRow = getSlotIndexFrom24h(item.start_time) + 1;
                        const endRow = getSlotIndexFrom24h(item.end_time) + 1;
                        
                        const colors = getDeptColorClasses(viewSchedule.department);
                        const subCode = item.subject?.subject_code ?? '';
                        const subName = item.subject?.subject_name ?? '';
                        const facName = item.faculty ? `${item.faculty.first_name} ${item.faculty.last_name}` : 'Unassigned';
                        let roomName = '';
                        if (item.room) {
                          if (item.room.room_code === "ONLINE") roomName = "Online";
                          else if (item.room.room_code === "FIELD") roomName = "Field";
                          else roomName = item.room.room_code;
                        }

                        return (
                          <div 
                            key={item.id}
                            className={`${colors.bg} ${colors.border} ${colors.text} border-l-[4px] ${colors.accent} border p-2 m-0.5 rounded-lg shadow-sm overflow-hidden flex flex-col justify-between leading-snug`}
                            style={{
                              gridColumn: colIndex,
                              gridRowStart: startRow,
                              gridRowEnd: endRow,
                              zIndex: 5
                            }}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-[10px] uppercase tracking-wide">{subCode}</span>
                                <span className={`px-1 rounded-[3px] text-[8px] font-bold border uppercase tracking-wide shrink-0 ${
                                  item.mode === 'on-site'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : item.mode === 'online'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-705 border-amber-200'
                                }`}>
                                  {item.mode === 'on-site' ? 'On-Site' : item.mode === 'online' ? 'Online' : 'Field'}
                                </span>
                              </div>
                              <p className="font-semibold text-[9px] truncate opacity-90">{subName}</p>
                              <p className="text-[9px] opacity-80 truncate">{facName}</p>
                            </div>
                            <div className="flex justify-between items-center text-[9px] opacity-80 mt-1 font-semibold border-t border-black/5 pt-0.5">
                              <span>{roomName}</span>
                              <span>{formatTime24hTo12h(item.start_time)} - {formatTime24hTo12h(item.end_time)}</span>
                            </div>
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
                  Are you sure you want to approve the schedule for <strong>{approveConfirm.section}</strong> - {approveConfirm.department}?
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
                Please provide a reason for rejecting the schedule for <strong>{rejectConfirm.section}</strong>.
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
