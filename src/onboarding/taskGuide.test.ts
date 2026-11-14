import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TooltipRenderProps } from "react-joyride";
import TaskTooltip from "./TaskTooltip";
import { beginTourDiagnostics, endTourDiagnostics, recordTourStep } from "./tourDiagnostics";
import {
  actionVerb,
  attachTaskListener,
  defaultTaskHint,
  defaultValidate,
  isCoveredByModal,
  isSelfInflicted,
  isTaskStepSatisfied,
  locationMatches,
  openModalLayer,
  queryVisible,
  stepRequiresAction,
  stepSatisfaction,
  toJoyrideSteps,
  waitForElement,
  type TaskGuideStep,
} from "./taskGuide";

/**
 * jsdom has no layout engine, so getClientRects() is always empty. The guide
 * treats "has boxes" as visible, so tests stub rects while keeping the real
 * display/visibility checks from getComputedStyle.
 */
const stubRects = () => {
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue(
    [{ x: 0, y: 0, width: 10, height: 10, top: 0, left: 0, bottom: 10, right: 10 }] as unknown as DOMRectList,
  );
};

const makeStep = (overrides: Partial<TaskGuideStep> = {}): TaskGuideStep => ({
  id: "step-1",
  target: "#tour-target",
  action: "click",
  title: "Do the thing",
  text: "Do it now.",
  ...overrides,
});

