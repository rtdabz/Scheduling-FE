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
  onFinish: (outcome: TaskGuideOutcome) => void;
}

const TARGET_WAIT_MS = 12000;
const MAX_TARGET_RETRIES = 2;
const TASK_DONE_BEAT_MS = 520;

export default function TaskGuideRunner({ tourId, mission, steps, onFinish }: TaskGuideRunnerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
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
      const revealer = queryVisible(step.reveal);
      revealer?.click();
      element = await waitForElement(step.waitFor ?? step.target, { timeoutMs });
    }
    recordTourStep(step.id, step.target, performance.now() - startedAt);
    return element !== null;
  }, []);

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
    setRun(false);
    const ready = await ensureTarget(next);
    if (!mountedRef.current) return;
    if (!ready) {
      if (next.skipIfMissing) {
        goToStepRef.current(nextIndex + 1);
        return;
      }
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
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      void goToStep(currentIndex + 1);
    }, TASK_DONE_BEAT_MS);
  }, [goToStep, steps]);

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
      if (stepRequiresAction(step)) measureSatisfaction(step);
    };
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
      if (data.status === STATUS.FINISHED || completedRef.current.length >= steps.length) {
        finish("completed");
      } else {
        finish("dismissed");
      }
      return;
    }
    if (data.type === EVENTS.TARGET_NOT_FOUND) {
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
        autoUpdate: {
          ancestorResize: true,
          ancestorScroll: true,
          elementResize: true,
          layoutShift: true,
        },
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
