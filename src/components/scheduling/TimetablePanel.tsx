import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import Skeleton from "../ui/Skeleton";

/**
 * The chrome around every weekly timetable, taken from Schedule Management: a maroon title
 * bar that the grid's day row continues, the grid itself, and a legend strip underneath.
 */

interface TimetableTitleBarProps {
  title?: ReactNode;
  /** Gold lead-in after the title, such as the section or room. */
  highlight?: ReactNode;
  /** Muted detail after the highlight, such as the semester. */
  detail?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  isLoading?: boolean;
  className?: string;
}

/** No bottom border: the grid's day row continues this band as one header block. */
export function TimetableTitleBar({
  title = "Timetable",
  highlight,
  detail,
  icon,
  actions,
  isLoading = false,
  className = "",
}: TimetableTitleBarProps) {
  const hasMeta = highlight != null || detail != null;
  return (
    <div className={`bg-wicars-header flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 ${className}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ?? <CalendarDays className="h-4 w-4 shrink-0 text-[#F5C842]" aria-hidden="true" />}
        <h2 className="shrink-0 text-sm font-bold text-white">{title}</h2>
        {isLoading ? (
          <Skeleton className="h-3 w-48" />
        ) : hasMeta && (
          <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 border-l border-white/20 pl-2.5 text-xs text-white/70">
            {highlight != null && <span className="font-semibold text-[#F5C842]">{highlight}</span>}
            {highlight != null && detail != null && <span aria-hidden="true" className="text-white/35">•</span>}
            {detail != null && <span>{detail}</span>}
          </p>
        )}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface TimetableLegendItem {
  label: string;
  swatch: string;
}

export interface TimetableLegendGroup {
  label: string;
  items: TimetableLegendItem[];
}

export function TimetableLegend({ groups, className = "" }: { groups: TimetableLegendGroup[]; className?: string }) {
  const visible = groups.filter((group) => group.items.length > 0);
  if (visible.length === 0) return null;
  return (
    <div
      className={`flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200 bg-[#faf7f3] px-4 py-2 text-[11px] font-medium text-slate-500 ${className}`}
    >
      {visible.map((group, index) => (
        <span key={group.label} className="contents">
          {index > 0 && <span aria-hidden="true" className="hidden h-3.5 w-px bg-slate-300 sm:block" />}
          <span className="font-semibold text-slate-600">{group.label}</span>
          {group.items.map(({ label, swatch }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`h-3 w-3 rounded-sm border ${swatch}`} />
              {label}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

interface TimetablePanelProps {
  /** Title bar content; omit to render the frame without one (for example inside a titled modal). */
  titleBar?: TimetableTitleBarProps | null;
  legend?: TimetableLegendGroup[];
  children: ReactNode;
  id?: string;
  className?: string;
  /** Classes for the scrolling body that holds the grid. */
  bodyClassName?: string;
}

export default function TimetablePanel({
  titleBar,
  legend,
  children,
  id,
  className = "",
  bodyClassName = "",
}: TimetablePanelProps) {
  return (
    <div id={id} className={`flex min-w-0 flex-col overflow-clip rounded-xl border border-slate-200 bg-white ${className}`}>
      {titleBar && <TimetableTitleBar {...titleBar} />}
      <div className={`relative flex min-h-0 flex-1 flex-col overflow-auto bg-white ${bodyClassName}`}>
        {children}
      </div>
      {legend && <TimetableLegend groups={legend} />}
    </div>
  );
}
