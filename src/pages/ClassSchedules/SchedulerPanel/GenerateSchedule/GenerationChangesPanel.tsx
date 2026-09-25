import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import type { GenerationChange, GenerationChangeItem } from "./generationChanges";
import ResolutionDetailsButton from "./ResolutionDetails";
import { resolutionDetailsForChange } from "./resolutionDetailsData";

const severityTone: Record<string, { icon: string; count: string }> = {
  critical: { icon: "text-rose-600", count: "bg-rose-100 text-rose-700" },
  warning: { icon: "text-amber-600", count: "bg-amber-100 text-amber-800" },
};

/**
 * One compact bar with the generation summary and "what changed during
 * generation": every difference between the configured setup and the generated
 * timetable, one row per kind. Picking a class filters the summary table to it,
 * so the change can be checked in place.
 */
export default function GenerationChangesPanel({
  summary,
  changes,
  onFocusClass,
}: {
  summary: ReactNode;
  changes: GenerationChange[] | null;
  onFocusClass: (item: GenerationChangeItem) => void;
}) {
  const list = changes ?? [];
  const total = list.reduce((sum, change) => sum + change.items.length, 0);
  // Critical changes stay visible; everything else is one click away.
  const [open, setOpen] = useState(() => list.some((change) => change.severity === "critical"));

  return (
    <section className="shrink-0 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
        <p className="flex items-center gap-2 text-sm font-black text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          {summary}
        </p>

        {changes !== null && list.length === 0 && (
          <span className="text-xs font-bold text-slate-500">
            Generated exactly as configured. No preferences were changed and every in-person class has a room.
          </span>
        )}

        {list.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800 hover:bg-amber-200"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {total} {total === 1 ? "class" : "classes"} changed during generation
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {open && list.length > 0 && (
        <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
          {list.map((change) => {
            const tone = severityTone[change.severity] ?? severityTone.warning;
            return (
              <li key={change.kind} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-xs">
                <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${tone.icon}`} />
                <span className="font-black text-slate-900" title={change.description || undefined}>
                  {change.title}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${tone.count}`}>
                  {change.items.length}
                </span>
                {(change.resolved || change.status === "resolved") && (
                  <>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">Resolved</span>
                    <ResolutionDetailsButton details={resolutionDetailsForChange(change)} />
                  </>
                )}
                <span className="text-slate-300">|</span>
                {change.items.map((item, index) => (
                  <button
                    key={`${item.section_id}-${item.course_id}-${index}`}
                    type="button"
                    onClick={() => onFocusClass(item)}
                    title="Show this class in the table"
                    className="rounded px-1 py-0.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    <span className="font-black text-slate-900">{item.section_name} · {item.course_code}</span>
                    {" — "}
                    {item.detail}
                  </button>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
