import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventData, Props, TooltipRenderProps } from "react-joyride";
import { ACTIONS, EVENTS, STATUS } from "react-joyride";
import TaskGuideRunner from "./TaskGuideRunner";
import { useWorkflowGuide, type WorkflowGuideStep } from "../hooks/useWorkflowGuide";
import { announceJoyrideStart } from "./joyrideTour";
import { SESSION_ENDED_EVENT } from "../lib/sessionTimeout";
import type { TaskGuideStep } from "./taskGuide";

const bridge = vi.hoisted(() => ({ props: null as Props | null }));
vi.mock("react-joyride", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-joyride")>();
  return {
    ...original,
    Joyride: (props: Props) => {
      bridge.props = props;
      const index = props.stepIndex ?? 0;
      const step = props.steps?.[index];
      const Tooltip = props.tooltipComponent;
      if (!props.run || !step || !Tooltip) return null;
      const button = { "aria-label": "control", "data-action": "primary", role: "button", title: "control", onClick: vi.fn() };
      return <Tooltip index={index} size={props.steps?.length ?? 0} step={step as TooltipRenderProps["step"]}
        continuous isLastStep={index === (props.steps?.length ?? 0) - 1}
        controls={{} as TooltipRenderProps["controls"]}
        backProps={button} closeProps={button} primaryProps={button} skipProps={button}
        tooltipProps={{ "aria-modal": true, role: "alertdialog" }} />;
    },
  };
});

