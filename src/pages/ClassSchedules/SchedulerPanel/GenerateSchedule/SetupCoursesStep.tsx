import { useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  BookOpen,
  Check,
  Clock3,
  FlaskConical,
  MapPin,
  Minus,
  Settings2,
  Users,
  X,
} from "lucide-react";
import type { Course, Section } from "../types";
import {
  isBalancedSplitSchedulingEligible,
  isConfiguredFieldCourse,
  isHybridSchedulingEligible,
} from "../schedulingConfigurationEligibility";
import type { TimeBlockOption } from "./generationTypes";

/** The slice of a section's configuration this step reads and writes. */
export type CourseSetupConfig = {
  courseIds: string[];
  splitCourseIds: string[];
  gecSplitCourseIds: string[];
  /** Set on the Configuration step; shown here as read-only context. */
  preferredTimeBlock?: TimeBlockOption;
};

export type SetupCoursesSettings = {
  field_course_codes?: string[];
  gec_split_schedule_override_enabled?: boolean;
  major_lecture_split_schedule_override_enabled?: boolean;
  lecture_lab_schedule_override_enabled?: boolean;
};

/** The two per-section flags a course row owns. */
type FlagKey = "splitCourseIds" | "gecSplitCourseIds";

const flagLabels: Record<FlagKey, string> = {
  splitCourseIds: "Hybrid",
  gecSplitCourseIds: "Split",
};

const FLAG_KEYS: FlagKey[] = ["splitCourseIds", "gecSplitCourseIds"];

/**
 * What kind of course this is, at a glance.
 *
 * The icon carries the same information the row already implies from its
 * flags, so scanning the list does not depend on reading every course code:
 * where it meets (field), whether it has a laboratory component, and whether
 * it belongs to the major or is a minor.
 */
const courseIcon = (course: Course, isField: boolean) => {
  if (isField) return MapPin;
  if (Number(course.labHours ?? 0) > 0) return FlaskConical;

  return course.category === "minor" ? BookMarked : BookOpen;
};

const periodLabels: Record<TimeBlockOption, string> = {
  flexible: "Any time",
  morning: "Morning (7:00 AM - 11:30 AM)",
  afternoon: "Afternoon (11:30 AM - 4:00 PM)",
  evening: "Evening (4:00 PM - 8:30 PM)",
};

/**
 * Step 2 — one row per course, exceptions only.
 *
 * A row's Hybrid and Split cells act on every section at once, which is what a
 * scheduler almost always wants. Configure is the exception path: it opens a
 * modal for opting individual sections out, so GEC 1 can split for the year
 * level while BSIT 1B keeps a single session. A cell whose sections disagree
 * shows a partial state and the count, so an exclusion is never invisible from
 * the table.
 */