beforeEach(() => {
  stubRects();
  document.body.innerHTML = "";
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("step metadata", () => {
  it("requires an action for every type except complete", () => {
    for (const action of ["click", "select", "input", "submit", "toggle", "navigate"] as const) {
      expect(stepRequiresAction(makeStep({ action }))).toBe(true);
    }
    expect(stepRequiresAction(makeStep({ action: "complete" }))).toBe(false);
  });

  it("provides a hint for every action type", () => {
    for (const action of ["click", "select", "input", "submit", "toggle", "navigate", "complete"] as const) {
      expect(defaultTaskHint(makeStep({ action, taskHint: undefined })).length).toBeGreaterThan(0);
    }
  });

  it("labels every action with a short game-style verb", () => {
    expect([
      actionVerb("click"),
      actionVerb("select"),
      actionVerb("input"),
      actionVerb("submit"),
      actionVerb("toggle"),
      actionVerb("navigate"),
      actionVerb("complete"),
    ]).toEqual(["Click", "Select", "Type", "Submit", "Toggle", "Open", "Review"]);
  });
});

describe("defaultValidate", () => {
  it("accepts a select with a chosen value and rejects an empty one", () => {
    document.body.innerHTML = `<select id="s"><option value="">Pick</option><option value="1">One</option></select>`;
    const select = document.querySelector("#s") as HTMLSelectElement;
    expect(defaultValidate("select", select)).toBe(false);
    select.value = "1";
    expect(defaultValidate("select", select)).toBe(true);
  });

  it("accepts non-empty input and rejects blank input", () => {
    document.body.innerHTML = `<input id="i" value="  " />`;
    const input = document.querySelector("#i") as HTMLInputElement;
    expect(defaultValidate("input", input)).toBe(false);
    input.value = "BSCS";
    expect(defaultValidate("input", input)).toBe(true);
  });

  it("does not accept a nonempty value that violates the native field constraint", () => {
    document.body.innerHTML = `<input id="email" type="email" value="unfinished" />`;
    const input = document.querySelector("input")!;
    expect(defaultValidate("input", input)).toBe(false);
    input.value = "office@example.test";
    expect(defaultValidate("input", input)).toBe(true);
  });

  it("requires a checkbox toggle to be checked", () => {
    document.body.innerHTML = `<input id="t" type="checkbox" />`;
    const toggle = document.querySelector("#t") as HTMLInputElement;
    expect(defaultValidate("toggle", toggle)).toBe(false);
    toggle.checked = true;
    expect(defaultValidate("toggle", toggle)).toBe(true);
  });
});

describe("queryVisible / waitForElement", () => {
  it("finds visible elements and skips hidden ones", () => {
    document.body.innerHTML = `<button id="a">x</button><button id="b" style="display:none">y</button>`;
    expect(queryVisible("#a")?.id).toBe("a");
    expect(queryVisible("#b")).toBeNull();
    expect(queryVisible("#missing")).toBeNull();
  });

  it("treats a target behind an open modal as unreachable", () => {
    document.body.innerHTML = `<button id="page">x</button>`
      + `<div role="dialog" aria-modal="true"><button id="in-dialog">y</button></div>`;
    // Spotlighting the page behind a dialog points at something the user can
    // neither see nor click, so the step has to wait the dialog out.
    expect(isCoveredByModal(document.querySelector("#page")!)).toBe(true);
    expect(queryVisible("#page")).toBeNull();
    expect(queryVisible("#in-dialog")?.id).toBe("in-dialog");
  });

  it("ignores the tour's own tooltip when looking for a blocking modal", () => {
    document.body.innerHTML = `<button id="page">x</button>`
      + `<div id="react-joyride-portal"><div role="alertdialog" aria-modal="true">tooltip</div></div>`;
    expect(isCoveredByModal(document.querySelector("#page")!)).toBe(false);
    expect(queryVisible("#page")?.id).toBe("page");
  });

  it("bounds its wait even when a modal continues covering the target", async () => {
    document.body.innerHTML = `<button id="page">x</button>`
      + `<div id="layer" role="dialog" aria-modal="true">busy</div>`;
    const wait = waitForElement("#page", { timeoutMs: 30 });
    await expect(wait).resolves.toBeNull();
  });

  it("still times out on a selector that matches nothing while a modal is open", async () => {
    // The wizard itself is a modal. A step targeting a control that is not
    // there (an already-applied button that stays disabled) must be allowed
    // to give up, or skipIfMissing never runs and the mission hangs.
    document.body.innerHTML = `<div role="dialog" aria-modal="true">`
      + `<button id="apply" disabled>Apply</button></div>`;
    await expect(waitForElement("#apply:not([disabled])", { timeoutMs: 30 })).resolves.toBeNull();
  });

  it("resolves immediately when the element already exists", async () => {
    document.body.innerHTML = `<div id="early"></div>`;
    await expect(waitForElement("#early", { timeoutMs: 50 })).resolves.not.toBeNull();
  });

  it("resolves when React mounts the element after the wait starts", async () => {
    const pending = waitForElement("#late", { timeoutMs: 1000 });
    window.setTimeout(() => {
      document.body.innerHTML = `<div id="late"></div>`;
    }, 20);
    await expect(pending.then((el) => el?.id)).resolves.toBe("late");
  });

  it("resolves null on timeout instead of hanging", async () => {
    await expect(waitForElement("#never", { timeoutMs: 30 })).resolves.toBeNull();
  });

  it("treats real confirmation and session alertdialogs as blocking layers", () => {
    document.body.innerHTML = `<button id="page">Page</button><div role="alertdialog" aria-modal="true"><button id="confirm">Confirm</button></div>`;
    expect(queryVisible("#page")).toBeNull();
    expect(queryVisible("#confirm")?.id).toBe("confirm");
  });

  it("uses the top stacking layer and excludes hidden/inert dialogs", () => {
    document.body.innerHTML = `<div style="position:fixed;z-index:9999"><section id="top" role="dialog" aria-modal="true"><button id="active">Active</button></section></div>`
      + `<div style="position:fixed;z-index:50"><section role="alertdialog" aria-modal="true"><button id="behind">Behind</button></section></div>`
      + `<section inert role="dialog" aria-modal="true" style="position:fixed;z-index:20000"></section>`
      + `<section aria-hidden="true" role="dialog" aria-modal="true" style="position:fixed;z-index:30000"></section>`;
    expect(openModalLayer()?.id).toBe("top");
    expect(queryVisible("#active")?.id).toBe("active");
    expect(queryVisible("#behind")).toBeNull();
  });

  it("ignores targets hidden or inert through an ancestor", () => {
    document.body.innerHTML = `<div style="display:none"><button id="hidden">Hidden</button></div><div inert><button id="inert">Inert</button></div><div aria-hidden="true"><button id="aria-hidden">Hidden</button></div>`;
    for (const id of ["hidden", "inert", "aria-hidden"]) expect(queryVisible("#" + id)).toBeNull();
  });

  it("cancels pending waits and disconnects observers and timers", async () => {
    vi.useFakeTimers();
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const controller = new AbortController();
    const pending = waitForElement("#late", { timeoutMs: 12000, signal: controller.signal });
    expect(vi.getTimerCount()).toBe(2);
    controller.abort();
    await expect(pending).resolves.toBeNull();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    document.body.innerHTML = `<button id="late">Late</button>`;
    await Promise.resolve();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("never resolves an existing target for an already cancelled wait", async () => {
    document.body.innerHTML = `<button id="early">Early</button>`;
    const controller = new AbortController();
    controller.abort();
    await expect(waitForElement("#early", { signal: controller.signal })).resolves.toBeNull();
  });
});

describe("isSelfInflicted", () => {
  const recordFor = (element: Element) =>
    ({ target: element, type: "attributes" }) as unknown as MutationRecord;

  it("ignores mutations the tour caused itself", () => {
    // Joyride rewrites its own tooltip constantly while positioning. Watching
    // that would re-measure the page in response to the tour's own paint.
    document.body.innerHTML = `<div data-wicars-guide-root="rooms"><span id="host">h</span></div>`
      + `<div id="react-joyride-portal"><span id="portal">p</span></div>`
      + `<div class="react-joyride__tooltip"><span id="tip">t</span></div>`;
    expect(isSelfInflicted([
      recordFor(document.querySelector("#host")!),
      recordFor(document.querySelector("#portal")!),
      recordFor(document.querySelector("#tip")!),
    ])).toBe(true);
  });

  it("reacts when any mutation came from the page itself", () => {
    document.body.innerHTML = `<div data-wicars-guide-root="rooms"><span id="host">h</span></div>`
      + `<button id="page">x</button>`;
    expect(isSelfInflicted([
      recordFor(document.querySelector("#host")!),
      recordFor(document.querySelector("#page")!),
    ])).toBe(false);
  });
});

describe("stepSatisfaction", () => {
  it("reports a select that already holds the only value it can have", () => {
    // One curriculum in the list: no change event will ever fire, so the
    // tooltip has to offer Next instead of stranding the mission here.
    document.body.innerHTML = `<select id="s"><option value="1" selected>Only</option></select>`;
    const element = document.querySelector("#s")!;
    expect(stepSatisfaction(makeStep({ action: "select", target: "#s" }), element)).toBe("value");
  });

  it("still demands an action from a select left on its placeholder", () => {
    document.body.innerHTML = `<select id="s"><option value="" selected>Pick</option><option value="1">One</option></select>`;
    const element = document.querySelector("#s")!;
    expect(stepSatisfaction(makeStep({ action: "select", target: "#s" }), element)).toBeNull();
  });

  it("never satisfies a disabled control, including an otherwise valid result", () => {
    document.body.innerHTML = `<button id="b" disabled>Apply</button>`;
    const element = document.querySelector("#b")!;
    expect(stepSatisfaction(makeStep({ action: "click", target: "#b", isSatisfied: () => true }), element)).toBeNull();
  });

  it("never pre-satisfies a plain click on an enabled control", () => {
    document.body.innerHTML = `<button id="b">Apply</button>`;
    const element = document.querySelector("#b")!;
    expect(stepSatisfaction(makeStep({ action: "click", target: "#b" }), element)).toBeNull();
  });

  it("carries satisfaction to the tooltip so it can offer a way forward", () => {
    const steps: TaskGuideStep[] = [makeStep({ id: "pick", action: "select" })];
    const [joyrideStep] = toJoyrideSteps(steps, new Set(), "Mission", new Map([["pick", "value" as const]]));
    expect((joyrideStep.data as { satisfied?: string }).satisfied).toBe("value");
  });

  it("checks the declared result and fails safely if validation throws", () => {
    document.body.innerHTML = `<button id="b" aria-expanded="false">Open</button>`;
    const element = document.querySelector("#b")!;
    const step = makeStep({ target: "#b", isSatisfied: () => element.getAttribute("aria-expanded") === "true" });
    expect(isTaskStepSatisfied(step, element)).toBe(false);
    element.setAttribute("aria-expanded", "true");
    expect(isTaskStepSatisfied(step, element)).toBe(true);
    expect(isTaskStepSatisfied({ ...step, isSatisfied: () => { throw new Error("Unavailable state"); } }, element)).toBe(false);
    expect(isTaskStepSatisfied(makeStep({ target: "#b" }), element)).toBe(false);
  });

  it("recognizes an observed result even when selection removes its original control", () => {
    document.body.innerHTML = `<button id="pick">Section A</button>`;
    const option = document.querySelector("button")!;
    const step = makeStep({ target: "#pick", isSatisfied: () => !!document.querySelector("#selected-section") });
    option.remove();
    document.body.innerHTML = `<span id="selected-section">Section A</span>`;
    expect(isTaskStepSatisfied(step, option)).toBe(true);
    expect(isTaskStepSatisfied(makeStep({ target: "#pick" }), option)).toBe(false);
  });
});

describe("attachTaskListener", () => {
  it("completes a click step only when the target is clicked", () => {
    document.body.innerHTML = `<button id="tour-target">Go</button><button id="other">Nope</button>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep(), onDone);

    document.querySelector("#other")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDone).not.toHaveBeenCalled();

    document.querySelector("#tour-target")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDone).toHaveBeenCalledTimes(1);

    // Duplicate clicks after completion never fire again (no double-advance).
    document.querySelector("#tour-target")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("validates select steps so empty choices do not advance the tour", () => {
    document.body.innerHTML = `<select id="tour-target"><option value="">Pick</option><option value="1">One</option></select>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep({ action: "select" }), onDone);
    const select = document.querySelector("#tour-target") as HTMLSelectElement;

    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onDone).not.toHaveBeenCalled();

    select.value = "1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("validates the control that fired inside multi-control filter bars", () => {
    // Filter bars hold a search box plus selects. Changing a select must
    // validate that select — not the empty search input next to it.
    document.body.innerHTML = `<div id="tour-target"><input type="text" value="" /><select><option value="">All</option><option value="lecture">Lecture</option></select></div>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep({ action: "select" }), onDone);
    const select = document.querySelector("#tour-target select") as HTMLSelectElement;

    select.value = "lecture";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("completes a toggle step when its exact checkbox is ticked", () => {
    document.body.innerHTML = `<div id="list"><input type="checkbox" aria-label="Select A" /><input type="checkbox" disabled aria-label="Select B" /></div>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(
      makeStep({ action: "toggle", target: '#list input[type="checkbox"]:not([disabled])' }),
      onDone,
    );
    const box = document.querySelector('#list input[aria-label="Select A"]') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not mistake a form submit event for successful persistence", () => {
    document.body.innerHTML = `<form id="add-form"><input type="text" value="BSIT 1A" /><button type="submit">Save</button></form>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep({ action: "submit", target: "#add-form" }), onDone);
    document.querySelector("#add-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onDone).not.toHaveBeenCalled();
    cleanup();
  });

  it("ignores a submit-button click on a form target until the form submits", () => {
    document.body.innerHTML = `<form id="add-form"><input type="text" /><button type="submit">Save</button></form>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep({ action: "submit", target: "#add-form", isSatisfied: () => true }), onDone);
    // A click the UI cancels (guard clause, blocked while saving) never
    // reaches submit, so the task is not done.
    const button = document.querySelector("button")!;
    button.addEventListener("click", (event) => event.preventDefault());
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(onDone).not.toHaveBeenCalled();
    document.querySelector("#add-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not accept a submit-button click as proof of success", () => {
    document.body.innerHTML = `<div id="dialog-footer"><button type="submit">Save</button></div>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep({ action: "submit", target: "#dialog-footer" }), onDone);
    document.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDone).not.toHaveBeenCalled();
    cleanup();
  });

  it("removes every listener on cleanup", () => {
    document.body.innerHTML = `<button id="tour-target">Go</button>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep(), onDone);
    cleanup();
    document.querySelector("#tour-target")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDone).not.toHaveBeenCalled();
  });

  it("attaches nothing for complete steps", () => {
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep({ action: "complete" }), onDone);
    expect(typeof cleanup).toBe("function");
    cleanup();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("waits for committed input rather than the first typed character", () => {
    document.body.innerHTML = `<input id="tour-target" />`;
    const input = document.querySelector("input")!;
    const onDone = vi.fn();
    const detach = attachTaskListener(makeStep({ action: "input" }), onDone);
    fireEvent.input(input, { target: { value: "B" } });
    expect(onDone).not.toHaveBeenCalled();
    expect(isTaskStepSatisfied(makeStep({ action: "input" }), input)).toBe(true);
    fireEvent.input(input, { target: { value: "BSIT 1A" } });
    fireEvent.focusOut(input);
    expect(onDone).toHaveBeenCalledTimes(1);
    detach();
  });

  it("binds the exact visible target instead of another matching control", () => {
    document.body.innerHTML = `<button class="target" hidden>Hidden</button><button class="target" id="chosen">Chosen</button><button class="target" id="other">Other</button>`;
    const chosen = document.querySelector<HTMLElement>("#chosen")!;
    const onDone = vi.fn();
    const detach = attachTaskListener(makeStep({ target: ".target" }), onDone, chosen);
    fireEvent.click(document.querySelector("#other")!);
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(chosen);
    expect(onDone).toHaveBeenCalledTimes(1);
    detach();
  });

  it("ignores cancelled actions and permits their verified result after a modal opens", () => {
    document.body.innerHTML = `<button id="tour-target">Open</button>`;
    const button = document.querySelector("button")!;
    const onDone = vi.fn();
    const detach = attachTaskListener(makeStep({ isSatisfied: () => !!document.querySelector("[role=dialog]") }), onDone);
    button.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(button);
    expect(onDone).not.toHaveBeenCalled();
    button.addEventListener("click", () => document.body.insertAdjacentHTML("beforeend", `<section role="dialog" aria-modal="true">Opened</section>`));
    fireEvent.click(button);
    expect(onDone).toHaveBeenCalledTimes(1);
    detach();
  });

  it("releases navigation hooks after completion and cancellation", () => {
    window.history.replaceState(null, "", "/secretary");
    const originalPush = window.history.pushState;
    const onDone = vi.fn();
    const detach = attachTaskListener(makeStep({ action: "navigate", navigateTo: "/curriculum" }), onDone);
    window.history.pushState(null, "", "/secretary/curriculum");
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(window.history.pushState).toBe(originalPush);
    detach();
    const cancel = attachTaskListener(makeStep({ action: "navigate", navigateTo: "/rooms" }), onDone);
    cancel();
    expect(window.history.pushState).toBe(originalPush);
    window.history.pushState(null, "", "/secretary/rooms");
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("locationMatches", () => {
  it("matches exact and role-prefixed paths", () => {
    window.history.replaceState(null, "", "/secretary/curriculum");
    expect(locationMatches("/secretary/curriculum")).toBe(true);
    expect(locationMatches("/curriculum")).toBe(true);
    expect(locationMatches("/schedules/approval")).toBe(false);
  });
});

describe("toJoyrideSteps", () => {
  it("carries targets, order, and completion state to the tooltip", () => {
    const steps = [makeStep({ id: "a" }), makeStep({ id: "b", target: "#other" })];
    const joyrideSteps = toJoyrideSteps(steps, new Set(["a"]), "Mission");
    expect(joyrideSteps).toHaveLength(2);
    expect(joyrideSteps[0].target).toBe("#tour-target");
    expect((joyrideSteps[0].data as { stepId: string }).stepId).toBe("a");
    expect((joyrideSteps[0].data as { completed: boolean }).completed).toBe(true);
    expect((joyrideSteps[1].data as { completed: boolean }).completed).toBe(false);
  });

  it("uses the same resolved element for the spotlight and tooltip control link", () => {
    document.body.innerHTML = `<button class="target" hidden>Hidden</button><button id="chosen" class="target">Visible</button>`;
    const target = document.querySelector<HTMLElement>("#chosen")!;
    const [step] = toJoyrideSteps([makeStep({ target: ".target" })], new Set(), "Mission", new Map(), new Map([["step-1", target]]));
    expect(step.id).toBe("step-1");
    expect(step.target).toBe(target);
    expect((step.data as { targetElement?: HTMLElement }).targetElement).toBe(target);
  });
});

describe("TaskTooltip", () => {
  const tooltipProps = (overrides: Partial<TaskGuideStep> = {}, satisfied = false): TooltipRenderProps => {
    const target = document.querySelector<HTMLElement>("#tour-target")!;
    const [step] = toJoyrideSteps([makeStep(overrides)], new Set(), "Mission", satisfied ? new Map([["step-1", "value" as const]]) : new Map(), new Map([["step-1", target]]));
    const buttonProps = { onClick: vi.fn(), role: "button", "aria-label": "Next", "data-action": "primary", title: "Next" };
    return {
      index: 0, size: 1, continuous: true, isLastStep: true, step,
      primaryProps: buttonProps, backProps: buttonProps,
      closeProps: { ...buttonProps, "aria-label": "Close" },
      skipProps: { ...buttonProps, "aria-label": "Exit tutorial" },
      tooltipProps: { role: "alertdialog", "aria-modal": true },
    } as unknown as TooltipRenderProps;
  };

  it("labels nonmodal guidance and keeps the highlighted control keyboard reachable", () => {
    document.body.innerHTML = `<input id="tour-target" aria-label="Section name" />`;
    render(createElement(TaskTooltip, tooltipProps({ action: "input" })));
    const guidance = screen.getByRole("region", { name: "1. Do the thing" });
    expect(guidance.hasAttribute("aria-modal")).toBe(false);
    expect(document.getElementById(guidance.getAttribute("aria-describedby")!)?.textContent).toContain("Do it now.");
    expect(guidance.matches(".react-joyride__tooltip[data-wicars-task-tooltip]")).toBe(true);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go to control" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Section name" }));
  });

  it("allows a valid committed value but never a disabled control", () => {
    document.body.innerHTML = `<input id="tour-target" value="BSIT 1A" />`;
    const view = render(createElement(TaskTooltip, tooltipProps({ action: "input" }, true)));
    expect(screen.getByRole("button", { name: "Next" })).toBeDefined();
    document.querySelector<HTMLInputElement>("#tour-target")!.disabled = true;
    view.rerender(createElement(TaskTooltip, tooltipProps({ action: "input" }, true)));
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("unavailable");
    expect(screen.getAllByRole("button", { name: "Exit tutorial" })).toHaveLength(2);
  });

  it("lets a review-only persistence explanation finish without invoking the target", () => {
    document.body.innerHTML = `<button id="tour-target" disabled>Save</button>`;
    const save = vi.fn();
    document.querySelector("#tour-target")!.addEventListener("click", save);
    const props = tooltipProps({ action: "complete" });
    render(createElement(TaskTooltip, props));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(props.primaryProps.onClick).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("tour diagnostics", () => {
  it("measures the custom tooltip and cancels all frame callbacks on termination", () => {
    localStorage.setItem("wicars_tour_debug", "1");
    const frames = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const table = vi.spyOn(console, "table").mockImplementation(() => undefined);
    document.body.innerHTML = `<button id="tour-target">Target</button><div data-wicars-task-tooltip>Help</div>`;
    const target = document.querySelector<HTMLElement>("#tour-target")!;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 10, 10));
    vi.spyOn(document.querySelector("[data-wicars-task-tooltip]")!, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 0, 10, 10));
    const flushFrame = () => {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(performance.now());
      }
    };
    beginTourDiagnostics("demo");
    recordTourStep("step-1", "#tour-target", 20, target);
    flushFrame();
    flushFrame();
    endTourDiagnostics("completed");
    const [timing] = table.mock.calls[0][0] as Array<{ coversTargetPct: number; resolvedTarget: string; tooltipRect: { x: number } }>;
    expect(timing.coversTargetPct).toBe(0);
    expect(timing.resolvedTarget).toBe("button");
    expect(timing.tooltipRect.x).toBe(20);
    expect(frames.size).toBe(0);
    beginTourDiagnostics("demo-again");
    recordTourStep("pending", "#tour-target", 0, target);
    endTourDiagnostics("dismissed");
    expect(frames.size).toBe(0);
    beginTourDiagnostics("old-owner");
    beginTourDiagnostics("new-owner");
    endTourDiagnostics("unmounted", "old-owner");
    expect(frames.size).toBe(1);
    endTourDiagnostics("dismissed", "new-owner");
    expect(frames.size).toBe(0);
  });
});
