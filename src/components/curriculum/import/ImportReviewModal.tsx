import type { ComponentProps } from 'react';
import Modal from '../../ui/Modal';
import ImportReviewSummary from './ImportReviewSummary';
import { ModalButton } from '../../ui/ModalForm';

type ImportReviewModalProps = ComponentProps<typeof ImportReviewSummary> & { onClose: () => void };

/** The full generated review (curriculum, courses, changes, categories, notes, notices) in one wide dialog. */
export default function ImportReviewModal({ onClose, ...summary }: ImportReviewModalProps) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Import summary"
      description="What Confirm and import will create, from the server's check of the whole draft."
      size="xl"
      footer={(
        <>
          <p className="mr-auto text-xs text-muted">Closing changes nothing. Corrections are made in Preview and Configure.</p>
          <ModalButton variant="primary" onClick={onClose}>Done</ModalButton>
        </>
      )}
    >
      <div className="px-4 py-4 sm:px-6">
        <ImportReviewSummary {...summary} />
      </div>
    </Modal>
  );
}
