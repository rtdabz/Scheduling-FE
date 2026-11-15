import { AlertTriangle, CheckCircle2, HelpCircle, Pencil, Trash2, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';
import { modalButton } from './modalStyles';
import { buttonClass, type ButtonVariant } from './buttonStyles';

export type ConfirmModalVariant = 'danger' | 'error' | 'warning' | 'success' | 'update' | 'info' | 'maroon';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  eyebrow?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  variant?: ConfirmModalVariant;
  isConfirming?: boolean;
  /** Blocks confirming without showing the in-progress spinner, e.g. while the data being confirmed reloads. */
  confirmDisabled?: boolean;
  showCancel?: boolean;
  children?: ReactNode;
  appearance?: 'default' | 'workflow';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  eyebrow = 'Confirmation Required',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'warning',
  isConfirming = false,
  confirmDisabled = false,
  showCancel = true,
  children,
  appearance = 'default',
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const variantStyles: Record<ConfirmModalVariant, { icon: string; eyebrow: string; action: ButtonVariant; border: string; BodyIcon: typeof AlertTriangle; ActionIcon: typeof AlertTriangle }> = {
    danger: {
      icon: 'bg-red-50 text-red-600 ring-red-100',
      eyebrow: 'text-red-700',
      action: 'danger',
      border: 'border-t-red-500',
      BodyIcon: AlertTriangle,
      ActionIcon: Trash2,
    },
    error: {
      icon: 'bg-red-50 text-red-600 ring-red-100',
      eyebrow: 'text-red-700',
      action: 'danger',
      border: 'border-t-red-500',
      BodyIcon: XCircle,
      ActionIcon: CheckCircle2,
    },
    warning: {
      icon: 'bg-amber-50 text-amber-600 ring-amber-100',
      eyebrow: 'text-amber-700',
      action: 'warning',
      border: 'border-t-amber-500',
      BodyIcon: AlertTriangle,
      ActionIcon: CheckCircle2,
    },
    success: {
      icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
      eyebrow: 'text-emerald-700',
      action: 'success',
      border: 'border-t-emerald-500',
      BodyIcon: CheckCircle2,
      ActionIcon: CheckCircle2,
    },
    update: {
      icon: 'bg-blue-50 text-blue-600 ring-blue-100',
      eyebrow: 'text-blue-700',
      action: 'primary',
      border: 'border-t-blue-500',
      BodyIcon: Pencil,
      ActionIcon: Pencil,
    },
    info: {
      icon: 'bg-blue-50 text-blue-600 ring-blue-100',
      eyebrow: 'text-blue-700',
      action: 'primary',
      border: 'border-t-blue-500',
      BodyIcon: HelpCircle,
      ActionIcon: CheckCircle2,
    },
    maroon: {
      icon: 'bg-[#4e0a10]/10 text-[#4e0a10] ring-[#4e0a10]/15',
      eyebrow: 'text-[#6b0f1a]',
      action: 'primary',
      border: 'border-t-[#C9952A]',
      BodyIcon: HelpCircle,
      ActionIcon: CheckCircle2,
    },
  };
  const style = variantStyles[variant];
  const BodyIcon = style.BodyIcon;
  const ActionIcon = style.ActionIcon;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="md"
      appearance={appearance} busy={isConfirming}
      icon={appearance === 'workflow' ? <BodyIcon size={20} /> : undefined} eyebrow={eyebrow}
      className={appearance === 'workflow' ? '' : `border-t-4 ${style.border}`} footer={
      <>
        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            data-autofocus={appearance === 'workflow' ? true : undefined}
            className={appearance === 'workflow' ? 'scheduler-dialog-button' : modalButton.secondary}
          >
            {cancelLabel}
          </button>
        )}
          <button
            type="button"
            onClick={() => { void onConfirm(); }}
            disabled={isConfirming || confirmDisabled}
            data-variant={appearance === 'workflow' ? (variant === 'danger' ? 'danger' : 'primary') : undefined}
            className={appearance === 'workflow' ? 'scheduler-dialog-button' : buttonClass({ variant: style.action, size: 'lg' })}
          >
            {isConfirming ? <LoadingSpinner size={16} className="animate-spin" /> : <ActionIcon size={16} />}
            {confirmLabel}
          </button>
      </>
    }>
      <div className={appearance === 'workflow' ? 'scheduler-dialog-body' : 'flex items-start gap-4 px-5 py-6'}>
          {appearance !== 'workflow' && <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-4 ${style.icon}`}>
            <BodyIcon size={20} />
          </div>}
          <div className="min-w-0 flex-1">
            {appearance !== 'workflow' && <p className={`text-[11px] font-bold uppercase ${style.eyebrow}`}>{eyebrow}</p>}
            {typeof message === 'string'
              ? <p className={`${appearance === 'workflow' ? '' : 'mt-2 '}whitespace-pre-line text-sm leading-6 text-slate-600`}>{message}</p>
              : <div className={`${appearance === 'workflow' ? '' : 'mt-2 '}text-sm leading-6 text-slate-600`}>{message}</div>}
            {children && <div className="mt-4">{children}</div>}
          </div>
        </div>
    </Modal>
  );
}
