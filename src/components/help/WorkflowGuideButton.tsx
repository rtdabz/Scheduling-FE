import { useEffect, useState } from "react";

interface WorkflowGuideButtonProps {
  guideId: string;
  id?: string;
  className?: string;
}

export default function WorkflowGuideButton({ guideId, id, className = "" }: WorkflowGuideButtonProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    const handleProfileMenuState = (event: Event) => {
      setProfileMenuOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    };
    window.addEventListener("profile-menu-state", handleProfileMenuState);
    return () => window.removeEventListener("profile-menu-state", handleProfileMenuState);
  }, []);

  return (
    <button
      id={id}
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(`restart-workflow-guide:${guideId}`))}
      title="Open this workflow's help guide"
      aria-label="Open this workflow's help guide"
      className={`fixed ${profileMenuOpen ? "bottom-4 top-auto" : "top-[5.5rem] bottom-auto"} right-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#C9952A]/60 bg-white/95 text-xs font-bold text-[#4e0a10] shadow-lg backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-[#C9952A] hover:bg-[#fff8e8] hover:shadow-xl sm:right-6 ${className}`}
    >
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-[#4e0a10] text-[11px] font-black leading-none text-white">?</span>
    </button>
  );
}
