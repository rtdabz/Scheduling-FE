import type jsPDF from 'jspdf';
import tccLogo from '../assets/logo.jpg';
import municipalLogo from '../assets/municipal-logo.png';
import type { Curriculum, CurriculumNote, CurriculumSemester, Program } from '../types/curriculum';
import { noteSegments, noteScopeLabel } from './curriculumImport/notes';
import { buildExportFilename } from './exportFile';
import { openPdfPreview } from './pdfPreview';

export const getCurriculumPdfFilename = (curriculum: Curriculum): string =>
  buildExportFilename('pdf', 'curriculum', curriculum.code, curriculum.effective_school_year);

interface PrintCurriculumOptions {
  curriculum: Curriculum;
  semesters: CurriculumSemester[];
  program?: Program | null;
}

interface CurriculumPrintSection {
  yearLevel: number;
  firstSemester: CurriculumSemester;
  secondSemester: CurriculumSemester;
  summer: CurriculumSemester;
}

const PAGE_WIDTH = 216;
const PAGE_HEIGHT = 356;
const PAGE_MARGIN = 8;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const EVALUATION_HEIGHT = 39;
const PRINT_LOGO_SIZE = 18;
const PRINT_LOGO_Y = 7;

const emptySemester = (yearLevel: number, semester: number): CurriculumSemester => ({
  year_level: yearLevel,
  semester,
  courses: [],
  totals: { lec: 0, lab: 0, tu: 0 },
});

export const getCurriculumPrintSections = (semesters: CurriculumSemester[]): CurriculumPrintSection[] =>
  [1, 2, 3, 4].map((yearLevel) => ({
    yearLevel,
    firstSemester: semesters.find((semester) => semester.year_level === yearLevel && semester.semester === 1) ?? emptySemester(yearLevel, 1),
    secondSemester: semesters.find((semester) => semester.year_level === yearLevel && semester.semester === 2) ?? emptySemester(yearLevel, 2),
    summer: semesters.find((semester) => semester.year_level === yearLevel && semester.semester === 3) ?? emptySemester(yearLevel, 3),
  }));

export const getPrintableProgramTitle = (curriculum: Curriculum, program?: Program | null): string => {
  const curriculumName = curriculum.name.trim();
  const programName = program?.name?.trim();
  const programCode = program?.code?.trim().toUpperCase();

  if (/^bachelor\b/i.test(programName ?? '')) {
    return `${programName}${programCode && !programName?.toUpperCase().includes(programCode) ? ` (${programCode})` : ''}`.toUpperCase();
  }

  if (programName) {
    return `BACHELOR OF SCIENCE IN ${programName}${programCode ? ` (${programCode})` : ''}`.toUpperCase();
  }

  if (/^bachelor\b/i.test(curriculumName)) {
    return curriculumName.toUpperCase();
  }

  return `${curriculumName}${programCode ? ` (${programCode})` : ''}`.toUpperCase();
};

const resolveAssetUrl = (asset: string): string => {
  if (/^(data:|https?:)/i.test(asset)) return asset;
  return `${window.location.origin}${asset.startsWith('/') ? '' : '/'}${asset}`;
};

const loadImage = (url?: string | null): Promise<HTMLImageElement | null> => {
  if (!url) return Promise.resolve(null);

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = /^(data:|https?:)/i.test(url) ? url : resolveAssetUrl(url);
  });
};

const trimImageWhitespace = (image: HTMLImageElement): HTMLImageElement | HTMLCanvasElement => {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width <= 0 || height <= 0) return image;

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return image;

  sourceContext.drawImage(image, 0, 0);

  try {
    const pixels = sourceContext.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const alpha = pixels[offset + 3];
        const isVisible = alpha > 16 && (red < 245 || green < 245 || blue < 245);
        if (!isVisible) continue;

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    if (maxX < minX || maxY < minY) return image;

    const padding = Math.max(1, Math.round(Math.max(width, height) * 0.01));
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropWidth = Math.min(width - cropX, maxX - minX + 1 + padding * 2);
    const cropHeight = Math.min(height - cropY, maxY - minY + 1 + padding * 2);
    const trimmedCanvas = document.createElement('canvas');
    trimmedCanvas.width = cropWidth;
    trimmedCanvas.height = cropHeight;
    trimmedCanvas.getContext('2d')?.drawImage(
      sourceCanvas,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );

    return trimmedCanvas;
  } catch {
    return image;
  }
};

