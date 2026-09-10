import { createElement, type ReactNode } from "react";
import type { Step } from "react-joyride";
import { getStoredUser } from "../lib/storedUser";

/**
 * Task-based interactive guide core.
 *
 * This module keeps the existing react-joyride tour library and adds a small
 * reusable action layer on top of it, so guides behave like game tutorials:
 * each step names an action, the user performs it on the real UI, and the
 * tour advances automatically. Steps are declared as data ({@link TaskGuideStep})
 * instead of hard-coded Joyride configuration.
 */

/** Reusable interaction kinds a tour step can require from the user. */
export type TourAction =
  | "click"
  | "select"
  | "input"
  | "submit"
  | "toggle"
  | "navigate"
  | "complete";

/** Declarative definition of one interactive tour step. */
export interface TaskGuideStep {
  /** Stable id used for progress tracking (must be unique within a tour). */
  id: string;
  /** CSS selector of the element to spotlight. */
  target: string;
  /** Action the user must perform before the tour continues. */
  action: TourAction;
  /** Tooltip heading. */
  title: string;
  /** Tooltip body copy. */
  text: string;
  /** Short imperative hint, e.g. "Click Curriculum to continue". */
  taskHint?: string;
  /**
   * Expected location after the action (matched with endsWith against
   * `window.location.pathname`). Used to detect navigation-driven steps.
   */
  navigateTo?: string;
  /**
   * Selector the runner waits for before showing the step. Defaults to
   * `target`. Useful when the spotlight target appears conditionally.
   */
  waitFor?: string;
  /**
   * Selector of a parent expander (e.g. a collapsed sidebar group) to click
   * when `target` is not in the DOM yet.
   */
  reveal?: string;
  /**
   * Skip this step (instead of ending the tour) when its target never mounts.
   * Use for genuinely conditional UI, e.g. a program selector that only
   * appears after a department with programs is chosen.
   */
  skipIfMissing?: boolean;
  /** Custom completion check; overrides the default per-action validation. */
  validate?: (element: Element) => boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

/** One role-scoped mission composed of declarative task steps. */
export interface RoleTour {
  id: string;
  roles: string[];
  title: string;
  mission: string;
  /** First route of the mission; the host navigates here on start. */
  entryPath: string;
  steps: TaskGuideStep[];
}

export const TASK_TOUR_START_EVENT = "wicars:task-tour-start";
export const TASK_TOUR_STOP_EVENT = "wicars:task-tour-stop";
const TASK_TOUR_SESSION_KEY = "wicars_task_tour_active";
const LOCATION_CHANGE_EVENT = "wicars:location-change";

/** Payload for {@link TASK_TOUR_START_EVENT}. */
export interface TaskTourStartDetail {
  tourId: string;
}

/** Starts a task tour from anywhere (buttons, help menu, console). */
export const startTaskTour = (tourId: string): void => {
  window.dispatchEvent(new CustomEvent<TaskTourStartDetail>(TASK_TOUR_START_EVENT, { detail: { tourId } }));
};

/** Requests the running task tour (if any) to stop without marking completion. */
export const cancelTaskTour = (): void => {
  window.dispatchEvent(new CustomEvent(TASK_TOUR_STOP_EVENT));
};

export const setActiveTaskTour = (tourId: string | null): void => {
  try {
    if (tourId) sessionStorage.setItem(TASK_TOUR_SESSION_KEY, tourId);
    else sessionStorage.removeItem(TASK_TOUR_SESSION_KEY);
  } catch {
    // Storage can throw in privacy modes; the tour still works in-memory.
  }
};

export const getActiveTaskTourId = (): string | null => {
  try {
    return sessionStorage.getItem(TASK_TOUR_SESSION_KEY);
  } catch {
    return null;
  }
};

const getTaskTourUserKey = (): string => {
  const user = getStoredUser();
  return String(user?.id ?? user?.email ?? "current");
};

export const taskTourDoneKey = (tourId: string): string =>
  "wicars_task_tour_done_" + tourId + "_" + getTaskTourUserKey();

export const isTaskTourDone = (tourId: string): boolean => {
  try {
    return localStorage.getItem(taskTourDoneKey(tourId)) === "true";
  } catch {
    return false;
  }
};

/** Marks a mission finished/dismissed so it never auto-starts again. */
export const markTaskTourDone = (tourId: string): void => {
  try {
    localStorage.setItem(taskTourDoneKey(tourId), "true");
  } catch {
    // Non-persistent environments can still run the tour in-memory.
  }
};

/** Clears completion so the mission can be restarted from Help. */
export const clearTaskTourDone = (tourId: string): void => {
  try {
    localStorage.removeItem(taskTourDoneKey(tourId));
  } catch {
    // Ignore storage failures; restart still works for this session.
  }
};

/** True for steps that require a real user action (no Next button). */
export const stepRequiresAction = (step: TaskGuideStep): boolean => step.action !== "complete";

/** Short game-tutorial verb for an action, shown as a pill in the tooltip. */
export const actionVerb = (action: TourAction): string => {
  switch (action) {
    case "click": return "Click";
    case "select": return "Select";
    case "input": return "Type";
    case "submit": return "Submit";
    case "toggle": return "Toggle";
    case "navigate": return "Open";
    case "complete": return "Review";
  }
};

export const defaultTaskHint = (step: TaskGuideStep): string => {
  if (step.taskHint) return step.taskHint;
  switch (step.action) {
    case "click": return "Click the highlighted area to continue.";
    case "select": return "Choose an option in the highlighted field.";
    case "input": return "Type into the highlighted field.";
    case "submit": return "Submit the highlighted form.";
    case "toggle": return "Toggle the highlighted control.";
    case "navigate": return "Follow the highlighted link.";
    case "complete": return "Review, then finish when you are ready.";
  }
};

export const isElementVisible = (element: Element | null): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false;
  const styles = window.getComputedStyle(element);
  if (styles.display === "none" || styles.visibility === "hidden") return false;
  return element.getClientRects().length > 0;
};

