import { Clock, MapPin, User } from "lucide-react";

interface TimetableCardTooltipProps {
  code: string;
  name: string;
  instructor: string;
  location: string;
  time: string;
  badge: string;
  align?: "left" | "right";
}

export default function TimetableCardTooltip({
  code,
  name,
  instructor,
  location,
  time,
  badge,
  align = "left",
}: TimetableCardTooltipProps) {
  return (
    <div
      className={`pointer-events-none invisible absolute z-50 w-64 rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-white opacity-0 shadow-2xl backdrop-blur-md transition-all duration-200 group-hover:visible group-hover:opacity-100 ${
        align === "right" ? "right-full mr-2 top-0" : "left-full ml-2 top-0"
      }`}
    >
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

      <div className="mt-2 space-y-1.5 text-[11px] text-slate-300">
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
    </div>
  );
}
