import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../../../../lib/dataCache';
import type { ApiScheduleRecord } from '../types';
import { timeStrToSlot, type InitialDataResponse } from './initialDataMapper';
import { useScheduler } from './useScheduler';
import TopBar from '../TopBar';
import SubmitApprovalModal from '../Modals/SubmitApprovalModal';

const { get, post, toast, confirm } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, confirm: vi.fn(),
}));
vi.mock('../../../../lib/api', () => ({ default: { get, post, put: vi.fn(), patch: vi.fn() } }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ toast, confirm }) }));
vi.mock('../../../../hooks/useLiveRefresh', () => ({ useLiveRefresh: vi.fn() }));
vi.mock('../../../../lib/conflicts', () => ({
  fetchConflicts: vi.fn().mockResolvedValue([]), fetchResolvedConflicts: vi.fn().mockResolvedValue([]),
  resolvedScheduleIds: () => new Set(),
}));

const SELECTED = 30;
const BUSY = 31;
const course = {
  id: 20, course_code: 'IT 101', course_name: 'Intro', course_category: 'major', department_id: 6,
  semester: '1st', year_level: 1, units: 3, lecture_hours: 3, lab_hours: 0,
  room_type_required: 'lecture', status: 'active',
} as const;
const room = { id: 5, room_code: 'R-5', room_type: 'lecture', status: 'available', department_id: 6, capacity: 40 } as const;
const section = (id: number, name: string) => ({
  id, section_name: name, year_level: 1, semester: '1st' as const, semester_id: 1, department_id: 6, program_id: 11,
});
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const slotTime = (index: number): [string, string] => {
  const minutes = 7 * 60 + (index % 24) * 30;
  const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}:00`;
  return [clock(minutes), clock(minutes + 30)];
};
const fullRow = (id: number, sectionId: number, extra: Partial<ApiScheduleRecord> = {}): ApiScheduleRecord => ({
  id, semester_id: 1, course_id: 20, department_id: 6, section_id: sectionId, room_id: null,
  day: days[id % 5], start_time: slotTime(Math.floor(id / 5))[0], end_time: slotTime(Math.floor(id / 5))[1],
  mode: 'online', status: 'draft',
  course, section: { section_name: sectionId === SELECTED ? 'IT 1A' : 'IT 1B' },
  ...extra,
});
/** What the server sends past the limit: ids and times only, no relations. */
const occupancyRow = (id: number, sectionId: number, extra: Partial<ApiScheduleRecord> = {}): ApiScheduleRecord => ({
  id, semester_id: 1, course_id: 20, department_id: 6, section_id: sectionId, room_id: 5, room: null,
  day: 'Monday', start_time: '08:00:00', end_time: '09:30:00', mode: 'on-site', status: 'draft',
  faculty_id: null, is_hybrid: false, preferred_pattern: null, faculty_assignment_done: false,
  split_group_id: null, meeting_type: null, meeting_index: null,
  ...extra,
} as ApiScheduleRecord);

let payload: InitialDataResponse;

beforeEach(() => {
  clearDataCache(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  post.mockReset(); confirm.mockReset(); confirm.mockResolvedValue(true);
  localStorage.setItem('user', JSON.stringify({ id: 1, role: 'secretary', department_id: 6, permissions: [] }));
  payload = {
    active_semester: { id: 1, semester: '1st', academic_year: '2026-2027', is_active: true },
    rooms: [room], sections: [section(SELECTED, 'IT 1A'), section(BUSY, 'IT 1B')],
    courses: [{ ...course }, { ...course, id: 21, course_code: 'IT 102', course_name: 'Second' }],
    faculties: [], users: [], departments: [],
    // 2,000 newest meetings, all in the busy section; the selected section's meetings are older.
    schedules: Array.from({ length: 2000 }, (_, index) => fullRow(1000 + index, BUSY)),
    schedules_truncated: true,
    schedule_occupancy: [
      occupancyRow(1, SELECTED),
      occupancyRow(2, SELECTED, { day: 'Tuesday' }),
      occupancyRow(3, BUSY, { day: 'Wednesday', start_time: '10:00:00', end_time: '11:00:00' }),
    ],
  };
});
afterEach(cleanup);

const sectionRows = [
  fullRow(1, SELECTED, { day: 'Monday', start_time: '08:00:00', end_time: '09:30:00', room_id: 5, mode: 'on-site', room }),
  fullRow(2, SELECTED, { day: 'Tuesday', start_time: '08:00:00', end_time: '09:30:00', room_id: 5, mode: 'on-site', room }),
];

describe('scheduler past the 2,000-meeting limit', () => {
  it('loads the open section in full and checks conflicts against every meeting', { timeout: 30000 }, async () => {
    get.mockImplementation((_url: string, config?: { params?: Record<string, unknown> }) => {
      if (config?.params?.schedule_section_id === String(SELECTED)) {
        return Promise.resolve({ data: { schedules: [fullRow(1999, BUSY), ...sectionRows], schedules_truncated: true } });
      }
      return Promise.resolve({ data: payload });
    });

    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 10000 });

    expect(get).toHaveBeenCalledWith('/initial-data', expect.objectContaining({
      params: expect.objectContaining({ schedule_limit: 2000, schedule_occupancy: 1 }),
    }));
    expect(result.current.selectedSectionId).toBe(String(SELECTED));

    // The open section's meetings arrive in full, with their names, even though they were past the limit.
    await waitFor(
      () => expect(result.current.schedules.filter((row) => row.sectionId === String(SELECTED))).toHaveLength(2),
      { timeout: 10000 },
    );
    const opened = result.current.schedules.filter((row) => row.sectionId === String(SELECTED));
    expect(opened.map((row) => row.courseCode)).toEqual(['IT 101', 'IT 101']);
    expect(result.current.schedules).toHaveLength(2002);

    // A busy-section meeting that only arrived as occupancy still blocks its room.
    const wednesday = 2;
    const conflict = result.current.checkConflict(
      '21', String(SELECTED), null, '5', wednesday, timeStrToSlot('10:00:00'), 2,
    );
    expect(conflict?.conflictType).toBe('room');
    expect(conflict?.message).toContain('IT 101');

    // A free slot stays free.
    expect(result.current.checkConflict('21', String(SELECTED), null, '5', wednesday, timeStrToSlot('13:00:00'), 2)).toBeNull();
  });

  it('keeps the newest timetable when overlapping refreshes answer out of order', async () => {
    let resolveOlder: (value: unknown) => void = () => {};
    let refreshes = 0;
    get.mockImplementation((_url: string, config?: { params?: Record<string, unknown> }) => {
      if (config?.params?.include !== 'schedules,sections') return Promise.resolve({ data: { ...payload, schedules_truncated: false, schedule_occupancy: undefined, schedules: [fullRow(1, SELECTED)] } });
      refreshes += 1;
      if (refreshes === 1) return new Promise((resolve) => { resolveOlder = resolve; });
      return Promise.resolve({ data: { schedules: [fullRow(1, SELECTED), fullRow(2, SELECTED)], schedules_truncated: false } });
    });

    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let older: Promise<void> = Promise.resolve();
    await act(async () => {
      older = result.current.refreshSchedules();
      await result.current.refreshSchedules();
    });
    expect(result.current.schedules.map((row) => row.id)).toEqual(['1', '2']);

    await act(async () => {
      resolveOlder({ data: { schedules: [fullRow(1, SELECTED)], schedules_truncated: false } });
      await older;
    });
    expect(result.current.schedules.map((row) => row.id)).toEqual(['1', '2']);
  });
});

describe('returned scheduling workflow', () => {
  beforeEach(() => {
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'secretary', department_id: 6,
      permissions: ['schedule.update', 'schedule.generate', 'schedule.submit'] }));
    payload = { ...payload, schedules_truncated: false, schedule_occupancy: undefined, courses: [course],
      sections: [{ ...section(SELECTED, 'IT 1A'), submission_status: 'rejected', revision_status: 'initial' }],
      schedules: [fullRow(1, SELECTED, { status: 'rejected_by_dean' })] };
    get.mockImplementation(() => Promise.resolve({ data: payload }));
  });

  it.each(['rejected_by_dean', 'rejected'] as const)('opens %s for correction and resubmits only after a saved change', async (status) => {
    payload.schedules[0].status = status;
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEditable).toBe(true);
    expect(result.current.departmentReadyToSubmit).toBe(false);
    const generate = vi.fn();
    const view = render(<TopBar {...result.current} onPrint={vi.fn()} onGenerateYearLevel={generate} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate Schedule/ }));
    expect(generate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Resubmit Schedule' }));
    expect((screen.getByRole('button', { name: 'Resubmit Schedule' }) as HTMLButtonElement).disabled).toBe(true);
    expect(result.current.isSubmitApprovalModalOpen).toBe(false);
    expect(screen.getByText('Save the needed timetable corrections before resubmitting.')).toBeTruthy();
    await act(async () => { await result.current.confirmSubmitForApproval(); });
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText('Review returned schedule')).toBeTruthy();

    // A metadata refresh must update readiness even when the timetable has already been applied locally.
    payload = { ...payload, sections: [{ ...payload.sections[0], revision_status: 'modified' }] };
    await act(async () => { await result.current.refreshSchedules(); });
    expect(result.current.departmentReadyToSubmit).toBe(true);
    view.rerender(<TopBar {...result.current} onPrint={vi.fn()} onGenerateYearLevel={generate} />);
    expect(screen.getByRole('button', { name: 'Resubmit Schedule' })).toBeTruthy();

    // Correction state is supplied by the server and survives a fresh hook instance.
    const reloaded = renderHook(() => useScheduler());
    await waitFor(() => expect(reloaded.result.current.isLoading).toBe(false));
    expect(reloaded.result.current.departmentReadyToSubmit).toBe(true);
    payload = { ...payload, sections: [{ ...payload.sections[0], revision_status: 'initial' }] };
    await act(async () => { await result.current.refreshSchedules(); });
    expect(result.current.departmentReadyToSubmit).toBe(false);
  });

  it.each(['submitted', 'approved_by_dean', 'conditionally_approved', 'faculty_assignment', 'approved', 'finalized'] as const)(
    'keeps a mixed section with a %s meeting protected', async (status) => {
      payload.schedules.push(fullRow(2, SELECTED, { status }));
      const { result } = renderHook(() => useScheduler());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isEditable).toBe(false);
      expect(result.current.departmentReadyToSubmit).toBe(false);
      render(<TopBar {...result.current} onPrint={vi.fn()} onGenerateYearLevel={vi.fn()} />);
      expect(screen.queryByRole('button', { name: /Generate Schedule|Resubmit/ })).toBeNull();
    },
  );
});

describe('department submission review', () => {
  beforeEach(() => {
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'secretary', department_id: 6,
      permissions: ['schedule.submit', 'schedule.withdraw'] }));
    payload = { ...payload, schedules_truncated: false, schedule_occupancy: undefined,
      courses: [course], sections: [section(SELECTED, 'IT 1A')], schedules: [fullRow(1, SELECTED)] };
    get.mockImplementation(() => Promise.resolve({ data: payload }));
  });

  it('resubmits a partially revised department and retains the unchanged timetables', async () => {
    payload.courses = [course, { ...course, id: 21, year_level: 4 }];
    payload.sections = Array.from({ length: 25 }, (_, index) => ({
      ...section(SELECTED + index, `IT ${index < 20 ? '1' : '4'}-${index + 1}`),
      year_level: index < 20 ? 1 : 4, submission_status: 'rejected',
      revision_status: index < 20 ? 'modified' : 'initial',
    }));
    payload.schedules = payload.sections.map((item, index) => fullRow(index + 1, Number(item.id), {
      course_id: index < 20 ? 20 : 21,
    }));
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.departmentDoneSections).toBe(25);
    expect(result.current.departmentReadyToSubmit).toBe(true);
    expect(result.current.departmentCorrectionsRequired).toBe(false);
    await act(async () => { result.current.handleSectionSelect(String(payload.sections[24].id)); });
    const retained = result.current.schedules.filter((row) => Number(row.sectionId) >= SELECTED + 20);
    const workflow = () => <><TopBar {...result.current} onPrint={vi.fn()} /><SubmitApprovalModal {...result.current} /></>;
    const view = render(workflow());
    expect(screen.getByText('Section fully plotted')).toBeTruthy();
    expect(screen.queryByText('Review returned schedule')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resubmit Schedule' }));
    view.rerender(workflow());
    const dialog = within(screen.getByRole('alertdialog'));
    expect(dialog.getAllByText('Will submit unchanged')).toHaveLength(5);
    expect(dialog.getByText('25 sections will be sent for review')).toBeTruthy();
    for (const item of payload.sections.slice(20)) {
      expect(within(dialog.getByText(item.section_name).closest('li')!).getByText('Will submit unchanged')).toBeTruthy();
    }
    expect((dialog.getByRole('button', { name: 'Submit to Dean' }) as HTMLButtonElement).disabled).toBe(false);
    post.mockImplementation(() => {
      payload = { ...payload, schedules: payload.schedules.map((row) => ({ ...row, status: 'submitted' })) };
      return Promise.resolve({ data: {} });
    });
    view.rerender(workflow());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit to Dean' })); });
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0][0]).toBe('/departments/6/submit-schedules');
    expect([...post.mock.calls[0][1].section_ids].sort((a, b) => a - b))
      .toEqual(payload.sections.map((item) => Number(item.id)).sort((a, b) => a - b));
    expect(result.current.schedules.every((row) => row.status === 'submitted')).toBe(true);
    expect(result.current.schedules.filter((row) => Number(row.sectionId) >= SELECTED + 20))
      .toEqual(retained.map((row) => ({ ...row, status: 'submitted' })));
    expect(result.current.isSubmitApprovalModalOpen).toBe(false);
  });

  it('requires a real correction in the returned schedules without requiring each section to change', async () => {
    payload.sections = [
      { ...section(SELECTED, 'IT 1A'), submission_status: 'rejected', revision_status: 'initial' },
      { ...section(BUSY, 'IT 1B'), submission_status: 'rejected', revision_status: 'initial' },
    ];
    payload.schedules.push(fullRow(2, BUSY));
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.departmentReadyToSubmit).toBe(false);
    expect(result.current.departmentCorrectionsRequired).toBe(true);
    payload = { ...payload, sections: [payload.sections[0], { ...payload.sections[1], revision_status: 'modified' }] };
    await act(async () => { await result.current.refreshSchedules(); });
    expect(result.current.departmentReadyToSubmit).toBe(true);
    expect(result.current.departmentCorrectionsRequired).toBe(false);

    // Reverting the sole correction blocks a wholly unchanged return again.
    payload = { ...payload, sections: [payload.sections[0], { ...payload.sections[1], revision_status: 'initial' }] };
    await act(async () => { await result.current.refreshSchedules(); });
    expect(result.current.departmentReadyToSubmit).toBe(false);
    await act(async () => { await result.current.confirmSubmitForApproval(); });
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ['draft', 'draft'], ['recalled', 'revision'], ['submitted', 'submitted'], ['vpaa_approved', 'faculty_assignment'],
  ] as const)('does not count a change in a %s section as a correction to a return', async (submissionStatus, status) => {
    payload.sections = [
      { ...section(SELECTED, 'IT 1A'), submission_status: 'rejected', revision_status: 'initial' },
      { ...section(BUSY, 'IT 1B'), submission_status: submissionStatus, revision_status: 'modified' },
    ];
    payload.schedules.push(fullRow(2, BUSY, { status }));
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.departmentCorrectionsRequired).toBe(true);
    expect(result.current.departmentReadyToSubmit).toBe(false);
  });

  it('submits fully plotted drafts without a mark-done step and leaves protected sections untouched', async () => {
    payload.sections.push(section(BUSY, 'IT 1B'));
    payload.schedules.push(fullRow(2, BUSY, { status: 'approved_by_dean' }));
    post.mockImplementation(() => {
      payload = { ...payload, schedules: payload.schedules.map((row) => row.section_id === SELECTED ? { ...row, status: 'submitted' } : row) };
      return Promise.resolve({ data: {} });
    });
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const workflow = () => <><TopBar {...result.current} onPrint={vi.fn()} /><SubmitApprovalModal {...result.current} /></>;
    const view = render(workflow());
    fireEvent.click(screen.getByRole('button', { name: 'Submit Schedule' }));
    view.rerender(workflow());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Submit to Dean' })); });
    expect(post).toHaveBeenCalledExactlyOnceWith('/departments/6/submit-schedules', { section_ids: [SELECTED] });
    expect(result.current.schedules.find((row) => row.sectionId === String(SELECTED))?.status).toBe('submitted');
    expect(result.current.schedules.find((row) => row.sectionId === String(BUSY))?.status).toBe('approved_by_dean');
    expect(result.current.isSubmitApprovalModalOpen).toBe(false);
  });

  it('blocks the main submit action until every section is fully plotted', async () => {
    payload.sections.push(section(BUSY, 'IT 1B'));
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const workflow = () => <><TopBar {...result.current} onPrint={vi.fn()} /><SubmitApprovalModal {...result.current} /></>;
    const view = render(workflow());
    expect((screen.getByRole('button', { name: 'Submit Schedule' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Schedule' }));
    expect(result.current.isSubmitApprovalModalOpen).toBe(false);
    await act(async () => { await result.current.handleSubmitForApproval(); });
    expect(result.current.isSubmitApprovalModalOpen).toBe(false);
    await act(async () => { await result.current.confirmSubmitForApproval(); });
    expect(post).not.toHaveBeenCalled();
    payload = { ...payload, schedules: [...payload.schedules, fullRow(2, BUSY)] };
    await act(async () => { await result.current.refreshSchedules(); });
    view.rerender(workflow());
    expect(result.current.departmentReadyToSubmit).toBe(true);
    expect((screen.getByRole('button', { name: 'Submit Schedule' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Submit Schedule' }));
    expect(result.current.isSubmitApprovalModalOpen).toBe(true);
  });

  it('does not count an unrelated plotted course as a missing required course', async () => {
    payload.courses = [course, { ...course, id: 21, course_code: 'IT 102' }];
    payload.schedules.push(fullRow(2, SELECTED, { course_id: 99 }));
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.departmentSectionProgress[0].plottedCourses).toBe(1);
    expect(result.current.totalScheduled).toBe(1);
    expect(result.current.departmentReadyToSubmit).toBe(false);
    render(<TopBar {...result.current} onPrint={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Submit Schedule' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { await result.current.handleSubmitForApproval(); });
    expect(result.current.isSubmitApprovalModalOpen).toBe(false);
  });

  it('checks every section even when some plotted meetings arrive only as occupancy', async () => {
    payload.sections.push(section(BUSY, 'IT 1B'));
    payload.schedules_truncated = true;
    payload.schedule_occupancy = [occupancyRow(2, BUSY)];
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.departmentDoneSections).toBe(2);
    expect(result.current.departmentReadyToSubmit).toBe(true);
    payload = { ...payload, schedule_occupancy: [] };
    await act(async () => { await result.current.refreshSchedules(); });
    expect(result.current.departmentDoneSections).toBe(1);
    expect(result.current.departmentReadyToSubmit).toBe(false);
  });

  it('keeps the review open and refreshes eligibility when the server rejects a stale submission', async () => {
    payload.sections[0] = { ...payload.sections[0], submission_status: 'rejected', revision_status: 'modified' };
    post.mockImplementation(() => {
      payload = { ...payload, sections: [{ ...payload.sections[0], revision_status: 'initial' }] };
      return Promise.reject({ response: { data: { message: 'Saved corrections are required.', error_code: 'schedule_corrections_required' } } });
    });
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.handleSubmitForApproval(); });
    await act(async () => { await result.current.confirmSubmitForApproval(); });
    expect(toast.error).toHaveBeenCalledWith('Failed to submit', 'Saved corrections are required.');
    expect(result.current.isSubmitApprovalModalOpen).toBe(true);
    expect(result.current.departmentReadyToSubmit).toBe(false);
    expect(result.current.schedules[0].status).toBe('draft');
    render(<SubmitApprovalModal {...result.current} />);
    expect(screen.getByText('Save the needed timetable corrections')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Submit to Dean' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(['missing permission', 'outside writable programs', 'missing Dean'])(
    'preserves the submission restriction for %s', async (restriction) => {
      if (restriction === 'missing permission') {
        localStorage.setItem('user', JSON.stringify({ id: 1, role: 'secretary', department_id: 6, permissions: [] }));
      } else if (restriction === 'outside writable programs') {
        payload.can_edit_program_ids = [];
      } else {
        payload.has_dean = false;
      }
      const { result } = renderHook(() => useScheduler());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      render(<TopBar {...result.current} onPrint={vi.fn()} />);
      if (restriction !== 'missing Dean') expect(screen.queryByRole('button', { name: 'Submit Schedule' })).toBeNull();
      await act(async () => { await result.current.handleSubmitForApproval(); });
      expect(result.current.isSubmitApprovalModalOpen).toBe(false);
      if (restriction !== 'missing Dean') await act(async () => { await result.current.confirmSubmitForApproval(); });
      expect(post).not.toHaveBeenCalled();
    },
  );
});

describe('reset scheduling workspace', () => {
  beforeEach(() => {
    localStorage.setItem('user', JSON.stringify({ id: 1, role: 'secretary', department_id: 6,
      permissions: ['schedule.update', 'schedule.delete', 'schedule.generate', 'schedule.submit'] }));
    payload = { ...payload, schedules_truncated: false, schedule_occupancy: undefined, courses: [course],
      sections: [{ ...section(SELECTED, 'IT 1A'), submission_status: 'rejected', revision_status: 'reset', schedule_reset_since_submission: true }],
      schedules: [] };
    get.mockImplementation(() => Promise.resolve({ data: payload }));
  });

  it('shows the normal empty scheduling state after reload, including from cache', async () => {
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sections[0]).toMatchObject({ submissionStatus: 'rejected', revisionStatus: 'reset', resetSinceSubmission: true });
    expect(result.current.departmentHasSchedules).toBe(false);
    expect(result.current.departmentCorrectionsRequired).toBe(false);
    const generate = vi.fn();
    render(<TopBar {...result.current} onPrint={vi.fn()} onGenerateYearLevel={generate}
      onResetSchedules={result.current.handleClearAll} canResetSchedules={false} />);
    expect(screen.getByText('Plot remaining subjects')).toBeTruthy();
    expect(screen.queryByText('Rejected')).toBeNull();
    expect(screen.queryByText('Reset')).toBeNull();
    expect(screen.queryByText(/returned schedule|timetable corrections|rejection feedback/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Submit Schedule|Resubmit Schedule|View sections/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Generate Schedule/ }));
    expect(generate).toHaveBeenCalledOnce();
    await act(async () => { await result.current.handleSubmitForApproval(); });
    expect(result.current.isSubmitApprovalModalOpen).toBe(false);
    const cached = renderHook(() => useScheduler());
    expect(cached.result.current.isLoading).toBe(false);
    expect(cached.result.current.sections[0].resetSinceSubmission).toBe(true);
    expect(cached.result.current.departmentHasSchedules).toBe(false);
  });

  it('keeps old rejection badges hidden while rebuilding and restores status after the next submission', async () => {
    payload.sections[0] = { ...payload.sections[0], revision_status: 'modified' };
    payload.schedules = [fullRow(1, SELECTED)];
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const view = render(<TopBar {...result.current} onPrint={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Submit Schedule' })).toBeTruthy();
    expect(screen.queryByText('Rejected')).toBeNull();
    expect(screen.queryByText(/rejection feedback|timetable corrections/)).toBeNull();
    payload = { ...payload, sections: [{ ...payload.sections[0], submission_status: 'submitted', schedule_reset_since_submission: false }],
      schedules: [fullRow(1, SELECTED, { status: 'submitted' })] };
    await act(async () => { await result.current.refreshSchedules(); });
    view.rerender(<TopBar {...result.current} onPrint={vi.fn()} />);
    expect(screen.getByText('Waiting for Dean review')).toBeTruthy();
    expect(result.current.isEditable).toBe(false);
  });

  it('preserves feedback for populated returned sections after a partial reset', async () => {
    payload.sections.push({ ...section(BUSY, 'IT 1B'), submission_status: 'rejected', revision_status: 'initial' });
    payload.schedules = [fullRow(1, BUSY, { status: 'rejected_by_dean' })];
    const { result } = renderHook(() => useScheduler());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.departmentHasSchedules).toBe(true);
    expect(result.current.departmentCorrectionsRequired).toBe(true);
    const view = render(<TopBar {...result.current} onPrint={vi.fn()} />);
    expect(screen.getByText('Plot remaining subjects')).toBeTruthy();
    expect(screen.queryByText('Rejected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Resubmit Schedule' })).toBeTruthy();
    await act(async () => { result.current.handleSectionSelect(String(BUSY)); });
    view.rerender(<TopBar {...result.current} onPrint={vi.fn()} />);
    expect(screen.getByText('Review returned schedule')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
  });

  it('closes stale schedule dialogs immediately when reset succeeds', async () => {
    payload.sections[0] = { ...payload.sections[0], revision_status: 'initial', schedule_reset_since_submission: false };
    payload.schedules = [fullRow(1, SELECTED, { status: 'rejected_by_dean' })];
    const preview = { semester: { id: 1, semester: '1st', academic_year: '2026-2027' },
      sections: [{ id: SELECTED, name: 'IT 1A', year_level: 1, schedules: 1 }], token: 'reviewed',
      counts: { schedules: 1, classes: 1, meeting_splits: 0, archived_meeting_splits: 0, instructor_assignments: 0, cross_department_instructor_assignments: 0 } };
    post.mockImplementation((url: string) => {
      if (url.endsWith('/preview')) return Promise.resolve({ data: preview });
      payload = { ...payload, schedules: [], sections: [{ ...payload.sections[0], revision_status: 'reset', schedule_reset_since_submission: true }] };
      return Promise.resolve({ data: { ...preview, message: 'Reset', deleted_schedule_ids: [1] } });
    });
    const onReset = vi.fn();
    window.addEventListener('schedule-workspace-reset', onReset);
    try {
      const { result } = renderHook(() => useScheduler());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(async () => {
        await result.current.handleSubmitForApproval();
        result.current.setIsPrintModalOpen(true);
        result.current.setIsRoomViewOpen(true);
      });
      expect(result.current.isSubmitApprovalModalOpen).toBe(false);
      await act(async () => { await result.current.confirmClearAll([String(SELECTED)]); });
      expect(onReset).toHaveBeenCalledOnce();
      expect(result.current.schedules).toHaveLength(0);
      expect(result.current.isSubmitApprovalModalOpen).toBe(false);
      expect(result.current.isPrintModalOpen).toBe(false);
      expect(result.current.isRoomViewOpen).toBe(false);
      expect(result.current.dropContext).toBeNull();
      expect(result.current.conflictInfo).toBeNull();
      expect(result.current.departmentCorrectionsRequired).toBe(false);
      render(<TopBar {...result.current} onPrint={vi.fn()} />);
      expect(screen.queryByText('Rejected')).toBeNull();
      expect(screen.queryByRole('button', { name: /Resubmit|Submit Schedule/ })).toBeNull();
    } finally {
      window.removeEventListener('schedule-workspace-reset', onReset);
    }
  });
});
