import { useMemo, type ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "../ui/DataTable";
import { useDataTable } from "../ui/useDataTable";
import {
  timeRangeLabel,
  type SummaryClass,
  type SummaryPart,
} from "../../pages/ClassSchedules/SchedulerPanel/GenerateSchedule/summaryRows";

const MODE_LABELS: Record<string, string> = { "on-site": "On-site", online: "Online", field: "Field" };
const MODE_BADGES: Record<string, string> = {
  "on-site": "bg-[#F7F4F0] text-[#4f433c] ring-[#E2D9D0]",
  online: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  field: "bg-[#F5A623]/10 text-[#8A5A12] ring-[#F5A623]/40",
};

const meetingLabel = (meeting: string) =>
  meeting === "laboratory" ? "Lab" : meeting === "lecture" ? "Lec" : meeting;

// The meeting columns (day, time, room, instructor, mode) drop their cell padding and print one
// fixed-height line per meeting, so a meeting reads straight across and the hairline between two
// meetings runs unbroken through every meeting column.
const MEETING_CELL = "!p-0 align-top text-[#3f342e]";

function MeetingLines({
  item,
  children,
}: {
  item: SummaryClass;
  children: (part: SummaryPart) => ReactNode;
}) {
  return item.parts.map((part, index) => (
    <div
      key={index}
      className={`flex h-9 items-center whitespace-nowrap px-3 ${index > 0 ? "border-t border-[#F0EAE3]" : ""}`}
    >
      {children(part)}
    </div>
  ));
}

export default function ClassSummaryTable({
  classes,
  showFaculty = false,
  renderSection,
  renderCourseExtras,
  onRowClick,
  isRowFlagged,
  emptyMessage = "No class meetings match these filters.",
  className = "overflow-hidden rounded-xl border border-slate-200 bg-white",
  scrollClassName = "",
  sortable = true,
}: {
  classes: SummaryClass[];
  showFaculty?: boolean;
  renderSection?: (item: SummaryClass) => ReactNode;
  renderCourseExtras?: (item: SummaryClass) => ReactNode;
  onRowClick?: (item: SummaryClass) => void;
  isRowFlagged?: (item: SummaryClass) => boolean;
  emptyMessage?: string;
  className?: string;
  scrollClassName?: string;
  sortable?: boolean;
}) {
  const columns = useMemo<ColumnDef<SummaryClass>[]>(() => [
    {
      id: "section",
      accessorKey: "sectionName",
      header: "Section",
      meta: { cellClassName: "whitespace-nowrap align-top !py-2.5 font-bold text-[#4A0D16]" },
      cell: ({ row }) => (renderSection ? renderSection(row.original) : row.original.sectionName),
    },
    {
      id: "course",
      accessorKey: "courseCode",
      header: "Course",
      meta: { cellClassName: "align-top !py-2.5" },
      cell: ({ row }) => (
        <>
          <span className="block text-xs font-bold tracking-tight text-[#1A1410]">{row.original.courseCode}</span>
          <span className="block text-[11px] font-medium leading-snug text-[#6b5f57]">{row.original.courseName}</span>
          {renderCourseExtras?.(row.original)}
        </>
      ),
    },
    {
      id: "day",
      header: "Day",
      enableSorting: false,
      meta: { cellClassName: MEETING_CELL },
      cell: ({ row }) => (
        <MeetingLines item={row.original}>{(part) => part.dayLabel}</MeetingLines>
      ),
    },
    {
      id: "time",
      accessorFn: (item) => item.parts[0]?.start ?? "",
      header: "Time",
      meta: { cellClassName: MEETING_CELL },
      cell: ({ row }) => (
        <MeetingLines item={row.original}>
          {(part) => (
            <>
              <span className="font-semibold tabular-nums text-[#2a1d1a]">{timeRangeLabel(part.start, part.end)}</span>
              {part.meeting && (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-[#7A6E67]">
                  {meetingLabel(part.meeting)}
                </span>
              )}
            </>
          )}
        </MeetingLines>
      ),
    },
    {
      id: "room",
      accessorFn: (item) => item.parts[0]?.room ?? "",
      header: "Room",
      meta: { cellClassName: MEETING_CELL },
      cell: ({ row }) => (
        <MeetingLines item={row.original}>
          {(part) => (
            <span className={part.room === "Unassigned" ? "italic text-[#8A5A12]" : "font-medium"}>{part.room}</span>
          )}
        </MeetingLines>
      ),
    },
    ...(showFaculty ? [{
      id: "faculty",
      accessorFn: (item: SummaryClass) => item.parts[0]?.faculty || "Unassigned",
      header: "Instructor",
      meta: { cellClassName: MEETING_CELL },
      cell: ({ row }: { row: { original: SummaryClass } }) => (
        <MeetingLines item={row.original}>
          {(part) => {
            const faculty = part.faculty || "Unassigned";
            return <span className={faculty === "Unassigned" ? "italic text-amber-700" : ""}>{faculty}</span>;
          }}
        </MeetingLines>
      ),
    } satisfies ColumnDef<SummaryClass, string>] : []),
    {
      id: "mode",
      accessorFn: (item) => item.modes.join(" "),
      header: "Mode",
      meta: { cellClassName: MEETING_CELL },
      cell: ({ row }) => (
        <MeetingLines item={row.original}>
          {(part) => (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${MODE_BADGES[part.mode] ?? MODE_BADGES["on-site"]}`}>
              {MODE_LABELS[part.mode] ?? part.mode}
            </span>
          )}
        </MeetingLines>
      ),
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
      onRowClick={onRowClick}
      rowClassName={(item) => (isRowFlagged?.(item) ? "!bg-rose-50/60" : "")}
      emptyState={<p className="text-xs font-semibold text-slate-500">{emptyMessage}</p>}
    />
  );
}
