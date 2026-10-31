import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { AlertOctagon, Download, FileSpreadsheet, FileText, FileUp, Loader2, X } from 'lucide-react';
import { ACCEPT_ATTRIBUTE } from '../../../lib/curriculumImport/adapters';

interface SelectedFile {
  name: string;
  size: number;
  format: string;
}

interface ImportUploaderProps {
  file: SelectedFile | null;
  progress: string | null;
  error: string | null;
  onFile: (file: File) => void;
  onCancel: () => void;
  onDownloadTemplate: () => void;
  children?: ReactNode;
}

const FORMATS = [
  { label: 'PDF', detail: 'with selectable text', Icon: FileText },
  { label: 'XLSX', detail: 'Excel workbook', Icon: FileSpreadsheet },
  { label: 'CSV', detail: 'template columns', Icon: FileSpreadsheet },
  { label: 'DOCX', detail: 'Word tables', Icon: FileText },
];

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export default function ImportUploader({ file, progress, error, onFile, onCancel, onDownloadTemplate, children }: ImportUploaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = progress !== null;

  const take = (files: FileList | null | undefined) => {
    const selected = files?.[0];
    if (selected && !busy) onFile(selected);
    if (input.current) input.current.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="space-y-3">
        <div
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-border bg-parchment'
          } ${busy ? 'opacity-70' : ''}`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-primary ring-1 ring-border" aria-hidden="true">
            {busy ? <Loader2 size={20} className="animate-spin motion-reduce:animate-none" /> : <FileUp size={20} />}
          </span>
          <p className="mt-3 text-sm font-bold text-text">{dragging ? 'Drop the file to read it' : 'Drag a curriculum file here'}</p>
          <p className="mt-1 text-xs text-muted">or</p>
          <input ref={input} id="curriculum-import-file" type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" disabled={busy} onChange={(event) => take(event.target.files)} />
          <label
            htmlFor="curriculum-import-file"
            className={`mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-white hover:bg-primary-light focus-within:ring-2 focus-within:ring-accent ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            Choose file
          </label>
          <p className="mt-3 text-xs text-muted">Up to 10 MB. PDFs up to 50 pages. The file is read in your browser.</p>
        </div>

        {file && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3">
            <FileText size={18} className="shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-text">{file.name}</p>
              <p className="text-xs text-muted">{file.format.toUpperCase()}, {size(file.size)}</p>
              {busy && (
                <div className="mt-2" role="status">
                  <div className="h-1 overflow-hidden rounded-full bg-border">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
                  </div>
                  <p className="mt-1 text-xs text-muted">{progress}</p>
                </div>
              )}
            </div>
            {busy && (
              <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <X size={13} aria-hidden="true" /> Cancel
              </button>
            )}
          </div>
        )}

        {error && (
          <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
            <AlertOctagon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}

        {children}
      </div>

      <aside className="space-y-4 text-[13px]">
        <div>
          <h3 className="font-sans text-[13px] font-bold text-text">Supported files</h3>
          <ul className="mt-2 space-y-1.5">
            {FORMATS.map(({ label, detail, Icon }) => (
              <li key={label} className="flex items-center gap-2 text-muted">
                <Icon size={14} className="text-primary" aria-hidden="true" />
                <span className="w-10 font-bold text-text">{label}</span>
                {detail}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Scanned PDFs need OCR first. Macro-enabled and legacy .xls or .doc files are not accepted.</p>
        </div>
        <div className="border-t border-border pt-4">
          <h3 className="font-sans text-[13px] font-bold text-text">No matching file?</h3>
          <p className="mt-1 text-xs text-muted">Fill in the CSV template: one row per course with year, term, code, title, and units.</p>
          <button type="button" onClick={onDownloadTemplate} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <Download size={13} aria-hidden="true" /> Download CSV template
          </button>
        </div>
      </aside>
    </div>
  );
}
