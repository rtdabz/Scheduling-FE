import { useId, type ReactNode } from 'react';
import Modal from '../ui/Modal';
import { ModalButton, ModalField } from '../ui/ModalForm';
import { modalBody, modalTextarea } from '../ui/modalStyles';

export default function ScheduleRejectionModal({
  open, title, description, reason, error, isSubmitting, onReasonChange, onClose, onConfirm,
  reasonLabel = 'Reason', confirmLabel = 'Confirm Return', submittingLabel = 'Returning...',
  maxLength, closeOnEscape = false, confirmDisabled = false,
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
  /** Blocks confirming while keeping the reason editable, e.g. while the data being returned reloads. */
  confirmDisabled?: boolean;
}) {
  const id = useId();

  return (
    <Modal isOpen={open} onClose={onClose} title={title} busy={isSubmitting} closeLabel="Close"
      closeOnEscape={closeOnEscape} closeOnOverlayClick={false}
      footer={<>
        <ModalButton onClick={onClose} disabled={isSubmitting}>Cancel</ModalButton>
        <ModalButton variant="danger" onClick={onConfirm} disabled={isSubmitting || confirmDisabled}>{isSubmitting ? submittingLabel : confirmLabel}</ModalButton>
      </>}>
      <div className={modalBody}>
        <div className="text-sm leading-6 text-slate-600">{description}</div>
        <ModalField label={reasonLabel} htmlFor={`${id}-reason`} required error={error} announceError>
          <textarea id={`${id}-reason`} rows={4} value={reason} onChange={event => onReasonChange(event.target.value)}
            aria-required="true" aria-invalid={!!error} aria-describedby={error ? `${id}-reason-error` : undefined}
            maxLength={maxLength} disabled={isSubmitting} placeholder="Explain what needs to change..."
            className={modalTextarea(!!error)} />
        </ModalField>
      </div>
    </Modal>
  );
}
