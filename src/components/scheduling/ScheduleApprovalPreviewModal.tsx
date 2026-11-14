import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import Modal from '../ui/Modal';
import { ModalButton } from '../ui/ModalForm';
import { buildSchedulePdf, getSchedulePdfFilename, type SchedulePdfInput } from '../../pages/ClassSchedules/SchedulerPanel/schedulePdf';
import { createPdfPreview } from '../../lib/pdfPreview';

type PreviewStatus = 'pending' | 'approved' | 'rejected';

interface Props {
  open: boolean;
  title: string;
  /** The header badge appears only when a label is given; approval previews show status in their details instead. */
  status?: PreviewStatus;
  statusLabel?: string;
  printInput: SchedulePdfInput | null;
  isLoading?: boolean;
  canAct: boolean;
  checks?: ReactNode;
  /** Controls beside the close button, such as a View Details button. */
  headerActions?: ReactNode;
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
  open, title, status = 'pending', statusLabel, printInput, isLoading = false, canAct, checks, headerActions, approveBlockedReason = null, onApprove, onReject, onClose,
  inert = false, closeOnEscape = false, emptyMessage = 'This department has no schedule entries.',
}: Props) {
  const [pdf, setPdf] = useState<PdfState>({ url: null, failed: false });
  // Live queue refreshes hand over a new printInput object even when nothing printed changed. Keying the
  // build on its content stops each refresh from cancelling and restarting a document that is still
  // being generated, which could leave the preview stuck on "Preparing" while updates keep arriving.
  const inputKey = useMemo(() => (open && printInput ? JSON.stringify(printInput) : null), [open, printInput]);
  const latestInput = useRef(printInput);
  latestInput.current = printInput;

  useEffect(() => {
    const input = latestInput.current;
    if (inputKey === null || !input) return undefined;
    let cancelled = false;
    let release: (() => void) | undefined;
    buildSchedulePdf(input)
      .then(async (blob) => {
        if (cancelled) return;
        const preview = await createPdfPreview(blob, getSchedulePdfFilename(input));
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

    // A real content change must never leave a reviewer looking at the outdated document.
    return () => {
      cancelled = true;
      release?.();
      setPdf({ url: null, failed: false });
    };
  }, [inputKey]);

  if (!open) return null;
  const badge = status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200';
  const isEmpty = !isLoading && (!printInput || printInput.allSchedules.length === 0);

  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="xl" inert={inert} closeOnEscape={closeOnEscape} closeOnOverlayClick={false}
      closeLabel="Close preview" className="h-[95dvh]" bodyClassName="flex flex-col" footerClassName="!justify-between"
      headerActions={(statusLabel || headerActions) && <>
        {statusLabel && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${badge}`}>{statusLabel}</span>}
        {headerActions}
      </>}
      footer={<>
        <div className="flex flex-wrap gap-2.5">
          {canAct && <>
            <ModalButton variant="primary" onClick={onApprove} disabled={approveBlockedReason !== null} title={approveBlockedReason ?? undefined}><Check size={16} /> Approve</ModalButton>
            <ModalButton variant="dangerOutline" onClick={onReject}>Reject</ModalButton>
          </>}
        </div>
        <ModalButton onClick={onClose}>Close</ModalButton>
      </>}>
      {checks && <div className="shrink-0 border-b border-slate-200 bg-white">{checks}</div>}
      <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-100">
        {isEmpty ? (
          <p className="px-5 text-center text-sm text-slate-500">{emptyMessage}</p>
        ) : pdf.failed ? (
          <p role="alert" className="px-5 text-center text-sm font-medium text-red-600">The schedule document could not be generated.</p>
        ) : pdf.url ? (
          <iframe title={`${title} print preview`} src={pdf.url} className="h-full w-full border-0" />
        ) : (
          <div role="status" className="flex items-center gap-2 text-sm text-slate-500"><LoadingSpinner size={16} className="animate-spin" /> Preparing schedule document…</div>
        )}
      </div>
    </Modal>
  );
}
