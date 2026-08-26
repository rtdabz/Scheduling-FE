import { useEffect } from "react";
import Shepherd, { type Tour } from "shepherd.js";
import { getStoredUser } from "../lib/storedUser";
import { startExclusiveTour } from "../onboarding/shepherdTour";

export interface WorkflowGuideStep {
  element: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

interface UseWorkflowGuideOptions {
  id: string;
  isReady: boolean;
  steps: WorkflowGuideStep[];
}

const placement = (side: WorkflowGuideStep["side"], align: WorkflowGuideStep["align"]): "top" | "top-start" | "top-end" | "right" | "right-start" | "right-end" | "bottom" | "bottom-start" | "bottom-end" | "left" | "left-start" | "left-end" => {
  const resolvedSide = side ?? "bottom";
  if (!align || align === "center") return resolvedSide;
  return `${resolvedSide}-${align}`;
};

/** Shared Shepherd lifecycle for focused, page-specific workflow guides. */
export function useWorkflowGuide({ id, isReady, steps }: UseWorkflowGuideOptions) {
  useEffect(() => {
    if (!isReady) return;

    const user = getStoredUser();
    const userKey = user?.id ?? user?.email ?? "current";
    const completionKey = `wicars_workflow_guide_done_${id}_${userKey}`;
    const restartEvent = `restart-workflow-guide:${id}`;
    let mounted = true;
    let frameId: number | null = null;
    let activeGuide: Tour | null = null;

    const start = () => {
      if (!mounted) return;
      if (activeGuide) void activeGuide.cancel();

      const visibleSteps = steps
        .filter((step) => {
          const element = document.querySelector(step.element);
          if (!(element instanceof HTMLElement)) return false;
          const styles = window.getComputedStyle(element);
          return styles.display !== "none" && styles.visibility !== "hidden" && element.getClientRects().length > 0;
        })
        .map((step) => step);
      if (!visibleSteps.length) return;

      // Record the first display immediately. A page refresh while the guide is
      // open must not cause the same automatic tour to launch again.
      localStorage.setItem(completionKey, "true");

      activeGuide = new Shepherd.Tour({
        id: `workflow-${id}`,
        useModalOverlay: true,
        defaultStepOptions: {
          cancelIcon: { enabled: true, label: "Close workflow guide" },
          classes: "wicars-shepherd-step",
          canClickTarget: false,
          scrollTo: { block: "center", inline: "nearest", behavior: "auto" },
          skipMissingElement: true,
          waitForElement: 500,
          modalOverlayOpeningPadding: 6,
          modalOverlayOpeningRadius: 12,
        },
      });

      visibleSteps.forEach((step, index) => {
        const isLast = index === visibleSteps.length - 1;
        activeGuide?.addStep({
          id: `${id}-${index + 1}`,
          title: `${index + 1}. ${step.title.replace(/^\s*\d+\s*[.)-]?\s*/, "")}`,
          text: `<p>${step.description}</p><span class="wicars-shepherd-progress">${index + 1} of ${visibleSteps.length}</span>`,
          attachTo: { element: step.element, on: placement(step.side, step.align) },
          buttons: [
            ...(index > 0 ? [{ text: "Back", secondary: true, action(this: Tour) { void this.back(); } }] : []),
            { text: isLast ? "Finish" : "Next", action(this: Tour) { if (isLast) this.complete(); else void this.next(); } },
          ],
        });
      });
      void startExclusiveTour(activeGuide);
    };

    const scheduleStart = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        start();
      });
    };
    // Manual help requests may replay the tour, but must not clear the
    // completion flag. Clearing it would make the guide auto-open again after
    // a remount or a workflow/status change.
    const restart = () => scheduleStart();

    if (!localStorage.getItem(completionKey)) scheduleStart();
    window.addEventListener(restartEvent, restart);

    return () => {
      mounted = false;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (activeGuide) void activeGuide.cancel();
      window.removeEventListener(restartEvent, restart);
    };
  }, [id, isReady, steps]);
}
