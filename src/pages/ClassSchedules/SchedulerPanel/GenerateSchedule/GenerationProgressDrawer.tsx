import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  X,
} from "lucide-react";
import { useGenerationRun } from "../hooks/useGenerationRun";

const elapsedLabel = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
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

  return `${ordinal} year`;
};

/**
 * The generator modal is no longer the only place a run is visible. This
 * drawer keeps a queued or finished run reachable while the user works on the
 * timetable, and survives closing the panel or reloading the page.
 */
export default function GenerationProgressDrawer({
  hidden = false,
  onOpenGenerator,
}: {
  hidden?: boolean;
  onOpenGenerator: () => void;
}) {
  const run = useGenerationRun();
  const [collapsed, setCollapsed] = useState(false);

  if (hidden || run.status === "idle") return null;

  const scope = run.meta
    ? [
        yearLabel(run.meta.yearLevel),
        run.meta.sectionCount > 0
          ? `${run.meta.sectionCount} section${run.meta.sectionCount === 1 ? "" : "s"}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ")
    : null;

  const tone =
    run.status === "failed"
      ? {
          border: "border-rose-200",
          accent: "bg-rose-50",
          text: "text-rose-900",
        }
      : run.status === "completed"
        ? {
            border: "border-emerald-200",
            accent: "bg-emerald-50",
            text: "text-emerald-900",
          }
        : {
            border: "border-slate-200",
            accent: "bg-[#fff8e8]",
            text: "text-slate-900",
          };

  const heading =
    run.status === "failed"
      ? "Generation unsuccessful"
      : run.status === "completed"
        ? "Timetable ready to review"
        : run.status === "running"
          ? "Generating timetable"
          : "Waiting for the scheduling queue";

  return (
    <div
      className={`fixed bottom-4 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border ${tone.border} bg-white shadow-2xl motion-safe:animate-fadeInUp`}
      role="status"
      aria-live="polite"
      aria-label="Schedule generation status"
    >
      <div className={`flex items-center gap-2 px-3 py-2.5 ${tone.accent}`}>
        {run.status === "failed" ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
        ) : run.status === "completed" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#4e0a10]" />
        )}
        <p className={`flex-1 truncate text-sm font-black ${tone.text}`}>
          {heading}
        </p>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="rounded-md p-1 text-slate-500 transition hover:bg-white/70 hover:text-slate-700"
          aria-label={collapsed ? "Expand generation status" : "Collapse generation status"}
        >
          {collapsed ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {!run.isActive && (
          <button
            type="button"
            onClick={run.clear}
            className="rounded-md p-1 text-slate-500 transition hover:bg-white/70 hover:text-slate-700"
            aria-label="Dismiss generation status"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-3 px-3 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-slate-600">
            {scope && <span>{scope}</span>}
            {run.isActive && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {elapsedLabel(run.elapsedMs)}
              </span>
            )}
            {run.status === "completed" && (
              <span>
                {run.result?.schedules?.length ?? 0} class meetings prepared
              </span>
            )}
          </div>

          {run.workerStalled && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900">
              The run has not been picked up yet. If this continues, verify that
              a worker is consuming the scheduling queue.
            </p>
          )}

          {run.status === "failed" && run.errorMessage && (
            <p className="text-xs font-semibold text-rose-800">
              {run.errorMessage}
            </p>
          )}

          {run.status === "running" && (
            <p className="text-xs font-semibold text-slate-500">
              You can keep working. This panel stays available until you review
              the result.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenGenerator}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4e0a10] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#3d080c]"
            >
              {run.status === "completed"
                ? "Review result"
                : run.status === "failed"
                  ? "Open details"
                  : "View progress"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
