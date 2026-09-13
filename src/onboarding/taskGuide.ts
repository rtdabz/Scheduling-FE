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
   * How long to wait for this step's target before giving up. Raise it for
   * steps that follow genuinely slow work (a queued generation run). The
   * clock is paused only while the target exists behind a dialog, so a
   * selector that matches nothing still times out on schedule.
   */
  waitTimeoutMs?: number;
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
  /**
   * Which side of the target the tooltip sits on. Use `"center"` when the
   * target is a whole panel rather than one control: an edge-anchored
   * tooltip on an element that fills the viewport has nowhere to go and ends
   * up with its header clipped off-screen, while a centered one stays
   * readable and the spotlight still marks the panel.
   */
  side?: "top" | "right" | "bottom" | "left" | "center";
  align?: "start" | "center" | "end";
}

/**
 * How a mission ended.
 *
 * - `completed`  — the user performed every step.
 * - `dismissed`  — the user deliberately exited (Exit tutorial / close).
 * - `aborted`    — the tour gave up on its own (a target never mounted, a
 *                  dialog closed, another tour took over).
 *
 * Only the first two are user decisions, so only they may be persisted as
 * "done". Persisting an abort would silently retire a guide the user never
 * actually saw.
 */
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

/**
 * Modal layers the app puts over the page. Joyride's own tooltip also sets
 * `aria-modal` (with role="alertdialog"), and the guide hosts live in their
 * own detached roots, so both are excluded or the tour would treat itself as
 * the thing blocking the page.
 */
const MODAL_SELECTOR = '[aria-modal="true"]:not([role="alertdialog"]), dialog[open]';

/**
 * The topmost open modal layer, or null when nothing covers the page. Last
 * in document order approximates topmost: React appends later-opened
 * dialogs after earlier ones.
 */
export const openModalLayer = (): HTMLElement | null => {
  let layer: HTMLElement | null = null;
  try {
    for (const node of document.querySelectorAll(MODAL_SELECTOR)) {
      if (node.closest("[data-wicars-guide-root]")) continue;
      if (isElementVisible(node)) layer = node;
    }
  } catch {
    // Old engines without :not() support simply see no modal layer.
  }
  return layer;
};

/**
 * True when an open modal covers `element`. A spotlight on a covered target
 * points at something the user cannot see or click, so the runner has to
 * wait for the dialog to close (or for a tour inside the dialog to take
 * over) instead of narrating the page underneath it.
 */
export const isCoveredByModal = (element: Element): boolean => {
  const layer = openModalLayer();
  return layer !== null && !layer.contains(element);
};

const coveredBy = (layer: HTMLElement | null, element: Element): boolean =>
  layer !== null && !layer.contains(element);

/**
 * True when the selector matches something that exists and is only out of
 * reach because a dialog sits over it.
 *
 * The distinction matters for the wait deadline: a target the user cannot
 * get to *yet* deserves patience, but a selector that matches nothing at all
 * is missing for its own reasons — an already-applied button that stays
 * disabled, a panel that never mounts — and must be allowed to time out even
 * though a dialog happens to be open. Treating every open dialog as a reason
 * to wait forever strands the mission on the first such step.
 */
export const isSelectorCovered = (selector: string, root: ParentNode = document): boolean => {
  try {
    const layer = openModalLayer();
    if (!layer) return false;
    for (const node of root.querySelectorAll(selector)) {
      if (isElementVisible(node) && coveredBy(layer, node)) return true;
    }
  } catch {
    // Invalid selectors match nothing, so nothing is covered.
  }
  return false;
};

/** First visible, uncovered match for a selector, or null. */
export const queryVisible = (selector: string, root: ParentNode = document): HTMLElement | null => {
  try {
    const nodes = root.querySelectorAll(selector);
    if (nodes.length === 0) return null;
    // Resolve the blocking layer once per lookup rather than per candidate:
    // this runs on a timer while a tour is open, and each call walks the
    // document for open dialogs.
    const layer = openModalLayer();
    for (const node of nodes) {
      if (isElementVisible(node) && !coveredBy(layer, node)) return node;
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
 * How often DOM watchers re-check the page.
 *
 * Every check costs a `getComputedStyle` plus `getClientRects`, which forces
 * layout. Running that per animation frame was enough to make the whole app
 * feel sluggish while a tour was open, and nothing the tours watch for — a
 * panel mounting, a button enabling, a dialog opening — needs frame-rate
 * resolution. A DOM mutation still triggers a check immediately; this only
 * caps how often it can repeat.
 */
export const DOM_POLL_INTERVAL_MS = 150;

/**
 * Attributes worth re-checking on. Deliberately excludes `style`: Joyride
 * rewrites its tooltip's inline style every frame while positioning, and
 * watching that turns any document-wide observer into a per-frame loop.
 */
export const WATCHED_ATTRIBUTES = ["class", "disabled", "aria-disabled", "aria-modal", "hidden", "open", "role"];

/**
 * Anything the tour itself renders: its own hosts, and Joyride's portal,
 * overlay, spotlight and floating tooltip.
 */
const GUIDE_OWN_SELECTOR = '[data-wicars-guide-root], #react-joyride-portal, [class*="react-joyride__"]';

/**
 * True when every mutation came from the tour's own DOM. Reacting to those
 * would mean re-measuring the page in response to the tour's own paint — a
 * loop that never settles for as long as the tour is open.
 */
export const isSelfInflicted = (records: MutationRecord[]): boolean =>
  records.every((record) => {
    const node = record.target instanceof Element ? record.target : record.target.parentElement;
    return node?.closest(GUIDE_OWN_SELECTOR) != null;
  });

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
    let pollId = 0;
    const finish = (element: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      window.clearInterval(pollId);
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(element);
    };
    // The observer catches the target mounting; the interval is the backstop
    // for changes it cannot see (a parent un-hiding, a dialog closing above
    // the target). A frame-by-frame poll here made long waits — a queued
    // generation run can hold one open for minutes — cost real frame budget.
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
    // A target that exists but sits behind a dialog is not missing, only out
    // of reach while the user is busy in that dialog: giving up on it would
    // abandon the mission for as long as the dialog stays open. A selector
    // that matches nothing still times out normally, dialog or not.
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

/** Actions whose step can already be satisfied before the user touches it. */
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

/**
 * Why a step needs no action from the user, or null when it genuinely does.
 *
 * Two dead ends this rescues, both of which otherwise strand the tour with a
 * task that can never be performed and no Next button to escape with:
 *
 * - `"value"` — the control already holds the value the step asks for. A
 *   select with a single option, or a field the page pre-filled, fires no
 *   change event no matter what the user does.
 * - `"unavailable"` — the control is disabled here, so it cannot be clicked,
 *   typed into, or changed at all.
 *
 * The step still listens: acting on it anyway advances as usual. This only
 * decides whether the tooltip offers a way forward.
 */
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
    // Fallback for targets that are not real <form>s (a dialog footer, a
    // toolbar). A form target must wait for its own submit event: counting
    // the button click instead would mark the task done even when the
    // handler rejects the values and nothing was ever saved.
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
  // Centered tooltips are not anchored to an edge, so alignment is moot.
  if (side === "center") return "center";
  if (!step.align || step.align === "center") return side;
  return (side + "-" + step.align) as Step["placement"];
};

export interface JoyrideTaskData {
  stepId: string;
  action: TourAction;
  taskHint: string;
  completed: boolean;
  /** Set when the step needs no action from the user; see {@link stepSatisfaction}. */
  satisfied: StepSatisfaction | null;
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
