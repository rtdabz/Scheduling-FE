import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarSchedule, GanttDay } from '../vpaa/calendar/ganttLayout';
import { clearDataCache } from '../../lib/dataCache';
import InstructorAssignment from './InstructorAssignment';
import CrossDepartmentAssignments from './CrossDepartmentAssignments';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';

const { get, patch, post, useScheduler, autoAssign } = vi.hoisted(() => ({
  get: vi.fn(), patch: vi.fn(), post: vi.fn(), useScheduler: vi.fn(), autoAssign: vi.fn(),
}));
vi.mock('../../lib/api', () => ({ default: { get, patch, post } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../../hooks/useWorkflowGuide', () => ({ useWorkflowGuide: vi.fn() }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRevision: () => 0 }));
vi.mock('../../lib/liveUpdates', () => ({ publishLiveTopics: vi.fn() }));
vi.mock('./SchedulerPanel/hooks/useScheduler', () => ({ useScheduler }));
vi.mock('./SchedulerPanel/Modals/AutoAssignModal', () => ({ default: (props: unknown) => { autoAssign(props); return null; } }));
vi.mock('../vpaa/calendar/MasterGantt', () => ({ default: ({ days, onSelect }: {
  days: GanttDay[]; onSelect: (schedule: CalendarSchedule) => void;
}) => <>{days.flatMap((day) => day.rows.flatMap((row) => row.blocks.map(({ schedule }) => (
  <button key={schedule.id} onClick={() => onSelect(schedule)}>Class {schedule.id}</button>
))))}</> }));
vi.mock('./SchedulerPanel/Modals/FacultyModal', () => ({ default: ({ facultyAssignmentPopup }: {
  facultyAssignmentPopup: unknown;
}) => facultyAssignmentPopup ? <div role="dialog">Instructor editor</div> : null }));

const departments = [
  { id: 6, department_code: 'CIT', department_name: 'Information Technology' },
  { id: 7, department_code: 'CLIS', department_name: 'Library and Information Science' },
  { id: 8, department_code: 'CHM', department_name: 'Hospitality Management' },
];
const courseDefaults = {
  id: 1, course_code: 'IT 101', course_name: 'Information Technology', subject_code: 'IT 101',
  subject_name: 'Information Technology', course_category: 'minor', subject_category: 'minor',
  department_id: 7, teaching_department_id: 6, program_id: null as number | null,
  teaching_program_id: null as number | null, units: 3,
};
const course = (id: number, overrides: Partial<typeof courseDefaults> = {}) => ({ ...courseDefaults, id, ...overrides });
const scheduleDefaults = {
  id: 1, semester_id: 1, department_id: 7, course_id: 1, section_id: 31, faculty_id: 10 as number | null,
  faculty_assignment_done: false, status: 'submitted', day: 'Monday', start_time: '08:00:00', end_time: '09:30:00',
  section: { section_name: 'BLIS 1A' }, room: { room_code: 'LIB-101' },
  faculty: { first_name: 'IT', last_name: 'Instructor' } as { first_name: string; last_name: string } | null,
};
const schedule = (id: number, overrides: Partial<typeof scheduleDefaults> = {}) => ({ ...scheduleDefaults, id, ...overrides });
const faculty = { id: 10, first_name: 'IT', last_name: 'Instructor', department_id: 6, status: 'active' };
let payload: {
  active_semester: { id: number; semester: string; academic_year: string; is_active: boolean };
  current_department_id: number; departments: typeof departments;
  subjects: ReturnType<typeof course>[]; schedules: ReturnType<typeof schedule>[]; faculties: typeof faculty[];
};
const scheduler = {
  schedules: [] as Array<{ id: string; departmentId: number; courseId: string; status: string; facultyAssignmentDone: boolean }>,
  subjects: [] as Array<{ id: string; teachingDepartmentId: number; teachingProgramId: number | null; programId: number | null }>,
  faculties: [{ id: '10', departmentId: 6 }], userDepartmentId: 6, userProgramId: null,
  isLoading: false, facultyActionSlotId: null, canManageScheduleFaculty: () => true,
  checkFacultyConflict: () => null, handleBulkFacultyAssign: vi.fn(),
  handleRemoveFacultyFromClass: vi.fn(), handleFacultyAssignmentDone: vi.fn(),
};
const syncScheduler = () => {
  scheduler.schedules = payload.schedules.map((row) => ({
    id: String(row.id), departmentId: row.department_id, courseId: String(row.course_id),
    status: row.status, facultyAssignmentDone: row.faculty_assignment_done,
  }));
  scheduler.subjects = payload.subjects.map((row) => ({
    id: String(row.id), teachingDepartmentId: row.teaching_department_id,
    teachingProgramId: row.teaching_program_id, programId: row.program_id,
  }));
};
beforeEach(() => {
  clearDataCache(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ role: 'secretary', department_id: 6 }));
  window.history.replaceState(null, '', '/');
  payload = {
    active_semester: { id: 1, semester: '1st', academic_year: '2026-2027', is_active: true },
    current_department_id: 6, departments, subjects: [course(1)], schedules: [schedule(1)], faculties: [faculty],
  };
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/instructor-assignments' ? payload : [] }));
  patch.mockImplementation((_url: string, body: { faculty_id: number | null }) => Promise.resolve({
    data: { schedule: { ...payload.schedules[0], faculty_id: body.faculty_id, faculty: body.faculty_id ? faculty : null } },
  }));
  scheduler.handleBulkFacultyAssign.mockResolvedValue(false);
  scheduler.handleRemoveFacultyFromClass.mockResolvedValue(false);
  scheduler.handleFacultyAssignmentDone.mockResolvedValue(false);
  syncScheduler(); useScheduler.mockReturnValue(scheduler);
});
afterEach(cleanup);

const openDepartment = async (code = 'CLIS') => {
  fireEvent.click(await screen.findByRole('button', { name: `View ${code} timetable` }));
};
const expandSection = (name = 'BLIS 1A') => {
  const button = screen.getByRole('button', { name: `Section ${name}` });
  if (button.getAttribute('aria-expanded') === 'false') fireEvent.click(button);
};

describe('assignment help context', () => {
  const steps = () => {
    const guide = vi.mocked(useWorkflowGuide).mock.calls.at(-1)![0];
    return typeof guide.steps === 'function' ? guide.steps() : guide.steps;
  };

  it('starts inside a deep-linked department and preserves the saved Grid view', async () => {
    localStorage.setItem('instructor-assignment:view', 'grid');
    window.history.replaceState(null, '', '/secretary/instructor-assignment?department=7');
    expect(window.location.search).toBe('?department=7');
    render(<InstructorAssignment />);
    await screen.findByRole('button', { name: 'Back to departments' }, { timeout: 5000 });
    const guideSteps = steps();
    expect(guideSteps.some((step) => step.element === '#instructor-assignment-overview')).toBe(false);
    expect(guideSteps.some((step) => step.element === '#instructor-assignment-timetable')).toBe(true);
    guideSteps.forEach((step) => expect(document.querySelector(step.element)).toBeTruthy());
    expect(localStorage.getItem('instructor-assignment:view')).toBe('grid');
    expect(patch).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps immediate-save instructor choices review-only in List view', async () => {
    payload.schedules[0].status = 'approved';
    render(<InstructorAssignment />);
    await openDepartment();
    const guideSteps = steps();
    expect(guideSteps.find((step) => step.element === '#instructor-assignment-worklist')?.action).toBeUndefined();
    expect(guideSteps.every((step) => step.action !== 'select' && step.action !== 'submit')).toBe(true);
    expect(patch).not.toHaveBeenCalled();
  });

  it('uses the same contextual workspace help for delegated assignments', async () => {
    render(<CrossDepartmentAssignments />);
    await openDepartment();
    const guide = vi.mocked(useWorkflowGuide).mock.calls.at(-1)![0];
    expect(guide.id).toBe('cross-department-assignment');
    steps().forEach((step) => expect(document.querySelector(step.element)).toBeTruthy());
    expect(scheduler.handleFacultyAssignmentDone).not.toHaveBeenCalled();
  });
});

describe('cross-department assignment visibility', () => {
  it.each(['submitted', 'revision', 'approved_by_dean', 'finalized'])('retains assigned %s classes read-only without duplicate courses or unassigned preapproval rows', async (status) => {
    payload.subjects.push(course(2, { course_code: 'HIDDEN', teaching_department_id: 8 }));
    payload.schedules = [
      schedule(1, { status }), schedule(2, { status, day: 'Tuesday' }),
      schedule(3, { status: 'submitted', faculty_id: null, faculty: null, section_id: 32, section: { section_name: 'BLIS 1B' } }),
      schedule(4, { status: 'approved', course_id: 2 }),
    ];
    const workspace = vi.fn();
    render(<InstructorAssignment onWorkspaceStateChange={workspace} />);
    await openDepartment(); expandSection();
    expect(screen.getAllByText('IT 101')).toHaveLength(1);
    expect(screen.getByText('IT Instructor')).toBeTruthy();
    expect(screen.getByText('LIB-101')).toBeTruthy();
    expect(screen.queryByText('HIDDEN')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Section BLIS 1B' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Instructor for IT 101 BLIS 1A' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Clear All Instructors' }) as HTMLButtonElement).disabled).toBe(true);
    expect(workspace.mock.calls.at(-1)?.[0].scheduleIds).toEqual([1, 2]);
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    if (status === 'finalized') fireEvent.click(screen.getByRole('button', { name: 'Class 1' }));
    else expect(screen.queryByRole('button', { name: 'Class 1' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(patch).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
  });

  it('keeps retained assignments in List while showing only final VPAA-approved classes in Grid', async () => {
    payload.schedules = [
      schedule(1, { status: 'submitted' }),
      schedule(2, { status: 'approved', section_id: 32, section: { section_name: 'BLIS 1B' } }),
      schedule(3, { status: 'approved_by_dean', section_id: 33, section: { section_name: 'BLIS 1C' } }),
    ];
    render(<InstructorAssignment />);
    await openDepartment();
    expect(screen.getByRole('button', { name: 'Section BLIS 1A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Section BLIS 1C' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(screen.getByRole('button', { name: 'Class 2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Class 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Class 3' })).toBeNull();
    expect(screen.getByText('1 of 1 classes assigned')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'Section BLIS 1A' })).toBeTruthy();
    expect(screen.getByText('3 of 3 classes assigned')).toBeTruthy();
  });

  it('keeps approved assignments in other departments editable', async () => {
    payload.schedules = [schedule(1, { status: 'approved' }), schedule(2, {
      status: 'approved', department_id: 8, section_id: 41, section: { section_name: 'BSHM 1A' },
    })];
    render(<InstructorAssignment />);
    await openDepartment('CHM'); expandSection('BSHM 1A');
    expect(screen.getByRole('combobox', { name: 'Instructor for IT 101 BSHM 1A' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Class 2' }));
    expect(screen.getByRole('dialog').textContent).toContain('Instructor editor');
  });

  it('includes sibling program delegation once and protects hidden local assignments when clearing a section', async () => {
    payload.subjects = [
      course(1, { department_id: 6, program_id: 12, teaching_program_id: 11 }),
      course(2, { department_id: 6, teaching_department_id: 6, program_id: 12, course_code: 'LOCAL' }),
    ];
    payload.schedules = [
      schedule(1, { department_id: 6, status: 'approved' }),
      schedule(2, { department_id: 6, status: 'approved', day: 'Tuesday' }),
      schedule(3, { department_id: 6, course_id: 2, status: 'approved' }),
    ];
    const workspace = vi.fn();
    render(<InstructorAssignment onWorkspaceStateChange={workspace} />);
    await openDepartment('CIT'); expandSection();
    expect(screen.getAllByText('IT 101')).toHaveLength(1);
    expect(screen.queryByText('LOCAL')).toBeNull();
    expect(workspace.mock.calls.at(-1)?.[0].scheduleIds).toEqual([1, 2]);
    const clear = screen.getByRole('button', { name: 'Clear All Instructors' }) as HTMLButtonElement;
    expect(clear.disabled).toBe(true); fireEvent.click(clear);
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove instructor from IT 101 BLIS 1A' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/instructor-assignments/1', { faculty_id: null }));
  });

  it('does not offer another sibling teaching program to a program head', async () => {
    localStorage.setItem('user', JSON.stringify({ role: 'program_head', department_id: 6, program_id: 12 }));
    payload.subjects = [course(1, { department_id: 6, program_id: 12, teaching_program_id: 11 })];
    payload.schedules = [schedule(1, { department_id: 6, status: 'approved' })];
    render(<InstructorAssignment />);
    await screen.findByText('No incoming courses or approved schedules yet.');
    expect(screen.queryByRole('button', { name: 'View CIT timetable' })).toBeNull();
  });
});

describe('Cross-Department bulk actions', () => {
  it('keeps retained submitted assignments out of Done and Auto-Assign', async () => {
    render(<CrossDepartmentAssignments />);
    await openDepartment();
    expect((screen.getByRole('button', { name: 'Done Assigning' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Auto-Assign Instructor' }) as HTMLButtonElement).disabled).toBe(true);
    expect(autoAssign.mock.calls.at(-1)?.[0].schedules).toEqual([]);
    expect(scheduler.handleFacultyAssignmentDone).not.toHaveBeenCalled();
  });

  it('offers only approved rows from a mixed timetable and rejects retained row mutations', async () => {
    payload.schedules.push(schedule(2, { status: 'approved', section_id: 32, section: { section_name: 'BLIS 1B' } }));
    syncScheduler();
    render(<CrossDepartmentAssignments />);
    await openDepartment();
    expect((screen.getByRole('button', { name: 'Done Assigning' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Auto-Assign Instructor' }) as HTMLButtonElement).disabled).toBe(false);
    const modal = autoAssign.mock.calls.at(-1)?.[0];
    expect(modal.schedules.map((row: { id: string }) => row.id)).toEqual(['2']);
    await act(async () => {
      expect(await modal.onAssign([{ scheduleIds: ['1'], facultyId: '10' }])).toBe(false);
      expect(await modal.onRemoveAssignment(['1'])).toBe(false);
      await modal.onAssign([{ scheduleIds: ['2'], facultyId: '10' }]);
    });
    expect(scheduler.handleRemoveFacultyFromClass).not.toHaveBeenCalled();
    expect(scheduler.handleBulkFacultyAssign).toHaveBeenCalledExactlyOnceWith([{ scheduleIds: ['2'], facultyId: '10' }]);
  });

  it('preserves Done Assigning for a fully approved assigned timetable', async () => {
    payload.schedules[0].status = 'approved'; syncScheduler();
    render(<CrossDepartmentAssignments />);
    await openDepartment();
    fireEvent.click(screen.getByRole('button', { name: 'Done Assigning' }));
    await waitFor(() => expect(scheduler.handleFacultyAssignmentDone).toHaveBeenCalledExactlyOnceWith(true, ['1']));
  });
});
