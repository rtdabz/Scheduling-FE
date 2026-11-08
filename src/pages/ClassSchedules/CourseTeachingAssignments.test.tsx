import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache, getCachedData } from '../../lib/dataCache';
import CourseTeachingAssignments from './CourseTeachingAssignments';

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
const courseRow = (code: string) => screen.getByText(code, { selector: 'p' }).closest('tr')!;
const openPage = async () => {
  render(<CourseTeachingAssignments />);
  await screen.findByRole('checkbox', { name: 'Select GEC 2' });
};

describe('Course Teaching program selection', () => {
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
    expect(programSelect().value).toBe('');
    expect(Array.from(programSelect().options, (option) => option.text)).toEqual([
      'Any Program', 'BSIT — Bachelor of Science in Information Technology',
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
    }));
    await waitFor(() => expect(within(courseRow('GEC 2')).getByText('Assigned')).toBeTruthy());
    expect(within(courseRow('GEC 2')).getByText(teacher, { exact: true })).toBeTruthy();
    expect(within(courseRow('PATH FIT 2')).getByText('BPED')).toBeTruthy();
    expect(within(courseRow('PATH FIT 2')).getByText('Assigned')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'Select PATH FIT 2' }) as HTMLInputElement).disabled).toBe(true);
    const cached = getCachedData<{ courses: Array<{ id: number; teaching_program_id: number | null }> }>('page:course-teaching-assignments:v11');
    expect(cached?.courses.find((course) => course.id === 101)?.teaching_program_id).toBe(programId);
    expect(cached?.courses.find((course) => course.id === 102)).toEqual(courses[1]);
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
