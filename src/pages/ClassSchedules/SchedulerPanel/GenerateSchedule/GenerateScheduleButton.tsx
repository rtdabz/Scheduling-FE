import { Sparkles } from "lucide-react";

interface GenerateScheduleButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export default function GenerateScheduleButton({ disabled, onClick }: GenerateScheduleButtonProps) {
  return (
    <div>
      <button type="button" onClick={onClick} disabled={disabled}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold shadow-sm transition-all ${disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : "border-[#4e0a10] bg-[#4e0a10] text-white hover:brightness-110"}`}>
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">Generate Schedule</span>
        <span className="2xl:hidden">Generate</span>
      </button>
    </div>
  );
}
