import { createElement, type ReactNode } from "react";
import type { Step } from "react-joyride";

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
  skipIfMissing?: boolean;
  validate?: (element: Element) => boolean;
  isSatisfied?: () => boolean;
  side?: "top" | "right" | "bottom" | "left" | "center";
  align?: "start" | "center" | "end";
}

export type TaskGuideOutcome = "completed" | "dismissed" | "aborted";

const LOCATION_CHANGE_EVENT = "wicars:location-change";

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
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  if (element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const styles = window.getComputedStyle(node);
    if (styles.display === "none" || styles.visibility === "hidden" || styles.visibility === "collapse" || styles.opacity === "0") return false;
  }
  return element.getClientRects().length > 0;
};

const GUIDE_OWN_SELECTOR = '[data-wicars-guide-root], #react-joyride-portal, [data-wicars-guide-portal], [data-wicars-guide-help], [data-wicars-guide-recovery], .wicars-task-tip, [class*="react-joyride__"]';
const MODAL_SELECTOR = '[aria-modal="true"][role="dialog"], [aria-modal="true"][role="alertdialog"], dialog[open]';

// Compare enclosing stacking contexts, since a shared Modal's z-index lives on
// its backdrop rather than the dialog element itself.
const stackingPath = (element: HTMLElement): number[] => {
  const path: number[] = [];
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    const z = Number.parseInt(style.zIndex, 10);
    if (Number.isFinite(z)) path.unshift(z);
    else if (style.position === "fixed" || style.position === "sticky" || (style.transform && style.transform !== "none") || style.isolation === "isolate") path.unshift(0);
  }
  return path;
};

const isNativeModal = (element: HTMLElement): boolean => {
  try {
    return element.matches("dialog:modal");
  } catch {
    return false;
  }
};

