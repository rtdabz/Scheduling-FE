import { useEffect, useRef, type RefObject } from "react";
import { useModalScrollLock } from "../../../../hooks/useModalScrollLock";

const CONTROLS = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]';

/** Keyboard and scroll behavior for the generator's custom workspace and side panels. */
export function useWorkflowDialog(
  dialogRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  busy = false,
) {
  const current = useRef({ onClose, busy });
  useEffect(() => { current.current = { onClose, busy }; }, [onClose, busy]);
  useModalScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const isTopDialog = () => Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
      .filter((element) => !element.closest('[inert], [aria-hidden="true"]')).at(-1) === dialog;
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>(CONTROLS) ?? [])
      .filter((element) => !element.closest('[inert], [hidden], [aria-hidden="true"]'));
    const timer = window.setTimeout(() => {
      if (isTopDialog() && !dialog?.contains(document.activeElement)) (controls()[0] ?? dialog)?.focus({ preventScroll: true });
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isTopDialog() || document.querySelector('[data-wicars-task-tooltip], [data-wicars-guide-recovery]')) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!current.current.busy) current.current.onClose();
      } else if (event.key === "Tab") {
        const elements = controls();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); dialog?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [dialogRef, isOpen]);
}
