import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted above the module body, so the spies have to be
// hoisted with them rather than declared as plain top-level consts.
const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../lib/api', () => ({ default: { get, post, patch, delete: vi.fn() } }));
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }),
}));

import Departments from './Departments';
import { clearDataCache } from '../../lib/dataCache';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});

describe('Dean role department scoping', () => {
  it('filters departments to only show the assigned department when logged in as a Dean', async () => {
    sessionStorage.setItem('user', JSON.stringify({
      id: 10,
      name: 'Dean Smith',
      role: 'dean',
      department_id: 2,
      department: { id: 2, department_name: 'College of Information Technology', department_code: 'CIT' }
    }));

    render(<Departments />);

    expect(await screen.findByText('College of Information Technology')).toBeTruthy();
    expect(screen.queryByText('College of Education')).toBeNull();
    expect(screen.queryByText('Add Department')).toBeNull();
  });
});


const LOGO = 'data:image/jpeg;base64,AAAA';

const apiDepartment = (over: Record<string, unknown> & { id: number }) => ({
  department_code: 'CED',
  department_name: 'College of Education',
  logo: null,
  created_at: '2026-06-01T00:00:00.000000Z',
  faculties_count: 4,
  sections_count: 7,
  users: [{ name: 'Dr. Juan dela Cruz', role: 'dean' }],
  ...over,
});

const departments = [
  apiDepartment({ id: 1 }),
  apiDepartment({
    id: 2,
    department_code: 'CIT',
    department_name: 'College of Information Technology',
    logo: LOGO,
  }),
];

const nameInput = () => screen.getByPlaceholderText('e.g. College of Computing Studies');
const codeInput = () => screen.getByPlaceholderText('e.g. CIT');

/** Reaches the edit form the way a user does: row -> detail modal -> Edit. */
const openEditModalFor = async (departmentName: string) => {
  fireEvent.click(await screen.findByText(departmentName));
  fireEvent.click(screen.getByText('Edit Department'));
};

beforeEach(() => {
  clearDataCache();
  sessionStorage.clear();
  localStorage.clear();
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/departments' ? departments : [] }));
  post.mockImplementation((_url: string, payload: Record<string, unknown>) =>
    Promise.resolve({ data: apiDepartment({ id: 3, ...payload }) }));
  patch.mockImplementation((_url: string, payload: Record<string, unknown>) =>
    Promise.resolve({ data: apiDepartment({ id: 1, ...payload }) }));
});

describe('Departments management identifies departments by logo', () => {
  it('replaces the code column with a logo column', async () => {
    render(<Departments />);

    expect(await screen.findByText('Logo')).toBeTruthy();
    expect(screen.queryByText('Scheduling Profile')).toBeNull();
    expect(screen.queryByText('Code')).toBeNull();
    expect(screen.queryByText('CED')).toBeNull();
    expect(screen.queryByText('CIT')).toBeNull();
  });

  it('shows the uploaded logo, and a placeholder for departments without one', async () => {
    render(<Departments />);

    const uploaded = await screen.findByAltText('College of Information Technology logo');
    expect(uploaded.getAttribute('src')).toBe(LOGO);
    expect(screen.getByLabelText('College of Education — no logo uploaded')).toBeTruthy();
  });

  it('shows the department details without a scheduling profile', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('College of Information Technology'));

    expect(screen.getByText('CIT')).toBeTruthy();
    expect(screen.queryByText(/Scheduling profile/i)).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Use specialized rooms' })).toBeNull();
  });
});

