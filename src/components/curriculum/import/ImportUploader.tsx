import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, FileUp, Loader2, Lock, RotateCcw, ScanText, X } from 'lucide-react';
import { ACCEPT_ATTRIBUTE } from '../../../lib/curriculumImport/adapters';
import { TEMPLATE_FIELDS, TEMPLATE_HEADERS } from '../../../lib/curriculumImport/tabular';
import { downloadFile } from '../../../lib/exportFile';
import { curriculumImportService } from '../../../services/curriculum/curriculumImportService';
import { buttonClass } from '../../ui/buttonStyles';

interface SelectedFile {
  name: string;
  size: number;
  format: string;
}

interface ImportUploaderProps {
  file: SelectedFile | null;
  progress: string | null;
  error: string | null;
  /** The file was read but needs a choice (sheet or columns) before the draft can start. */
  needsInput?: boolean;
  onFile: (file: File) => void;
  onCancel: () => void;
  children?: ReactNode;
}

const FORMATS = [
  { label: 'PDF', detail: 'Selectable text', Icon: FileText },
  { label: 'XLSX', detail: 'Excel workbook', Icon: FileSpreadsheet },
  { label: 'CSV', detail: 'Template columns', Icon: FileSpreadsheet },
  { label: 'DOCX', detail: 'Word tables', Icon: FileText },
];

// TEMPLATE_HEADERS and TEMPLATE_FIELDS list the same columns in the same order.
const TEMPLATE_COLUMNS = TEMPLATE_HEADERS.map((header, index) => ({ header, required: TEMPLATE_FIELDS[index]?.required ?? false }));

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const panel = 'rounded-xl border border-border bg-white';
const panelTitle = 'font-sans text-sm font-semibold text-text';

