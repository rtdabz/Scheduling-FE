import TopBar from "./TopBar";
import FacultyPanel from "./FacultyPanel";
import CourseBank from "./CourseBank";
import TimetableGrid from "./TimetableGrid";
import WideTimetableGrid from "./TimetableGrid/WideTimetableGrid";
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
    <div className="flex flex-col gap-4 w-full text-slate-800 antialiased">
      <TopBar
        {...scheduler}
        onPrint={() => scheduler.setIsPrintModalOpen(true)}
        onImport={() => setIsImportModalOpen(true)}
        onGenerate={generateSchedule.openModal}
        isGenerateDisabled={!scheduler.selectedSectionId || !scheduler.isEditable}
      />

      <div className="flex flex-col lg:flex-row gap-4 w-full min-h-[560px] lg:h-[calc(100vh-180px)] lg:min-h-[560px] overflow-hidden">
        <FacultyPanel {...scheduler} />
        {!scheduler.isWideView && <CourseBank {...scheduler} />}
        {scheduler.isWideView ? (
          <WideTimetableGrid {...scheduler} activeTermText={scheduler.activeTermText} />
        ) : (
          <TimetableGrid {...scheduler} activeTermText={scheduler.activeTermText} />
        )}
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
        isApplying={generateSchedule.isApplying}
        progressStep={generateSchedule.progressStep}
        errorMessage={generateSchedule.errorMessage}
        baseSchedules={generateSchedule.baseSchedules}
        preferredTimeBlock={generateSchedule.preferredTimeBlock}
        setPreferredTimeBlock={generateSchedule.setPreferredTimeBlock}

        splitMinorEnabled={generateSchedule.splitMinorEnabled}
        setSplitMinorEnabled={generateSchedule.setSplitMinorEnabled}
        selectedMinorCourseIds={generateSchedule.selectedMinorCourseIds}
        setSelectedMinorCourseIds={generateSchedule.setSelectedMinorCourseIds}
        sectionId={scheduler.selectedSectionId}
        sectionName={selectedSection?.name ?? ""}
        availableCourses={scheduler.sectionCourses}
        allCourses={scheduler.subjects}
        onClose={generateSchedule.closeModal}
        onGenerate={generateSchedule.generate}
        onApplySchedule={generateSchedule.applySchedule}
        rooms={scheduler.rooms}
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
