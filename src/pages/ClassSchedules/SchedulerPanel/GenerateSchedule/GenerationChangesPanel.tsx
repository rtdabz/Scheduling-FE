import { useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import type { GenerationChange, GenerationChangeItem } from "./generationChanges";
import GenerationChangesModal from "./GenerationChangesModal";

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
  const hasCritical = list.some((change) => change.severity === "critical");
  const [open, setOpen] = useState(false);

  return (
    // Summary information sits on a soft maroon tint; green stays reserved for the success marker.
    <section className="shrink-0 rounded-xl border border-[#701522]/15 bg-[#F5E9EA]/60">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
          <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
          Generated
        </span>
        <p className="flex min-w-0 items-center text-sm font-medium text-[#5b4f48]">
          {summary}
        </p>

        {changes !== null && list.length === 0 && (
          <span className="text-xs font-medium text-[#6b5f57]">
            Generated exactly as configured. No preferences were changed and every in-person class has a room.
          </span>
        )}

        {list.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-[#5b4f48]">
              <AlertTriangle className={`h-3.5 w-3.5 ${hasCritical ? "text-rose-600" : "text-[#C77F0A]"}`} />
              {total} {total === 1 ? "class" : "classes"} changed during generation
            </span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex items-center gap-1 rounded-lg border border-[#701522]/25 bg-white px-2.5 py-1 text-xs font-bold text-[#4A0D16] transition hover:border-[#701522]/40 hover:bg-[#F5E9EA] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]/60"
            >
              View Changes ({total})
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {list.length > 0 && (
        <GenerationChangesModal
          isOpen={open}
          onClose={() => setOpen(false)}
          changes={list}
          onFocusClass={onFocusClass}
        />
      )}
    </section>
  );
}
