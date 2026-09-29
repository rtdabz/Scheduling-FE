import type { ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

export interface RecommendedOptionItem {
  key: string;
  /** What the option does: the placement rows, or a one-line summary. */
  body: ReactNode;
  /** A short badge beside the heading, e.g. "Best match" or "Over Basic Load". */
  tag?: ReactNode;
  /** Already applied to the form; shown as selected rather than offered again. */
  isApplied?: boolean;
  /** Why this option cannot be used here; shown on its disabled button. */
  disabledLabel?: string | null;
}

interface RecommendedOptionListProps {
  /** Accessible name for the list. */
  label: string;
  items: RecommendedOptionItem[];
  onApply: (key: string) => void;
  applyLabel?: string;
  /** Any apply in flight: every button waits. */
  isBusy?: boolean;
  /** The option being applied, which shows the spinner. */
  busyKey?: string | null;
}

/**
 * The ranked, conflict-free options offered for a placement.
 *
 * One component for both places a user is handed a fix: the Schedule
 * Builder's placement dialog, before a class is saved, and the conflict inbox,
 * after it is. Each option is already checked by the server, so the list only
 * presents them best first and applies the one chosen.
 */
export default function RecommendedOptionList({
  label,
  items,
  onApply,
  applyLabel = "Apply",
  isBusy = false,
  busyKey = null,
}: RecommendedOptionListProps) {
  return (
    <ol className="space-y-2" aria-label={label}>
      {items.map((item, index) => (
        <li
          key={item.key}
          className={`rounded-xl border p-3 transition-colors ${
            item.isApplied ? "border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-200" : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-black text-slate-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4e0a10] text-[11px] text-white">{index + 1}</span>
              Option {index + 1}
            </p>
            {item.isApplied ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Applied
              </span>
            ) : item.tag ?? null}
          </div>

          <div className="mt-2">{item.body}</div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onApply(item.key)}
              disabled={isBusy || item.isApplied || Boolean(item.disabledLabel)}
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
                item.isApplied
                  ? "cursor-default bg-emerald-100 text-emerald-800"
                  : item.disabledLabel
                    ? "cursor-not-allowed bg-slate-100 text-slate-500"
                    : "bg-[#4e0a10] text-white hover:bg-[#3a0809] disabled:opacity-60"
              }`}
            >
              {item.isApplied
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Selected</>
                : item.disabledLabel
                  ? item.disabledLabel
                  : isBusy && busyKey === item.key
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {applyLabel}</>
                    : applyLabel}
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
