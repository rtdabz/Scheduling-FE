import TopBar from "./TopBar";
import RoomReassignmentPanel from "../../../components/rooms/RoomReassignmentPanel";
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
import ResolveConflictModal from "./Modals/ResolveConflictModal";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useScheduler } from "./hooks/useScheduler";
import { useWorkflowGuide } from "../../../hooks/useWorkflowGuide";
import YearLevelGenerateScheduleWorkflow from "./GenerateSchedule/YearLevelGenerateScheduleWorkflow";
import YearLevelCurriculumSelector from "./GenerateSchedule/YearLevelCurriculumSelector";
import GenerationProgressDrawer from "./GenerateSchedule/GenerationProgressDrawer";
import { GenerationRunProvider } from "./hooks/useGenerationRun";
import { getStoredUser } from "../../../lib/storedUser";
import WorkflowGuideButton from "../../../components/help/WorkflowGuideButton";
import { builderGuideSteps } from "./workflowGuideContent";
import { announceJoyrideStart } from "../../../onboarding/joyrideTour";
import { useWorkflowDialog } from "./GenerateSchedule/useWorkflowDialog";
import { reassignsRoomSchedulesFromFacilities } from "../../../lib/roles";
import { EDITABLE_STATUSES } from "../../../lib/scheduleStatuses";

interface SchedulerPanelProps {
  autoAssignOnOpen?: boolean;
}

