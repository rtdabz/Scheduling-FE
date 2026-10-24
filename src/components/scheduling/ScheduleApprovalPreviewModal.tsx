import { useEffect, useState, type ReactNode } from 'react';
import { X, Check } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import { buildSchedulePdf, getSchedulePdfFilename, type SchedulePdfInput } from '../../pages/ClassSchedules/SchedulerPanel/schedulePdf';
import { createPdfPreview } from '../../lib/pdfPreview';
import { useModalScrollLock } from '../../hooks/useModalScrollLock';

type PreviewStatus = 'pending' | 'approved' | 'rejected';

interface Props {
  open: boolean;
  title: string;
  status: PreviewStatus;
  statusLabel: string;
  printInput: SchedulePdfInput | null;
  isLoading?: boolean;
  canAct: boolean;
  checks?: ReactNode;
  approveBlockedReason?: string | null;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
  inert?: boolean;
  closeOnEscape?: boolean;
  emptyMessage?: string;
}

type PdfState = { url: string | null; failed: boolean };

export default function ScheduleApprovalPreviewModal({
  open, title, status, statusLabel, printInput, isLoading = false, canAct, checks, approveBlockedReason = null, onApprove, onReject, onClose,
  inert = false, closeOnEscape = false, emptyMessage = 'This department has no schedule entries.',
}: Props) {
  const [pdf, setPdf] = useState<PdfState>({ url: null, failed: false });
  useModalScrollLock(open);
  useEffect(() => {
    if (!open || !closeOnEscape || inert) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open, closeOnEscape, inert, onClose]);

  useEffect(() => {
    if (!open || !printInput) return undefined;
    let cancelled = false;
    let release: (() => void) | undefined;
    buildSchedulePdf(printInput)
      .then(async (blob) => {
        if (cancelled) return;
        const preview = await createPdfPreview(blob, getSchedulePdfFilename(printInput));
        if (cancelled) {
          preview.dispose();
          return;
        }
        release = preview.dispose;
        setPdf({ url: preview.url, failed: false });
      })
      .catch(() => {
        if (!cancelled) setPdf({ url: null, failed: true });
      });

    return () => {
      cancelled = true;
      release?.();
      setPdf({ url: null, failed: false });
    };
  }, [open, printInput]);

  if (!open) return null;
  const badge = status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200';
  const isEmpty = !isLoading && (!printInput || printInput.allSchedules.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div inert={inert || undefined} role="dialog" aria-label={title} aria-modal={inert ? undefined : true} aria-hidden={inert || undefined} className="flex h-[95dvh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-gray-300 bg-[#F7F4F0] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-300 bg-white px-5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3"><h2 className="font-serif text-lg font-bold text-[#1A1410]">{title}</h2><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${badge}`}>{statusLabel}</span></div>
          <button type="button" onClick={onClose} aria-label="Close preview" className="shrink-0 rounded-lg p-1 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
        </div>
        {checks && <div className="shrink-0 border-b border-gray-300 bg-white">{checks}</div>}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-100">
          {isEmpty ? (
            <p className="px-5 text-sm italic text-gray-500">{emptyMessage}</p>
          ) : pdf.failed ? (
            <p className="text-sm text-red-600">The schedule document could not be generated.</p>
          ) : pdf.url ? (
            <iframe title={`${title} print preview`} src={pdf.url} className="h-full w-full border-0" />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500"><LoadingSpinner size={16} className="animate-spin" /> Preparing schedule document…</div>
          )}
        </div>
        <div className="flex shrink-0 items-center justify-between border-t border-gray-300 bg-white px-5 py-3"><div className="flex gap-2">{canAct && <><button type="button" onClick={onApprove} disabled={approveBlockedReason !== null} title={approveBlockedReason ?? undefined} className="inline-flex items-center gap-1 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-bold text-white hover:bg-[#C9952A] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:bg-slate-300"><Check size={14} /> Approve</button><button type="button" onClick={onReject} className="rounded-lg border border-red-500 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Reject</button></>}</div><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">Close</button></div>
      </div>
    </div>
  );
}
