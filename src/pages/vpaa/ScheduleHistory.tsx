import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  List,
  Printer,
  RefreshCw,
  X,
} from "lucide-react";
import api from "../../lib/api";
import { SLOT_HEIGHT_PX } from "../ClassSchedules/SchedulerPanel/constants";
import WeeklyTimetableGrid, {
  WEEK_DAYS,
} from "../../components/scheduling/WeeklyTimetableGrid";
import {
  formatTime12h,
  slotCount,
  timeToSlot,
} from "../../lib/timeGrid";
import { scheduleLocationLabel } from "../../lib/scheduleLocation";
import ScheduleCard from "../ClassSchedules/SchedulerPanel/TimetableGrid/ScheduleCard";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "../../components/ui/DataTable";
import { useDataTable } from "../../components/ui/useDataTable";
import type {
  ApiDepartmentRecord,
  DeliveryMode,
  ScheduleItem,
  Section,
  Subject,
  Semester,
} from "../ClassSchedules/SchedulerPanel/types";
import PrintSchedule from "../ClassSchedules/SchedulerPanel/PrintSchedule";
import { semesterLabel } from "../../lib/semesterLabel";
import TableActionButton from "../../components/ui/TableActionButton";

type Snapshot = {
  id: number;
  schedule_id: number | null;
  section_id: number | null;
  section_name?: string;
  section_year_level?: number | null;
  section_semester?: string | null;
  course_code?: string;
  course_name?: string;
  course_category?: string | null;
  units?: number | null;
  lecture_hours?: number | null;
  lab_hours?: number | null;
  faculty_name?: string;
  room_name?: string;
  department_name?: string | null;
  department_code?: string | null;
  department_logo?: string | null;
  snapshot: Record<string, unknown>;
};
type Entry = {
  id: number;
  group_id?: string | null;
  schedule_id: number | null;
  semester_id: number | null;
  academic_year?: string | null;
  semester?: string | null;
  section_id: number | null;
  course_id: number | null;
  department_id: number | null;
  schedule_label: string;
  schedule_count: number;
  section_count: number;
  snapshots: Snapshot[];
  action: string;
  snapshot: Record<string, unknown>;
  actor: { name: string; username: string; role: string } | null;
  created_at: string;
};
type Response = {
  data: Entry[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
    from: number | null;
    to: number | null;
  };
};

const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
const value = (s: Record<string, unknown>, key: string) => String(s[key] ?? "");
const number = (s: Record<string, unknown>, key: string) => Number(s[key] ?? 0);
const mode = (v: string): DeliveryMode =>
  v === "online" || v === "field" ? v : "on-site";
const bool = (v: unknown) => v === true || v === 1 || v === "1";
const noop = () => undefined;
const location = (item: Snapshot): string =>
  scheduleLocationLabel(mode(value(item.snapshot, "mode")), item.room_name);

const gridCard = (
  item: Snapshot,
): { schedule: ScheduleItem; subject: Subject } => {
  const start = timeToSlot(value(item.snapshot, "start_time"));
  const end = Math.max(start + 1, timeToSlot(value(item.snapshot, "end_time")));
  const day = value(item.snapshot, "day");
  const category = item.course_category === "minor" ? "minor" : "major";
  const units = Number(item.units ?? 0);
  const courseId = String(
    number(item.snapshot, "course_id") || item.schedule_id || item.id,
  );
  return {
    schedule: {
      id: String(item.schedule_id ?? item.id),
      semesterId: number(item.snapshot, "semester_id"),
      departmentId: number(item.snapshot, "department_id"),
      courseId,
      courseCode: item.course_code || "Course",
      courseName: item.course_name || "Untitled course",
      courseType: category,
      lectureUnits: Number(item.lecture_hours ?? 0),
      laboratoryUnits: Number(item.lab_hours ?? 0),
      totalUnits: units,
      sectionName: item.section_name || "Section",
      roomName: location(item),
      day,
      startTime: formatTime12h(value(item.snapshot, "start_time")),
      endTime: formatTime12h(value(item.snapshot, "end_time")),
      mode: mode(value(item.snapshot, "mode")),
      facultyName: item.faculty_name || null,
      facultyId: value(item.snapshot, "faculty_id") || null,
      status: "finalized",
      dayIndex: WEEK_DAYS.indexOf(day as (typeof WEEK_DAYS)[number]),
      startSlot: start,
      durationSlots: end - start,
      sectionId: String(item.section_id ?? number(item.snapshot, "section_id")),
      roomId: value(item.snapshot, "room_id"),
      isHybrid: bool(item.snapshot.is_hybrid),
    },
    subject: {
      id: courseId,
      code: item.course_code || "Course",
      name: item.course_name || "Untitled course",
      units,
      lectureHours: Number(item.lecture_hours ?? 0),
      labHours: Number(item.lab_hours ?? 0),
      category,
      semester: "1st",
      departmentId: number(item.snapshot, "department_id") || null,
      yearLevel: 1,
      roomTypeRequired: "lecture",
      status: "active",
    },
  };
};

