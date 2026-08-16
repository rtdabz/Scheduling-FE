import TopBar from "./TopBar";
import CourseBank from "./CourseBank";
import TimetableGrid from "./TimetableGrid";
import WideTimetableGrid from "./TimetableGrid/WideTimetableGrid";
import DropModal from "./Modals/DropModal";
import FacultyModal from "./Modals/FacultyModal";
import ClearAllModal from "./Modals/ClearAllModal";
import SubmitApprovalModal from "./Modals/SubmitApprovalModal";
import WithdrawSubmissionModal from "./Modals/WithdrawSubmissionModal";
import RoomViewModal from "./Modals/RoomViewModal";
import PrintSchedule from "./PrintSchedule";
import ScheduleImportModal from "./Modals/ScheduleImportModal";
import GenerateScheduleModal from "./GenerateSchedule/GenerateScheduleModal";
import YearLevelGenerateScheduleModal from "./GenerateSchedule/YearLevelGenerateScheduleModal";
import AutoAssignModal from "./Modals/AutoAssignModal";
import { useState } from "react";
import { useScheduler } from "./hooks/useScheduler";
import { useGenerateSchedule } from "./GenerateSchedule/useGenerateSchedule";

export default function SchedulerPanel() {
  const scheduler = useScheduler();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isYearLevelGenerateOpen, setIsYearLevelGenerateOpen] = useState(false);
  const [isAutoAssignOpen, setIsAutoAssignOpen] = useState(false);

  const generateSchedule = useGenerateSchedule({
    onAccepted: scheduler.handleAcceptedRecommendation,
    existingSchedules: scheduler.sectionSchedules
  });

  const selectedSection = scheduler.sections.find((s) => s.id === scheduler.selectedSectionId);

  return (
    <div className="flex flex-col gap-4 w-full text-slate-800 antialiased">
      <TopBar
        {...scheduler}
        onPrint={() => scheduler.setIsPrintModalOpen(true)}
        onImport={() => setIsImportModalOpen(true)}
        onGenerate={generateSchedule.openModal}
        onGenerateYearLevel={() => setIsYearLevelGenerateOpen(true)}
        isGenerateDisabled={!scheduler.isEditable}
        isSectionGenerateDisabled={!scheduler.selectedSectionId}
        onAutoAssign={() => setIsAutoAssignOpen(true)}
      />

      <div className="flex flex-col lg:flex-row gap-4 w-full min-h-[560px] lg:h-[calc(100vh-180px)] lg:min-h-[560px] overflow-hidden">
        {!scheduler.isWideView && <CourseBank {...scheduler} />}
        {scheduler.isWideView ? (
          <WideTimetableGrid {...scheduler} activeTermText={scheduler.activeTermText} />
        ) : (
          <TimetableGrid {...scheduler} activeTermText={scheduler.activeTermText} />
        )}
      </div>

      <DropModal {...scheduler} />
      <FacultyModal {...scheduler} />
      <AutoAssignModal
        isOpen={isAutoAssignOpen}
        onClose={() => setIsAutoAssignOpen(false)}
        schedules={scheduler.schedules}
        subjects={scheduler.subjects}
        faculties={scheduler.faculties}
        departmentId={selectedSection?.departmentId ?? null}
        facultyActionSlotId={scheduler.facultyActionSlotId}
        canManageScheduleFaculty={scheduler.canManageScheduleFaculty}
        checkFacultyConflict={scheduler.checkFacultyConflict}
        onAssign={scheduler.handleBulkFacultyAssign}
      />
      <SubmitApprovalModal {...scheduler} />
      <WithdrawSubmissionModal
        isOpen={scheduler.isWithdrawSubmissionModalOpen}
        sections={scheduler.departmentSectionProgress}
        selectedSectionId={scheduler.selectedSectionId}
        withdrawalStage={scheduler.departmentWithdrawalStage}
        isWithdrawing={scheduler.isWithdrawingSubmission}
        onConfirm={scheduler.confirmWithdrawSubmission}
        onCancel={scheduler.cancelWithdrawSubmission}
      />
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
        existingSchedules={scheduler.sectionSchedules}
        preferredTimeBlock={generateSchedule.preferredTimeBlock}
        setPreferredTimeBlock={generateSchedule.setPreferredTimeBlock}

        splitSessionEnabled={generateSchedule.splitSessionEnabled}
        setSplitSessionEnabled={generateSchedule.setSplitSessionEnabled}
        selectedSplitSessionCourseIds={generateSchedule.selectedSplitSessionCourseIds}
        setSelectedSplitSessionCourseIds={generateSchedule.setSelectedSplitSessionCourseIds}
        selectedGecCourseIds={generateSchedule.selectedGecCourseIds}
        setSelectedGecCourseIds={generateSchedule.setSelectedGecCourseIds}
        sectionId={scheduler.selectedSectionId}
        sectionName={selectedSection?.name ?? ""}
        availableCourses={scheduler.sectionCourses}
        allCourses={scheduler.subjects}
        onClose={generateSchedule.closeModal}
        onGenerate={generateSchedule.generate}
        onApplySchedule={generateSchedule.applySchedule}
        rooms={scheduler.rooms}
      />
      <YearLevelGenerateScheduleModal
        isOpen={isYearLevelGenerateOpen}
        onClose={() => setIsYearLevelGenerateOpen(false)}
        sections={scheduler.sections}
        courses={scheduler.subjects}
        activeTerm={scheduler.activeTerm}
        departmentId={selectedSection?.departmentId ?? scheduler.sections[0]?.departmentId ?? null}
        existingSchedules={scheduler.schedules}
        onAccepted={scheduler.handleAcceptedRecommendation}
      />
      <ClearAllModal {...scheduler} />
      <PrintSchedule
        sections={scheduler.sections}
        departments={scheduler.departments}
        isPrintModalOpen={scheduler.isPrintModalOpen}
        setIsPrintModalOpen={scheduler.setIsPrintModalOpen}
        allSchedules={scheduler.schedules}
        selectedSectionId={scheduler.selectedSectionId}
      />
    </div>
  );
}
