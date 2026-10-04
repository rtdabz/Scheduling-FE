import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  Printer,
  RefreshCw,
} from "lucide-react";
import api from "../../lib/api";
import { getCachedData, hasCachedData, setCachedData } from "../../lib/dataCache";
import { WEEK_DAYS } from "../../components/scheduling/WeeklyTimetableGrid";
import { formatTime12h, timeToSlot } from "../../lib/timeGrid";
import { scheduleLocationLabel } from "../../lib/scheduleLocation";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "../../components/ui/DataTable";
import { useDataTable } from "../../components/ui/useDataTable";
import type {
  ApiDepartmentRecord,
  DeliveryMode,
  ScheduleItem,
  UserSummary,
  Section,
  Subject,
  Semester,
} from "../ClassSchedules/SchedulerPanel/types";
import PrintSchedule from "../ClassSchedules/SchedulerPanel/PrintSchedule";
import type { SchedulePdfInput } from "../ClassSchedules/SchedulerPanel/schedulePdf";
import ScheduleApprovalPreviewModal from "../../components/scheduling/ScheduleApprovalPreviewModal";
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
  rejection_reason?: string | null;
  department?: ApiDepartmentRecord | null;
  users?: UserSummary[];
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

type HistoryType = "" | "approved" | "rejected" | "recalled";
const TYPE_OPTIONS: [Exclude<HistoryType, "">, string][] = [
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["recalled", "Recalled"],
];
const ACTIONS: Record<string, { label: string; tone: string }> = {
  schedule_approved_by_dean: { label: "Approved by Dean", tone: "bg-emerald-50 text-emerald-700" },
  schedule_approved_by_vpaa: { label: "Approved by VPAA", tone: "bg-emerald-50 text-emerald-700" },
  schedule_returned_by_dean: { label: "Rejected by Dean", tone: "bg-red-50 text-red-700" },
  schedule_returned_by_vpaa: { label: "Rejected by VPAA", tone: "bg-red-50 text-red-700" },
  schedule_withdrawn: { label: "Recalled", tone: "bg-amber-50 text-amber-700" },
};
const label = (value: string) =>
  ACTIONS[value]?.label ??
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

