import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACTIONS, EVENTS, Joyride, STATUS, type EventData } from "react-joyride";
import TaskTooltip from "./TaskTooltip";
import {
  announceJoyrideStart,
  coachMarkStyles,
  listenForOtherJoyrides,
  taskTourOptions,
} from "./joyrideTour";
import {
  attachTaskListener,
  queryVisible,
  stepRequiresAction,
  toJoyrideSteps,
  waitForElement,
  type TaskGuideStep,
} from "./taskGuide";

interface TaskGuideRunnerProps {
  tourId: string;
  mission: string;
  steps: TaskGuideStep[];
  /** finishedAll=true when the user completed every step, false on exit. */
  onFinish: (finishedAll: boolean) => void;
}

const TARGET_WAIT_MS = 12000;
const MAX_TARGET_RETRIES = 2;

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
  const [run, setRun] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const completedRef = useRef<string[]>([]);
  const detachRef = useRef<(() => void) | null>(null);
  const targetRetries = useRef(0);
  const mountedRef = useRef(true);
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const joyrideSteps = useMemo(
    () => toJoyrideSteps(steps, new Set(completedIds), mission),
    [steps, completedIds, mission],
  );

  const finish = useCallback((finishedAll: boolean) => {
    detachRef.current?.();
    detachRef.current = null;
    onFinishRef.current(finishedAll);
  }, []);

  const ensureTarget = useCallback(async (step: TaskGuideStep): Promise<boolean> => {
    let element = await waitForElement(step.waitFor ?? step.target, { timeoutMs: TARGET_WAIT_MS });
    if (!element && step.reveal) {
      // The target lives inside a collapsed group (e.g. a sidebar submenu):
      // expand it once, then wait for the real target.
      const revealer = queryVisible(step.reveal);
      revealer?.click();
      element = await waitForElement(step.waitFor ?? step.target, { timeoutMs: TARGET_WAIT_MS });
    }
    return element !== null;
  }, []);

  const goToStepRef = useRef<(nextIndex: number) => void>(() => undefined);
  const goToStep = useCallback(async (nextIndex: number) => {
    const next = steps[nextIndex];
    if (!next) {
      finish(true);
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
      finish(false);
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
    // Let the UI settle on the user's action before moving the spotlight.
    requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      void goToStep(currentIndex + 1);
    });
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
        finish(false);
        return;
      }
      setRun(true);
      if (!stepRequiresAction(step)) return;
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

  // One tour at a time: announce ourselves and yield to any newer tour.
  useEffect(() => {
    mountedRef.current = true;
    announceJoyrideStart("task:" + tourId);
    const stopListening = listenForOtherJoyrides("task:" + tourId, () => finish(false));
    return () => {
      mountedRef.current = false;
      stopListening();
      detachRef.current?.();
      detachRef.current = null;
    };
  }, [finish, tourId]);

  const handleCallback = useCallback((data: EventData) => {
    if (data.type === EVENTS.TOUR_END) {
      const finished = data.status === STATUS.FINISHED
        || completedRef.current.length >= steps.length;
      finish(finished);
      return;
    }
    if (data.type === EVENTS.TARGET_NOT_FOUND) {
      // Transient unmount during navigation: re-wait, then give up quietly.
      if (targetRetries.current >= MAX_TARGET_RETRIES) {
        finish(false);
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
        autoUpdate: { ancestorScroll: true, elementResize: true, animationFrame: true },
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
