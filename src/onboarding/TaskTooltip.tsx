import { useId } from "react";
import type { TooltipRenderProps } from "react-joyride";
import { actionVerb, isControlUnavailable, type JoyrideTaskData } from "./taskGuide";

const readTaskData = (step: TooltipRenderProps["step"]): JoyrideTaskData | null => {
  const data = (step as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const candidate = data as Partial<JoyrideTaskData>;
  if (typeof candidate.stepId !== "string") return null;
  return {
    stepId: candidate.stepId,
    action: candidate.action ?? "complete",
    taskHint: candidate.taskHint ?? "",
    completed: candidate.completed === true,
    satisfied: candidate.satisfied ?? null,
    mission: candidate.mission ?? "",
    targetElement: candidate.targetElement instanceof HTMLElement ? candidate.targetElement : undefined,
  };
};

const waitingText = (task: JoyrideTaskData): string => {
  switch (task.satisfied) {
    case "value":
      return "Already set — continue, or change it to update.";
    default:
      return task.taskHint || "Complete the highlighted task to continue.";
  }
};

export default function TaskTooltip(props: TooltipRenderProps) {
  const { backProps, closeProps, continuous, index, isLastStep, primaryProps, size, skipProps, step, tooltipProps } = props;
  const task = readTaskData(step);
  const requiresAction = task !== null && task.action !== "complete";
  const completed = task?.completed === true;
  const satisfied = task?.satisfied === "value";
  const target = task?.targetElement ?? (step.target instanceof HTMLElement ? step.target : undefined);
  const unavailable = target !== undefined && isControlUnavailable(target);
  const canContinue = !requiresAction || (!unavailable && (completed || satisfied));
  const titleId = useId();
  const descriptionId = useId();
  const focusTarget = () => {
    if (!target?.isConnected || unavailable) return;
    const focusable = target.matches('button, input, select, textarea, a[href], [tabindex]')
      ? target
      : target.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]') ?? target;
    if (!focusable.hasAttribute("tabindex") && focusable.tabIndex < 0) {
      focusable.tabIndex = -1;
      focusable.addEventListener("blur", () => focusable.removeAttribute("tabindex"), { once: true });
    }
    focusable.focus({ preventScroll: true });
  };

  return (
    <div {...tooltipProps} role="region" tabIndex={-1} aria-modal={undefined} aria-labelledby={titleId} aria-describedby={descriptionId} className="wicars-task-tip react-joyride__tooltip" data-wicars-task-tooltip data-wicars-step-id={task?.stepId} data-wicars-task-action={task?.action}>
      <div className="wicars-task-tip-head">
        <div className="wicars-task-tip-head-row">
          {task?.mission ? <span className="wicars-task-tip-mission">{task.mission}</span> : null}
          <span className="wicars-task-tip-progress" aria-label={"Step " + (index + 1) + " of " + size}>
            {index + 1} / {size}
          </span>
        </div>
        <h3 id={titleId} className="wicars-task-tip-title">{step.title}</h3>
        <button {...closeProps} className="wicars-task-tip-close" aria-label="Exit tutorial" type="button" />
      </div>

      <div key={task?.stepId ?? index} className="wicars-task-tip-anim">
        <div id={descriptionId} className="wicars-task-tip-body">{step.content}</div>

        {requiresAction ? (
          <p
            className={"wicars-task-tip-status" + (canContinue ? " is-done" : " is-waiting")}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" className="wicars-task-tip-verb">{task ? actionVerb(task.action) : "Do"}</span>
            <span aria-hidden="true" className="wicars-task-tip-dot" />
            {unavailable ? "This control is unavailable. Check the page prerequisites, or exit help." : completed ? "Task complete — continuing…" : task ? waitingText(task) : "Complete the highlighted task to continue."}
          </p>
        ) : null}
      </div>

      <div className="wicars-task-tip-foot">
        <div className="wicars-task-tip-foot-left">
          {index > 0 ? (
            <button {...backProps} className="wicars-task-tip-back" type="button">
              Back
            </button>
          ) : null}
          <button {...skipProps} className="wicars-task-tip-exit" type="button">
            Exit tutorial
          </button>
          {target && !unavailable ? (
            <button className="wicars-task-tip-focus" onClick={focusTarget} type="button">
              Go to control
            </button>
          ) : null}
        </div>
        {continuous && canContinue ? (
          <button {...primaryProps} className="wicars-task-tip-next" type="button">
            {isLastStep ? "Finish" : "Next (" + (index + 1) + " of " + size + ")"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
