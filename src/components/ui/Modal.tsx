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
  /** sm 384px (confirmations) · md 512px (short forms) · form 672px (two-column forms) · lg 768px · wide 1024px (tables) · xl 1280px · full. */
  size?: 'sm' | 'md' | 'form' | 'lg' | 'wide' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  /** Id of the dialog element, for guided tours that point at the whole dialog. */
  id?: string;
  className?: string;
  /** Extra classes for the scrolling body, e.g. to lay out a pinned table region. */
  bodyClassName?: string;
  /** Header background; defaults to the solid maroon every other dialog uses. */
  headerClassName?: string;
  /** Extra classes for the footer bar, e.g. to tighten its padding. */
  footerClassName?: string;
  /** Title text classes for the default appearance, e.g. to enlarge a title without a description. */
  titleClassName?: string;
  inert?: boolean;
  /** Opt in to the scheduler's lighter workflow presentation. */
  appearance?: 'default' | 'workflow';
  /** Header badge: gold-on-maroon by default, the neutral tile in the workflow appearance. */
  icon?: ReactNode;
  /** Replaces the icon badge with custom header media, e.g. a profile photo. */
  leading?: ReactNode;
  /** Controls placed beside the close button, e.g. a status badge or a View Details button. */
  headerActions?: ReactNode;
  eyebrow?: string;
  busy?: boolean;
  closeLabel?: string;
  role?: 'dialog' | 'alertdialog';
  /** Preserve the original opener when an asynchronous action temporarily takes focus. */
  returnFocusTo?: HTMLElement | null;
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"]):not(:disabled)';
const focusableElements = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
  .filter((element) => !element.closest('[inert], [hidden], [aria-hidden="true"]'));
const topDialog = () => Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]'))
  .filter((element) => !element.closest('[inert], [aria-hidden="true"]')).at(-1);

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  form: 'max-w-2xl',
  lg: 'max-w-3xl',
  wide: 'max-w-5xl',
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
  id,
  className = '',
  bodyClassName = '',
  headerClassName = 'bg-[#4e0a10]',
  footerClassName = '',
  titleClassName = 'text-base font-bold leading-6 text-white',
  inert = false,
  appearance = 'default',
  icon,
  leading,
  headerActions,
  eyebrow,
  busy = false,
  closeLabel = 'Close modal',
  role = 'dialog',
  returnFocusTo,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const workflow = appearance === 'workflow';
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen || !closeOnEscape || busy || inert) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && topDialog() === dialogRef.current) {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, closeOnEscape, inert, isOpen, onClose]);

  useModalScrollLock(isOpen);

  // Move focus into the dialog when it opens (unless a child already took it) and return it
  // to the element that opened it when it closes. Like the existing room dialogs, the first
  // control receives focus unless a child marks another with `data-autofocus`.
  useEffect(() => {
    if (!isOpen || inert) return;
    const opener = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      const controls = focusableElements(dialog);
      (controls.find((control) => control.hasAttribute('data-autofocus')) ?? controls[0] ?? dialog).focus();
    }
    return () => {
      const target = opener?.isConnected ? opener : opener?.id ? document.getElementById(opener.id) : null;
      target?.focus();
    };
  }, [isOpen, inert, returnFocusTo]);

  useEffect(() => {
    if (isOpen && busy && !inert && topDialog() === dialogRef.current) dialogRef.current?.focus();
  }, [isOpen, busy, inert]);

  if (!isOpen) return null;

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!busy && !inert && closeOnOverlayClick && event.target === event.currentTarget) onClose();
  };

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    if (topDialog() !== dialogRef.current) return;
    const focusable = focusableElements(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
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
      className={`fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-2 animate-in fade-in duration-200 sm:items-center sm:p-4 ${workflow ? 'scheduler-dialog-overlay' : ''}`}
      onMouseDown={handleOverlayClick}
      role="presentation"
    >
      <section
        ref={dialogRef}
        id={id}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
        className={`flex max-h-[calc(100dvh-1rem)] w-full ${sizeClasses[size]} flex-col overflow-hidden rounded-xl bg-[#F7F4F0] shadow-2xl outline-none animate-in zoom-in-95 duration-200 sm:max-h-[calc(100vh-2rem)] ${workflow ? 'scheduler-dialog' : ''} ${className}`}
        role={role}
        inert={inert || undefined}
        aria-hidden={inert || undefined}
        aria-modal={inert ? undefined : true}
        aria-busy={busy || undefined}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
      >
        {(title || description || showCloseButton) && (
          <header className={`flex shrink-0 items-start justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4 ${workflow ? 'scheduler-dialog-header' : headerClassName}`}>
            {leading}
            {!leading && icon && <div className={workflow ? 'scheduler-dialog-icon' : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#C9952A]/40 bg-[#39060b] text-[#C9952A]'} aria-hidden="true">{icon}</div>}
            <div className="min-w-0 flex-1">
              {workflow && eyebrow && <p className="scheduler-dialog-eyebrow">{eyebrow}</p>}
              {title && <h2 id={titleId} className={workflow ? 'scheduler-dialog-title' : titleClassName}>{title}</h2>}
              {description && <p id={descriptionId} className={workflow ? 'scheduler-dialog-description' : 'mt-1 break-words text-sm leading-5 text-amber-100/75'}>{description}</p>}
            </div>
            {headerActions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{headerActions}</div>}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className={workflow ? 'scheduler-dialog-close' : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'}
                aria-label={closeLabel}
              >
                <X size={16} />
              </button>
            )}
          </header>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto ${workflow ? 'scheduler-dialog-content' : 'bg-[#F7F4F0]'} ${bodyClassName}`}>{children}</div>

        {footer && <footer className={`flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-black/5 bg-[#F7F4F0] px-4 py-3 sm:px-5 sm:py-4 ${workflow ? 'scheduler-dialog-footer' : ''} ${footerClassName}`}>{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
