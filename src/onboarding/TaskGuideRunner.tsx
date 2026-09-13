import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACTIONS, EVENTS, Joyride, STATUS, type EventData } from "react-joyride";
import TaskTooltip from "./TaskTooltip";
import {
  beginTourDiagnostics,
  endTourDiagnostics,
  recordTourStep,
} from "./tourDiagnostics";
import {
  announceJoyrideStart,
  coachMarkStyles,
  listenForOtherJoyrides,
  taskTourOptions,
} from "./joyrideTour";
import {
  attachTaskListener,
  DOM_POLL_INTERVAL_MS,
  isSelfInflicted,
  queryVisible,
  stepRequiresAction,
  stepSatisfaction,
  toJoyrideSteps,
  waitForElement,
  WATCHED_ATTRIBUTES,
  type StepSatisfaction,
  type TaskGuideOutcome,
  type TaskGuideStep,
} from "./taskGuide";

interface TaskGuideRunnerProps {
  tourId: string;
  mission: string;
  steps: TaskGuideStep[];
  /**
   * Called exactly once when the mission ends. The outcome tells the host
   * whether the user decided to stop (`completed`/`dismissed`, safe to
   * persist) or the tour gave up on its own (`aborted`, must stay resumable).
   */
  onFinish: (outcome: TaskGuideOutcome) => void;
}

const TARGET_WAIT_MS = 12000;
const MAX_TARGET_RETRIES = 2;
/** How long the "Task complete" confirmation stays up before advancing. */
const TASK_DONE_BEAT_MS = 520;

/**
 * Controlled Joyride runner for task-based missions. It waits (via
 * MutationObserver, never fixed sleeps) for each step's target to mount,
 * attaches exactly one action listener per step, auto-advances when the user
 * performs the required action, and cleans every listener up on step change
 * and unmount. Shared by the cross-page host and the in-page workflow hook.
 */
