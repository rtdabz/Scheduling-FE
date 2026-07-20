import TopBar from "./TopBar";
import FacultyPanel from "./FacultyPanel";
import SubjectBank from "./SubjectBank";
import TimetableGrid from "./TimetableGrid";
import DropModal from "./Modals/DropModal";
import FacultyModal from "./Modals/FacultyModal";
import ClearAllModal from "./Modals/ClearAllModal";
import SubmitApprovalModal from "./Modals/SubmitApprovalModal";
import RoomViewModal from "./Modals/RoomViewModal";
import PrintSchedule from "./PrintSchedule";
import ScheduleImportModal from "./Modals/ScheduleImportModal";
import { useState } from "react";
import { useScheduler } from "./hooks/useScheduler";

export default function SchedulerPanel() {
  const scheduler = useScheduler();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6 w-full text-slate-800 antialiased">
      <TopBar
        {...scheduler}
        onPrint={() => scheduler.setIsPrintModalOpen(true)}
        onImport={() => setIsImportModalOpen(true)}
      />

      <div className="flex flex-col lg:flex-row gap-6 w-full min-h-[640px] lg:h-[calc(100vh-220px)] lg:min-h-[650px] overflow-hidden">
        <FacultyPanel {...scheduler} />
        <SubjectBank {...scheduler} />
        <TimetableGrid {...scheduler} activeTermText={scheduler.activeTermText} />
      </div>

      <DropModal {...scheduler} />
      <FacultyModal {...scheduler} />
      <ClearAllModal {...scheduler} />
      <SubmitApprovalModal {...scheduler} />
      <RoomViewModal {...scheduler} />
      <ScheduleImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        activeTerm={scheduler.activeTerm}
        selectedSection={scheduler.sections.find((section) => section.id === scheduler.selectedSectionId)}
        departments={scheduler.departments}
      />
      <PrintSchedule
        sections={scheduler.sections}
        isPrintModalOpen={scheduler.isPrintModalOpen}
        setIsPrintModalOpen={scheduler.setIsPrintModalOpen}
        allSchedules={scheduler.schedules}
        selectedSectionId={scheduler.selectedSectionId}
      />
    </div>
  );
}
