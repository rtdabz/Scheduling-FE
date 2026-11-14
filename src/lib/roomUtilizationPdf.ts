import { buildExportFilename } from './exportFile';

export interface RoomUtilizationPdfRow {
  code: string;
  building: string;
  roomType: string;
  scheduledClasses: number;
  daysUtilized: string;
  status: string;
}

export interface RoomUtilizationPdfInput {
  title: string;
  academicYear?: string | null;
  semester?: string | null;
  totals: { rooms: number; laboratories: number; unavailable: number };
  rows: RoomUtilizationPdfRow[];
}

export const getRoomUtilizationPdfFilename = ({ title, academicYear, semester }: RoomUtilizationPdfInput): string =>
  buildExportFilename('pdf', title, academicYear, semester);

/** A printable room utilization report: header, inventory totals and one row per room. */
export async function buildRoomUtilizationPdf(input: RoomUtilizationPdfInput): Promise<Blob> {
  const [{ default: PdfDocument }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new PdfDocument({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(78, 10, 16);
  doc.text(input.title, margin, 18);

  const term = [input.academicYear && `A.Y. ${input.academicYear}`, input.semester && `${input.semester} Semester`].filter(Boolean).join(' · ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  if (term) doc.text(term, margin, 24);
  doc.text(
    `Rooms: ${input.totals.rooms}   Laboratories: ${input.totals.laboratories}   Room/Lab Unavailable: ${input.totals.unavailable}`,
    margin,
    term ? 29 : 24,
  );

  autoTable(doc, {
    startY: term ? 34 : 29,
    margin: { left: margin, right: margin },
    head: [['Room Code', 'Building', 'Room Type', 'Scheduled Classes', 'Days Utilized', 'Status']],
    body: input.rows.length
      ? input.rows.map((row) => [row.code, row.building, row.roomType, String(row.scheduledClasses), row.daysUtilized || '—', row.status])
      : [[{ content: 'No rooms in this report.', colSpan: 6, styles: { halign: 'center', fontStyle: 'italic' } }]],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249], textColor: [100, 116, 139], fontStyle: 'bold', fontSize: 7 },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [78, 10, 16] }, 3: { halign: 'center' }, 5: { halign: 'right' } },
    didDrawPage: () => {
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated ${new Date().toLocaleDateString()}`, margin, pageHeight - 8);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    },
  });

  return doc.output('blob');
}