export default function ImportUploader({ file, progress, error, needsInput = false, onFile, onCancel, children }: ImportUploaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [templateState, setTemplateState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const busy = progress !== null;

  const downloadTemplate = async () => {
    setTemplateState('loading');
    try {
      const { blob, filename } = await curriculumImportService.downloadTemplate();
      downloadFile(blob, filename);
      setTemplateState('done');
    } catch {
      setTemplateState('error');
    }
  };

  const take = (files: FileList | null | undefined) => {
    const selected = files?.[0];
    if (selected && !busy) onFile(selected);
    if (input.current) input.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files);
  };

  const status = busy
    ? { label: 'Reading', tone: 'bg-primary/[0.07] text-primary ring-primary/20' }
    : error
      ? { label: 'Not read', tone: 'bg-red-50 text-red-700 ring-red-200' }
      : needsInput
        ? { label: 'Needs your input', tone: 'bg-accent/15 text-stage-warnText ring-accent/40' }
        : { label: 'Read', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200' };
  const FileIcon = file && (file.format === 'xlsx' || file.format === 'csv') ? FileSpreadsheet : FileText;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-3">
        {/* The whole area opens the file picker; the input stays the focusable control. */}
        <label
          htmlFor="curriculum-import-file"
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          // Moving over the label's own children fires dragleave too; only leaving the area ends the drag.
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
          onDrop={onDrop}
          aria-disabled={busy || undefined}
          className={`group flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 ${
            dragging
              ? 'border-primary bg-primary/[0.04]'
              : busy
                ? 'cursor-not-allowed border-border bg-parchment/60'
                : 'cursor-pointer border-border bg-parchment/60 hover:border-primary/50 hover:bg-primary/[0.02]'
          }`}
        >
          <input ref={input} id="curriculum-import-file" type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" disabled={busy} onChange={(event) => take(event.target.files)} />
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-full ring-1 transition-colors ${
              dragging ? 'bg-primary text-white ring-primary' : 'bg-white text-primary ring-border group-hover:ring-primary/40'
            }`}
            aria-hidden="true"
          >
            {busy ? <Loader2 size={20} className="animate-spin motion-reduce:animate-none" /> : <FileUp size={20} />}
          </span>
          <p className="mt-3 text-sm font-semibold text-text">
            {busy ? 'Reading the current file…' : dragging ? 'Drop the file to read it' : 'Drag a curriculum file here, or browse'}
          </p>
          <p className="mt-1 text-xs text-muted">PDF, XLSX, CSV or DOCX · up to 10 MB · PDFs up to 50 pages</p>
          <span className={`${buttonClass({ variant: 'primary' })} mt-4 ${busy ? 'pointer-events-none opacity-60' : ''}`} aria-hidden="true">
            <FileUp size={15} /> Choose file
          </span>
        </label>

        {file && (
          <div className={`${panel} px-4 py-3`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${error ? 'bg-red-50 text-red-700' : 'bg-primary/[0.07] text-primary'}`} aria-hidden="true">
                <FileIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-text" title={file.name}>{file.name}</p>
                <p className="text-xs text-muted">{file.format.toUpperCase()} · {size(file.size)}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${status.tone}`}>{status.label}</span>
              {busy && (
                <button type="button" onClick={onCancel} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                  <X size={13} aria-hidden="true" /> Cancel
                </button>
              )}
            </div>
            {busy && (
              <div className="mt-3" role="status">
                <div className="relative h-1.5 overflow-hidden rounded-full bg-parchment ring-1 ring-inset ring-border">
                  <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary animate-indeterminate motion-reduce:animate-none" />
                </div>
                <p className="mt-1.5 text-xs text-muted">{progress}…</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertOctagon size={16} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-red-800">The file could not be used</p>
              <p className="mt-0.5 text-[13px] text-red-800">{error}</p>
              <p className="mt-1 text-xs text-red-700/90">Nothing was imported. Check the file requirements, then choose another file.</p>
            </div>
            <button type="button" onClick={() => input.current?.click()} className={`${buttonClass({ variant: 'dangerSoft', size: 'sm' })} self-start`}>
              <RotateCcw size={13} aria-hidden="true" /> Choose another
            </button>
          </div>
        )}

        {children}
      </div>

      <aside className="space-y-3 text-[13px]" aria-label="Import help">
        <section className={`${panel} overflow-hidden`} aria-labelledby="import-template-heading">
          <div className="flex items-start gap-3 border-b border-border bg-accent/[0.06] px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-stage-warnText" aria-hidden="true">
              <FileSpreadsheet size={16} />
            </span>
            <div className="min-w-0">
              <h3 id="import-template-heading" className={panelTitle}>Excel template</h3>
              <p className="mt-0.5 text-xs text-muted">One row per course. These columns are matched automatically.</p>
            </div>
          </div>
          <div className="space-y-3 px-4 py-3">
            <ul className="flex flex-wrap gap-1.5" aria-label="Template columns">
              {TEMPLATE_COLUMNS.map(({ header, required }) => (
                <li key={header} className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${required ? 'border-border bg-parchment text-text' : 'border-dashed border-border bg-white text-muted'}`}>
                  {header}{!required && <span className="font-normal"> (optional)</span>}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void downloadTemplate()}
              disabled={templateState === 'loading'}
              className={`${buttonClass({ variant: 'secondary' })} w-full`}
            >
              {templateState === 'loading'
                ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <Download size={15} aria-hidden="true" />}
              {templateState === 'loading' ? 'Preparing template…' : 'Download template (.xlsx)'}
            </button>
            {templateState === 'done' && (
              <p role="status" className="flex items-center gap-1.5 text-xs text-emerald-800">
                <CheckCircle2 size={13} aria-hidden="true" /> Template downloaded. Fill it in, then upload it here.
              </p>
            )}
            {templateState === 'error' && (
              <p role="alert" className="flex items-center gap-1.5 text-xs text-red-700">
                <AlertTriangle size={13} aria-hidden="true" /> The template could not be downloaded. Try again.
              </p>
            )}
          </div>
        </section>

        <section className={`${panel} px-4 py-3`} aria-labelledby="import-requirements-heading">
          <h3 id="import-requirements-heading" className={panelTitle}>File requirements</h3>
          <ul className="mt-2 grid grid-cols-2 gap-1.5" aria-label="Supported files">
            {FORMATS.map(({ label, detail, Icon }) => (
              <li key={label} className="flex items-center gap-2 rounded-lg border border-border bg-parchment/50 px-2 py-1.5">
                <Icon size={14} className="shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 leading-tight">
                  <span className="block text-xs font-semibold text-text">{label}</span>
                  <span className="block truncate text-[11px] text-muted">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1.5 text-xs text-muted">
            <li className="flex gap-2"><ScanText size={13} className="mt-px shrink-0 text-primary/70" aria-hidden="true" />Scanned PDFs need OCR first.</li>
            <li className="flex gap-2"><X size={13} className="mt-px shrink-0 text-primary/70" aria-hidden="true" />Macro-enabled and legacy .xls or .doc files are not accepted.</li>
            <li className="flex gap-2"><Lock size={13} className="mt-px shrink-0 text-primary/70" aria-hidden="true" />The file is read in your browser. Nothing is saved until you confirm the import.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
