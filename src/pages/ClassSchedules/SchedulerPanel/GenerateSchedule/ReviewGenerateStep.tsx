import { useId } from "react";
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  Check,
  Clock3,
  DoorOpen,
  ListOrdered,
  MapPin,
  ShieldCheck,
  Split,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable from "../../../../components/ui/DataTable";
import { useDataTable } from "../../../../components/ui/useDataTable";
import { useGenerationRun } from "../hooks/useGenerationRun";
import type { Course, Section, Semester } from "../types";
import { isConfiguredFieldCourse } from "../schedulingConfigurationEligibility";
import { yearLevelStateCondition } from "./yearLevelStateCondition";
import SchedulingConditions, { type SchedulingCondition } from "./SchedulingConditions";
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
  /** How the course is delivered, as chosen in Setup Courses. */
  delivery?: "onsite" | "hybrid" | "online";
  split: boolean;
  preferredRoom?: string | null;
  /** Lecture/Laboratory Required Day labels, with sections when they differ. */
  componentDays?: string[];
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
  empty,
}: {
  title: string;
  rules: ReviewRule[];
  tone: string;
  empty?: string;
}) {
  return (
    <div>
      <p className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {title}
        <span className="tabular-nums text-slate-400">{rules.length}</span>
      </p>
      {rules.length === 0 ? (
        <p className="px-3 py-2 text-[11px] font-medium text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rules.map((rule) => (
            <li key={rule.label} className="flex items-start gap-2 px-3 py-1.5">
              <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-slate-800">{rule.label}</span>
                <span className="block text-[11px] font-medium leading-snug text-slate-500">
                  {rule.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
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
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/[0.08] px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">{label}</p>
      <p className="mt-0.5 text-lg font-bold leading-none tabular-nums text-white">{value}</p>
      <p className="mt-1 text-[10px] font-medium leading-tight text-white/65">{hint}</p>
    </div>
  );
}

function ScopeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-white/55">{label}</dt>
      <dd className="text-xs font-semibold text-white">{value}</dd>
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
  icon: typeof BookOpen;
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
          <Icon className="h-3.5 w-3.5 text-[#4e0a10]" />
          {title}
        </h3>
        {meta && (
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">
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

const DELIVERY_LABEL: Record<NonNullable<ReviewCourseRow["delivery"]>, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  online: "Online",
};

const meetingsLabel = (row: PlanRow) =>
  row.consecutiveDays
    ? `${row.consecutiveDays} back-to-back days`
    : row.hybrid
      ? "Integrated"
      : row.split
        ? "Two sessions a week"
        : "Single meeting";

const meetingsDetail = (row: PlanRow) =>
  row.consecutiveDays
    ? "One meeting each day"
    : row.hybrid
      ? "Lecture and laboratory meet separately"
      : row.split
        ? "Split across two days"
        : "Once a week";

const DELIVERY_TONE: Record<NonNullable<ReviewCourseRow["delivery"]>, string> = {
  onsite: "bg-slate-100 text-slate-700",
  hybrid: "bg-sky-50 text-sky-800",
  online: "bg-emerald-50 text-emerald-700",
};
const RULE_TONE = "border border-slate-200 bg-white text-slate-700";

const planColumns: ColumnDef<PlanRow>[] = [
  {
    id: "course",
    accessorFn: (row) => row.course.code,
    header: "Course",
    meta: { cellClassName: "min-w-[12rem]" },
    cell: ({ row }) => (
      <>
        <span className="block text-xs font-bold text-slate-900">{row.original.course.code}</span>
        <span className="block text-[11px] font-medium leading-snug text-slate-500">{row.original.course.name}</span>
      </>
    ),
  },
  {
    id: "units",
    accessorFn: (row) => Number(row.course.units) || 0,
    header: "Units",
    meta: { align: "right", cellClassName: "whitespace-nowrap tabular-nums text-slate-900" },
  },
  {
    id: "meetings",
    accessorFn: meetingsLabel,
    header: "Meetings",
    meta: { cellClassName: "whitespace-nowrap" },
    cell: ({ row: { original: row } }) => (
      <>
        <span className="block text-xs font-semibold text-slate-800">{meetingsLabel(row)}</span>
        <span className="block text-[11px] font-medium text-slate-500">{meetingsDetail(row)}</span>
      </>
    ),
  },
  {
    id: "rules",
    header: "Delivery and rules",
    enableSorting: false,
    cell: ({ row: { original: row } }) => (
      <span className="flex flex-wrap gap-1">
        {row.field ? (
          <Tag tone="bg-amber-50 text-amber-800">
            <MapPin className="h-2.5 w-2.5" />
            Field
          </Tag>
        ) : (
          <Tag tone={DELIVERY_TONE[row.delivery ?? "onsite"]}>
            {DELIVERY_LABEL[row.delivery ?? "onsite"]}
          </Tag>
        )}
        {row.forcedDays.map((day) => (
          <Tag key={day} tone={RULE_TONE}>
            <CalendarDays className="h-2.5 w-2.5" />
            {day}
          </Tag>
        ))}
        {(row.componentDays ?? []).map((label) => (
          <Tag key={label} tone={RULE_TONE}>
            <CalendarDays className="h-2.5 w-2.5" />
            {label}
          </Tag>
        ))}
        {row.split && <Tag tone={RULE_TONE}>Split</Tag>}
        {row.consecutive && (
          <Tag tone={RULE_TONE}>
            <ListOrdered className="h-2.5 w-2.5" />
            {row.consecutive}
          </Tag>
        )}
        {row.preferredRoom && !row.field && (
          <Tag tone={RULE_TONE}>
            <DoorOpen className="h-2.5 w-2.5" />
            {row.preferredRoom}
          </Tag>
        )}
      </span>
    ),
  },
];

function Tag({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {children}
    </span>
  );
}

// Dual-ring spinner geometry (100 × 100 viewBox). The outer ring sits still;
// the inner arc rotates. Ring edges: outer 44–48, inner 31–39, so a 5-unit
// gap separates them all the way round.
const SPINNER_OUTER_R = 46;
const SPINNER_INNER_R = 35;
const SPINNER_INNER_C = 2 * Math.PI * SPINNER_INNER_R; // ≈ 219.9
const SPINNER_ARC = 88; // ≈ 40% of the inner circumference
// A thin amber line inside the arc's head; its round cap stays within the
// maroon cap, so it reads as a highlight rather than a second colour.
const SPINNER_HIGHLIGHT = 7;
// The arc starts at 3 o'clock and runs clockwise for SPINNER_ARC; its head
// (the leading end while rotating clockwise) is where the gradient is solid.
const SPINNER_HEAD_ANGLE = (SPINNER_ARC / SPINNER_INNER_C) * 2 * Math.PI;
const SPINNER_HEAD = {
  x: 50 + SPINNER_INNER_R * Math.cos(SPINNER_HEAD_ANGLE),
  y: 50 + SPINNER_INNER_R * Math.sin(SPINNER_HEAD_ANGLE),
};

function DualRingSpinner({ spinning }: { spinning: boolean }) {
  const gradientId = `${useId()}-arc`;

  return (
    <span className="relative block h-[100px] w-[100px]" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle
          cx="50"
          cy="50"
          r={SPINNER_OUTER_R}
          fill="none"
          stroke="#E6DED5"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <svg
        viewBox="0 0 100 100"
        className={`absolute inset-0 h-full w-full ${
          spinning
            ? "motion-safe:animate-[spin_1.4s_cubic-bezier(0.5,0.15,0.5,0.85)_infinite] motion-safe:will-change-transform"
            : ""
        }`}
      >
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={50 + SPINNER_INNER_R}
            y1="50"
            x2={SPINNER_HEAD.x}
            y2={SPINNER_HEAD.y}
          >
            <stop offset="0%" stopColor="#5A1220" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#5A1220" stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={SPINNER_INNER_R}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${SPINNER_ARC} ${SPINNER_INNER_C}`}
        />
        <circle
          cx="50"
          cy="50"
          r={SPINNER_INNER_R}
          fill="none"
          stroke="#F5A623"
          strokeOpacity="0.9"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${SPINNER_HIGHLIGHT} ${SPINNER_INNER_C}`}
          transform={`rotate(${((SPINNER_ARC - SPINNER_HIGHLIGHT) / SPINNER_INNER_C) * 360} 50 50)`}
        />
      </svg>
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
  const workload = `${courseCount} course${courseCount === 1 ? "" : "s"} across ${sectionCount} section${sectionCount === 1 ? "" : "s"}`;
  // Every state below comes straight from the run record: the queue status,
  // the worker's pickup, the engine's own "still searching" report, and the
  // final outcome. The engine reports no percentage, so none is shown.
  const searching = run.status === "running" && run.failure?.provisional === true;
  const view: {
    tone: "active" | "done" | "error";
    title: string;
    description: string;
    /** Lifecycle position: 0 queued, 1 generating, 2 finished. */
    position: 0 | 1 | 2;
    notice: { tone: "warn" | "error"; text: string } | null;
  } =
    run.status === "completed"
      ? {
          tone: "done",
          title: "Timetable ready",
          description: `${workload} placed. Opening the generated timetable for review.`,
          position: 2,
          notice: null,
        }
      : run.status === "failed"
        ? {
            tone: "error",
            title: "Generation stopped",
            description: "No timetable was saved. Review the details to adjust the setup and try again.",
            position: 2,
            notice: run.errorMessage ? { tone: "error", text: run.errorMessage } : null,
          }
        : searching
          ? {
              tone: "active",
              title: "Still searching for a timetable",
              description: `The engine is trying further arrangements for ${workload}.`,
              position: 1,
              notice: run.failure?.message ? { tone: "warn", text: run.failure.message } : null,
            }
          : run.status === "running"
            ? {
                tone: "active",
                title: "Arranging classes",
                description: `Placing ${workload} while checking room availability, scheduling conflicts, and required days.`,
                position: 1,
                notice: null,
              }
            : {
                tone: "active",
                title: "Queued for the scheduler",
                description: "The run is queued and starts as soon as a scheduling worker picks it up.",
                position: 0,
                notice: run.workerStalled
                  ? {
                      tone: "warn",
                      text: "The run has not been picked up yet. If this continues, verify that a worker is consuming the scheduling queue.",
                    }
                  : null,
              };

  const lifecycle = ["Queued", "Generating", view.tone === "error" ? "Stopped" : "Ready"];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={view.tone === "active"}
      className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-surface px-6 py-10"
    >
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <DualRingSpinner spinning={view.tone === "active"} />

        <h2 className="mt-6 text-xl font-bold leading-tight text-text">{view.title}</h2>
        <p className="mt-1.5 text-xs font-semibold text-slate-600">{scopeLabel}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">{view.description}</p>

        <div className="mt-6 w-full max-w-xs" aria-label={`Run status: ${lifecycle[view.position]}`}>
          <div className="flex gap-1.5" aria-hidden="true">
            {lifecycle.map((label, index) => (
              <span
                key={label}
                className={`h-1 flex-1 overflow-hidden rounded-full transition-colors duration-500 ${
                  index < view.position || (index === view.position && view.tone !== "active")
                    ? view.tone === "error" && index === view.position
                      ? "bg-rose-600"
                      : view.tone === "done"
                        ? "bg-stage-done"
                        : "bg-primary"
                    : index === view.position
                      ? "bg-[linear-gradient(90deg,rgba(78,10,16,0.15)_0%,rgba(78,10,16,0.75)_50%,rgba(78,10,16,0.15)_100%)] bg-[length:200%_100%] motion-safe:animate-shimmer"
                      : "bg-stage-idle"
                }`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex text-[10px] font-bold uppercase tracking-wide">
            {lifecycle.map((label, index) => (
              <span
                key={label}
                className={`flex-1 ${index === 0 ? "text-left" : index === 2 ? "text-right" : "text-center"} ${
                  index <= view.position ? "text-slate-700" : "text-slate-400"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <p className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums text-muted">
          <Clock3 className="h-3.5 w-3.5" />
          {elapsedLabel(run.elapsedMs)} elapsed
        </p>

        {view.notice && (
          <p
            className={`mt-5 w-full rounded-lg px-3 py-2 text-left text-xs font-semibold leading-relaxed ${
              view.notice.tone === "error" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-stage-warnText"
            }`}
          >
            {view.notice.text}
          </p>
        )}
      </div>
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
      field: isConfiguredFieldCourse(row.course, fieldCodes),
    ...consecutiveFor(String(row.course.id)),
  }));
  const ruledCourseCount = planRows.filter(
    (row) =>
      row.hybrid ||
      row.split ||
      Boolean(row.consecutive) ||
      row.field ||
      Boolean(row.preferredRoom) ||
      (row.componentDays ?? []).length > 0 ||
      row.forcedDays.length > 0,
  ).length;

  const splitLoad = hybridCourses.length + splitCourses.length;
  // Same triggers and wording as the former stacked banners, gathered into one collapsible list.
  const yearLevelCondition = yearLevelStateCondition(yearState);
  const conditions: SchedulingCondition[] = [
    ...(yearLevelCondition ? [yearLevelCondition] : []),
    ...(splitLoad >= 3
      ? [{
          id: "split-load",
          tone: "warning" as const,
          icon: Split,
          title: "Longer run time",
          text: `${splitLoad} courses are split into two meetings across ${sections.length} section${sections.length === 1 ? "" : "s"}. Splitting raises the search budget, so expect this run to take noticeably longer.`,
        }]
      : []),
    ...(preferredDays.length > 0
      ? [{
          id: "preferred-days",
          tone: "warning" as const,
          icon: CalendarRange,
          title: "Preferred Days only",
          text: `Classes are limited to the Preferred Days (${preferredDays.join(", ")}). Fewer days leave less room, and a load the days cannot hold fails the run instead of using another day.`,
        }]
      : []),
  ];

  const planTable = useDataTable<PlanRow>({
    data: planRows,
    columns: planColumns,
    pageSize: false,
    getRowId: (row) => String(row.course.id),
  });

  const semesterLabel = activeSemester
    ? `${activeSemester.semester.toUpperCase()} Semester`
    : "No active semester";
  const fullSemesterLabel = activeSemester
    ? `${activeSemester.academic_year} · ${semesterLabel}`
    : semesterLabel;

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
          <section
            aria-label="Generation scope"
            className="shrink-0 rounded-xl bg-[#4e0a10] px-4 py-3 text-white"
          >
            <div className="grid gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e8d5c4]/80">
                  Generation scope
                </p>
                <h2 className="mt-0.5 text-lg font-bold leading-tight">
                  {yearLabel(yearLevel, sections)}
                </h2>
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
                  <ScopeFact
                    label="Academic year"
                    value={activeSemester?.academic_year ?? "Not set"}
                  />
                  <ScopeFact label="Semester" value={semesterLabel} />
                  <ScopeFact
                    label="Curriculum"
                    value={curriculumName ?? "No curriculum assigned"}
                  />
                  <ScopeFact
                    label="Days"
                    value={
                      preferredDays.length > 0
                        ? preferredDays.map((day) => day.slice(0, 3)).join(", ")
                        : "Any day"
                    }
                  />
                </dl>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile
                  label="Sections"
                  value={sections.length}
                  hint="In this run"
                />
                <StatTile
                  label="Courses"
                  value={courseRows.length}
                  hint={`${ruledCourseCount} with rules`}
                />
                <StatTile
                  label="Split"
                  value={splitLoad}
                  hint={`${hybridCourses.length} hybrid · ${splitCourses.length} session`}
                />
                <StatTile
                  label="Rules"
                  value={activeRules.length}
                  hint="Enforced by the engine"
                />
              </div>
            </div>
            {sections.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/15 pt-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
                  Sections
                </span>
                {sections.map((section) => (
                  <span
                    key={section.id}
                    className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                  >
                    {section.name}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* The blocked reason explains the disabled Generate button, so it always stays visible. */}
          {blockedReason ? (
            <p
              role="alert"
              className="shrink-0 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800"
            >
              {blockedReason}
            </p>
          ) : (
            <SchedulingConditions conditions={conditions} className="shrink-0" />
          )}

          <div className="grid min-w-0 gap-2.5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_21rem]">
            <Panel
              icon={BookOpen}
              title="Course plan"
              meta={`${courseRows.length} course${courseRows.length === 1 ? "" : "s"}`}
            >
              <DataTable
                table={planTable}
                variant="embedded"
                density="compact"
                ariaLabel="Course plan"
                scrollClassName="overflow-x-auto"
                emptyState={<p className="text-xs font-semibold text-slate-500">No courses in scope for this year level.</p>}
              />
            </Panel>

            <Panel
              icon={ShieldCheck}
              title="Rules applied"
              meta={`${activeRules.length} rule${activeRules.length === 1 ? "" : "s"}`}
            >
              <RuleGroup
                title="Always enforced"
                rules={coreRules}
                tone="text-emerald-600"
                empty="No engine rules are listed."
              />
              <div className="border-t border-slate-200">
                <RuleGroup
                  title="Course-specific, from your setup"
                  rules={setupRules}
                  tone="text-[#4e0a10]"
                  empty="No course rules were set in Setup."
                />
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
