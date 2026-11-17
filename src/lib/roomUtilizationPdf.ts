import { buildExportFilename } from './exportFile';
import type { RoomUtilizationSummary } from './roomUtilizationReport';

export interface RoomUtilizationPdfRow {
  code: string;
  building: string;
  roomType: string;
  scheduledClasses: number;
  daysUtilized: string;
  status: string;
  usage: RoomUtilizationSummary;
}

export interface RoomUtilizationPdfInput {
  title: string;
  /** Department or program name printed under the title. */
  scope?: string | null;
  academicYear?: string | null;
  semester?: string | null;
  /** The weekly window utilization is measured against, e.g. "Mon–Sat, 7 AM – 8:30 PM". */
  operatingWindow?: string | null;
  generatedAt?: Date;
  totals: { rooms: number; laboratories: number; unavailable: number };
  rows: RoomUtilizationPdfRow[];
  /** Printed under the summary table, e.g. why virtual rooms are left out. */
  note?: string | null;
}

type Rgb = [number, number, number];
const BRAND: Rgb = [78, 10, 16];
const ACCENT: Rgb = [201, 149, 42];
const INK: Rgb = [30, 41, 59];
const MUTED: Rgb = [100, 116, 139];
const FAINT: Rgb = [148, 163, 184];
const RULE: Rgb = [226, 232, 240];
const PANEL: Rgb = [248, 250, 252];
const HEAD_FILL: Rgb = [241, 245, 249];

const MARGIN = 14;
const FOOTER_SPACE = 16;

const hours = (value: number) => value.toFixed(1);

/** Green when well used, amber when light, slate when idle. */
const utilizationColor = (percent: number): Rgb =>
  percent >= 60 ? [5, 150, 105] : percent >= 25 ? [217, 119, 6] : percent > 0 ? [100, 116, 139] : [203, 213, 225];

const statusColor = (status: string): Rgb =>
  status === 'Unavailable' ? [180, 83, 9] : status === 'In Use' ? [4, 120, 87] : MUTED;

export const getRoomUtilizationPdfFilename = ({ title, academicYear, semester }: RoomUtilizationPdfInput): string =>
  buildExportFilename('pdf', title, academicYear, semester);

/**
 * The room utilization report: a branded header with the term and coverage window, inventory
 * and usage totals, a one-line-per-room utilization summary, then a detail block per room with
 * its usage by day, open time slots and assigned classes. Every page carries page numbers.
 */
