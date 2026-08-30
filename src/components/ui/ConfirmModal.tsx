import { AlertTriangle, CheckCircle2, HelpCircle, Pencil, Trash2, X, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';

export type ConfirmModalVariant = 'danger' | 'error' | 'warning' | 'success' | 'update' | 'info' | 'maroon';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  eyebrow?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  variant?: ConfirmModalVariant;
  isConfirming?: boolean;
  showCancel?: boolean;
  children?: ReactNode;
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
  showCancel = true,
  children,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'bg-red-50 text-red-600 ring-red-100',
      eyebrow: 'text-red-700',
      action: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
      border: 'border-t-red-500',
      BodyIcon: AlertTriangle,
      ActionIcon: Trash2,
    },
    error: {
      icon: 'bg-red-50 text-red-600 ring-red-100',
      eyebrow: 'text-red-700',
      action: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
      border: 'border-t-red-500',
      BodyIcon: XCircle,
      ActionIcon: CheckCircle2,
    },
    warning: {
      icon: 'bg-amber-50 text-amber-600 ring-amber-100',
      eyebrow: 'text-amber-700',
      action: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
      border: 'border-t-amber-500',
      BodyIcon: AlertTriangle,
      ActionIcon: CheckCircle2,
    },
    success: {
      icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
      eyebrow: 'text-emerald-700',
      action: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
      border: 'border-t-emerald-500',
      BodyIcon: CheckCircle2,
      ActionIcon: CheckCircle2,
    },
    update: {
      icon: 'bg-blue-50 text-blue-600 ring-blue-100',
      eyebrow: 'text-blue-700',
      action: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
      border: 'border-t-blue-500',
      BodyIcon: Pencil,
      ActionIcon: Pencil,
    },
    info: {
      icon: 'bg-blue-50 text-blue-600 ring-blue-100',
      eyebrow: 'text-blue-700',
      action: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
      border: 'border-t-blue-500',
      BodyIcon: HelpCircle,
      ActionIcon: CheckCircle2,
    },
    maroon: {
      icon: 'bg-[#4e0a10]/10 text-[#4e0a10] ring-[#4e0a10]/15',
      eyebrow: 'text-[#6b0f1a]',
      action: 'bg-[#4e0a10] hover:bg-[#640d14] focus:ring-[#4e0a10]',
      border: 'border-t-[#C9952A]',
      BodyIcon: HelpCircle,
      ActionIcon: CheckCircle2,
    },
  };
  const style = variantStyles[variant];
  const BodyIcon = style.BodyIcon;
  const ActionIcon = style.ActionIcon;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title} size="md" className={`border-t-4 ${style.border}`} footer={
      <>
        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isConfirming}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={14} />
            {cancelLabel}
          </button>
        )}
          <button
            type="button"
            onClick={() => { void onConfirm(); }}
            disabled={isConfirming}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-5 py-2 text-xs font-bold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${style.action}`}
          >
            {isConfirming ? <LoadingSpinner size={14} className="animate-spin" /> : <ActionIcon size={14} />}
            {confirmLabel}
          </button>
      </>
    }>
      <div className="flex items-start gap-4 px-5 py-6">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-4 ${style.icon}`}>
            <BodyIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-[11px] font-bold uppercase ${style.eyebrow}`}>{eyebrow}</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{message}</p>
            {children && <div className="mt-4">{children}</div>}
          </div>
        </div>
    </Modal>
  );
}
