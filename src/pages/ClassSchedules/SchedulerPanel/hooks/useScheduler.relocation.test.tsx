import type { DragEvent } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../../../../lib/dataCache';
import type { ApiScheduleRecord } from '../types';
import type { InitialDataResponse } from './initialDataMapper';
import { useScheduler } from './useScheduler';

const { get, put, toast, confirm } = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, confirm: vi.fn(),
}));
vi.mock('../../../../lib/api', () => ({ default: { get, put, patch: vi.fn() } }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ toast, confirm }) }));
vi.mock('../../../../hooks/useLiveRefresh', () => ({ useLiveRefresh: vi.fn() }));
vi.mock('../../../../lib/conflicts', () => ({
  fetchConflicts: vi.fn().mockResolvedValue([]), fetchResolvedConflicts: vi.fn().mockResolvedValue([]),
  resolvedScheduleIds: () => new Set(),
}));

const course = {
  id: 20, course_code: 'CLIN 101', course_name: 'Clinical Duty', course_category: 'major', department_id: 6,
  semester: '1st', year_level: 1, units: 3, lecture_hours: 0, lab_hours: 3,
  room_type_required: 'laboratory', status: 'active',
} as const;
const room = { id: 5, room_code: 'SKILLS-1', room_type: 'laboratory', status: 'available', department_id: 6 } as const;
const meeting = (id: number, day: string, extra: Partial<ApiScheduleRecord> = {}): ApiScheduleRecord => ({
  id, semester_id: 1, course_id: 20, department_id: 6, section_id: 30, room_id: 5,
  day, start_time: '07:00:00', end_time: '10:00:00', mode: 'on-site', status: 'draft',
  faculty_id: null, is_hybrid: false, split_group_id: 'clinical-run', preferred_pattern: 'consecutive:3',
  meeting_index: id, course, room, section: { section_name: 'NUR 1A' },
  ...extra,
});
let payload: InitialDataResponse;

beforeEach(() => {
  clearDataCache(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({
    id: 1, role: 'secretary', department_id: 6, permissions: ['schedule.update'],
  }));
  payload = {
    active_semester: { id: 1, semester: '1st', academic_year: '2026-2027', is_active: true },
    rooms: [room], courses: [{ ...course }], faculties: [], users: [], departments: [],
    sections: [{ id: 30, section_name: 'NUR 1A', year_level: 1, semester: '1st', semester_id: 1, department_id: 6, program_id: 11 }],
    schedules: [meeting(1, 'Thursday'), meeting(2, 'Friday'), meeting(3, 'Saturday')],
  };
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/initial-data' ? payload : {} }));
  put.mockImplementation((url: string, changes: Partial<ApiScheduleRecord>) => {
    const id = Number(url.split('/').pop());
    payload.schedules = payload.schedules.map((row) => row.id === id ? { ...row, ...changes } : row);
    return Promise.resolve({ data: payload.schedules.find((row) => row.id === id) });
  });
});
afterEach(cleanup);

const loadScheduler = async () => {
  const hook = renderHook(() => useScheduler());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.isEditable).toBe(true);
  return hook;
};
const dragEvent = () => ({
  preventDefault: vi.fn(),
  dataTransfer: { effectAllowed: '', setData: vi.fn(), getData: vi.fn() },
}) as unknown as DragEvent;

type SchedulerHook = Awaited<ReturnType<typeof loadScheduler>>;
const relocate = async ({ result }: SchedulerHook, method: string, dayIndex: number, startSlot: number) => {
  if (method === 'drag') {
    act(() => result.current.handleDragStartFromCell(dragEvent(), result.current.schedules.find((row) => row.id === '1')!));
    act(() => result.current.handleDrop(dragEvent(), dayIndex, startSlot));
  } else {
    act(() => result.current.handleScheduleCardClick('1'));
    await act(async () => { await result.current.handleCellClick(dayIndex, startSlot); });
  }
};

describe.each(['drag', 'click-to-move'])('consecutive schedule relocation via %s', (method) => {
  it('saves one selected ID and preserves every other schedule, including a busy sibling day', async () => {
    // A whole-run time move would collide on Friday; Thursday's new slot is free.
    payload.schedules.push(meeting(4, 'Friday', {
      course_id: 21, course: { ...course, course_code: 'NUR 299' },
      split_group_id: null, preferred_pattern: null, start_time: '10:00:00', end_time: '13:00:00',
    }));
    const hook = await loadScheduler();
    const before = hook.result.current.schedules.filter((row) => row.id !== '1');

    await relocate(hook, method, 3, 6);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(put).toHaveBeenCalledExactlyOnceWith('/schedules/1', {
      day: 'Thursday', start_time: '10:00', end_time: '13:00',
    });
    expect(hook.result.current.schedules.find((row) => row.id === '1')?.startSlot).toBe(6);
    expect(hook.result.current.schedules.filter((row) => row.id !== '1')).toEqual(before);
  });

  it('moves to a different day without projecting sibling shifts', async () => {
    const hook = await loadScheduler();
    const before = hook.result.current.schedules.filter((row) => row.id !== '1');

    await relocate(hook, method, 2, 6);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(put).toHaveBeenCalledExactlyOnceWith('/schedules/1', {
      day: 'Wednesday', start_time: '10:00', end_time: '13:00',
    });
    expect(hook.result.current.schedules.find((row) => row.id === '1')?.dayIndex).toBe(2);
    expect(hook.result.current.schedules.filter((row) => row.id !== '1')).toEqual(before);
  });

  it('reports a stationary sibling overlap before sending an update', async () => {
    const hook = await loadScheduler();
    const before = hook.result.current.schedules;

    await relocate(hook, method, 4, 0);

    expect(put).not.toHaveBeenCalled();
    expect(hook.result.current.conflictInfo?.message).toMatch(/Section .+ is unavailable on Fri/);
    expect(hook.result.current.schedules).toEqual(before);
  });

  it('keeps every schedule unchanged and displays the actual server conflict on refusal', async () => {
    const hook = await loadScheduler();
    const before = hook.result.current.schedules;
    const message = 'Instructor Ana Cruz is unavailable on Thu 10:00 AM–1:00 PM.';
    put.mockRejectedValue({ response: { status: 422, data: {
      message: 'Schedule update conflicts with existing entries.',
      violations: [{ rule: 'faculty_conflict', message }],
    } } });

    await relocate(hook, method, 3, 6);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.any(String), message));
    expect(put).toHaveBeenCalledTimes(1);
    expect(hook.result.current.schedules).toEqual(before);
  });
});
