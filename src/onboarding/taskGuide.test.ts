import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionVerb,
  attachTaskListener,
  clearTaskTourDone,
  defaultTaskHint,
  defaultValidate,
  isCoveredByModal,
  isSelfInflicted,
  isTaskTourDone,
  locationMatches,
  markTaskTourDone,
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
  vi.restoreAllMocks();
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
      + `<div role="alertdialog" aria-modal="true">tooltip</div>`;
    expect(isCoveredByModal(document.querySelector("#page")!)).toBe(false);
    expect(queryVisible("#page")?.id).toBe("page");
  });

  it("waits out an open modal instead of timing out on the page behind it", async () => {
    document.body.innerHTML = `<button id="page">x</button>`
      + `<div id="layer" role="dialog" aria-modal="true">busy</div>`;
    const wait = waitForElement("#page", { timeoutMs: 30 });
    await new Promise((resolve) => setTimeout(resolve, 90));
    document.querySelector("#layer")!.remove();
    await expect(wait).resolves.not.toBeNull();
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

  it("reports a disabled control as unavailable whatever the action", () => {
    document.body.innerHTML = `<button id="b" disabled>Apply</button>`;
    const element = document.querySelector("#b")!;
    expect(stepSatisfaction(makeStep({ action: "click", target: "#b" }), element)).toBe("unavailable");
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

  it("completes a submit step when its exact form is submitted", () => {
    document.body.innerHTML = `<form id="add-form"><input type="text" value="BSIT 1A" /><button type="submit">Save</button></form>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep({ action: "submit", target: "#add-form" }), onDone);
    document.querySelector("#add-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(onDone).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("ignores a submit-button click on a form target until the form submits", () => {
    document.body.innerHTML = `<form id="add-form"><input type="text" /><button type="submit">Save</button></form>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep({ action: "submit", target: "#add-form" }), onDone);
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

  it("still accepts a submit-button click for non-form targets", () => {
    document.body.innerHTML = `<div id="dialog-footer"><button type="submit">Save</button></div>`;
    const onDone = vi.fn();
    const cleanup = attachTaskListener(makeStep({ action: "submit", target: "#dialog-footer" }), onDone);
    document.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDone).toHaveBeenCalledTimes(1);
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
});

describe("locationMatches", () => {
  it("matches exact and role-prefixed paths", () => {
    window.history.replaceState(null, "", "/secretary/curriculum");
    expect(locationMatches("/secretary/curriculum")).toBe(true);
    expect(locationMatches("/curriculum")).toBe(true);
    expect(locationMatches("/schedules/approval")).toBe(false);
  });
});

describe("completion storage", () => {
  it("persists completion per tour until cleared for restart", () => {
    expect(isTaskTourDone("demo")).toBe(false);
    markTaskTourDone("demo");
    expect(isTaskTourDone("demo")).toBe(true);
    clearTaskTourDone("demo");
    expect(isTaskTourDone("demo")).toBe(false);
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
});
