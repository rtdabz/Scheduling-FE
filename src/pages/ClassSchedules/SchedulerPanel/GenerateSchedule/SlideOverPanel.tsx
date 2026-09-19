import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Long enough to read as a slide, short enough never to feel like a wait. */
const TRANSITION_MS = 200;

/** Closes the panel, running `then` (default: `onClose`) once it has slid out. */
export type CloseSlideOver = (then?: () => void) => void;

const prefersMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The right-hand slide-over the Setup Courses step opens: a course's
 * Configure panel and the Default Settings. Portaled to document.body so it
 * sits outside the wizard modal, mirroring the navigation sidebar on the left.
 *
 * It slides in and out briefly -- a transform and an opacity fade, nothing
 * that repaints while scrolling (the old backdrop blur did) -- and closes at
 * once when the user prefers reduced motion. Its body contains its own
 * scroll, so reaching the end never scrolls the modal behind it.
 */
export default function SlideOverPanel({
  ariaLabel,
  icon,
  heading,
  subheading,
  onClose,
  footer,
  children,
}: {
  ariaLabel: string;
  icon: ReactNode;
  heading: ReactNode;
  subheading?: ReactNode;
  onClose: () => void;
  /** The footer's buttons; given `close` so Cancel and Apply slide out too. */
  footer: ReactNode | ((close: CloseSlideOver) => ReactNode);
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // Mounted closed, then opened on the next frame so the slide-in runs.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(frame);
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
      window.setTimeout(finish, TRANSITION_MS);
    },
    [closing, onClose],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[70] flex justify-end bg-slate-950/40 transition-opacity duration-200 ease-out motion-reduce:transition-none ${
        open ? "opacity-100" : "opacity-0"
      }`}
      onClick={() => close()}
      role="presentation"
    >
      <aside
        role="region"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className={`relative flex h-screen w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out will-change-transform motion-reduce:transition-none ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 bg-[#4e0a10] px-5 py-4 text-white shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#F5C842]">
              {icon}
            </span>
            <div className="min-w-0">
              {heading}
              {subheading && (
                <p className="mt-0.5 truncate text-xs font-medium text-white/75">{subheading}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => close()}
            aria-label="Close sidebar"
            className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-5">{children}</div>

        <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          {typeof footer === "function" ? footer(close) : footer}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
