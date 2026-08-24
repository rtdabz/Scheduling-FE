import { createPortal } from 'react-dom';
import { useEffect, useId, type MouseEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';

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
}

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

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-slate-950/45 p-2 backdrop-blur-[2px] animate-in fade-in duration-200 sm:items-center sm:p-4"
      onMouseDown={handleOverlayClick}
      role="presentation"
    >
      <section
        className={`flex max-h-[calc(100dvh-1rem)] w-full ${sizeClasses[size]} flex-col overflow-hidden rounded-xl border border-slate-200 bg-white animate-in zoom-in-95 duration-200 sm:max-h-[calc(100vh-2rem)] ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
      >
        {(title || description || showCloseButton) && (
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
            <div className="min-w-0">
              {title && <h2 id={titleId} className="text-base font-bold leading-6 text-slate-950">{title}</h2>}
              {description && <p id={descriptionId} className="mt-1 break-words text-sm leading-5 text-slate-600">{description}</p>}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#C9952A]"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            )}
          </header>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {footer && <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5 sm:py-4">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}
