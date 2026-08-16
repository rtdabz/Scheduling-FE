import { Check } from "lucide-react";

export interface WizardStep {
  id: number;
  title: string;
}

interface WizardProgressStepperProps {
  currentStep: number;
  steps: WizardStep[];
  ariaLabel: string;
}

export default function WizardProgressStepper({
  currentStep,
  steps,
  ariaLabel,
}: WizardProgressStepperProps) {
  return (
    <nav
      className="border border-slate-200 bg-white px-4 py-3 shadow-sm"
      style={{ borderRadius: 8 }}
      aria-label={ariaLabel}
    >
      <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((item, index) => {
          const isCurrent = currentStep === item.id;
          const isComplete = currentStep > item.id;
          const isUpcoming = currentStep < item.id;

          return (
            <li
              key={item.id}
              className="relative flex min-w-0 flex-col items-center text-center"
              aria-current={isCurrent ? "step" : undefined}
            >
              {index > 0 && (
                <span
                  className={`absolute left-0 top-3 h-0.5 w-1/2 -translate-y-1/2 ${
                    currentStep > item.id - 1 ? "bg-[#4e0a10]" : "bg-slate-200"
                  }`}
                  aria-hidden="true"
                />
              )}
              {index < steps.length - 1 && (
                <span
                  className={`absolute right-0 top-3 h-0.5 w-1/2 -translate-y-1/2 ${
                    isComplete ? "bg-[#4e0a10]" : "bg-slate-200"
                  }`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black shadow-sm ${
                  isComplete
                    ? "border-[#4e0a10] bg-[#4e0a10] text-white"
                    : isCurrent
                      ? "border-[#4e0a10] bg-white text-[#4e0a10] ring-2 ring-[#4e0a10]/15"
                      : "border-slate-200 bg-slate-100 text-slate-400"
                }`}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : item.id}
              </span>
              <span className="mt-2 block max-w-full truncate text-xs font-black text-slate-900">
                {item.title}
              </span>
              <span
                className={`mt-0.5 block text-[10px] font-bold ${
                  isComplete
                    ? "text-emerald-600"
                    : isCurrent
                      ? "text-[#4e0a10]"
                      : isUpcoming
                        ? "text-slate-400"
                        : "text-slate-500"
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
