import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ListChecks,
  Loader2,
  Wand2,
  X,
} from "lucide-react";
import RecommendedOptionList from "../components/RecommendedOptionList";
import {
  optionsClash,
  pickBestOptions,
  type DraftIssue,
  type DraftOption,
} from "./draftReview";

export default function DraftIssuesPanel({
  issues,
  reviewing,
  message,
  error,
  onApply,
  onRetry,
}: {
  issues: DraftIssue[] | null;
  reviewing: boolean;
  message?: string | null;
  error?: string | null;
  onApply: (options: DraftOption[]) => void;
  onRetry: () => void;
}) {
  const [picked, setSelected] = useState<Record<string, string>>({});
  const [expandedKey, setOpenKey] = useState<string | null | undefined>(
    undefined,
  );
  const [isOpen, setIsOpen] = useState(false);
  const reviewButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [scrollTarget, setScrollTarget] = useState<{ key: string } | null>(null);

  if (isOpen && !error && issues?.length === 0) setIsOpen(false);

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

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      reviewButtonRef.current?.focus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!scrollTarget) return;
    document.getElementById(`draft-issue-${scrollTarget.key}`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [scrollTarget]);

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

  const closeReview = () => {
    setIsOpen(false);
    reviewButtonRef.current?.focus();
  };

  if (!error && issues !== null && issues.length === 0) return null;

  const heading = issues && issues.length > 0
    ? `${issues.length} Course${issues.length === 1 ? " Needs" : "s Need"} Attention`
    : "Review Courses";
  const withOptions = (issues ?? []).filter((issue) => issue.options.length > 0);
  const groups: {
    sectionId: number;
    sectionName: string;
    issues: DraftIssue[];
  }[] = [];
  for (const issue of issues ?? []) {
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

  const approveOption = (issue: DraftIssue, optionId: string) => {
    setSelected((current) => ({ ...current, [issue.key]: optionId }));
    const ordered = groups.flatMap((group) => group.issues);
    const at = ordered.findIndex((item) => item.key === issue.key);
    const next = [...ordered.slice(at + 1), ...ordered.slice(0, at)].find(
      (item) => item.options.length > 0 && !selected[item.key],
    );
    setOpenKey(next?.key ?? null);
    if (next) setScrollTarget({ key: next.key });
  };

  const errorNotice = error ? (
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
  ) : null;

  const checkingNotice = (
    <section
      role="status"
      className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-900"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      Checking the whole timetable for courses that still need a place...
    </section>
  );

  const banner = error ? errorNotice : issues === null ? checkingNotice : (
    <section
      aria-label="Courses that need attention"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-amber-950">{heading}</p>
        <p className="text-[11px] font-semibold leading-snug text-amber-900">
          {chosen.length > 0
            ? `${chosen.length} approved, not applied yet. Open the review to apply ${chosen.length === 1 ? "it" : "them"}.`
            : "Choose one recommendation per course, then click Apply."}
        </p>
      </div>
      <button
        ref={reviewButtonRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#5A1220] px-3.5 text-xs font-black text-white shadow-sm transition-colors hover:bg-[#4a0f1a]"
      >
        <ListChecks className="h-4 w-4" />
        Review Courses
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-black tabular-nums text-[#5A1220]">
          {issues.length}
        </span>
      </button>
    </section>
  );

  return (
    <>
      {banner}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-2 sm:p-4"
          onClick={(event) => { if (event.target === event.currentTarget) closeReview(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-review-title"
            aria-describedby="draft-review-desc"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[#F7F4F0] shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 bg-[#5A1220] px-5 py-4 text-white">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#F5C842]">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 id="draft-review-title" className="text-base font-black leading-tight">{heading}</h3>
                  <p id="draft-review-desc" className="mt-0.5 text-xs leading-snug text-white/75">
                    Choose one recommendation per course, then click Apply to
                    update the timetable. Changes will only take effect after
                    applying, and the system will check for issues again.
                  </p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeReview}
                aria-label="Close course review"
                className="rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {message && (
              <details className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-xs font-semibold leading-snug text-amber-900">
                <summary className="cursor-pointer font-bold text-amber-800 hover:text-amber-950">
                  Why Generation Stopped
                </summary>
                <StopReason message={message} />
              </details>
            )}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {error ? errorNotice : issues === null ? checkingNotice : groups.map((group) => {
                const approvable = group.issues.filter(
                  (issue) => issue.options.length > 0,
                );
                return (
                  <section
                    key={group.sectionId}
                    aria-label={`${group.sectionName} courses`}
                    className="overflow-hidden rounded-xl border border-[#E2D9D0] bg-white shadow-sm"
                  >
                    <div className="flex items-center gap-2 border-b border-[#E2D9D0] bg-[#F7F4F0]/70 px-4 py-2">
                      <p className="min-w-0 flex-1 text-[11px] font-black uppercase tracking-wide text-[#5A1220]">
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
                          className="text-[11px] font-bold text-[#5A1220] underline hover:text-[#4a0f1a] disabled:opacity-60"
                        >
                          Approve best for {group.sectionName}
                        </button>
                      )}
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {group.issues.map((issue) => {
                        const isExpanded = openKey === issue.key;
                        const selectedId = selected[issue.key];
                        const freeCount = issue.options.filter(
                          (option) => takenBy(issue, option) === null,
                        ).length;
                        return (
                          <li key={issue.key} id={`draft-issue-${issue.key}`}>
                            <button
                              type="button"
                              onClick={() => setOpenKey(isExpanded ? null : issue.key)}
                              aria-expanded={isExpanded}
                              className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-[#F7F4F0]/60"
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
                                className={`h-4 w-4 text-slate-400 transition ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </button>

                            {isExpanded && (
                              <div className="space-y-2 bg-[#F7F4F0]/50 px-4 pb-4 pt-1">
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
                                      onApply={(optionId) => approveOption(issue, optionId)}
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

            <footer className="flex shrink-0 flex-col gap-2 border-t border-[#E2D9D0] bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-bold text-slate-500">
                {chosen.length} of {withOptions.length} course{withOptions.length === 1 ? "" : "s"} approved
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {withOptions.length > 0 && (
                  <button
                    type="button"
                    disabled={reviewing}
                    onClick={() => setSelected(pickBestOptions(withOptions))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#5A1220]/20 bg-white px-3 text-xs font-bold text-[#5A1220] transition-colors hover:bg-[#5A1220]/[0.05] disabled:opacity-60"
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Approve best for all
                  </button>
                )}
                <button
                  type="button"
                  disabled={reviewing || chosen.length === 0}
                  onClick={() => onApply(chosen)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#5A1220] px-3.5 text-xs font-black text-white shadow-sm transition-colors hover:bg-[#4a0f1a] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
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
              </div>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const NEXT_STEP = "Next step:";

function StopReason({ message }: { message: string }) {
  const stepAt = message.indexOf(NEXT_STEP);
  const reason = (stepAt >= 0 ? message.slice(0, stepAt) : message).trim();
  const nextStep = stepAt >= 0 ? message.slice(stepAt + NEXT_STEP.length).trim() : "";
  const focus = /^(.* while scheduling )(.+?)(\..*)$/.exec(reason);

  return (
    <>
      <p className="mt-1">
        {focus ? <>{focus[1]}<b className="font-black text-amber-950">{focus[2]}</b>{focus[3]}</> : reason}
      </p>
      {nextStep && (
        <p className="mt-1">
          <b className="font-black text-amber-950">Next Step:</b> {nextStep}
        </p>
      )}
    </>
  );
}