/** First visible match for a selector, or null. */
export const queryVisible = (selector: string, root: ParentNode = document): HTMLElement | null => {
  try {
    const nodes = root.querySelectorAll(selector);
    for (const node of nodes) {
      if (isElementVisible(node)) return node;
    }
  } catch {
    // Invalid selectors never match; the runner treats them as "not ready".
  }
  return null;
};

export interface WaitForElementOptions {
  timeoutMs?: number;
  root?: ParentNode;
}

const DEFAULT_WAIT_TIMEOUT_MS = 12000;

/**
 * Resolves with the first visible element matching `selector`, waiting for
 * React to mount it (MutationObserver, no arbitrary sleeps). Resolves null
 * on timeout so the caller can decide how to recover.
 */
export const waitForElement = (
  selector: string,
  { timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, root = document }: WaitForElementOptions = {},
): Promise<HTMLElement | null> => {
  const existing = queryVisible(selector, root);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    let rafId = 0;
    const finish = (element: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(element);
    };
    const check = () => {
      if (settled) return;
      const found = queryVisible(selector, root);
      if (found) finish(found);
      else rafId = requestAnimationFrame(check);
    };
    const observer = new MutationObserver(check);
    const target = root instanceof Document ? root.documentElement : (root as Node);
    if (target instanceof Node) {
      observer.observe(target, { childList: true, subtree: true, attributes: true });
    }
    const timer = window.setTimeout(() => finish(queryVisible(selector, root)), timeoutMs);
    rafId = requestAnimationFrame(check);
  });
};

/** Patches history once so SPA navigation can be observed like popstate. */
let locationPatchInstalled = false;
export const ensureLocationChangeEvents = (): void => {
  if (locationPatchInstalled || typeof window === "undefined" || !window.history) return;
  locationPatchInstalled = true;
  const notify = () => window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
  const originalPush = window.history.pushState.bind(window.history);
  const originalReplace = window.history.replaceState.bind(window.history);
  window.history.pushState = (...args) => {
    originalPush(...args);
    notify();
  };
  window.history.replaceState = (...args) => {
    originalReplace(...args);
    notify();
  };
  window.addEventListener("popstate", notify);
};

export const locationMatches = (expected: string): boolean => {
  const path = window.location.pathname;
  return path === expected || path.endsWith(expected);
};

const readControlValue = (container: Element): string | null => {
  if (container instanceof HTMLSelectElement) return container.value;
  if (container instanceof HTMLTextAreaElement) return container.value;
  if (container instanceof HTMLInputElement) {
    return container.type === "checkbox" || container.type === "radio"
      ? (container.checked ? "checked" : "")
      : container.value;
  }
  const nested = container.querySelector("select, input, textarea");
  if (nested instanceof HTMLSelectElement || nested instanceof HTMLTextAreaElement) return nested.value;
  if (nested instanceof HTMLInputElement) {
    return nested.type === "checkbox" || nested.type === "radio"
      ? (nested.checked ? "checked" : "")
      : nested.value;
  }
  return null;
};

/** Default completion check per action; custom `validate` always wins. */
export const defaultValidate = (action: TourAction, element: Element): boolean => {
  switch (action) {
    case "select":
    case "input": {
      const value = readControlValue(element);
      return value !== null && value.trim() !== "";
    }
    case "toggle": {
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        return element.checked;
      }
      const nested = element.querySelector("input[type='checkbox'], input[type='radio']");
      if (nested instanceof HTMLInputElement) return nested.checked;
      return true;
    }
    default:
      return true;
  }
};

