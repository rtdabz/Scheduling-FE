import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../lib/dataCache';
import DeanDashboardPage from '../pages/dean/DeanDashboardPage';
import SecretaryDashboardPage from '../pages/secretary/SecretaryDashboardPage';
import DeanSchedules from '../pages/dean/Schedules';
import InstructorTimetableModal from './InstructorTimetableModal';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../lib/api', () => ({ default: { get, post: vi.fn() } }));
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ toast: { error: vi.fn(), success: vi.fn() } }),
}));
// These tests exercise the real Gantt; unrelated dashboard charts need no layout.
vi.mock('recharts', async () => ({
  ...await vi.importActual<typeof import('recharts')>('recharts'),
  ResponsiveContainer: () => null,
}));

const department = { id: 6, department_name: 'Information Technology', department_code: 'CIT', logo: '/cit-logo.png' };
const otherDepartment = { id: 7, department_name: 'Business Administration', department_code: 'CBA', logo: '/cba-logo.png' };
const schedule = {
  id: 1, semester_id: 1, department_id: 6, section_id: 1, faculty_id: 1, room_id: 1,
  day: 'Monday', start_time: '08:00:00', end_time: '09:30:00', status: 'submitted', mode: 'on-site',
  // Actual schedule relations omit logo; only the directory has the upload.
  department: { id: 6, department_name: department.department_name, department_code: 'CIT' },
  section: { id: 1, section_name: 'BSIT 1A' },
  room: { id: 1, room_code: 'R 301', room_type: 'lecture' },
  faculty: { id: 1, first_name: 'Grace', last_name: 'Hopper' },
  course: { id: 1, course_code: 'IT 101', course_name: 'Introduction to IT', units: 3 },
};
const initialData = {
  active_semester: { id: 1, status: 'active', is_active: true },
  departments: [department, otherDepartment], schedules: [schedule],
  sections: [{ id: 1, section_name: 'BSIT 1A', department_id: 6, semester_id: 1 }],
  rooms: [schedule.room], faculties: [], courses: [],
};

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  localStorage.setItem('user', JSON.stringify({ id: 9, role: 'dean', department_id: 6 }));
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/initial-data') return Promise.resolve({ data: initialData });
    if (url === '/departments') return Promise.resolve({ data: [department, otherDepartment] });
    if (url === '/schedules') return Promise.resolve({ data: [schedule] });
    if (url === '/departments/6/schedule-status') return Promise.resolve({ data: { sections: [] } });
    return Promise.resolve({ data: [] });
  });
});
afterEach(cleanup);

const findBlock = () => screen.findByRole('button', { name: /IT 101 lecture/ });
const expectLogo = (block: HTMLElement) => {
  expect(within(block).getByRole('img', { name: 'Information Technology logo' }).getAttribute('src')).toBe(department.logo);
};

describe('department logo data reaches each Gantt', () => {
  it.each(['dean', 'secretary', 'program_head'] as const)('joins the department directory on the %s dashboard', async role => {
    localStorage.setItem('user', JSON.stringify({ id: 9, role, department_id: 6, permissions: ['schedule.view'] }));
    render(<MemoryRouter>{role === 'dean' ? <DeanDashboardPage /> : <SecretaryDashboardPage role={role} />}</MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Week' }));
    const block = await findBlock();
    expectLogo(block);
    fireEvent.click(block);
    expect(within(await screen.findByRole('dialog')).getByRole('img', { name: 'Information Technology logo' }).getAttribute('src')).toBe(department.logo);
  });

  it('preserves the department logo through the dean schedule adapter', async () => {
    render(<MemoryRouter><DeanSchedules /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
    expectLogo(await findBlock());
  });

  it('resolves each instructor meeting by its own department, including cross-department meetings', async () => {
    get.mockImplementation((url: string) => Promise.resolve({ data: url === '/departments' ? [department, otherDepartment] : [
      schedule,
      { ...schedule, id: 2, department_id: 7, department: undefined, day: 'Tuesday' },
    ] }));
    render(<InstructorTimetableModal isOpen facultyId={1} facultyName="Grace Hopper" onClose={() => undefined} />);
    await screen.findByRole('img', { name: 'Business Administration logo' });
    expect(screen.getByRole('img', { name: 'Information Technology logo' }).getAttribute('src')).toBe(department.logo);
    expect(screen.getByRole('img', { name: 'Business Administration logo' }).getAttribute('src')).toBe(otherDepartment.logo);
  });

  it('keeps the instructor timetable available if the logo directory fails', async () => {
    get.mockImplementation((url: string) => url === '/departments'
      ? Promise.reject(new Error('Directory unavailable')) : Promise.resolve({ data: [schedule] }));
    render(<InstructorTimetableModal isOpen facultyId={1} facultyName="Grace Hopper" onClose={() => undefined} />);
    const block = await findBlock();
    expect(within(block).getByRole('img', { name: /Information Technology.*no logo uploaded/ })).toBeTruthy();
  });
});
