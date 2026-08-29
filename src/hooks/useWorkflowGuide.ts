import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EVENTS, Joyride, type EventData, type Step } from "react-joyride";
import { getStoredUser } from "../lib/storedUser";
import "../styles/onboarding.css";
import {
  announceJoyrideStart,
  coachMarkOptions,
  coachMarkStyles,
  listenForOtherJoyrides,
} from "../onboarding/joyrideTour";

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
  return (resolvedSide + "-" + align) as ReturnType<typeof placement>;
};

const isVisible = (selector: string): boolean => {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) return false;
  const styles = window.getComputedStyle(element);
  return styles.display !== "none" && styles.visibility !== "hidden" && element.getClientRects().length > 0;
};

const createSteps = (steps: WorkflowGuideStep[]): Step[] => steps
  .filter((step) => isVisible(step.element))
  .map((step, index) => ({
    id: "workflow-step-" + (index + 1),
    target: step.element,
    title: (index + 1) + ". " + step.title.replace(/^\s*\d+\s*[.)-]?\s*/, ""),
    content: createElement(
      "div",
      { className: "wicars-coach-mark-copy" },
      createElement("p", null, step.description),
      createElement("span", null, "Use the highlighted area, then continue when you are ready."),
    ),
    placement: placement(step.side, step.align),
  }));

/** Shared React Joyride lifecycle for focused, page-specific coach marks. */
export function useWorkflowGuide({ id, isReady, steps }: UseWorkflowGuideOptions) {
  useEffect(() => {
    if (!isReady) return;

    const user = getStoredUser();
    const userKey = user?.id ?? user?.email ?? "current";
    const completionKey = "wicars_workflow_guide_done_v2_" + id + "_" + userKey;
    const restartEvent = "restart-workflow-guide:" + id;
    const tourId = "workflow:" + id;
    const host = document.createElement("div");
    host.dataset.wicarsGuideRoot = id;
    document.body.appendChild(host);

    let mounted = true;
    let frameId: number | null = null;
    let root: Root | null = createRoot(host);
    let activeSteps: Step[] = [];

    const stop = () => {
      if (!root) return;
      root.render(createElement(Joyride, {
        continuous: true,
        options: coachMarkOptions,
        run: false,
        steps: activeSteps,
        styles: coachMarkStyles,
      }));
    };

    const handleEvent = (event: EventData) => {
      if (event.type === EVENTS.TOUR_END) stop();
    };

    const start = () => {
      if (!mounted || !root) return;
      activeSteps = createSteps(steps);
      if (!activeSteps.length) return;

      localStorage.setItem(completionKey, "true");
      announceJoyrideStart(tourId);
      root.render(createElement(Joyride, {
        continuous: true,
        locale: {
          back: "Back",
          close: "Close",
          last: "Finish",
          next: "Next",
          nextWithProgress: "Next ({current} of {total})",
          skip: "Exit guide",
        },
        onEvent: handleEvent,
        options: coachMarkOptions,
        run: true,
        scrollToFirstStep: true,
        steps: activeSteps,
        styles: coachMarkStyles,
      }));
    };

    const scheduleStart = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        start();
      });
    };

    if (!localStorage.getItem(completionKey)) scheduleStart();

    const restart = () => scheduleStart();
    const stopForOtherTour = listenForOtherJoyrides(tourId, stop);
    window.addEventListener(restartEvent, restart);

    return () => {
      mounted = false;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      stopForOtherTour();
      window.removeEventListener(restartEvent, restart);
      root?.unmount();
      root = null;
      host.remove();
    };
  }, [id, isReady, steps]);
}
