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
    expect(transfer).toEqual(before);
  });
  it('prints the linked online session as Online with the moved meeting', () => {
    const transfer = request();
    const online = { room: 'Online', day: 'Friday', start_time: '13:00', end_time: '14:00' };
    transfer.changes.push({ ...transfer.changes[0], schedule_id: 12, mode: 'online', before: online, after: online,
      preview_schedule: { ...transfer.changes[0].preview_schedule!, id: 12, mode: 'online', room_id: null, room: null } });
    const preview = roomTransferPreview(transfer)!;
    expect(preview.allSchedules.map(row => [row.id, row.roomName, row.day])).toEqual([['11', 'Lab 2', 'Wednesday'], ['12', 'Online', 'Friday']]);
  });
  it('prints every class of the affected sections like Schedule Approval, with the proposal applied', () => {
    const transfer = request();
    const proposedRow = transfer.changes[0].preview_schedule!;
    const otherSection = { ...proposedRow.section, id: 20, section_name: 'B' };
    transfer.preview_schedules = [
      { ...proposedRow, day: 'Monday', room: { room_code: 'Lab 1' } },
      { ...proposedRow, id: 13, course_id: 6, day: 'Tuesday', start_time: '13:00', end_time: '14:00', room_id: 9,
        course: { course_code: 'MATH1', course_name: 'Math', lecture_hours: 1, lab_hours: 0, units: 1 }, room: { room_code: 'R9' } },
      { ...proposedRow, id: 14, section_id: 20, section: otherSection, mode: 'online', room_id: null, room: null },
    ];
    const preview = roomTransferPreview(transfer)!;
    expect(preview.allSchedules.map(row => [row.id, row.courseCode, row.roomName, row.day])).toEqual([
      ['11', 'SCI101', 'Lab 2', 'Wednesday'], ['13', 'MATH1', 'R9', 'Tuesday'], ['14', 'SCI101', 'Online', 'Monday']]);
    expect(preview.sections.map(section => section.name)).toEqual(['A', 'B']);
    expect(preview.selectedSectionId).toBe('10');
  });
  it.each(['pending_dean', 'approved'] as const)('passes Schedule Approval PDF input without change highlighting (%s)', status => {
    const transfer = request(); transfer.status = status;
    expect(Object.keys(roomTransferPreview(transfer)!).sort()).toEqual(['activeSemester', 'allSchedules', 'departments', 'sections', 'selectedSectionId', 'users']);
  });
  it('does not fabricate missing academic information', () => {
    const transfer = request(); delete transfer.changes[0].preview_schedule;
    expect(roomTransferPreview(transfer)).toBeNull();
  });
  it('does not invent a secretary identity when personnel records are unavailable', () => {
    const transfer = request(); delete transfer.preview_users;
    expect(roomTransferPreview(transfer)?.users).toEqual([]);
  });
  it('prints the full section timetable with its linked online session in the real PDF', async () => {
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null;
      constructor() { queueMicrotask(() => this.onerror?.()); }
    });
    const transfer = request();
    const proposedRow = transfer.changes[0].preview_schedule!;
    transfer.preview_schedules = [
      { ...proposedRow, id: 12, mode: 'online', day: 'Friday', start_time: '13:00', end_time: '14:00', room_id: null, room: null },
      { ...proposedRow, id: 13, course_id: 6, day: 'Tuesday', start_time: '15:00', end_time: '16:00', room_id: 9,
        course: { course_code: 'MATH1', course_name: 'Mathematics', lecture_hours: 1, lab_hours: 0, units: 1 }, room: { room_code: 'R9' } },
    ];
    const blob = await buildSchedulePdf(roomTransferPreview(transfer)!);
    const pdf = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    for (const text of ['SCI101', 'Lab 2', 'Online', 'MATH1', 'Mathematics', 'R9']) expect(pdf).toContain(`(${text}`);
  });
  it('prints the correct officials and placements in the real PDF', async () => {
    // Skip network images and use built-in fonts so the generated PDF text is inspectable.
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null;
      constructor() { queueMicrotask(() => this.onerror?.()); }
    });
    const transfer = request();
    const input = roomTransferPreview(transfer)!;
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
    // The Program Head prepares the official schedule even when the Secretary entered it.
    input.users = input.users.filter(user => user.role !== 'program_head');
    const withoutHead = await readPdf();
    expect(withoutHead).toContain('(Program Head)');
    expect(withoutHead).not.toContain('(DEPARTMENT STAFF)');
    expect(withoutHead).not.toContain('(Department Secretary)');
    expect(withoutHead).not.toContain('(PROGRAM LEAD)');
  });
  it('lists the Program Head of every printed program as preparer', async () => {
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null;
      constructor() { queueMicrotask(() => this.onerror?.()); }
    });
    const transfer = request();
    const proposedRow = transfer.changes[0].preview_schedule!;
    transfer.preview_schedules = [{ ...proposedRow, id: 15, section_id: 20,
      section: { ...proposedRow.section, id: 20, section_name: 'B', program_id: 8 } }];
    transfer.preview_users = [...transfer.preview_users!, { id: 5, name: 'Second Lead', role: 'program_head', department_id: 1, program_id: 8 }];
    const blob = await buildSchedulePdf(roomTransferPreview(transfer)!);
    const pdf = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(blob);
    });
    expect(pdf).toContain('(PROGRAM LEAD / SECOND LEAD)');
    expect(pdf).toContain('(Program Head)');
    expect(pdf).not.toContain('(DEPARTMENT STAFF)');
  });
});
