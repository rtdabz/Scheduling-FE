import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Wand2,
} from "lucide-react";
import RecommendedOptionList from "../components/RecommendedOptionList";
import {
  optionsClash,
  pickBestOptions,
  type DraftIssue,
  type DraftOption,
} from "./draftReview";

/**
 * The courses a generated draft still needs fixed, each with its ranked
 * placements. Choices are collected across courses and applied together; the
 * draft is then reviewed again, so the list only ever shows what is left.
 */
export default function DraftIssuesPanel({
  issues,
  reviewing,
  message,
  error,
  onApply,
  onRetry,
}: {
  /** `null` while the first review is still loading. */
  issues: DraftIssue[] | null;
  reviewing: boolean;
  /** Why the generator could not place everything, when it could not. */
  message?: string | null;
  error?: string | null;
  onApply: (options: DraftOption[]) => void;
  onRetry: () => void;
}) {
  const [picked, setSelected] = useState<Record<string, string>>({});
  const [expandedKey, setOpenKey] = useState<string | null | undefined>(
    undefined,
  );

  // Choices survive a fresh review only for the courses and options it still
  // reports; everything else it resolved or replaced.
  const selected = useMemo(() => {
    const next: Record<string, string> = {};
    for (const issue of issues ?? []) {
      const optionId = picked[issue.key];
      if (optionId && issue.options.some((option) => option.id === optionId)) {
        next[issue.key] = optionId;
      }
    }
    return next;
  }, [issues, picked]);
  // The first course starts open; a course the review no longer reports
  // hands that over to the new first one.
  const openKey =
    expandedKey === null
      ? null
      : expandedKey !== undefined &&
          (issues ?? []).some((issue) => issue.key === expandedKey)
        ? expandedKey
        : (issues?.[0]?.key ?? null);

  const chosen = useMemo(
    () =>
      (issues ?? [])
        .map((issue) =>
          issue.options.find((option) => option.id === selected[issue.key]),
        )
        .filter((option): option is DraftOption => option !== undefined),
    [issues, selected],
  );

  // Each course's options were found against the draft alone, so another
  // course's approval may already hold the same hour, room or instructor.
  const takenBy = (issue: DraftIssue, option: DraftOption): string | null => {
    for (const other of issues ?? []) {
      if (other.key === issue.key) continue;
      const approved = other.options.find(
        (candidate) => candidate.id === selected[other.key],
      );
      if (approved && optionsClash(option, approved)) return other.course_code;
    }
    return null;
  };

  if (error) {
    return (
      <section className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-800">
        <p>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          disabled={reviewing}
          className="mt-2 rounded-md border border-rose-300 bg-white px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
        >
          Check again
        </button>
      </section>
    );
  }

  if (issues === null) {
    return (
      <section
        role="status"
        className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking the whole timetable for courses that still need a place...
      </section>
    );
  }

  // Nothing left: the summary above already says what was generated, and
  // the apply that cleared the last course says so in its toast.
  if (issues.length === 0) return null;

  const withOptions = issues.filter((issue) => issue.options.length > 0);
  // The review lists courses section by section already; keep that order.
  const groups: {
    sectionId: number;
    sectionName: string;
    issues: DraftIssue[];
  }[] = [];
  for (const issue of issues) {
    const group = groups.find(
      (candidate) => candidate.sectionId === issue.section_id,
    );
    if (group) group.issues.push(issue);
    else
      groups.push({
        sectionId: issue.section_id,
        sectionName: issue.section_name,
        issues: [issue],
      });
  }

  return (
    <section
      aria-label="Courses that need attention"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-amber-300 bg-white"
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-amber-950">
            {issues.length} course{issues.length === 1 ? "" : "s"} need
            {issues.length === 1 ? "s" : ""} attention
          </p>
          <p className="text-[11px] font-semibold leading-snug text-amber-900">
            Approve one option per course, then apply them together. Nothing
            changes until you apply; the timetable is checked again after.
          </p>
          {message && (
            <details className="mt-1 text-[11px] font-semibold leading-snug text-amber-900">
              <summary className="cursor-pointer font-bold text-amber-800 hover:text-amber-950">
                Why the generator stopped
              </summary>
              <p className="mt-1">{message}</p>
            </details>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((group) => {
          const approvable = group.issues.filter(
            (issue) => issue.options.length > 0,
          );
          return (
            <section
              key={group.sectionId}
              aria-label={`${group.sectionName} courses`}
            >
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-1.5">
                <p className="min-w-0 flex-1 text-[11px] font-black uppercase tracking-wide text-slate-700">
                  {group.sectionName}
                  <span className="ml-1.5 font-bold normal-case tracking-normal text-slate-500">
                    {group.issues.length} course
                    {group.issues.length === 1 ? "" : "s"}
                  </span>
                </p>
                {approvable.length > 0 && (
                  <button
                    type="button"
                    disabled={reviewing}
                    onClick={() => {
                      // Other sections' approvals stand; this section's
                      // are chosen afresh around them.
                      const keys = new Set(
                        approvable.map((issue) => issue.key),
                      );
                      const kept = (issues ?? []).filter(
                        (issue) => !keys.has(issue.key) && selected[issue.key],
                      );
                      setSelected({
                        ...Object.fromEntries(
                          kept.map((issue) => [issue.key, selected[issue.key]]),
                        ),
                        ...pickBestOptions(
                          approvable,
                          chosen.filter(
                            (option) =>
                              !approvable.some((issue) =>
                                issue.options.includes(option),
                              ),
                          ),
                        ),
                      });
                    }}
                    className="text-[11px] font-bold text-[#4e0a10] underline hover:text-[#3a0809] disabled:opacity-60"
                  >
                    Approve best for {group.sectionName}
                  </button>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {group.issues.map((issue) => {
                  const isOpen = openKey === issue.key;
                  const selectedId = selected[issue.key];
                  const freeCount = issue.options.filter(
                    (option) => takenBy(issue, option) === null,
                  ).length;
                  return (
                    <li key={issue.key}>
                      <button
                        type="button"
                        onClick={() => setOpenKey(isOpen ? null : issue.key)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                            issue.kind === "unplaced"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {issue.kind === "unplaced"
                            ? "Not placed"
                            : "Conflict"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-black text-slate-900">
                          {issue.course_code}
                          {issue.course_name ? (
                            <span className="font-semibold text-slate-500">
                              {" "}
                              &middot; {issue.course_name}
                            </span>
                          ) : null}
                        </span>
                        {selectedId ? (
                          <span className="text-[11px] font-bold text-emerald-700">
                            Approved
                          </span>
                        ) : issue.options.length === 0 ? (
                          <span className="text-[11px] font-bold text-slate-500">
                            No option
                          </span>
                        ) : freeCount === 0 ? (
                          <span className="text-[11px] font-bold text-amber-700">
                            All taken
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-slate-500">
                            {freeCount} option
                            {freeCount === 1 ? "" : "s"}
                          </span>
                        )}
                        <ChevronDown
                          className={`h-4 w-4 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {isOpen && (
                        <div className="space-y-2 bg-slate-50/60 px-3 pb-3 pt-1">
                          <ul className="list-disc space-y-0.5 pl-5 text-[11px] font-semibold text-slate-700">
                            {issue.problems.map((problem) => (
                              <li key={problem}>{problem}</li>
                            ))}
                          </ul>
                          {issue.options.length === 0 ? (
                            <p className="text-[11px] font-semibold text-slate-600">
                              No option fits: no room is free whenever this
                              section is, and the course cannot go fully online
                              (a laboratory course, or no two free times for
                              it). Share or borrow a room, move another course
                              of this section, or save without it and place it
                              later in the Schedule Builder.
                            </p>
                          ) : (
                            <>
                              <RecommendedOptionList
                                label={`Fixes for ${issue.section_name} ${issue.course_code}`}
                                applyLabel="Approve"
                                isBusy={reviewing}
                                items={issue.options.map((option) => {
                                  const holder = takenBy(issue, option);
                                  return {
                                    key: option.id,
                                    isApplied: option.id === selectedId,
                                    disabledLabel: holder
                                      ? `Taken by ${holder}`
                                      : null,
                                    tag:
                                      option.rank === 1 || option.label ? (
                                        <span className="flex gap-1">
                                          {option.label && (
                                            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-sky-800">
                                              {option.label}
                                            </span>
                                          )}
                                          {option.rank === 1 && (
                                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-emerald-800">
                                              Best match
                                            </span>
                                          )}
                                        </span>
                                      ) : undefined,
                                    body: (
                                      <div>
                                        <p className="text-xs font-bold text-slate-800">
                                          {option.summary}
                                        </p>
                                        {option.reasons.length > 0 && (
                                          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                                            {option.reasons.join(" · ")}
                                          </p>
                                        )}
                                      </div>
                                    ),
                                  };
                                })}
                                onApply={(optionId) =>
                                  setSelected((current) => ({
                                    ...current,
                                    [issue.key]: optionId,
                                  }))
                                }
                              />
                              {selectedId && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelected((current) => {
                                      const next = { ...current };
                                      delete next[issue.key];
                                      return next;
                                    })
                                  }
                                  className="text-[11px] font-bold text-slate-600 underline hover:text-slate-900"
                                >
                                  Withdraw approval
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-3 py-2">
        {withOptions.length > 0 && (
          <button
            type="button"
            disabled={reviewing}
            onClick={() => setSelected(pickBestOptions(withOptions))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Wand2 className="h-3.5 w-3.5" /> Approve best for all
          </button>
        )}
        <button
          type="button"
          disabled={reviewing || chosen.length === 0}
          onClick={() => onApply(chosen)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-1.5 text-xs font-black text-white hover:bg-[#3a0809] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {reviewing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          {reviewing
            ? "Checking timetable..."
            : `Apply ${chosen.length} approved change${chosen.length === 1 ? "" : "s"}`}
        </button>
      </footer>
    </section>
  );
}
