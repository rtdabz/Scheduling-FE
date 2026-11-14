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

// Generator palette: deep/primary maroon for progress, amber only as the
// active-step halo, green for the "Completed" status text.
const DEEP = "#4A0D16";
const PRIMARY = "#701522";

export default function WizardProgressStepper({
  id,
  currentStep,
  steps,
  ariaLabel,
}: WizardProgressStepperProps) {
  return (
    <nav id={id} aria-label={ariaLabel}>
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((item, index) => {
          const isCurrent = currentStep === item.id;
          const isComplete = currentStep > item.id;

          return (
            <li
              key={item.id}
              className="relative flex min-w-0 flex-col items-center text-center"
              aria-current={isCurrent ? "step" : undefined}
            >
              {index > 0 && (
                <span
                  className="absolute left-0 top-3.5 h-0.5 w-1/2 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: currentStep >= item.id ? PRIMARY : "#E8DFD6" }}
                  aria-hidden="true"
                />
              )}
              {index < steps.length - 1 && (
                <span
                  className="absolute right-0 top-3.5 h-0.5 w-1/2 -translate-y-1/2 rounded-full"
                  style={{ backgroundColor: isComplete ? PRIMARY : "#E8DFD6" }}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums transition-colors ${
                  isComplete
                    ? "border-transparent text-white"
                    : isCurrent
                      ? "border-transparent text-white ring-[3px] ring-[#F5A623]/35"
                      : "border-[#DDD2C7] bg-[#F7F4F0] text-[#7A6E67]"
                }`}
                style={
                  isComplete
                    ? { backgroundColor: PRIMARY }
                    : isCurrent
                      ? { backgroundColor: DEEP, boxShadow: "0 1px 3px rgb(74 13 22 / 35%)" }
                      : undefined
                }
              >
                {isComplete ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : item.id}
              </span>
              <span
                className={`mt-1.5 block max-w-full truncate text-xs ${
                  isCurrent ? "font-bold text-[#4A0D16]" : isComplete ? "font-semibold text-[#3f342e]" : "font-medium text-[#6b5f57]"
                }`}
              >
                {item.title}
              </span>
              <span
                className={`mt-0.5 block text-[10px] font-semibold uppercase tracking-wide ${
                  isComplete ? "text-emerald-700" : isCurrent ? "text-[#8A5A12]" : "text-[#7A6E67]"
                }`}
              >
                {isComplete ? "Completed" : isCurrent ? "In Progress" : "Pending"}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
