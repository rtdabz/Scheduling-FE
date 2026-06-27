import React, { useState, useMemo } from 'react';
import { 
  Eye, 
  Check, 
  X, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown 
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

interface TimetableItem {
  id: number;
  subjectCode: string;
  section: string;
  faculty: string;
  room: string;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
  startTime: string; 
  endTime: string;   
  mode: 'on-site' | 'online' | 'field';
}

interface ToastItem {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error';
}

const MOCK_SCHEDULE_APPROVALS: ScheduleApproval[] = [
  { id: 1, department: 'College of Arts and Sciences', section: 'AB-COMM 3A', subjectsScheduled: 5, submittedBy: 'Sarah Jenkins', submittedAt: '2025-06-25T08:30:00Z', deanReviewedAt: '2025-06-25T14:20:00Z', status: 'approved_by_dean', mode: 'on-site' },
  { id: 2, department: 'College of Information Technology', section: 'BSIT 4A', subjectsScheduled: 5, submittedBy: 'Maria Santos', submittedAt: '2025-06-26T09:15:00Z', deanReviewedAt: '2025-06-26T16:00:00Z', status: 'approved_by_dean', mode: 'online' },
  { id: 3, department: 'College of Education', section: 'BSEd 2B', subjectsScheduled: 4, submittedBy: 'John Smith', submittedAt: '2025-06-24T10:00:00Z', deanReviewedAt: null, status: 'submitted', mode: 'on-site' },
  { id: 4, department: 'College of Business Administration', section: 'BSBA 1C', subjectsScheduled: 4, submittedBy: 'Emily Watson', submittedAt: '2025-06-23T11:45:00Z', deanReviewedAt: '2025-06-24T09:00:00Z', status: 'rejected_by_dean', mode: 'on-site' },
  { id: 5, department: 'College of Hospitality Management', section: 'BSHM 4B', subjectsScheduled: 2, submittedBy: 'Robert Davis', submittedAt: '2025-06-22T14:00:00Z', deanReviewedAt: '2025-06-22T17:30:00Z', status: 'approved', mode: 'on-site' },
  { id: 6, department: 'College of Library and Information Science', section: 'BLIS 3A', subjectsScheduled: 2, submittedBy: 'Alice Cooper', submittedAt: '2025-06-21T09:00:00Z', deanReviewedAt: '2025-06-21T12:00:00Z', status: 'rejected', mode: 'online' },
  { id: 7, department: 'College of Criminal Justice and Public Safety', section: 'BSCRIM 3B', subjectsScheduled: 3, submittedBy: 'Frank Castle', submittedAt: '2025-06-20T08:00:00Z', deanReviewedAt: '2025-06-20T11:00:00Z', status: 'approved_by_dean', mode: 'on-site' },
  { id: 8, department: 'College of Information Technology', section: 'BSCS 3A', subjectsScheduled: 5, submittedBy: 'Maria Santos', submittedAt: '2025-06-19T10:30:00Z', deanReviewedAt: null, status: 'submitted', mode: 'on-site' }
];

const MOCK_TIMETABLE_ITEMS: Record<string, TimetableItem[]> = {
  'AB-COMM 3A': [
    { id: 1, subjectCode: 'COMM311', section: 'AB-COMM 3A', faculty: 'Dr. Evelyn Carter', room: 'RM201', day: 'Mon', startTime: '08:00 AM', endTime: '10:00 AM', mode: 'on-site' },
    { id: 2, subjectCode: 'COMM311', section: 'AB-COMM 3A', faculty: 'Dr. Evelyn Carter', room: 'RM201', day: 'Wed', startTime: '08:00 AM', endTime: '10:00 AM', mode: 'on-site' },
    { id: 3, subjectCode: 'COMM312', section: 'AB-COMM 3A', faculty: 'Prof. Marcus Aurelius', room: 'RM203', day: 'Tue', startTime: '10:30 AM', endTime: '12:30 PM', mode: 'online' },
    { id: 4, subjectCode: 'COMM312', section: 'AB-COMM 3A', faculty: 'Prof. Marcus Aurelius', room: 'RM203', day: 'Thu', startTime: '10:30 AM', endTime: '12:30 PM', mode: 'online' },
    { id: 5, subjectCode: 'COMM313', section: 'AB-COMM 3A', faculty: 'Dr. Evelyn Carter', room: 'Lab A', day: 'Fri', startTime: '01:00 PM', endTime: '04:00 PM', mode: 'on-site' }
  ],
  'BSIT 4A': [
    { id: 1, subjectCode: 'IT411', section: 'BSIT 4A', faculty: 'Prof. Sarah Jenkins', room: 'CL1', day: 'Mon', startTime: '08:00 AM', endTime: '09:30 AM', mode: 'on-site' },
    { id: 2, subjectCode: 'IT411', section: 'BSIT 4A', faculty: 'Prof. Sarah Jenkins', room: 'CL1', day: 'Wed', startTime: '08:00 AM', endTime: '09:30 AM', mode: 'on-site' },
    { id: 3, subjectCode: 'IT412', section: 'BSIT 4A', faculty: 'Engr. Perez', room: 'CL2', day: 'Tue', startTime: '10:00 AM', endTime: '12:00 PM', mode: 'online' },
    { id: 4, subjectCode: 'IT412', section: 'BSIT 4A', faculty: 'Engr. Perez', room: 'CL2', day: 'Thu', startTime: '10:00 AM', endTime: '12:00 PM', mode: 'online' },
    { id: 5, subjectCode: 'IT413', section: 'BSIT 4A', faculty: 'Dr. John Smith', room: 'RM301', day: 'Fri', startTime: '01:00 PM', endTime: '04:00 PM', mode: 'on-site' }
  ],
  'BSEd 2B': [
    { id: 1, subjectCode: 'EDUC211', section: 'BSEd 2B', faculty: 'Dr. Emily Watson', room: 'RM102', day: 'Mon', startTime: '09:00 AM', endTime: '11:00 AM', mode: 'on-site' },
    { id: 2, subjectCode: 'EDUC211', section: 'BSEd 2B', faculty: 'Dr. Emily Watson', room: 'RM102', day: 'Wed', startTime: '09:00 AM', endTime: '11:00 AM', mode: 'on-site' },
    { id: 3, subjectCode: 'EDUC212', section: 'BSEd 2B', faculty: 'Prof. Alan Vance', room: 'RM104', day: 'Tue', startTime: '02:00 PM', endTime: '04:00 PM', mode: 'online' },
    { id: 4, subjectCode: 'EDUC212', section: 'BSEd 2B', faculty: 'Prof. Alan Vance', room: 'RM104', day: 'Thu', startTime: '02:00 PM', endTime: '04:00 PM', mode: 'online' }
  ],
  'BSBA 1C': [
    { id: 1, subjectCode: 'BMG101', section: 'BSBA 1C', faculty: 'Dean Robert Davis', room: 'RM305', day: 'Mon', startTime: '08:00 AM', endTime: '10:00 AM', mode: 'on-site' },
    { id: 2, subjectCode: 'BMG101', section: 'BSBA 1C', faculty: 'Dean Robert Davis', room: 'RM305', day: 'Wed', startTime: '08:00 AM', endTime: '10:00 AM', mode: 'on-site' },
    { id: 3, subjectCode: 'ACT101', section: 'BSBA 1C', faculty: 'Mrs. Jane Lin', room: 'RM307', day: 'Tue', startTime: '01:00 PM', endTime: '03:00 PM', mode: 'online' },
    { id: 4, subjectCode: 'ACT101', section: 'BSBA 1C', faculty: 'Mrs. Jane Lin', room: 'RM307', day: 'Thu', startTime: '01:00 PM', endTime: '03:00 PM', mode: 'online' }
  ],
  'BSHM 4B': [
    { id: 1, subjectCode: 'HM401', section: 'BSHM 4B', faculty: 'Chef Robert Davis', room: 'Kitchen Lab', day: 'Tue', startTime: '08:00 AM', endTime: '12:00 PM', mode: 'on-site' },
    { id: 2, subjectCode: 'HM402', section: 'BSHM 4B', faculty: 'Chef Robert Davis', room: 'Bar Area', day: 'Thu', startTime: '01:00 PM', endTime: '05:00 PM', mode: 'on-site' }
  ],
  'BLIS 3A': [
    { id: 1, subjectCode: 'LIS301', section: 'BLIS 3A', faculty: 'Mrs. Clara Croft', room: 'Library A', day: 'Wed', startTime: '10:00 AM', endTime: '12:00 PM', mode: 'on-site' },
    { id: 2, subjectCode: 'LIS302', section: 'BLIS 3A', faculty: 'Mrs. Clara Croft', room: 'Library B', day: 'Fri', startTime: '02:00 PM', endTime: '04:00 PM', mode: 'online' }
  ],
  'BSCRIM 3B': [
    { id: 1, subjectCode: 'CRIM311', section: 'BSCRIM 3B', faculty: 'Dr. Alan Walker', room: 'Gym', day: 'Mon', startTime: '07:00 AM', endTime: '10:00 AM', mode: 'on-site' },
    { id: 2, subjectCode: 'CRIM312', section: 'BSCRIM 3B', faculty: 'Dean Frank Castle', room: 'RM101', day: 'Wed', startTime: '01:00 PM', endTime: '03:30 PM', mode: 'on-site' },
    { id: 3, subjectCode: 'CRIM313', section: 'BSCRIM 3B', faculty: 'Dean Frank Castle', room: 'Firing Range', day: 'Sat', startTime: '09:00 AM', endTime: '12:00 PM', mode: 'on-site' }
  ],
  'BSCS 3A': [
    { id: 1, subjectCode: 'CS311', section: 'BSCS 3A', faculty: 'Dr. Juan dela Cruz', room: 'CL1', day: 'Mon', startTime: '10:30 AM', endTime: '12:30 PM', mode: 'on-site' },
    { id: 2, subjectCode: 'CS311', section: 'BSCS 3A', faculty: 'Dr. Juan dela Cruz', room: 'CL1', day: 'Wed', startTime: '10:30 AM', endTime: '12:30 PM', mode: 'on-site' },
    { id: 3, subjectCode: 'CS312', section: 'BSCS 3A', faculty: 'Mr. David Cole', room: 'CL2', day: 'Tue', startTime: '08:00 AM', endTime: '10:00 AM', mode: 'online' },
    { id: 4, subjectCode: 'CS312', section: 'BSCS 3A', faculty: 'Mr. David Cole', room: 'CL2', day: 'Thu', startTime: '08:00 AM', endTime: '10:00 AM', mode: 'online' },
    { id: 5, subjectCode: 'CS313', section: 'BSCS 3A', faculty: 'Dr. Juan dela Cruz', room: 'RM303', day: 'Fri', startTime: '09:00 AM', endTime: '12:00 PM', mode: 'on-site' }
  ]
};

const DEPARTMENTS = [
  'College of Arts and Sciences',
  'College of Information Technology',
  'College of Education',
  'College of Business Administration',
  'College of Hospitality Management',
  'College of Library and Information Science',
  'College of Criminal Justice and Public Safety'
];

const getSubjectName = (code: string) => {
  const names: Record<string, string> = {
    COMM311: 'Communication Theories',
    COMM312: 'Media and Society',
    COMM313: 'Broadcast Journalism',
    IT411: 'Systems Administration',
    IT412: 'Information Security',
    IT413: 'Web Development Tech',
    EDUC211: 'Learner-Centered Teaching',
    EDUC212: 'The Teaching Profession',
    BMG101: 'Business Management Foundation',
    ACT101: 'Principles of Accounting',
    HM401: 'Professional Event Management',
    HM402: 'Food & Beverage Operations',
    LIS301: 'Library Cataloging',
    LIS302: 'Indexing and Abstracting',
    CRIM311: 'Criminal Law & Jurisprudence',
    CRIM312: 'Forensic Ballistics',
    CRIM313: 'Police Intelligence',
    CS311: 'Design & Analysis of Algorithms',
    CS312: 'Automata Theory & Languages',
    CS313: 'Software Engineering'
  };
  return names[code] || 'Specialized Subject';
};

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

export default function ScheduleApprovalPage() {
  const [schedules, setSchedules] = useState<ScheduleApproval[]>(MOCK_SCHEDULE_APPROVALS);
  
  // Filters
  const [selectedDept, setSelectedDept] = useState('All Departments');
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

  const addToast = (title: string, message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const resetFilters = () => {
    setSelectedDept('All Departments');
    setSelectedStatus('All Status');
    setSelectedMode('All Modes');
  };

  const handleApprove = (sched: ScheduleApproval) => {
    setApproveConfirm(sched);
  };

  const confirmApprove = () => {
    if (approveConfirm) {
      setSchedules(prev => prev.map(s => 
        s.id === approveConfirm.id ? { ...s, status: 'approved' } : s
      ));
      addToast('Success', `Schedule for ${approveConfirm.section} has been approved successfully.`, 'success');
      setApproveConfirm(null);
    }
  };

  const handleReject = (sched: ScheduleApproval) => {
    setRejectConfirm(sched);
    setRejectReason('');
    setRejectError('');
  };

  const confirmReject = () => {
    if (!rejectReason.trim()) {
      setRejectError('A reason for rejection is required.');
      return;
    }
    if (rejectConfirm) {
      setSchedules(prev => prev.map(s => 
        s.id === rejectConfirm.id ? { ...s, status: 'rejected' } : s
      ));
      addToast('Rejected', `Schedule for ${rejectConfirm.section} has been rejected.`, 'error');
      setRejectConfirm(null);
      setRejectReason('');
    }
  };

  // Filter schedules
  const filteredData = useMemo(() => {
    return schedules.filter(s => {
      const matchDept = selectedDept === 'All Departments' || s.department === selectedDept;
      
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
      
      return matchDept && matchStatus && matchMode;
    });
  }, [schedules, selectedDept, selectedStatus, selectedMode]);

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
          const isActable = sched.status === 'approved_by_dean';
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
        <p className="text-muted text-sm mt-1">Review and approve class schedules submitted by departments</p>
        <div className="w-12 h-0.5 bg-[#C9952A] mt-3"></div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-gray-150/70 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <select 
            value={selectedDept}
            onChange={(e) => {
              setSelectedDept(e.target.value);
              setPagination(prev => ({ ...prev, pageIndex: 0 }));
            }}
            className="px-3.5 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#C9952A] outline-none text-xs bg-white text-gray-700 font-semibold cursor-pointer"
          >
            <option value="All Departments">All Departments</option>
            {DEPARTMENTS.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

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
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-base font-semibold">No schedules found.</p>
                      <p className="text-xs">Adjust your status/department filters and try again.</p>
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
              {(!MOCK_TIMETABLE_ITEMS[viewSchedule.section] || MOCK_TIMETABLE_ITEMS[viewSchedule.section].length === 0) ? (
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
                      {MOCK_TIMETABLE_ITEMS[viewSchedule.section]?.map((item) => {
                        const colMap = { Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
                        const colIndex = colMap[item.day];
                        const startRow = getSlotIndex(item.startTime) + 1; // 1-based index (no header offset since header is outside body grid!)
                        const endRow = getSlotIndex(item.endTime) + 1;
                        
                        const colors = getDeptColorClasses(viewSchedule.department);
                        const subName = getSubjectName(item.subjectCode);

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
                                <span className="font-bold text-[10px] uppercase tracking-wide">{item.subjectCode}</span>
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
                              <p className="text-[9px] opacity-80 truncate">{item.faculty}</p>
                            </div>
                            <div className="flex justify-between items-center text-[9px] opacity-80 mt-1 font-semibold border-t border-black/5 pt-0.5">
                              <span>{item.room}</span>
                              <span>{item.startTime} - {item.endTime}</span>
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
                {viewSchedule.status === 'approved_by_dean' && (
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
