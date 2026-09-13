import { useCallback, useMemo, useRef, useState } from 'react';
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
  const selectedDepartmentRef = useRef<number | null>(null);
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
    { element: '[data-tour="department-card"]', waitFor: '#instructor-assignment-departments', action: 'click' as const, skipIfMissing: true, taskHint: 'Click a department card to continue.', title: 'Choose a source department', description: 'Open the department that owns the course. With only one, it opens for you.', side: 'top' as const },
    { element: '#assignment-status-filter', action: 'select' as const, skipIfMissing: true, taskHint: 'Choose "Needs instructor" to continue.', title: 'Show only what is left', description: 'Narrow the list to classes that still have nobody assigned.', side: 'bottom' as const },
    { element: "#instructor-assignment-worklist select[id^='worklist-faculty-']:not([disabled])", waitFor: '#instructor-assignment-worklist', skipIfMissing: true, title: 'Assign an instructor', description: 'Pick an eligible instructor straight from the row — it saves as you choose.', side: 'top' as const },
  ], []);
  useWorkflowGuide({ id: 'cross-department-assignment', isReady: !scheduler.isLoading && isAssignmentWorkspaceReady, steps: crossDepartmentGuideSteps, mission: 'Cover Delegated Courses' });
  const allAssigned = workspaceState.allAssigned;
  const visibleDelegatedSchedules = useMemo(
    () => delegatedSchedules.filter((schedule) => workspaceState.scheduleIds.includes(Number(schedule.id))),
    [delegatedSchedules, workspaceState.scheduleIds],
  );

  const handleWorkspaceStateChange = useCallback((state: InstructorAssignmentWorkspaceState) => {
    if (selectedDepartmentRef.current !== state.selectedDepartmentId) {
      selectedDepartmentRef.current = state.selectedDepartmentId;
      setCompletionOverride(null);
    }
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
          <>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              disabled={assignmentDone || visibleDelegatedSchedules.length === 0 || !visibleDelegatedSchedules.some((schedule) => ['approved', 'faculty_assignment', 'reassignment'].includes(schedule.status))}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#4e0a10] px-3 text-xs font-black text-white shadow-sm transition hover:bg-[#6b1118] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserCheck className="h-4 w-4" />
              Auto-Assign Instructor
            </button>
            {assignmentDone && (
              <button
                type="button"
                onClick={() => { void handleDoneToggle(); }}
                disabled={isUpdatingDone}
                title="Reassign instructors for this timetable"
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#C9952A] px-3 text-xs font-black text-white shadow-sm transition hover:bg-[#b8841f] disabled:cursor-wait disabled:opacity-70"
              >
                {isUpdatingDone ? <LoadingSpinner className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {isUpdatingDone ? 'Unlocking...' : 'Reassignment'}
              </button>
            )}
            {!assignmentDone && (
              <button
                type="button"
                onClick={() => { void handleDoneToggle(); }}
                disabled={isUpdatingDone || !allAssigned}
                title={!allAssigned ? 'Assign all instructors before marking done' : undefined}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#4e0a10] bg-white px-3 text-xs font-black text-[#4e0a10] shadow-sm transition hover:bg-[#4e0a10]/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUpdatingDone ? <LoadingSpinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {isUpdatingDone ? 'Updating...' : 'Done Assigning'}
              </button>
            )}
          </>
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
