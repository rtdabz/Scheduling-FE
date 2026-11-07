import type { ComponentProps } from 'react';
import Modal from '../../ui/Modal';
import ImportReviewSummary from './ImportReviewSummary';
import { IMPORT_HEADER_GRADIENT } from './importTheme';

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
      headerClassName={IMPORT_HEADER_GRADIENT}
      footer={(
        <>
          <p className="mr-auto text-xs text-muted">Closing changes nothing. Corrections are made in Preview and Configure.</p>
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-5 text-[13px] font-bold text-white hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">Done</button>
        </>
      )}
    >
      <div className="px-4 py-4 sm:px-6">
        <ImportReviewSummary {...summary} />
      </div>
    </Modal>
  );
}