export async function buildRoomUtilizationPdf(input: RoomUtilizationPdfInput): Promise<Blob> {
  const [{ default: PdfDocument }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new PdfDocument({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const generatedAt = input.generatedAt ?? new Date();
  const term = [input.semester && `${input.semester} Semester`, input.academicYear && `A.Y. ${input.academicYear}`]
    .filter(Boolean)
    .join(', ');
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ensureSpace = (y: number, needed: number) => {
    if (y + needed <= pageHeight - FOOTER_SPACE) return y;
    doc.addPage();
    return 20;
  };
  const sectionHeading = (text: string, y: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...BRAND);
    doc.text(text.toUpperCase(), MARGIN, y);
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y + 1.5, MARGIN + 12, y + 1.5);
    return y + 6;
  };

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, 30, pageWidth, 1.2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('ROOM UTILIZATION REPORT', MARGIN, 10);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(input.title, MARGIN, 18);
  if (input.scope) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(input.scope, MARGIN, 24.5);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(term || 'All terms', pageWidth - MARGIN, 10, { align: 'right' });
  doc.text(`Generated ${generatedAt.toLocaleString()}`, pageWidth - MARGIN, 15, { align: 'right' });

  // Reporting period
  let y = 38;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const period = [
    term && `Term: ${term}`,
    input.operatingWindow && `Weekly operating hours: ${input.operatingWindow}`,
  ].filter(Boolean).join('     ');
  if (period) {
    doc.text(period, MARGIN, y);
    y += 6;
  }

  // Totals
  const scheduled = input.rows.reduce((total, row) => total + row.usage.scheduledHours, 0);
  const capacity = input.rows.reduce((total, row) => total + row.usage.capacityHours, 0);
  const tiles: [string, string][] = [
    ['Rooms', String(input.totals.rooms)],
    ['Laboratories', String(input.totals.laboratories)],
    ['Unavailable', String(input.totals.unavailable)],
    ['Scheduled hrs / week', hours(scheduled)],
    ['Overall utilization', `${capacity > 0 ? Math.round((scheduled / capacity) * 100) : 0}%`],
  ];
  const gap = 3;
  const tileWidth = (contentWidth - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([label, value], index) => {
    const x = MARGIN + index * (tileWidth + gap);
    doc.setFillColor(...PANEL);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, tileWidth, 15, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...BRAND);
    doc.text(value, x + 3, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 3, y + 12);
  });
  y += 23;

  // Summary table
  y = sectionHeading('Utilization summary', y);
  const tableStyles = {
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, textColor: INK, lineColor: RULE, lineWidth: 0.1 },
    headStyles: { fillColor: HEAD_FILL, textColor: MUTED, fontStyle: 'bold' as const, fontSize: 6.5 },
    alternateRowStyles: { fillColor: [252, 252, 253] as Rgb },
    margin: { left: MARGIN, right: MARGIN, top: 20, bottom: FOOTER_SPACE },
  };
  const UTIL_COLUMN = 5;
  autoTable(doc, {
    ...tableStyles,
    startY: y,
    head: [['Room', 'Building', 'Type', 'Capacity (hrs/wk)', 'Scheduled (hrs)', 'Utilization', 'Classes', 'Days used', 'Status']],
    body: input.rows.length
      ? input.rows.map((row) => [
          row.code, row.building, row.roomType, hours(row.usage.capacityHours), hours(row.usage.scheduledHours),
          `${row.usage.utilization}%`, String(row.scheduledClasses), row.daysUtilized || '—', row.status,
        ])
      : [[{ content: 'No rooms in this report.', colSpan: 9, styles: { halign: 'center', fontStyle: 'italic' } }]],
    columnStyles: {
      0: { fontStyle: 'bold', textColor: BRAND },
      3: { halign: 'right' }, 4: { halign: 'right' },
      5: { halign: 'right', cellWidth: 28 },
      6: { halign: 'center' },
      8: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 8 && input.rows.length) {
        data.cell.styles.textColor = statusColor(String(data.cell.raw));
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== UTIL_COLUMN || !input.rows.length) return;
      const percent = input.rows[data.row.index]?.usage.utilization ?? 0;
      const barWidth = data.cell.width - 13;
      const barY = data.cell.y + data.cell.height / 2 - 1;
      doc.setFillColor(...RULE);
      doc.roundedRect(data.cell.x + 1.8, barY, barWidth, 2, 1, 1, 'F');
      if (percent > 0) {
        doc.setFillColor(...utilizationColor(percent));
        doc.roundedRect(data.cell.x + 1.8, barY, Math.max(2, barWidth * Math.min(percent, 100) / 100), 2, 1, 1, 'F');
      }
    },
  });
  y = lastY() + 4;
  if (input.note) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...FAINT);
    doc.text(input.note, MARGIN, y);
    y += 4;
  }

  // Per-room detail
  if (input.rows.length) {
    y = sectionHeading('Room details', ensureSpace(y + 4, 40));
    input.rows.forEach((row) => {
      y = ensureSpace(y, 46);
      doc.setFillColor(...PANEL);
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.roundedRect(MARGIN, y, contentWidth, 11, 1.5, 1.5, 'FD');
      doc.setFillColor(...utilizationColor(row.usage.utilization));
      doc.rect(MARGIN, y, 1.2, 11, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...BRAND);
      doc.text(row.code, MARGIN + 4, y + 4.8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(`${row.building} · ${row.roomType} · ${row.status}`, MARGIN + 4, y + 8.8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(`${row.usage.utilization}%`, pageWidth - MARGIN - 3, y + 4.8, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(
        `${hours(row.usage.scheduledHours)} of ${hours(row.usage.capacityHours)} hrs booked · ${hours(row.usage.unusedHours)} hrs unused`,
        pageWidth - MARGIN - 3, y + 8.8, { align: 'right' },
      );

      autoTable(doc, {
        ...tableStyles,
        startY: y + 13,
        head: [['Day', 'Scheduled (hrs)', 'Available time slots']],
        body: row.usage.days.map((day) => [
          day.day, hours(day.scheduledHours), day.freeWindows.length ? day.freeWindows.join(',  ') : 'Fully booked',
        ]),
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 14 }, 1: { halign: 'right', cellWidth: 24 } },
      });

      autoTable(doc, {
        ...tableStyles,
        startY: lastY() + 2,
        head: [['Day', 'Time', 'Course', 'Section', 'Instructor', 'Hours']],
        body: row.usage.meetings.length
          ? row.usage.meetings.map((m) => [m.day, m.time, m.course, m.section, m.instructor, hours(m.hours)])
          : [[{ content: 'No classes assigned to this room for the term.', colSpan: 6, styles: { halign: 'center', fontStyle: 'italic', textColor: FAINT } }]],
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 14 }, 1: { cellWidth: 30 }, 5: { halign: 'right', cellWidth: 14 } },
      });
      y = lastY() + 7;
    });
  }

  // Running header and page numbers on every page
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...BRAND);
      doc.text(input.title, MARGIN, 11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(term, pageWidth - MARGIN, 11, { align: 'right' });
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, 13.5, pageWidth - MARGIN, 13.5);
    }
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, pageHeight - 11, pageWidth - MARGIN, pageHeight - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...FAINT);
    doc.text(`${input.title}${term ? ` · ${term}` : ''} · Generated ${generatedAt.toLocaleDateString()}`, MARGIN, pageHeight - 7);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 7, { align: 'right' });
  }

  return doc.output('blob');
}
