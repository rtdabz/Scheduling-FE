import { useEffect, type PropsWithChildren } from 'react';

/**
 * Prevents accidental duplicate activation of native buttons and form submits.
 *
 * The guard is intentionally event-based so it works with existing buttons,
 * including buttons rendered by lazy-loaded pages. Add `data-repeatable-click`
 * to controls such as steppers or other actions where rapid repetition is
 * intentional.
 */
const LOCK_DURATION_MS = 800;

const isOptedOut = (element: Element): boolean =>
  element.hasAttribute('data-repeatable-click') ||
  element.closest('[data-repeatable-click]') !== null;

export default function SingleClickGuard({ children }: PropsWithChildren) {
  useEffect(() => {
    const lockedButtons = new WeakSet<HTMLButtonElement>();
    const lockedForms = new WeakSet<HTMLFormElement>();
    const buttonTimers = new WeakMap<HTMLButtonElement, number>();
    const formTimers = new WeakMap<HTMLFormElement, number>();

    const unlockButton = (button: HTMLButtonElement) => {
      lockedButtons.delete(button);
      const timer = buttonTimers.get(button);
      if (timer !== undefined) window.clearTimeout(timer);
      buttonTimers.delete(button);
    };

    const unlockForm = (form: HTMLFormElement) => {
      lockedForms.delete(form);
      const timer = formTimers.get(form);
      if (timer !== undefined) window.clearTimeout(timer);
      formTimers.delete(form);
    };

    const handleClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest('button');
      if (!(button instanceof HTMLButtonElement) || button.disabled || isOptedOut(button)) return;

      if (lockedButtons.has(button)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      lockedButtons.add(button);
      button.setAttribute('aria-busy', 'true');
      buttonTimers.set(button, window.setTimeout(() => {
        unlockButton(button);
        button.removeAttribute('aria-busy');
      }, LOCK_DURATION_MS));
    };

    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || isOptedOut(form)) return;

      if (lockedForms.has(form)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      lockedForms.add(form);
      formTimers.set(form, window.setTimeout(() => unlockForm(form), LOCK_DURATION_MS));
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('submit', handleSubmit, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('submit', handleSubmit, true);
    };
  }, []);

  return children;
}