export const openModalLayer = (): HTMLElement | null => {
  let layer: HTMLElement | null = null;
  let layerPath: number[] = [];
  try {
    for (const node of document.querySelectorAll(MODAL_SELECTOR)) {
      if (node.closest(GUIDE_OWN_SELECTOR) || !isElementVisible(node)) continue;
      const path = stackingPath(node);
      const depth = Math.max(path.length, layerPath.length);
      let order = 0;
      for (let index = 0; index < depth && order === 0; index += 1) order = (path[index] ?? 0) - (layerPath[index] ?? 0);
      const nativeOrder = Number(isNativeModal(node)) - Number(layer !== null && isNativeModal(layer));
      if (!layer || nativeOrder > 0 || (nativeOrder === 0 && order >= 0)) {
        layer = node;
        layerPath = path;
      }
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
  signal?: AbortSignal;
}

const DEFAULT_WAIT_TIMEOUT_MS = 12000;
export const DOM_POLL_INTERVAL_MS = 150;

export const WATCHED_ATTRIBUTES = ["class", "style", "disabled", "aria-disabled", "aria-modal", "aria-hidden", "aria-expanded", "aria-checked", "hidden", "inert", "open", "role"];

export const isSelfInflicted = (records: MutationRecord[]): boolean =>
  records.every((record) => {
    const node = record.target instanceof Element ? record.target : record.target.parentElement;
    return node?.closest(GUIDE_OWN_SELECTOR) != null;
  });

export const waitForElement = (
  selector: string,
  { timeoutMs = DEFAULT_WAIT_TIMEOUT_MS, root = document, signal }: WaitForElementOptions = {},
): Promise<HTMLElement | null> => {
  if (signal?.aborted) return Promise.resolve(null);
  const existing = queryVisible(selector, root);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    let pollId = 0;
    let timer = 0;
    const finish = (element: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      window.clearInterval(pollId);
      observer.disconnect();
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(element);
    };
    const abort = () => finish(null);
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
    timer = window.setTimeout(() => finish(queryVisible(selector, root)), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    check();
  });
};

let locationListenerCount = 0;
let restoreLocationEvents: () => void = () => undefined;
export const ensureLocationChangeEvents = (): (() => void) => {
  if (typeof window === "undefined" || !window.history) return () => undefined;
  if (locationListenerCount++ === 0) {
    const notify = () => window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    const push: History["pushState"] = (...args) => { originalPush.apply(window.history, args); notify(); };
    const replace: History["replaceState"] = (...args) => { originalReplace.apply(window.history, args); notify(); };
    window.history.pushState = push;
    window.history.replaceState = replace;
    window.addEventListener("popstate", notify);
    restoreLocationEvents = () => {
      if (window.history.pushState === push) window.history.pushState = originalPush;
      if (window.history.replaceState === replace) window.history.replaceState = originalReplace;
      window.removeEventListener("popstate", notify);
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locationListenerCount === 0) restoreLocationEvents();
  };
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
      const control = element.matches("input, select, textarea") ? element : element.querySelector("input, select, textarea");
      if ((control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) && !control.validity.valid) return false;
      const value = readControlValue(element);
      return value !== null && value.trim() !== "";
    }
    case "toggle": {
      const checked = element.getAttribute("aria-checked");
      const expanded = element.getAttribute("aria-expanded");
      if (checked !== null || expanded !== null) return (checked ?? expanded) === "true";
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        return element.checked;
      }
      const nested = element.querySelector("input[type='checkbox'], input[type='radio']");
      if (nested instanceof HTMLInputElement) return nested.checked;
      return false;
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

export const isControlUnavailable = (element: Element): boolean => {
  const control = element.closest("select, input, textarea, button, [role='switch'], [role='checkbox']") ?? controlOf(element);
  if (control.closest('[inert], [aria-disabled="true"]') || control.matches(":disabled")) return true;
  return (
    control instanceof HTMLSelectElement
    || control instanceof HTMLInputElement
    || control instanceof HTMLTextAreaElement
    || control instanceof HTMLButtonElement
  ) && control.disabled;
};

export type StepSatisfaction = "value";

export const isTaskStepSatisfied = (step: TaskGuideStep, element: Element): boolean => {
  if (isControlUnavailable(element)) return false;
  try {
    if (step.isSatisfied) return step.isSatisfied() && (!step.validate || step.validate(element));
    if (step.action === "navigate") return !!step.navigateTo && locationMatches(step.navigateTo);
    if (!isElementVisible(element) || isCoveredByModal(element)) return false;
    if (!VALUE_ACTIONS.has(step.action)) return false;
    return (step.validate ?? ((el: Element) => defaultValidate(step.action, el)))(element);
  } catch {
    return false;
  }
};

export const stepSatisfaction = (step: TaskGuideStep, element: Element): StepSatisfaction | null => {
  if (step.action === "complete") return null;
  return isTaskStepSatisfied(step, element) ? "value" : null;
};

export const attachTaskListener = (step: TaskGuideStep, onDone: () => void, targetElement = queryVisible(step.target)): (() => void) => {
  if (step.action === "complete") return () => undefined;

  const controller = new AbortController();
  const { signal } = controller;
  let fired = false;
  const reachableEvents = new WeakSet<Event>();
  const complete = (element: Element, event?: Event) => {
    if (fired || signal.aborted) return;
    if (event && (event.defaultPrevented || !reachableEvents.has(event))) return;
    let valid = false;
    try {
      if (step.isSatisfied) valid = step.isSatisfied();
      else if (step.action !== "submit") valid = defaultValidate(step.action, element);
      if (valid && step.validate) valid = step.validate(element);
    } catch {
      valid = false;
    }
    if (!valid) return;
    fired = true;
    controller.abort();
    onDone();
  };

  if (step.action === "navigate") {
    signal.addEventListener("abort", ensureLocationChangeEvents(), { once: true });
    if (step.navigateTo && locationMatches(step.navigateTo)) {
      queueMicrotask(() => complete(document.body));
      return () => controller.abort();
    }
    const onLocation = () => {
      if (step.navigateTo && locationMatches(step.navigateTo)) complete(document.body);
    };
    window.addEventListener(LOCATION_CHANGE_EVENT, onLocation, { signal });
    return () => controller.abort();
  }

  if (!targetElement) return () => controller.abort();
  const matchesTarget = (event: Event): boolean =>
    event.target instanceof Node && targetElement.contains(event.target);
  const listen = (type: string, handler: (event: Event) => void) => {
    document.addEventListener(type, (event) => {
      if (matchesTarget(event) && isElementVisible(targetElement) && !isCoveredByModal(targetElement) && !isControlUnavailable(event.target instanceof Element ? event.target : targetElement)) reachableEvents.add(event);
    }, { capture: true, signal });
    // Run after application handlers, so preventDefault and resulting state
    // are available. A click may legitimately replace or cover its own target.
    document.addEventListener(type, handler, { signal });
  };

  if (step.action === "select" || step.action === "input") {
    const onChange = (event: Event) => {
      if (!matchesTarget(event)) return;
      const source = event.target;
      const control = source instanceof HTMLSelectElement
        || source instanceof HTMLInputElement
        || source instanceof HTMLTextAreaElement
        ? source
        : targetElement;
      complete(control, event);
    };
    // Input events update validation/Next in the runner; they never dismiss
    // instructions while the user is still typing.
    listen("change", onChange);
    if (step.action === "input") listen("focusout", onChange);
    return () => controller.abort();
  }

  if (step.action === "submit") {
    const onSubmit = (event: Event) => {
      if (matchesTarget(event)) complete(targetElement, event);
    };
    // Dispatching submit is not proof of a successful operation. Persistent
    // actions are review-only; legacy submit tasks need an explicit result.
    listen("submit", onSubmit);
    return () => controller.abort();
  }

  const onClick = (event: Event) => {
    if (matchesTarget(event)) complete(targetElement, event);
  };
  listen("click", onClick);
  if (step.action === "toggle") {
    const onToggle = (event: Event) => {
      if (matchesTarget(event)) complete(targetElement, event);
    };
    listen("change", onToggle);
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
  targetElement?: HTMLElement;
}

export const toJoyrideSteps = (
  steps: TaskGuideStep[],
  completedIds: ReadonlySet<string>,
  mission: string,
  satisfiedIds: ReadonlyMap<string, StepSatisfaction> = new Map(),
  targets: ReadonlyMap<string, HTMLElement> = new Map(),
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
    targetElement: targets.get(step.id),
  };
  return {
    id: step.id,
    target: targets.get(step.id) ?? step.target,
    title: (index + 1) + ". " + step.title,
    content: copy,
    placement: joyridePlacement(step),
    data,
  } satisfies Step;
});
