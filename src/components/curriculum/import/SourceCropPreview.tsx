import { useEffect, useRef, useState } from 'react';
import { FileWarning, Loader2 } from 'lucide-react';
import { renderPdfCrop } from '../../../lib/curriculumImport/pdfSource';
import type { SourceValues } from '../../../lib/curriculumImport/types';

interface SourceCropPreviewProps {
  bytes: ArrayBuffer | null;
  source: SourceValues;
}

type PreviewState = 'loading' | 'ready' | 'failed';

const provenanceLabel = (source: SourceValues): string => {
  const provenance = source.provenance;
  switch (provenance.kind) {
    case 'pdf': return `Page ${provenance.page} of the PDF`;
    case 'csv': return `Record ${provenance.record} of the CSV`;
    case 'xlsx': return `Sheet "${provenance.sheet}", row ${provenance.row}`;
    case 'docx': return provenance.table > 0 ? `Table ${provenance.table}, row ${provenance.row}` : `Paragraph ${provenance.row}`;
  }
};

const units = (source: SourceValues) => {
  const value = (number: number | null) => (number === null || Number.isNaN(number) ? 'blank' : String(number));
  return `${value(source.lec)} + ${value(source.lab)} = ${value(source.tu)}`;
};

/** The document's own values for one row, with the PDF region rendered on demand. */
export default function SourceCropPreview({ bytes, source }: SourceCropPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const provenance = source.provenance;
  const canRender = provenance.kind === 'pdf' && bytes !== null;
  const [state, setState] = useState<PreviewState>('loading');
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (provenance.kind !== 'pdf' || !bytes || !canvasRef.current) return;
    const controller = new AbortController();
    setState('loading');
    setFailure(null);
    renderPdfCrop(bytes, provenance.page, provenance.bbox, canvasRef.current, controller.signal)
      .then(() => {
        if (!controller.signal.aborted) setState('ready');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        setFailure(error instanceof Error ? error.message : 'Unknown rendering error.');
        setState('failed');
      });
    return () => controller.abort();
  }, [bytes, provenance]);

  return (
    <div className="space-y-3">
      {provenance.kind === 'pdf' && (
        <figure className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="relative overflow-x-auto">
            <canvas ref={canvasRef} className={`block max-w-none ${state === 'ready' ? '' : 'h-0'}`} aria-label={`Source document region, ${provenanceLabel(source)}`} />
            {state === 'loading' && canRender && (
              <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted" role="status">
                <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Rendering the row from the PDF
              </p>
            )}
            {(state === 'failed' || !canRender) && (
              <div className="flex gap-2 px-3 py-3 text-xs text-text" role="note">
                <FileWarning size={15} className="mt-0.5 shrink-0 text-[#7a5410]" aria-hidden="true" />
                <p>
                  The page image is unavailable{failure ? ` (${failure})` : !bytes ? ' because the file is no longer loaded' : ''}. The values below are what was read from the document.
                </p>
              </div>
            )}
          </div>
          <figcaption className="border-t border-border bg-parchment px-3 py-1.5 text-[11px] text-muted">{provenanceLabel(source)}</figcaption>
        </figure>
      )}
      {provenance.kind !== 'pdf' && <p className="text-xs text-muted">{provenanceLabel(source)}. Spreadsheet and document rows have no page image.</p>}

      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-muted">Code</dt><dd className="font-semibold text-text">{source.code || 'blank'}</dd>
        <dt className="text-muted">Title</dt><dd className="text-text">{source.title || 'blank'}</dd>
        <dt className="text-muted">Units</dt><dd className="tabular-nums text-text">{units(source)} <span className="text-xs text-muted">lec + lab = TU</span></dd>
        <dt className="text-muted">Prerequisite</dt><dd className="text-text">{source.prerequisites ?? 'none given'}</dd>
      </dl>

      {source.raw.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-muted hover:text-text">Show raw cells</summary>
          <p className="mt-1 break-words rounded-md bg-parchment px-2 py-1.5 font-mono text-[11px] text-muted">{source.raw.map((cell) => JSON.stringify(cell)).join('  ')}</p>
        </details>
      )}
    </div>
  );
}
