import { extractCurriculumLayout } from './pdfLayout';
import { readPdfText } from './pdfSource';
import { detectTemplateHeader, metadataFromLines, rowsFromGrid, rowsFromTemplate, type ColumnMapping, type HeaderDetection } from './tabular';
import { termOf } from './normalize';
import type { Extraction, ImportFormat, Provenance } from './types';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export const MAX_TABLE_ROWS = 5000;

export const ACCEPTED_EXTENSIONS: Record<string, ImportFormat> = {
  '.pdf': 'pdf',
  '.csv': 'csv',
  '.xlsx': 'xlsx',
  '.docx': 'docx',
};

export const ACCEPT_ATTRIBUTE = '.pdf,.csv,.xlsx,.docx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class ImportFileError extends Error {}

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((value, index) => bytes[index] === value);

/** Format comes from the extension and must agree with the file signature; macro and legacy formats are rejected. */
export const detectFormat = (name: string, bytes: ArrayBuffer): ImportFormat => {
  const extension = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  const format = ACCEPTED_EXTENSIONS[extension];
  if (!format) {
    throw new ImportFileError(extension === '.xls' || extension === '.xlsm' || extension === '.doc'
      ? `${extension.toUpperCase().slice(1)} files are not supported. Save the file as .xlsx or .docx without macros, or use the CSV template.`
      : 'Choose a PDF, CSV, XLSX, or DOCX file.');
  }
  if (bytes.byteLength === 0) throw new ImportFileError('The selected file is empty.');
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ImportFileError('The selected file is larger than the 10 MiB import limit.');
  const head = new Uint8Array(bytes, 0, Math.min(8, bytes.byteLength));
  if (format === 'pdf' && !startsWith(head, [0x25, 0x50, 0x44, 0x46])) throw new ImportFileError('This file is not a valid PDF.');
  if ((format === 'xlsx' || format === 'docx') && !startsWith(head, [0x50, 0x4b, 0x03, 0x04])) {
    throw new ImportFileError(`This file is not a valid ${format.toUpperCase()} document.`);
  }
  return format;
};

export const sha256Hex = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** A matrix of cell text from any tabular source, with per-row provenance. */
export interface TableSource {
  format: ImportFormat;
  label: string;
  rows: string[][];
  provenance: (rowIndex: number) => Provenance;
  warnings: string[];
}

export type TableReading =
  | { kind: 'extraction'; extraction: Extraction }
  | { kind: 'mapping'; detection: HeaderDetection; table: TableSource };

const hasGridHeader = (rows: string[][]) => rows.some((row) => {
  const codeColumn = row.findIndex((cell) => /^course\s*code$/i.test(cell.trim()));
  return codeColumn >= 0 && row.slice(codeColumn + 1).some((cell) => termOf(cell) !== null);
});

const firstTableRow = (rows: string[][]) => {
  const index = rows.findIndex((row) => row.some((cell) => /^course\s*code$/i.test(cell.trim())));
  return index < 0 ? rows.length : index;
};

/** Grid layouts are read directly; template tables need confirmed mapping when columns are missing or duplicated. */
export const readTable = (table: TableSource): TableReading | null => {
  if (table.rows.length > MAX_TABLE_ROWS) throw new ImportFileError(`This table has more than ${MAX_TABLE_ROWS} rows; split it before importing.`);
  const header = metadataFromLines(table.rows.slice(0, firstTableRow(table.rows)).map((row) => row.filter(Boolean).join(' ')));

  if (hasGridHeader(table.rows)) {
    const extraction = rowsFromGrid(table.rows, table.format, table.provenance);
    if (extraction) {
      return { kind: 'extraction', extraction: { ...extraction, metadata: { ...header, notes: extraction.metadata.notes }, warnings: [...table.warnings, ...extraction.warnings] } };
    }
  }

  const detection = detectTemplateHeader(table.rows);
  if (!detection) return null;
  if (detection.missing.length > 0 || detection.ambiguous.length > 0) return { kind: 'mapping', detection, table };
  return { kind: 'extraction', extraction: applyMapping(table, detection, detection.mapping) };
};

