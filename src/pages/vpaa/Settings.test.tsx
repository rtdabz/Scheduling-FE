import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transferableAbortController } from 'node:util';
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import Settings from './Settings';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  default: { get: mocks.apiGet, post: mocks.apiPost, patch: mocks.apiPatch },
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: (() => {
    const toast = { success: mocks.toastSuccess, error: mocks.toastError };
    return () => ({ toast, confirm: mocks.confirm });
  })(),
}));

vi.mock('../../lib/dataCache', () => ({
  clearDataCache: vi.fn(),
  getCachedData: () => null,
  hasCachedData: () => false,
  loadCachedData: async (_key: string, loader: () => Promise<unknown>) => loader(),
  setCachedData: vi.fn(),
}));

vi.mock('../../lib/liveUpdates', () => ({ publishLiveTopics: vi.fn() }));

interface TestSemester {
  id: number;
  academic_year: string;
  semester: '1st' | '2nd' | 'summer';
  is_active: boolean;
  is_enabled: boolean;
  can_edit_academic_year: boolean;
}

let semesters: TestSemester[];
let history: Record<string, unknown>[];
const savedSignatory = { president_name: 'Dr. Maria Santos', president_title: 'College President' };
const savedHours = { opening_time: '7:00 AM', closing_time: '7:00 PM', slot_interval: 30 };

function RouterControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="location">{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Browser back</button>
    <button onClick={() => navigate(1)}>Browser forward</button>
    <Link to="/outside">Leave Settings</Link>
  </>;
}

function renderSettings(section?: string, strict = false) {
  const router = createMemoryRouter([{
    element: <><Outlet /><RouterControls /></>,
    children: [
      { path: '/vpaa/settings', element: <Settings /> },
      { path: '/outside', element: <h1>Other page</h1> },
    ],
  }], { initialEntries: [`/vpaa/settings${section ? `?section=${section}` : ''}`] });
  const component = <RouterProvider router={router} />;
  return render(strict ? <StrictMode>{component}</StrictMode> : component);
}

function selectSection(name: string) {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Settings sections' }))
    .getByRole('link', { name: new RegExp(`^${name}`, 'i') }));
}

function semesterCard(name: string) {
  return within(screen.getByRole('article', { name }));
}

