import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulePdfInput } from '../ClassSchedules/SchedulerPanel/schedulePdf';
import { clearDataCache, isCacheFresh, setCachedData } from '../../lib/dataCache';
import ScheduleHistory from './ScheduleHistory';

const { get, post, preview, toast, confirm, downloadFile } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), preview: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  confirm: vi.fn(), downloadFile: vi.fn(),
}));
vi.mock('../../lib/api', () => ({ default: { get, post } }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ toast, confirm }) }));
vi.mock('../../lib/exportFile', () => ({ downloadFile }));
vi.mock('../ClassSchedules/SchedulerPanel/PrintSchedule', () => ({ default: () => null }));
vi.mock('../../components/scheduling/ScheduleApprovalPreviewModal', () => ({
  default: (props: { title: string; printInput: SchedulePdfInput; canAct: boolean; checks?: import('react').ReactNode }) => {
    preview(props);
    return <div role="dialog" aria-label={props.title}>{props.checks}</div>;
  },
}));

const snapshot = {
  id: 9, schedule_id: null, semester_id: 1, academic_year: '2025-2026', semester: '1st',
  section_id: null, course_id: null, department_id: 3, schedule_label: 'CIT Class Schedule',
  schedule_count: 1, section_count: 1, action: 'schedule_semester_archived', snapshot: {},
  actor: { name: 'VPAA Santos', username: 'vpaa', role: 'vpaa' }, created_at: '2026-06-01T08:00:00Z',
  snapshots: [{
    id: 10, schedule_id: 42, section_id: 7, section_name: 'BSIT 1A', section_semester: '1st',
    section_year_level: 1, course_code: 'IT 101', course_name: 'Programming', units: 3,
    lecture_hours: 3, lab_hours: 0, department_name: 'Information Technology', department_code: 'CIT',
    snapshot: {
      semester_id: 1, department_id: 3, section_id: 7, course_id: 11,
      day: 'Monday', start_time: '07:00:00', end_time: '10:00:00', mode: 'on-site',
    },
  }],
};
const response = {
  data: [snapshot],
  meta: { current_page: 1, per_page: 25, total: 1, last_page: 1, from: 1, to: 1 },
};
const duplicateGuidance = 'Remove or reset the existing draft classes in Schedule Builder, then reuse this schedule.';

function rejectReuse(issues: object[]) {
  post.mockRejectedValue(Object.assign(new Error('Unprocessable'), {
    isAxiosError: true,
    response: { status: 422, data: { message: 'This schedule cannot be reused.', issues } },
  }));
}

beforeEach(() => {
  clearDataCache();
  vi.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({ id: 4, role: 'secretary', department_id: 3, permissions: ['schedule.view', 'schedule.create'] }));
  get.mockResolvedValue({ data: response });
  confirm.mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Schedule History semester snapshots', () => {
  it('labels the missing historical actor in both the table and preview', async () => {
    get.mockResolvedValue({ data: { ...response, data: [{ ...snapshot, actor: { name: null, username: null, role: null } }] } });

    render(<ScheduleHistory />);
    expect(await screen.findByText('Actor unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View schedule' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('by Actor unavailable');
    expect(dialog.textContent).not.toContain('by null');
  });

  it('includes semester snapshots in all history and requests the selected snapshot filter', async () => {
    render(<ScheduleHistory />);
    expect(await screen.findByRole('cell', { name: 'Semester snapshot' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '2025-2026' })).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/schedule-history', {
      params: { page: 1, per_page: 10, type: undefined },
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'History type' }), { target: { value: 'archived' } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/schedule-history', {
      params: { page: 1, per_page: 10, type: 'archived' },
    }));
  });

  it('opens the retained historical semester snapshot without loading the active semester', async () => {
    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'View schedule' }));
    expect(screen.getByRole('dialog', { name: 'CIT Class Schedule (Semester snapshot)' })).toBeTruthy();
    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({
      canAct: false,
      printInput: expect.objectContaining({
        historicalDocument: true,
        activeSemester: { id: 1, academic_year: '2025-2026', semester: '1st', is_active: false },
        sections: [expect.objectContaining({ id: '7', name: 'BSIT 1A', semesterId: 1 })],
        allSchedules: [expect.objectContaining({ id: '42', semesterId: 1, courseCode: 'IT 101', signatories: null })],
      }),
    }));
    expect(get.mock.calls.map(([url]) => url)).toEqual(['/schedule-history']);
  });

  it('retains each submission cohort’s recorded signatories without a global override', async () => {
    const first = {
      prepared: [{ name: 'Original Secretary', title: 'Secretary' }],
      reviewed: { name: 'Original Dean', title: 'Dean' },
      recommended: { name: 'Original VPAA', title: 'VPAA' },
      approved: { name: 'Original President', title: 'President' },
      frozen: true,
    };
    const second = { ...first, reviewed: { name: 'Later Dean', title: 'Dean' } };
    get.mockResolvedValueOnce({ data: {
      ...response,
      data: [{
        ...snapshot, signatories: null, schedule_count: 2, section_count: 2,
        snapshots: [first, second].map((signatories, index) => ({
          ...snapshot.snapshots[0], id: 10 + index, schedule_id: 42 + index,
          section_id: 7 + index, section_name: `BSIT 1${index === 0 ? 'A' : 'B'}`,
          snapshot: { ...snapshot.snapshots[0].snapshot, section_id: 7 + index, signatories },
        })),
      }],
    } });

    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'View schedule' }));
    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({
      printInput: expect.objectContaining({
        historicalDocument: true,
        signatories: null,
        allSchedules: [
          expect.objectContaining({ sectionId: '7', signatories: first }),
          expect.objectContaining({ sectionId: '8', signatories: second }),
        ],
      }),
    }));
  });
});

