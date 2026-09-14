import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpen, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import DataTable from '../ui/DataTable';
import LoadingSpinner from '../ui/LoadingSpinner';
import TableActionButton from '../ui/TableActionButton';
import { useDataTable } from '../ui/useDataTable';
import type { CurriculumCourse } from '../../types/curriculum';

interface CourseTableProps {
  courses: CurriculumCourse[];
  totals: {
    lec: number;
    lab: number;
    tu: number;
  };
  highlightedCourseId: number | null;
  removingCourseId: number | null;
  isRemoving: boolean;
  canEdit?: boolean;
  onInitiateEdit?: (course: CurriculumCourse) => void;
  onInitiateRemove: (courseId: number) => void;
  onCancelRemove: () => void;
  onConfirmRemove: (courseId: number, courseCode: string) => void;
}

export default function CourseTable({
  courses,
  totals,
  highlightedCourseId,
  removingCourseId,
  isRemoving,
  canEdit = true,
  onInitiateEdit,
  onInitiateRemove,
  onCancelRemove,
  onConfirmRemove,
}: CourseTableProps) {
  // Majors first, then by code -- the order the curriculum is read in. Column
  // sorting starts from this order and returns to it when cleared.
  const sortedCourses = useMemo(() => {
    return [...courses].sort((a, b) => {
      const catA = a.category?.toLowerCase() === 'major' ? 1 : 2;
      const catB = b.category?.toLowerCase() === 'major' ? 1 : 2;
      if (catA !== catB) return catA - catB;
      return (a.code || '').localeCompare(b.code || '');
    });
  }, [courses]);

  const columns = useMemo<ColumnDef<CurriculumCourse>[]>(() => [
    {
      id: 'code',
      accessorKey: 'code',
      header: 'Course Code',
      size: 128,
      cell: ({ row }) => (
        <span className="bg-[#C9952A]/10 text-[#C9952A] px-2.5 py-1 rounded-full text-xs font-mono font-bold uppercase border border-[#C9952A]/20">
          {row.original.code}
        </span>
      ),
      footer: () => <span className="uppercase tracking-wider">Total Credits</span>,
    },
    {
      id: 'title',
      accessorKey: 'title',
      header: 'Course Title',
      meta: { cellClassName: 'font-bold text-gray-800' },
    },
    {
      id: 'lec_units',
      accessorKey: 'lec_units',
      header: 'Lec Units',
      size: 96,
      meta: { align: 'right', cellClassName: 'font-medium text-gray-600' },
      footer: () => totals.lec,
    },
    {
      id: 'lab_units',
      accessorKey: 'lab_units',
      header: 'Lab Units',
      size: 96,
      meta: { align: 'right', cellClassName: 'font-medium text-gray-600' },
      footer: () => totals.lab,
    },
    {
      id: 'total_units',
      accessorKey: 'total_units',
      header: 'Total Units',
      size: 96,
      meta: { align: 'right', cellClassName: 'font-bold text-[#4e0a10]' },
      footer: () => <span className="font-black text-[#4e0a10]">{totals.tu}</span>,
    },
    ...(canEdit ? [{
      id: 'actions',
      header: 'Actions',
      size: 112,
      enableSorting: false,
      meta: { align: 'right' as const },
      cell: ({ row }: { row: { original: CurriculumCourse } }) => {
        const course = row.original;
        return removingCourseId === course.id ? (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => onConfirmRemove(course.id, course.code)}
              disabled={isRemoving}
              title="Confirm removal of this course from the curriculum"
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              {isRemoving ? <LoadingSpinner size={10} /> : <AlertTriangle size={10} />}
              Confirm
            </button>
            <button
              onClick={onCancelRemove}
              title="Cancel course removal"
              className="px-2 py-1 text-[10px] font-bold text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            {onInitiateEdit && (
              <TableActionButton label="Edit course details" variant="edit" onClick={() => onInitiateEdit(course)}>
                <Pencil size={15} />
              </TableActionButton>
            )}
            <TableActionButton label="Remove course" variant="danger" onClick={() => onInitiateRemove(course.id)}>
              <Trash2 size={15} />
            </TableActionButton>
          </div>
        );
      },
    } satisfies ColumnDef<CurriculumCourse>] : []),
  ], [canEdit, totals, removingCourseId, isRemoving, onConfirmRemove, onCancelRemove, onInitiateEdit, onInitiateRemove]);

  const table = useDataTable({
    data: sortedCourses,
    columns,
    pageSize: false,
    getRowId: (course) => String(course.id),
  });

  return (
    <DataTable
      table={table}
      variant="embedded"
      density="compact"
      rowClassName={(course) => (highlightedCourseId === course.id ? '!bg-[#C9952A]/10 animate-pulse' : '')}
      emptyState={
        <div className="max-w-sm mx-auto">
          <BookOpen size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-xs font-bold text-gray-600 mb-0.5">No courses added yet</p>
          <p className="text-[11px] text-gray-400">
            This semester is empty. {canEdit ? 'Use the Add Course button above to attach courses.' : ''}
          </p>
        </div>
      }
    />
  );
}
