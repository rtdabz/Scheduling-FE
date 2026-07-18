import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Info,
  LoaderCircle,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type { Department, Section, Term } from "../types";

interface ScheduleImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTerm: Term | null;
  selectedSection?: Section;
  departments: Department[];
}

type ImportStep = "upload" | "processing" | "review";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "xlsx"];

export default function ScheduleImportModal({
  isOpen,
  onClose,
  activeTerm,
  selectedSection,
  departments,
}: ScheduleImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step] = useState<ImportStep>("upload");

  const department = departments.find((item) => item.id === selectedSection?.departmentId);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) return;
    setFile(null);
    setFileError(null);
    setIsDragging(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const validateFile = (candidate: File) => {
    const extension = candidate.name.split(".").pop()?.toLowerCase() ?? "";

    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setFile(null);
      setFileError("Select a WICARS Print Schedule in PDF or XLSX format.");
      return;
    }

    if (candidate.size > MAX_FILE_SIZE) {
      setFile(null);
      setFileError("The selected file exceeds the 15 MB upload limit.");
      return;
    }

    if (candidate.size === 0) {
      setFile(null);
      setFileError("The selected file is empty.");
      return;
    }

    setFile(candidate);
    setFileError(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const steps: Array<{ id: ImportStep; label: string }> = [
    { id: "upload", label: "Upload" },
    { id: "processing", label: "Validate" },
    { id: "review", label: "Review & Import" },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-import-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 bg-[#4e0a10] px-6 py-5 text-white">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[#C9952A] p-2.5 shadow-sm">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 id="schedule-import-title" className="text-lg font-bold">Import Class Schedule</h2>
              <p className="mt-1 text-sm text-white/70">Upload, validate, and review an existing Print Schedule.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import schedule"
            className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
          <ol className="flex items-center">
            {steps.map((item, index) => {
              const isActive = item.id === step;
              return (
                <li key={item.id} className={`flex items-center ${index < steps.length - 1 ? "flex-1" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      isActive ? "bg-[#4e0a10] text-white" : "border border-gray-300 bg-white text-gray-400"
                    }`}>
                      {index + 1}
                    </span>
                    <span className={`hidden text-sm font-semibold sm:block ${isActive ? "text-[#4e0a10]" : "text-gray-400"}`}>
                      {item.label}
                    </span>
                  </div>
                  {index < steps.length - 1 && <span className="mx-3 h-px flex-1 bg-gray-300" />}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Academic term</p>
              <p className="mt-1 text-sm font-bold text-gray-800">
                {activeTerm ? `${activeTerm.academic_year} · ${activeTerm.semester} Semester` : "No active term available"}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Department</p>
              <p className="mt-1 text-sm font-bold text-gray-800">
                {department ? `${department.department_code} · ${department.department_name}` : "Select a section to identify the department"}
              </p>
            </div>
          </div>

          <div
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const candidate = event.dataTransfer.files[0];
              if (candidate) validateFile(candidate);
            }}
            className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              isDragging ? "border-[#C9952A] bg-amber-50" : fileError ? "border-red-300 bg-red-50/40" : "border-gray-300 bg-gray-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => {
                const candidate = event.target.files?.[0];
                if (candidate) validateFile(candidate);
                event.target.value = "";
              }}
            />

            {file ? (
              <div className="mx-auto flex max-w-xl items-center gap-4 rounded-xl border border-emerald-200 bg-white p-4 text-left shadow-sm">
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  {file.name.toLowerCase().endsWith(".pdf") ? <FileText className="h-6 w-6" /> : <FileSpreadsheet className="h-6 w-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-800">{file.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{formatFileSize(file.size)} · Ready for validation</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label="Remove selected file"
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#4e0a10]/10 text-[#4e0a10]">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="mt-4 text-sm font-bold text-gray-800">Drop your Print Schedule here</p>
                <p className="mt-1 text-sm text-gray-500">or select a file from your computer</p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-4 rounded-lg bg-[#4e0a10] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3a0809]"
                >
                  Browse files
                </button>
                <p className="mt-3 text-xs text-gray-400">PDF or XLSX · Maximum 15 MB</p>
              </>
            )}
          </div>

          {fileError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="flex gap-3 rounded-xl border border-gray-200 p-3">
              <FileText className="h-5 w-5 shrink-0 text-[#C9952A]" />
              <div><p className="text-xs font-bold text-gray-800">Print format only</p><p className="mt-0.5 text-xs text-gray-500">Use the official WICARS schedule layout.</p></div>
            </div>
            <div className="flex gap-3 rounded-xl border border-gray-200 p-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-[#C9952A]" />
              <div><p className="text-xs font-bold text-gray-800">Validated before import</p><p className="mt-0.5 text-xs text-gray-500">Database and conflict rules will run first.</p></div>
            </div>
            <div className="flex gap-3 rounded-xl border border-gray-200 p-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#C9952A]" />
              <div><p className="text-xs font-bold text-gray-800">No partial imports</p><p className="mt-0.5 text-xs text-gray-500">Critical errors must be resolved.</p></div>
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>The upload interface is ready. Server-side parsing and validation will be connected in the backend implementation phase.</p>
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-gray-500">Your existing schedule will not be changed during validation.</p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              disabled
              title="Backend parsing will be connected in the next implementation phase"
              className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-400"
            >
              <LoaderCircle className="h-4 w-4" />
              Validate Schedule
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
