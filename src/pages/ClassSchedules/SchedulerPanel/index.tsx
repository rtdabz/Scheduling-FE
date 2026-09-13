import TopBar from "./TopBar";
import CourseBank, { isCourseBankAvailable } from "./CourseBank";
import TimetableGrid from "./TimetableGrid";
import DropModal from "./Modals/DropModal";
import FacultyModal from "./Modals/FacultyModal";
import ClearAllModal from "./Modals/ClearAllModal";
import SubmitApprovalModal from "./Modals/SubmitApprovalModal";
import WithdrawSubmissionModal from "./Modals/WithdrawSubmissionModal";
import MarkSectionsDoneModal from "./Modals/MarkSectionsDoneModal";
import RoomViewModal from "./Modals/RoomViewModal";
import PrintSchedule from "./PrintSchedule";
import AutoAssignModal from "./Modals/AutoAssignModal";
import OverloadConfirmationModal from "../../../components/faculty/OverloadConfirmationModal";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import { useEffect, useMemo, useState } from "react";
import { useScheduler } from "./hooks/useScheduler";
import { useWorkflowGuide } from "../../../hooks/useWorkflowGuide";
import YearLevelGenerateScheduleWorkflow from "./GenerateSchedule/YearLevelGenerateScheduleWorkflow";
import GenerationProgressDrawer from "./GenerateSchedule/GenerationProgressDrawer";
import { GenerationRunProvider } from "./hooks/useGenerationRun";

interface SchedulerPanelProps {
  autoAssignOnOpen?: boolean;
}