export default function TaskGuideRunner({ tourId, mission, steps, onFinish }: TaskGuideRunnerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  // Steps that need no action from the user (already-set value, disabled
  // control). Evaluated once per step, when its target is ready.
  const [satisfiedIds, setSatisfiedIds] = useState<ReadonlyMap<string, StepSatisfaction>>(new Map());
  const [run, setRun] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const completedRef = useRef<string[]>([]);
  const detachRef = useRef<(() => void) | null>(null);
  const targetRetries = useRef(0);
  const advanceTimer = useRef(0);
  const mountedRef = useRef(true);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const joyrideSteps = useMemo(
    () => toJoyrideSteps(steps, new Set(completedIds), mission, satisfiedIds),
    [steps, completedIds, mission, satisfiedIds],
  );

  const finishedRef = useRef(false);
  const finish = useCallback((outcome: TaskGuideOutcome) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    detachRef.current?.();
    detachRef.current = null;
    window.clearTimeout(advanceTimer.current);
    endTourDiagnostics(outcome);
    onFinishRef.current(outcome);
  }, []);

  const ensureTarget = useCallback(async (step: TaskGuideStep): Promise<boolean> => {
    const timeoutMs = step.waitTimeoutMs ?? TARGET_WAIT_MS;
    const startedAt = performance.now();
    let element = await waitForElement(step.waitFor ?? step.target, { timeoutMs });
    if (!element && step.reveal) {
      // The target lives inside a collapsed group (e.g. a sidebar submenu):
      // expand it once, then wait for the real target.
      const revealer = queryVisible(step.reveal);
      revealer?.click();
      element = await waitForElement(step.waitFor ?? step.target, { timeoutMs });
    }
    recordTourStep(step.id, step.target, performance.now() - startedAt);
    return element !== null;
  }, []);

  /**
   * Record whether this step can be satisfied at all. A select holding the
   * only value it will ever have, or a disabled control, emits no event the
   * listener could hear, so without this the mission strands here with no
   * way forward.
   */
  const measureSatisfaction = useCallback((step: TaskGuideStep) => {
    const element = queryVisible(step.target) ?? queryVisible(step.waitFor ?? step.target);
    const satisfaction = element ? stepSatisfaction(step, element) : null;
    setSatisfiedIds((current) => {
      if ((current.get(step.id) ?? null) === satisfaction) return current;
      const next = new Map(current);
      if (satisfaction) next.set(step.id, satisfaction);
      else next.delete(step.id);
      return next;
    });
  }, []);

  const goToStepRef = useRef<(nextIndex: number) => void>(() => undefined);
  const goToStep = useCallback(async (nextIndex: number) => {
    const next = steps[nextIndex];
    if (!next) {
      finish("completed");
      return;
    }
    detachRef.current?.();
    detachRef.current = null;
    // Hide the tour while the next route/component mounts so a missing target
    // never triggers a TARGET_NOT_FOUND error mid-navigation.
    setRun(false);
    const ready = await ensureTarget(next);
    if (!mountedRef.current) return;
    if (!ready) {
      if (next.skipIfMissing) {
        // Genuinely conditional UI (e.g. program list for a department
        // without programs): skip the step, keep the mission going.
        goToStepRef.current(nextIndex + 1);
        return;
      }
      // Target never mounted (permissions, empty state, closed dialog):
      // close quietly without marking completion so the user can restart.
      finish("aborted");
      return;
    }
    targetRetries.current = 0;
    setStepIndex(nextIndex);
    setRun(true);
  }, [ensureTarget, finish, steps]);

  useEffect(() => {
    goToStepRef.current = goToStep;
  }, [goToStep]);

  const handleActionDone = useCallback((step: TaskGuideStep) => {
    if (!completedRef.current.includes(step.id)) {
      completedRef.current = [...completedRef.current, step.id];
      setCompletedIds(completedRef.current);
    }
    const currentIndex = steps.findIndex((candidate) => candidate.id === step.id);
    // Hold the tooltip on its "Task complete" state for one short beat before
    // moving the spotlight. Without it the confirmation renders and is
    // replaced in the same frame, so the user only ever sees the jump and
    // never learns which action satisfied the step.
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      void goToStep(currentIndex + 1);
    }, TASK_DONE_BEAT_MS);
  }, [goToStep, steps]);

  // Attach the current step's listener only after its target exists.
  useEffect(() => {
    const step = steps[stepIndex];
    if (!step) return;
    let cancelled = false;
    void ensureTarget(step).then((ready) => {
      if (cancelled || !mountedRef.current) return;
      if (!ready) {
        if (step.skipIfMissing) {
          void goToStep(stepIndex + 1);
          return;
        }
        finish("aborted");
        return;
      }
      setRun(true);
      if (!stepRequiresAction(step)) return;
      measureSatisfaction(step);
      detachRef.current?.();
      detachRef.current = attachTaskListener(step, () => handleActionDone(step));
    });
    return () => {
      cancelled = true;
      detachRef.current?.();
      detachRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, retryNonce, tourId]);

  // Keep the spotlight in step with what the user can actually see. Task
  // tours render above modal portals on purpose (so a tour can run inside a
  // dialog), which means a step whose target ends up *behind* a dialog the
  // user just opened would otherwise keep narrating the page underneath it.
  // Hide while that is true, and come back when the dialog closes.
  useEffect(() => {
    const step = steps[stepIndex];
    if (!step) return;
    const selector = step.waitFor ?? step.target;
    let last = 0;
    let timer = 0;
    const sync = () => {
      timer = 0;
      last = Date.now();
      if (!mountedRef.current || finishedRef.current) return;
      setRun(queryVisible(selector) !== null);
      // A control measured as disabled can be enabled a moment later (and the
      // other way round), so the tooltip's offer to continue has to follow
      // the control rather than freeze at whatever was true on arrival.
      if (stepRequiresAction(step)) measureSatisfaction(step);
    };
    // Throttled, not per-frame: both checks force layout, and Joyride rewrites
    // its own tooltip style constantly while positioning — watching that at
    // frame rate turned this into a loop that re-measured the document on
    // every frame for as long as a tour was open.
    const schedule = () => {
      if (timer) return;
      const wait = Math.max(0, DOM_POLL_INTERVAL_MS - (Date.now() - last));
      timer = window.setTimeout(sync, wait);
    };
    const observer = new MutationObserver((records) => {
      if (isSelfInflicted(records)) return;
      schedule();
    });
    observer.observe(document.documentElement, {
      attributeFilter: WATCHED_ATTRIBUTES,
      attributes: true,
      childList: true,
      subtree: true,
    });
    const poll = window.setInterval(schedule, DOM_POLL_INTERVAL_MS * 4);
    sync();
    return () => {
      observer.disconnect();
      window.clearInterval(poll);
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, retryNonce, tourId, measureSatisfaction]);

  // One tour at a time: announce ourselves and yield to any newer tour.
  useEffect(() => {
    mountedRef.current = true;
    beginTourDiagnostics(tourId);
    announceJoyrideStart("task:" + tourId);
    const stopListening = listenForOtherJoyrides("task:" + tourId, () => finish("aborted"));
    return () => {
      mountedRef.current = false;
      stopListening();
      window.clearTimeout(advanceTimer.current);
      detachRef.current?.();
      detachRef.current = null;
    };
  }, [finish, tourId]);

  const handleCallback = useCallback((data: EventData) => {
    if (data.type === EVENTS.TOUR_END) {
      // Skip/close are deliberate: the user has seen the guide and chose to
      // stop, so the host may retire it. Anything else is the tour ending on
      // its own and must stay resumable.
      if (data.status === STATUS.FINISHED || completedRef.current.length >= steps.length) {
        finish("completed");
      } else {
        finish("dismissed");
      }
      return;
    }
    if (data.type === EVENTS.TARGET_NOT_FOUND) {
      // Transient unmount during navigation: re-wait, then give up quietly.
      if (targetRetries.current >= MAX_TARGET_RETRIES) {
        finish("aborted");
        return;
      }
      targetRetries.current += 1;
      setRun(false);
      setRetryNonce((nonce) => nonce + 1);
      return;
    }
    if (data.type === EVENTS.STEP_AFTER) {
      if (data.action === ACTIONS.PREV) {
        void goToStep(data.index - 1);
      } else {
        // "Next"/"Finish" only renders for `complete` steps (the custom
        // tooltip hides it while an action is pending).
        const current = steps[data.index];
        if (current && !completedRef.current.includes(current.id)) {
          completedRef.current = [...completedRef.current, current.id];
          setCompletedIds(completedRef.current);
        }
        void goToStep(data.index + 1);
      }
    }
  }, [finish, goToStep, steps]);

  return (
    <Joyride
      continuous
      onEvent={handleCallback}
      floatingOptions={{
        // Keep the tooltip glued to its target while the page scrolls,
        // resizes, or moves elements (the spotlight already tracks scroll,
        // resize, and target mutations internally).
        // No `animationFrame`: that recomputes the tooltip position on every
        // frame forever, which is floating-ui's documented last resort. Scroll,
        // resize and layout-shift observers already cover everything that
        // actually moves a target here, at a fraction of the cost.
        autoUpdate: {
          ancestorResize: true,
          ancestorScroll: true,
          elementResize: true,
          layoutShift: true,
        },
        // Shift on both axes. A target taller than the viewport leaves no
        // room on either side, so flip cannot rescue it and the default
        // main-axis-only shift lets the tooltip's header hang off-screen.
        // Cross-axis shifting pulls it back into view instead: overlapping
        // the target beats being unreadable.
        shiftOptions: { crossAxis: true, padding: 12 },
      }}
      locale={{
        back: "Back",
        close: "Close",
        last: "Finish",
        next: "Next",
        skip: "Exit tutorial",
      }}
      options={taskTourOptions}
      run={run}
      scrollToFirstStep
      stepIndex={stepIndex}
      steps={joyrideSteps}
      styles={coachMarkStyles}
      tooltipComponent={TaskTooltip}
    />
  );
}