export default function SchedulerPanel({ autoAssignOnOpen = false }: SchedulerPanelProps) {
  const scheduler = useScheduler();
  const [, setSearchParams] = useSearchParams();
  const plottingActive = EDITABLE_STATUSES.includes(scheduler.currentStatus);
  const facultyAssignmentActive = ["approved", "faculty_assignment", "reassignment"].includes(scheduler.currentStatus);
  const reviewActive = !plottingActive && !facultyAssignmentActive;
  // The department office (Secretary or Director) and the Program Head reassign room schedules from Facilities; other roles keep the entry here.
  const reassignsFromFacilities = reassignsRoomSchedulesFromFacilities(getStoredUser()?.role);
  const [isAutoAssignOpen, setIsAutoAssignOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const generatorDialogRef = useRef<HTMLDivElement>(null);
  const [isSavingGenerated, setIsSavingGenerated] = useState(false);
  useWorkflowDialog(generatorDialogRef, isGeneratorOpen, () => setIsGeneratorOpen(false), isSavingGenerated);
  const [isClearInstructorConfirmOpen, setIsClearInstructorConfirmOpen] = useState(false);
  const [clearInstructorScope, setClearInstructorScope] = useState<"section" | "department">("section");
  const [isConflictsOpen, setIsConflictsOpen] = useState(false);
  // The class whose Conflict badge was clicked; null opens on the first conflict.
  const [conflictsFocusId, setConflictsFocusId] = useState<number | null>(null);
  useEffect(() => {
    const closePreviousSchedule = () => {
      setIsGeneratorOpen(false);
      setIsAutoAssignOpen(false);
      setIsConflictsOpen(false);
      setConflictsFocusId(null);
      setIsClearInstructorConfirmOpen(false);
    };
    window.addEventListener("schedule-workspace-reset", closePreviousSchedule);
    return () => window.removeEventListener("schedule-workspace-reset", closePreviousSchedule);
  }, []);
  const [pendingRoomTransferCount, setPendingRoomTransferCount] = useState(0);
  const openGenerator = () => {
    announceJoyrideStart("workflow:generator-open");
    setIsGeneratorOpen(true);
  };
  const openAutoAssign = () => {
    announceJoyrideStart("workflow:autoassign-open");
    setIsAutoAssignOpen(true);
  };

  const autoAssignReady = autoAssignOnOpen && scheduler.schedules.length > 0;
  const [wasAutoAssignReady, setWasAutoAssignReady] = useState(false);
  if (autoAssignReady !== wasAutoAssignReady) {
    setWasAutoAssignReady(autoAssignReady);
    if (autoAssignReady) setIsAutoAssignOpen(true);
  }

  const isCourseBankOpen =
    !scheduler.isWideView && isCourseBankAvailable(scheduler.isPhase2Active, scheduler.currentStatus);

  const guideContext = {
    hasProgram: scheduler.schedulingReady,
    hasSection: Boolean(scheduler.selectedSectionId),
    hasSections: scheduler.sections.length > 0,
    canPlot: scheduler.isEditable && isCourseBankAvailable(scheduler.isPhase2Active, scheduler.currentStatus),
    manualPlottingOpen: isCourseBankOpen,
    canGenerate: scheduler.canGenerateSchedule,
    canAssign: scheduler.canAssignInstructor,
  };
  const guideVariant = `${scheduler.currentStatus}:${scheduler.isEditable ? "edit" : "view"}:${scheduler.selectedSectionId ? "section" : "no-section"}`;
  useWorkflowGuide({ id: "schedule-builder-plotting", variant: guideVariant, isReady: !scheduler.isLoading && plottingActive, steps: () => builderGuideSteps("plotting", guideContext), mission: "Plot the Timetable" });
  useWorkflowGuide({ id: "schedule-builder-faculty-assignment", variant: guideVariant, isReady: !scheduler.isLoading && facultyAssignmentActive, steps: () => builderGuideSteps("faculty-assignment", guideContext), mission: "Assign Instructors" });
  useWorkflowGuide({ id: "schedule-builder-review", variant: guideVariant, isReady: !scheduler.isLoading && reviewActive, steps: () => builderGuideSteps("review", guideContext), mission: "Review the Schedule" });

  const selectedSection = scheduler.sections.find((s) => s.id === scheduler.selectedSectionId);
  const selectedYearLevelSections = useMemo(
    () =>
      selectedSection
        ? scheduler.sections.filter(
            (section) =>
              Number(section.departmentId) === Number(selectedSection.departmentId) &&
              Number(section.programId) === Number(selectedSection.programId) &&
              Number(section.yearLevel) === Number(selectedSection.yearLevel),
          )
        : [],
    [scheduler, selectedSection],
  );
  const generatorDepartmentId = selectedSection?.departmentId ?? scheduler.sections[0]?.departmentId ?? null;
  const generatorDepartment = scheduler.departments.find(
    (department) => Number(department.id) === Number(generatorDepartmentId),
  );
  const generatorDepartmentLogoUrl = generatorDepartment?.logo ?? null;
  const { reloadSchedulingSettings } = scheduler;

  const assignDepartmentId = selectedSection?.departmentId ?? null;
  const ownDepartmentSchedules = useMemo(() => {
    if (assignDepartmentId === null) return scheduler.schedules;
    const teachingDepartmentByCourse = new Map(scheduler.subjects.map((subject) => [subject.id, subject.teachingDepartmentId ?? null]));
    return scheduler.schedules.filter((schedule) => {
      if (schedule.departmentId != null && Number(schedule.departmentId) !== Number(assignDepartmentId)) return false;
      const teachingDepartmentId = teachingDepartmentByCourse.get(schedule.courseId) ?? null;
      return teachingDepartmentId === null || Number(teachingDepartmentId) === Number(assignDepartmentId);
    });
  }, [assignDepartmentId, scheduler.schedules, scheduler.subjects]);

  useEffect(() => {
    if (!isGeneratorOpen) return;

    return () => {
      reloadSchedulingSettings();
    };
  }, [isGeneratorOpen, reloadSchedulingSettings]);

  if (!scheduler.isLoading && !scheduler.schedulingReady) {
    return (
      <div id="schedule-builder-unavailable" className="flex min-h-[240px] w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        <WorkflowGuideButton guideId={plottingActive ? "schedule-builder-plotting" : facultyAssignmentActive ? "schedule-builder-faculty-assignment" : "schedule-builder-review"} />
        <div className="max-w-md">
          <h2 className="text-base font-bold text-amber-900">Create a Program before scheduling</h2>
          <p className="mt-2 text-sm text-amber-800">
            This Department has no active Program yet. Add at least one Program under the Department, then return here to create sections and schedules.
          </p>
        </div>
      </div>
    );
  }

  return (
    <GenerationRunProvider
      key={`${generatorDepartmentId ?? "none"}.${scheduler.activeSemester?.id ?? "none"}`}
      departmentId={generatorDepartmentId === null ? null : Number(generatorDepartmentId)}
      semesterId={scheduler.activeSemester ? Number(scheduler.activeSemester.id) : null}
    >
    <div className="flex w-full min-w-0 flex-col gap-3 text-slate-800 antialiased">
      <TopBar
        {...scheduler}
        pendingRoomTransferCount={pendingRoomTransferCount}
        onPrint={() => scheduler.setIsPrintModalOpen(true)}
        onOpenRoomTransfer={scheduler.activeSemester && !reassignsFromFacilities ? () => {
          setSearchParams(current => {
            const next = new URLSearchParams(current);
            next.set('recovery', 'open');
            next.set('recovery_semester', String(scheduler.activeSemester!.id));
            next.delete('recovery_room');
            return next;
          });
        } : undefined}
        onGenerateYearLevel={scheduler.canGenerateSchedule ? openGenerator : undefined}
        onResetSchedules={scheduler.handleClearAll}
        canResetSchedules={scheduler.isEditable && scheduler.schedules.length > 0}
        onAutoAssign={scheduler.canAssignInstructor ? openAutoAssign : undefined}
        onClearInstructors={scheduler.canAssignInstructor ? () => { setClearInstructorScope(scheduler.clearableSectionInstructorCount > 0 ? "section" : "department"); setIsClearInstructorConfirmOpen(true); } : undefined}
      />
      {!reassignsFromFacilities && <RoomReassignmentPanel semesterId={Number(scheduler.activeSemester?.id) || undefined} onPendingCountChange={setPendingRoomTransferCount} onTransferred={() => {
        void scheduler.refreshSchedules();
        scheduler.refreshConflictCounts();
      }} />}

      {scheduler.canUpdateSchedule && !scheduler.ownsSelectedProgram && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Add the section first. <span className="font-bold">View-only</span> — just the Program Head or Secretary can edit its schedule.
        </p>
      )}

      <div
        // The timetable shows every row at full height (no inner scrolling). The subject panel matches
        // that height and scrolls its own list.
        className={`flex min-h-0 w-full flex-col overflow-visible transition-[grid-template-columns,gap] duration-200 ease-out motion-reduce:transition-none lg:grid lg:items-stretch ${
          isCourseBankOpen
            ? "gap-3 lg:grid-cols-[304px_minmax(0,1fr)] 2xl:grid-cols-[336px_minmax(0,1fr)]"
            : "gap-0 lg:grid-cols-[0px_minmax(0,1fr)]"
        }`}
      >
        <div
          inert={!isCourseBankOpen}
          className={`min-h-0 min-w-0 overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none lg:h-0 lg:max-h-none lg:min-h-full ${
            isCourseBankOpen ? "max-h-[70vh] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <CourseBank
            {...scheduler}
          curriculumControl={selectedSection ? (
            <YearLevelCurriculumSelector
              scope="year_level"
              variant="icon"
              restrictToSections
              departmentId={Number(selectedSection.departmentId)}
              semesterId={scheduler.activeSemester ? Number(scheduler.activeSemester.id) : null}
              yearLevel={Number(selectedSection.yearLevel)}
              sections={selectedYearLevelSections}
              disabled={!scheduler.isEditable}
              onApplied={() => scheduler.refreshData({ silent: true })}
            />
          ) : undefined}
          />
        </div>
        <TimetableGrid
          {...scheduler}
          activeSemesterText={scheduler.activeSemesterText}
          savingMessage={isSavingGenerated ? "Saving the generated timetable…" : null}
          onOpenConflict={scheduler.activeSemester ? (scheduleId) => {
            const id = Number(scheduleId);
            setConflictsFocusId(Number.isFinite(id) ? id : null);
            setIsConflictsOpen(true);
          } : undefined}
        />
      </div>

      {scheduler.canGenerateSchedule && isGeneratorOpen && (
        <div data-workflow-guide-scope="schedule-generator" className="scheduler-dialog-overlay fixed inset-0 z-50 flex items-center justify-center">
          <div ref={generatorDialogRef} role="dialog" aria-modal="true" aria-labelledby="schedule-generator-title" aria-describedby="schedule-generator-description" aria-busy={isSavingGenerated} tabIndex={-1} className="scheduler-dialog flex max-w-full overflow-hidden bg-white outline-none shadow-2xl" style={{ width: "fit-content" }}>
            <YearLevelGenerateScheduleWorkflow
              onClose={() => setIsGeneratorOpen(false)}
              sections={scheduler.sections.filter((section) => scheduler.ownsProgram(section.programId))}
              courses={scheduler.subjects.filter((subject) => !subject.delegatedOnly)}
              activeSemester={scheduler.activeSemester}
              departmentId={generatorDepartmentId}
              departmentLogoUrl={generatorDepartmentLogoUrl}
              existingSchedules={scheduler.schedules}
              onAccepted={scheduler.handleAcceptedRecommendation}
              onSectionsChanged={scheduler.refreshData}
              onSavingChange={setIsSavingGenerated}
            />
          </div>
        </div>
      )}

      {/* Held back while the generator is up, and shown once it closes. */}
      {isConflictsOpen && scheduler.activeSemester && !isGeneratorOpen && (
        <ResolveConflictModal
          key={conflictsFocusId ?? "first"}
          isOpen
          onClose={() => setIsConflictsOpen(false)}
          semesterId={Number(scheduler.activeSemester.id)}
          departmentId={generatorDepartmentId === null ? null : Number(generatorDepartmentId)}
          focusScheduleId={conflictsFocusId}
          initialTab={(scheduler.conflictCounts?.open ?? 0) > 0 ? "open" : "resolved"}
          onResolved={() => {
            void scheduler.refreshSchedules();
            scheduler.refreshConflictCounts();
          }}
        />
      )}

      <DropModal {...scheduler} />
      <FacultyModal {...scheduler} />
      <AutoAssignModal
        isOpen={isAutoAssignOpen}
        onClose={() => setIsAutoAssignOpen(false)}
        schedules={ownDepartmentSchedules}
        subjects={scheduler.subjects}
        faculties={scheduler.faculties}
        departmentId={assignDepartmentId}
        programId={scheduler.userProgramId}
        facultyActionSlotId={scheduler.facultyActionSlotId}
        canManageScheduleFaculty={scheduler.canManageScheduleFaculty}
        checkFacultyConflict={scheduler.checkFacultyConflict}
        onAssign={scheduler.handleBulkFacultyAssign}
        onRemoveAssignment={scheduler.handleRemoveFacultyFromClass}
      />
      <SubmitApprovalModal {...scheduler} />
      {scheduler.isFinalizeSectionsModalOpen && (
      <MarkSectionsDoneModal
        variant="finalize"
        candidates={scheduler.sectionFinalizeCandidates}
        selectedSectionId={scheduler.selectedSectionId}
        isMarking={scheduler.isFinalizing}
        onConfirm={scheduler.confirmFinalizeSections}
        onCancel={scheduler.cancelFinalizeSections}
      />
      )}
      {scheduler.isReassignSectionsModalOpen && (
      <MarkSectionsDoneModal
        variant="reassign"
        candidates={scheduler.sectionReassignCandidates}
        selectedSectionId={scheduler.selectedSectionId}
        isMarking={scheduler.isEditingSection}
        onConfirm={scheduler.confirmReassignSections}
        onCancel={scheduler.cancelReassignSections}
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
        appearance="workflow"
        isOpen={isClearInstructorConfirmOpen}
        eyebrow="Section Instructor Assignment"
        title="Clear all instructors?"
        message={clearInstructorScope === "department"
          ? `Remove all ${scheduler.clearableDepartmentInstructorCount} assigned course sessions/components from every section in the department? Timetable placements and approval status will remain unchanged.`
          : `Remove all ${scheduler.clearableSectionInstructorCount} assigned course sessions/components from ${selectedSection?.name ?? "this section"}? Timetable placements and approval status will remain unchanged.`}
        confirmLabel="Clear Instructors"
        variant="danger"
        isConfirming={scheduler.isClearingSectionInstructors}
        onConfirm={async () => {
          if (await scheduler.handleClearSectionInstructors(clearInstructorScope)) setIsClearInstructorConfirmOpen(false);
        }}
        onCancel={() => !scheduler.isClearingSectionInstructors && setIsClearInstructorConfirmOpen(false)}
      >
        <fieldset className="space-y-2" disabled={scheduler.isClearingSectionInstructors}>
          <legend className="sr-only">What to clear</legend>
          {([
            { value: "section" as const, label: `This section only (${selectedSection?.name ?? "current section"})`, count: scheduler.clearableSectionInstructorCount },
            { value: "department" as const, label: "All sections in the department", count: scheduler.clearableDepartmentInstructorCount },
          ]).map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
              <input
                type="radio"
                name="clear-instructor-scope"
                value={option.value}
                checked={clearInstructorScope === option.value}
                onChange={() => setClearInstructorScope(option.value)}
                disabled={option.count === 0}
              />
              <span className="flex-1">{option.label}</span>
              <span className="text-slate-400">{option.count}</span>
            </label>
          ))}
        </fieldset>
      </ConfirmModal>
      <PrintSchedule
        sections={scheduler.sections}
        departments={scheduler.departments}
        users={scheduler.users}
        isPrintModalOpen={scheduler.isPrintModalOpen}
        setIsPrintModalOpen={scheduler.setIsPrintModalOpen}
        allSchedules={scheduler.schedules}
        selectedSectionId={scheduler.selectedSectionId}
        activeSemester={scheduler.activeSemester}
      />
      {scheduler.canGenerateSchedule && (
        <GenerationProgressDrawer
          hidden={isGeneratorOpen}
          onOpenGenerator={openGenerator}
        />
      )}
    </div>
    </GenerationRunProvider>
  );
}
