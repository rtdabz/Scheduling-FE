import { ChevronDown, Layers3, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface GenerateScheduleButtonProps {
  disabled: boolean;
  sectionDisabled?: boolean;
  onClick: () => void;
  onYearLevelClick?: () => void;
}

export default function GenerateScheduleButton({ disabled, sectionDisabled = false, onClick, onYearLevelClick }: GenerateScheduleButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} disabled={disabled}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold shadow-sm transition-all ${disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : "border-[#4e0a10] bg-[#4e0a10] text-white hover:brightness-110"}`}>
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">Generate Schedule</span>
        <span className="2xl:hidden">Generate</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && !disabled && (
        <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          <button
            type="button"
            disabled={sectionDisabled}
            onClick={() => { setOpen(false); onClick(); }}
            className={`flex w-full gap-3 rounded-lg px-3 py-2 text-left ` + (sectionDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50")}
          >
            <Sparkles className="mt-0.5 h-4 w-4 text-[#4e0a10]" />
            <span><span className="block text-xs font-bold text-slate-900">Generate Per Section</span><span className="text-[11px] text-slate-500">Use the selected section.</span></span>
          </button>
          <button type="button" onClick={() => { setOpen(false); onYearLevelClick?.(); }} className="flex w-full gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50">
            <Layers3 className="mt-0.5 h-4 w-4 text-[#4e0a10]" />
            <span><span className="block text-xs font-bold text-slate-900">Generate Per Year Level</span><span className="text-[11px] text-slate-500">Allocate rooms across all sections.</span></span>
          </button>
        </div>
      )}
    </div>
  );
}
