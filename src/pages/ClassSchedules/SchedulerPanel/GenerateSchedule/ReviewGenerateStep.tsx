import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Layers,
  Loader2,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "../../../../components/ui/DataTable";
import { useDataTable } from "../../../../components/ui/useDataTable";
import { useGenerationRun } from "../hooks/useGenerationRun";
import type { Course, Section, Semester } from "../types";
import { PERIOD_LABELS, type TimeBlockOption } from "./generationTypes";
import YearLevelStateNotice from "./YearLevelStateNotice";
import type { YearLevelScheduleState } from "./yearLevelGenerationEligibility";

export type ReviewCourseRow = {
  course: Course;
  /** Integrated: lecture and laboratory as two separate sessions. */
  hybrid: boolean;
  /** Integrated On-site: both sessions face-to-face rather than an online lecture. */
  integratedOnSite?: boolean;
  split: boolean;
  /** Setup Courses Custom Time Duration, e.g. "2h", when one was chosen. */
  customDuration?: string | null;
  /** Setup Courses Preferred Room code, when one was chosen. */
  preferredRoom?: string | null;
};

const periodShortLabels: Record<TimeBlockOption, string> = {
  flexible: "Any time",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const periodTones: Record<TimeBlockOption, string> = {
  flexible: "bg-slate-100 text-slate-600",
  morning: "bg-amber-100 text-amber-800",
  afternoon: "bg-sky-100 text-sky-800",
  evening: "bg-indigo-100 text-indigo-800",
};

const yearLabel = (yearLevel: number) => {
  const ordinal =
    yearLevel === 1
      ? "1st"
      : yearLevel === 2
        ? "2nd"
        : yearLevel === 3
          ? "3rd"
          : "4th";

  return `BSIT ${ordinal} year`;
};

const elapsedLabel = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
};

/** Header tile: one number the scheduler checks before committing to a run. */
function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5">
      <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-white/70">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-0.5 text-lg font-black leading-none text-white">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 truncate text-[10px] font-semibold text-white/60">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Panel shell shared by the two review tables and the rule list. */
