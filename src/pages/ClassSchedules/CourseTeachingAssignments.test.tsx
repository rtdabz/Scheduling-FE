import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache, getCachedData } from '../../lib/dataCache';
import CourseTeachingAssignments from './CourseTeachingAssignments';
import { useWorkflowGuide } from '../../hooks/useWorkflowGuide';

const { get, post, confirm } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), confirm: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({
  confirm, toast: { success: vi.fn(), error: vi.fn() },
}) }));
vi.mock('../../hooks/useWorkflowGuide', () => ({ useWorkflowGuide: vi.fn() }));
vi.mock('../../hooks/useLiveRefresh', () => ({ useLiveRevision: () => 0 }));

const departments = [
  { id: 1, department_code: 'CAS', department_name: 'College of Arts and Sciences' },
  { id: 2, department_code: 'COED', department_name: 'College of Education' },
  { id: 6, department_code: 'CIT', department_name: 'College of Information Technology' },
];
const programs = [
  { id: 11, department_id: 1, code: 'SOC', name: 'Sociology' },
  { id: 12, department_id: 1, code: 'CD', name: 'Community Development' },
  { id: 21, department_id: 2, code: 'BPED', name: 'Bachelor of Physical Education' },
  { id: 61, department_id: 6, code: 'BSIT', name: 'Bachelor of Science in Information Technology' },
];
const courses = [
  {
    id: 101, course_code: 'GEC 2', course_name: 'Readings in Philippine History',
    year_level: 1, units: 3, department_id: 6, department_code: 'CIT',
    curriculum_program_id: 61, curriculum_program_code: 'BSIT',
    curriculum_program_name: 'Bachelor of Science in Information Technology',
    teaching_department_id: null, teaching_program_id: null, delegable: true,
  },
  {
    id: 102, course_code: 'PATH FIT 2', course_name: 'Fitness Training',
    year_level: 1, units: 2, department_id: 6, department_code: 'CIT',
    curriculum_program_id: 61, curriculum_program_code: 'BSIT',
    curriculum_program_name: 'Bachelor of Science in Information Technology',
    teaching_department_id: 2, teaching_department_code: 'COED',
    teaching_program_id: 21, teaching_program_code: 'BPED', delegable: true,
  },
];

beforeEach(() => {
  clearDataCache(); sessionStorage.clear(); vi.clearAllMocks();
  get.mockResolvedValue({ data: {
    courses, departments, programs, current_department_id: 6, has_active_curriculum: true,
    active_semester: { id: 1, semester: '2nd', academic_year: '2025-2026' },
  } });
  post.mockResolvedValue({ data: { course_ids: [101] } });
  confirm.mockResolvedValue(true);
});
afterEach(cleanup);

const programSelect = () => screen.getByRole('combobox', { name: 'Teaching Program (Optional)' }) as HTMLSelectElement;
const courseRow = (code: string) => screen.getByText(code, { selector: 'p' }).closest<HTMLElement>('[role="row"]')!;
const openPage = async () => {
  render(<CourseTeachingAssignments />);
  await screen.findByRole('checkbox', { name: 'Select GEC 2' });
};