const addImage = (
  doc: jsPDF,
  image: HTMLImageElement | null,
  source: string | null | undefined,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) => {
  if (!image) return;
  const printableImage = trimImageWhitespace(image);
  const sourceWidth = printableImage instanceof HTMLCanvasElement ? printableImage.width : printableImage.naturalWidth;
  const sourceHeight = printableImage instanceof HTMLCanvasElement ? printableImage.height : printableImage.naturalHeight;
  const aspectRatio = sourceWidth / sourceHeight;
  const width = aspectRatio >= maxWidth / maxHeight ? maxWidth : maxHeight * aspectRatio;
  const height = aspectRatio >= maxWidth / maxHeight ? maxWidth / aspectRatio : maxHeight;
  const format = printableImage instanceof HTMLCanvasElement || source?.match(/\.png(?:$|\?)/i) || source?.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  doc.addImage(printableImage, format, x + (maxWidth - width) / 2, y + (maxHeight - height) / 2, width, height);
};

const drawInstitutionHeader = (
  doc: jsPDF,
  curriculum: Curriculum,
  title: string,
  tccImage: HTMLImageElement | null,
  municipalImage: HTMLImageElement | null,
  departmentImage: HTMLImageElement | null,
) => {
  addImage(doc, tccImage, tccLogo, 39, PRINT_LOGO_Y, PRINT_LOGO_SIZE, PRINT_LOGO_SIZE);
  addImage(doc, municipalImage, municipalLogo, 154.5, PRINT_LOGO_Y, PRINT_LOGO_SIZE, PRINT_LOGO_SIZE);
  addImage(doc, departmentImage, curriculum.department?.logo, 173.5, PRINT_LOGO_Y, PRINT_LOGO_SIZE, PRINT_LOGO_SIZE);

  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('Province of Misamis Oriental, Municipality of Tagoloan', PAGE_WIDTH / 2, 10.5, { align: 'center' });

  doc.setFont('Times', 'bolditalic');
  doc.setFontSize(18);
  doc.text('Tagoloan Community College', PAGE_WIDTH / 2, 21.2, { align: 'center' });

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.text('Baluarte, Tagoloan, Misamis Oriental (08822)740-835', PAGE_WIDTH / 2, 27, { align: 'center' });
  doc.setFont('Helvetica', 'bold');
  doc.text('Member: Association of Local Colleges & Universities (ALCU)', PAGE_WIDTH / 2, 31, { align: 'center' });
  doc.text('Member: Association of Local Colleges & Universities On Accreditation (ALCU-COA)', PAGE_WIDTH / 2, 34.5, { align: 'center' });
  doc.text('PSITE (Philippine Society of Information Technology and Educators) R-10 and Philippine Society of Computing (PSC)', PAGE_WIDTH / 2, 38, { align: 'center' });
  doc.text('CODE-IT (Council of the Dean and Head Educators-Information Technology) R-10', PAGE_WIDTH / 2, 41.5, { align: 'center' });

  doc.setLineWidth(0.7);
  doc.line(PAGE_MARGIN, 45, PAGE_WIDTH - PAGE_MARGIN, 45);
  doc.setLineWidth(0.25);
  doc.line(PAGE_MARGIN, 46.7, PAGE_WIDTH - PAGE_MARGIN, 46.7);

  doc.setLineWidth(0.45);
  doc.rect(PAGE_MARGIN, 49, CONTENT_WIDTH, 10.5);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(title.length > 64 ? 11.5 : 13.5);
  doc.setTextColor(0, 65, 0);
  doc.text(title, PAGE_WIDTH / 2, 55.8, { align: 'center', maxWidth: CONTENT_WIDTH - 5 });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(5.8);
  const regulation = curriculum.cmo_number
    ? `CMO ${curriculum.cmo_number}${curriculum.cmo_series ? `, s ${curriculum.cmo_series}` : ''}`
    : curriculum.code;
  doc.text(`${regulation} NEW CURRICULUM EFFECTIVE SCHOOL YEAR ${curriculum.effective_school_year}`, PAGE_WIDTH / 2, 62.2, { align: 'center' });

  doc.setFontSize(7.5);
  doc.text('ID NUMBER:', PAGE_MARGIN + 0.5, 67.6);
  doc.line(PAGE_MARGIN + 19, 68.2, PAGE_MARGIN + 42, 68.2);
  doc.text('NAME:', PAGE_MARGIN + 52, 67.6);
  doc.line(PAGE_MARGIN + 63, 68.2, PAGE_MARGIN + 149, 68.2);
  doc.text('Entry Year:', PAGE_MARGIN + 158, 67.6);
  doc.line(PAGE_MARGIN + 178, 68.2, PAGE_WIDTH - PAGE_MARGIN - 14, 68.2);
};

