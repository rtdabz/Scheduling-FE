import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from './api';
import { defaultReportTerm, fetchReportData, fetchReportsOverview, type RoomReportSummary } from './reports';

vi.mock('./api', () => ({ default: { get: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe('fetchReportData', () => {
  it.each([null, 11])('preserves the room inventory and requester summary for program %s', async (programId) => {
    const roomSummary: RoomReportSummary = {
      total_rooms: 12, total_laboratories: 3, unavailable_rooms: 2,
      rooms: [{
        id: 3, room_code: 'LAB-201', building: 'Science Building', room_type: 'laboratory',
        status: 'not available', department_id: 1,
      }],
      requests: [{
        id: 9, room_code: 'CBA-101', requester: 'College of Information Technology',
        requested_by: 'Jane Santos', status: 'pending',
        direction: 'sent', owner_department: 'College of Business Administration',
        windows: [{ day: 'Monday', start_time: '07:00:00', end_time: '09:00:00' }],
      }],
    };
    vi.mocked(api.get).mockResolvedValue({ data: {
      active_semester: null, rooms: [], faculties: [], sections: [], schedules: [], departments: [], users: [],
      room_summary: roomSummary,
    } });

    const report = await fetchReportData(1, programId);

    expect(api.get).toHaveBeenCalledWith('/reports/departments/1', {
      params: programId === null ? undefined : { program_id: programId },
    });
    expect(report.roomSummary).toEqual(roomSummary);
    expect(report.rooms).toEqual([]);
    expect(report.schedules).toEqual([]);
  });

  it('accepts reports without the optional room summary', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {
      active_semester: null, rooms: [], faculties: [], sections: [], schedules: [], departments: [], users: [],
    } });

    const report = await fetchReportData(1, null);

    expect(report.roomSummary).toBeUndefined();
    expect(report.schedules).toEqual([]);
  });
});

describe('report terms', () => {
  it('sends the term with the program scope when one is chosen', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {
      active_semester: { id: 5, academic_year: '2026-2027', semester: '1st' },
      rooms: [], faculties: [], sections: [], schedules: [], departments: [], users: [],
    } });

    const report = await fetchReportData(1, 11, 5);

    expect(api.get).toHaveBeenCalledWith('/reports/departments/1', { params: { program_id: 11, semester_id: 5 } });
    expect(report.activeSemester?.id).toBe(5);
  });

  it('scopes the overview to a term only when one is given', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { departments: [] } });
    await fetchReportsOverview();
    await fetchReportsOverview(4);
    expect(api.get).toHaveBeenNthCalledWith(1, '/reports', { params: undefined });
    expect(api.get).toHaveBeenNthCalledWith(2, '/reports', { params: { semester_id: 4 } });
  });

  it('opens on the current term when it has approved data, otherwise the newest', () => {
    const past = { id: 4, academic_year: '2025-2026', semester: '2nd', is_active: false };
    const current = { id: 5, academic_year: '2026-2027', semester: '1st', is_active: true };
    expect(defaultReportTerm([past, current])).toBe(current);
    expect(defaultReportTerm([past])).toBe(past);
    expect(defaultReportTerm([])).toBeNull();
  });
});
