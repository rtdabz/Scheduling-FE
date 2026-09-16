import type { SectionDoneCandidate } from "../types";
import MarkSectionsDoneModal from "./MarkSectionsDoneModal";

interface ClearAllModalProps {
  sectionClearCandidates: SectionDoneCandidate[];
  isClearAllModalOpen: boolean;
  isClearingAll: boolean;
  selectedSectionId: string;
  activeSemesterText: string;
  confirmClearAll: (sectionIds: string[]) => void;
  cancelClearAll: () => void;
}

export default function ClearAllModal({ sectionClearCandidates, isClearAllModalOpen, isClearingAll,
  selectedSectionId, activeSemesterText, confirmClearAll, cancelClearAll }: ClearAllModalProps) {
  if (!isClearAllModalOpen) return null;
  return <MarkSectionsDoneModal
    variant="clear"
    candidates={sectionClearCandidates}
    selectedSectionId={selectedSectionId}
    contextText={activeSemesterText}
    isMarking={isClearingAll}
    onConfirm={confirmClearAll}
    onCancel={cancelClearAll}
  />;
}
