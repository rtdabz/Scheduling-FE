import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  className?: string;
  /** Extra classes for the scrolling body, e.g. to lay out a pinned table region. */
  bodyClassName?: string;
  /** Header background; defaults to the solid maroon every other dialog uses. */
  headerClassName?: string;
  inert?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-7xl',
  full: 'max-w-[calc(100vw-2rem)]',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className = '',
  bodyClassName = '',
  headerClassName = 'bg-[#4e0a10]',
  inert = false,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, isOpen, onClose]);

  useModalScrollLock(isOpen);

  // Move focus into the dialog when it opens (unless a child already took it) and return it
  // to the element that opened it when it closes. Like the existing room dialogs, the first
  // control receives focus unless a child marks another with `data-autofocus`.
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isOpen || inert) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus();
    }
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen, inert]);

  if (!isOpen) return null;

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) onClose();
  };

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-2 animate-in fade-in duration-200 sm:items-center sm:p-4"
      onMouseDown={handleOverlayClick}
      role="presentation"
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
        className={`flex max-h-[calc(100dvh-1rem)] w-full ${sizeClasses[size]} flex-col overflow-hidden rounded-xl bg-[#F7F4F0] outline-none animate-in zoom-in-95 duration-200 sm:max-h-[calc(100vh-2rem)] ${className}`}
        role="dialog"
        inert={inert || undefined}
        aria-hidden={inert || undefined}
        aria-modal={inert ? undefined : true}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
      >
        {(title || description || showCloseButton) && (
          <header className={`flex shrink-0 items-start justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4 ${headerClassName}`}>
            <div className="min-w-0">
              {title && <h2 id={titleId} className="text-base font-bold leading-6 text-white">{title}</h2>}
              {description && <p id={descriptionId} className="mt-1 break-words text-sm leading-5 text-amber-100/75">{description}</p>}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#C9952A]"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            )}
          </header>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto bg-[#F7F4F0] ${bodyClassName}`}>{children}</div>

        {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-black/5 bg-[#F7F4F0] px-4 py-3 sm:px-5 sm:py-4">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
