import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataCache } from '../../../../lib/dataCache';
import type { ApiScheduleRecord } from '../types';
import type { InitialDataResponse } from './initialDataMapper';
import { useScheduler } from './useScheduler';

const { get, put, patch, toast, confirm } = vi.hoisted(() => ({
  get: vi.fn(), put: vi.fn(), patch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, confirm: vi.fn(),
}));
vi.mock('../../../../lib/api', () => ({ default: { get, put, patch } }));
vi.mock('../../../../context/ToastContext', () => ({ useToast: () => ({ toast, confirm }) }));
vi.mock('../../../../hooks/useLiveRefresh', () => ({ useLiveRefresh: vi.fn() }));
vi.mock('../../../../lib/conflicts', () => ({
  fetchConflicts: vi.fn().mockResolvedValue([]), fetchResolvedConflicts: vi.fn().mockResolvedValue([]),
  resolvedScheduleIds: () => new Set(),
}));

let payload: InitialDataResponse;
const course = {
  id: 20, course_code: 'GEE 4', course_name: 'Living in the IT Era',
  course_category: 'minor', department_id: 8, teaching_department_id: 6,
  semester: '1st', year_level: 2, units: 3, lecture_hours: 3, lab_hours: 0,
  room_type_required: 'lecture', status: 'active',
} as const;
const faculty = {
  id: 10, first_name: 'Vincent', last_name: 'Masayon', department_id: 6,
  employment_type: 'full-time', status: 'active',
} as const;
const meeting = (id: number, extra: Partial<ApiScheduleRecord> = {}): ApiScheduleRecord => ({
  id, semester_id: 1, course_id: 20, department_id: 8, section_id: 30, room_id: null,
  day: id === 1 ? 'Monday' : 'Thursday', start_time: '07:00:00', end_time: '08:30:00',
  mode: 'on-site', status: 'approved', faculty_id: 10, faculty, course,
  section: { section_name: 'BSHM 2A' },
  ...extra,
});

beforeEach(() => {
  clearDataCache(); localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  localStorage.setItem('user', JSON.stringify({
    id: 1, role: 'secretary', department_id: 6, permissions: ['schedule.assign_instructor'],
  }));
  payload = {
    active_semester: { id: 1, semester: '1st', academic_year: '2026-2027', is_active: true },
    rooms: [], sections: [], courses: [{ ...course }], faculties: [faculty],
    schedules: [meeting(1), meeting(2)], users: [], departments: [],
  };
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/initial-data' ? payload : {} }));
  patch.mockImplementation((_url: string, body: { assignments: { faculty_id: number | null }[] }) => {
    payload.schedules = payload.schedules.map((row) => ({
      ...row, faculty_id: body.assignments[0].faculty_id,
      faculty: body.assignments[0].faculty_id === null ? null : faculty,
    }));
    return Promise.resolve({ data: { schedules: payload.schedules } });
  });
  put.mockImplementation((_url: string, body: { faculty_id: number | null }) => {
    payload.schedules = payload.schedules.map((row) => ({
      ...row, faculty_id: body.faculty_id, faculty: body.faculty_id === null ? null : faculty,
    }));
    return Promise.resolve({ data: { schedules: payload.schedules } });
  });
});
afterEach(cleanup);

const loadScheduler = async () => {
  const hook = renderHook(() => useScheduler());
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  expect(hook.result.current.schedules).toHaveLength(payload.schedules.length);
  return hook;
};

