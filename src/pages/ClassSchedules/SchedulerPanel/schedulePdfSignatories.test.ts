import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roomTransferPreview } from '../../../lib/roomTransferPreview';
import type { RoomTransferRequest } from '../../../lib/roomRecovery';
import { buildSchedulePdf, buildSchedulesPdf, type SchedulePdfInput } from './schedulePdf';
import type { ScheduleSignatories } from './types';
import { mapApiSchedulesWithSignatories } from './hooks/initialDataMapper';

const settings = vi.hoisted(() => ({ president_name: 'Omar President', president_title: 'College President' }));
vi.mock('../../../lib/institutionSettings', () => ({ fetchInstitutionSettings: async () => settings }));
vi.mock('./fonts/systemPdfFonts', () => ({ registerSystemPdfFonts: () => ({ hasSans: false, hasDisplay: false }) }));

beforeEach(() => vi.stubGlobal('Image', class {
  onerror: (() => void) | null = null;
  constructor() { queueMicrotask(() => this.onerror?.()); }
}));
afterEach(() => vi.unstubAllGlobals());

/** Officials recorded when the schedule went through approval. */
const recorded: ScheduleSignatories = {
  prepared: [{ program_id: 7, user_id: 1, name: 'Paula Head', title: 'Program Head' }],
  reviewed: { user_id: 3, name: 'Diego Dean', title: 'Dean', acted_at: '2026-06-01T00:00:00Z' },
  recommended: { user_id: 4, name: 'Vera Vpaa', title: 'Vice-President for Academic Affairs', acted_at: '2026-06-02T00:00:00Z' },
  approved: { user_id: null, name: 'Olivia President', title: 'OIC-College President', acted_at: '2026-06-02T00:00:00Z' },
  frozen: true,
};

/** An approved one-section schedule whose officials have all since been replaced. */
const input = (): SchedulePdfInput => roomTransferPreview({
  id: 'plan-1', status: 'approved', department_id: 1, department: 'Science', semester_id: 3, semester_label: '2025-2026 2nd',
  submitted_by: 'Secretary', submitted_at: '', reviewed_at: null, rejection_reason: null, schedule_ids: [11],
  preview_semester: { id: 3, academic_year: '2025-2026', semester: '2nd', is_active: false },
  preview_department: { id: 1, department_name: 'Science', department_code: 'SCI' },
  preview_users: [
    { id: 1, name: 'Paula Renamed', role: 'program_head', department_id: 1, program_id: 7 },
    { id: 5, name: 'Nadia Dean', role: 'dean', department_id: 1, program_id: null },
    { id: 6, name: 'Nico Vpaa', role: 'vpaa', department_id: null, program_id: null },
  ],
  changes: [{ schedule_id: 11, mode: 'on-site', course: 'SCI101', section: 'A',
    before: { room: 'Lab 1', day: 'Monday', start_time: '08:00:00', end_time: '09:00:00' },
    after: { room: 'Lab 1', day: 'Monday', start_time: '08:00', end_time: '09:00' },
    preview_schedule: { id: 11, semester_id: 3, department_id: 1, section_id: 10, course_id: 5, room_id: 2, day: 'Monday', start_time: '08:00', end_time: '09:00', mode: 'on-site', status: 'faculty_assignment', created_by: 1,
      course: { course_code: 'SCI101', course_name: 'Science', lecture_hours: 1, lab_hours: 0, units: 1 },
      section: { id: 10, section_name: 'A', semester_id: 3, semester: '2nd', year_level: 1, department_id: 1, program_id: 7 }, room: { room_code: 'Lab 1' } },
  }],
} as RoomTransferRequest)!;

const pdfText = async (source: SchedulePdfInput | SchedulePdfInput[]): Promise<string> => {
  const blob = Array.isArray(source) ? await buildSchedulesPdf(source) : await buildSchedulePdf(source);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
};

const ORIGINAL = ['(PAULA HEAD', '(DIEGO DEAN', '(VERA VPAA', '(Olivia President', '(OIC-College President'];
const CURRENT = ['PAULA RENAMED', 'NADIA DEAN', 'NICO VPAA', 'Omar President'];

