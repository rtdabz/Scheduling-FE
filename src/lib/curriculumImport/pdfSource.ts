import type { NoteRun } from '../../types/curriculum';
import { DEFAULT_TEXT_COLOR, type NoteChar } from './notes';
import type { PdfPageText, PdfTextItem } from './pdfLayout';

export const MAX_PDF_PAGES = 50;

type PdfJs = typeof import('pdfjs-dist');

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads PDF.js and its worker on demand, from the same package version, served locally by Vite. */
const loadPdfJs = (): Promise<PdfJs> => {
  pdfjsPromise ??= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([pdfjs, worker]) => {
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  });
  return pdfjsPromise;
};

const openDocument = async (bytes: ArrayBuffer) => {
  const pdfjs = await loadPdfJs();
  // Copy: PDF.js transfers the buffer to its worker, and callers keep the original for previews.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), enableXfa: false, stopAtErrors: false });
  return { task, document: await task.promise };
};

type Matrix = [number, number, number, number, number, number];
type Box = [number, number, number, number];

const multiply = (m: number[], n: number[]): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

const hexColor = (args: unknown[]): string | null => {
  if (typeof args[0] === 'string') return /^#[0-9a-f]{6}$/i.test(args[0]) ? args[0].toUpperCase() : null;
  if (args.length >= 3 && args.slice(0, 3).every((value) => typeof value === 'number')) {
    return `#${(args.slice(0, 3) as number[]).map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  return null;
};

/**
 * Walks a page's drawing operators for what text extraction leaves out: the fill colour each glyph was
 * painted in (PDF.js resolves device colour spaces to RGB; patterns stay unknown) and where images sit.
 */
export const readOperators = (ops: PdfJs['OPS'], fnArray: number[], argsArray: unknown[][], viewportTransform: number[]): { chars: NoteChar[]; images: Box[] } => {
  const chars: NoteChar[] = [];
  const images: Box[] = [];
  let state = { color: DEFAULT_TEXT_COLOR as string | null, ctm: [1, 0, 0, 1, 0, 0] as Matrix, invisible: false };
  const stack: (typeof state)[] = [];
  const glyphText = (glyphs: unknown) => {
    if (!Array.isArray(glyphs) || state.invisible) return;
    for (const glyph of glyphs) {
      const unicode = glyph && typeof glyph === 'object' && 'unicode' in glyph ? String((glyph as { unicode: unknown }).unicode ?? '') : '';
      for (const ch of unicode) chars.push({ ch, color: state.color });
    }
  };
  fnArray.forEach((fn, index) => {
    const args = argsArray[index] ?? [];
    switch (fn) {
      case ops.save: stack.push({ ...state }); break;
      case ops.restore: state = stack.pop() ?? state; break;
      case ops.transform: state = { ...state, ctm: multiply(state.ctm, args as number[]) }; break;
      case ops.setFillRGBColor: state = { ...state, color: hexColor(args) }; break;
      case ops.setFillGray: case ops.setFillCMYKColor: case ops.setFillColor: case ops.setFillColorN: case ops.setFillColorSpace:
        state = { ...state, color: null };
        break;
      // Modes 3 and 7 paint nothing visible.
      case ops.setTextRenderingMode: state = { ...state, invisible: args[0] === 3 || args[0] === 7 }; break;
      case ops.showText: case ops.showSpacedText: case ops.nextLineShowText: glyphText(args[0]); break;
      case ops.nextLineSetSpacingShowText: glyphText(args[2]); break;
      case ops.paintImageXObject: case ops.paintInlineImageXObject: case ops.paintImageMaskXObject: case ops.paintImageXObjectRepeat: {
        const m = multiply(viewportTransform, state.ctm);
        const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
        const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
        images.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
        break;
      }
      default: break;
    }
  });
  return { chars, images };
};

/**
 * Gives each text item the colours of its characters by finding its visible characters, in order, in the
 * operator stream. An item that cannot be found gets null: its colour is unknown, not assumed.
 */
export const colorItems = (items: { str: string }[], chars: NoteChar[]): (NoteRun[] | null)[] => {
  const visible = chars.filter((char) => char.ch.trim() !== '');
  let cursor = 0;
  const find = (target: string[], from: number) => {
    outer: for (let start = from; start <= visible.length - target.length; start += 1) {
      for (let offset = 0; offset < target.length; offset += 1) if (visible[start + offset].ch !== target[offset]) continue outer;
      return start;
    }
    return -1;
  };
  return items.map((item) => {
    const points = [...item.str];
    const target = points.filter((ch) => ch.trim() !== '');
    if (target.length === 0) return [];
    let start = find(target, cursor);
    if (start < 0) start = find(target, 0);
    if (start < 0) return null;
    cursor = start + target.length;
    const runs: NoteRun[] = [];
    let next = start;
    let previous: string | null = visible[start].color;
    for (const ch of points) {
      // Spaces take the colour of the text around them.
      const color = ch.trim() === '' ? previous : visible[next++].color;
      previous = color;
      const last = runs[runs.length - 1];
      if (last && last.color === color) last.length += 1;
      else runs.push({ length: 1, color });
    }
    return runs;
  });
};

interface PdfPageLike {
  getViewport: (options: { scale: number }) => { width: number; height: number; transform: number[] };
  getTextContent: () => Promise<{ items: object[] }>;
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  cleanup: () => void;
}

/** Reads positioned text, glyph colours and image placements from an opened document. */
export const readPdfPages = async (
  pdfjs: Pick<PdfJs, 'OPS' | 'Util'>,
  document: { numPages: number; getPage: (number: number) => Promise<PdfPageLike> },
  signal?: AbortSignal,
  onPage?: (page: number, total: number) => void,
): Promise<PdfPageText[]> => {
  if (document.numPages > MAX_PDF_PAGES) {
    throw new Error(`This PDF has ${document.numPages} pages; the import limit is ${MAX_PDF_PAGES}.`);
  }
  const pages: PdfPageText[] = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    if (signal?.aborted) throw new DOMException('Extraction canceled.', 'AbortError');
    onPage?.(number, document.numPages);
    const page = await document.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const operators = await page.getOperatorList();
    const { chars, images } = readOperators(pdfjs.OPS, operators.fnArray, operators.argsArray as unknown[][], viewport.transform);
    const textItems = content.items.filter((item): item is { str: string; transform: number[]; width: number } => 'str' in item);
    const colors = colorItems(textItems, chars);
    const items: PdfTextItem[] = textItems.map((item, index) => {
      // Viewport transform normalizes rotation into top-down page coordinates.
      const [, , c, d, e, f] = pdfjs.Util.transform(viewport.transform, item.transform);
      return { page: number, str: item.str, x: e, y: f, width: item.width, height: Math.hypot(c, d), colors: colors[index] };
    });
    pages.push({ page: number, width: viewport.width, height: viewport.height, items, images });
    page.cleanup();
  }
  return pages;
};

export const readPdfText = async (bytes: ArrayBuffer, signal?: AbortSignal, onPage?: (page: number, total: number) => void): Promise<PdfPageText[]> => {
  const pdfjs = await loadPdfJs();
  const { task, document } = await openDocument(bytes);
  try {
    return await readPdfPages(pdfjs, document as never, signal, onPage);
  } finally {
    await task.destroy();
  }
};

const aborted = () => new DOMException('Source preview canceled.', 'AbortError');

/**
 * Renders only the requested region of one page, on demand. Each call draws into its own off-screen canvas and
 * copies the result only if it is still current: PDF.js refuses two render() calls on one canvas, which happens
 * when React StrictMode re-runs the preview effect.
 */
export const renderPdfCrop = async (
  bytes: ArrayBuffer,
  pageNumber: number,
  bbox: [number, number, number, number],
  canvas: HTMLCanvasElement,
  signal?: AbortSignal,
): Promise<void> => {
  const { task, document } = await openDocument(bytes);
  try {
    if (signal?.aborted) throw aborted();
    const page = await document.getPage(pageNumber);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const padding = 6;
    const [x0, y0, x1, y1] = bbox;
    const left = Math.max(0, (x0 - padding) * scale);
    const top = Math.max(0, (y0 - padding) * scale);
    const width = Math.ceil(Math.min(viewport.width, (x1 + padding) * scale) - left);
    const height = Math.ceil(Math.min(viewport.height, (y1 + padding) * scale) - top);

    const offscreen = window.document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offscreenContext = offscreen.getContext('2d');
    if (!offscreenContext) throw new Error('Canvas drawing is not available in this browser.');

    const renderTask = page.render({ canvas: offscreen, canvasContext: offscreenContext, viewport, transform: [1, 0, 0, 1, -left, -top] });
    const cancel = () => renderTask.cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      await renderTask.promise;
    } catch (error) {
      if (signal?.aborted) throw aborted();
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancel);
      page.cleanup();
    }
    if (signal?.aborted) throw aborted();

    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(offscreen, 0, 0);
  } finally {
    await task.destroy();
  }
};
