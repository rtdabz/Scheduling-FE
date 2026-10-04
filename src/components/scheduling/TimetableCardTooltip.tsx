import type { ReactNode } from "react";
import { Clock, MapPin, User } from "lucide-react";

interface TimetableCardTooltipProps {
  code: string;
  name: string;
  instructor: ReactNode;
  location: string;
  time: string;
  badge: string;
  placement?: "side" | "vertical";
  align?: "left" | "right";
  verticalAlign?: "above" | "below" | "inside";
  children?: ReactNode;
  open?: boolean;
}

export default function TimetableCardTooltip({
  code,
  name,
  instructor,
  location,
  time,
  badge,
  placement = "side",
  align = "left",
  verticalAlign = "below",
  children,
  open = false,
}: TimetableCardTooltipProps) {
  const isVertical = placement === "vertical";
  const positionClasses = isVertical
    ? `left-1/2 -translate-x-1/2 ${
        verticalAlign === "above" ? "bottom-full mb-2" : verticalAlign === "inside" ? "top-10" : "top-full mt-2"
      }`
    : align === "right"
      ? "right-full mr-2 top-0"
      : "left-full ml-2 top-0";

  return (
    <div
      role={open ? "dialog" : undefined}
      onClick={open ? (e) => e.stopPropagation() : undefined}
      className={`absolute z-50 w-64 cursor-default rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-white shadow-2xl transition-all duration-200 ${
        open
          ? "pointer-events-auto visible opacity-100"
          : "pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100"
      } ${
        isVertical ? "space-y-2 leading-snug" : ""
      } ${positionClasses}`}
    >
      {isVertical && verticalAlign !== "inside" && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 h-0 w-0 border-x-8 border-x-transparent ${
            verticalAlign === "above"
              ? "top-full border-t-8 border-t-slate-900/95"
              : "bottom-full border-b-8 border-b-slate-900/95"
          }`}
        />
      )}

      <div className="flex items-start justify-between gap-2 border-b border-slate-700/80 pb-2">
        <div className="min-w-0">
          <span className="block break-words font-extrabold uppercase tracking-wider text-[#C9952A]">
            {code}
          </span>
          <span className="mt-0.5 block break-words font-semibold leading-tight text-slate-100">
            {name}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-300">
          {badge}
        </span>
      </div>

      <div className={`space-y-1.5 text-[11px] text-slate-300 ${isVertical ? "" : "mt-2"}`}>
        <div className="flex items-start gap-2">
          <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C9952A]" />
          <span className="min-w-0 break-words"><strong className="text-slate-200">Instructor: </strong>{instructor}</span>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C9952A]" />
          <span className="min-w-0 break-words"><strong className="text-slate-200">Location: </strong>{location}</span>
        </div>
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C9952A]" />
          <span className="min-w-0 break-words"><strong className="text-slate-200">Time: </strong>{time}</span>
        </div>
      </div>

      {children}
    </div>
  );
}