function Panel({
  icon: Icon,
  title,
  meta,
  children,
  className = "",
}: {
  icon: typeof Users;
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-3 py-1.5">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700">
          <Icon className="h-3.5 w-3.5 text-[#4e0a10]" />
          {title}
        </h3>
        {meta && (
          <span className="shrink-0 text-[11px] font-bold text-slate-500">
            {meta}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * How many sections the meeting-period list shows before it starts to
 * scroll. A year level normally runs to seven sections, so seven rows keep
 * the common case fully visible; a larger year level scrolls rather than
 * squeezing the course table beside it.
 */
const VISIBLE_SECTION_ROWS = 7;
/** One row: a 16px tag, 8px padding top and bottom, 1px divider. */
const SECTION_ROW_PX = 33;
/** The sticky column header above those rows. */
const SECTION_HEADER_PX = 33;

type PlanRow = ReviewCourseRow & { forcedDays: string[]; field: boolean };

const planColumns: ColumnDef<PlanRow>[] = [
  {
    id: "course",
    accessorFn: (row) => row.course.code,
    header: "Course",
    cell: ({ row }) => (
      <>
        <span className="block text-xs font-black text-slate-900">{row.original.course.code}</span>
        <span className="block truncate text-[11px] font-semibold text-slate-500">{row.original.course.name}</span>
      </>
    ),
  },
  {
    id: "units",
    accessorFn: (row) => Number(row.course.units) || 0,
    header: "Units",
    meta: { cellClassName: "whitespace-nowrap" },
  },
  {
    id: "meetings",
    accessorFn: (row) => (row.hybrid ? "Lecture + lab, separate" : row.split ? "Two sessions a week" : "Single meeting"),
    header: "Meetings",
  },
  {
    id: "rules",
    header: "Rules",
    enableSorting: false,
    cell: ({ row: { original: row } }) => (
      <span className="flex flex-wrap gap-1">
        {row.forcedDays.map((day) => (
          <Tag key={day} tone="bg-violet-100 text-violet-800">
            <CalendarDays className="h-2.5 w-2.5" />
            {day}
          </Tag>
        ))}
        {row.field && (
          <Tag tone="bg-emerald-100 text-emerald-800">
            <MapPin className="h-2.5 w-2.5" />
            Field
          </Tag>
        )}
        {row.hybrid && (
          <Tag tone="bg-sky-100 text-sky-800">{row.integratedOnSite ? "Integrated" : "Hybrid"}</Tag>
        )}
        {row.split && <Tag tone="bg-amber-100 text-amber-900">Split</Tag>}
        {row.customDuration && (
          <Tag tone="bg-rose-100 text-rose-900">
            <Clock3 className="h-2.5 w-2.5" />
            {row.customDuration}
          </Tag>
        )}
        {row.preferredRoom && (
          <Tag tone="bg-slate-200 text-slate-800">
            <DoorOpen className="h-2.5 w-2.5" />
            {row.preferredRoom}
          </Tag>
        )}
        {!row.field &&
          !row.hybrid &&
          !row.split &&
          !row.customDuration &&
          !row.preferredRoom &&
          row.forcedDays.length === 0 && (
          <span className="text-[11px] font-semibold text-slate-400">Standard</span>
        )}
      </span>
    ),
  },
];

function Tag({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${tone}`}
    >
      {children}
    </span>
  );
}

/**
 * The review summary, replaced in place while a run is in flight.
 *
 * There is no server-side progress to report — the solver reports only queued
 * and running — so the phase list below states which stage the run has
 * reached rather than faking a percentage. The elapsed clock is the honest
 * signal that something is still happening.
 */
function GeneratingView({
  scopeLabel,
  sectionCount,
  courseCount,
}: {
  scopeLabel: string;
  sectionCount: number;
  courseCount: number;
}) {
  const run = useGenerationRun();
  const running = run.status === "running";

  const phases = [
    {
      key: "queued",
      label: "Queued for the scheduler",
      note: "Run handed to the scheduling queue",
      done: running,
      active: !running,
    },
    {
      key: "solving",
      label: "Placing classes",
      note: `${courseCount} course${courseCount === 1 ? "" : "s"} across ${sectionCount} section${sectionCount === 1 ? "" : "s"}`,
      done: false,
      active: running,
    },
    {
      key: "validating",
      label: "Checking every rule",
      note: "Rooms, faculty, conflicts and required days",
      done: false,
      active: false,
    },
  ];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-slate-50/60 px-6 py-6 text-center"
    >
      <span className="relative flex h-24 w-24 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-[6px] border-[#4e0a10]/10" />
        <Loader2 className="h-24 w-24 animate-spin text-[#4e0a10]" strokeWidth={1.5} />
      </span>

      <div>
        <h2 className="text-base font-black text-slate-900">
          {running ? "Generating timetable" : "Waiting for the scheduling queue"}
        </h2>
        <p className="mt-1 text-xs font-semibold text-slate-600">
          {scopeLabel}
        </p>
        <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <Clock3 className="h-3.5 w-3.5" />
          {elapsedLabel(run.elapsedMs)} elapsed
        </p>
      </div>

      <ol className="grid w-full max-w-3xl gap-2.5 sm:grid-cols-3">
        {phases.map((phase, index) => (
          <li
            key={phase.key}
            className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-center transition ${
              phase.active
                ? "border-[#4e0a10]/25 bg-white shadow-sm"
                : "border-slate-200/70 bg-white/50"
            }`}
          >
            {phase.done ? (
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            ) : phase.active ? (
              <Loader2 className="h-7 w-7 animate-spin text-[#4e0a10]" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-200 text-[11px] font-black text-slate-400">
                {index + 1}
              </span>
            )}
            <span
              className={`text-xs font-black ${
                phase.active || phase.done ? "text-slate-900" : "text-slate-400"
              }`}
            >
              {phase.label}
            </span>
            <span className="text-[11px] font-semibold leading-snug text-slate-500">
              {phase.note}
            </span>
          </li>
        ))}
      </ol>

      {run.workerStalled && (
        <p className="max-w-md rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          The run has not been picked up yet. If this continues, verify that a
          worker is consuming the scheduling queue.
        </p>
      )}
    </div>
  );
}

/**
 * Step 3 — everything the run will use, on one screen, then Generate.
 *
 * The per-course rules the earlier steps set are scattered by nature: a
 * forced day here, a field course there, a split session somewhere else.
 * Review is the one place they have to be read together, so they are merged
 * into a single course table with one row per course rather than a card per
 * rule kind — a scheduler reads down one column to check a whole rule.
 *
 * The step is laid out to fit its own height instead of scrolling: the
 * course table is the only part that can outgrow the space, so it is the
 * only element given a scrollbar, and only once a curriculum is long enough
 * to need one.
 *
 * Generate itself lives in the wizard footer, next to Back, so the step
 * spends none of its height on an action bar of its own. Once a run is
 * queued the summary is replaced by the run's progress.
 */