const makeStep = (id: string, overrides: Partial<TaskGuideStep> = {}): TaskGuideStep => ({
  id, target: "#" + id, action: "complete", title: id, text: "Review " + id, ...overrides,
});
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{ width: 100, height: 30 }] as unknown as DOMRectList);
  document.body.innerHTML = '<button id="one">One</button><button id="two">Two</button><button id="three">Three</button>';
  localStorage.clear();
  sessionStorage.clear();
  bridge.props = null;
});
afterEach(async () => {
  cleanup();
  await act(async () => { await Promise.resolve(); });
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("guide transition ownership", () => {
  it("ignores real-library STOP/UPDATE callbacks without completing the action", async () => {
    const finish = vi.fn();
    render(<TaskGuideRunner tourId="stop" mission="Mission" steps={[makeStep("one", { action: "click" }), makeStep("two")]} onFinish={finish} />);
    await flush();
    act(() => {
      for (const action of [ACTIONS.STOP, ACTIONS.UPDATE]) bridge.props?.onEvent?.({ type: EVENTS.STEP_AFTER, action, index: 0, status: STATUS.PAUSED } as EventData, {} as TooltipRenderProps["controls"]);
    });
    await flush(1000);
    expect(bridge.props?.stepIndex).toBe(0);
    expect(finish).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Next/ })).toBeNull();
  });

  it("finishes only through explicit review navigation", async () => {
    const finish = vi.fn();
    render(<TaskGuideRunner tourId="review" mission="Mission" steps={[makeStep("one"), makeStep("two")]} onFinish={finish} />);
    await flush();
    // The tooltip button props are replaced by the runner, not Joyride navigation.
    fireEvent.click(screen.getByText("Next (1 of 2)"));
    await flush();
    expect(bridge.props?.stepIndex).toBe(1);
    fireEvent.click(screen.getByText("Finish"));
    await flush();
    expect(finish).toHaveBeenCalledExactlyOnceWith("completed");
  });

  it("Escape dismisses without also closing the underlying modal", async () => {
    document.body.innerHTML = '<section role="dialog" aria-modal="true"><button id="one">One</button></section>';
    const closeModal = vi.fn();
    document.addEventListener("keydown", closeModal);
    const finish = vi.fn();
    render(<TaskGuideRunner tourId="escape" mission="Mission" steps={[makeStep("one", { action: "click" })]} onFinish={finish} />);
    await flush();
    fireEvent.keyDown(document.querySelector("#one")!, { key: "Escape" });
    expect(finish).toHaveBeenCalledExactlyOnceWith("dismissed");
    expect(closeModal).not.toHaveBeenCalled();
    document.removeEventListener("keydown", closeModal);
  });

  it("Back cancels a pending action advance", async () => {
    render(<TaskGuideRunner tourId="back" mission="Mission" steps={[makeStep("one"), makeStep("two", { action: "click" }), makeStep("three")]} onFinish={vi.fn()} />);
    await flush();
    fireEvent.click(screen.getByText("Next (1 of 3)"));
    await flush();
    fireEvent.click(document.querySelector("#two")!);
    await flush();
    fireEvent.click(screen.getByText("Back"));
    await flush(1000);
    expect(bridge.props?.stepIndex).toBe(0);
  });

  it("checks the actual optional child even when its prerequisite exists", async () => {
    render(<TaskGuideRunner tourId="optional" mission="Mission" steps={[makeStep("missing", { waitFor: "#one", skipIfMissing: true, waitTimeoutMs: 20 }), makeStep("two")]} onFinish={vi.fn()} />);
    await flush(30);
    expect(bridge.props?.stepIndex).toBe(1);
    expect(bridge.props?.steps?.[1].target).toBe(document.querySelector("#two"));
  });

  it("required target absence provides recovery and never completes", async () => {
    const finish = vi.fn();
    const retry = vi.fn();
    render(<TaskGuideRunner tourId="missing" mission="Mission" steps={[makeStep("missing", { waitTimeoutMs: 20 })]} onFinish={finish} onRestart={retry} />);
    await flush(30);
    expect(screen.getByRole("status").textContent).toContain("not available");
    fireEvent.click(screen.getByText("Retry"));
    expect(retry).toHaveBeenCalledOnce();
    expect(finish).not.toHaveBeenCalled();
  });

  it("keeps blocked recovery connected when its modal closes and another layer opens", async () => {
    document.body.innerHTML = '<section id="first-modal" role="dialog" aria-modal="true"><button>Existing form</button></section>';
    const initialModal = document.querySelector("#first-modal")!;
    render(<TaskGuideRunner tourId="recovery-layers" mission="Mission" steps={[makeStep("missing", { waitTimeoutMs: 20 })]} onFinish={vi.fn()} />);
    await flush(30);
    const recovery = screen.getByRole("region", { name: "Mission help" });
    expect(initialModal.contains(recovery)).toBe(true);
    act(() => initialModal.remove());
    await flush(350);
    expect(document.body.contains(recovery)).toBe(true);
    expect(recovery.closest("[data-wicars-guide-portal]")?.parentElement).toBe(document.body);
    act(() => document.body.insertAdjacentHTML("beforeend", '<section id="next-modal" role="alertdialog" aria-modal="true"><button>Confirmation</button></section>'));
    await flush(350);
    expect(document.querySelector("#next-modal")?.contains(recovery)).toBe(true);
    const exit = screen.getByRole("button", { name: "Exit help" });
    exit.focus();
    expect(document.activeElement).toBe(exit);
  });

  it("cancels every pending wait when unmounted", async () => {
    const finish = vi.fn();
    const { unmount } = render(<TaskGuideRunner tourId="unmount" mission="Mission" steps={[makeStep("missing")]} onFinish={finish} />);
    await flush();
    unmount();
    document.body.insertAdjacentHTML("beforeend", '<button id="missing">Late</button>');
    await flush(15000);
    expect(finish).not.toHaveBeenCalled();
    expect(document.querySelector("[data-wicars-guide-portal]")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the resolved visible target instead of a hidden first duplicate", async () => {
    document.body.innerHTML = '<button class="duplicate" hidden>Hidden</button><button class="duplicate">Visible</button>';
    render(<TaskGuideRunner tourId="duplicate" mission="Mission" steps={[makeStep("one", { target: ".duplicate" })]} onFinish={vi.fn()} />);
    await flush();
    expect(bridge.props?.steps?.[0].target).toBe(document.querySelectorAll(".duplicate")[1]);
  });

  it("completes a result predicate after the clicked listbox disappears", async () => {
    document.body.innerHTML = '<div id="picker"><button>Select section</button></div><div id="result"></div><button id="two">Two</button>';
    const picker = document.querySelector("#picker")!;
    picker.querySelector("button")!.addEventListener("click", () => {
      picker.remove();
      document.querySelector("#result")!.setAttribute("data-selected", "yes");
    });
    render(<TaskGuideRunner tourId="result" mission="Mission" steps={[makeStep("picker", { action: "click", isSatisfied: () => document.querySelector("#result")?.getAttribute("data-selected") === "yes" }), makeStep("two")]} onFinish={vi.fn()} />);
    await flush();
    fireEvent.click(picker.querySelector("button")!);
    await flush(350);
    expect(bridge.props?.stepIndex).toBe(1);
  });

  it("handles a completed click again after Back and returning from its dialog", async () => {
    document.body.innerHTML = '<button id="one">Open details</button>';
    const finish = vi.fn();
    const opener = document.querySelector("#one")!;
    opener.addEventListener("click", () => {
      document.body.insertAdjacentHTML("beforeend", '<section id="details" role="dialog" aria-modal="true"><button id="two">Details</button></section>');
    });
    render(<TaskGuideRunner tourId="revisit-action" mission="Mission" steps={[
      makeStep("one", { action: "click", isSatisfied: () => document.querySelector("#details") !== null }),
      makeStep("two"),
    ]} onFinish={finish} />);
    await flush();
    fireEvent.click(opener);
    await flush(350);
    expect(bridge.props?.stepIndex).toBe(1);
    fireEvent.click(screen.getByText("Back"));
    await flush();
    act(() => document.querySelector("#details")!.remove());
    await flush();
    expect(bridge.props?.stepIndex).toBe(0);
    expect(screen.queryByText("Next (1 of 2)")).toBeNull();
    fireEvent.click(opener);
    await flush(350);
    expect(bridge.props?.stepIndex).toBe(1);
    expect(document.querySelector("#details")?.contains(bridge.props?.portalElement as HTMLElement)).toBe(true);
    expect(finish).not.toHaveBeenCalled();
  });

  it("rechecks a toggle reversed before auto-advance and lets the user complete it again", async () => {
    document.body.innerHTML = '<input id="one" type="checkbox" aria-label="Include course" /><button id="two">Review</button>';
    const input = document.querySelector<HTMLInputElement>("#one")!;
    const finish = vi.fn();
    render(<TaskGuideRunner tourId="reversed-toggle" mission="Mission" steps={[makeStep("one", { action: "toggle" }), makeStep("two")]} onFinish={finish} />);
    await flush();
    fireEvent.click(input);
    expect(input.checked).toBe(true);
    await flush(100);
    fireEvent.click(input);
    expect(input.checked).toBe(false);
    await flush(300);
    expect(bridge.props?.stepIndex).toBe(0);
    expect(screen.queryByText("Next (1 of 2)")).toBeNull();
    expect(finish).not.toHaveBeenCalled();
    fireEvent.click(input);
    await flush(350);
    expect(bridge.props?.stepIndex).toBe(1);
  });

  it("keeps the tooltip inside its active application's modal focus scope", async () => {
    document.body.innerHTML = '<section role="dialog" aria-modal="true"><button id="one">One</button></section>';
    render(<TaskGuideRunner tourId="modal" mission="Mission" steps={[makeStep("one")]} onFinish={vi.fn()} />);
    await flush();
    expect(bridge.props?.portalElement).toBeInstanceOf(HTMLElement);
    expect(document.querySelector('[role="dialog"]')?.contains(bridge.props?.portalElement as HTMLElement)).toBe(true);
    expect(bridge.props?.options?.disableFocusTrap).toBe(true);
  });

  it("accepts a fast completed result whose target disappeared before step entry", async () => {
    render(<TaskGuideRunner tourId="fast-result" mission="Mission" steps={[
      makeStep("one"),
      makeStep("missing", { action: "click", isSatisfied: () => true }),
      makeStep("three"),
    ]} onFinish={vi.fn()} />);
    await flush();
    fireEvent.click(screen.getByText("Next (1 of 3)"));
    await flush();
    expect(bridge.props?.stepIndex).toBe(2);
  });

  it("aborts for a competing guide or expired session without completion", async () => {
    const finish = vi.fn();
    render(<TaskGuideRunner tourId="old" mission="Mission" steps={[makeStep("one")]} onFinish={finish} />);
    await flush();
    act(() => { announceJoyrideStart("new"); window.dispatchEvent(new Event(SESSION_ENDED_EVENT)); });
    expect(finish).toHaveBeenCalledExactlyOnceWith("aborted");
  });
});