beforeEach(() => {
  vi.resetAllMocks();
  // React Router uses Node's Request in jsdom; its signal must use the same realm.
  vi.stubGlobal('AbortController', transferableAbortController);
  semesters = [
    { id: 1, academic_year: '2026-2027', semester: '1st', is_active: true, is_enabled: true, can_edit_academic_year: false },
    { id: 2, academic_year: '2027-2028', semester: '2nd', is_active: false, is_enabled: true, can_edit_academic_year: true },
    { id: 3, academic_year: '2027-2028', semester: 'summer', is_active: false, is_enabled: false, can_edit_academic_year: true },
  ];
  history = [];
  mocks.apiGet.mockImplementation((url: string) => {
    if (url === '/semesters') return Promise.resolve({ data: semesters.map(semester => ({ ...semester })) });
    if (url === '/semesters/activation-history') return Promise.resolve({ data: history, headers: { 'x-timezone': 'Asia/Manila' } });
    if (url === '/timeslots') return Promise.resolve({ data: { settings: savedHours } });
    if (url === '/institution-settings') return Promise.resolve({ data: savedSignatory });
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
  mocks.apiPatch.mockImplementation((url: string, payload: Record<string, unknown>) => {
    if (url === '/timeslots/settings') return Promise.resolve({ data: { settings: payload } });
    if (url === '/institution-settings') return Promise.resolve({ data: { settings: payload } });
    const match = /^\/semesters\/(\d+)(\/activate)?$/.exec(url);
    if (match) {
      const id = Number(match[1]);
      semesters = semesters.map(semester => match[2]
        ? { ...semester, is_active: semester.id === id }
        : semester.id === id ? { ...semester, ...payload } : semester);
      return Promise.resolve({ data: { semester: semesters.find(semester => semester.id === id) } });
    }
    return Promise.reject(new Error(`Unexpected PATCH ${url}`));
  });
  mocks.apiPost.mockImplementation((url: string, payload: Pick<TestSemester, 'semester' | 'academic_year'>) => {
    if (url !== '/semesters') return Promise.reject(new Error(`Unexpected POST ${url}`));
    const semester = { id: Math.max(...semesters.map(row => row.id)) + 1, ...payload,
      is_active: false, is_enabled: payload.semester !== 'summer', can_edit_academic_year: true };
    semesters.push(semester);
    return Promise.resolve({ data: { semester } });
  });
  mocks.confirm.mockImplementation(async (options: { onConfirm?: () => unknown }) => {
    await options.onConfirm?.();
    return true;
  });
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('VPAA Settings navigation and drafts', () => {
  it('uses one menu and displays only the selected section', async () => {
    renderSettings();
    await screen.findByLabelText('1st Semester academic year');
    const navigation = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(4);
    expect(within(navigation).getByRole('link', { name: /^Academic Semesters/i }).getAttribute('aria-current')).toBe('page');
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.queryByLabelText('Opening time')).toBeNull();
    expect(screen.queryByLabelText("President's Name")).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Archived/i })).toBeNull();

    selectSection('Operating Hours');
    expect(await screen.findByLabelText('Opening time')).toHaveProperty('value', '07:00');
    expect(screen.queryByLabelText('1st Semester academic year')).toBeNull();
    expect(within(navigation).getByRole('link', { name: /^Operating Hours/i }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('location').textContent).toContain('section=operating-hours');
  });

  it('supports direct links and browser history between settings sections', async () => {
    renderSettings('operating-hours');
    await screen.findByLabelText('Closing time');
    selectSection('Document Signatories');
    await screen.findByLabelText("President's Name");
    expect(screen.getByTestId('location').textContent).toContain('section=document-signatories');

    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(await screen.findByLabelText('Closing time')).toHaveProperty('value', '19:00');
    fireEvent.click(screen.getByRole('button', { name: 'Browser forward' }));
    expect(await screen.findByLabelText("President's Name")).toHaveProperty('value', savedSignatory.president_name);
  });

  it('retains each section draft when navigating and saves only the chosen section', async () => {
    renderSettings();
    fireEvent.change(await screen.findByLabelText('2nd Semester academic year'), { target: { value: '2028-2029' } });
    selectSection('Operating Hours');
    fireEvent.change(await screen.findByLabelText('Closing time'), { target: { value: '20:00' } });
    selectSection('Document Signatories');
    fireEvent.change(await screen.findByLabelText("President's Name"), { target: { value: 'Dr. Jane Doe' } });

    selectSection('Academic Semesters');
    expect(screen.getByLabelText('2nd Semester academic year')).toHaveProperty('value', '2028-2029');
    selectSection('Operating Hours');
    expect(screen.getByLabelText('Closing time')).toHaveProperty('value', '20:00');
    selectSection('Document Signatories');
    expect(screen.getByLabelText("President's Name")).toHaveProperty('value', 'Dr. Jane Doe');
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.apiPatch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save signatory' }));
    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledTimes(1));
    expect(mocks.apiPatch).toHaveBeenCalledWith('/institution-settings', {
      president_name: 'Dr. Jane Doe', president_title: savedSignatory.president_title,
    });
    selectSection('Operating Hours');
    expect(screen.getByLabelText('Closing time')).toHaveProperty('value', '20:00');
  });

  it('protects unsaved drafts when leaving Settings and permits an explicit discard', async () => {
    renderSettings('document-signatories');
    fireEvent.change(await screen.findByLabelText("President's Name"), { target: { value: 'Dr. Jane Doe' } });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    mocks.confirm.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole('link', { name: 'Leave Settings' }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("President's Name")).toHaveProperty('value', 'Dr. Jane Doe');
    expect(screen.queryByRole('heading', { name: 'Other page' })).toBeNull();

    mocks.confirm.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('link', { name: 'Leave Settings' }));
    expect(await screen.findByRole('heading', { name: 'Other page' })).toBeTruthy();
    expect(mocks.apiPatch).not.toHaveBeenCalled();
  });

  it.each([
    ['academic-semesters', '/semesters', '1st Semester academic year'],
    ['operating-hours', '/timeslots', 'Opening time'],
  ])('retries the %s section after an initial load failure', async (section, endpoint, label) => {
    const get = mocks.apiGet.getMockImplementation()!;
    let fail = true;
    mocks.apiGet.mockImplementation((url: string) => url === endpoint && fail
      ? Promise.reject(new Error('Unavailable')) : get(url));
    renderSettings(section);
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    fail = false;
    fireEvent.click(retry);
    expect(await screen.findByLabelText(label)).toBeTruthy();
  });

  it('keeps the latest loaded state and user draft when StrictMode requests complete out of order', async () => {
    const get = mocks.apiGet.getMockImplementation()!;
    const responses: ((response: { data: { settings: typeof savedHours } }) => void)[] = [];
    mocks.apiGet.mockImplementation((url: string) => url === '/timeslots'
      ? new Promise(resolve => { responses.push(resolve); }) : get(url));
    renderSettings('operating-hours', true);
    await waitFor(() => expect(responses).toHaveLength(2));
    await act(async () => { responses[1]({ data: { settings: savedHours } }); });
    fireEvent.change(await screen.findByLabelText('Closing time'), { target: { value: '20:00' } });
    await act(async () => { responses[0]({ data: { settings: { ...savedHours, closing_time: '6:00 PM' } } }); });
    expect(screen.getByLabelText('Closing time')).toHaveProperty('value', '20:00');
    expect(screen.getByRole('img', { name: 'Daily scheduling window: 7:00 AM to 8:00 PM' })).toBeTruthy();
    expect(mocks.apiPatch).not.toHaveBeenCalled();
  });
});

