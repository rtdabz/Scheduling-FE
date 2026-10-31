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

export const readPdfText = async (bytes: ArrayBuffer, signal?: AbortSignal, onPage?: (page: number, total: number) => void): Promise<PdfPageText[]> => {
  const pdfjs = await loadPdfJs();
  const { task, document } = await openDocument(bytes);
  try {
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
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        // Viewport transform normalizes rotation into top-down page coordinates.
        const [, , c, d, e, f] = pdfjs.Util.transform(viewport.transform, item.transform);
        items.push({ page: number, str: item.str, x: e, y: f, width: item.width, height: Math.hypot(c, d) });
      }
      pages.push({ page: number, width: viewport.width, height: viewport.height, items });
      page.cleanup();
    }
    return pages;
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
