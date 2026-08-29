import type jsPDF from 'jspdf';
import tccLogo from '../assets/logo.jpg';
import municipalLogo from '../assets/municipal-logo.png';
import type { Curriculum, CurriculumTerm, Program } from '../types/curriculum';

interface PrintCurriculumOptions {
  curriculum: Curriculum;
  terms: CurriculumTerm[];
  program?: Program | null;
}

interface CurriculumPrintSection {
  yearLevel: number;
  firstSemester: CurriculumTerm;
  secondSemester: CurriculumTerm;
  summer: CurriculumTerm;
}

const PAGE_WIDTH = 216;
const PAGE_HEIGHT = 356;
const PAGE_MARGIN = 8;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const EVALUATION_HEIGHT = 39;
const PRINT_LOGO_SIZE = 18;
const PRINT_LOGO_Y = 7;

const emptyTerm = (yearLevel: number, semester: number): CurriculumTerm => ({
  year_level: yearLevel,
  semester,
  courses: [],
  totals: { lec: 0, lab: 0, tu: 0 },
});

export const getCurriculumPrintSections = (terms: CurriculumTerm[]): CurriculumPrintSection[] =>
  [1, 2, 3, 4].map((yearLevel) => ({
    yearLevel,
    firstSemester: terms.find((term) => term.year_level === yearLevel && term.semester === 1) ?? emptyTerm(yearLevel, 1),
    secondSemester: terms.find((term) => term.year_level === yearLevel && term.semester === 2) ?? emptyTerm(yearLevel, 2),
    summer: terms.find((term) => term.year_level === yearLevel && term.semester === 3) ?? emptyTerm(yearLevel, 3),
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
    // Cross-origin images without canvas permission still print untrimmed.
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
  doc.text('Province of Misamis Oriental', PAGE_WIDTH / 2, 8.5, { align: 'center' });
  doc.text('Municipality of TAGOLOAN', PAGE_WIDTH / 2, 12, { align: 'center' });

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
  doc.text(`${curriculum.code} NEW CURRICULUM EFFECTIVE SCHOOL YEAR ${curriculum.effective_school_year}`, PAGE_WIDTH / 2, 62.2, { align: 'center' });

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

const drawTerm = (doc: jsPDF, term: CurriculumTerm, label: string, x: number, y: number, width: number, rowHeight: number) => {
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
  doc.rect(numericX, y, unitTableWidth, headerHeight + term.courses.length * rowHeight);
  [unitWidth, unitWidth * 2, unitWidth * 3].forEach((offset) => doc.line(numericX + offset, y, numericX + offset, y + headerHeight + term.courses.length * rowHeight));
  doc.line(numericX + unitWidth * 3, y, numericX + unitWidth * 3, y + headerHeight + term.courses.length * rowHeight);
  doc.line(numericX, y + headerHeight, numericX + unitTableWidth, y + headerHeight);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(4.9);
  ['Lec', 'Lab', 'TU'].forEach((header, index) => doc.text(header, numericX + unitWidth * (index + 0.5), y + 3.6, { align: 'center' }));
  doc.text('Preq', numericX + unitWidth * 3 + prerequisiteWidth / 2, y + 3.6, { align: 'center' });

  term.courses.forEach((course, index) => {
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
  });

  const totalsY = y + headerHeight + term.courses.length * rowHeight + 3.2;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.text('TOTAL CREDITS', numericX - 16, totalsY, { align: 'right' });
  doc.text(String(term.totals.lec), numericX + unitWidth * 0.5, totalsY, { align: 'center' });
  doc.text(String(term.totals.lab), numericX + unitWidth * 1.5, totalsY, { align: 'center' });
  doc.text(String(term.totals.tu), numericX + unitWidth * 2.5, totalsY, { align: 'center' });
};

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
  const sections = getCurriculumPrintSections(options.terms);
  const title = getPrintableProgramTitle(options.curriculum, options.program);
  drawInstitutionHeader(doc, options.curriculum, title, tccImage, municipalImage, departmentImage);

  const summerSections = sections.filter((section) => section.summer.courses.length > 0);
  const pairedRows = sections.reduce((sum, section) => sum + Math.max(section.firstSemester.courses.length, section.secondSemester.courses.length), 0);
  const summerRows = summerSections.reduce((sum, section) => sum + section.summer.courses.length, 0);
  const blockCount = sections.length + summerSections.length;
  const fixedHeight = blockCount * 16.9;
  const availableRowsHeight = PAGE_HEIGHT - 72 - EVALUATION_HEIGHT - 7 - fixedHeight;
  const rowHeight = Math.max(2.35, Math.min(3.45, availableRowsHeight / Math.max(1, pairedRows + summerRows)));

  let y = 71;
  const gutter = 3;
  const termWidth = (CONTENT_WIDTH - gutter) / 2;

  sections.forEach((section) => {
    drawBand(doc, yearLabel(section.yearLevel), y);
    y += 7.1;
    drawTerm(doc, section.firstSemester, 'First Semester', PAGE_MARGIN, y, termWidth, rowHeight);
    drawTerm(doc, section.secondSemester, 'Second Semester', PAGE_MARGIN + termWidth + gutter, y, termWidth, rowHeight);
    y += 9.8 + Math.max(section.firstSemester.courses.length, section.secondSemester.courses.length) * rowHeight;

    if (section.summer.courses.length > 0) {
      drawBand(doc, 'SUMMER', y);
      y += 7.1;
      drawTerm(doc, section.summer, 'Summer', PAGE_MARGIN, y, termWidth + 19, rowHeight);
      y += 9.8 + section.summer.courses.length * rowHeight;
    }
  });

  drawEvaluationTable(doc, Math.min(y + 0.8, PAGE_HEIGHT - EVALUATION_HEIGHT - 4));
  if (autoPrint) doc.autoPrint();
  return doc;
};

export const printCurriculum = async (options: PrintCurriculumOptions): Promise<void> => {
  const previewWindow = window.open('', '_blank');
  try {
    const [{ default: PdfDocument }, tccImage, municipalImage, departmentImage] = await Promise.all([
      import('jspdf'),
      loadImage(resolveAssetUrl(tccLogo)),
      loadImage(resolveAssetUrl(municipalLogo)),
      loadImage(options.curriculum.department?.logo),
    ]);

    const doc = createCurriculumPdfDocument(PdfDocument, options, tccImage, municipalImage, departmentImage, true);
    const blobUrl = URL.createObjectURL(doc.output('blob'));

    if (previewWindow) {
      previewWindow.location.href = blobUrl;
    } else {
      doc.save(`${options.curriculum.code}-curriculum.pdf`);
    }

    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (error) {
    previewWindow?.close();
    throw error;
  }
};
