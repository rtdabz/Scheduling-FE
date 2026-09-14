import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import { buildSchedulePdf, type SchedulePdfInput } from '../../pages/ClassSchedules/SchedulerPanel/schedulePdf';

type PreviewStatus = 'pending' | 'approved' | 'rejected';

interface Props {
  open: boolean;
  title: string;
  status: PreviewStatus;
  statusLabel: string;
  /** Exactly what Print receives, already narrowed to the submission under review. */
  printInput: SchedulePdfInput | null;
  canAct: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}

type PdfState = { url: string | null; failed: boolean };

/**
 * The approval preview is the printed schedule itself.
 *
 * It used to be an HTML imitation of the print that drifted from it: one row
 * per meeting instead of combined days, its own unit maths, and mis-encoded
 * dashes. Embedding the PDF that Print generates means an approver reviews the
 * same document that will be printed and signed.
 */
export default function ScheduleApprovalPreviewModal({
  open, title, status, statusLabel, printInput, canAct, onApprove, onReject, onClose,
}: Props) {
  const [pdf, setPdf] = useState<PdfState>({ url: null, failed: false });

  useEffect(() => {
    if (!open || !printInput) return undefined;
    let cancelled = false;
    let objectUrl: string | null = null;
    buildSchedulePdf(printInput)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdf({ url: objectUrl, failed: false });
      })
      .catch(() => {
        if (!cancelled) setPdf({ url: null, failed: true });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPdf({ url: null, failed: false });
    };
  }, [open, printInput]);

  if (!open) return null;
  const badge = status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200';
  const isEmpty = !printInput || printInput.allSchedules.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
      <div className="flex h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-gray-300 bg-[#F7F4F0] shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-300 bg-white px-5 py-3">
          <div className="flex items-center gap-3"><h2 className="font-serif text-lg font-bold text-[#1A1410]">{title}</h2><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${badge}`}>{statusLabel}</span></div>
          <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-100">
          {isEmpty ? (
            <p className="text-sm italic text-gray-500">This department has no schedule entries.</p>
          ) : pdf.failed ? (
            <p className="text-sm text-red-600">The schedule document could not be generated.</p>
          ) : pdf.url ? (
            <iframe title={`${title} print preview`} src={pdf.url} className="h-full w-full border-0" />
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500"><LoadingSpinner size={16} className="animate-spin" /> Preparing schedule document…</div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-gray-300 bg-white px-5 py-3"><div className="flex gap-2">{canAct && <><button type="button" onClick={onApprove} className="inline-flex items-center gap-1 rounded-lg bg-[#4e0a10] px-4 py-2 text-xs font-bold text-white hover:bg-[#C9952A]"><Check size={14} /> Approve</button><button type="button" onClick={onReject} className="rounded-lg border border-red-500 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50">Reject</button></>}</div><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">Close</button></div>
      </div>
    </div>
  );
}