export const applyMapping = (table: TableSource, detection: HeaderDetection, mapping: ColumnMapping): Extraction => {
  const extraction = rowsFromTemplate(table.rows, { headerRow: detection.headerRow, mapping }, table.format, table.provenance);
  return { ...extraction, warnings: [...table.warnings, ...extraction.warnings] };
};

export const readCsv = async (text: string): Promise<TableSource> => {
  const { default: Papa } = await import('papaparse');
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false, dynamicTyping: false });
  const warnings = parsed.errors.slice(0, 20).map((error) => `CSV record ${(error.row ?? 0) + 1}: ${error.message}`);
  return {
    format: 'csv',
    label: 'CSV',
    rows: parsed.data.map((row) => row.map((cell) => String(cell ?? ''))),
    provenance: (rowIndex) => ({ kind: 'csv', record: rowIndex + 1 }),
    warnings,
  };
};

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

/** Every sheet, as cached cell text. Formulas are never evaluated; a missing cached value stays blank and is validated. */
export const readXlsx = async (file: Blob): Promise<TableSource[]> => {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheets = await readXlsxFile<string>(file, { parseNumber: (value) => value, trim: false });
  return sheets.map(({ sheet, data }) => ({
    format: 'xlsx' as const,
    label: sheet,
    rows: data.map((row) => row.map(cellText)),
    provenance: (rowIndex: number) => ({ kind: 'xlsx' as const, sheet, row: rowIndex + 1 }),
    warnings: [],
  }));
};

/**
 * Converts semantic tables with Mammoth and reads only heading, paragraph, and cell text from an inert
 * parsed document. The converted HTML is never inserted into the page.
 */
export const readDocx = async (bytes: ArrayBuffer): Promise<TableSource> => {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml(
    { arrayBuffer: bytes },
    { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) },
  );
  return tableFromConvertedHtml(result.value);
};

export const tableFromConvertedHtml = (html: string): TableSource => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script, style, template').forEach((element) => element.remove());
  const rows: string[][] = [];
  const provenance: Provenance[] = [];
  const warnings: string[] = [];
  let tableIndex = 0;
  const text = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

  for (const element of Array.from(document.body.children)) {
    if (element.tagName === 'TABLE') {
      tableIndex += 1;
      const tableRows = Array.from(element.querySelectorAll('tr')).filter((row) => row.closest('table') === element);
      tableRows.forEach((row, rowIndex) => {
        const cells = Array.from(row.children).filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH');
        if (cells.some((cell) => Number(cell.getAttribute('colspan') ?? 1) > 1 || Number(cell.getAttribute('rowspan') ?? 1) > 1)) {
          warnings.push(`Table ${tableIndex}, row ${rowIndex + 1} has merged cells; confirm its columns.`);
        }
        if (cells.some((cell) => cell.querySelector('table'))) warnings.push(`Table ${tableIndex} contains a nested table, which is not read.`);
        rows.push(cells.map(text));
        provenance.push({ kind: 'docx', table: tableIndex, row: rowIndex + 1 });
      });
      continue;
    }
    const line = text(element);
    if (line) {
      rows.push([line]);
      provenance.push({ kind: 'docx', table: 0, row: rows.length });
    }
  }

  if (tableIndex === 0) warnings.push('The document has no tables. Use the CSV/XLSX template or a document with a course table.');
  return { format: 'docx', label: 'Document', rows, provenance: (rowIndex) => provenance[rowIndex], warnings };
};

export const extractPdf = async (bytes: ArrayBuffer, signal?: AbortSignal, onPage?: (page: number, total: number) => void): Promise<Extraction> =>
  extractCurriculumLayout(await readPdfText(bytes, signal, onPage));