describe('scheduler instructor mutations', () => {
  it.each([
    { label: 'retains recorded approval evidence when unchanged signatures are omitted', returned: undefined, retains: true },
    { label: 'honors an explicit null signature without restoring old evidence', returned: null, retains: false },
  ])('$label', async ({ returned, retains }) => {
    const signatories = {
      prepared: [{ name: 'Original Secretary', title: 'Department Secretary' }],
      reviewed: { name: 'Original Dean', title: 'Dean' },
      recommended: null, approved: null, frozen: true,
    };
    const creatorIdentity = { id: 17, name: 'Former Secretary', role: 'secretary' };
    payload.schedules = [meeting(1, { signatories, created_by: 17, creator_identity: creatorIdentity }), meeting(2, { signatories, created_by: 17, creator_identity: creatorIdentity })];
    const { result } = await loadScheduler();
    expect(result.current.schedules[0].signatories).toEqual(signatories);
    // A later GET must not repair a mutation response before its local integrity is checked.
    get.mockImplementation(() => new Promise(() => {}));
    patch.mockResolvedValue({ data: { schedules: [
      meeting(1, { faculty_id: null, faculty: null, signatories: returned, created_by: retains ? undefined : null, creator_identity: retains ? undefined : null }),
      meeting(2, { faculty_id: null, faculty: null }),
    ] } });

    await act(async () => { await result.current.handleRemoveInlineFaculty('1'); });

    expect(result.current.schedules[0].facultyId).toBeNull();
    expect(result.current.schedules[0].signatories).toEqual(retains ? signatories : null);
    expect(result.current.schedules[1].signatories).toEqual(signatories);
    expect(result.current.schedules[0].creatorIdentity).toEqual(retains ? creatorIdentity : null);
    expect(result.current.schedules[0].createdById).toBe(retains ? 17 : null);
    expect(result.current.schedules[1].creatorIdentity).toEqual(creatorIdentity);
    expect(result.current.schedules[1].createdById).toBe(17);
  });

  it('removes a delegated class through the instructor endpoint and applies every returned meeting once', async () => {
    const { result } = await loadScheduler();
    let removed = false;
    await act(async () => { removed = await result.current.handleRemoveFacultyFromClass(['1', '2', '1']); });
    expect(removed).toBe(true);
    expect(patch).toHaveBeenCalledExactlyOnceWith('/schedules/batch-faculty', {
      assignments: [{ schedule_ids: [1], faculty_id: null }],
    });
    expect(put).not.toHaveBeenCalled();
    expect(result.current.schedules.map((row) => [row.id, row.facultyId])).toEqual([['1', null], ['2', null]]);
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('Instructor Removed', expect.any(String));
  });

  it('uses the same instructor endpoint for a delegation between programs in one college', async () => {
    payload.courses = [{ ...course, department_id: 6, program_id: 11, teaching_program_id: 12 }];
    payload.schedules = [meeting(1, { department_id: 6 })];
    payload.sections = [{ id: 30, section_name: 'BSLIS 2A', year_level: 2, semester: '1st', semester_id: 1, department_id: 6, program_id: 11 }];
    payload.can_edit_program_ids = [12];
    const { result } = await loadScheduler();
    await act(async () => { await result.current.handleRemoveInlineFaculty('1'); });
    expect(patch).toHaveBeenCalledExactlyOnceWith('/schedules/batch-faculty', {
      assignments: [{ schedule_ids: [1], faculty_id: null }],
    });
    expect(put).not.toHaveBeenCalled();
    expect(result.current.schedules[0].facultyId).toBeNull();
  });

  it('retains local update history for a sibling class whose source program the user also manages', async () => {
    payload.courses = [{ ...course, department_id: 6, program_id: 11, teaching_program_id: 12 }];
    payload.schedules = [meeting(1, { department_id: 6 })];
    payload.sections = [{ id: 30, section_name: 'BSLIS 2A', year_level: 2, semester: '1st', semester_id: 1, department_id: 6, program_id: 11 }];
    payload.can_edit_program_ids = [11, 12];
    const { result } = await loadScheduler();
    await act(async () => { await result.current.handleRemoveInlineFaculty('1'); });
    expect(put).toHaveBeenCalledExactlyOnceWith('/schedules/1', { faculty_id: null });
    expect(patch).not.toHaveBeenCalled();
    expect(result.current.schedules[0].facultyId).toBeNull();
  });

  it('keeps the assigned instructor when the server rejects delegated removal', async () => {
    patch.mockRejectedValue({ response: { status: 403, data: { message: 'Only the assigned teaching program can change this instructor.' } } });
    const { result } = await loadScheduler();
    let removed = true;
    await act(async () => { removed = await result.current.handleRemoveFacultyFromClass(['1', '2']); });
    expect(removed).toBe(false);
    expect(patch).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(result.current.schedules.map((row) => row.facultyId)).toEqual(['10', '10']);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Unable to remove instructor', 'Only the assigned teaching program can change this instructor.');
  });

  it('retains the existing ordinary local schedule update path', async () => {
    payload.courses = [{ ...course, department_id: 6, teaching_department_id: null }];
    payload.schedules = [meeting(1, { department_id: 6 })];
    const { result } = await loadScheduler();
    await act(async () => { await result.current.handleRemoveInlineFaculty('1'); });
    expect(put).toHaveBeenCalledExactlyOnceWith('/schedules/1', { faculty_id: null });
    expect(patch).not.toHaveBeenCalled();
    expect(result.current.schedules[0].facultyId).toBeNull();
  });
});
