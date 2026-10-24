import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';

export default function ScheduleRejectionModal({
  open, title, description, reason, error, isSubmitting, onReasonChange, onClose, onConfirm,
  reasonLabel = 'Reason', confirmLabel = 'Confirm Return', submittingLabel = 'Returning...',
  maxLength, closeOnEscape = false,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  reason: string;
  error: string;
  isSubmitting: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  reasonLabel?: string;
  confirmLabel?: string;
  submittingLabel?: string;
  maxLength?: number;
  closeOnEscape?: boolean;
}) {
  const id = useId();
  useModalScrollLock(open);
  useEffect(() => {
    if (!open || !closeOnEscape || isSubmitting) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open, closeOnEscape, isSubmitting, onClose]);
  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
      <div className="bg-[#F7F4F0] border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
          <h3 id={`${id}-title`} className="text-lg font-bold text-gray-800 font-display">{title}</h3>
          <button type="button" aria-label="Close" disabled={isSubmitting} onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer disabled:opacity-50"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
          <div>
            <label htmlFor={`${id}-reason`} className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">{reasonLabel} <span aria-hidden="true" className="text-red-500">*</span></label>
            <textarea id={`${id}-reason`} rows={4} value={reason} onChange={event => onReasonChange(event.target.value)}
              aria-required="true" aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
              maxLength={maxLength} disabled={isSubmitting} placeholder="Explain what needs to change..."
              className={`w-full px-3 py-2 border rounded-xl focus:ring-2 outline-none text-xs bg-white resize-none transition-all ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-[#C9952A]'}`} />
            {error && <p id={`${id}-error`} role="alert" className="text-xs text-red-500 mt-1 font-semibold">{error}</p>}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" disabled={isSubmitting} onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-xs font-semibold cursor-pointer bg-white disabled:opacity-50">Cancel</button>
            <button type="button" disabled={isSubmitting} onClick={onConfirm} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors text-xs font-semibold cursor-pointer disabled:opacity-50">{isSubmitting ? submittingLabel : confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
