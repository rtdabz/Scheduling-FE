import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Clock3,
  Loader2,
  MapPin,
  ShieldCheck,
  Sparkles,
  Split,
  Users,
} from "lucide-react";
import type { Course, Section, Term } from "../types";
import type { TimeBlockOption } from "./generationTypes";

export type ReviewCourseRow = {
  course: Course;
  hybrid: boolean;
  split: boolean;
};

const periodLabels: Record<TimeBlockOption, string> = {
  flexible: "Any time",
  morning: "Morning (7:00 AM - 11:30 AM)",
  afternoon: "Afternoon (11:30 AM - 4:00 PM)",
  evening: "Evening (4:00 PM - 8:30 PM)",
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

function SummaryCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Users;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <header className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#4e0a10]/10 text-[#4e0a10]">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-black text-slate-900">{title}</h3>
      </header>
      <div className="mt-2 text-xs font-semibold text-slate-700">
        {children}
      </div>
    </section>
  );
}

/**
 * Step 3 — everything the run will use, on one screen, then Generate.
 *
 * The button is the only action here: once a run is queued it becomes a
 * loader, so there is never a second click that could queue a duplicate.
 */
export default function ReviewGenerateStep({
  activeTerm,
  yearLevel,
  curriculumName,
  sections,
  courseRows,
  periodsBySectionId,
  forcedDayRules,
  fieldCourseCodes,
  activeRules,
  generating,
  canGenerate,
  blockedReason,
  onGenerate,
}: {
  activeTerm: Term | null;
  yearLevel: number;
  curriculumName: string | null;
  sections: Section[];
  courseRows: ReviewCourseRow[];
  periodsBySectionId: Record<string, TimeBlockOption>;
  forcedDayRules: Array<{ course_id: number; day: string }>;
  fieldCourseCodes: string[];
  activeRules: string[];
  generating: boolean;
  canGenerate: boolean;
  blockedReason: string | null;
  onGenerate: () => void;
}) {
  const hybridCourses = courseRows.filter((row) => row.hybrid);
  const splitCourses = courseRows.filter((row) => row.split);
  const restrictedSections = sections.filter(
    (section) => (periodsBySectionId[section.id] ?? "flexible") !== "flexible",
  );

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
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 max-h-[62vh] flex-1 overflow-y-auto">
        <div className="grid gap-3 lg:grid-cols-2">
          <SummaryCard icon={Users} title="Scope">
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Term</dt>
                <dd className="text-right font-black text-slate-900">
                  {activeTerm
                    ? `${activeTerm.academic_year} - ${activeTerm.semester.toUpperCase()} Semester`
                    : "No active term"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Year level</dt>
                <dd className="text-right font-black text-slate-900">
                  {yearLabel(yearLevel)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Curriculum</dt>
                <dd className="text-right font-black text-slate-900">
                  {curriculumName ?? "Not assigned"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Sections</dt>
                <dd className="text-right font-black text-slate-900">
                  {sections.length}
                </dd>
              </div>
            </dl>
            {sections.length > 0 && (
              <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                {sections.map((section) => section.name).join(", ")}
              </p>
            )}
          </SummaryCard>

          <SummaryCard icon={BookOpen} title={`Courses (${courseRows.length})`}>
            <dl className="space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Hybrid lecture/lab</dt>
                <dd className="text-right font-black text-slate-900">
                  {hybridCourses.length}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Split sessions</dt>
                <dd className="text-right font-black text-slate-900">
                  {splitCourses.length}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Sections with a set period</dt>
                <dd className="text-right font-black text-slate-900">
                  {restrictedSections.length} of {sections.length}
                </dd>
              </div>
            </dl>
          </SummaryCard>

          <SummaryCard icon={CalendarDays} title="Forced days">
            {forcedDayRules.length === 0 ? (
              <p className="text-slate-500">No forced-day rules.</p>
            ) : (
              <ul className="space-y-1">
                {forcedDayRules.map((rule) => (
                  <li
                    key={`${rule.course_id}:${rule.day}`}
                    className="flex justify-between gap-3"
                  >
                    <span className="truncate text-slate-700">
                      {courseRows.find(
                        (row) => Number(row.course.id) === rule.course_id,
                      )?.course.code ?? `Course #${rule.course_id}`}
                    </span>
                    <span className="font-black text-slate-900">
                      {rule.day}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SummaryCard>

          <SummaryCard icon={MapPin} title="Field courses">
            {fieldCourseCodes.length === 0 ? (
              <p className="text-slate-500">No field courses.</p>
            ) : (
              <p className="text-slate-700">{fieldCourseCodes.join(", ")}</p>
            )}
          </SummaryCard>

          {restrictedSections.length > 0 && (
            <SummaryCard icon={Clock3} title="Preferred meetings">
              <ul className="space-y-1">
                {restrictedSections.map((section) => (
                  <li key={section.id} className="flex justify-between gap-3">
                    <span className="truncate text-slate-700">
                      {section.name}
                    </span>
                    <span className="font-black text-slate-900">
                      {periodLabels[periodsBySectionId[section.id] ?? "flexible"]}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-500">
                These sections are restricted to their period. Generation fails
                rather than placing a class outside it.
              </p>
            </SummaryCard>
          )}

          {splitCourses.length > 0 && (
            <SummaryCard icon={Split} title="Split-session courses">
              <p className="text-slate-700">
                {splitCourses.map((row) => row.course.code).join(", ")}
              </p>
            </SummaryCard>
          )}

          <SummaryCard icon={ShieldCheck} title="Rules the generator applies">
            <ul className="flex flex-wrap gap-1.5">
              {activeRules.map((rule) => (
                <li
                  key={rule}
                  className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700"
                >
                  {rule}
                </li>
              ))}
            </ul>
          </SummaryCard>
        </div>
      </div>

      <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3">
        {costNotices.length > 0 && !blockedReason && (
          <ul className="mb-2 space-y-1.5">
            {costNotices.map((notice) => (
              <li
                key={notice}
                className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{notice}</span>
              </li>
            ))}
          </ul>
        )}
        {blockedReason && (
          <p
            role="alert"
            className="mb-2 rounded-lg bg-rose-50 px-2.5 py-2 text-xs font-semibold text-rose-800"
          >
            {blockedReason}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-600">
            Generation produces a preview. Nothing is saved until you apply it
            on the next step.
          </p>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || !canGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4e0a10] px-6 py-2.5 text-sm font-black text-white transition hover:bg-[#3d080c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating schedule...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
