import { Sparkles } from "lucide-react";

interface GenerateScheduleButtonProps {
  onClick: () => void;
}

// Gold so it stands out on the workspace header's maroon band. The header (TopBar.css) shortens
// the label to "Generate", then to the icon alone, as it narrows; the accessible name stays "Generate Schedule".
export default function GenerateScheduleButton({ onClick }: GenerateScheduleButtonProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        title="Generate Schedule"
        className="ws-icon-button inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#C9952A] bg-[#C9952A] px-3 text-xs font-bold text-[#36060b] shadow-sm transition-colors hover:border-[#F5C842] hover:bg-[#F5C842]"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="ws-label-primary ws-label-primary-long">Generate Schedule</span>
        <span className="ws-label-short" aria-hidden="true">Generate</span>
      </button>
    </div>
  );
}
