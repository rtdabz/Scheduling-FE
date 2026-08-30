import { Sparkles } from "lucide-react";

interface GenerateScheduleButtonProps {
  onClick: () => void;
}

export default function GenerateScheduleButton({ onClick }: GenerateScheduleButtonProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 rounded-xl border border-[#4e0a10] bg-[#4e0a10] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:brightness-110"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">Generate Schedule</span>
        <span className="2xl:hidden">Generate</span>
      </button>
    </div>
  );
}