const pdfInputFor = (entry: Entry): SchedulePdfInput => {
  const departmentOf = (item: Snapshot) => Number(item.snapshot.department_id ?? entry.department_id ?? 0);
  const sections: Section[] = Array.from(
    new Map(entry.snapshots.map((item) => [String(item.section_id ?? ""), item])).values(),
  )
    .map((item) => ({
      id: String(item.section_id ?? ""),
      name: item.section_name || "Section",
      yearLevel: Math.min(4, Math.max(1, Number(item.section_year_level ?? 1))) as Section["yearLevel"],
      semester: (item.section_semester || entry.semester || "1st") as Section["semester"],
      departmentId: departmentOf(item),
      programId: item.snapshot.program_id == null ? undefined : Number(item.snapshot.program_id),
      semesterId: Number(item.snapshot.semester_id ?? entry.semester_id ?? 0),
      status: "active" as const,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const departments: ApiDepartmentRecord[] = Array.from(
    new Map(entry.snapshots.map((item) => [departmentOf(item), {
      id: departmentOf(item),
      department_name: item.department_name || entry.department?.department_name || "Department",
      department_code: item.department_code || entry.department?.department_code || "",
      logo: item.department_logo || entry.department?.logo || null,
    }])).values(),
  );
  return {
    sections,
    allSchedules: entry.snapshots.map((item) => {
      const mapped = gridCard(item);
      return { ...mapped.schedule, subjectCode: mapped.subject.code, subjectName: mapped.subject.name };
    }),
    selectedSectionId: sections[0]?.id ?? "",
    departments,
    users: entry.users ?? [],
    activeSemester: {
      id: entry.semester_id ?? 0,
      academic_year: entry.academic_year || "",
      semester: (entry.semester || "1st") as Semester["semester"],
      is_active: false,
    },
  };
};

const previewStatus = (action: string): "approved" | "rejected" | "pending" =>
  action.startsWith("schedule_approved") ? "approved" : action.startsWith("schedule_returned") ? "rejected" : "pending";

const historyCacheKey = (page: number, type: HistoryType): string => `page:schedule-overview:history:${page}:${type}`;

export default function ScheduleHistory() {
  const [cached] = useState(() => getCachedData<Response>(historyCacheKey(1, "")));
  const [entries, setEntries] = useState<Entry[]>(cached?.data ?? []);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [printingEntry, setPrintingEntry] = useState<Entry | null>(null);
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<HistoryType>("");
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<Response["meta"]>(cached?.meta ?? {
    current_page: 1,
    per_page: 25,
    total: 0,
    last_page: 1,
    from: null,
    to: null,
  });

  const load = useCallback(async () => {
    const cacheKey = historyCacheKey(page, type);
    const cachedPage = getCachedData<Response>(cacheKey);
    if (cachedPage) {
      setEntries(cachedPage.data);
      setMeta(cachedPage.meta);
    }
    if (!hasCachedData(cacheKey)) setLoading(true);
    setError("");
    try {
      const response = await api.get<Response>("/schedule-history", {
        params: { page, per_page: 25, type: type || undefined },
      });
      setEntries(response.data.data);
      setMeta(response.data.meta);
      setCachedData<Response>(cacheKey, response.data);
    } catch (e: unknown) {
      setError(
        axios.isAxiosError<{ message?: string }>(e)
          ? e.response?.data?.message || "Unable to load schedule history."
          : "Unable to load schedule history.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, type]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const open = (entry: Entry) => {
    setSelected(entry);
    setIsPrintOpen(false);
  };
  const print = (entry: Entry) => {
    setPrintingEntry(entry);
    setIsPrintOpen(true);
  };
  const viewInput = useMemo(() => (selected ? pdfInputFor(selected) : null), [selected]);
  const printInput = useMemo(() => (printingEntry ? pdfInputFor(printingEntry) : null), [printingEntry]);

  const historyColumns: ColumnDef<Entry>[] = [
    {
      id: "decision",
      header: "Decision",
      cell: ({ row }) => (
        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${ACTIONS[row.original.action]?.tone ?? "bg-gray-100 text-gray-600"}`}>
          {label(row.original.action)}
        </span>
      ),
    },
    { id: "schedule", header: "Schedule", meta: { cellClassName: "text-sm font-semibold text-gray-900" }, cell: ({ row }) => row.original.schedule_label },
    { id: "semester", header: "Semester", meta: { cellClassName: "text-sm font-semibold text-gray-900" }, cell: ({ row }) => semesterLabel(row.original.semester) },
    { id: "academic_year", header: "A.Y.", meta: { cellClassName: "text-sm font-semibold text-gray-900" }, cell: ({ row }) => row.original.academic_year || "—" },
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
  const historyTable = useDataTable({
    data: entries,
    columns: historyColumns,
    pageSize: false,
    enableSorting: false,
    getRowId: (entry) => String(entry.group_id || entry.id),
  });

  return (
    <div id="schedule-history-page" className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <select
          aria-label="Decision"
          value={type}
          onChange={(event) => {
            setType(event.target.value as HistoryType);
            setPage(1);
          }}
          className="w-full max-w-[200px] rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-[#5A1220]"
        >
          <option value="">All decisions</option>
          {TYPE_OPTIONS.map(([value, text]) => (
            <option key={value} value={value}>{text}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { setLoading(true); void load(); }}
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
        <ScheduleApprovalPreviewModal
          open
          title={`${selected.schedule_label} (${label(selected.action)})`}
          status={previewStatus(selected.action)}
          statusLabel={label(selected.action)}
          printInput={viewInput}
          canAct={false}
          checks={
            <div className="px-5 py-3 text-sm text-gray-600">
              {date(selected.created_at)}
              {selected.actor ? ` · by ${selected.actor.name}` : ""}
              {" · "}
              {selected.section_count} section{selected.section_count === 1 ? "" : "s"}
              {selected.rejection_reason && (
                <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-red-800">
                  <span className="font-semibold">Reason:</span> {selected.rejection_reason}
                </p>
              )}
            </div>
          }
          onApprove={noop}
          onReject={noop}
          onClose={() => setSelected(null)}
        />
      )}
      {printInput && (
        <PrintSchedule
          {...printInput}
          isPrintModalOpen={isPrintOpen}
          setIsPrintModalOpen={setIsPrintOpen}
        />
      )}
    </div>
  );
}
