import type { CSSProperties } from "react";
import { Check } from "lucide-react";

export interface WizardStep {
  id: number;
  title: string;
}

interface WizardProgressStepperProps {
  id?: string;
  currentStep: number;
  steps: WizardStep[];
  ariaLabel: string;
}

/**
 * Horizontal step bar shared by the full-height scheduling workflows (Generate Schedule,
 * Assign Instructors). Styles: `.workflow-progress` in styles/scheduler-dialogs.css.
 */
export default function WizardProgressStepper({
  id,
  currentStep,
  steps,
  ariaLabel,
}: WizardProgressStepperProps) {
  return (
    <nav
      id={id}
      aria-label={ariaLabel}
      className="workflow-progress"
      style={{ "--workflow-step-count": steps.length } as CSSProperties}
    >
      <ol>
        {steps.map((item) => {
          const isComplete = currentStep > item.id;
          return (
            <li
              key={item.id}
              aria-current={currentStep === item.id ? "step" : undefined}
              data-complete={isComplete}
            >
              <span className="workflow-step-number" aria-hidden="true">
                {isComplete ? <Check size={13} strokeWidth={3} /> : item.id}
              </span>
              <span className="workflow-step-title">{item.title}</span>
            </li>
          );
        })}
      </ol>
      <span className="workflow-step-count" aria-hidden="true">
        Step {currentStep} of {steps.length}
      </span>
    </nav>
  );
}