describe('VPAA academic semester transitions', () => {
  it('keeps saved Summer availability when 1st Semester is active', async () => {
    semesters[2].is_enabled = true;
    renderSettings();
    const summerSwitch = await screen.findByRole('switch', { name: 'Enable Summer' });
    expect(summerSwitch.getAttribute('aria-checked')).toBe('true');
    expect(mocks.apiPatch).not.toHaveBeenCalled();
  });

  it('enables Summer without activating it or requesting activation confirmation', async () => {
    semesters[0].is_active = false;
    semesters[1].is_active = true;
    renderSettings();
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable Summer' }));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Enable Summer' }).getAttribute('aria-checked')).toBe('true'));
    expect(mocks.apiPatch).toHaveBeenCalledWith('/semesters/3', { is_enabled: true });
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(semesterCard('Summer').getByRole('button', { name: 'Set as Active' })).toHaveProperty('disabled', false);
    expect(semesterCard('2nd Semester').queryByRole('button', { name: 'Set as Active' })).toBeNull();
  });

  it('retains disabled Summer availability after a failed enable request', async () => {
    semesters[0].is_active = false;
    semesters[1].is_active = true;
    mocks.apiPatch.mockRejectedValueOnce({ response: { data: { message: 'Summer settings could not be saved.' } } });
    renderSettings();
    fireEvent.click(await screen.findByRole('switch', { name: 'Enable Summer' }));
    expect((await screen.findByText('Summer settings could not be saved.')).getAttribute('role')).toBe('alert');
    expect(screen.getByRole('switch', { name: 'Enable Summer' }).getAttribute('aria-checked')).toBe('false');
    expect(mocks.apiPatch).toHaveBeenCalledTimes(1);
  });

  it('identifies both saved periods in confirmation and cancels without a transition', async () => {
    mocks.confirm.mockResolvedValueOnce(false);
    renderSettings();
    await screen.findByLabelText('2nd Semester academic year');
    fireEvent.click(semesterCard('2nd Semester').getByRole('button', { name: 'Set as Active' }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
    const confirmation = mocks.confirm.mock.calls[0][0];
    expect(confirmation.message).toContain('1st Semester');
    expect(confirmation.message).toContain('2026-2027');
    expect(confirmation.message).toContain('2nd Semester');
    expect(confirmation.message).toContain('2027-2028');
    expect(mocks.apiPatch).not.toHaveBeenCalled();
  });

  it('activates only after confirmation with the expected current semester and saved year', async () => {
    let resolveConfirmation!: (confirmed: boolean) => void;
    mocks.confirm.mockImplementationOnce(() => new Promise<boolean>(resolve => { resolveConfirmation = resolve; }));
    renderSettings();
    await screen.findByLabelText('2nd Semester academic year');
    const activate = semesterCard('2nd Semester').getByRole('button', { name: 'Set as Active' });
    fireEvent.click(activate);
    expect(activate).toHaveProperty('disabled', true);
    fireEvent.click(activate);
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.apiPatch).not.toHaveBeenCalled();
    resolveConfirmation(true);

    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledWith('/semesters/2/activate', {
      expected_active_semester_id: 1,
      expected_academic_year: '2027-2028',
    }));
    await waitFor(() => expect(semesterCard('2nd Semester').queryByRole('button', { name: 'Set as Active' })).toBeNull());
    expect(mocks.apiPatch).toHaveBeenCalledTimes(1);
  });

  it('keeps the current semester active after a rejected activation', async () => {
    mocks.apiPatch.mockRejectedValueOnce({ response: { status: 409, data: { message: 'The active semester changed. Refresh and try again.' } } });
    renderSettings();
    await screen.findByLabelText('2nd Semester academic year');
    fireEvent.click(semesterCard('2nd Semester').getByRole('button', { name: 'Set as Active' }));
    await screen.findByText('The active semester changed. Refresh and try again.');
    await screen.findByLabelText('1st Semester academic year');
    expect(semesterCard('1st Semester').queryByRole('button', { name: 'Set as Active' })).toBeNull();
    expect(semesterCard('2nd Semester').getByRole('button', { name: 'Set as Active' })).toHaveProperty('disabled', false);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('locks recorded academic years and requires saving a valid year before activation', async () => {
    semesters[2].can_edit_academic_year = false;
    renderSettings();
    expect(await screen.findByLabelText('1st Semester academic year')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Summer academic year')).toHaveProperty('disabled', true);
    const year = screen.getByLabelText('2nd Semester academic year');
    fireEvent.change(year, { target: { value: '2028-2030' } });
    expect(semesterCard('2nd Semester').getByRole('button', { name: 'Set as Active' })).toHaveProperty('disabled', true);
    expect(semesterCard('2nd Semester').getByRole('button', { name: 'Save academic year' })).toHaveProperty('disabled', true);
    fireEvent.change(year, { target: { value: '2028-2029' } });
    expect(semesterCard('2nd Semester').getByRole('button', { name: 'Set as Active' })).toHaveProperty('disabled', true);
    fireEvent.click(semesterCard('2nd Semester').getByRole('button', { name: 'Save academic year' }));
    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledWith('/semesters/2', { academic_year: '2028-2029' }));
    await waitFor(() => expect(semesterCard('2nd Semester').getByRole('button', { name: 'Set as Active' })).toHaveProperty('disabled', false));
  });

  it('groups multiple saved academic years into three semester cards', async () => {
    semesters.push(
      { ...semesters[0], id: 4, academic_year: '2027-2028', is_active: false, can_edit_academic_year: true },
      { ...semesters[1], id: 5, academic_year: '2028-2029' },
    );
    renderSettings();
    expect(await screen.findByLabelText('1st Semester academic year')).toHaveProperty('value', '2026-2027');
    expect(screen.getByLabelText('2nd Semester academic year')).toHaveProperty('value', '2028-2029');
    expect(screen.getAllByRole('article')).toHaveLength(3);
    const savedYear = screen.getByLabelText('1st Semester saved academic year');
    const nextYear = within(savedYear).getByRole('option', { name: /2027-2028/ });
    fireEvent.change(savedYear, { target: { value: nextYear.getAttribute('value') } });
    expect(screen.getByLabelText('1st Semester academic year')).toHaveProperty('value', '2027-2028');
    expect(screen.getByText(/1st Semester.*2026-2027/)).toBeTruthy();
    expect(mocks.apiPatch).not.toHaveBeenCalled();
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

  it('prepares a new period without changing a recorded academic year or active semester', async () => {
    semesters[1].can_edit_academic_year = false;
    renderSettings();
    await screen.findByLabelText('2nd Semester academic year');
    fireEvent.click(semesterCard('2nd Semester').getByRole('button', { name: 'Prepare another academic year' }));
    fireEvent.change(screen.getByLabelText('2nd Semester new academic year'), { target: { value: '2028-2029' } });
    fireEvent.click(semesterCard('2nd Semester').getByRole('button', { name: 'Create academic period' }));
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith('/semesters', {
      semester: '2nd', academic_year: '2028-2029',
    }));
    await waitFor(() => expect(screen.getByLabelText('2nd Semester academic year')).toHaveProperty('value', '2028-2029'));
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(within(screen.getByLabelText('2nd Semester saved academic year')).getByRole('option', { name: /2027-2028/ })).toBeTruthy();
    expect(screen.getByText(/1st Semester.*2026-2027/)).toBeTruthy();
    expect(mocks.apiPatch).not.toHaveBeenCalled();
  });

  it('retains an unsaved new academic period after a rejected create request', async () => {
    mocks.apiPost.mockRejectedValueOnce({ response: { data: { message: 'This academic semester already exists.' } } });
    renderSettings();
    await screen.findByLabelText('2nd Semester academic year');
    fireEvent.click(semesterCard('2nd Semester').getByRole('button', { name: 'Prepare another academic year' }));
    fireEvent.change(screen.getByLabelText('2nd Semester new academic year'), { target: { value: '2028-2029' } });
    fireEvent.click(semesterCard('2nd Semester').getByRole('button', { name: 'Create academic period' }));
    await screen.findByText('This academic semester already exists.');
    expect(screen.getByLabelText('2nd Semester new academic year')).toHaveProperty('value', '2028-2029');
    fireEvent.click(semesterCard('2nd Semester').getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('2nd Semester academic year')).toHaveProperty('value', '2027-2028');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.apiPatch).not.toHaveBeenCalled();
  });
});