const hookSteps: WorkflowGuideStep[] = [{ element: "#one", title: "Review", description: "Review this control." }];
function HookHarness({ ready = true, steps = hookSteps, variant = "view" }: { ready?: boolean; steps?: WorkflowGuideStep[]; variant?: string }) {
  useWorkflowGuide({ id: "test", isReady: ready, steps, variant });
  return <button onClick={() => window.dispatchEvent(new Event("restart-workflow-guide:test"))}>Help</button>;
}

describe("manual workflow Help lifecycle", () => {
  it("never auto-starts and records dismissal separately from completion", async () => {
    localStorage.setItem("user", JSON.stringify({ id: 7 }));
    render(<HookHarness />);
    await flush();
    expect(document.querySelector("[data-wicars-guide-root]")).toBeNull();
    fireEvent.click(screen.getByText("Help"));
    await flush();
    fireEvent.click(screen.getAllByRole("button", { name: "Exit tutorial" })[0]);
    await flush();
    expect(JSON.parse(localStorage.getItem("wicars_workflow_guide_v4_test_7_view")!).outcome).toBe("dismissed");
    fireEvent.click(screen.getByText("Help"));
    await flush();
    fireEvent.click(screen.getByText("Finish"));
    await flush();
    expect(JSON.parse(localStorage.getItem("wicars_workflow_guide_v4_test_7_view")!).outcome).toBe("completed");
  });

  it("opens the requested guide with the latest page when loading finishes", async () => {
    const { rerender } = render(<HookHarness ready={false} />);
    fireEvent.click(screen.getByText("Help"));
    await flush();
    expect(screen.getByRole("status").textContent).toContain("loading");
    rerender(<HookHarness steps={[{ element: "#two", title: "Latest", description: "Latest context" }]} />);
    await flush();
    expect(screen.getByRole("heading", { name: "1. Latest" })).toBeTruthy();
    expect(bridge.props?.steps?.[0].target).toBe(document.querySelector("#two"));
  });

  it("does not open a pending guide after the user exits loading help", async () => {
    const { rerender } = render(<HookHarness ready={false} />);
    fireEvent.click(screen.getByText("Help"));
    await flush();
    fireEvent.click(screen.getByText("Exit help"));
    await flush();
    rerender(<HookHarness />);
    await flush();
    expect(document.querySelector("[data-wicars-task-tooltip], [data-wicars-guide-recovery]")).toBeNull();
  });

  it("restarting invalidates a previous wait and user records stay isolated", async () => {
    localStorage.setItem("user", JSON.stringify({ id: 7 }));
    const { rerender } = render(<HookHarness steps={[{ element: "#missing", title: "Old", description: "Old" }]} />);
    fireEvent.click(screen.getByText("Help"));
    await flush();
    localStorage.setItem("user", JSON.stringify({ id: 8 }));
    rerender(<HookHarness variant="other" />);
    fireEvent.click(screen.getByText("Help"));
    await flush();
    document.body.insertAdjacentHTML("beforeend", '<button id="missing">Late</button>');
    await flush(500);
    fireEvent.click(screen.getByText("Finish"));
    await flush();
    expect(localStorage.getItem("wicars_workflow_guide_v4_test_7_view")).toBeNull();
    expect(JSON.parse(localStorage.getItem("wicars_workflow_guide_v4_test_8_other")!).outcome).toBe("completed");
  });

  it("continues to work when browser storage is unavailable", async () => {
    render(<HookHarness />);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.click(screen.getByText("Help"));
    await flush();
    fireEvent.click(screen.getByText("Finish"));
    await flush();
    expect(document.querySelector("[data-wicars-task-tooltip]")).toBeNull();
  });
});
