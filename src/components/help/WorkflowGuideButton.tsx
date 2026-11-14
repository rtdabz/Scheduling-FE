import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isElementVisible, isSelfInflicted, openModalLayer, WATCHED_ATTRIBUTES } from "../../onboarding/taskGuide";

interface WorkflowGuideButtonProps {
  guideId: string;
  id?: string;
  className?: string;
}

export default function WorkflowGuideButton({ guideId, id, className = "" }: WorkflowGuideButtonProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  useEffect(() => {
    const handleProfileMenuState = (event: Event) => {
      setProfileMenuOpen(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    };
    const syncLayer = () => {
      setSessionEnded(document.getElementById("session-timeout-title") !== null);
      setLayer(openModalLayer());
      const scopedWorkflow = Array.from(document.querySelectorAll<HTMLElement>("[data-workflow-guide-scope]")).find(isElementVisible);
      setScope(scopedWorkflow?.dataset.workflowGuideScope ?? null);
    };
    const observer = new MutationObserver((records) => { if (!isSelfInflicted(records)) syncLayer(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: WATCHED_ATTRIBUTES, childList: true, subtree: true });
    window.addEventListener("profile-menu-state", handleProfileMenuState);
    syncLayer();
    return () => {
      observer.disconnect();
      window.removeEventListener("profile-menu-state", handleProfileMenuState);
    };
  }, []);

  if (sessionEnded || (scope && scope !== guideId)) return null;
  return createPortal(
    <button
      id={id}
      type="button"
      data-wicars-guide-help={guideId}
      onClick={() => window.dispatchEvent(new CustomEvent("restart-workflow-guide:" + guideId))}
      title="Open this workflow's help guide"
      aria-label="Open this workflow's help guide"
      className={"fixed " + (profileMenuOpen && !layer ? "bottom-4 top-auto" : "top-[5.5rem] bottom-auto") + " right-3 z-[20002] inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#C9952A]/60 bg-white/95 text-xs font-bold text-[#4e0a10] shadow-lg transition-all hover:-translate-y-0.5 hover:border-[#C9952A] hover:bg-[#fff8e8] hover:shadow-xl sm:right-6 print:hidden " + className}
    >
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-[#4e0a10] text-[11px] font-black leading-none text-white">?</span>
    </button>,
    layer ?? document.body,
  );
}
