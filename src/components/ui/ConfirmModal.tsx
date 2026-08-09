import { createPortal } from 'react-dom';
import { X, AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  eyebrow?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info' | 'maroon';
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
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const iconColors = {
    danger: 'bg-red-50 text-red-600 border-red-100',
    warning: 'bg-amber-50 text-amber-600 border-amber-100',
    info: 'bg-blue-50 text-blue-600 border-blue-100',
    maroon: 'bg-[#4e0a10]/10 text-[#4e0a10] border-[#4e0a10]/20',
  };

  const confirmColors = {
    danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500 text-white',
    info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white',
    maroon: 'bg-[#4e0a10] hover:bg-[#C9952A] focus:ring-[#4e0a10] text-white',
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="flex w-full max-w-lg flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200" style={{ borderRadius: 10 }}>
        <div className="flex items-start gap-4 px-5 pb-4 pt-5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center border ${iconColors[variant]}`} style={{ borderRadius: 8 }}>
            {variant === 'danger' || variant === 'warning' ? (
              <AlertTriangle size={20} />
            ) : (
              <HelpCircle size={20} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b0f1a]">{eyebrow}</p>
            <h3 className="mt-1 text-base font-bold leading-6 text-slate-950">{title}</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{message}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 w-8 items-center justify-center bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            style={{ borderRadius: 8 }}
            aria-label="Close confirmation"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-100"
            style={{ borderRadius: 8 }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 text-xs font-bold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmColors[variant]}`}
            style={{ borderRadius: 8 }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
