import TopBar from "./TopBar";
import CourseBank from "./CourseBank";
import TimetableGrid from "./TimetableGrid";
import DropModal from "./Modals/DropModal";
import FacultyModal from "./Modals/FacultyModal";
import ClearAllModal from "./Modals/ClearAllModal";
import SubmitApprovalModal from "./Modals/SubmitApprovalModal";
import WithdrawSubmissionModal from "./Modals/WithdrawSubmissionModal";
import RoomViewModal from "./Modals/RoomViewModal";
import PrintSchedule from "./PrintSchedule";
import GenerateScheduleModal from "./GenerateSchedule/GenerateScheduleModal";
import YearLevelGenerateScheduleModal from "./GenerateSchedule/YearLevelGenerateScheduleModal";
import AutoAssignModal from "./Modals/AutoAssignModal";
import OverloadConfirmationModal from "../../../components/faculty/OverloadConfirmationModal";
import { useEffect, useMemo, useState } from "react";
import { useScheduler } from "./hooks/useScheduler";
import { useGenerateSchedule } from "./GenerateSchedule/useGenerateSchedule";
import { useWorkflowGuide } from "../../../hooks/useWorkflowGuide";

interface SchedulerPanelProps {
  autoAssignOnOpen?: boolean;
}

export default function SchedulerPanel({ autoAssignOnOpen = false }: SchedulerPanelProps) {
  const scheduler = useScheduler();
  const plottingGuideSteps = useMemo(() => [
    { element: "#schedule-builder-section", title: "1. Choose a section", description: "Start with one section from the active term. Its courses and timetable will load here.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-generate", title: "2. Generate a proposal", description: "Generate a conflict-checked schedule for the selected section.", side: "bottom" as const, align: "end" as const },
    { element: "#schedule-builder-course-bank-toggle", title: "3. Show the Course Bank", description: "Use this button to show the Course Bank when it is hidden, or hide it when you need more timetable space.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-course-bank", title: "4. Place every course", description: "Select a course and click an empty time slot, or drag it onto the timetable, until every course is placed.", side: "right" as const, align: "start" as const },
    { element: "#schedule-builder-timetable", title: "5. Review conflicts and rooms", description: "Check meeting times, room assignments, and conflict messages. Move or edit a class when corrections are needed.", side: "top" as const },
    { element: "#schedule-builder-next-step", title: "6. Mark plotting complete", description: "When all courses are placed and reviewed, mark the section Done so it can be submitted for approval.", side: "bottom" as const },
  ], []);
  const facultyAssignmentGuideSteps = useMemo(() => [
    { element: "#schedule-builder-section", title: "1. Choose an approved section", description: "Select the approved section whose scheduled classes need instructors.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-workflow", title: "2. Confirm Faculty Assignment", description: "The workflow is now in Faculty Assignment. Plotting is complete, so focus on assigning an eligible instructor to each class.", side: "bottom" as const },
    { element: "#schedule-builder-timetable", title: "3. Open an unassigned class", description: "Select a class in the timetable that has no instructor. Its assignment dialog will show eligible faculty and conflict information.", side: "top" as const },
    { element: "#schedule-builder-auto-assign", title: "4. Use Auto-Assign when appropriate", description: "You may review and apply automatic assignments for eligible classes, then inspect the results before finalizing.", side: "bottom" as const, align: "end" as const },
    { element: "#schedule-builder-next-step", title: "5. Finalize after all assignments", description: "Once every class has an instructor and conflicts are resolved, use the final action to mark the section finalized.", side: "bottom" as const },
  ], []);
  const reviewGuideSteps = useMemo(() => [
    { element: "#schedule-builder-section", title: "1. Choose a section", description: "Select a section to review its current schedule and workflow status.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-workflow", title: "2. Check the workflow stage", description: "Use this progress indicator to see whether plotting, approval, or faculty assignment is complete.", side: "bottom" as const },
    { element: "#schedule-builder-timetable", title: "3. Review the timetable", description: "Inspect the plotted classes, meeting times, rooms, instructors, and any conflict information available for the section.", side: "top" as const },
    { element: "#schedule-builder-next-step", title: "4. Review the next action", description: "This area shows the section status, department readiness, and any action currently available to move the schedule forward.", side: "bottom" as const },
  ], []);
  const plottingActive = ["draft", "revision"].includes(scheduler.currentStatus);
  const facultyAssignmentActive = ["approved", "faculty_assignment"].includes(scheduler.currentStatus);
  const reviewActive = !plottingActive && !facultyAssignmentActive;
  useWorkflowGuide({ id: "schedule-builder-plotting", isReady: !scheduler.isLoading && plottingActive, steps: plottingGuideSteps });
  useWorkflowGuide({ id: "schedule-builder-faculty-assignment", isReady: !scheduler.isLoading && facultyAssignmentActive, steps: facultyAssignmentGuideSteps });
  useWorkflowGuide({ id: "schedule-builder-review", isReady: !scheduler.isLoading && reviewActive, steps: reviewGuideSteps });
  const [isYearLevelGenerateOpen, setIsYearLevelGenerateOpen] = useState(false);
  const [isAutoAssignOpen, setIsAutoAssignOpen] = useState(false);

  useEffect(() => {
    if (autoAssignOnOpen && scheduler.schedules.length > 0) {
      setIsAutoAssignOpen(true);
    }
  }, [autoAssignOnOpen, scheduler.schedules.length]);

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
        onGenerate={generateSchedule.openModal}
        onGenerateYearLevel={() => setIsYearLevelGenerateOpen(true)}
        isGenerateDisabled={!scheduler.isEditable}
        isSectionGenerateDisabled={!scheduler.selectedSectionId}
        onAutoAssign={() => setIsAutoAssignOpen(true)}
      />

      <div className="flex min-h-0 w-full flex-col gap-4 overflow-visible lg:h-[calc(100dvh-180px)] lg:min-h-[560px] lg:flex-row lg:overflow-hidden">
        {!scheduler.isWideView && <CourseBank {...scheduler} />}
        <TimetableGrid {...scheduler} activeTermText={scheduler.activeTermText} />
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
        programId={scheduler.userProgramId}
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
        users={scheduler.users}
        isPrintModalOpen={scheduler.isPrintModalOpen}
        setIsPrintModalOpen={scheduler.setIsPrintModalOpen}
        allSchedules={scheduler.schedules}
        selectedSectionId={scheduler.selectedSectionId}
      />
      {/* One overload confirmation for all three faculty paths: the slot popup,
          the inline picker and Auto-Assign each await this same answer. */}
      {scheduler.overloadPrompt && (
        <OverloadConfirmationModal
          confirmation={scheduler.overloadPrompt.confirmation}
          onConfirm={scheduler.confirmOverloadPrompt}
          onCancel={scheduler.cancelOverloadPrompt}
        />
      )}
    </div>
  );
}
