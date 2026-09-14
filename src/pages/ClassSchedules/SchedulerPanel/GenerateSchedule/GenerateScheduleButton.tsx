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
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#4e0a10] bg-[#4e0a10] px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#3a0809]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden 2xl:inline">Generate Schedule</span>
        <span className="2xl:hidden">Generate</span>
      </button>
    </div>
  );
}
