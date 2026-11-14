import { describe, expect, it } from 'vitest';
import { buildRoomUtilizationPdf, getRoomUtilizationPdfFilename } from './roomUtilizationPdf';

describe('room utilization PDF', () => {
  const input = {
    title: 'CIT Room Utilization',
    academicYear: '2026-2027',
    semester: '1st',
    totals: { rooms: 2, laboratories: 1, unavailable: 1 },
    rows: [
      { code: 'SCI-101', building: 'Science Building', roomType: 'Lecture', scheduledClasses: 3, daysUtilized: 'Mon, Wed', status: 'In Use' },
      { code: 'LAB-201', building: 'Main Campus', roomType: 'Laboratory', scheduledClasses: 0, daysUtilized: '', status: 'Unavailable' },
    ],
  };

  it('builds a PDF document', async () => {
    const blob = await buildRoomUtilizationPdf(input);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('SCI-101');
    expect(text).toContain('Room/Lab Unavailable: 1');
  });

  it('builds a PDF for an empty room list', async () => {
    const blob = await buildRoomUtilizationPdf({ ...input, rows: [] });
    expect(blob.size).toBeGreaterThan(0);
  });

  it('names the file after the report and term', () => {
    expect(getRoomUtilizationPdfFilename(input)).toBe('CIT-Room-Utilization-2026-2027-1st.pdf');
  });
});
