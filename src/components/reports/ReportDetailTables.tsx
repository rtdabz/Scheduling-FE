import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, CheckCircle2 } from 'lucide-react';
import Badge from '../ui/Badge';
import DataTable from '../ui/DataTable';
import { useDataTable } from '../ui/useDataTable';
import type { Faculty, Room, ScheduleItem } from '../../pages/ClassSchedules/SchedulerPanel/types';
import type { RoomReportSummary } from '../../lib/reports';
import { statusTone } from '../../lib/badgeTone';
import { basicLoadOf } from '../../lib/facultyLoad';
import { describeWindow } from '../../lib/roomRequests';
import { dayNameToIndex } from '../../lib/timeGrid';

/** The report modal scrolls the table area itself, so the tables must not add a scroll container of their own. */
const SHARED = { variant: 'embedded', scrollClassName: 'overflow-visible' } as const;
const numeric = 'tabular-nums whitespace-nowrap';

export interface ScheduleGroup {
  name: string;
  classCount: number;
  days: Set<string>;
}

export function ScheduleGroupsTable({ id, label, heading, groups, emptyTitle }: {
  id: string; label: string; heading: string; groups: ScheduleGroup[]; emptyTitle: string;
}) {
  const columns = useMemo<ColumnDef<ScheduleGroup>[]>(() => [
    { id: 'name', header: heading, accessorKey: 'name', meta: { cellClassName: 'font-semibold text-gray-900' } },
    { id: 'classes', header: 'Classes', accessorKey: 'classCount', meta: { align: 'right', cellClassName: numeric } },
    {
      id: 'days',
      header: 'Days',
      cell: ({ row }) => Array.from(row.original.days)
        .sort((a, b) => dayNameToIndex(a) - dayNameToIndex(b))
        .map((day) => day.slice(0, 3))
        .join(', ') || '—',
    },
  ], [heading]);
  const table = useDataTable({ data: groups, columns, pageSize: false, enableSorting: false, getRowId: (group) => group.name });

  return <DataTable {...SHARED} table={table} tableId={id} ariaLabel={label} tableClassName="min-w-[480px]" emptyTitle={emptyTitle} emptyDescription="" />;
}

const modeTone = (mode: string | undefined) => {
  const value = mode?.toLowerCase() ?? '';
  return value.includes('online') ? 'info' : value.includes('field') ? 'warning' : 'success';
};

export function ScheduleClassesTable({ id, label, schedules }: { id: string; label: string; schedules: ScheduleItem[] }) {
  const columns = useMemo<ColumnDef<ScheduleItem>[]>(() => [
    { id: 'section', header: 'Section', accessorKey: 'sectionName', meta: { cellClassName: 'font-semibold text-gray-900' } },
    {
      id: 'course',
      header: 'Course Code & Title',
      cell: ({ row: { original: item } }) => (
        <>
          <span className="font-semibold text-primary">{item.courseCode || item.subjectCode}</span>
          <span className="mt-0.5 block text-[11px] font-medium leading-4 text-gray-500">{item.courseName || item.subjectName}</span>
        </>
      ),
    },
    {
      id: 'slot',
      header: 'Schedule Slot',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row: { original: item } }) => (
        <>
          <span className="font-semibold text-gray-900">{item.day}</span>
          <span className="mt-0.5 block text-[11px] font-medium tabular-nums text-gray-500">{item.startTime} - {item.endTime}</span>
        </>
      ),
    },
    {
      id: 'room',
      header: 'Room',
      cell: ({ row }) => (
        <Badge shape="tag" className="!whitespace-normal" icon={<Building2 size={11} aria-hidden="true" className="shrink-0" />}>
          <span className="min-w-0 break-words">{row.original.roomName || 'TBA'}</span>
        </Badge>
      ),
    },
    {
      id: 'instructor',
      header: 'Instructor',
      cell: ({ row }) => row.original.facultyName || <span className="italic text-gray-400">Unassigned</span>,
    },
    {
      id: 'mode',
      header: 'Mode',
      cell: ({ row }) => <Badge tone={modeTone(row.original.mode)}>{row.original.mode || 'on-site'}</Badge>,
    },
    {
      id: 'status',
      header: 'Status',
      meta: { align: 'right' },
      cell: () => <Badge tone="success" icon={<CheckCircle2 size={11} aria-hidden="true" />}>Approved</Badge>,
    },
  ], []);
  const table = useDataTable({ data: schedules, columns, pageSize: false, enableSorting: false, getRowId: (item) => String(item.id) });

  return <DataTable {...SHARED} table={table} tableId={id} ariaLabel={label} tableClassName="min-w-[1040px]" emptyTitle="No schedule records available." emptyDescription="" />;
}

