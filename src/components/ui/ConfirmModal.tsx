import { createPortal } from 'react-dom';
import { X, AlertTriangle, HelpCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconColors[variant]}`}>
            {variant === 'danger' || variant === 'warning' ? (
              <AlertTriangle size={20} />
            ) : (
              <HelpCircle size={20} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900 leading-6">{title}</h3>
            <p className="text-xs text-gray-500 mt-1.5 whitespace-pre-line leading-relaxed">{message}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2 text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${confirmColors[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