const yearLabel = (yearLevel: number) => ['FIRST YEAR', 'SECOND YEAR', 'THIRD YEAR', 'FOURTH YEAR'][yearLevel - 1];

const drawBand = (doc: jsPDF, label: string, y: number) => {
  doc.setLineWidth(0.45);
  doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 5.2);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(label.split('').join('   '), PAGE_WIDTH / 2, y + 3.9, { align: 'center' });
};

const fitSingleLineText = (doc: jsPDF, value: string, maxWidth: number, preferredSize = 5.5) => {
  let fontSize = preferredSize;
  doc.setFontSize(fontSize);
  while (fontSize > 4 && doc.getTextWidth(value) > maxWidth) {
    fontSize -= 0.25;
    doc.setFontSize(fontSize);
  }

  if (doc.getTextWidth(value) <= maxWidth) return value;
  let fitted = value;
  while (fitted.length > 1 && doc.getTextWidth(`${fitted}...`) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trimEnd()}...`;
};

const drawSemester = (doc: jsPDF, semester: CurriculumSemester, label: string, x: number, y: number, width: number, rowHeight: number) => {
  const codeWidth = 17.5;
  const unitWidth = 5.2;
  const prerequisiteWidth = 19;
  const unitTableWidth = unitWidth * 3 + prerequisiteWidth;
  const titleWidth = width - codeWidth - unitTableWidth;
  const numericX = x + codeWidth + titleWidth;
  const headerHeight = 5.4;

  doc.setTextColor(0, 0, 0);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.text('Course Code', x + 2, y + 3.5);
  doc.text(label, x + codeWidth + titleWidth / 2, y + 3.5, { align: 'center' });

  doc.setLineWidth(0.35);
  doc.rect(numericX, y, unitTableWidth, headerHeight + semester.courses.length * rowHeight);
  [unitWidth, unitWidth * 2, unitWidth * 3].forEach((offset) => doc.line(numericX + offset, y, numericX + offset, y + headerHeight + semester.courses.length * rowHeight));
  doc.line(numericX + unitWidth * 3, y, numericX + unitWidth * 3, y + headerHeight + semester.courses.length * rowHeight);
  doc.line(numericX, y + headerHeight, numericX + unitTableWidth, y + headerHeight);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(4.9);
  ['Lec', 'Lab', 'TU'].forEach((header, index) => doc.text(header, numericX + unitWidth * (index + 0.5), y + 3.6, { align: 'center' }));
  doc.text('Preq', numericX + unitWidth * 3 + prerequisiteWidth / 2, y + 3.6, { align: 'center' });

  semester.courses.forEach((course, index) => {
    const rowTop = y + headerHeight + index * rowHeight;
    const baseline = rowTop + rowHeight * 0.72;
    doc.line(numericX, rowTop + rowHeight, numericX + unitTableWidth, rowTop + rowHeight);
    doc.setFont('Helvetica', 'normal');
    const fittedCode = fitSingleLineText(doc, `____${course.code}`, codeWidth - 1);
    doc.text(fittedCode, x + 0.5, baseline);
    doc.setFont('Helvetica', 'bold');
    const fittedTitle = fitSingleLineText(doc, course.title, titleWidth - 1);
    doc.text(fittedTitle, x + codeWidth + 0.5, baseline);
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.text(String(course.lec_units), numericX + unitWidth * 0.5, baseline, { align: 'center' });
    doc.text(String(course.lab_units), numericX + unitWidth * 1.5, baseline, { align: 'center' });
    doc.setFont('Helvetica', 'bold');
    doc.text(String(course.total_units), numericX + unitWidth * 2.5, baseline, { align: 'center' });
    if (course.prerequisites_text) {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(4.2);
      doc.text(fitSingleLineText(doc, course.prerequisites_text, prerequisiteWidth - 1), numericX + unitWidth * 3 + prerequisiteWidth / 2, baseline, { align: 'center' });
      doc.setFontSize(5.5);
    }
  });

  const totalsY = y + headerHeight + semester.courses.length * rowHeight + 3.2;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.text('TOTAL CREDITS', numericX - 16, totalsY, { align: 'right' });
  doc.text(String(semester.totals.lec), numericX + unitWidth * 0.5, totalsY, { align: 'center' });
  doc.text(String(semester.totals.lab), numericX + unitWidth * 1.5, totalsY, { align: 'center' });
  doc.text(String(semester.totals.tu), numericX + unitWidth * 2.5, totalsY, { align: 'center' });
};

const NOTE_FONT_SIZE = 5.5;
const NOTE_LINE_HEIGHT = 2.6;
const NOTE_GAP = 1.2;
const NOTE_LABEL_COLOR = '#555555';

type NoteSegment = { text: string; color: string | null };

/**
 * Wraps a note to the page width, keeping each piece in its printed colour and every line break in the source.
 * Long words are broken rather than cut off.
 */
const layoutNote = (doc: jsPDF, segments: NoteSegment[], width: number): NoteSegment[][] => {
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(NOTE_FONT_SIZE);
  const lines: NoteSegment[][] = [[]];
  let lineWidth = 0;
  const push = (text: string, color: string | null) => {
    const line = lines[lines.length - 1];
    const last = line[line.length - 1];
    if (last && last.color === color) last.text += text;
    else line.push({ text, color });
    lineWidth += doc.getTextWidth(text);
  };
  const breakLine = () => {
    const line = lines[lines.length - 1];
    if (line.length > 0) line[line.length - 1].text = line[line.length - 1].text.trimEnd();
    lines.push([]);
    lineWidth = 0;
  };
  for (const segment of segments) {
    for (const piece of segment.text.split(/(\n| +)/)) {
      if (piece === '') continue;
      if (piece === '\n') {
        lines.push([]);
        lineWidth = 0;
        continue;
      }
      if (/^ +$/.test(piece)) {
        if (lineWidth > 0) push(piece, segment.color);
        continue;
      }
      if (lineWidth > 0 && lineWidth + doc.getTextWidth(piece) > width) breakLine();
      let chunk = '';
      for (const ch of piece) {
        if (chunk && lineWidth + doc.getTextWidth(chunk + ch) > width) {
          push(chunk, segment.color);
          breakLine();
          chunk = '';
        }
        chunk += ch;
      }
      if (chunk) push(chunk, segment.color);
    }
  }
  return lines;
};

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];

/** Leading form blanks the document printed before the note, reproduced on paper as course codes' are. */
const printedBlanks = (note: CurriculumNote) => {
  const at = note.source_text ? note.source_text.indexOf(note.text) : -1;
  const prefix = at > 0 ? note.source_text!.slice(0, at) : '';
  return /^[\s_]*$/.test(prefix) ? prefix.trimStart() : '';
};

const noteLines = (doc: jsPDF, note: CurriculumNote, label: string | null) => {
  const segments = noteSegments(note);
  const blanks = printedBlanks(note);
  return layoutNote(
    doc,
    [
      ...(label ? [{ text: `${label}: `, color: NOTE_LABEL_COLOR }] : []),
      ...(blanks ? [{ text: blanks, color: segments[0]?.color ?? null }] : []),
      ...segments,
    ],
    CONTENT_WIDTH - 2,
  );
};

const notesHeight = (doc: jsPDF, notes: { note: CurriculumNote; label: string | null }[]) =>
  notes.reduce((sum, { note, label }) => sum + noteLines(doc, note, label).length * NOTE_LINE_HEIGHT + NOTE_GAP, 0);

const drawEvaluationTable = (doc: jsPDF, y: number) => {
  const x = 26;
  const width = 147;
  const titleHeight = 6;
  const headerHeight = 5;
  const rowHeight = 4.5;
  const columns = [49, 34, 19, 45];

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.text('Evaluation Details', PAGE_WIDTH / 2, y + 3.8, { align: 'center' });
  const tableY = y + titleHeight;
  doc.rect(x, tableY, width, headerHeight + rowHeight * 7);
  let columnX = x;
  columns.slice(0, -1).forEach((columnWidth) => {
    columnX += columnWidth;
    doc.line(columnX, tableY, columnX, tableY + headerHeight + rowHeight * 7);
  });
  doc.line(x, tableY + headerHeight, x + width, tableY + headerHeight);
  for (let row = 1; row <= 7; row += 1) {
    doc.line(x, tableY + headerHeight + row * rowHeight, x + width, tableY + headerHeight + row * rowHeight);
  }
  let centerX = x;
  ['Evaluators', 'School Year', 'Date', 'Signature'].forEach((header, index) => {
    doc.text(header, centerX + columns[index] / 2, tableY + 3.4, { align: 'center' });
    centerX += columns[index];
  });
};

export const createCurriculumPdfDocument = (
  PdfDocument: typeof jsPDF,
  options: PrintCurriculumOptions,
  tccImage: HTMLImageElement | null,
  municipalImage: HTMLImageElement | null,
  departmentImage: HTMLImageElement | null,
  autoPrint = false,
) => {
  const doc = new PdfDocument({ orientation: 'portrait', unit: 'mm', format: [PAGE_WIDTH, PAGE_HEIGHT] });
  const sections = getCurriculumPrintSections(options.semesters);
  const title = getPrintableProgramTitle(options.curriculum, options.program);
  drawInstitutionHeader(doc, options.curriculum, title, tccImage, municipalImage, departmentImage);

  // Source notes print with the year they belong to (year, term or course scope) or after all years.
  const notes = options.curriculum.notes ?? [];
  const yearNotes = (section: CurriculumPrintSection) => {
    const courses = [section.firstSemester, section.secondSemester, section.summer].flatMap((semester) => semester.courses);
    return notes.flatMap((note): { note: CurriculumNote; label: string | null }[] => {
      const { scope } = note;
      if (scope.level === 'year' && scope.year_level === section.yearLevel) return [{ note, label: null }];
      if (scope.level === 'term' && scope.year_level === section.yearLevel) return [{ note, label: noteScopeLabel(scope) }];
      const course = scope.level === 'course' ? courses.find((candidate) => candidate.id === scope.course_id) : undefined;
      return course ? [{ note, label: noteScopeLabel(scope, course.code) }] : [];
    });
  };
  const curriculumNotes = notes.filter((note) => note.scope.level === 'curriculum').map((note) => ({ note, label: null }));

  const summerSections = sections.filter((section) => section.summer.courses.length > 0);
  const pairedRows = sections.reduce((sum, section) => sum + Math.max(section.firstSemester.courses.length, section.secondSemester.courses.length), 0);
  const summerRows = summerSections.reduce((sum, section) => sum + section.summer.courses.length, 0);
  const blockCount = sections.length + summerSections.length;
  const fixedHeight = blockCount * 16.9 + sections.reduce((sum, section) => sum + notesHeight(doc, yearNotes(section)), 0) + notesHeight(doc, curriculumNotes);
  const availableRowsHeight = PAGE_HEIGHT - 72 - EVALUATION_HEIGHT - 7 - fixedHeight;
  const rowHeight = Math.max(2.35, Math.min(3.45, availableRowsHeight / Math.max(1, pairedRows + summerRows)));

  let y = 71;
  const gutter = 3;
  const semesterWidth = (CONTENT_WIDTH - gutter) / 2;
  // Content that no longer fits continues on a new page instead of being clipped or overlapping.
  const ensureSpace = (height: number) => {
    if (y + height <= PAGE_HEIGHT - PAGE_MARGIN) return;
    doc.addPage([PAGE_WIDTH, PAGE_HEIGHT], 'portrait');
    y = PAGE_MARGIN + 2;
  };
  const drawNotes = (items: { note: CurriculumNote; label: string | null }[]) => {
    for (const { note, label } of items) {
      for (const line of noteLines(doc, note, label)) {
        ensureSpace(NOTE_LINE_HEIGHT);
        let x = PAGE_MARGIN + 1;
        for (const segment of line) {
          doc.setTextColor(...(segment.color ? rgb(segment.color) : [0, 0, 0] as [number, number, number]));
          doc.text(segment.text, x, y + NOTE_LINE_HEIGHT * 0.75);
          x += doc.getTextWidth(segment.text);
        }
        y += NOTE_LINE_HEIGHT;
      }
      y += NOTE_GAP;
    }
    doc.setTextColor(0, 0, 0);
  };

  sections.forEach((section) => {
    ensureSpace(16.9 + Math.max(section.firstSemester.courses.length, section.secondSemester.courses.length) * rowHeight);
    drawBand(doc, yearLabel(section.yearLevel), y);
    y += 7.1;
    drawSemester(doc, section.firstSemester, 'First Semester', PAGE_MARGIN, y, semesterWidth, rowHeight);
    drawSemester(doc, section.secondSemester, 'Second Semester', PAGE_MARGIN + semesterWidth + gutter, y, semesterWidth, rowHeight);
    y += 9.8 + Math.max(section.firstSemester.courses.length, section.secondSemester.courses.length) * rowHeight;

    if (section.summer.courses.length > 0) {
      ensureSpace(16.9 + section.summer.courses.length * rowHeight);
      drawBand(doc, 'SUMMER', y);
      y += 7.1;
      drawSemester(doc, section.summer, 'Summer', PAGE_MARGIN, y, semesterWidth + 19, rowHeight);
      y += 9.8 + section.summer.courses.length * rowHeight;
    }
    drawNotes(yearNotes(section));
  });
  drawNotes(curriculumNotes);

  ensureSpace(EVALUATION_HEIGHT + 4.8);
  drawEvaluationTable(doc, y + 0.8);
  if (autoPrint) doc.autoPrint();
  return doc;
};

const loadCurriculumPdf = async (options: PrintCurriculumOptions, autoPrint: boolean) => {
  const [{ default: PdfDocument }, tccImage, municipalImage, departmentImage] = await Promise.all([
    import('jspdf'),
    loadImage(resolveAssetUrl(tccLogo)),
    loadImage(resolveAssetUrl(municipalLogo)),
    loadImage(options.curriculum.department?.logo),
  ]);

  return createCurriculumPdfDocument(PdfDocument, options, tccImage, municipalImage, departmentImage, autoPrint);
};

export const buildCurriculumPdf = async (options: PrintCurriculumOptions): Promise<Blob> =>
  (await loadCurriculumPdf(options, false)).output('blob');

export const printCurriculum = async (options: PrintCurriculumOptions): Promise<void> => {
  const preview = openPdfPreview();
  try {
    const doc = await loadCurriculumPdf(options, true);
    await preview.show(doc.output('blob'), getCurriculumPdfFilename(options.curriculum));
  } catch (error) {
    preview.close();
    throw error;
  }
};