describe('VPAA Settings operating hours', () => {
  it('loads an explicit field cutoff and includes it when extending closing time', async () => {
    renderSettings('operating-hours');
    const closingTime = await screen.findByLabelText('Closing time');
    expect(closingTime).toHaveProperty('value', '19:00');
    expect(screen.getByLabelText('Field Class Cutoff')).toHaveProperty('value', '19:00');
    fireEvent.change(closingTime, { target: { value: '20:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save operating hours' }));
    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledWith('/timeslots/settings', {
      opening_time: '7:00 AM', closing_time: '8:00 PM', field_end_time: '7:00 PM', slot_interval: 30,
    }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Operating hours saved', expect.any(String));
  });

  it('previews valid drafts, blocks invalid ranges and requires the field cutoff', async () => {
    renderSettings('operating-hours');
    await screen.findByRole('img', { name: 'Daily scheduling window: 7:00 AM to 7:00 PM' });
    fireEvent.change(screen.getByLabelText('Closing time'), { target: { value: '20:00' } });
    expect(screen.getByRole('img', { name: 'Daily scheduling window: 7:00 AM to 8:00 PM' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Closing time'), { target: { value: '06:00' } });
    expect(screen.getByText('Closing time must be later than opening time.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Daily scheduling window unavailable' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save operating hours' })).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Closing time'), { target: { value: '19:00' } });
    fireEvent.change(screen.getByLabelText('Field Class Cutoff'), { target: { value: '20:00' } });
    expect(screen.getByText('Field end time cannot be later than closing time.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save operating hours' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Field Class Cutoff'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save operating hours' })).toHaveProperty('disabled', true);
    expect(mocks.apiPatch).not.toHaveBeenCalled();
  });

  it('retains hours after a save failure and allows retrying the same draft', async () => {
    mocks.apiPatch.mockRejectedValueOnce({ response: { data: { message: 'Operating hours could not be saved.' } } });
    renderSettings('operating-hours');
    fireEvent.change(await screen.findByLabelText('Field Class Cutoff'), { target: { value: '18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save operating hours' }));
    await screen.findByText('Operating hours could not be saved.');
    expect(screen.getByLabelText('Field Class Cutoff')).toHaveProperty('value', '18:00');
    fireEvent.click(screen.getByRole('button', { name: 'Save operating hours' }));
    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledTimes(2));
    expect(mocks.apiPatch.mock.calls[1]).toEqual(mocks.apiPatch.mock.calls[0]);
  });
});

describe('VPAA document signatories', () => {
  it('previews both entered fields and saves only the signatory settings', async () => {
    renderSettings('document-signatories');
    fireEvent.change(await screen.findByLabelText("President's Name"), { target: { value: 'Dr. Jane Doe' } });
    fireEvent.change(screen.getByLabelText('Designation'), { target: { value: 'President' } });
    const preview = within(screen.getByRole('figure', { name: 'Document signature preview' }));
    expect(preview.getByText('Dr. Jane Doe')).toBeTruthy();
    expect(preview.getByText('President')).toBeTruthy();
    expect(mocks.apiPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save signatory' }));
    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledWith('/institution-settings', {
      president_name: 'Dr. Jane Doe', president_title: 'President',
    }));
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Signatory saved', expect.stringContaining('Recorded signatories are unchanged'));
  });

  it('requires both signatory fields and preserves a failed draft', async () => {
    mocks.apiPatch.mockRejectedValueOnce({ response: { data: { message: 'Signatory could not be saved.' } } });
    renderSettings('document-signatories');
    const name = await screen.findByLabelText("President's Name");
    fireEvent.change(name, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save signatory' })).toHaveProperty('disabled', true);
    fireEvent.change(name, { target: { value: 'Dr. Jane Doe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save signatory' }));
    await screen.findByText('Signatory could not be saved.');
    expect(screen.getByLabelText("President's Name")).toHaveProperty('value', 'Dr. Jane Doe');
    expect(screen.getByRole('button', { name: 'Save signatory' })).toHaveProperty('disabled', false);
  });

  it('shows a load error and retry instead of editable fallback signatory details', async () => {
    const get = mocks.apiGet.getMockImplementation()!;
    let fail = true;
    mocks.apiGet.mockImplementation((url: string) => url === '/institution-settings' && fail
      ? Promise.reject(new Error('Unavailable')) : get(url));
    renderSettings('document-signatories');
    const retry = await screen.findByRole('button', { name: /Retry/i });
    expect(screen.queryByLabelText("President's Name")).toBeNull();
    expect(screen.queryByDisplayValue('College President')).toBeNull();
    expect(mocks.apiPatch).not.toHaveBeenCalled();
    fail = false;
    fireEvent.click(retry);
    expect(await screen.findByLabelText("President's Name")).toHaveProperty('value', savedSignatory.president_name);
  });
});

describe('VPAA semester activation history', () => {
  it('shows recorded events with actors and unknown legacy identity without current-status labels', async () => {
    history = [
      { id: 3, semester_id: 2, semester: '2nd', academic_year: '2026-2027', action: 'Activated', changed_by: 'VPAA Santos', occurred_at: '2026-11-09T08:00:00Z', identity_recorded: true, is_active: false },
      { id: 2, semester_id: 1, semester: '1st', academic_year: '2026-2027', action: 'Ended', changed_by: 'VPAA Santos', occurred_at: '2026-11-09T08:00:00Z', identity_recorded: true, is_active: true },
      { id: 1, semester_id: 1, semester: '1st', academic_year: null, action: 'Activated', changed_by: null, occurred_at: '2025-08-01T08:00:00Z', identity_recorded: false },
    ];
    renderSettings('activation-history');
    await screen.findByRole('cell', { name: 'Ended' });
    const table = within(screen.getByRole('table'));
    expect(table.getAllByRole('columnheader').map(header => header.textContent)).toEqual([
      'Semester', 'Academic Year', 'Action', 'Changed By', 'Date & Time',
    ]);
    expect(table.getAllByRole('cell', { name: 'Activated' })).toHaveLength(2);
    expect(table.getAllByRole('cell', { name: 'VPAA Santos' })).toHaveLength(2);
    expect(table.getAllByRole('cell', { name: 'Not recorded' }).length).toBeGreaterThanOrEqual(2);
    expect(table.queryByText('Active', { exact: true })).toBeNull();
    expect(screen.getByText(/Asia\/Manila/)).toBeTruthy();
  });

  it('distinguishes a failed history request from empty history and retries', async () => {
    const get = mocks.apiGet.getMockImplementation()!;
    let fail = true;
    mocks.apiGet.mockImplementation((url: string) => url === '/semesters/activation-history' && fail
      ? Promise.reject(new Error('Unavailable')) : get(url));
    renderSettings('activation-history');
    const retry = await screen.findByRole('button', { name: /Retry/i });
    expect(screen.queryByText(/No activation events recorded/i)).toBeNull();
    fail = false;
    fireEvent.click(retry);
    expect(await screen.findByText(/No activation events recorded/i)).toBeTruthy();
    expect(mocks.apiGet.mock.calls.filter(([url]) => url === '/semesters/activation-history')).toHaveLength(2);
  });
});
