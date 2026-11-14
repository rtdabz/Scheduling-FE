import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIONS, EVENTS, Joyride, STATUS, type EventData } from "react-joyride";
import Modal from "../components/ui/Modal";
import WorkflowGuideButton from "../components/help/WorkflowGuideButton";
import { useWorkflowGuide } from "../hooks/useWorkflowGuide";
import TaskGuideRunner from "./TaskGuideRunner";
import type { TaskGuideStep } from "./taskGuide";

// Keep the installed Joyride engine, event lifecycle, tooltip, portals and focus
// behavior real. Only browser layout/observer APIs absent from jsdom are supplied.
beforeEach(() => {
  const rect = new DOMRect(100, 100, 160, 40);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect);
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([rect] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(160);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(40);
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", Observer);
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(async () => {
  cleanup();
  await act(async () => { await Promise.resolve(); });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const step = (id: string): TaskGuideStep => ({ id, target: "#" + id, action: "complete", title: "Review " + id, text: "Review this control." });
const showing = async (name: string) => waitFor(() => {
  const tooltip = screen.getByRole("region", { name });
  expect(tooltip.parentElement?.style.opacity).toBe("1");
  return tooltip;
}, { timeout: 5000 });

describe("installed Joyride integration", () => {
  it("reports STOP/PAUSED plus STEP_AFTER/UPDATE when a controlled tour is paused", async () => {
    document.body.innerHTML = '<button id="one">One</button>';
    const events: EventData[] = [];
    const steps = [{ target: "#one", content: "An unfinished task" }];
    const onEvent = (event: EventData) => { events.push(event); };
    const options = { skipBeacon: true, skipScroll: true, disableFocusTrap: true };
    const view = render(<Joyride run continuous stepIndex={0} steps={steps} options={options} onEvent={onEvent} />);
    await waitFor(() => expect(events.some((event) => event.type === EVENTS.TOOLTIP)).toBe(true));
    view.rerender(<Joyride run={false} continuous stepIndex={0} steps={steps} options={options} onEvent={onEvent} />);
    await waitFor(() => {
      const paused = events.find((event) => event.type === EVENTS.STEP_AFTER && event.status === STATUS.PAUSED);
      expect(paused?.action).toBe(ACTIONS.UPDATE);
      expect(paused?.controlled).toBe(true);
      expect(paused?.index).toBe(0);
      expect(events.map(({ type, action, status }) => ({ type, action, status }))).toContainEqual({ type: EVENTS.TOUR_STATUS, action: ACTIONS.STOP, status: STATUS.PAUSED });
    });
    expect(events.some((event) => event.status === STATUS.FINISHED)).toBe(false);
  });

  it("focuses named guidance after Next and Back and dismisses Escape without false completion", async () => {
    document.body.innerHTML = '<button id="one">One</button><button id="two">Two</button>';
    const finish = vi.fn();
    render(<TaskGuideRunner tourId="integration-review" mission="Review" steps={[step("one"), step("two")]} onFinish={finish} />);
    await showing("1. Review one");
    const next = screen.getByRole("button", { name: /^Next/ });
    next.focus();
    fireEvent.click(next);
    const second = await showing("2. Review two");
    await waitFor(() => expect(document.activeElement).toBe(second));
    const back = screen.getByRole("button", { name: "Back" });
    back.focus();
    fireEvent.click(back);
    const first = await showing("1. Review one");
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(finish).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(finish).toHaveBeenCalledExactlyOnceWith("dismissed");
  });

  it("moves focus into recovery when its highlighted target disappears", async () => {
    document.body.innerHTML = '<button id="one">One</button>';
    const finish = vi.fn();
    render(<TaskGuideRunner tourId="integration-recovery-focus" mission="Recovery" steps={[step("one")]} onFinish={finish} />);
    const tooltip = await showing("1. Review one");
    tooltip.focus();
    act(() => document.querySelector("#one")!.remove());
    const recovery = await screen.findByRole("region", { name: "Recovery help" });
    await waitFor(() => expect(document.activeElement).toBe(recovery));
    fireEvent.keyDown(recovery, { key: "Escape" });
    expect(finish).toHaveBeenCalledExactlyOnceWith("dismissed");
  });

  it("advances when a successful click removes its own highlighted control", async () => {
    document.body.innerHTML = '<button id="one">Open building</button><section id="two">Rooms in this building</section>';
    document.querySelector("#one")!.addEventListener("click", (event) => (event.currentTarget as HTMLElement).remove());
    const finish = vi.fn();
    render(<TaskGuideRunner tourId="integration-removed-click" mission="Rooms" steps={[{ ...step("one"), action: "click" }, step("two")]} onFinish={finish} />);
    await showing("1. Review one");
    fireEvent.click(document.querySelector("#one")!);
    await showing("2. Review two");
    expect(finish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Finish/ }));
    expect(finish).toHaveBeenCalledExactlyOnceWith("completed");
  });

  it("keeps an unfinished action at the same step through a real modal pause/resume", async () => {
    document.body.innerHTML = '<button id="one">One</button><button id="two">Two</button>';
    const finish = vi.fn();
    render(<TaskGuideRunner tourId="integration-pause" mission="Tasks" steps={[{ ...step("one"), action: "click" }, step("two")]} onFinish={finish} />);
    await showing("1. Review one");
    const modal = document.createElement("section");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = "<button>Close unrelated dialog</button>";
    act(() => document.body.appendChild(modal));
    await screen.findByRole("region", { name: "Tasks help" });
    await waitFor(() => expect(document.querySelector("[data-wicars-task-tooltip]")).toBeNull());
    expect(finish).not.toHaveBeenCalled();
    act(() => modal.remove());
    await showing("1. Review one");
    expect(screen.queryByRole("button", { name: /^Next/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "2. Review two" })).toBeNull();
    expect(finish).not.toHaveBeenCalled();
  });

  it("keeps real tooltip, Help, target focus, and Tab wrapping inside the shared modal", async () => {
    const closeModal = vi.fn();
    function ModalHelp() {
      useWorkflowGuide({
        id: "integration-modal", isReady: true,
        steps: [{ element: "#modal-input", action: "input", title: "Name the section", description: "Enter the official section name." }],
      });
      return <>
        <button>Outside the modal</button>
        <Modal isOpen onClose={closeModal} title="Edit section">
          <input id="modal-input" aria-label="Section name" />
          <button>Last form control</button>
        </Modal>
        <WorkflowGuideButton guideId="integration-modal" />
      </>;
    }
    render(<ModalHelp />);
    const dialog = screen.getByRole("dialog", { name: "Edit section" });
    const help = screen.getByRole("button", { name: "Open this workflow's help guide" });
    await waitFor(() => expect(dialog.contains(help)).toBe(true));
    help.focus();
    fireEvent.click(help);
    const tooltip = await showing("1. Name the section");
    expect(dialog.contains(tooltip)).toBe(true);
    expect(tooltip.hasAttribute("aria-modal")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Go to control" }));
    const input = screen.getByRole("textbox", { name: "Section name" });
    expect(document.activeElement).toBe(input);
    const focusable = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-wicars-task-tooltip]")).toBeNull());
    expect(closeModal).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit section" })).toBe(dialog);
    expect(document.activeElement).toBe(help);
  });
});
