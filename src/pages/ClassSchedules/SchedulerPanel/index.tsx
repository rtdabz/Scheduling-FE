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
import AutoAssignModal from "./Modals/AutoAssignModal";
import OverloadConfirmationModal from "../../../components/faculty/OverloadConfirmationModal";
import { useEffect, useMemo, useState } from "react";
import { useScheduler } from "./hooks/useScheduler";
import { useWorkflowGuide } from "../../../hooks/useWorkflowGuide";
import YearLevelGenerateScheduleWorkflow from "./GenerateSchedule/YearLevelGenerateScheduleWorkflow";

interface SchedulerPanelProps {
  autoAssignOnOpen?: boolean;
}

export default function SchedulerPanel({ autoAssignOnOpen = false }: SchedulerPanelProps) {
  const scheduler = useScheduler();
  const plottingGuideSteps = useMemo(() => [
    { element: "#schedule-builder-section", title: "Choose a section", description: "Select a section to load its courses and timetable.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-generate", title: "Generate a schedule", description: "Create a schedule proposal and check it for conflicts.", side: "bottom" as const, align: "end" as const },
    { element: "#schedule-builder-course-bank-toggle", title: "Show the Course Bank", description: "Show or hide the Course Bank.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-course-bank", title: "Place each course", description: "Select a course and click an empty time, or drag it onto the timetable.", side: "right" as const, align: "start" as const },
    { element: "#schedule-builder-timetable", title: "Check the timetable", description: "Review times, rooms, and conflicts. Move or edit classes if needed.", side: "top" as const },
    { element: "#schedule-builder-next-step", title: "Finish plotting", description: "When all courses are placed and checked, mark the section Done.", side: "bottom" as const },
  ], []);
  const facultyAssignmentGuideSteps = useMemo(() => [
    { element: "#schedule-builder-section", title: "Choose an approved section", description: "Select a section with classes that need instructors.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-workflow", title: "Check the current step", description: "Faculty Assignment means the timetable is ready for instructors.", side: "bottom" as const },
    { element: "#schedule-builder-timetable", title: "Open an unassigned class", description: "Select a class without an instructor to see eligible faculty and conflicts.", side: "top" as const },
    { element: "#schedule-builder-auto-assign", title: "Use Auto-Assign", description: "Review automatic instructor suggestions, then apply the ones you want.", side: "bottom" as const, align: "end" as const },
    { element: "#schedule-builder-next-step", title: "Finalize the section", description: "Finalize after every class has an instructor and no conflicts remain.", side: "bottom" as const },
  ], []);
  const reviewGuideSteps = useMemo(() => [
    { element: "#schedule-builder-section", title: "Choose a section", description: "Select a section to review its schedule and status.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-workflow", title: "Check the workflow", description: "See which scheduling steps are complete.", side: "bottom" as const },
    { element: "#schedule-builder-timetable", title: "Review the timetable", description: "Check classes, times, rooms, instructors, and conflicts.", side: "top" as const },
    { element: "#schedule-builder-next-step", title: "Check the next action", description: "See the section status and what you can do next.", side: "bottom" as const },
  ], []);
  const plottingActive = ["draft", "revision"].includes(scheduler.currentStatus);
  const facultyAssignmentActive = ["approved", "faculty_assignment"].includes(scheduler.currentStatus);
  const reviewActive = !plottingActive && !facultyAssignmentActive;
  useWorkflowGuide({ id: "schedule-builder-plotting", isReady: !scheduler.isLoading && plottingActive, steps: plottingGuideSteps });
  useWorkflowGuide({ id: "schedule-builder-faculty-assignment", isReady: !scheduler.isLoading && facultyAssignmentActive, steps: facultyAssignmentGuideSteps });
  useWorkflowGuide({ id: "schedule-builder-review", isReady: !scheduler.isLoading && reviewActive, steps: reviewGuideSteps });
  const [isAutoAssignOpen, setIsAutoAssignOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

  useEffect(() => {
    if (autoAssignOnOpen && scheduler.schedules.length > 0) {
      setIsAutoAssignOpen(true);
    }
  }, [autoAssignOnOpen, scheduler.schedules.length]);

  const selectedSection = scheduler.sections.find((s) => s.id === scheduler.selectedSectionId);
  const generatorDepartmentId = selectedSection?.departmentId ?? scheduler.sections[0]?.departmentId ?? null;
  const generatorDepartmentLogoUrl = scheduler.departments.find(
    (department) => Number(department.id) === Number(generatorDepartmentId),
  )?.logo ?? null;

  useEffect(() => {
    if (!isGeneratorOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsGeneratorOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isGeneratorOpen]);

  return (
    <div className="flex flex-col gap-4 w-full text-slate-800 antialiased">
      <TopBar
        {...scheduler}
        onPrint={() => scheduler.setIsPrintModalOpen(true)}
        onGenerateYearLevel={() => setIsGeneratorOpen(true)}
        isGenerateDisabled={!scheduler.isEditable}
        onAutoAssign={() => setIsAutoAssignOpen(true)}
      />

      <div className="flex min-h-0 w-full flex-col gap-4 overflow-visible lg:h-auto lg:min-h-[560px] lg:flex-row">
        {!scheduler.isWideView && <CourseBank {...scheduler} />}
        <TimetableGrid {...scheduler} activeTermText={scheduler.activeTermText} />
      </div>

      {isGeneratorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-[1px] sm:p-4" role="dialog" aria-modal="true" aria-label="Generate schedule">
          <div className="h-[calc(100dvh-1rem)] w-full max-w-[1600px] overflow-hidden bg-white shadow-2xl sm:h-[calc(100dvh-2rem)] sm:rounded-lg">
            <YearLevelGenerateScheduleWorkflow
              onClose={() => setIsGeneratorOpen(false)}
              sections={scheduler.sections}
              courses={scheduler.subjects}
              activeTerm={scheduler.activeTerm}
              departmentId={generatorDepartmentId}
              departmentLogoUrl={generatorDepartmentLogoUrl}
              existingSchedules={scheduler.schedules}
              onAccepted={scheduler.handleAcceptedRecommendation}
            />
          </div>
        </div>
      )}

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
      <ClearAllModal {...scheduler} />
      <PrintSchedule
        sections={scheduler.sections}
        departments={scheduler.departments}
        users={scheduler.users}
        isPrintModalOpen={scheduler.isPrintModalOpen}
        setIsPrintModalOpen={scheduler.setIsPrintModalOpen}
        allSchedules={scheduler.schedules}
        selectedSectionId={scheduler.selectedSectionId}
        activeTerm={scheduler.activeTerm}
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