describe('Schedule History reuse and JSON export', () => {
  it('offers only the VPAA-approved filters', async () => {
    render(<ScheduleHistory />);
    await screen.findByRole('cell', { name: 'Semester snapshot' });
    const options = Array.from(screen.getByRole('combobox', { name: 'History type' }).querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['', 'approved', 'archived']);
  });

  it('exports JSON without reusing the schedule', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' });
    get.mockImplementation((url: string) => url.endsWith('/export')
      ? Promise.resolve({ data: blob, headers: { 'content-disposition': 'attachment; filename="wicars-schedule-cit-entry-9.json"' } })
      : Promise.resolve({ data: response }));
    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Export JSON' }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(blob, 'wicars-schedule-cit-entry-9.json'));
    expect(get).toHaveBeenCalledWith('/schedule-history/9/export', { responseType: 'blob' });
    expect(post).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('reuses a schedule after confirmation and reports the result', async () => {
    post.mockResolvedValue({ data: { message: 'Created 1 draft class for 1 section.' } });
    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reuse schedule' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/schedule-history/9/reuse'));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Reuse schedule' }));
    expect(toast.success).toHaveBeenCalledWith('Schedule reused', 'Created 1 draft class for 1 section.');
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('refreshes cached schedule and dashboard data after reuse', async () => {
    const schedulerKey = 'scheduler:v18:secretary:4:all';
    const dashboardKey = 'dashboard:secretary:4';
    setCachedData(schedulerKey, { schedules: [] });
    setCachedData(dashboardKey, { schedule_count: 0 });
    post.mockResolvedValue({ data: { message: 'Created 1 draft class for 1 section.' } });

    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reuse schedule' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(isCacheFresh(schedulerKey)).toBe(false);
    expect(isCacheFresh(dashboardKey)).toBe(false);
  });

  it('explains every failed compatibility check', async () => {
    const issues = [
      { check: 'sections', message: 'Section BSIT 1A does not exist in the active semester.' },
      { check: 'facilities', message: 'BSIT 1A · IT 101: Room IT-201 is not available for scheduling.' },
      { check: 'snapshot', message: 'The saved hybrid meetings do not contain enough details to reuse safely.' },
      { check: 'future_check', message: 'This additional compatibility check needs attention.' },
    ];
    rejectReuse(issues);
    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reuse schedule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule not reused' });
    for (const issue of issues) expect(within(dialog).getByText(issue.message)).toBeTruthy();
    expect(dialog.textContent).toContain('4 issues to review. No classes were added.');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows all 146 already scheduled courses in 18 sections without extra controls', async () => {
    const issues = Array.from({ length: 146 }, (_, index) => ({
      check: 'conflicts',
      code: 'already_scheduled',
      section_name: `BSIT 1${String.fromCharCode(65 + index % 18)}`,
      course_code: `IT ${100 + index}`,
      message: `Existing class ${index + 1} must be reviewed.`,
    }));
    rejectReuse(issues);
    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reuse schedule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule not reused' });
    expect(dialog.textContent).toContain('146 issues to review. No classes were added.');
    expect(within(dialog).getAllByText(duplicateGuidance)).toHaveLength(1);
    expect(within(dialog).queryByText('Full details')).toBeNull();
    expect(dialog.querySelector('details')).toBeNull();
    expect(within(dialog).queryByRole('searchbox')).toBeNull();
    expect(within(dialog).queryByRole('group', { name: 'Issue categories' })).toBeNull();
    expect(within(dialog).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Close modal', 'Close']);
    expect(within(dialog).getByText('146 issues')).toBeTruthy();
    expect(within(dialog).getByText('18 affected sections')).toBeTruthy();
    expect(within(dialog).getAllByRole('heading', { level: 4 })).toHaveLength(18);
    const courseLists = within(dialog).getAllByRole('list', { name: / courses already scheduled$/ });
    expect(courseLists).toHaveLength(18);
    const courseCodes = courseLists.flatMap((list) => within(list).getAllByRole('listitem').map((item) => item.textContent));
    expect(courseCodes.sort()).toEqual(issues.map((issue) => issue.course_code).sort());
    const firstSection = within(dialog).getByRole('list', { name: 'BSIT 1A courses already scheduled' });
    expect(within(firstSection).getAllByRole('listitem')).toHaveLength(9);
    const lastSection = within(dialog).getByRole('list', { name: 'BSIT 1R courses already scheduled' });
    expect(within(lastSection).getAllByRole('listitem')).toHaveLength(8);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('groups legacy duplicate messages with one shared action and keeps other issues visible', async () => {
    const duplicateMessages = [
      'Section BSIT 1A already has IT 106 scheduled in the active semester. Delete that class first, or reuse a different schedule.',
      'Section BSIT 1A already has GEC 2 scheduled in the active semester. Delete that class first, or reuse a different schedule.',
    ];
    const roomMessage = 'BSIT 1A · IT 101: Room IT-201 is not available for scheduling.';
    rejectReuse([
      ...duplicateMessages.map((message) => ({ check: 'conflicts', message })),
      { check: 'facilities', message: roomMessage },
    ]);
    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reuse schedule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule not reused' });
    const courses = within(dialog).getByRole('list', { name: 'BSIT 1A courses already scheduled' });
    expect(within(courses).getAllByRole('listitem').map((item) => item.textContent).sort()).toEqual(['GEC 2', 'IT 106']);
    expect(within(dialog).getAllByText(duplicateGuidance)).toHaveLength(1);
    expect(within(dialog).queryByText('Full details')).toBeNull();
    expect(dialog.querySelector('details')).toBeNull();
    for (const message of duplicateMessages) expect(within(dialog).queryByText(message)).toBeNull();
    expect(within(dialog).getByRole('heading', { name: 'Already scheduled', level: 3 })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'Rooms and facilities', level: 3 })).toBeTruthy();
    expect(within(dialog).getByText(roomMessage)).toBeTruthy();
  });

  it('keeps keyboard focus in the issues dialog and restores it after dismissal', async () => {
    rejectReuse([{ check: 'sections', message: 'Section BSIT 1A does not exist in the active semester.' }]);
    render(<ScheduleHistory />);
    const opener = await screen.findByRole('button', { name: 'Reuse schedule' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Schedule not reused' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    const close = within(dialog).getByRole('button', { name: 'Close modal' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Schedule not reused' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reuse schedule' }));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('retains incomplete duplicate details once without adding an empty course', async () => {
    const incomplete = 'The existing class needs a manual review.';
    rejectReuse([
      { check: 'conflicts', code: 'already_scheduled', section_name: 'BSIT 1A', course_code: 'IT 101', message: 'IT 101 is already scheduled.' },
      { check: 'conflicts', code: 'already_scheduled', section_name: 'BSIT 1A', message: incomplete },
    ]);
    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reuse schedule' }));
    const dialog = await screen.findByRole('dialog', { name: 'Schedule not reused' });
    const courses = within(dialog).getByRole('list', { name: 'BSIT 1A courses already scheduled' });
    expect(within(courses).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['IT 101']);
    expect(within(dialog).getAllByText(incomplete)).toHaveLength(1);
    expect(within(dialog).queryByText('Full details')).toBeNull();
    expect(dialog.textContent).toContain('2 issues to review. No classes were added.');
  });

  it('reports failures without issue details through the existing error toast', async () => {
    post.mockRejectedValue(Object.assign(new Error('Unavailable'), {
      isAxiosError: true,
      response: { status: 503, data: { message: 'Schedule reuse is temporarily unavailable.' } },
    }));
    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reuse schedule' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Reuse failed', 'Schedule reuse is temporarily unavailable.'));
    expect(screen.queryByRole('dialog', { name: 'Schedule not reused' })).toBeNull();
  });

  it('does not reuse when the confirmation is cancelled', async () => {
    confirm.mockResolvedValue(false);
    render(<ScheduleHistory />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reuse schedule' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(post).not.toHaveBeenCalled();
  });

  it('hides Reuse from accounts that cannot build schedules', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'vpaa', permissions: ['schedule.view'] }));
    render(<ScheduleHistory />);
    expect(await screen.findByRole('button', { name: 'Export JSON' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reuse schedule' })).toBeNull();
  });
});
