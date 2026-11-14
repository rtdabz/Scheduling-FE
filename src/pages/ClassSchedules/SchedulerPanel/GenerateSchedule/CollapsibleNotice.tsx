import { useId, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

export type NoticeTone = "warning" | "critical" | "suggestion" | "neutral";

// Each tone tints only the one-line header strip; the expanded content stays white so
// nothing turns into an oversized colored banner. Amber text uses #8A5A12 for contrast.
const toneStyles: Record<NoticeTone, { border: string; surface: string; icon: string; count: string; divider: string }> = {
  warning: {
    border: "border-[#F5A623]/45",
    surface: "bg-[#FEF6E7] hover:bg-[#FDEFD3]",
    icon: "text-[#C77F0A]",
    count: "bg-[#F5A623]/20 text-[#7A4E0C]",
    divider: "border-[#F5A623]/25",
  },
  critical: {
    border: "border-rose-200",
    surface: "bg-rose-50/80 hover:bg-rose-50",
    icon: "text-rose-600",
    count: "bg-rose-100 text-rose-800",
    divider: "border-rose-100",
  },
  suggestion: {
    border: "border-[#F5A623]/30",
    surface: "bg-[#FFFAF0] hover:bg-[#FEF4E1]",
    icon: "text-[#C77F0A]",
    count: "bg-[#F5A623]/15 text-[#8A5A12]",
    divider: "border-[#F5A623]/20",
  },
  neutral: {
    border: "border-[#E8DFD6]",
    surface: "bg-white hover:bg-[#F7F4F0]",
    icon: "text-[#701522]",
    count: "bg-[#F5E9EA] text-[#4A0D16]",
    divider: "border-[#F0EAE3]",
  },
};

/**
 * A compact one-line summary that expands to its full content. The content stays mounted while
 * collapsed (inert), so nothing inside it is lost or reset, and its height animates open.
 */
export default function CollapsibleNotice({
  icon: Icon,
  label,
  count,
  description,
  tone = "warning",
  forceOpen = false,
  className = "",
  children,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  description: string;
  tone?: NoticeTone;
  /** Opens the notice, initially and whenever it turns true; the user can still collapse it. */
  forceOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(forceOpen);
  const [wasForced, setWasForced] = useState(forceOpen);
  if (forceOpen !== wasForced) {
    setWasForced(forceOpen);
    if (forceOpen) setExpanded(true);
  }
  const contentId = useId();
  const styles = toneStyles[tone];

  return (
    <section aria-label={label} className={`overflow-hidden rounded-lg border bg-white ${styles.border} ${className}`}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((open) => !open)}
        className={`flex h-10 w-full min-w-0 items-center gap-2.5 px-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#F5A623]/60 ${styles.surface}`}
      >
        <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${styles.icon}`} />
        <span className="shrink-0 text-xs font-bold text-[#2a1d1a]">{label}</span>
        <span className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums ${styles.count}`}>
          {count}
          <span className="sr-only"> active</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[#6b5f57] max-sm:sr-only">{description}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#6b5f57]">
          <span className="max-sm:sr-only">{expanded ? "Hide" : "Show"}</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {/* grid-rows 0fr -> 1fr animates the height without measuring it. */}
      <div
        id={contentId}
        inert={!expanded}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className={`min-h-0 overflow-hidden border-t bg-white ${styles.divider}`}>{children}</div>
      </div>
    </section>
  );
}
