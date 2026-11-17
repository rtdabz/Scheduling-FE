import { describe, expect, it } from 'vitest';
import { buildRoomUtilizationPdf, getRoomUtilizationPdfFilename } from './roomUtilizationPdf';

const readText = (blob: Blob) => new Promise<string>((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.readAsText(blob);
});

const usage = (scheduledHours: number, meetings = 0) => ({
  capacityHours: 81,
  scheduledHours,
  utilization: Math.round((scheduledHours / 81) * 100),
  unusedHours: 81 - scheduledHours,
  days: [
    { day: 'Mon', scheduledHours, freeWindows: scheduledHours ? ['10 AM – 8:30 PM'] : ['7 AM – 8:30 PM'] },
    { day: 'Tue', scheduledHours: 0, freeWindows: ['7 AM – 8:30 PM'] },
  ],
  meetings: Array.from({ length: meetings }, () => ({
    day: 'Mon', time: '7 AM – 10 AM', course: 'IT 101 · Programming', section: 'BSIT 1A', instructor: 'Alice Santos', hours: 3,
  })),
});

describe('room utilization PDF', () => {
  const input = {
    title: 'CIT Room Utilization',
    scope: 'All programs: BSIT, BSCS',
    academicYear: '2026-2027',
    semester: '1st',
    operatingWindow: 'Mon–Sat, 7 AM – 8:30 PM',
    generatedAt: new Date(2026, 10, 17, 9, 0),
    totals: { rooms: 2, laboratories: 1, unavailable: 1 },
    rows: [
      { code: 'SCI-101', building: 'Science Building', roomType: 'Lecture', scheduledClasses: 1, daysUtilized: 'Mon', status: 'In Use', usage: usage(3, 1) },
      { code: 'LAB-201', building: 'Main Campus', roomType: 'Laboratory', scheduledClasses: 0, daysUtilized: '', status: 'Unavailable', usage: usage(0) },
    ],
  };

  it('prints the header, totals, summary and per-room detail with page numbers', async () => {
    const text = await readText(await buildRoomUtilizationPdf(input));
    expect(text.startsWith('%PDF-')).toBe(true);
    for (const expected of [
      'ROOM UTILIZATION REPORT', 'CIT Room Utilization', 'All programs: BSIT, BSCS',
      'Weekly operating hours', 'Overall utilization'.toUpperCase(), 'UTILIZATION SUMMARY', 'ROOM DETAILS',
      'SCI-101', 'Capacity', 'Available time slots', 'Alice Santos', 'No classes assigned to this room for the term.',
      'Page 1 of',
    ]) {
      expect(text, expected).toContain(expected);
    }
  });

  it('builds a PDF for an empty room list', async () => {
    const text = await readText(await buildRoomUtilizationPdf({ ...input, rows: [] }));
    expect(text).toContain('No rooms in this report.');
    expect(text).not.toContain('ROOM DETAILS');
  });

  it('names the file after the report and term', () => {
    expect(getRoomUtilizationPdfFilename(input)).toBe('CIT-Room-Utilization-2026-2027-1st.pdf');
  });
});
