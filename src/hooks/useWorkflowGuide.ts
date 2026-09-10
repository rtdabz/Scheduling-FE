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
import TaskGuideRunner from "../onboarding/TaskGuideRunner";
import type { TourAction } from "../onboarding/taskGuide";

export interface WorkflowGuideStep {
  element: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /**
   * Optional task-mode fields. When any step sets an `action` other than
   * "complete", the guide runs as a game-style mission: no Next button until
   * the user performs the action, then it auto-advances. Steps without an
   * action keep the classic walkthrough behavior.
   */
  id?: string;
  action?: TourAction;
  taskHint?: string;
  waitFor?: string;
  skipIfMissing?: boolean;
  validate?: (element: Element) => boolean;
}

interface UseWorkflowGuideOptions {
  id: string;
  isReady: boolean;
  steps: WorkflowGuideStep[];
  /** Mission label shown in task-mode tooltips, e.g. "Create Your First Schedule". */
  mission?: string;
}

const placement = (side: WorkflowGuideStep["side"], align: WorkflowGuideStep["align"]): "top" | "top-start" | "top-end" | "right" | "right-start" | "right-end" | "bottom" | "bottom-start" | "bottom-end" | "left" | "left-start" | "left-end" => {
  const resolvedSide = side ?? "bottom";
  if (!align || align === "center") return resolvedSide;
  return (resolvedSide + "-" + align) as ReturnType<typeof placement>;
};

const cleanTitle = (title: string): string => title.replace(/^\s*\d+\s*[.)-]?\s*/, "");

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
    title: (index + 1) + ". " + cleanTitle(step.title),
    content: createElement(
      "div",
      { className: "wicars-coach-mark-copy" },
      createElement("p", null, step.description),
      createElement("span", null, "Use the highlighted area, then continue when you are ready."),
    ),
    placement: placement(step.side, step.align),
  }));

const isTaskMode = (steps: WorkflowGuideStep[]): boolean =>
  steps.some((step) => step.action !== undefined && step.action !== "complete");

/** Shared React Joyride lifecycle for focused, page-specific coach marks. */
export function useWorkflowGuide({ id, isReady, steps, mission }: UseWorkflowGuideOptions) {
  useEffect(() => {
    if (!isReady) return;

    const user = getStoredUser();
    const userKey = user?.id ?? user?.email ?? "current";
    const completionKey = "wicars_workflow_guide_done_v3_" + id + "_" + userKey;
    const restartEvent = "restart-workflow-guide:" + id;
    const tourId = "workflow:" + id;
    const host = document.createElement("div");
    host.dataset.wicarsGuideRoot = id;
    document.body.appendChild(host);

    let mounted = true;
    let frameId: number | null = null;
    let root: Root | null = createRoot(host);
    let activeSteps: Step[] = [];

    const teardown = () => {
      const rootToUnmount = root;
      root = null;
      if (!rootToUnmount) return;
      // React can run effect cleanup while the parent root is still in its
      // commit. Unmount this independently-created Joyride root in the next
      // microtask so it never synchronously tears down a root during render.
      queueMicrotask(() => {
        rootToUnmount.unmount();
        host.remove();
      });
    };

    if (isTaskMode(steps)) {
      // ---- Task-based mission: perform each action to advance. ----
      const taskSteps = steps.map((step, index) => ({
        id: step.id ?? "step-" + (index + 1),
        target: step.element,
        action: step.action ?? "complete" as TourAction,
        title: cleanTitle(step.title),
        text: step.description,
        taskHint: step.taskHint,
        waitFor: step.waitFor ?? step.element,
        validate: step.validate,
        skipIfMissing: step.skipIfMissing,
        side: step.side,
        align: step.align,
      }));

      const startTaskTour = () => {
        if (!mounted || !root) return;
        root.render(createElement(TaskGuideRunner, {
          tourId,
          mission: mission ?? "Guided tutorial",
          steps: taskSteps,
          onFinish: () => {
            try {
              localStorage.setItem(completionKey, "true");
            } catch {
              // Non-persistent environments still finish the tour in-memory.
            }
            teardown();
          },
        }));
      };

      const scheduleStart = () => {
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(() => {
          frameId = null;
          startTaskTour();
        });
      };

      // Completion is marked on finish/exit (not on start) so an interrupted
      // mission can resume on the next visit instead of vanishing silently.
      try {
        if (!localStorage.getItem(completionKey)) scheduleStart();
      } catch {
        scheduleStart();
      }

      const restart = () => scheduleStart();
      window.addEventListener(restartEvent, restart);

      return () => {
        mounted = false;
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        window.removeEventListener(restartEvent, restart);
        teardown();
      };
    }

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
      teardown();
    };
  }, [id, isReady, steps, mission]);
}
