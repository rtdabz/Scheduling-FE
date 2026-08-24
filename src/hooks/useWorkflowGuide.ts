import { useEffect } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { getStoredUser } from "../lib/storedUser";

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

/** Shared Driver.js lifecycle for focused, page-specific workflow guides. */
export function useWorkflowGuide({ id, isReady, steps }: UseWorkflowGuideOptions) {
  useEffect(() => {
    if (!isReady) return;

    const user = getStoredUser();
    const userKey = user?.id ?? user?.email ?? "current";
    const completionKey = `wicars_workflow_guide_done_${id}_${userKey}`;
    const restartEvent = `restart-workflow-guide:${id}`;
    let mounted = true;
    let frameId: number | null = null;
    let activeGuide: ReturnType<typeof driver> | null = null;

    const start = () => {
      if (!mounted) return;
      activeGuide?.destroy();

      const visibleSteps = steps
        .filter((step) => document.querySelector(step.element))
        .map((step, index) => ({
          element: step.element,
          popover: {
            // Number only the targets that are currently visible. Some workflow
            // controls are conditional, so hardcoded numbers can otherwise skip
            // from 2 to 4 when an unavailable step is filtered out.
            title: `${index + 1}. ${step.title.replace(/^\s*\d+\s*[.)-]?\s*/, "")}`,
            description: step.description,
            side: step.side ?? "bottom",
            align: step.align ?? "center",
          },
        }));
      if (!visibleSteps.length) return;

      // Record the first display immediately. A page refresh while the guide is
      // open must not cause the same automatic tour to launch again.
      localStorage.setItem(completionKey, "true");

      activeGuide = driver({
        animate: true,
        smoothScroll: false,
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Finish",
        steps: visibleSteps,
        onHighlightStarted: (element) => {
          // Scroll before Driver.js calculates the spotlight and popover
          // positions. Scrolling after highlighting leaves the overlay behind
          // when a later step is lower on the page.
          if (element instanceof HTMLElement) {
            element.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
          }
        },
      });
      activeGuide.drive();
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
      activeGuide?.destroy();
      window.removeEventListener(restartEvent, restart);
    };
  }, [id, isReady, steps]);
}
