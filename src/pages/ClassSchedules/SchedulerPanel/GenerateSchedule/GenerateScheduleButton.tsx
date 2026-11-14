import { Sparkles } from "lucide-react";

interface GenerateScheduleButtonProps {
  onClick: () => void;
}

// Gold so it stands out on the workspace header's maroon band.
export default function GenerateScheduleButton({ onClick }: GenerateScheduleButtonProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C9952A] bg-[#C9952A] px-3 text-xs font-bold text-[#36060b] shadow-sm transition-colors hover:border-[#F5C842] hover:bg-[#F5C842]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Generate Schedule</span>
        <span className="sm:hidden">Generate</span>
      </button>
    </div>
  );
}