export default function SetupCoursesStep({
  courses,
  sections,
  configs,
  onConfigChange,
  settings,
  allowedSplitCourseIds,
  actionsDisabled,
}: {
  courses: Course[];
  sections: Section[];
  configs: Record<string, CourseSetupConfig>;
  onConfigChange: (
    sectionId: string,
    change: Partial<CourseSetupConfig>,
  ) => void;
  settings: SetupCoursesSettings | null;
  allowedSplitCourseIds: ReadonlySet<string>;
  actionsDisabled: boolean;
}) {
  const [configuringCourseId, setConfiguringCourseId] = useState<string | null>(
    null,
  );

  const fieldCourseCodes = useMemo(
    () => new Set(settings?.field_course_codes ?? []),
    [settings?.field_course_codes],
  );
  const hybridEnabled =
    settings?.lecture_lab_schedule_override_enabled === true;
  const minorSplitEnabled =
    settings?.gec_split_schedule_override_enabled === true;
  const majorLectureSplitEnabled =
    settings?.major_lecture_split_schedule_override_enabled === true;
  // Memoized because the rows below depend on it: a fresh object each render
  // would defeat that memo.
  const splitSettings = useMemo(
    () => ({
      minorEnabled: minorSplitEnabled,
      majorLectureEnabled: majorLectureSplitEnabled,
    }),
    [majorLectureSplitEnabled, minorSplitEnabled],
  );

  const rows = useMemo(
    () =>
      courses.map((course) => ({
        course,
        hybrid:
          hybridEnabled &&
          isHybridSchedulingEligible(course, hybridEnabled, fieldCourseCodes),
        split:
          isBalancedSplitSchedulingEligible(course, splitSettings) &&
          allowedSplitCourseIds.has(course.id),
        isField: isConfiguredFieldCourse(course, fieldCourseCodes),
      })),
    [
      allowedSplitCourseIds,
      courses,
      fieldCourseCodes,
      hybridEnabled,
      splitSettings,
    ],
  );

  const includedCount = (courseId: string, key: FlagKey): number =>
    sections.filter((section) =>
      (configs[section.id]?.[key] ?? []).includes(courseId),
    ).length;

  const setForSection = (
    sectionId: string,
    courseId: string,
    key: FlagKey,
    next: boolean,
  ) => {
    const current = configs[sectionId]?.[key] ?? [];
    onConfigChange(sectionId, {
      [key]: next
        ? Array.from(new Set([...current, courseId]))
        : current.filter((id) => id !== courseId),
    });
  };

  const setForAllSections = (courseId: string, key: FlagKey, next: boolean) => {
    for (const section of sections) {
      setForSection(section.id, courseId, key, next);
    }
  };

  const configuringRow =
    rows.find((row) => row.course.id === configuringCourseId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-0 max-h-[60vh] w-full flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead id="generator-setup-head" className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="px-3 py-2.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
                Courses
              </th>
              <th className="w-28 px-3 py-2.5 text-center text-[11px] font-black uppercase tracking-wide text-slate-500">
                Hybrid
              </th>
              <th className="w-28 px-3 py-2.5 text-center text-[11px] font-black uppercase tracking-wide text-slate-500">
                Split
              </th>
              <th className="w-40 px-3 py-2.5 text-right text-[11px] font-black uppercase tracking-wide text-slate-500">
                Configure
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-xs font-semibold text-slate-500"
                >
                  This curriculum has no courses for the selected year level and
                  semester.
                </td>
              </tr>
            )}
            {rows.map(({ course, hybrid, split, isField }) => {
              const CourseIcon = courseIcon(course, isField);

              return (
              <tr
                key={course.id}
                className="border-t border-slate-100 align-middle"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4e0a10]/10 text-[#4e0a10]"
                    >
                      <CourseIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-black leading-tight text-slate-900">
                        {course.code}
                      </p>
                      <p className="truncate text-xs font-semibold leading-tight text-slate-600">
                        {course.name}
                      </p>
                      {isField && (
                        <span className="mt-1 inline-flex rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                          Field
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                {FLAG_KEYS.map((key) => {
                  const eligible = key === "splitCourseIds" ? hybrid : split;

                  return (
                    <td key={key} className="px-3 py-2.5 text-center">
                      {eligible ? (
                        <FlagCell
                          label={`${flagLabels[key]} for ${course.code}`}
                          included={includedCount(course.id, key)}
                          total={sections.length}
                          disabled={actionsDisabled}
                          onToggle={(next) =>
                            setForAllSections(course.id, key, next)
                          }
                        />
                      ) : (
                        <EmptyCell />
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => setConfiguringCourseId(course.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Settings2 className="h-3.5 w-3.5" /> Configure
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {configuringRow && (
        <ConfigureModal
          course={configuringRow.course}
          sections={sections}
          configs={configs}
          eligibility={{
            hybrid: configuringRow.hybrid,
            split: configuringRow.split,
          }}
          disabled={actionsDisabled}
          onClose={() => setConfiguringCourseId(null)}
          onToggleSection={(sectionId, key, next) =>
            setForSection(sectionId, configuringRow.course.id, key, next)
          }
          onToggleAll={(key, next) =>
            setForAllSections(configuringRow.course.id, key, next)
          }
        />
      )}
    </div>
  );
}

function EmptyCell() {
  return (
    <span aria-hidden="true" className="text-sm font-bold text-slate-300">
      —
    </span>
  );
}

/**
 * All sections, none, or some. Clicking turns the whole year level on unless
 * it is already on everywhere, so the fast path stays one click; the partial
 * state is only ever reached through the Configure modal.
 */
function FlagCell({
  label,
  included,
  total,
  disabled,
  onToggle,
}: {
  label: string;
  included: number;
  total: number;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const all = total > 0 && included === total;
  const partial = included > 0 && !all;

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={all ? "true" : partial ? "mixed" : "false"}
        aria-label={label}
        disabled={disabled}
        onClick={() => onToggle(!all)}
        className={`inline-flex h-6 w-6 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-50 ${
          all
            ? "border-[#4e0a10] bg-[#4e0a10] text-white"
            : partial
              ? "border-[#4e0a10] bg-white text-[#4e0a10]"
              : "border-slate-300 bg-white text-transparent hover:border-slate-400"
        }`}
      >
        {partial ? <Minus className="h-4 w-4" /> : <Check className="h-4 w-4" />}
      </button>
      {partial && (
        <span className="text-[10px] font-black text-[#4e0a10]">
          {included}/{total}
        </span>
      )}
    </span>
  );
}

/**
 * The exception path: which sections a course's rules apply to.
 *
 * Unchecking a section here excludes it from that rule only — it still takes
 * the course, it just keeps a single session while its siblings split.
 */
function ConfigureModal({
  course,
  sections,
  configs,
  eligibility,
  disabled,
  onClose,
  onToggleSection,
  onToggleAll,
}: {
  course: Course;
  sections: Section[];
  configs: Record<string, CourseSetupConfig>;
  eligibility: { hybrid: boolean; split: boolean };
  disabled: boolean;
  onClose: () => void;
  onToggleSection: (sectionId: string, key: FlagKey, next: boolean) => void;
  onToggleAll: (key: FlagKey, next: boolean) => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const activeKeys = FLAG_KEYS.filter((key) =>
    key === "splitCourseIds" ? eligibility.hybrid : eligibility.split,
  );

  const includedCount = (key: FlagKey) =>
    sections.filter((section) =>
      (configs[section.id]?.[key] ?? []).includes(course.id),
    ).length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${course.code}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(80vh,42rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl motion-safe:animate-modalIn"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 bg-[#4e0a10] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-black text-white">
              Configure {course.code}
            </h3>
            <p className="truncate text-[11px] font-semibold text-white/70">
              {course.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close course configuration"
            className="rounded-lg bg-white/10 p-1.5 text-white transition hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {activeKeys.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
              This course has no hybrid or split option to set, so every section
              takes it the same way.
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-600">
                Uncheck a section to leave it out of that rule. It still takes{" "}
                {course.code}.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {activeKeys.map((key) => {
                  const all = includedCount(key) === sections.length;

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => onToggleAll(key, !all)}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {all ? "Clear" : "Apply"} {flagLabels[key]} for all
                    </button>
                  );
                })}
              </div>

              <table className="mt-3 w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th className="px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                      Section
                    </th>
                    {activeKeys.map((key) => (
                      <th
                        key={key}
                        className="w-20 px-2 py-1.5 text-center text-[10px] font-black uppercase tracking-wide text-slate-500"
                      >
                        {flagLabels[key]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sections.map((section) => {
                    const period =
                      configs[section.id]?.preferredTimeBlock ?? "flexible";

                    return (
                      <tr key={section.id} className="border-t border-slate-100">
                        <td className="px-2 py-2">
                          <span className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                              <Users className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-black text-slate-900">
                                {section.name}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                                <Clock3 className="h-3 w-3" />
                                {periodLabels[period]}
                              </span>
                            </span>
                          </span>
                        </td>
                        {activeKeys.map((key) => {
                          const checked = (
                            configs[section.id]?.[key] ?? []
                          ).includes(course.id);

                          return (
                            <td key={key} className="px-2 py-2 text-center">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={checked}
                                aria-label={`${flagLabels[key]} for ${course.code} in ${section.name}`}
                                disabled={disabled}
                                onClick={() =>
                                  onToggleSection(section.id, key, !checked)
                                }
                                className={`inline-flex h-6 w-6 items-center justify-center rounded border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  checked
                                    ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                                    : "border-slate-300 bg-white text-transparent hover:border-slate-400"
                                }`}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-slate-200 bg-slate-50 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-black text-white transition hover:bg-[#3d080c]"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
