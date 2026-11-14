import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { modalButton, modalError, modalHint, modalLabel, modalNotice } from './modalStyles';

interface ModalButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof modalButton;
  /** Shows the spinner and blocks the button while its action runs. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

/** Footer and in-body action button. Cancel/Close is `secondary`; the one main action is `primary` or `danger`. */
export function ModalButton({ variant = 'secondary', loading = false, disabled, className = '', children, type = 'button', ...rest }: ModalButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} className={`${modalButton[variant]} ${className}`} {...rest}>
      {loading && <LoadingSpinner size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

interface ModalFieldProps {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  /** Announce the error when it appears; off for fields that validate on every keystroke. */
  announceError?: boolean;
  className?: string;
  children: ReactNode;
}

/** Label, control, then either the validation message or the helper text. The error is `${htmlFor}-error` for `aria-describedby`. */
export function ModalField({ label, htmlFor, required = false, hint, error, announceError = false, className = '', children }: ModalFieldProps) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className={modalLabel}>
        {label}
        {required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </Label>
      {children}
      {error
        ? <p id={htmlFor ? `${htmlFor}-error` : undefined} role={announceError ? 'alert' : undefined} className={modalError}>{error}</p>
        : hint && <p className={modalHint}>{hint}</p>}
    </div>
  );
}

const noticeIcon = { error: AlertCircle, warning: AlertTriangle, info: Info, success: CheckCircle2 } as const;

/** Inline message inside a dialog body: a failed save, a warning before a risky action, or a short note. */
export function ModalNotice({ tone = 'info', role, className = '', children }: { tone?: keyof typeof modalNotice; role?: 'alert' | 'status'; className?: string; children: ReactNode }) {
  const Icon = noticeIcon[tone];
  return (
    <div role={role} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium leading-5 ${modalNotice[tone]} ${className}`}>
      <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Centered loading or empty message for a dialog region that has nothing to list yet. */
export function ModalState({ loading = false, title, children, icon }: { loading?: boolean; title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div role={loading ? 'status' : undefined} className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {loading ? <LoadingSpinner size={20} className="animate-spin text-[#C9952A]" /> : icon && <span className="text-slate-300" aria-hidden="true">{icon}</span>}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {children && <p className="max-w-xs text-xs leading-5 text-slate-500">{children}</p>}
    </div>
  );
}