export default function ReviewGenerateStep({
  activeSemester,
  yearLevel,
  curriculumName,
  sections,
  courseRows,
  periodsBySectionId,
  preferredDays = [],
  forcedDayRules,
  fieldCourseCodes,
  activeRules,
  generating,
  blockedReason,
  yearState = null,
}: {
  activeSemester: Semester | null;
  yearLevel: number;
  curriculumName: string | null;
  sections: Section[];
  courseRows: ReviewCourseRow[];
  periodsBySectionId: Record<string, TimeBlockOption>;
  /** Step 1's Preferred Days; empty means any day. */
  preferredDays?: string[];
  forcedDayRules: Array<{ course_id: number; day: string }>;
  fieldCourseCodes: string[];
  activeRules: string[];
  generating: boolean;
  blockedReason: string | null;
  yearState?: YearLevelScheduleState | null;
}) {
  const hybridCourses = courseRows.filter((row) => row.hybrid);
  const splitCourses = courseRows.filter((row) => row.split);
  const restrictedSections = sections.filter(
    (section) => (periodsBySectionId[section.id] ?? "flexible") !== "flexible",
  );

  const fieldCodes = new Set(fieldCourseCodes);
  const forcedDaysByCourseId = new Map<string, string[]>();
  forcedDayRules.forEach((rule) => {
    const key = String(rule.course_id);
    forcedDaysByCourseId.set(key, [
      ...(forcedDaysByCourseId.get(key) ?? []),
      rule.day,
    ]);
  });

  /** One row per course, carrying every rule that course picked up. */
  const planRows = courseRows.map((row) => ({
    ...row,
    forcedDays: forcedDaysByCourseId.get(String(row.course.id)) ?? [],
    field: fieldCodes.has(row.course.code),
  }));
  const ruledCourseCount = planRows.filter(
    (row) =>
      row.hybrid ||
      row.split ||
      row.field ||
      Boolean(row.customDuration) ||
      Boolean(row.preferredRoom) ||
      row.forcedDays.length > 0,
  ).length;

  /**
   * What this configuration will cost to generate.
   *
   * Both shapes below were measured with the year-level benchmark: a section
   * carrying three or more split courses quadruples the solver's per-section
   * budget, and a period that cannot hold a section's load is the one case
   * that fails outright. Saying so here is cheaper than a user waiting out a
   * run and then reading a diagnostic.
   */
  const splitLoad = hybridCourses.length + splitCourses.length;
  const costNotices: string[] = [
    ...(splitLoad >= 3
      ? [
          `${splitLoad} courses are split into two meetings across ${sections.length} section${sections.length === 1 ? "" : "s"}. Splitting raises the search budget, so expect this run to take noticeably longer.`,
        ]
      : []),
    ...(restrictedSections.length > 0
      ? [
          `${restrictedSections.length} section${restrictedSections.length === 1 ? " is" : "s are"} restricted to a teaching period. A period that cannot hold a section's courses fails the run instead of spilling outside it.`,
        ]
      : []),
    ...(preferredDays.length > 0
      ? [
          `Classes are limited to the Preferred Days (${preferredDays.join(", ")}). Fewer days leave less room, and a load the days cannot hold fails the run instead of using another day.`,
        ]
      : []),
  ];

  const planTable = useDataTable<PlanRow>({
    data: planRows,
    columns: planColumns,
    pageSize: false,
    getRowId: (row) => String(row.course.id),
  });

  const periodColumns: ColumnDef<Section>[] = [
    { id: "section", accessorKey: "name", header: "Section", meta: { cellClassName: "font-black text-slate-900" } },
    {
      id: "period",
      accessorFn: (section) => periodsBySectionId[section.id] ?? "flexible",
      header: "Period",
      meta: { align: "right" },
      cell: ({ getValue }) => {
        const period = getValue<TimeBlockOption>();
        return <Tag tone={periodTones[period]}>{periodShortLabels[period]}</Tag>;
      },
    },
  ];
  const periodTable = useDataTable<Section>({
    data: sections,
    columns: periodColumns,
    pageSize: false,
    getRowId: (section) => String(section.id),
  });

  const fullSemesterLabel = activeSemester
    ? `${activeSemester.academic_year} · ${activeSemester.semester.toUpperCase()} Semester`
    : "No active semester";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
      {generating ? (
        <GeneratingView
          scopeLabel={`${yearLabel(yearLevel)} · ${fullSemesterLabel}`}
          sectionCount={sections.length}
          courseCount={courseRows.length}
        />
      ) : (
        <>
          <section className="shrink-0 rounded-xl bg-[#4e0a10] px-3.5 py-2.5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
                  Generation scope
                </p>
                <h2 className="mt-0.5 text-base font-black leading-tight">
                  {yearLabel(yearLevel)}
                </h2>
                <p className="truncate text-[11px] font-semibold text-white/75">
                  {fullSemesterLabel} · {curriculumName ?? "No curriculum assigned"} ·{" "}
                  {preferredDays.length > 0
                    ? preferredDays.map((day) => day.slice(0, 3)).join(", ")
                    : "Any day"}
                </p>
              </div>
              <div className="grid w-full max-w-lg grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile
                  icon={Users}
                  label="Sections"
                  value={sections.length}
                  hint={
                    restrictedSections.length > 0
                      ? `${restrictedSections.length} with a set period`
                      : "All flexible"
                  }
                />
                <StatTile
                  icon={BookOpen}
                  label="Courses"
                  value={courseRows.length}
                  hint={`${ruledCourseCount} with rules`}
                />
                <StatTile
                  icon={Layers}
                  label="Split"
                  value={splitLoad}
                  hint={`${hybridCourses.length} hybrid · ${splitCourses.length} session`}
                />
                <StatTile
                  icon={ShieldCheck}
                  label="Rules"
                  value={activeRules.length}
                  hint="Enforced by the engine"
                />
              </div>
            </div>
            {sections.length > 0 && (
              <p className="mt-2 truncate border-t border-white/15 pt-1.5 text-[11px] font-semibold text-white/70">
                {sections.map((section) => section.name).join(" · ")}
              </p>
            )}
          </section>

          {!blockedReason && (
            <YearLevelStateNotice state={yearState} className="shrink-0" />
          )}

          {(costNotices.length > 0 || blockedReason) && (
            <div className="shrink-0 space-y-1.5">
              {blockedReason ? (
                <p
                  role="alert"
                  className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800"
                >
                  {blockedReason}
                </p>
              ) : (
                costNotices.map((notice) => (
                  <p
                    key={notice}
                    className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{notice}</span>
                  </p>
                ))
              )}
            </div>
          )}

          <div className="grid min-h-0 min-w-0 flex-1 gap-2.5 xl:grid-cols-3">
            <Panel
              icon={BookOpen}
              title="Course plan"
              meta={`${courseRows.length} course${courseRows.length === 1 ? "" : "s"}`}
              className="xl:col-span-2"
            >
              <div className="min-h-0 flex-1 overflow-auto">
                <DataTable
                  table={planTable}
                  variant="embedded"
                  scrollClassName="overflow-visible"
                  density="compact"
                  tableClassName="min-w-[540px]"
                  ariaLabel="Course plan"
                  emptyState={<p className="text-xs font-semibold text-slate-500">No courses in scope for this year level.</p>}
                />
              </div>
            </Panel>

            <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
              <Panel
                icon={Clock3}
                title="Meeting periods"
                meta={`${restrictedSections.length} of ${sections.length} set`}
                className="min-h-0 flex-1"
              >
                <div
                  className="min-h-0 flex-1 overflow-auto"
                  style={{
                    maxHeight:
                      sections.length > VISIBLE_SECTION_ROWS
                        ? VISIBLE_SECTION_ROWS * SECTION_ROW_PX + SECTION_HEADER_PX
                        : undefined,
                  }}
                >
                  <DataTable
                    table={periodTable}
                    variant="embedded"
                    scrollClassName="overflow-visible"
                    density="compact"
                    ariaLabel="Meeting periods"
                    emptyState={<p className="text-xs font-semibold text-slate-500">No sections in scope.</p>}
                  />
                </div>
                {restrictedSections.length > 0 && (
                  <p className="shrink-0 border-t border-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-500">
                    {PERIOD_LABELS[
                      periodsBySectionId[restrictedSections[0].id] ?? "flexible"
                    ]}
                    {restrictedSections.length > 1 ? " and others" : ""} are
                    hard limits — generation fails rather than placing a class
                    outside the period.
                  </p>
                )}
              </Panel>

              <Panel
                icon={ShieldCheck}
                title="Rules applied"
                meta={`${activeRules.length}`}
                className="shrink-0"
              >
                <ul className="flex flex-wrap gap-1 p-2.5">
                  {activeRules.map((rule) => (
                    <li
                      key={rule}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700"
                    >
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      {rule}
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
