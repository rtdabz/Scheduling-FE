import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { size } from "@floating-ui/react-dom";
import { ACTIONS, EVENTS, Joyride, STATUS, type EventData, type TooltipRenderProps } from "react-joyride";
import { SESSION_ENDED_EVENT } from "../lib/sessionTimeout";
import TaskTooltip from "./TaskTooltip";
import { beginTourDiagnostics, endTourDiagnostics, recordTourStep } from "./tourDiagnostics";
import { announceJoyrideStart, coachMarkStyles, listenForOtherJoyrides, taskTourOptions } from "./joyrideTour";
import {
  attachTaskListener, DOM_POLL_INTERVAL_MS, isSelfInflicted, isTaskStepSatisfied, openModalLayer,
  queryVisible, stepRequiresAction, stepSatisfaction, toJoyrideSteps, waitForElement, WATCHED_ATTRIBUTES,
  type StepSatisfaction, type TaskGuideOutcome, type TaskGuideStep,
} from "./taskGuide";

interface TaskGuideRunnerProps {
  tourId: string;
  mission: string;
  steps: TaskGuideStep[];
  onFinish: (outcome: TaskGuideOutcome) => void;
  unavailableReason?: string;
  onRestart?: () => void;
}

interface GuideView {
  index: number;
  target: HTMLElement | null;
  phase: "waiting" | "showing" | "blocked";
  message: string;
}

