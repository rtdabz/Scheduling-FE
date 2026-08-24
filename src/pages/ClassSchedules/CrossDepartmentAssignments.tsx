import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Pencil, UserCheck } from 'lucide-react';
import InstructorAssignment from './InstructorAssignment';
import type { InstructorAssignmentWorkspaceState } from './InstructorAssignment';
import AutoAssignModal from './SchedulerPanel/Modals/AutoAssignModal';
import OverloadConfirmationModal from '../../components/faculty/OverloadConfirmationModal';
import { useScheduler } from './SchedulerPanel/hooks/useScheduler';
import WorkflowGuideButton from '../../components/help/WorkflowGuideButton';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';

/**
 * Cross-department keeps its department cards and timetable workspace, while
 * reusing the Schedule Builder Auto-Assign wizard for the assignment workflow.
 * The authenticated department is always the receiving/teaching department;
 * schedule ownership must never change the instructor scope.
 */
export default function CrossDepartmentAssignments() {
  const scheduler = useScheduler();
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdatingDone, setIsUpdatingDone] = useState(false);
  const [isAssignmentWorkspaceReady, setIsAssignmentWorkspaceReady] = useState(false);
  const [completionOverride, setCompletionOverride] = useState<boolean | null>(null);
  const [assignmentRefreshToken, setAssignmentRefreshToken] = useState(0);
  const [workspaceState, setWorkspaceState] = useState<InstructorAssignmentWorkspaceState>({
    selectedDepartmentId: null,
    scheduleIds: [],
    allAssigned: false,
    assignmentDone: false,
  });
  const receivingFaculties = useMemo(
    () => scheduler.faculties.filter((faculty) => (
      scheduler.userDepartmentId !== null
      && faculty.departmentId !== null
      && faculty.departmentId !== undefined
      && Number(faculty.departmentId) === Number(scheduler.userDepartmentId)
    )),
    [scheduler.faculties, scheduler.userDepartmentId],
  );
  const delegatedSchedules = useMemo(
    () => scheduler.schedules.filter((schedule) => {
      const subject = scheduler.subjects.find((item) => item.id === schedule.courseId);
      return subject?.teachingDepartmentId !== null
        && subject?.teachingDepartmentId !== undefined
        && Number(subject.teachingDepartmentId) === Number(scheduler.userDepartmentId)
        && Number(schedule.departmentId) !== Number(scheduler.userDepartmentId);
    }),
    [scheduler.schedules, scheduler.subjects, scheduler.userDepartmentId],
  );
  const assignmentDone = completionOverride ?? workspaceState.assignmentDone;
  const crossDepartmentGuideSteps = useMemo(() => [
    { element: '#cross-department-guide', title: 'Assign delegated courses', description: 'This workspace only shows courses another department scheduled for your department to teach.', side: 'bottom' as const },
    { element: '#instructor-assignment-departments', title: 'Open the source department', description: 'Choose the department that offers the delegated course schedule.', side: 'top' as const },
    { element: '#instructor-assignment-timetable', title: 'Assign your department\'s instructors', description: 'Select an unassigned class, choose an eligible instructor from your department, and save the assignment.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'cross-department-assignment', isReady: !scheduler.isLoading && isAssignmentWorkspaceReady, steps: crossDepartmentGuideSteps });
  const allAssigned = workspaceState.allAssigned;
  const visibleDelegatedSchedules = useMemo(
    () => delegatedSchedules.filter((schedule) => workspaceState.scheduleIds.includes(Number(schedule.id))),
    [delegatedSchedules, workspaceState.scheduleIds],
  );

  useEffect(() => {
    setCompletionOverride(null);
  }, [workspaceState.selectedDepartmentId]);

  const handleWorkspaceStateChange = useCallback((state: InstructorAssignmentWorkspaceState) => {
    setWorkspaceState(state);
  }, []);
  const handleWorkflowReady = useCallback(() => setIsAssignmentWorkspaceReady(true), []);
  const handleAutoAssign = useCallback(async (assignments: { scheduleIds: string[]; facultyId: string }[]) => {
    const success = await scheduler.handleBulkFacultyAssign(assignments);
    if (success) setAssignmentRefreshToken((current) => current + 1);
    return success;
  }, [scheduler]);

  const handleDoneToggle = async () => {
    if (isUpdatingDone || (!assignmentDone && !allAssigned)) return;
    setIsUpdatingDone(true);
    try {
      const nextDone = !assignmentDone;
      const updated = await scheduler.handleFacultyAssignmentDone(nextDone, workspaceState.scheduleIds.map(String));
      if (updated) setCompletionOverride(nextDone);
    } finally {
      setIsUpdatingDone(false);
    }
  };

  return (
    <div className="space-y-3">
      <WorkflowGuideButton id="cross-department-guide" guideId="cross-department-assignment" />
      <InstructorAssignment
        refreshToken={assignmentRefreshToken}
        workflowGuideId={null}
        onWorkflowReady={handleWorkflowReady}
        assignmentLocked={assignmentDone}
        onWorkspaceStateChange={handleWorkspaceStateChange}
        headerActions={(
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            disabled={assignmentDone || visibleDelegatedSchedules.length === 0 || !visibleDelegatedSchedules.some((schedule) => ['approved', 'faculty_assignment'].includes(schedule.status))}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#4e0a10] px-3 text-xs font-black text-white shadow-sm transition hover:bg-[#6b1118] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserCheck className="h-4 w-4" />
            Auto-Assign Instructor
          </button>
        )}
        footerActions={(
          <button
            type="button"
            onClick={() => { void handleDoneToggle(); }}
            disabled={isUpdatingDone || (!assignmentDone && !allAssigned)}
            className="inline-flex items-center gap-2 rounded-md border border-[#4e0a10] px-4 py-2 text-xs font-bold text-[#4e0a10] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUpdatingDone ? <LoadingSpinner className="h-4 w-4" /> : assignmentDone ? <Pencil className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {isUpdatingDone ? 'Updating...' : assignmentDone ? 'Edit Assignments' : 'Done Assigning'}
          </button>
        )}
      />
      <AutoAssignModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        schedules={visibleDelegatedSchedules}
        subjects={scheduler.subjects}
        faculties={receivingFaculties}
        departmentId={scheduler.userDepartmentId}
        programId={scheduler.userProgramId}
        facultyActionSlotId={scheduler.facultyActionSlotId}
        canManageScheduleFaculty={scheduler.canManageScheduleFaculty}
        checkFacultyConflict={scheduler.checkFacultyConflict}
        onAssign={handleAutoAssign}
        allowExternalInstructors={false}
      />
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
import LoadingSpinner from "../../components/ui/LoadingSpinner";
