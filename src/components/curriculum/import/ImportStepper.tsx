import { Check } from 'lucide-react';

export interface StepperStep<T extends string> {
  id: T;
  label: string;
  hint: string;
}

interface ImportStepperProps<T extends string> {
  steps: StepperStep<T>[];
  current: T;
  completed: Set<T>;
  isReachable: (id: T) => boolean;
  onSelect: (id: T) => void;
}

/** The four import stages as one track: completed steps are filled, the current one is ringed, later ones are muted. */
export default function ImportStepper<T extends string>({ steps, current, completed, isReachable, onSelect }: ImportStepperProps<T>) {
  return (
    <nav aria-label="Import progress">
      <ol className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 sm:gap-0">
        {steps.map((step, index) => {
          const active = step.id === current;
          const done = completed.has(step.id) && !active;
          const reachable = isReachable(step.id);
          return (
            <li key={step.id} className="relative sm:pr-4">
              {index < steps.length - 1 && (
                <span aria-hidden="true" className={`absolute left-4 right-0 top-[15px] hidden h-0.5 sm:block ${done ? 'bg-primary' : 'bg-border'}`} />
              )}
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(step.id)}
                aria-current={active ? 'step' : undefined}
                className="group relative flex w-full items-start rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed"
              >
                <span
                  className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold tabular-nums transition-colors ${
                    done
                      ? 'border-primary bg-primary text-white'
                      : active
                        ? 'border-primary bg-white text-primary ring-4 ring-primary/10'
                        : 'border-border bg-white text-muted'
                  } ${reachable && !active ? 'group-hover:border-primary-light' : ''}`}
                >
                  {done ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : index + 1}
                </span>
                <span className="relative z-10 min-w-0 bg-white pl-3 pr-3 pt-0.5">
                  <span className={`block text-[13px] font-bold leading-tight ${active ? 'text-primary' : done ? 'text-text' : 'text-muted'}`}>
                    {step.label}
                    {done && <span className="sr-only"> (completed)</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{step.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