describe('schedule PDF signatories', () => {
  it('prints the officials recorded for the document, not those in office now', async () => {
    const pdf = await pdfText({ ...input(), signatories: recorded });
    for (const text of ORIGINAL) expect(pdf).toContain(text);
    for (const text of CURRENT) expect(pdf).not.toContain(text);
  });

  it('signs each submitted row with the officials recorded on its own submission', async () => {
    const source = input();
    source.allSchedules = source.allSchedules.map((schedule) => ({ ...schedule, signatories: recorded }));
    const pdf = await pdfText(source);
    for (const text of ORIGINAL) expect(pdf).toContain(text);
    for (const text of CURRENT) expect(pdf).not.toContain(text);
  });

  it('signs an unsubmitted draft with the officials in office now', async () => {
    const source = input();
    source.historicalDocument = false;
    source.allSchedules = source.allSchedules.map(row => ({ ...row, status: 'draft', creatorIdentity: { id: 1, name: 'Paula Original', role: 'program_head' } }));
    const pdf = await pdfText(source);
    for (const text of ['(PAULA ORIGINAL', '(NADIA DEAN', '(NICO VPAA', '(Omar President', '(College President']) expect(pdf).toContain(text);
    expect(pdf).not.toContain('DIEGO DEAN');
  });

  it('does not substitute current officials for missing historical signatories', async () => {
    const pdf = await pdfText({ ...input(), historicalDocument: true });
    for (const text of CURRENT) expect(pdf).not.toContain(text);
    expect(pdf).toContain('(Not recorded');
  });

  it('keeps missing slots in a closed legacy snapshot unrecorded', async () => {
    const pdf = await pdfText({ ...input(), signatories: {
      prepared: [], reviewed: null, recommended: null, approved: null, frozen: true,
    } });
    for (const text of CURRENT) expect(pdf).not.toContain(text);
    expect(pdf).toContain('(Not recorded');
  });

  it('wraps long President names and designations within their signature column', async () => {
    const name = 'President Alexandria '.repeat(7).trim();
    const title = 'Office of the College President '.repeat(4).trim();
    const pdf = await pdfText({ ...input(), signatories: { ...recorded, approved: { name, title } } });
    expect(pdf).not.toContain(`(${name})`);
    expect(pdf).not.toContain(`(${title})`);
    expect(pdf).toContain('(President Alexandria');
    expect(pdf).toContain('(Office of the College');
  });

  it('attaches recorded officials only to rows that name a submission', () => {
    const base = { id: 11, semester_id: 3, department_id: 1, section_id: 10, course_id: 5, room_id: 2, day: 'Monday', start_time: '08:00', end_time: '09:00', status: 'faculty_assignment' as const };
    const [signed, draft] = mapApiSchedulesWithSignatories(
      [{ ...base, signatories_submission_id: 42 }, { ...base, id: 12, status: 'draft' as const }],
      { 42: recorded },
    );
    expect(signed.signatories).toBe(recorded);
    expect(draft.signatories).toBeUndefined();
    expect(mapApiSchedulesWithSignatories([{ ...base, signatories_submission_id: 42 }], [])[0].signatories).toBeUndefined();
  });

  it('prints each department as its own document with its own pages', async () => {
    const science = input();
    const arts = input();
    arts.departments = [...arts.departments, { id: 2, department_name: 'Arts', department_code: 'ART' }];
    arts.sections = arts.sections.map((section) => ({ ...section, id: 'arts-a', departmentId: 2, name: 'ARTS A' }));
    arts.allSchedules = arts.allSchedules.map((schedule) => ({ ...schedule, sectionId: 'arts-a', departmentId: 2 }));
    arts.selectedSectionId = 'arts-a';

    const pdf = await pdfText([science, arts]);

    expect(pdf.match(/\/Type \/Page\n/g)).toHaveLength(2);
    expect(pdf.match(/\(TAGOLOAN COMMUNITY COLLEGE\)/g)).toHaveLength(2);
    expect(pdf).toContain('(COLLEGE OF SCIENCE)');
    expect(pdf).toContain('(COLLEGE OF ARTS)');
    expect(pdf.match(/\(Page No\.  1 of 1\)/g)).toHaveLength(2);
  });
});