export default function SchedulerPanel({ autoAssignOnOpen = false }: SchedulerPanelProps) {
  const scheduler = useScheduler();
  const plottingGuideSteps = useMemo(() => [
    { element: '#schedule-builder-section button[aria-haspopup="listbox"]', action: "click" as const, taskHint: "Open the section picker and choose a section.", title: "Choose a section", description: "Select a section to load its courses and timetable.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-generate button", action: "click" as const, skipIfMissing: true, taskHint: "Click Generate to continue.", title: "Generate a schedule", description: "Open the generator to build a whole year level at once. It has its own step-by-step guide, and this one waits here until you close it.", side: "bottom" as const, align: "end" as const },
    { element: "#schedule-builder-course-bank-toggle", action: "click" as const, taskHint: "Click the toggle to continue.", title: "Show the Course Bank", description: "Show or hide the Course Bank.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-course-bank", title: "Place each course", description: "Select a course and click an empty time, or drag it onto the timetable.", side: "right" as const, align: "start" as const },
    { element: "#schedule-builder-timetable", title: "Check the timetable", description: "Review times, rooms, and conflicts. Move or edit classes if needed.", side: "top" as const },
    { element: "#schedule-builder-next-step", title: "Finish plotting", description: "When all courses are placed and checked, mark the section Done.", side: "bottom" as const },
  ], []);
  const facultyAssignmentGuideSteps = useMemo(() => [
    { element: '#schedule-builder-section button[aria-haspopup="listbox"]', action: "click" as const, taskHint: "Open the section picker and choose a section.", title: "Choose an approved section", description: "Select a section with classes that need instructors.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-workflow", title: "Check the current step", description: "Faculty Assignment means the timetable is ready for instructors.", side: "bottom" as const },
    { element: "#schedule-builder-auto-assign", action: "click" as const, skipIfMissing: true, taskHint: "Click Auto-Assign to continue.", title: "Use Auto-Assign", description: "Review automatic instructor suggestions, then apply the ones you want.", side: "bottom" as const, align: "end" as const },
    { element: '[data-tour="unassigned-class"]', waitFor: "#schedule-builder-timetable", action: "click" as const, skipIfMissing: true, taskHint: "Click a highlighted class that needs an instructor.", title: "Open an unassigned class", description: "Select a class without an instructor to see eligible faculty and conflicts.", side: "top" as const },
  ], []);
  const reviewGuideSteps = useMemo(() => [
    { element: '#schedule-builder-section button[aria-haspopup="listbox"]', action: "click" as const, taskHint: "Open the section picker and choose a section.", title: "Choose a section", description: "Select a section to review its schedule and status.", side: "bottom" as const, align: "start" as const },
    { element: "#schedule-builder-workflow", title: "Check the workflow", description: "See which scheduling steps are complete.", side: "bottom" as const },
    { element: "#schedule-builder-timetable", title: "Review the timetable", description: "Check classes, times, rooms, instructors, and conflicts.", side: "top" as const },
    { element: "#schedule-builder-next-step", title: "Check the next action", description: "See the section status and what you can do next.", side: "bottom" as const },
  ], []);
  const plottingActive = ["draft", "revision"].includes(scheduler.currentStatus);
  const facultyAssignmentActive = ["approved", "faculty_assignment", "reassignment"].includes(scheduler.currentStatus);
  const reviewActive = !plottingActive && !facultyAssignmentActive;
  useWorkflowGuide({ id: "schedule-builder-plotting", isReady: !scheduler.isLoading && plottingActive, steps: plottingGuideSteps, mission: "Plot the Timetable" });
  useWorkflowGuide({ id: "schedule-builder-faculty-assignment", isReady: !scheduler.isLoading && facultyAssignmentActive, steps: facultyAssignmentGuideSteps, mission: "Assign Instructors" });
  useWorkflowGuide({ id: "schedule-builder-review", isReady: !scheduler.isLoading && reviewActive, steps: reviewGuideSteps, mission: "Review the Schedule" });
  const [isAutoAssignOpen, setIsAutoAssignOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isClearInstructorConfirmOpen, setIsClearInstructorConfirmOpen] = useState(false);

  useEffect(() => {
    if (autoAssignOnOpen && scheduler.schedules.length > 0) {
      setIsAutoAssignOpen(true);
    }
  }, [autoAssignOnOpen, scheduler.schedules.length]);

  // The bank stays mounted so showing and hiding it animates; the parent owns
  // its column so the timetable slides into the freed space.
  const isCourseBankOpen =
    !scheduler.isWideView && isCourseBankAvailable(scheduler.isPhase2Active, scheduler.currentStatus);

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

  if (!scheduler.isLoading && !scheduler.schedulingReady) {
    return (
      <div className="flex min-h-[280px] w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-base font-black text-amber-900">Create a Program before scheduling</h2>
          <p className="mt-2 text-sm text-amber-800">
            This Department has no active Program yet. Add at least one Program under the Department, then return here to create sections and schedules.
          </p>
        </div>
      </div>
    );
  }

  return (
    // The generation run is owned above the generator modal so a queued run
    // survives closing the panel, and is recovered after a page reload.
    <GenerationRunProvider
      // A different department or term is a different scheduling context, so
      // the tracker is rebuilt rather than carrying the previous run over.
      key={`${generatorDepartmentId ?? "none"}.${scheduler.activeTerm?.id ?? "none"}`}
      departmentId={generatorDepartmentId === null ? null : Number(generatorDepartmentId)}
      termId={scheduler.activeTerm ? Number(scheduler.activeTerm.id) : null}
    >
    <div className="flex flex-col gap-4 w-full text-slate-800 antialiased">
      <TopBar
        {...scheduler}
        onPrint={() => scheduler.setIsPrintModalOpen(true)}
        onGenerateYearLevel={scheduler.canGenerateSchedule ? () => setIsGeneratorOpen(true) : undefined}
        onAutoAssign={scheduler.canAssignInstructor ? () => setIsAutoAssignOpen(true) : undefined}
        onClearInstructors={scheduler.canAssignInstructor ? () => setIsClearInstructorConfirmOpen(true) : undefined}
      />

      <div
        className={`flex min-h-0 w-full flex-col overflow-visible transition-[grid-template-columns,gap] duration-300 ease-out motion-reduce:transition-none lg:grid lg:h-auto lg:min-h-0 lg:items-stretch ${
          isCourseBankOpen
            ? "gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,3fr)]"
            : "gap-0 lg:grid-cols-[minmax(0px,0fr)_minmax(0,1fr)]"
        }`}
      >
        <div
          inert={!isCourseBankOpen}
          className={`min-w-0 overflow-hidden transition-[max-height,opacity] duration-300 ease-out motion-reduce:transition-none lg:h-0 lg:max-h-none lg:min-h-full ${
            isCourseBankOpen ? "max-h-[70vh] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <CourseBank {...scheduler} />
        </div>
        <TimetableGrid {...scheduler} activeTermText={scheduler.activeTermText} />
      </div>

      {scheduler.canGenerateSchedule && isGeneratorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-2 backdrop-blur-[1px] sm:p-4" role="dialog" aria-modal="true" aria-label="Generate schedule">
          <div className="flex max-h-[calc(100dvh-1rem)] max-w-full overflow-hidden bg-white shadow-2xl sm:rounded-lg">
            <YearLevelGenerateScheduleWorkflow
              onClose={() => setIsGeneratorOpen(false)}
              sections={scheduler.sections}
              courses={scheduler.subjects}
              activeTerm={scheduler.activeTerm}
              departmentId={generatorDepartmentId}
              departmentLogoUrl={generatorDepartmentLogoUrl}
              existingSchedules={scheduler.schedules}
              onAccepted={scheduler.handleAcceptedRecommendation}
              onSectionsChanged={scheduler.refreshData}
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
      {scheduler.isMarkSectionsDoneModalOpen && (
      <MarkSectionsDoneModal
        candidates={scheduler.sectionDoneCandidates}
        selectedSectionId={scheduler.selectedSectionId}
        isMarking={scheduler.isMarkingSectionsDone}
        onConfirm={scheduler.confirmMarkSectionsDone}
        onCancel={scheduler.cancelMarkSectionsDone}
      />
      )}

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
      <ConfirmModal
        isOpen={isClearInstructorConfirmOpen}
        eyebrow="Section Instructor Assignment"
        title="Clear all instructors?"
        message={`Remove all ${scheduler.clearableSectionInstructorCount} assigned course sessions/components from ${selectedSection?.name ?? "this section"}? Timetable placements and approval status will remain unchanged.`}
        confirmLabel="Clear Instructors"
        variant="danger"
        isConfirming={scheduler.isClearingSectionInstructors}
        onConfirm={async () => {
          if (await scheduler.handleClearSectionInstructors()) setIsClearInstructorConfirmOpen(false);
        }}
        onCancel={() => !scheduler.isClearingSectionInstructors && setIsClearInstructorConfirmOpen(false)}
      />
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
      {scheduler.canGenerateSchedule && (
        <GenerationProgressDrawer
          hidden={isGeneratorOpen}
          onOpenGenerator={() => setIsGeneratorOpen(true)}
        />
      )}
    </div>
    </GenerationRunProvider>
  );
}
