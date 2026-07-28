import { Sparkles } from "lucide-react";

interface GenerateScheduleButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export default function GenerateScheduleButton({ disabled, onClick }: GenerateScheduleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Select a section still in draft to generate a schedule" : "Auto-generate a schedule"}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 shadow-sm border ${
        disabled
          ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
          : "bg-[#4e0a10] border-[#4e0a10] text-white hover:brightness-110 cursor-pointer"
      }`}
    >
      <Sparkles className="w-3.5 h-3.5" />
      Generate Schedule
    </button>
  );
}