export function TeachingLoadTable({ id, label, faculties, schedules, emptyTitle }: {
  id: string; label: string; faculties: Faculty[]; schedules: ScheduleItem[]; emptyTitle: string;
}) {
  const columns = useMemo<ColumnDef<Faculty>[]>(() => {
    const loadOf = (faculty: Faculty) => {
      const max = faculty.maxUnits || 0;
      const deload = faculty.deloadUnits || 0;
      const basic = basicLoadOf(max, deload);
      const assigned = faculty.assignedUnits || 0;
      return { max, deload, basic, assigned, over: Math.max(0, assigned - basic), remaining: Math.max(0, basic - assigned) };
    };
    return [
      { id: 'name', header: 'Instructor', accessorKey: 'name', meta: { cellClassName: 'font-semibold text-gray-900' } },
      {
        id: 'employment',
        header: 'Employment',
        cell: ({ row }) => <Badge shape="tag" className="capitalize">{row.original.employmentType || 'full-time'}</Badge>,
      },
      { id: 'max', header: 'Max Units', meta: { align: 'right', cellClassName: numeric }, cell: ({ row }) => loadOf(row.original).max },
      {
        id: 'deload',
        header: 'Deload',
        meta: { align: 'right', cellClassName: `${numeric} text-gray-500` },
        cell: ({ row }) => { const { deload } = loadOf(row.original); return deload > 0 ? `-${deload}` : '0'; },
      },
      { id: 'basic', header: 'Basic Load', meta: { align: 'right', cellClassName: numeric }, cell: ({ row }) => loadOf(row.original).basic },
      {
        id: 'assigned',
        header: 'Assigned Units',
        meta: { align: 'right', cellClassName: `${numeric} font-bold text-primary` },
        cell: ({ row }) => loadOf(row.original).assigned,
      },
      {
        id: 'load_status',
        header: 'Load Status',
        meta: { align: 'right', cellClassName: numeric },
        cell: ({ row }) => {
          const { over, remaining } = loadOf(row.original);
          if (over > 0) return <Badge tone="warning">+{over} overload</Badge>;
          if (remaining > 0) return <Badge tone="info">{remaining} available</Badge>;
          return <Badge tone="success">Complete</Badge>;
        },
      },
      {
        id: 'classes',
        header: 'Classes',
        meta: { align: 'right', cellClassName: numeric },
        cell: ({ row: { original: faculty } }) =>
          schedules.filter((schedule) => schedule.facultyId === faculty.id || schedule.facultyName === faculty.name).length,
      },
      {
        id: 'standing',
        header: 'Standing',
        meta: { align: 'right' },
        cell: ({ row }) => <Badge tone="success">{row.original.status || 'Active'}</Badge>,
      },
    ];
  }, [schedules]);
  const table = useDataTable({ data: faculties, columns, pageSize: false, enableSorting: false, getRowId: (faculty) => String(faculty.id) });

  return <DataTable {...SHARED} table={table} tableId={id} ariaLabel={label} tableClassName="min-w-[1040px]" emptyTitle={emptyTitle} emptyDescription="" />;
}

type RoomRequestRow = RoomReportSummary['requests'][number];

export function RoomRequestsTable({ label, requests, showOwner, emptyTitle }: {
  label: string; requests: RoomRequestRow[]; showOwner: boolean; emptyTitle: string;
}) {
  const columns = useMemo<ColumnDef<RoomRequestRow>[]>(() => [
    ...(showOwner ? [{ id: 'owner', header: 'Room Owner', cell: ({ row }) => row.original.owner_department || '—' } satisfies ColumnDef<RoomRequestRow>] : []),
    { id: 'room', header: 'Room', meta: { cellClassName: 'font-semibold text-primary' }, cell: ({ row }) => row.original.room_code || '—' },
    {
      id: 'timeslot',
      header: 'Timeslot',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row }) => row.original.windows?.length
        ? row.original.windows.map((window) => (
          <div key={`${window.day}-${window.start_time}-${window.end_time}`}>{describeWindow(window)}</div>
        ))
        : '—',
    },
    {
      id: 'status',
      header: 'Status',
      meta: { align: 'right' },
      cell: ({ row }) => <Badge tone={statusTone(row.original.status)} className="capitalize">{row.original.status}</Badge>,
    },
  ], [showOwner]);
  const table = useDataTable({ data: requests, columns, pageSize: false, enableSorting: false, getRowId: (request) => String(request.id) });

  return <DataTable {...SHARED} table={table} ariaLabel={label} density="compact" tableClassName="min-w-[620px]" emptyTitle={emptyTitle} emptyDescription="" />;
}

export type ReportRoom = Pick<Room, 'id' | 'name' | 'building' | 'roomType' | 'status'>;

export interface RoomUtilizationRow {
  room: ReportRoom;
  classCount: number;
  days: string;
}

export function RoomUtilizationTable({ id, rows, showStatus }: { id: string; rows: RoomUtilizationRow[]; showStatus: boolean }) {
  const columns = useMemo<ColumnDef<RoomUtilizationRow>[]>(() => [
    { id: 'code', header: 'Room Code', meta: { cellClassName: 'font-semibold text-primary' }, cell: ({ row }) => row.original.room.name },
    { id: 'building', header: 'Building', cell: ({ row }) => row.original.room.building || 'Main Campus' },
    {
      id: 'type',
      header: 'Room Type',
      cell: ({ row }) => <Badge shape="tag" className="capitalize">{row.original.room.roomType || 'Lecture Room'}</Badge>,
    },
    { id: 'classes', header: 'Scheduled Classes', accessorKey: 'classCount', meta: { align: 'center', cellClassName: `${numeric} font-bold text-gray-900` } },
    { id: 'days', header: 'Days Utilized', meta: { cellClassName: 'text-gray-500' }, cell: ({ row }) => row.original.days || '—' },
    ...(showStatus ? [{
      id: 'status',
      header: 'Status',
      meta: { align: 'right' },
      cell: ({ row: { original } }) => original.room.status === 'not available'
        ? <Badge tone="warning">Unavailable</Badge>
        : original.classCount > 0
          ? <Badge tone="success">In Use</Badge>
          : <Badge>Available</Badge>,
    } satisfies ColumnDef<RoomUtilizationRow>] : []),
  ], [showStatus]);
  const table = useDataTable({ data: rows, columns, pageSize: false, enableSorting: false, getRowId: (row) => String(row.room.id || row.room.name) });

  return <DataTable {...SHARED} table={table} tableId={id} ariaLabel="Room utilization" density="compact" tableClassName="min-w-[620px]" emptyTitle="No room records available." emptyDescription="" />;
}
