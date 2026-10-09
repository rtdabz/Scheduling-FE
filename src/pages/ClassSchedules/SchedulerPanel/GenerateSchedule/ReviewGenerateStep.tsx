import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Layers,
  ListOrdered,
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
import YearLevelStateNotice from "./YearLevelStateNotice";
import { yearLabel } from "./yearLabel";
import type { YearLevelScheduleState } from "./yearLevelGenerationEligibility";
import {
  consecutiveRulesBySection,
  consecutiveSummary,
  type ConsecutiveDayRule,
} from "./courseClassConfig";

export type ReviewCourseRow = {
  course: Course;
  hybrid: boolean;
  integratedOnSite?: boolean;
  split: boolean;
  customDuration?: string | null;
  preferredRoom?: string | null;
};

export type ReviewRule = {
  label: string;
  detail: string;
  kind: "core" | "setup";
};

function RuleGroup({
  title,
  rules,
  tone,
}: {
  title: string;
  rules: ReviewRule[];
  tone: string;
}) {
  return (
    <div>
      <p className="px-1 pb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <ul className="space-y-1">
        {rules.map((rule) => (
          <li
            key={rule.label}
            className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1.5"
          >
            <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
            <span className="min-w-0">
              <span className="block text-xs font-black text-slate-800">{rule.label}</span>
              <span className="block text-[11px] font-semibold leading-snug text-slate-500">
                {rule.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const elapsedLabel =(ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
};

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

type PlanRow = ReviewCourseRow & {
  forcedDays: string[];
  field: boolean;
  consecutive: string | null;
  consecutiveDays: number | null;
};

const planColumns: ColumnDef<PlanRow>[] = [
  {
    id: "course",
    accessorFn: (row) => row.course.code,
    header: "Course",
    cell: ({ row }) => (
      <>
        <span className="block text-xs font-black text-slate-900">{row.original.course.code}</span>
        <span className="block whitespace-nowrap text-[11px] font-semibold text-slate-500">{row.original.course.name}</span>
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
    accessorFn: (row) =>
      row.consecutiveDays
        ? `${row.consecutiveDays} back-to-back days`
        : row.hybrid
          ? "Lecture + lab, separate"
          : row.split
            ? "Two sessions a week"
            : "Single meeting",
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
        {row.consecutive && (
          <Tag tone="bg-teal-100 text-teal-900">
            <ListOrdered className="h-2.5 w-2.5" />
            {row.consecutive}
          </Tag>
        )}
        {row.customDuration && (
          <Tag tone="bg-rose-100 text-rose-900">
            <Clock3 className="h-2.5 w-2.5" />
            {row.customDuration}
          </Tag>
        )}
        {row.preferredRoom && !row.field && (
          <Tag tone="bg-slate-200 text-slate-800">
            <DoorOpen className="h-2.5 w-2.5" />
            {row.preferredRoom}
          </Tag>
        )}
        {!row.field &&
          !row.hybrid &&
          !row.split &&
          !row.consecutive &&
          !row.customDuration &&
          (!row.preferredRoom || row.field) &&
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
      note: "Rooms, conflicts and required days",
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

export default function ReviewGenerateStep({
  activeSemester,
  yearLevel,
  curriculumName,
  sections,
  courseRows,
  preferredDays = [],
  forcedDayRules,
  consecutiveDayRules = [],
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
  preferredDays?: string[];
  forcedDayRules: Array<{ course_id: number; day: string }>;
  consecutiveDayRules?: ConsecutiveDayRule[];
  fieldCourseCodes: string[];
  activeRules: ReviewRule[];
  generating: boolean;
  blockedReason: string | null;
  yearState?: YearLevelScheduleState | null;
}) {
  const coreRules = activeRules.filter((rule) => rule.kind === "core");
  const setupRules = activeRules.filter((rule) => rule.kind === "setup");
  const hybridCourses = courseRows.filter((row) => row.hybrid);
  const splitCourses = courseRows.filter((row) => row.split);
  const fieldCodes = new Set(fieldCourseCodes);
  const forcedDaysByCourseId = new Map<string, string[]>();
  forcedDayRules.forEach((rule) => {
    const key = String(rule.course_id);
    forcedDaysByCourseId.set(key, [
      ...(forcedDaysByCourseId.get(key) ?? []),
      rule.day,
    ]);
  });

  const consecutiveFor = (courseId: string) => {
    const bySection = consecutiveRulesBySection(courseId, consecutiveDayRules, sections);
    const first = bySection.values().next().value as ConsecutiveDayRule | undefined;
    if (!first) return { consecutive: null, consecutiveDays: null };
    const scope =
      bySection.size < sections.length
        ? ` · ${sections.filter((section) => bySection.has(section.id)).map((section) => section.name).join(", ")}`
        : "";
    return {
      consecutive: `${consecutiveSummary(first.day_count, first.preferred_start_day, first.meeting_days ?? null)}${scope}`,
      consecutiveDays: first.day_count,
    };
  };

  const planRows: PlanRow[] = courseRows.map((row) => ({
    ...row,
    forcedDays: forcedDaysByCourseId.get(String(row.course.id)) ?? [],
    field: fieldCodes.has(row.course.code),
    ...consecutiveFor(String(row.course.id)),
  }));
  const ruledCourseCount = planRows.filter(
    (row) =>
      row.hybrid ||
      row.split ||
      Boolean(row.consecutive) ||
      row.field ||
      Boolean(row.customDuration) ||
      Boolean(row.preferredRoom) ||
      row.forcedDays.length > 0,
  ).length;

  const splitLoad = hybridCourses.length + splitCourses.length;
  const costNotices: string[] = [
    ...(splitLoad >= 3
      ? [
          `${splitLoad} courses are split into two meetings across ${sections.length} section${sections.length === 1 ? "" : "s"}. Splitting raises the search budget, so expect this run to take noticeably longer.`,
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

  const fullSemesterLabel = activeSemester
    ? `${activeSemester.academic_year} · ${activeSemester.semester.toUpperCase()} Semester`
    : "No active semester";

  return (
    <div className="flex flex-1 flex-col gap-2.5">
      {generating ? (
        <GeneratingView
          scopeLabel={`${yearLabel(yearLevel, sections)} · ${fullSemesterLabel}`}
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
                  {yearLabel(yearLevel, sections)}
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

          <div className="grid min-w-0 flex-1 gap-2.5 xl:grid-cols-3">
            <Panel
              icon={BookOpen}
              title="Course plan"
              meta={`${courseRows.length} course${courseRows.length === 1 ? "" : "s"}`}
              className="xl:col-span-2"
            >
              <div>
                <DataTable
                  table={planTable}
                  variant="embedded"
                  density="compact"
                  ariaLabel="Course plan"
                  emptyState={<p className="text-xs font-semibold text-slate-500">No courses in scope for this year level.</p>}
                />
              </div>
            </Panel>

            <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
              <Panel
                icon={ShieldCheck}
                title="Rules applied"
                meta={`${activeRules.length}`}
                className="flex-1"
              >
                <div className="min-h-0 flex-1 space-y-3 overflow-auto p-2.5">
                  <RuleGroup
                    title="Always enforced"
                    rules={coreRules}
                    tone="text-emerald-600"
                  />
                  {setupRules.length > 0 ? (
                    <RuleGroup
                      title="From your setup"
                      rules={setupRules}
                      tone="text-[#4e0a10]"
                    />
                  ) : (
                    <p className="px-1 text-[11px] font-semibold text-slate-400">
                      No course rules were set in Setup.
                    </p>
                  )}
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
