import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import type { GenerationChange, GenerationChangeItem } from "./generationChanges";

const severityTone: Record<string, { box: string; icon: string; count: string }> = {
  critical: {
    box: "border-rose-200 bg-rose-50",
    icon: "text-rose-600",
    count: "bg-rose-100 text-rose-700",
  },
  warning: {
    box: "border-amber-200 bg-amber-50",
    icon: "text-amber-600",
    count: "bg-amber-100 text-amber-800",
  },
};

/**
 * "What changed during generation": every difference between the configured
 * setup and the generated timetable, grouped by kind. Picking an entry filters
 * the summary table to that class, so the change can be checked in place.
 */
export default function GenerationChangesPanel({
  changes,
  onFocusClass,
}: {
  changes: GenerationChange[];
  onFocusClass: (item: GenerationChangeItem) => void;
}) {
  const [open, setOpen] = useState(true);
  const total = changes.reduce((sum, change) => sum + change.items.length, 0);

  if (changes.length === 0) {
    return (
      <section className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Generated exactly as configured. No preferences were changed and every in-person class has a room.
      </section>
    );
  }

  return (
    <section className="shrink-0 rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ListChecks className="h-4 w-4 text-slate-600" />
        <span className="text-sm font-black text-slate-900">What changed during generation</span>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">
          {total} {total === 1 ? "class" : "classes"} affected
        </span>
        <span className="ml-auto text-slate-500">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="grid max-h-64 gap-2 overflow-y-auto border-t border-slate-100 p-3 md:grid-cols-2">
          {changes.map((change) => {
            const tone = severityTone[change.severity] ?? severityTone.warning;
            return (
              <div key={change.kind} className={`rounded-lg border px-3 py-2 ${tone.box}`}>
                <p className="flex items-center gap-1.5 text-xs font-black text-slate-900">
                  <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${tone.icon}`} />
                  {change.title}
                  <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-black ${tone.count}`}>
                    {change.items.length}
                  </span>
                </p>
                {change.description && (
                  <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-slate-600">
                    {change.description}
                  </p>
                )}
                <ul className="mt-1.5 space-y-0.5">
                  {change.items.map((item, index) => (
                    <li key={`${item.section_id}-${item.course_id}-${index}`}>
                      <button
                        type="button"
                        onClick={() => onFocusClass(item)}
                        title="Show this class in the table"
                        className="w-full rounded px-1 py-0.5 text-left text-[11px] font-semibold text-slate-700 hover:bg-white/70"
                      >
                        <span className="font-black text-slate-900">{item.section_name}</span>
                        {" · "}
                        <span className="font-black text-slate-900">{item.course_code}</span>
                        {" — "}
                        {item.detail}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
