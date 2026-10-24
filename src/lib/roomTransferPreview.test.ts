import { afterEach, describe, expect, it, vi } from 'vitest';
import { roomTransferPreview } from './roomTransferPreview';
import type { RoomTransferRequest } from './roomRecovery';
import { buildSchedulePdf } from '../pages/ClassSchedules/SchedulerPanel/schedulePdf';

vi.mock('./institutionSettings', () => ({ fetchInstitutionSettings: async () => ({ president_name: 'College President', president_title: 'President' }) }));
vi.mock('../pages/ClassSchedules/SchedulerPanel/fonts/systemPdfFonts', () => ({ registerSystemPdfFonts: () => ({ hasSans: false, hasDisplay: false }) }));
afterEach(() => vi.unstubAllGlobals());

const request = (): RoomTransferRequest => ({
  id: 'plan-1', status: 'pending_dean', department_id: 1, department: 'Science', semester_id: 3, semester_label: '2025-2026 2nd',
  submitted_by: 'Secretary', submitted_at: '', reviewed_at: null, rejection_reason: null, schedule_ids: [11],
  preview_semester: { id: 3, academic_year: '2025-2026', semester: '2nd', is_active: false },
  preview_department: { id: 1, department_name: 'Science', department_code: 'SCI' },
  preview_users: [
    { id: 1, name: 'Program Lead', role: 'program_head', department_id: 1, program_id: 7 },
    { id: 2, name: 'Department Staff', role: 'secretary', department_id: 1, program_id: null },
    { id: 3, name: 'College Dean', role: 'dean', department_id: 1, program_id: null },
    { id: 4, name: 'Academic Vice President', role: 'vpaa', department_id: null, program_id: null },
  ],
  changes: [{ schedule_id: 11, mode: 'on-site', course: 'SCI101', section: 'A',
    before: { room: 'Lab 1', day: 'Monday', start_time: '08:00:00', end_time: '09:00:00' },
    after: { room: 'Lab 2', day: 'Wednesday', start_time: '10:00', end_time: '11:00' },
    preview_schedule: { id: 11, semester_id: 3, department_id: 1, section_id: 10, course_id: 5, room_id: 2, day: 'Monday', start_time: '08:00', end_time: '09:00', mode: 'on-site', status: 'faculty_assignment',
      course: { course_code: 'SCI101', course_name: 'Science', lecture_hours: 1, lab_hours: 0, units: 1 },
      section: { id: 10, section_name: 'A', semester_id: 3, semester: '2nd', year_level: 1, department_id: 1, program_id: 7 }, room: { room_code: 'Lab 1' } },
  }],
});

describe('roomTransferPreview', () => {
  it('renders copies of the proposed placement with the request semester and accurate course information', () => {
    const transfer = request();
    transfer.changes[0].preview_schedule!.course!.course_code = 'RENAMED';
    transfer.changes[0].preview_schedule!.section.section_name = 'Renamed section';
    const before = structuredClone(transfer);
    const preview = roomTransferPreview(transfer)!;
    expect(preview.allSchedules).toHaveLength(1);
    expect(preview.allSchedules[0]).toMatchObject({ id: '11', roomName: 'Lab 2', day: 'Wednesday', startTime: '10:00', endTime: '11:00', courseCode: 'SCI101', courseName: 'Science', totalUnits: 1 });
    expect(preview.activeSemester?.id).toBe(3);
    expect(preview.sections[0]).toMatchObject({ id: '10', name: 'A', semesterId: 3 });
    expect(preview.users).toEqual(transfer.preview_users);
    expect(preview.sections[0].programId).toBe(7);
    expect(preview.transferPreview?.changes).toEqual([{ scheduleId: '11', room: true, day: true, time: true }]);
    expect(transfer).toEqual(before);
  });
  it('excludes online partners only from this PDF input and leaves stored request membership intact', () => {
    const transfer = request();
    transfer.changes.push({ ...transfer.changes[0], schedule_id: 12, mode: 'online', preview_schedule: { ...transfer.changes[0].preview_schedule!, id: 12, mode: 'online' } });
    transfer.schedule_ids.push(12);
    expect(roomTransferPreview(transfer)?.allSchedules.map(row => row.id)).toEqual(['11']);
    expect(transfer.schedule_ids).toEqual([11, 12]); expect(transfer.changes).toHaveLength(2);
  });
  it('recognizes unchanged time formatting and only highlights changed fields', () => {
    const transfer = request(); transfer.changes[0].after = { ...transfer.changes[0].before, room: 'Lab 2', start_time: '08:00', end_time: '09:00' };
    expect(roomTransferPreview(transfer)?.transferPreview?.changes[0]).toEqual({ scheduleId: '11', room: true, day: false, time: false });
  });
  it('does not fabricate missing academic information', () => {
    const transfer = request(); delete transfer.changes[0].preview_schedule;
    expect(roomTransferPreview(transfer)).toBeNull();
  });
  it('does not invent a secretary identity when personnel records are unavailable', () => {
    const transfer = request(); delete transfer.preview_users;
    expect(roomTransferPreview(transfer)?.users).toEqual([]);
  });
  it('retains the changed-field highlights on approved records', () => {
    const transfer = request(); transfer.status = 'approved';
    expect(roomTransferPreview(transfer)?.transferPreview?.changes).toEqual([{ scheduleId: '11', room: true, day: true, time: true }]);
  });
  it.each([true, false])('prints the correct officials and placements in the real PDF (transfer: %s)', async isTransfer => {
    // Skip network images and use built-in fonts so the generated PDF text is inspectable.
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null;
      constructor() { queueMicrotask(() => this.onerror?.()); }
    });
    const transfer = request();
    const input = roomTransferPreview(transfer)!;
    if (!isTransfer) delete input.transferPreview;
    const readPdf = async () => {
      const blob = await buildSchedulePdf(input);
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(blob);
      });
    };
    const pdf = await readPdf();
    expect(pdf).toContain('%PDF-');
    for (const text of ['PROGRAM LEAD', 'Program Head', 'COLLEGE DEAN', 'Dean', 'ACADEMIC VICE PRESIDENT', 'Vice-President for Academic Affairs', 'College President', 'President', 'Lab 2', 'Wednesday', '10:00 AM']) {
      expect(pdf).toContain(`(${text}`);
    }
    expect(pdf).not.toContain('PROPOSED ROOM TRANSFERS');
    expect(pdf).not.toContain('ROOM TRANSFER RECORD');
    expect(pdf).not.toContain('Changed day, time and room values are highlighted.');
    expect(pdf).not.toContain('This document does not apply changes.');
    expect(pdf).not.toContain('(Department Secretary)');
    input.users = input.users.filter(user => user.role !== 'program_head');
    const secretaryPdf = await readPdf();
    expect(secretaryPdf).toContain('(DEPARTMENT STAFF)');
    expect(secretaryPdf).toContain('(Department Secretary)');
    expect(secretaryPdf).not.toContain('(PROGRAM LEAD)');
  });
});
