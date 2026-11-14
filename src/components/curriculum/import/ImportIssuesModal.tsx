import type { ComponentProps } from 'react';
import Modal from '../../ui/Modal';
import ImportIssuesPanel from './ImportIssuesPanel';
import { ModalButton } from '../../ui/ModalForm';

type ImportIssuesModalProps = ComponentProps<typeof ImportIssuesPanel> & {
  /** One-line state of the check: not validated, changed since, current results, or ready. */
  status: string;
  onClose: () => void;
};

/**
 * Validation findings in a dialog instead of a long inline list: errors to correct, and the notices and
 * information that the final review shows. Nothing here is accepted or dismissed; closing changes nothing.
 */
export default function ImportIssuesModal({ status, onClose, ...panel }: ImportIssuesModalProps) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Validation results"
      description={status}
      size="lg"
      footer={(
        <>
          <p className="mr-auto text-xs text-muted">Corrections are made in Preview and Configure. Closing changes nothing; validate again after editing.</p>
          <ModalButton variant="primary" onClick={onClose}>Done</ModalButton>
        </>
      )}
    >
      <div className="px-4 py-4 sm:px-5">
        <ImportIssuesPanel {...panel} />
        {!panel.checked && (panel.localIssues ?? []).length === 0 && (
          <p className="text-[13px] text-muted">Not validated yet. Validate to run the server checks: existing courses, categories, totals, and class time.</p>
        )}
      </div>
    </Modal>
  );
}
