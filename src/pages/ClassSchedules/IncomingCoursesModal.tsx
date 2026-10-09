import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import Modal from "../../components/ui/Modal";
import DataTable from "../../components/ui/DataTable";
import SearchInput from "../../components/ui/SearchInput";
import { useDataTable } from "../../components/ui/useDataTable";
import { yearLevelLabel } from "../../lib/semesterLabel";

export interface IncomingCourse {
  id: number;
  course_code: string;
  course_name: string;
  units?: number | null;
  year_level?: number | null;
  department?: { department_code?: string | null; department_name?: string | null } | null;
  teaching_source_program?: { id?: number; code?: string | null; major?: string | null } | null;
}

const sourceProgramLabel = (program?: IncomingCourse["teaching_source_program"]): string | null => {
  const code = program?.code?.trim();
  if (!code) return null;
  const major = program?.major?.trim();
  return major ? `${code}-${major}` : code;
};

const sourceLabel = (course: IncomingCourse): string =>
  sourceProgramLabel(course.teaching_source_program)
  ?? course.department?.department_code
  ?? course.department?.department_name
  ?? "Shared";

const columnHelper = createColumnHelper<IncomingCourse>();

const columns = [
  columnHelper.accessor((course) => `${course.course_code} ${course.course_name}`, {
    id: "course",
    header: "Course",
    sortingFn: (a, b) => a.original.course_code.localeCompare(b.original.course_code, undefined, { numeric: true }),
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="font-black text-[#4e0a10]">{row.original.course_code}</div>
        <div className="max-w-[22rem] truncate text-xs font-semibold text-slate-500" title={row.original.course_name}>
          {row.original.course_name}
        </div>
      </div>
    ),
  }),
  columnHelper.accessor(sourceLabel, {
    id: "source",
    header: "Source",
    cell: ({ getValue }) => (
      <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{getValue()}</span>
    ),
  }),
  columnHelper.accessor((course) => Number(course.units ?? 0), {
    id: "units",
    header: "Units",
    meta: { align: "right" },
  }),
  columnHelper.accessor((course) => Number(course.year_level ?? 0), {
    id: "year_level",
    header: "Year Level",
    cell: ({ row }) => yearLevelLabel(row.original.year_level),
  }),
  columnHelper.display({
    id: "status",
    header: "Status",
    meta: { align: "right" },
    cell: () => (
      <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">Schedule required</span>
    ),
  }),
];

interface IncomingCoursesModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: IncomingCourse[];
}

export default function IncomingCoursesModal({ isOpen, onClose, courses }: IncomingCoursesModalProps) {
  const [search, setSearch] = useState("");
  const table = useDataTable({
    data: courses,
    columns,
    globalFilter: search,
    initialSorting: [{ id: "year_level", desc: false }],
    getRowId: (course) => String(course.id),
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Incoming courses awaiting schedules"
      description="These courses were assigned to your department, but no approved schedule exists yet. Create the section schedule in Schedule Builder first; it will then appear here for instructor assignment."
    >
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search course or source..."
            aria-label="Search incoming courses"
          />
          <span className="whitespace-nowrap text-xs font-bold text-slate-500">{courses.length} courses</span>
        </div>
        <DataTable
          table={table}
          density="compact"
          totalLabel="courses"
          ariaLabel="Incoming courses awaiting schedules"
          emptyTitle="No matching courses."
          pageSizeOptions={[10, 25, 50]}
        />
      </div>
    </Modal>
  );
}