export default function TaskGuideRunner({ tourId, mission, steps, onFinish, unavailableReason, onRestart }: TaskGuideRunnerProps) {
  const [view, setView] = useState<GuideView>({ index: 0, target: null, phase: "waiting", message: "Finding the highlighted control…" });
  const viewRef = useRef(view);
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set());
  const completedRef = useRef(new Set<string>());
  const [satisfied, setSatisfied] = useState<ReadonlyMap<string, StepSatisfaction>>(new Map());
  const [portal] = useState(() => document.createElement("div"));
  const work = useRef<(() => void) | null>(null);
  const transition = useRef(0);
  const finished = useRef(false);
  const advanceTimer = useRef(0);
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const goRef = useRef<(index: number, direction?: number) => void>(() => undefined);
  const finishRef = useRef(onFinish);
  useEffect(() => { finishRef.current = onFinish; }, [onFinish]);

  const updateView = useCallback((next: GuideView) => {
    viewRef.current = next;
    setView(next);
  }, []);
  const cancelWork = useCallback(() => {
    transition.current += 1;
    work.current?.();
    work.current = null;
    window.clearTimeout(advanceTimer.current);
  }, []);
  const finish = useCallback((outcome: TaskGuideOutcome) => {
    if (finished.current) return;
    finished.current = true;
    cancelWork();
    endTourDiagnostics(outcome, tourId);
    finishRef.current(outcome);
    if (outcome !== "aborted") {
      queueMicrotask(() => {
        const modal = openModalLayer();
        const focusTarget = modal && !modal.contains(opener.current)
          ? modal.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex='0']")
          : opener.current;
        if (focusTarget?.isConnected) focusTarget.focus();
      });
    }
  }, [cancelWork, tourId]);

  const actionDone = useCallback((step: TaskGuideStep, token: number) => {
    if (finished.current || transition.current !== token || completedRef.current.has(step.id)) return;
    completedRef.current.add(step.id);
    setCompleted(new Set(completedRef.current));
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      if (transition.current !== token || finished.current) return;
      const target = queryVisible(step.target) ?? viewRef.current.target;
      if ((step.isSatisfied || ["select", "input", "toggle"].includes(step.action)) && (!target || !isTaskStepSatisfied(step, target))) {
        completedRef.current.delete(step.id);
        setCompleted(new Set(completedRef.current));
        void goRef.current(viewRef.current.index);
        return;
      }
      goRef.current(viewRef.current.index + 1);
    }, 250);
  }, []);

  const go = useCallback(async (requestedIndex: number, direction = 1) => {
    cancelWork();
    if (finished.current) return;
    if (document.getElementById("session-timeout-title")) { finish("aborted"); return; }
    if (requestedIndex < 0) {
      updateView({ index: 0, target: null, phase: "blocked", message: "There is no earlier available step in this view. Retry the guide or exit help." });
      return;
    }
    const index = Math.max(0, requestedIndex);
    const step = steps[index];
    if (!step) {
      if (completedRef.current.size) finish("completed");
      else updateView({ index: 0, target: null, phase: "blocked", message: "There are no applicable controls in this view. Retry after choosing a different view, or exit help." });
      return;
    }
    if (unavailableReason) {
      updateView({ index, target: null, phase: "blocked", message: unavailableReason });
      return;
    }
    // Fast interactions can reach a result before its step's listener mounts.
    // A removed listbox is not a missing prerequisite after selection succeeded.
    try {
      if (direction > 0 && stepRequiresAction(step) && step.isSatisfied?.() && !queryVisible(step.target)) {
        completedRef.current.add(step.id);
        setCompleted(new Set(completedRef.current));
        void goRef.current(index + 1);
        return;
      }
    } catch {
      // A failed result check follows normal target recovery.
    }
    const token = transition.current;
    const controller = new AbortController();
    work.current = () => controller.abort();
    updateView({ index, target: null, phase: "waiting", message: "Looking for “" + step.title + "”. If another dialog is open, close it to return to this step." });
    const startedAt = performance.now();
    const deadline = startedAt + (step.waitTimeoutMs ?? (step.skipIfMissing ? 900 : 12000));
    const wait = (selector: string) => waitForElement(selector, { timeoutMs: Math.max(0, deadline - performance.now()), signal: controller.signal });
    const prerequisite = !step.waitFor || step.waitFor === step.target || await wait(step.waitFor);
    const target = prerequisite ? await wait(step.target) : null;
    if (controller.signal.aborted || transition.current !== token || finished.current) return;
    if (!target) {
      if (step.skipIfMissing) {
        void goRef.current(index + direction, direction);
      } else {
        updateView({ index, target: null, phase: "blocked", message: "“" + step.title + "” is not available in this view. Close any unrelated dialog or check the page's prerequisites, then retry." });
      }
      return;
    }
    const targetBounds = target.getBoundingClientRect();
    if (targetBounds.top >= window.innerHeight || targetBounds.bottom <= 0 || targetBounds.left >= window.innerWidth || targetBounds.right <= 0) {
      target.scrollIntoView?.({ behavior: "instant", block: "center", inline: "nearest" });
    }
    // Revisit action steps with fresh listeners; only their current result counts.
    if (stepRequiresAction(step)) {
      completedRef.current.delete(step.id);
      setCompleted(new Set(completedRef.current));
    }
    let detach = attachTaskListener(step, () => actionDone(step, token), target);
    let syncTimer = 0;
    const sync = () => {
      syncTimer = 0;
      if (controller.signal.aborted || transition.current !== token || finished.current) return;
      if (document.getElementById("session-timeout-title")) { queueMicrotask(() => finish("aborted")); return; }
      if (step.isSatisfied && isTaskStepSatisfied(step, target)) actionDone(step, token);
      if (completedRef.current.has(step.id)) return;
      const currentTarget = queryVisible(step.target);
      if (!currentTarget || (step.waitFor && !queryVisible(step.waitFor))) {
        void goRef.current(index);
        return;
      }
      if (currentTarget !== viewRef.current.target) {
        detach();
        detach = attachTaskListener(step, () => actionDone(step, token), currentTarget);
        updateView({ index, target: currentTarget, phase: "showing", message: "" });
      }
      const value = stepSatisfaction(step, currentTarget);
      setSatisfied((previous) => {
        if ((previous.get(step.id) ?? null) === value) return previous;
        const next = new Map(previous);
        if (value) next.set(step.id, value);
        else next.delete(step.id);
        return next;
      });
    };
    const scheduleSync = () => {
      if (!syncTimer) syncTimer = window.setTimeout(sync, DOM_POLL_INTERVAL_MS);
    };
    const observer = new MutationObserver((records) => { if (!isSelfInflicted(records)) scheduleSync(); });
    observer.observe(document.documentElement, { attributeFilter: WATCHED_ATTRIBUTES, attributes: true, childList: true, subtree: true });
    const poll = window.setInterval(sync, DOM_POLL_INTERVAL_MS * 2);
    work.current = () => {
      controller.abort();
      detach();
      observer.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(syncTimer);
    };
    updateView({ index, target, phase: "showing", message: "" });
    sync();
    recordTourStep(step.id, step.target, performance.now() - startedAt, target);
  }, [actionDone, cancelWork, finish, steps, unavailableReason, updateView]);

  useEffect(() => { goRef.current = go; }, [go]);
  useEffect(() => {
    finished.current = false;
    announceJoyrideStart(tourId);
    beginTourDiagnostics(tourId);
    const stopOther = listenForOtherJoyrides(tourId, () => finish("aborted"));
    const endSession = () => finish("aborted");
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finish("dismissed");
    };
    window.addEventListener("keydown", dismiss, true);
    window.addEventListener(SESSION_ENDED_EVENT, endSession);
    void goRef.current(0);
    return () => {
      finished.current = true;
      cancelWork();
      stopOther();
      window.removeEventListener("keydown", dismiss, true);
      window.removeEventListener(SESSION_ENDED_EVENT, endSession);
      endTourDiagnostics("aborted", tourId);
    };
  }, [cancelWork, finish, tourId]);

  useLayoutEffect(() => {
    portal.setAttribute("data-wicars-guide-portal", tourId);
    const syncPortal = () => {
      if (document.getElementById("session-timeout-title")) { queueMicrotask(() => finish("aborted")); return; }
      const parent = openModalLayer() ?? document.body;
      if (portal.parentElement === parent) return;
      const focused = document.activeElement instanceof HTMLElement && portal.contains(document.activeElement) ? document.activeElement : null;
      parent.appendChild(portal);
      focused?.focus({ preventScroll: true });
    };
    syncPortal();
    const observer = new MutationObserver((records) => { if (!isSelfInflicted(records)) syncPortal(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: WATCHED_ATTRIBUTES, childList: true, subtree: true });
    return () => { observer.disconnect(); portal.remove(); };
  }, [finish, portal, tourId]);

  useLayoutEffect(() => {
    if (view.phase !== "showing") portal.querySelector<HTMLElement>("[data-wicars-guide-recovery]")?.focus({ preventScroll: true });
  }, [portal, view.index, view.phase]);

  const continueStep = useCallback(() => {
    const current = viewRef.current;
    const step = steps[current.index];
    if (current.phase !== "showing" || !current.target || !step) return;
    const requiresCurrentResult = step.isSatisfied || ["select", "input", "toggle"].includes(step.action);
    if (stepRequiresAction(step) && (!completedRef.current.has(step.id) || requiresCurrentResult) && !isTaskStepSatisfied(step, current.target)) return;
    completedRef.current.add(step.id);
    setCompleted(new Set(completedRef.current));
    void goRef.current(current.index + 1);
  }, [steps]);
  const back = useCallback(() => { void goRef.current(viewRef.current.index - 1, -1); }, []);
  const tooltip = useCallback((props: TooltipRenderProps) => (
    <TaskTooltip {...props}
      backProps={{ ...props.backProps, onClick: back }}
      primaryProps={{ ...props.primaryProps, onClick: continueStep }}
      closeProps={{ ...props.closeProps, onClick: () => finish("dismissed") }}
      skipProps={{ ...props.skipProps, onClick: () => finish("dismissed") }}
    />
  ), [back, continueStep, finish]);
  const handleEvent = useCallback((event: EventData) => {
    if (finished.current) return;
    if (event.type === EVENTS.TOOLTIP && event.index === viewRef.current.index) {
      portal.querySelector<HTMLElement>("[data-wicars-task-tooltip]")?.focus({ preventScroll: true });
    } else if ((event.type === EVENTS.TOUR_END && event.status === STATUS.SKIPPED) || event.action === ACTIONS.CLOSE) finish("dismissed");
    else if (event.type === EVENTS.TARGET_NOT_FOUND && viewRef.current.phase === "showing" && event.index === viewRef.current.index) {
      void goRef.current(completedRef.current.has(steps[event.index]?.id) ? event.index + 1 : event.index);
    }
    // STOP/UPDATE and positioning callbacks never complete tasks. Navigation is owned above.
  }, [finish, portal, steps]);
  const targets = useMemo(() => view.target && steps[view.index]
    ? new Map([[steps[view.index].id, view.target]]) : new Map<string, HTMLElement>(), [steps, view.index, view.target]);
  const joyrideSteps = useMemo(() => toJoyrideSteps(steps, completed, mission, satisfied, targets), [steps, completed, mission, satisfied, targets]);
  const fitTooltip = useMemo(() => size({
    padding: 12,
    boundary: [],
    rootBoundary: "viewport",
    apply: ({ availableHeight, elements }) => {
      elements.floating.style.setProperty("--wicars-tour-max-height", Math.max(0, availableHeight) + "px");
    },
  }), []);

  return <>
    {view.phase === "showing" && view.target?.isConnected && <Joyride key={view.index} continuous onEvent={handleEvent} run stepIndex={view.index}
      steps={joyrideSteps} options={taskTourOptions} styles={coachMarkStyles} tooltipComponent={tooltip}
      portalElement={portal} scrollToFirstStep
      floatingOptions={{ strategy: "fixed", autoUpdate: { ancestorResize: true, ancestorScroll: true, elementResize: true, layoutShift: true }, flipOptions: { crossAxis: true, padding: 12, boundary: [], rootBoundary: "viewport" }, shiftOptions: { crossAxis: steps[view.index]?.action === "complete", padding: 12, boundary: [], rootBoundary: "viewport" }, middleware: [fitTooltip] }}
      locale={{ back: "Back", close: "Exit help", last: "Finish", next: "Next", skip: "Exit help" }} />}
    {view.phase !== "showing" && createPortal(
      <section data-wicars-guide-recovery tabIndex={-1} className="wicars-task-tip fixed bottom-3 right-3 z-[20001]" role="region" aria-label={mission + " help"}>
        <div className="wicars-task-tip-head"><h3 className="wicars-task-tip-title">{mission}</h3></div>
        <p className="wicars-task-tip-body" role="status">{view.message}</p>
        <div className="wicars-task-tip-foot">
          <button type="button" className="wicars-task-tip-exit" onClick={() => finish("dismissed")}>Exit help</button>
          {view.index > 0 && <button type="button" className="wicars-task-tip-back" onClick={back}>Back</button>}
          <button type="button" className="wicars-task-tip-next" onClick={() => onRestart ? onRestart() : void goRef.current(view.index)}>Retry</button>
        </div>
      </section>, portal)}
  </>;
}
