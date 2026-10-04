import { createElement, type ReactNode } from "react";
import type { Step } from "react-joyride";
import { getStoredUser } from "../lib/storedUser";

export type TourAction =
  | "click"
  | "select"
  | "input"
  | "submit"
  | "toggle"
  | "navigate"
  | "complete";

export interface TaskGuideStep {
  id: string;
  target: string;
  action: TourAction;
  title: string;
  text: string;
  taskHint?: string;
  navigateTo?: string;
  waitFor?: string;
  waitTimeoutMs?: number;
  reveal?: string;
  skipIfMissing?: boolean;
  validate?: (element: Element) => boolean;
  side?: "top" | "right" | "bottom" | "left" | "center";
  align?: "start" | "center" | "end";
}

export type TaskGuideOutcome = "completed" | "dismissed" | "aborted";

const LOCATION_CHANGE_EVENT = "wicars:location-change";

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

export const markTaskTourDone = (tourId: string): void => {
  try {
    localStorage.setItem(taskTourDoneKey(tourId), "true");
  } catch {
  }
};

export const clearTaskTourDone = (tourId: string): void => {
  try {
    localStorage.removeItem(taskTourDoneKey(tourId));
  } catch {
  }
};

export const stepRequiresAction = (step: TaskGuideStep): boolean => step.action !== "complete";

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

const MODAL_SELECTOR = '[aria-modal="true"]:not([role="alertdialog"]), dialog[open]';

export const openModalLayer = (): HTMLElement | null => {
  let layer: HTMLElement | null = null;
  try {
    for (const node of document.querySelectorAll(MODAL_SELECTOR)) {
      if (node.closest("[data-wicars-guide-root]")) continue;
      if (isElementVisible(node)) layer = node;
    }
  } catch {
  }
  return layer;
};

export const isCoveredByModal = (element: Element): boolean => {
  const layer = openModalLayer();
  return layer !== null && !layer.contains(element);
};

const coveredBy = (layer: HTMLElement | null, element: Element): boolean =>
  layer !== null && !layer.contains(element);

export const isSelectorCovered = (selector: string, root: ParentNode = document): boolean => {
  try {
    const layer = openModalLayer();
    if (!layer) return false;
    for (const node of root.querySelectorAll(selector)) {
      if (isElementVisible(node) && coveredBy(layer, node)) return true;
    }
  } catch {
  }
  return false;
};

export const queryVisible = (selector: string, root: ParentNode = document): HTMLElement | null => {
  try {
    const nodes = root.querySelectorAll(selector);
    if (nodes.length === 0) return null;
    const layer = openModalLayer();
    for (const node of nodes) {
      if (isElementVisible(node) && !coveredBy(layer, node)) return node;
    }
  } catch {
  }
  return null;
};

export interface WaitForElementOptions {
  timeoutMs?: number;
  root?: ParentNode;
}

const DEFAULT_WAIT_TIMEOUT_MS = 12000;
export const DOM_POLL_INTERVAL_MS = 150;

export const WATCHED_ATTRIBUTES = ["class", "disabled", "aria-disabled", "aria-modal", "hidden", "open", "role"];

const GUIDE_OWN_SELECTOR = '[data-wicars-guide-root], #react-joyride-portal, [class*="react-joyride__"]';

export const isSelfInflicted = (records: MutationRecord[]): boolean =>
  records.every((record) => {
    const node = record.target instanceof Element ? record.target : record.target.parentElement;
    return node?.closest(GUIDE_OWN_SELECTOR) != null;
  });

export const waitForElement = (
  selector: string,
  { timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, root = document }: WaitForElementOptions = {},
): Promise<HTMLElement | null> => {
  const existing = queryVisible(selector, root);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    let pollId = 0;
    const finish = (element: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      window.clearInterval(pollId);
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(element);
    };
    const check = () => {
      if (settled) return;
      const found = queryVisible(selector, root);
      if (found) finish(found);
    };
    const observer = new MutationObserver((records) => {
      if (isSelfInflicted(records)) return;
      check();
    });
    const target = root instanceof Document ? root.documentElement : (root as Node);
    if (target instanceof Node) {
      observer.observe(target, {
        attributeFilter: WATCHED_ATTRIBUTES,
        attributes: true,
        childList: true,
        subtree: true,
      });
    }
    pollId = window.setInterval(check, DOM_POLL_INTERVAL_MS);
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => {
        if (!settled && isSelectorCovered(selector, root)) {
          arm();
          return;
        }
        finish(queryVisible(selector, root));
      }, timeoutMs);
    };
    arm();
    check();
  });
};

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

const VALUE_ACTIONS = new Set<TourAction>(["select", "input", "toggle"]);

const controlOf = (element: Element): Element => {
  if (element.matches("select, input, textarea, button, [role='switch'], [role='checkbox']")) return element;
  return element.querySelector("select, input, textarea, button") ?? element;
};

const isControlUnavailable = (element: Element): boolean => {
  const control = controlOf(element);
  if (control.getAttribute("aria-disabled") === "true") return true;
  return (
    control instanceof HTMLSelectElement
    || control instanceof HTMLInputElement
    || control instanceof HTMLTextAreaElement
    || control instanceof HTMLButtonElement
  ) && control.disabled;
};

export type StepSatisfaction = "value" | "unavailable";

export const stepSatisfaction = (step: TaskGuideStep, element: Element): StepSatisfaction | null => {
  if (step.action === "complete") return null;
  if (isControlUnavailable(element)) return "unavailable";
  if (!VALUE_ACTIONS.has(step.action)) return null;
  try {
    const validate = step.validate ?? ((el: Element) => defaultValidate(step.action, el));
    return validate(element) ? "value" : null;
  } catch {
    return null;
  }
};

const matchesTarget = (event: Event, selector: string): Element | null => {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const direct = target.closest(selector);
  if (direct) return direct;
  if (event.type === "submit" && target instanceof HTMLFormElement) {
    if (target.matches(selector)) return target;
    return target.querySelector(selector);
  }
  return null;
};

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
      const scope = clicked.closest(step.target) ?? (clicked.matches(step.target) ? clicked : null);
      if (scope && !(scope instanceof HTMLFormElement)) complete(scope);
    };
    document.addEventListener("submit", onSubmit, { capture: true, signal });
    document.addEventListener("click", onClickSubmit, { capture: true, signal });
    return () => controller.abort();
  }

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
  if (side === "center") return "center";
  if (!step.align || step.align === "center") return side;
  return (side + "-" + step.align) as Step["placement"];
};

export interface JoyrideTaskData {
  stepId: string;
  action: TourAction;
  taskHint: string;
  completed: boolean;
  satisfied: StepSatisfaction | null;
  mission: string;
}

export const toJoyrideSteps = (
  steps: TaskGuideStep[],
  completedIds: ReadonlySet<string>,
  mission: string,
  satisfiedIds: ReadonlyMap<string, StepSatisfaction> = new Map(),
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
    satisfied: satisfiedIds.get(step.id) ?? null,
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
