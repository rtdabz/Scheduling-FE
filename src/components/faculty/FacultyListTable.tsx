import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Trash2, UserRound } from 'lucide-react';
import DataTable from '../ui/DataTable';
import { useDataTable } from '../ui/useDataTable';
import TableActionButton from '../ui/TableActionButton';
import SegmentedLoadBar from './SegmentedLoadBar';
import FacultyRoleBadge, { type FacultyAdministrativeRole } from './FacultyRoleBadge';
import InstructorTimetableButton from '../InstructorTimetableButton';
import { LOAD_LEVELS, loadLevelOf } from '../../lib/facultyLoad';
import { formatFacultyListName } from '../../lib/formatters';
import { designationLabel, type Designation } from '../../lib/designations';

/** The fields the list view reads; each role's Faculty page passes its own richer record. */
export interface FacultyListRow {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix?: string | null;
  employment_type: 'full-time' | 'part-time';
  max_units: number;
  overload_units: number;
  deload_units: number;
  probono_units: number;
  assigned_units: number;
  department: { department_code?: string | null; department_name?: string | null } | null;
  profile_picture?: string | null;
  administrative_role?: FacultyAdministrativeRole | null;
  designation?: Designation | null;
  designations?: Designation[];
}

interface FacultyListTableProps<T extends FacultyListRow> {
  /** Already sorted and paginated: the page shares both with its grid view. */
  faculties: T[];
  isLoading: boolean;
  highlightedId: number | null;
  canManage: boolean;
  getDepartmentColor: (nameOrCode?: string) => string;
  onView: (faculty: T) => void;
  onEdit: (faculty: T) => void;
  onArchive: (faculty: T) => void;
  /** Marks the first row's View button for a guided tour. */
  viewDetailsTourId?: string;
}

const workloadStatus = (f: FacultyListRow) => LOAD_LEVELS[loadLevelOf({
  assignedUnits: f.assigned_units,
  maxUnits: f.max_units,
  deloadUnits: f.deload_units,
  overloadUnits: f.overload_units,
  probonoUnits: f.probono_units,
})];

const tooltipClass = 'absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-[10px] font-bold text-white bg-gray-900 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 shadow-md whitespace-nowrap';

/** The Faculty / Instructors list view shared by the VPAA, Dean, Program Head and Secretary pages. */
export default function FacultyListTable<T extends FacultyListRow>({
  faculties,
  isLoading,
  highlightedId,
  canManage,
  getDepartmentColor,
  onView,
  onEdit,
  onArchive,
  viewDetailsTourId,
}: FacultyListTableProps<T>) {
  const columns = useMemo<ColumnDef<T>[]>(() => [
    {
      id: 'name',
      header: 'Instructor Name',
      meta: { cellClassName: 'whitespace-nowrap font-bold text-gray-900' },
      cell: ({ row: { original: f } }) => {
        const name = formatFacultyListName(f);
        return (
          <div className="flex items-center gap-3">
            {f.profile_picture ? (
              <img src={f.profile_picture} alt={name} className="w-8 h-8 rounded-full object-cover border border-gray-200 shadow-2xs shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                <UserRound className="w-4 h-4" aria-hidden="true" />
              </div>
            )}
            <div>
              <div className="text-xs font-extrabold text-gray-900">{name}</div>
              <div className="text-[10px] text-gray-400 font-medium">ID: #{f.id}</div>
              <FacultyRoleBadge role={f.administrative_role} />
            </div>
          </div>
        );
      },
    },
    {
      id: 'designation',
      header: 'Designation',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row: { original: f } }) => {
        const held = f.designations?.length ? f.designations : f.designation ? [f.designation] : [];
        return held.length === 0 ? (
          <span className="text-gray-400 text-xs">—</span>
        ) : (
          <div className="flex flex-col gap-2 min-w-0">
            {held.map((d) => (
              <FacultyRoleBadge
                key={d.id}
                label={designationLabel(d)}
                tone="gold"
                hint={d.deload_units ? `${d.deload_units} ${d.deload_units === 1 ? 'unit' : 'units'} deload` : null}
                stacked
              />
            ))}
          </div>
        );
      },
    },
    {
      id: 'department',
      header: 'Department',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row: { original: f } }) => (f.department?.department_code ? (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-2xs ${getDepartmentColor(f.department.department_code)}`}>
          {f.department.department_code}
        </span>
      ) : (
        <span className="text-gray-400 text-xs">—</span>
      )),
    },
    {
      id: 'employment',
      header: 'Employment',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row: { original: f } }) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold capitalize ${
          f.employment_type === 'full-time'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          {f.employment_type}
        </span>
      ),
    },
    {
      id: 'workload',
      header: 'Workload Units',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row: { original: f } }) => {
        const ceiling = Math.max(0, f.max_units - f.deload_units) + f.overload_units + f.probono_units;
        return (
          <div className="space-y-1 max-w-[140px]">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-gray-900">{f.assigned_units} / {ceiling}</span>
            </div>
            <SegmentedLoadBar
              size="sm"
              assignedUnits={f.assigned_units}
              maxUnits={f.max_units}
              deloadUnits={f.deload_units}
              overloadUnits={f.overload_units}
              probonoUnits={f.probono_units}
            />
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      meta: { cellClassName: 'whitespace-nowrap' },
      cell: ({ row: { original: f } }) => {
        const status = workloadStatus(f);
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1.5 w-fit ${status.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      meta: { align: 'right', cellClassName: 'whitespace-nowrap' },
      cell: ({ row: { original: f, index } }) => {
        const name = formatFacultyListName(f);
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => onView(f)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-[#5A1220] hover:border-[#C9952A] hover:bg-amber-50 hover:text-[#410b15] cursor-pointer"
              aria-label="View Details"
              title="View Details"
              data-tour={viewDetailsTourId && index === 0 ? viewDetailsTourId : undefined}
            >
              <Eye size={15} />
            </button>
            <InstructorTimetableButton
              facultyId={f.id}
              facultyName={name}
              departmentName={f.department ? `${f.department.department_code} - ${f.department.department_name}` : undefined}
              iconOnly
            />
            {canManage && (
              <>
                <div className="relative group/tooltip">
                  <TableActionButton label="Edit" variant="edit" onClick={() => onEdit(f)}>
                    <Pencil size={17} />
                  </TableActionButton>
                  <span className={tooltipClass}>Edit</span>
                </div>
                <div className="relative group/tooltip">
                  <TableActionButton label="Archive" variant="danger" onClick={() => onArchive(f)}>
                    <Trash2 size={17} />
                  </TableActionButton>
                  <span className={tooltipClass}>Archive</span>
                </div>
              </>
            )}
          </div>
        );
      },
    },
  ], [canManage, getDepartmentColor, onArchive, onEdit, onView, viewDetailsTourId]);

  // Sorting and paging belong to the page, which shares them with the grid view.
  const table = useDataTable<T>({ data: faculties, columns, pageSize: false, enableSorting: false, getRowId: (f) => String(f.id) });

  return (
    <DataTable
      table={table}
      isLoading={isLoading}
      loadingRows={5}
      className="font-sans"
      ariaLabel="Instructors"
      emptyTitle="No instructors found."
      emptyDescription="Try adjusting search parameters or add a new record."
      rowClassName={(f) => `group ${f.id === highlightedId ? '!bg-[#C9952A]/15' : ''}`}
    />
  );
}
