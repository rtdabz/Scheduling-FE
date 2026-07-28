import TopBar from "./TopBar";
import FacultyPanel from "./FacultyPanel";
import CourseBank from "./CourseBank";
import TimetableGrid from "./TimetableGrid";
import DropModal from "./Modals/DropModal";
import FacultyModal from "./Modals/FacultyModal";
import ClearAllModal from "./Modals/ClearAllModal";
import SubmitApprovalModal from "./Modals/SubmitApprovalModal";
import RoomViewModal from "./Modals/RoomViewModal";
import PrintSchedule from "./PrintSchedule";
import ScheduleImportModal from "./Modals/ScheduleImportModal";
import GenerateScheduleModal from "./GenerateSchedule/GenerateScheduleModal";
import { useState } from "react";
import { useScheduler } from "./hooks/useScheduler";
import { useGenerateSchedule } from "./GenerateSchedule/useGenerateSchedule";

export default function SchedulerPanel() {
  const scheduler = useScheduler();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const generateSchedule = useGenerateSchedule({
    onAccepted: scheduler.handleAcceptedRecommendation
  });

  const selectedSection = scheduler.sections.find((s) => s.id === scheduler.selectedSectionId);

  return (
    <div className="flex flex-col gap-6 w-full text-slate-800 antialiased">
      <TopBar
        {...scheduler}
        onPrint={() => scheduler.setIsPrintModalOpen(true)}
        onImport={() => setIsImportModalOpen(true)}
        onGenerate={generateSchedule.openModal}
        isGenerateDisabled={!scheduler.selectedSectionId || !scheduler.isEditable}
      />

      <div className="flex flex-col lg:flex-row gap-6 w-full min-h-[640px] lg:h-[calc(100vh-220px)] lg:min-h-[650px] overflow-hidden">
        <FacultyPanel {...scheduler} />
        <CourseBank {...scheduler} />
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
      <GenerateScheduleModal
        isOpen={generateSchedule.isOpen}
        isGenerating={generateSchedule.isGenerating}
        isActingOnId={generateSchedule.isActingOnId}
        recommendations={generateSchedule.recommendations}
        errorMessage={generateSchedule.errorMessage}
        sectionId={scheduler.selectedSectionId}
        sectionName={selectedSection?.name ?? ""}
        subjects={scheduler.subjects}
        rooms={scheduler.rooms}
        onClose={generateSchedule.closeModal}
        onGenerate={generateSchedule.generate}
        onAccept={generateSchedule.accept}
        onReject={generateSchedule.reject}
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
