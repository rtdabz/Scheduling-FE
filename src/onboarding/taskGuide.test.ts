import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionVerb,
  attachTaskListener,
  clearTaskTourDone,
  defaultTaskHint,
  defaultValidate,
  isTaskTourDone,
  locationMatches,
  markTaskTourDone,
  queryVisible,
  stepRequiresAction,
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