describe('Departments scheduling profile removal', () => {
  it('is no longer on the create form', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    expect(screen.queryByDisplayValue('Standard')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('Departments management takes a typed department code', () => {
  it('sends the typed code, upper-cased, on create', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.change(codeInput(), { target: { value: 'ccs' } });
    fireEvent.click(screen.getByText('Create Department'));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({
      department_name: 'College of Computing Studies',
      department_code: 'CCS',
    });
  });

  it('requires a code', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.click(screen.getByText('Create Department'));

    expect(await screen.findByText('Department code is required')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks a code another department already uses', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.change(codeInput(), { target: { value: 'CIT' } });
    fireEvent.click(screen.getByText('Create Department'));

    expect(await screen.findByText('CIT is already used by College of Information Technology.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the API error when an archived department still holds the code', async () => {
    post.mockRejectedValueOnce({
      response: { status: 422, data: { errors: { department_code: ['This code belongs to an existing or archived department.'] } } },
    });
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Computing Studies' } });
    fireEvent.change(codeInput(), { target: { value: 'CCS' } });
    fireEvent.click(screen.getByText('Create Department'));

    expect(await screen.findByText('This code belongs to an existing or archived department.')).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('prefills the code when editing and saves changes to it', async () => {
    render(<Departments />);
    await openEditModalFor('College of Education');

    expect((codeInput() as HTMLInputElement).value).toBe('CED');
    fireEvent.change(codeInput(), { target: { value: 'COE' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).toMatchObject({ department_name: 'College of Education', department_code: 'COE' });
    expect(patch.mock.calls[0][1]).not.toHaveProperty('scheduling_profile');
  });

  it('does not assign a secretary user as the dean when no dean is assigned', async () => {
    get.mockResolvedValueOnce({
      data: [
        apiDepartment({
          id: 1,
          department_name: 'College of Information Technology',
          department_code: 'CIT',
          users: [{ name: 'Kay Rejoice Waga', role: 'secretary' }],
        }),
      ],
    });

    render(<Departments />);
    fireEvent.click(await screen.findByText('College of Information Technology'));

    expect(await screen.findByText('Department profile')).toBeTruthy();
    expect(screen.getByText('Dean', { selector: 'p' }).parentElement?.textContent).toContain('Not assigned');
    expect(screen.getByText('Kay Rejoice Waga')).toBeTruthy();
  });

  it('shows an alert and prevents submitting when inputting a duplicate department name', async () => {
    render(<Departments />);

    fireEvent.click(await screen.findByText('Add Department'));
    fireEvent.change(nameInput(), { target: { value: 'College of Education' } });

    expect(screen.getByText(/Duplicate detected: A department named “College of Education” already exists/i)).toBeTruthy();
    fireEvent.click(screen.getByText('Create Department'));

    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText('A department named "College of Education" already exists.')).toBeTruthy();
  });
});

describe('VPAA department profile', () => {
  const program = { id: 21, department_id: 2, code: 'BSIT', name: 'Bachelor of Science in Information Technology', major: null };
  const pageData = (url: string) => Promise.resolve({
    data: url === '/departments' ? [departments[0], { ...departments[1], programs: [program] }] : [],
  });

  beforeEach(() => {
    sessionStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa' }));
    get.mockImplementation(pageData);
  });

  it('moves instructors before facilities and shows only the department laboratory and lecture rooms', async () => {
    let rooms = [
      { id: 1, department_id: 2, room_code: 'LAB 201', building: 'Technology Annex', room_type: 'laboratory', status: 'not available' },
      { id: 2, department_id: 2, room_code: 'CIT 101', building: 'Main Building', room_type: 'lecture', status: 'available' },
      { id: 3, department_id: 1, room_code: 'CED 101', building: 'Education Building', room_type: 'lecture', status: 'available' },
      { id: 4, department_id: null, room_code: 'SHARED 1', building: 'Shared Building', room_type: 'lecture', status: 'available' },
      { id: 5, department_id: 2, room_code: 'ONLINE 1', building: '', room_type: 'online', status: 'available' },
      { id: 6, department_id: 2, room_code: 'FIELD 1', building: '', room_type: 'field', status: 'available' },
    ];
    get.mockImplementation((url: string) => {
      if (url === '/rooms') return Promise.resolve({ data: rooms });
      if (url === '/faculties') return Promise.resolve({ data: [
        { id: 1, department_id: 2, first_name: 'Irene', last_name: 'Santos', employment_type: 'full-time' },
      ] });
      return pageData(url);
    });

    render(<Departments />);
    fireEvent.click(await screen.findByText('College of Information Technology'));

    expect(await screen.findByText('LAB 201')).toBeTruthy();
    expect(screen.getByText('Technology Annex')).toBeTruthy();
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(screen.getByText('Irene Santos')).toBeTruthy();
    const laboratoryButton = screen.getByRole('button', { name: /^Laboratory/ });
    const lectureButton = screen.getByRole('button', { name: /^Lecture Room/ });
    expect(laboratoryButton.getAttribute('aria-pressed')).toBe('true');
    expect(lectureButton.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText('CIT 101')).toBeNull();

    fireEvent.click(lectureButton);
    expect(lectureButton.getAttribute('aria-pressed')).toBe('true');
    expect(laboratoryButton.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('CIT 101')).toBeTruthy();
    expect(screen.getByText('Main Building')).toBeTruthy();
    expect(screen.queryByText('LAB 201')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Program directory' })).toBeNull();
    for (const excluded of ['CED 101', 'SHARED 1', 'ONLINE 1', 'FIELD 1']) {
      expect(screen.queryByText(excluded)).toBeNull();
    }
    const profileHeadings = ['Leadership', 'Program heads', 'Instructors', 'Facilities'];
    expect(screen.getAllByRole('heading').map((heading) => heading.textContent)
      .filter((name) => profileHeadings.includes(name ?? ''))).toEqual(profileHeadings);

    fireEvent.click(laboratoryButton);
    expect(screen.getByText('LAB 201')).toBeTruthy();
    expect(screen.queryByText('CIT 101')).toBeNull();
    rooms = [{ id: 7, department_id: 2, room_code: 'LAB 301', building: 'New Annex', room_type: 'laboratory', status: 'available' }];
    fireEvent(window, new CustomEvent('wicars:live-update', { detail: { topics: ['rooms'] } }));
    expect(await screen.findByText('LAB 301')).toBeTruthy();
    expect(screen.queryByText('LAB 201')).toBeNull();
  });

  it('distinguishes loading and failed facilities from empty rooms, and supports retry', async () => {
    let rejectRooms!: (error: Error) => void;
    const pendingRooms = new Promise((_, reject) => { rejectRooms = reject; });
    let roomRequests = 0;
    get.mockImplementation((url: string) => {
      if (url === '/rooms') return ++roomRequests === 1 ? pendingRooms : Promise.resolve({ data: [] });
      return pageData(url);
    });

    render(<Departments />);
    fireEvent.click(await screen.findByText('College of Information Technology'));
    expect(screen.getByText('Loading facilities...')).toBeTruthy();
    expect(screen.queryByText('No laboratory rooms.')).toBeNull();

    await act(async () => rejectRooms(new Error('Connection failed')));
    expect(await screen.findByText('Could not load facilities.')).toBeTruthy();
    expect(screen.queryByText('No lecture rooms.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No laboratory rooms.')).toBeTruthy();
    expect(screen.queryByText('No lecture rooms.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Lecture Room/ }));
    expect(screen.getByText('No lecture rooms.')).toBeTruthy();
    expect(screen.queryByText('No laboratory rooms.')).toBeNull();
    expect(screen.queryByText('Could not load facilities.')).toBeNull();
  });

  it('pages facilities eight at a time, resets the page for each room type, and handles a smaller refreshed list', async () => {
    const laboratoryRooms = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1, department_id: 2, room_code: `LAB ${String(index + 1).padStart(2, '0')}`,
      building: 'Technology Annex', room_type: 'laboratory', status: 'available',
    }));
    const lectureRooms = Array.from({ length: 9 }, (_, index) => ({
      id: index + 11, department_id: 2, room_code: `LEC ${String(index + 1).padStart(2, '0')}`,
      building: 'Main Building', room_type: 'lecture', status: 'available',
    }));
    let rooms = [...laboratoryRooms, ...lectureRooms];
    get.mockImplementation((url: string) => url === '/rooms' ? Promise.resolve({ data: rooms }) : pageData(url));

    render(<Departments />);
    fireEvent.click(await screen.findByText('College of Information Technology'));

    expect(await screen.findByText('1–8 of 10')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Laboratory rooms' })).getAllByRole('listitem')).toHaveLength(8);
    expect((screen.getByRole('button', { name: 'Previous facilities' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Next facilities' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('LAB 09')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Next facilities' }));
    expect(screen.getByText('9–10 of 10')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Laboratory rooms' })).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('LAB 09')).toBeTruthy();
    expect(screen.queryByText('LAB 01')).toBeNull();
    expect((screen.getByRole('button', { name: 'Previous facilities' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Next facilities' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Previous facilities' }));
    expect(screen.getByText('1–8 of 10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next facilities' }));
    fireEvent.click(screen.getByRole('button', { name: /^Lecture Room/ }));
    expect(screen.getByText('1–8 of 9')).toBeTruthy();
    expect(screen.getByText('LEC 01')).toBeTruthy();
    expect(screen.queryByText('LEC 09')).toBeNull();
    expect((screen.getByRole('button', { name: 'Previous facilities' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next facilities' }));
    expect(screen.getByText('9–9 of 9')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Laboratory/ }));
    expect(screen.getByText('1–8 of 10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next facilities' }));

    rooms = [...laboratoryRooms.slice(0, 3), ...lectureRooms];
    fireEvent(window, new CustomEvent('wicars:live-update', { detail: { topics: ['rooms'] } }));
    expect(await screen.findByText('LAB 01')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Laboratory rooms' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Previous facilities' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next facilities' })).toBeNull();
    expect(screen.queryByText('LAB 09')).toBeNull();
  });

  it('keeps program editing in Manage programs and the table Add Program entry usable', async () => {
    const updatedProgram = { ...program, code: 'BSCS', name: 'Bachelor of Science in Computer Science' };
    patch.mockResolvedValueOnce({ data: { data: updatedProgram } });
    post.mockResolvedValueOnce({ data: { data: { ...program, id: 22, code: 'BSIS', name: 'Bachelor of Science in Information Systems' } } });

    render(<Departments />);
    fireEvent.click(await screen.findByText('College of Information Technology'));
    fireEvent.click(screen.getByRole('button', { name: 'Manage programs' }));

    const manager = screen.getByRole('dialog', { name: 'Manage programs' });
    expect(within(manager).getByRole('heading', { name: 'Programs' })).toBeTruthy();
    fireEvent.click(within(manager).getByRole('button', { name: 'Edit BSIT' }));
    expect((within(manager).getByLabelText('Program code') as HTMLInputElement).value).toBe('BSIT');
    fireEvent.change(within(manager).getByLabelText('Program code'), { target: { value: 'BSCS' } });
    fireEvent.change(within(manager).getByLabelText('Program name'), { target: { value: updatedProgram.name } });
    fireEvent.click(within(manager).getByRole('button', { name: 'Save changes' }));
    expect(await within(manager).findByText('BSCS', { exact: true })).toBeTruthy();
    expect(patch).toHaveBeenCalledWith('/programs/21', { code: 'BSCS', name: updatedProgram.name, major: '' });

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Manage programs' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Close department profile' }));
    const row = screen.getByText('College of Information Technology').closest('tr');
    fireEvent.click(within(row!).getByRole('button', { name: 'Add Program' }));
    const addManager = screen.getByRole('dialog', { name: 'Manage programs' });
    expect((within(addManager).getByLabelText('Program code') as HTMLInputElement).value).toBe('');
    fireEvent.change(within(addManager).getByLabelText('Program code'), { target: { value: 'BSIS' } });
    fireEvent.change(within(addManager).getByLabelText('Program name'), { target: { value: 'Bachelor of Science in Information Systems' } });
    fireEvent.click(within(addManager).getByRole('button', { name: 'Add program' }));
    expect(await within(addManager).findByText('BSIS', { exact: true })).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/programs', {
      department_id: 2, code: 'BSIS', name: 'Bachelor of Science in Information Systems', major: '',
    });
  });

  it('preserves the Dean program directory without loading VPAA facilities', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 10, role: 'dean', department_id: 2 }));

    render(<Departments />);
    fireEvent.click(await screen.findByText('College of Information Technology'));

    expect(screen.getByRole('heading', { name: 'Program directory' })).toBeTruthy();
    expect(screen.getByText(program.name)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Facilities' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Manage programs' })).toBeNull();
    expect(get.mock.calls.some(([url]) => url === '/rooms')).toBe(false);
  });

  it('searches the active instructor tab and shows a clearable program-head filter', async () => {
    get.mockImplementation((url: string) => {
      if (url === '/faculties') return Promise.resolve({ data: [
        { id: 1, department_id: 2, program_id: 21, first_name: 'Irene', last_name: 'Santos', employment_type: 'full-time' },
        { id: 2, department_id: 2, program_id: 99, first_name: 'Paolo', last_name: 'Reyes', employment_type: 'full-time' },
      ] });
      if (url === '/departments') return Promise.resolve({ data: [departments[0], {
        ...departments[1],
        programs: [program],
        users: [{ name: 'Kay Waga', role: 'program_head', program }],
      }] });
      return Promise.resolve({ data: [] });
    });

    render(<Departments />);
    fireEvent.click(await screen.findByText('College of Information Technology'));
    expect(await screen.findByText('Paolo Reyes')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search instructors'), { target: { value: 'iren' } });
    expect(screen.getByText('Irene Santos')).toBeTruthy();
    expect(screen.queryByText('Paolo Reyes')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search instructors'), { target: { value: 'zzz' } });
    expect(screen.getByText('No instructors match “zzz”.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search instructors'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /Kay Waga/ }));
    expect(screen.queryByText('Paolo Reyes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear program filter' }));
    expect(screen.getByText('Paolo Reyes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear program filter' })).toBeNull();
  });
});