describe('Course Teaching dialogs', () => {
  it('keeps the workspace on the page and places Returned Sections beside Assigned', async () => {
    await openPage();
    expect(screen.getByRole('table', { name: '1st Year courses' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Course Teaching' })).toBeNull();
    const actions = screen.getByRole('group', { name: 'Course assignment actions' });
    const assigned = within(actions).getByRole('button', { name: '1 Assigned' });
    const trigger = within(actions).getByRole('button', { name: 'Returned Sections 0 Returned' });
    expect(assigned.nextElementSibling).toBe(trigger);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select GEC 2' }));
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Returned Sections' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect((screen.getByRole('checkbox', { name: 'Select GEC 2' }) as HTMLInputElement).checked).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it('closes the assigned summary on Escape and restores focus to Assigned', async () => {
    await openPage();
    const summaryTrigger = screen.getByRole('button', { name: '1 Assigned' });
    summaryTrigger.focus();
    fireEvent.click(summaryTrigger);
    expect(screen.getByRole('dialog', { name: 'Assigned courses' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assigned courses' })).toBeNull());
    expect(screen.getByRole('table', { name: '1st Year courses' })).toBeTruthy();
    expect(document.activeElement).toBe(summaryTrigger);
  });

  it('shows the returned-section empty state only inside its modal', async () => {
    await openPage();
    expect(screen.queryByText('No returned sections')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Returned Sections 0 Returned' }));
    expect(screen.getByRole('dialog', { name: 'Returned Sections' })).toBeTruthy();
    expect(screen.getByText('No returned sections')).toBeTruthy();
    expect(within(screen.getByRole('dialog', { name: 'Returned Sections' })).queryByRole('checkbox')).toBeNull();
  });

  it('assigns an eligible returned section with the existing payload and refreshes the count', async () => {
    const returned = {
      section_id: 301, schedule_id: 1001, section_name: 'BSIT 1-A', status: 'Returned', returned: true,
      returned_from_department_id: 2, returned_from_department_code: 'COED',
      section_teaching_department_id: null, instructor_name: null, reassignable: true,
    };
    const locked = { ...returned, section_id: 302, schedule_id: 1002, section_name: 'BSIT 1-B', reassignable: false };
    const data = {
      courses: [{ ...courses[0], section_assignments: [
        returned, locked,
        { ...returned, section_id: 303, section_name: 'BSIT 1-C', section_teaching_department_id: 1 },
        { ...returned, section_id: 304, section_name: 'BSIT 1-D', instructor_name: 'Dr. Santos' },
      ] }],
      departments, programs, current_department_id: 6, has_active_curriculum: true,
      active_semester: { id: 1, semester: '2nd', academic_year: '2025-2026' },
    };
    get.mockResolvedValue({ data });
    render(<CourseTeachingAssignments />);
    fireEvent.click(await screen.findByRole('button', { name: 'Returned Sections 2 Returned' }));
    const dialog = screen.getByRole('dialog', { name: 'Returned Sections' });
    expect(within(dialog).getAllByText('Origin:', { exact: false })).toHaveLength(2);
    expect(within(dialog).getAllByText('COED', { exact: true })).toHaveLength(2);
    expect(within(dialog).queryByText('BSIT 1-C', { exact: false })).toBeNull();
    expect((screen.getByRole('combobox', { name: 'College for GEC 2 BSIT 1-B' }) as HTMLSelectElement).disabled).toBe(true);
    const college = screen.getByRole('combobox', { name: 'College for GEC 2 BSIT 1-A' });
    fireEvent.change(college, { target: { value: '1' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Program for GEC 2 BSIT 1-A' }), { target: { value: '12' } });
    get.mockResolvedValue({ data: { ...data, courses: [{ ...courses[0], section_assignments: [locked] }] } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign to CD' }));
    await waitFor(() => expect(post).toHaveBeenCalledExactlyOnceWith('/course-teaching-assignments/sections', {
      schedule_ids: [1001], teaching_department_id: 1, teaching_program_id: 12,
      expected_active_semester_id: 1,
    }));
    await screen.findByRole('button', { name: 'Returned Sections 1 Returned' });
    expect(screen.getByRole('dialog', { name: 'Returned Sections' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'College for GEC 2 BSIT 1-A' })).toBeNull();
  });
});

describe('Course Teaching program selection', () => {
  it('explains the actual year, course and program controls without clearing or saving selections', async () => {
    await openPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select GEC 2' }));
    const guide = vi.mocked(useWorkflowGuide).mock.calls.at(-1)![0];
    const steps = typeof guide.steps === 'function' ? guide.steps() : guide.steps;
    expect(steps.find((step) => step.element === '#course-teaching-year')).toBeTruthy();
    expect(steps.find((step) => step.element === '#course-teaching-course-filter')).toBeTruthy();
    expect(steps.find((step) => step.element === '#course-teaching-program')).toBeTruthy();
    expect(steps.every((step) => step.action === undefined || step.action === 'complete')).toBe(true);
    steps.forEach((step) => expect(document.querySelector(step.element)).toBeTruthy());
    expect((screen.getByRole('checkbox', { name: 'Select GEC 2' }) as HTMLInputElement).checked).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });
  it('explains Any Program and scopes options to the selected teaching college, resetting on a college change', async () => {
    await openPage();
    const select = programSelect();
    const description = screen.getByText('Select a program, or allow the college to choose an instructor.');
    expect(select.value).toBe('');
    expect(select.getAttribute('aria-describedby')).toBe(description.id);
    expect(Array.from(select.options, (option) => option.text)).toEqual([
      'Any Program', 'SOC — Sociology', 'CD — Community Development',
    ]);

    fireEvent.change(select, { target: { value: '11' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select GEC 2' }));
    fireEvent.click(screen.getByRole('button', { name: /College of Information Technology/ }));
    // CIT has one program, so there is nothing to choose: it is selected automatically.
    expect(programSelect().value).toBe('61');
    expect(programSelect().disabled).toBe(true);
    expect(Array.from(programSelect().options, (option) => option.text)).toEqual([
      'BSIT — Bachelor of Science in Information Technology',
    ]);
    expect((screen.getByRole('checkbox', { name: 'Select GEC 2' }) as HTMLInputElement).checked).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'Any Program', value: '', programId: null, teacher: 'CAS' },
    { name: 'a specific program', value: '12', programId: 12, teacher: 'CD' },
  ])('saves $name and displays it without changing existing assignments', async ({ value, programId, teacher }) => {
    await openPage();
    if (value) fireEvent.change(programSelect(), { target: { value } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select GEC 2' }));
    fireEvent.click(screen.getByRole('button', { name: `Assign 1 to ${teacher}` }));
    await waitFor(() => expect(post).toHaveBeenCalledExactlyOnceWith('/course-teaching-assignments/batch', {
      course_ids: [101], teaching_department_id: 1, teaching_program_id: programId,
      expected_active_semester_id: 1,
    }));
    await waitFor(() => expect(within(courseRow('GEC 2')).getByText('Assigned')).toBeTruthy());
    expect(within(courseRow('GEC 2')).getByText(teacher, { exact: true })).toBeTruthy();
    expect(within(courseRow('PATH FIT 2')).getByText('BPED')).toBeTruthy();
    expect(within(courseRow('PATH FIT 2')).getByText('Assigned')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Select PATH FIT 2' }) as HTMLInputElement).disabled).toBe(true);
    const cached = getCachedData<{ courses: Array<{ id: number; teaching_program_id: number | null }> }>('page:course-teaching-assignments:v13');
    expect(cached?.courses.find((course) => course.id === 101)?.teaching_program_id).toBe(programId);
    expect(cached?.courses.find((course) => course.id === 102)).toEqual(courses[1]);
  });

  it('leaves out the own department when it has only one program', async () => {
    get.mockResolvedValue({ data: {
      courses, departments, programs, current_department_id: 6, has_active_curriculum: true, active_semester: null,
      assignment_restrictions: { department_id: 6, own_program_ids: [61], own_department_excluded: true, requires_program: false },
    } });
    await openPage();
    expect(screen.queryByRole('button', { name: /College of Information Technology/ })).toBeNull();
    expect(screen.getByRole('button', { name: /College of Arts and Sciences/ })).toBeTruthy();
    expect(screen.getByText('CIT is not listed: its courses are managed within the department.')).toBeTruthy();
  });

  it('refreshes the semester and clears stale selections when activation happens before saving', async () => {
    await openPage();
    get.mockResolvedValue({ data: {
      courses: courses.map((course) => ({ ...course, teaching_department_id: null, teaching_program_id: null })),
      departments, programs, current_department_id: 6, has_active_curriculum: true,
      active_semester: { id: 2, semester: '1st', academic_year: '2026-2027' },
    } });
    post.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { message: 'The active semester changed.' } } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select GEC 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign 1 to CAS' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Select GEC 2' }) as HTMLInputElement).checked).toBe(false));
    expect(post.mock.calls[0][1].expected_active_semester_id).toBe(1);
    expect(within(courseRow('GEC 2')).queryByText('Assigned')).toBeNull();
    // The next submission uses the newly fetched semester, rather than retrying in the old context.
    post.mockResolvedValue({ data: { course_ids: [101] } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select GEC 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign 1 to CAS' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1].expected_active_semester_id).toBe(2);
  });

  it('never offers the own program, and needs another program within the own department', async () => {
    get.mockResolvedValue({ data: {
      courses, departments,
      programs: [
        ...programs,
        { id: 62, department_id: 6, code: 'BSCS', name: 'Computer Science' },
        { id: 63, department_id: 6, code: 'BSIS', name: 'Information Systems' },
      ],
      current_department_id: 6, has_active_curriculum: true, active_semester: null,
      assignment_restrictions: { department_id: 6, own_program_ids: [61], own_department_excluded: false, requires_program: true },
    } });
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: /College of Information Technology/ }));
    expect(Array.from(programSelect().options, (option) => option.text)).toEqual([
      'Select a program', 'BSCS — Computer Science', 'BSIS — Information Systems',
    ]);
    const gec = screen.getByRole('checkbox', { name: 'Select GEC 2' }) as HTMLInputElement;
    expect(gec.disabled).toBe(true);
    expect(within(courseRow('GEC 2')).getByText('Select another program')).toBeTruthy();

    fireEvent.change(programSelect(), { target: { value: '62' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select GEC 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign 1 to BSCS' }));
    await waitFor(() => expect(post).toHaveBeenCalledExactlyOnceWith('/course-teaching-assignments/batch', {
      course_ids: [101], teaching_department_id: 6, teaching_program_id: 62,
    }));
  });

  it('selects the only remaining program of the own department automatically', async () => {
    get.mockResolvedValue({ data: {
      courses, departments,
      programs: [...programs, { id: 62, department_id: 6, code: 'BSCS', name: 'Computer Science' }],
      current_department_id: 6, has_active_curriculum: true, active_semester: null,
      assignment_restrictions: { department_id: 6, own_program_ids: [61], own_department_excluded: false, requires_program: true },
    } });
    await openPage();
    fireEvent.click(screen.getByRole('button', { name: /College of Information Technology/ }));
    expect(programSelect().value).toBe('62');
    expect(programSelect().disabled).toBe(true);
    expect(Array.from(programSelect().options, (option) => option.text)).toEqual(['BSCS — Computer Science']);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select GEC 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Assign 1 to BSCS' }));
    await waitFor(() => expect(post).toHaveBeenCalledExactlyOnceWith('/course-teaching-assignments/batch', {
      course_ids: [101], teaching_department_id: 6, teaching_program_id: 62,
    }));
  });

  it('preserves course sorting, searching, and filtering in the existing table', async () => {
    await openPage();
    const sort = screen.getByRole('button', { name: 'Sort by Course' });
    fireEvent.click(sort); fireEvent.click(sort);
    const rows = within(screen.getByRole('table', { name: '1st Year courses' })).getAllByRole('row');
    expect(within(rows[1]).getByText('PATH FIT 2')).toBeTruthy();
    expect(within(rows[2]).getByText('GEC 2')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search courses' }), { target: { value: 'Fitness' } });
    expect(screen.queryByRole('checkbox', { name: 'Select GEC 2' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Select PATH FIT 2' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search courses' }), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Course' }), { target: { value: '101' } });
    expect(screen.getByRole('checkbox', { name: 'Select GEC 2' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Select PATH FIT 2' })).toBeNull();
  });
});

describe('courseNameLines', () => {
  it('puts two main words on each line, not counting minor words', async () => {
    const { courseNameLines } = await import('../../lib/courseNameLines');
    expect(courseNameLines('Readings in Philippine History')).toEqual(['Readings in Philippine', 'History']);
    expect(courseNameLines('Fitness Training')).toEqual(['Fitness Training']);
    expect(courseNameLines('History of the Philippines and Its Culture')).toEqual(['History of the Philippines', 'and Its Culture']);
  });
});
