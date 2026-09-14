import { useMemo, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "../ui/DataTable";
import { useDataTable } from "../ui/useDataTable";
import {
  timeRangeLabel,
  type SummaryClass,
  type SummaryPart,
} from "../../pages/ClassSchedules/SchedulerPanel/GenerateSchedule/summaryRows";

/**
 * The lines a per-part cell prints. A value shared by every part is printed
 * once: "Unassigned" stacked three times says nothing the first one did not.
 * Values that differ keep one line per part, aligned with that part's day and
 * time.
 */
const partLines = (item: SummaryClass, valueOf: (part: SummaryPart) => string): string[] => {
  const values = item.parts.map(valueOf);
  return values.every((value) => value === values[0]) ? values.slice(0, 1) : values;
};

/**
 * One row per class, with every meeting folded into it.
 *
 * Shared by the generator's Schedule Summary step and the All Schedules list so
 * both read the same way: a split or hybrid class is a single row whose Day,
 * Time, Room (and Faculty) cells stack one line per part, so each day lines up
 * with its own time and room instead of being scattered over separate rows.
 */
export default function ClassSummaryTable({
  classes,
  showFaculty = false,
  renderSection,
  renderCourseExtras,
  onRowClick,
  isRowFlagged,
  emptyMessage = "No class meetings match these filters.",
  className = "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white",
  scrollClassName = "min-h-0 flex-1 overflow-auto",
  sortable = true,
}: {
  classes: SummaryClass[];
  /** Adds a Faculty column, one line per part. */
  showFaculty?: boolean;
  /** Replaces the plain section name, e.g. to add a department badge. */
  renderSection?: (item: SummaryClass) => ReactNode;
  /** Badges under the course name (generation changes, conflicts). */
  renderCourseExtras?: (item: SummaryClass) => ReactNode;
  onRowClick?: (item: SummaryClass) => void;
  /** Tints the row, e.g. for a class involved in a conflict. */
  isRowFlagged?: (item: SummaryClass) => boolean;
  emptyMessage?: string;
  className?: string;
  /** The scrolling region; keep it the scroll container so the header sticks. */
  scrollClassName?: string;
  /** Turn off when the caller paginates, or a sort would only reorder one page. */
  sortable?: boolean;
}) {
  const columns = useMemo<ColumnDef<SummaryClass>[]>(() => [
    {
      id: "section",
      accessorKey: "sectionName",
      header: "Section",
      meta: { cellClassName: "align-top font-black text-slate-900" },
      cell: ({ row }) => (renderSection ? renderSection(row.original) : row.original.sectionName),
    },
    {
      id: "course",
      accessorKey: "courseCode",
      header: "Course",
      meta: { cellClassName: "align-top" },
      cell: ({ row }) => (
        <>
          <span className="block text-xs font-black text-slate-900">{row.original.courseCode}</span>
          <span className="block truncate text-[11px] font-semibold text-slate-600">{row.original.courseName}</span>
          {renderCourseExtras?.(row.original)}
        </>
      ),
    },
    {
      // One line per part, so each day lines up with its own time and room.
      id: "day",
      header: "Day",
      enableSorting: false,
      meta: { cellClassName: "align-top text-slate-700" },
      cell: ({ row }) => row.original.parts.map((part, index) => (
        <span key={index} className="block leading-5">{part.dayLabel}</span>
      )),
    },
    {
      id: "time",
      accessorFn: (item) => item.parts[0]?.start ?? "",
      header: "Time",
      meta: { cellClassName: "whitespace-nowrap align-top text-slate-700" },
      cell: ({ row }) => row.original.parts.map((part, index) => (
        <span key={index} className="block leading-5">
          {timeRangeLabel(part.start, part.end)}
          {part.meeting && (
            <span className="ml-1.5 text-[10px] font-bold uppercase text-slate-400">
              {part.meeting === "laboratory" ? "Lab" : part.meeting === "lecture" ? "Lec" : part.meeting}
            </span>
          )}
        </span>
      )),
    },
    {
      id: "room",
      accessorFn: (item) => item.parts[0]?.room ?? "",
      header: "Room",
      meta: { cellClassName: "align-top text-slate-700" },
      cell: ({ row }) => partLines(row.original, (part) => part.room).map((room, index) => (
        <span key={index} className={`block leading-5 ${room === "Unassigned" ? "italic text-amber-700" : ""}`}>
          {room}
        </span>
      )),
    },
    ...(showFaculty ? [{
      id: "faculty",
      accessorFn: (item: SummaryClass) => item.parts[0]?.faculty || "Unassigned",
      header: "Faculty",
      meta: { cellClassName: "align-top text-slate-700" },
      cell: ({ row }: { row: { original: SummaryClass } }) => partLines(row.original, (part) => part.faculty || "Unassigned").map((faculty, index) => (
        <span key={index} className={`block truncate leading-5 ${faculty === "Unassigned" ? "italic text-amber-700" : ""}`}>
          {faculty}
        </span>
      )),
    } satisfies ColumnDef<SummaryClass, string>] : []),
    {
      id: "mode",
      accessorFn: (item) => item.modes.join(" "),
      header: "Mode",
      meta: { cellClassName: "whitespace-nowrap align-top text-[10px] font-black uppercase text-slate-700" },
      cell: ({ row }) => row.original.modes.map((mode, index) => (
        <span key={mode}>
          {index > 0 && <span className="mx-1 text-slate-300">|</span>}
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{mode}</span>
        </span>
      )),
    },
  ], [showFaculty, renderSection, renderCourseExtras]);

  const table = useDataTable({ data: classes, columns, pageSize: false, enableSorting: sortable, getRowId: (item) => item.key });

  return (
    <DataTable
      table={table}
      variant="embedded"
      density="compact"
      className={className}
      scrollClassName={scrollClassName}
      tableClassName="min-w-[720px]"
      onRowClick={onRowClick}
      rowClassName={(item) => (isRowFlagged?.(item) ? "!bg-rose-50/60" : "")}
      emptyState={<p className="text-xs font-semibold text-slate-500">{emptyMessage}</p>}
    />
  );
}
