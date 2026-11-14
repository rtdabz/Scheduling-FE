import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useWorkflowDialog } from "./useWorkflowDialog";

const TRANSITION_MS = 200;

export type CloseSlideOver = (then?: () => void) => void;

const prefersMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function SlideOverPanel({
  ariaLabel,
  icon,
  heading,
  subheading,
  onClose,
  footer,
  children,
  variant = "sidebar",
}: {
  /** "sidebar" slides in from the right; "modal" opens centered. */
  variant?: "sidebar" | "modal";
  ariaLabel: string;
  icon: ReactNode;
  heading: ReactNode;
  subheading?: ReactNode;
  onClose: () => void;
  footer: ReactNode | ((close: CloseSlideOver) => ReactNode);
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Two frames: the closed state paints first, so the open transition
    // starts from it instead of being skipped or stuttering.
    let inner = 0;
    const outer = window.requestAnimationFrame(() => {
      inner = window.requestAnimationFrame(() => setOpen(true));
    });
    return () => {
      window.cancelAnimationFrame(outer);
      window.cancelAnimationFrame(inner);
    };
  }, []);

  const close = useCallback<CloseSlideOver>(
    (then) => {
      if (closing) return;
      setClosing(true);
      const finish = then ?? onClose;
      if (!prefersMotion()) {
        finish();
        return;
      }
      setOpen(false);
      window.setTimeout(finish, variant === "modal" ? 150 : TRANSITION_MS);
    },
    [closing, onClose, variant],
  );

  useWorkflowDialog(dialogRef, true, close, closing);

  if (typeof document === "undefined") return null;

  const isModal = variant === "modal";

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      className={`scheduler-dialog-overlay fixed inset-0 z-[70] flex bg-slate-950/40 outline-none transition-opacity ${isModal ? "duration-150" : "duration-200"} ease-out motion-reduce:transition-none ${
        open ? "opacity-100" : "opacity-0"
      }`}
      style={
        isModal
          ? { alignItems: "center", justifyContent: "center" }
          : { alignItems: "stretch", justifyContent: "flex-end", padding: 0 }
      }
      onClick={() => close()}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <aside
        role="region"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className={
          isModal
            ? // overflow-hidden clips the tinted header/footer to the rounded
              // corners. Only opacity and a small slide animate (no scale or
              // persistent will-change), which keeps the open smooth.
              `scheduler-dialog relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none ${
                open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
              }`
            : `scheduler-dialog relative flex h-[100dvh] w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none ${
                open ? "translate-x-0" : "translate-x-full"
              }`
        }
        style={
          isModal
            ? undefined
            : { maxHeight: "100dvh", borderRadius: "20px 0 0 20px" }
        }
      >
        <header className="scheduler-dialog-header flex shrink-0 items-start justify-between gap-3 px-5 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="scheduler-dialog-icon">
              {icon}
            </span>
            <div className="min-w-0">
              <div className="scheduler-dialog-title">{heading}</div>
              {subheading && (
                <p className="scheduler-dialog-description">{subheading}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => close()}
            aria-label={isModal ? "Close" : "Close sidebar"}
            className="scheduler-dialog-close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-white p-5">{children}</div>

        <footer className="scheduler-dialog-footer flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#e7dfd7] bg-white px-5 py-3">
          {typeof footer === "function" ? footer(close) : footer}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
