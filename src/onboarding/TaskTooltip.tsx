import type { TooltipRenderProps } from "react-joyride";
import { actionVerb, type JoyrideTaskData } from "./taskGuide";

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
    mission: candidate.mission ?? "",
  };
};

/**
 * Game-style tooltip for task tours. Action steps never render a Next button
 * until the required action is detected; the footer always shows mission
 * progress ("Step X of Y") plus Back / Exit controls.
 */
export default function TaskTooltip(props: TooltipRenderProps) {
  const { backProps, closeProps, continuous, index, isLastStep, primaryProps, size, skipProps, step, tooltipProps } = props;
  const task = readTaskData(step);
  const requiresAction = task !== null && task.action !== "complete";
  const completed = task?.completed === true;
  const canContinue = !requiresAction || completed;

  return (
    <div {...tooltipProps} className="wicars-task-tip">
      <div className="wicars-task-tip-head">
        <div className="wicars-task-tip-head-row">
          {task?.mission ? <span className="wicars-task-tip-mission">{task.mission}</span> : null}
          <span className="wicars-task-tip-progress" aria-label={"Step " + (index + 1) + " of " + size}>
            {index + 1} / {size}
          </span>
        </div>
        <h3 className="wicars-task-tip-title">{step.title}</h3>
        <button {...closeProps} className="wicars-task-tip-close" aria-label="Exit tutorial" type="button" />
      </div>

      <div key={task?.stepId ?? index} className="wicars-task-tip-anim">
        <div className="wicars-task-tip-body">{step.content}</div>

        {requiresAction ? (
          <p
            className={"wicars-task-tip-status" + (completed ? " is-done" : " is-waiting")}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden="true" className="wicars-task-tip-verb">{task ? actionVerb(task.action) : "Do"}</span>
            <span aria-hidden="true" className="wicars-task-tip-dot" />
            {completed ? "Task complete — continuing…" : task?.taskHint ?? "Complete the highlighted task to continue."}
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