const matchesTarget = (event: Event, selector: string): Element | null => {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const direct = target.closest(selector);
  if (direct) return direct;
  // Submit events target the <form>; accept submits from controls inside it.
  if (event.type === "submit" && target instanceof HTMLFormElement) {
    if (target.matches(selector)) return target;
    return target.querySelector(selector);
  }
  return null;
};

/**
 * Listens for the step's required action exactly once, then calls `onDone`.
 * Uses a single document-level capture listener per attachment and returns a
 * cleanup that removes every listener (call it on step change and unmount).
 */
export const attachTaskListener = (step: TaskGuideStep, onDone: () => void): (() => void) => {
  if (step.action === "complete") return () => undefined;
  ensureLocationChangeEvents();

  const controller = new AbortController();
  const { signal } = controller;
  let fired = false;
  const complete = (element: Element) => {
    if (fired || signal.aborted) return;
    const validate = step.validate ?? ((el: Element) => defaultValidate(step.action, el));
    let valid: boolean;
    try {
      valid = validate(element);
    } catch {
      valid = false;
    }
    if (!valid) return;
    fired = true;
    controller.abort();
    onDone();
  };

  if (step.action === "navigate") {
    if (step.navigateTo && locationMatches(step.navigateTo)) {
      queueMicrotask(() => complete(document.body));
      return () => controller.abort();
    }
    const onLocation = () => {
      if (step.navigateTo && locationMatches(step.navigateTo)) complete(document.body);
    };
    window.addEventListener(LOCATION_CHANGE_EVENT, onLocation, { signal });
    window.addEventListener("popstate", onLocation, { signal });
    return () => controller.abort();
  }

  if (step.action === "select" || step.action === "input") {
    const onChange = (event: Event) => {
      const element = matchesTarget(event, step.target);
      if (!element) return;
      // Filter bars hold several controls (search + selects). Validate the
      // control that fired the event, not the wrapper's first nested input.
      const source = event.target;
      const control = source instanceof HTMLSelectElement
        || source instanceof HTMLInputElement
        || source instanceof HTMLTextAreaElement
        ? source
        : element;
      complete(control);
    };
    document.addEventListener("input", onChange, { capture: true, signal });
    document.addEventListener("change", onChange, { capture: true, signal });
    return () => controller.abort();
  }

  if (step.action === "submit") {
    const onSubmit = (event: Event) => {
      const element = matchesTarget(event, step.target);
      if (element) complete(element);
    };
    const onClickSubmit = (event: Event) => {
      const clicked = event.target instanceof Element
        ? event.target.closest("[type='submit']")
        : null;
      if (!clicked) return;
      const scope = clicked.closest(step.target) ?? (clicked instanceof Element && clicked.matches(step.target) ? clicked : null);
      if (scope) complete(scope);
    };
    document.addEventListener("submit", onSubmit, { capture: true, signal });
    document.addEventListener("click", onClickSubmit, { capture: true, signal });
    return () => controller.abort();
  }

  // click + toggle: any activating click on the spotlighted element counts.
  const onClick = (event: Event) => {
    const element = matchesTarget(event, step.target);
    if (element) complete(element);
  };
  document.addEventListener("click", onClick, { capture: true, signal });
  if (step.action === "toggle") {
    const onToggle = (event: Event) => {
      const element = matchesTarget(event, step.target);
      if (element) complete(element);
    };
    document.addEventListener("change", onToggle, { capture: true, signal });
  }
  return () => controller.abort();
};

const joyridePlacement = (step: TaskGuideStep): Step["placement"] => {
  const side = step.side ?? "bottom";
  if (!step.align || step.align === "center") return side;
  return (side + "-" + step.align) as Step["placement"];
};

export interface JoyrideTaskData {
  stepId: string;
  action: TourAction;
  taskHint: string;
  completed: boolean;
  mission: string;
}

/**
 * Converts declarative task steps to Joyride steps. Body copy and completion
 * state travel in the step so the custom tooltip can render progress and the
 * no-Next-button rule without extra wiring.
 */
export const toJoyrideSteps = (
  steps: TaskGuideStep[],
  completedIds: ReadonlySet<string>,
  mission: string,
): Step[] => steps.map((step, index) => {
  const copy: ReactNode = createElement(
    "div",
    { className: "wicars-coach-mark-copy" },
    createElement("p", null, step.text),
    createElement("span", null, defaultTaskHint(step)),
  );
  const data: JoyrideTaskData = {
    stepId: step.id,
    action: step.action,
    taskHint: defaultTaskHint(step),
    completed: completedIds.has(step.id),
    mission,
  };
  return {
    target: step.target,
    title: (index + 1) + ". " + step.title,
    content: copy,
    placement: joyridePlacement(step),
    data,
  } satisfies Step;
});