const snapshotColumns: ColumnDef<Snapshot>[] = [
  { id: "schedule", accessorFn: (item) => item.schedule_id ?? 0, header: "Schedule", cell: ({ row }) => `#${row.original.schedule_id ?? "Deleted"}` },
  { id: "section", accessorFn: (item) => item.section_name || "", header: "Section", cell: ({ row }) => row.original.section_name || `#${row.original.section_id ?? "Unknown"}` },
  {
    id: "course",
    accessorFn: (item) => item.course_code || "",
    header: "Course",
    cell: ({ row }) => (
      <>
        {row.original.course_code || "Course"}
        <span className="block font-medium text-gray-500">{row.original.course_name || ""}</span>
      </>
    ),
  },
  { id: "instructor", accessorFn: (item) => item.faculty_name || "Unassigned", header: "Instructor" },
  { id: "room", accessorFn: (item) => location(item), header: "Room" },
];

export default function ScheduleHistory() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [printingEntry, setPrintingEntry] = useState<Entry | null>(null);
  const [detailMode, setDetailMode] = useState<"list" | "grid">("list");
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<Response["meta"]>({
    current_page: 1,
    per_page: 25,
    total: 0,
    last_page: 1,
    from: null,
    to: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get<Response>("/schedule-history", {
        params: { page, per_page: 25 },
      });
      setEntries(response.data.data);
      setMeta(response.data.meta);
    } catch (e: unknown) {
      setError(
        axios.isAxiosError<{ message?: string }>(e)
          ? e.response?.data?.message || "Unable to load schedule history."
          : "Unable to load schedule history.",
      );
    } finally {
      setLoading(false);
    }
  }, [page]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void load();
  }, [load]);

  const snapshots = useMemo(() => selected?.snapshots ?? [], [selected]);
  const printSnapshots = useMemo(() => printingEntry?.snapshots ?? [], [printingEntry]);
  const sections = useMemo(
    () =>
      Array.from(
        new Map(
          snapshots.map((item) => [
            String(item.section_id ?? ""),
            item.section_name || "Section",
          ]),
        ).entries(),
      ),
    [snapshots],
  );
  const cards = useMemo(() => snapshots.map(gridCard), [snapshots]);
  const open = (entry: Entry) => {
    setSelected(entry);
    setDetailMode("list");
    setIsPrintOpen(false);
  };
  const print = (entry: Entry) => {
    setPrintingEntry(entry);
    setIsPrintOpen(true);
  };
  const printingSections = useMemo<Section[]>(
    () => Array.from(new Map(printSnapshots.map((item) => [String(item.section_id ?? ""), item])).values()).map((item) => ({
      id: String(item.section_id ?? ""),
      name: item.section_name || "Section",
      yearLevel: Math.min(4, Math.max(1, Number(item.section_year_level ?? 1))) as Section["yearLevel"],
      semester: (item.section_semester || printingEntry?.semester || "1st") as Section["semester"],
      departmentId: Number(item.snapshot.department_id ?? printingEntry?.department_id ?? 0),
      semesterId: Number(item.snapshot.semester_id ?? printingEntry?.semester_id ?? 0),
      status: "active",
    })),
    [printSnapshots, printingEntry],
  );
  const printingSchedules = useMemo<ScheduleItem[]>(
    () => printSnapshots.map((item) => {
      const mapped = gridCard(item);
      return { ...mapped.schedule, subjectCode: mapped.subject.code, subjectName: mapped.subject.name, status: "finalized" };
    }),
    [printSnapshots],
  );
  const printingDepartments = useMemo<ApiDepartmentRecord[]>(
    () => Array.from(new Map(printSnapshots.map((item) => [Number(item.snapshot.department_id ?? printingEntry?.department_id ?? 0), {
      id: Number(item.snapshot.department_id ?? printingEntry?.department_id ?? 0),
      department_name: item.department_name || "Department",
      department_code: item.department_code || "",
      logo: item.department_logo || null,
    }])).values()),
    [printSnapshots, printingEntry],
  );
  const printingSemester = useMemo<Semester | null>(() => printingEntry ? {
    id: printingEntry.semester_id ?? 0,
    academic_year: printingEntry.academic_year || "",
    semester: (printingEntry.semester || "1st") as Semester["semester"],
    is_active: false,
  } : null, [printingEntry]);

  // Rebuilt each render: the action cells call open/print, which are plain closures.
  const historyColumns: ColumnDef<Entry>[] = [
    { id: "semester", header: "Semester", meta: { cellClassName: "text-sm font-semibold text-gray-900" }, cell: ({ row }) => semesterLabel(row.original.semester) },
    { id: "academic_year", header: "A.Y.", meta: { cellClassName: "text-sm font-semibold text-gray-900" }, cell: ({ row }) => row.original.academic_year || "Archived year" },
    { id: "created_at", header: "Date and time", meta: { cellClassName: "whitespace-nowrap font-medium text-gray-600" }, cell: ({ row }) => date(row.original.created_at) },
    {
      id: "actor",
      header: "Actor",
      cell: ({ row }) => (
        <>
          <p className="text-sm font-medium text-gray-800">{row.original.actor?.name || "System"}</p>
          <p className="font-medium uppercase text-gray-500">{row.original.actor?.role || "system"}</p>
        </>
      ),
    },
    {
      id: "action",
      header: "Action",
      meta: { stopRowClick: true },
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <TableActionButton label="View schedule" variant="view" onClick={() => open(row.original)}>
            <Eye className="h-4 w-4" />
          </TableActionButton>
          <TableActionButton label="Print schedule" variant="print" onClick={() => print(row.original)}>
            <Printer className="h-4 w-4" />
          </TableActionButton>
        </div>
      ),
    },
  ];
  // The server pages the history, so the table renders one page unsorted.
  const historyTable = useDataTable({
    data: entries,
    columns: historyColumns,
    pageSize: false,
    enableSorting: false,
    getRowId: (entry) => String(entry.group_id || entry.id),
  });

  const snapshotTable = useDataTable({
    data: snapshots,
    columns: snapshotColumns,
    pageSize: false,
    getRowId: (item) => String(item.id),
  });

  return (
    <div id="schedule-history-page" className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {error ? (
          <div
            role="alert"
            className="p-10 text-center text-sm font-semibold text-red-700"
          >
            {error}
          </div>
        ) : (
          <DataTable
            table={historyTable}
            variant="embedded"
            isLoading={loading}
            ariaLabel="Schedule history"
            onRowClick={open}
            emptyState={
              <>
                <History className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 font-semibold text-gray-700">No schedule history yet</p>
              </>
            }
          />
        )}
        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-600">
          <span>
            {meta.from !== null
              ? `${meta.from}-${meta.to} of ${meta.total}`
              : "0 entries"}
          </span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous page"
              disabled={page <= 1 || loading}
              onClick={() => setPage((v) => v - 1)}
              className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span>
              Page {meta.current_page} of {meta.last_page}
            </span>
            <button
              aria-label="Next page"
              disabled={page >= meta.last_page || loading}
              onClick={() => setPage((v) => v + 1)}
              className="rounded-md border border-gray-300 p-1.5 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
          >
            <div className="flex shrink-0 items-start justify-between border-b border-gray-200 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[#5A1220]">
                  {label(selected.action)}
                </p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">
                  {selected.schedule_label}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {date(selected.created_at)} · {selected.schedule_count}{" "}
                  related schedule{selected.schedule_count === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close details"
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setDetailMode("list")}
                    aria-pressed={detailMode === "list"}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold ${detailMode === "list" ? "bg-[#4e0a10] text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                  >
                    <List size={14} /> List View
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailMode("grid")}
                    aria-pressed={detailMode === "grid"}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold ${detailMode === "grid" ? "bg-[#4e0a10] text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                  >
                    <CalendarDays size={14} /> Weekly Grid
                  </button>
                </div>
              </div>
              {detailMode === "list" ? (
                <DataTable
                  table={snapshotTable}
                  variant="embedded"
                  density="compact"
                  className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200"
                  scrollClassName="min-h-0 flex-1 overflow-auto"
                  ariaLabel="Schedules in this history entry"
                  emptyTitle="No schedules were captured in this entry."
                  emptyDescription=""
                />
              ) : cards.length === 0 ? (
                <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
                  The selected history entry has no timetable snapshot for this
                  section.
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                  <WeeklyTimetableGrid
                    days={WEEK_DAYS}
                    slotCount={slotCount()}
                    minWidth={840}
                    getDayCount={(dayIndex) =>
                      cards.filter(
                        ({ schedule }) => schedule.day === WEEK_DAYS[dayIndex],
                      ).length
                    }
                  >
                    {cards.map(({ schedule, subject }) => (
                      <ScheduleCard
                        key={schedule.id}
                        rooms={[]}
                        schedule={schedule}
                        subject={subject}
                        isEditable={false}
                        isPhase2Active={false}
                        currentStatus="finalized"
                        draggedScheduleId={null}
                        isMoving={false}
                        deleteConfirmScheduleId={null}
                        setDeleteConfirmScheduleId={noop}
                        onDragStart={noop}
                        onDragEnd={noop}
                        onDelete={noop}
                        onCardClick={noop}
                        slotHeight={SLOT_HEIGHT_PX}
                        isWideView
                      />
                    ))}
                  </WeeklyTimetableGrid>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <PrintSchedule
        sections={printingSections}
        departments={printingDepartments}
        users={[]}
        isPrintModalOpen={isPrintOpen}
        setIsPrintModalOpen={setIsPrintOpen}
        allSchedules={printingSchedules}
        selectedSectionId={printingSections[0]?.id ?? ""}
        activeSemester={printingSemester}
      />
    </div>
  );
}
