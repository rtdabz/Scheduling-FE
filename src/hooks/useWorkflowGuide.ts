import { createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EVENTS, Joyride, type EventData, type Step } from "react-joyride";
import { getStoredUser } from "../lib/storedUser";
import type { TaskGuideOutcome } from "../onboarding/taskGuide";
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
  /** `"center"` renders an unanchored, centered tooltip — see TaskGuideStep. */
  side?: "top" | "right" | "bottom" | "left" | "center";
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
  /**
   * How long to wait for this step's target before giving up (default 12s).
   * Raise it for a step that follows genuinely slow work, such as a queued
   * generation run.
   */
  waitTimeoutMs?: number;
  skipIfMissing?: boolean;
  validate?: (element: Element) => boolean;
  /**
   * Selector of a collapsed parent (sidebar group, accordion, tab) to click
   * once when `element` is not in the DOM yet.
   */
  reveal?: string;
}

interface UseWorkflowGuideOptions {
  id: string;
  isReady: boolean;
  steps: WorkflowGuideStep[];
  /** Mission label shown in task-mode tooltips, e.g. "Create Your First Schedule". */
  mission?: string;
}

type Placement = "center" | "top" | "top-start" | "top-end" | "right" | "right-start" | "right-end" | "bottom" | "bottom-start" | "bottom-end" | "left" | "left-start" | "left-end";

const placement = (side: WorkflowGuideStep["side"], align: WorkflowGuideStep["align"]): Placement => {
  const resolvedSide = side ?? "bottom";
  if (resolvedSide === "center") return "center";
  if (!align || align === "center") return resolvedSide;
  return (resolvedSide + "-" + align) as Placement;
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
        waitTimeoutMs: step.waitTimeoutMs,
        reveal: step.reveal,
        validate: step.validate,
        skipIfMissing: step.skipIfMissing,
        side: step.side,
        align: step.align,
      }));

      // Nonce forces a fresh TaskGuideRunner on every restart: the runner
      // keeps step/progress state internally, so re-rendering the same
      // element would resume a finished mission instead of replaying it.
      let runNonce = 0;

      const renderTaskTour = () => {
        if (!mounted || !root) return;
        runNonce += 1;
        root.render(createElement(TaskGuideRunner, {
          key: "run-" + runNonce,
          tourId,
          mission: mission ?? "Guided tutorial",
          steps: taskSteps,
          onFinish: (outcome: TaskGuideOutcome) => {
            // An abort is the tour's own failure (target never mounted, a
            // dialog closed under it), not a decision by the user: leave it
            // unmarked so the next visit still offers the mission.
            if (outcome !== "aborted") {
              try {
                localStorage.setItem(completionKey, "true");
              } catch {
                // Non-persistent environments still finish the tour in-memory.
              }
            }
            // Unmount the runner but keep this root alive: tearing it down
            // here left the help button with nothing to render into, so
            // restart silently did nothing after the first run.
            if (mounted && root) root.render(null);
            else teardown();
          },
        }));
      };

      const scheduleStart = () => {
        if (frameId !== null) window.cancelAnimationFrame(frameId);
        frameId = window.requestAnimationFrame(() => {
          frameId = null;
          renderTaskTour();
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
