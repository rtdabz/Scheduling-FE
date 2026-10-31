import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, Clock3, Pencil, Settings2, ShieldCheck } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import { downloadFile } from '../../lib/exportFile';
import { programLabel } from '../../lib/programLabel';
import { getStoredUser } from '../../lib/storedUser';
import { useToast } from '../../context/ToastContext';
import { curriculumImportService } from '../../services/curriculum/curriculumImportService';
import ImportCreditLedger from '../../components/curriculum/import/ImportCreditLedger';
import ImportDraftTable from '../../components/curriculum/import/ImportDraftTable';
import { CONFIGURE_STATUS_LABELS, configureStatus, type ConfigureStatus } from '../../lib/curriculumImport/configureStatus';
import ImportIssuesPanel from '../../components/curriculum/import/ImportIssuesPanel';
import ImportRowDetailModal from '../../components/curriculum/import/ImportRowDetailModal';
import ImportSettingsModal from '../../components/curriculum/import/ImportSettingsModal';
import ImportStepper, { type StepperStep } from '../../components/curriculum/import/ImportStepper';
import ImportTermRail, { type TermSelection } from '../../components/curriculum/import/ImportTermRail';
import ImportUploader from '../../components/curriculum/import/ImportUploader';
import {
  applyMapping, detectFormat, extractPdf, ImportFileError, readCsv, readDocx, readTable, readXlsx, sha256Hex,
  type TableReading, type TableSource,
} from '../../lib/curriculumImport/adapters';
import { buildDraft, groupTotals, localProblems, toPayload } from '../../lib/curriculumImport/draft';
import { TERM_LABELS, YEAR_LABELS } from '../../lib/curriculumImport/normalize';
import { TEMPLATE_FIELDS, TEMPLATE_HEADERS, type ColumnMapping, type HeaderDetection } from '../../lib/curriculumImport/tabular';
import type { DraftRow, Extraction, ImportDraft, ImportResult, ImportSettings, ValidationResult } from '../../lib/curriculumImport/types';
import type { Program } from '../../types/curriculum';

type Step = 'upload' | 'review' | 'configure' | 'import' | 'done';
type WorkStep = Exclude<Step, 'done'>;

const STEPS: StepperStep<WorkStep>[] = [
  { id: 'upload', label: 'Upload & extract', hint: 'Choose the curriculum file' },
  { id: 'review', label: 'Preview', hint: 'Check courses, units, terms' },
  { id: 'configure', label: 'Configure', hint: 'Categories and class time' },
  { id: 'import', label: 'Import', hint: 'Validate and create' },
];
const ORDER: WorkStep[] = STEPS.map((step) => step.id);

type StatusFilter = 'all' | ConfigureStatus;

const EXTRACTION_BUDGET_MS = 30_000;

const inputClass = 'h-9 w-full rounded-lg border border-border bg-white px-3 text-[13px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-parchment disabled:text-muted';
const primaryButton = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-primary bg-white px-4 text-[13px] font-bold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const quietButton = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-4 text-[13px] font-bold text-text hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const newRequestKey = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(''));

interface PendingMapping {
  detection: HeaderDetection;
  table: TableSource;
  mapping: ColumnMapping;
}

export default function CurriculumImportPage() {
  const navigate = useNavigate();
  const { toast, confirm } = useToast();
  const user = getStoredUser();
  const curriculumBase = user?.role === 'vpaa' ? '/curriculum' : `/${user?.role ?? 'secretary'}/curriculum`;
  const abort = useRef<AbortController | null>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<{ name: string; size: number; format: string; sha256: string } | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<TableSource[] | null>(null);
  const [pendingMapping, setPendingMapping] = useState<PendingMapping | null>(null);

  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [settings, setSettings] = useState<ImportSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<TermSelection>('all');
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [railOpen, setRailOpen] = useState(false);
  const [tableEditing, setTableEditing] = useState(false);

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [stale, setStale] = useState(true);
  const [acknowledgements, setAcknowledgements] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'validate' | 'commit' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const requestKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([api.get<Program[]>('/programs'), curriculumImportService.getSettings()])
      .then(([programResponse, loadedSettings]) => {
        if (!active) return;
        setPrograms(programResponse.data.filter((program) => user?.department_id == null || program.department_id === user.department_id));
        setSettings(loadedSettings);
      })
      .catch((error) => active && toast.error('Import setup failed', apiErrorMessage(error, 'Programs and import settings could not be loaded.')));
    return () => {
      active = false;
    };
  }, [toast, user?.department_id]);

  const dirty = draft !== null && step !== 'done';
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const markChanged = useCallback(() => setStale(true), []);

  const startDraft = useCallback((extraction: Extraction, info: { name: string; size: number; sha256: string }) => {
    if (extraction.rows.length === 0) {
      setExtractError(['No course rows were found.', ...extraction.warnings].join(' '));
      return;
    }
    const next = buildDraft(extraction, { filename: info.name, size_bytes: info.size, sha256: info.sha256 });
    const isProgramHead = user?.role === 'program_head';
    const matches = programs.filter((program) => next.detected.program_code && program.code.toUpperCase() === next.detected.program_code.toUpperCase());
    next.metadata.program_id = isProgramHead ? user?.program_id ?? null : matches.length === 1 ? matches[0].id : null;
    setDraft(next);
    setValidation(null);
    setStale(true);
    setAcknowledgements({});
    setPendingMapping(null);
    setSheets(null);
    setActiveGroup('all');
    setSelected(new Set());
    setStatusFilter('all');
    setStep('review');
  }, [programs, user?.program_id, user?.role]);

  const handleReading = useCallback((reading: TableReading | null, info: { name: string; size: number; sha256: string }) => {
    if (!reading) {
      setExtractError('No curriculum table was found. Use the CSV template headers, or a table with Course Code, Lec, Lab, and TU columns.');
      return;
    }
    if (reading.kind === 'mapping') {
      setPendingMapping({ detection: reading.detection, table: reading.table, mapping: { ...reading.detection.mapping } });
      return;
    }
    startDraft(reading.extraction, info);
  }, [startDraft]);

  const handleFile = async (selectedFile: File) => {
    setExtractError(null);
    setPendingMapping(null);
    setSheets(null);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), EXTRACTION_BUDGET_MS);
    try {
      setProgress('Reading the file');
      const data = await selectedFile.arrayBuffer();
      const format = detectFormat(selectedFile.name, data);
      const info = { name: selectedFile.name, size: selectedFile.size, format, sha256: await sha256Hex(data) };
      setFile(info);
      setBytes(data);

      if (format === 'pdf') {
        setProgress('Extracting PDF text');
        const extraction = await extractPdf(data, controller.signal, (page, total) => setProgress(`Extracting page ${page} of ${total}`));
        if (controller.signal.aborted) throw new DOMException('Extraction canceled.', 'AbortError');
        startDraft(extraction, info);
      } else if (format === 'csv') {
        setProgress('Reading CSV rows');
        handleReading(readTable(await readCsv(new TextDecoder('utf-8').decode(data))), info);
      } else if (format === 'xlsx') {
        setProgress('Reading the workbook');
        const workbook = await readXlsx(selectedFile);
        const usable = workbook.filter((sheet) => readTable(sheet) !== null);
        if (usable.length === 1) handleReading(readTable(usable[0]), info);
        else if (usable.length === 0) handleReading(null, info);
        else setSheets(usable);
      } else {
        setProgress('Reading document tables');
        handleReading(readTable(await readDocx(data)), info);
      }
    } catch (error) {
      if (controller.signal.aborted) setExtractError('Extraction was canceled or took longer than 30 seconds. Nothing was imported.');
      else setExtractError(error instanceof ImportFileError || error instanceof Error ? error.message : 'The file could not be read.');
    } finally {
      window.clearTimeout(timer);
      setProgress(null);
    }
  };

  const cancelExtraction = () => {
    abort.current?.abort();
    setProgress(null);
  };

  const discardDraft = async () => {
    if (draft && !(await confirm({ title: 'Discard import draft?', message: 'Your corrections are not saved anywhere and will be lost.', confirmLabel: 'Discard draft', variant: 'danger' }))) return;
    setDraft(null);
    setValidation(null);
    setFile(null);
    setBytes(null);
    setAcknowledgements({});
    setSelected(new Set());
    requestKey.current = null;
    setStep('upload');
  };

  const updateRow = useCallback((rowId: string, patch: Partial<DraftRow>) => {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, rows: current.rows.map((row) => (row.row_id === rowId ? { ...row, ...patch } : row)) };
    });
    markChanged();
  }, [markChanged]);

  const setCategoryFor = (rowIds: Set<string>, category: DraftRow['category']) => {
    setDraft((current) => (current ? { ...current, rows: current.rows.map((row) => (rowIds.has(row.row_id) ? { ...row, category } : row)) } : current));
    markChanged();
  };

  const toggleSelected = useCallback((rowIds: string[], value: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      rowIds.forEach((id) => (value ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const updateMetadata = (patch: Partial<ImportDraft['metadata']>) => {
    setDraft((current) => (current ? { ...current, metadata: { ...current.metadata, ...patch } } : current));
    markChanged();
  };

  const acknowledge = (key: string, reason: string) => {
    setAcknowledgements((current) => ({ ...current, [key]: reason }));
    markChanged();
  };

  const problems = useMemo(() => (draft ? localProblems(draft) : []), [draft]);
  const totals = useMemo(() => (draft ? groupTotals(draft) : []), [draft]);
  const issuesByRow = useMemo(() => {
    const map = new Map<string, ValidationResult['issues']>();
    for (const issue of validation?.issues ?? []) {
      if (!issue.row_id) continue;
      map.set(issue.row_id, [...(map.get(issue.row_id) ?? []), issue]);
    }
    return map;
  }, [validation]);
  const visibleIssues = useMemo(() => (stale ? new Map<string, ValidationResult['issues']>() : issuesByRow), [stale, issuesByRow]);
  const resolved = useMemo(() => new Map((validation?.rows ?? []).map((row) => [row.row_id, row])), [validation]);
  const validated = !!validation && !stale;

  const errorsByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of draft?.rows ?? []) {
      if (!row.year_level || !row.semester) continue;
      const hasError = (visibleIssues.get(row.row_id) ?? []).some((issue) => issue.severity === 'error')
        || problems.some((problem) => problem.row_id === row.row_id);
      if (hasError) map.set(`${row.year_level}-${row.semester}`, (map.get(`${row.year_level}-${row.semester}`) ?? 0) + 1);
    }
    return map;
  }, [draft, visibleIssues, problems]);

  const termRows = useMemo(() => {
    if (!draft) return [];
    if (activeGroup === 'all') return draft.rows;
    return draft.rows.filter((row) => row.year_level === activeGroup.year && row.semester === activeGroup.term);
  }, [draft, activeGroup]);

  const statusCounts = useMemo(() => {
    const counts = new Map<ConfigureStatus, number>();
    for (const row of termRows) {
      const status = configureStatus(row, resolved.get(row.row_id), visibleIssues.get(row.row_id), validated);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return counts;
  }, [termRows, resolved, visibleIssues, validated]);

  const visibleRows = useMemo(() => {
    if (step !== 'configure' || statusFilter === 'all') return termRows;
    return termRows.filter((row) => configureStatus(row, resolved.get(row.row_id), visibleIssues.get(row.row_id), validated) === statusFilter);
  }, [step, statusFilter, termRows, resolved, visibleIssues, validated]);

  const runValidation = async (): Promise<ValidationResult | null> => {
    if (!draft) return null;
    if (problems.length > 0) {
      setSubmitError(`Fix ${problems.length} problem${problems.length === 1 ? '' : 's'} in the draft first. ${problems[0].message}`);
      return null;
    }
    setBusy('validate');
    setSubmitError(null);
    try {
      const next = await curriculumImportService.validate(toPayload(draft, { acknowledgements }));
      setValidation(next);
      setStale(false);
      return next;
    } catch (error) {
      setSubmitError(apiErrorMessage(error, 'The draft could not be validated.'));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const commit = async () => {
    if (!draft || !validation || stale || !validation.valid) return;
    if (requestKey.current?.fingerprint !== validation.fingerprint) {
      requestKey.current = { fingerprint: validation.fingerprint, key: newRequestKey() };
    }
    setBusy('commit');
    setSubmitError(null);
    try {
      const imported = await curriculumImportService.commit(toPayload(draft, {
        acknowledgements,
        requestKey: requestKey.current.key,
        fingerprint: validation.fingerprint,
        expectedSettingsRevision: validation.settings_revision,
      }));
      invalidateCacheGroups('curriculum', 'courses', 'schedules', 'dashboards');
      setResult(imported);
      setStep('done');
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: { validation?: ValidationResult } } }).response;
      if (response?.status === 422 && response.data?.validation) {
        setValidation(response.data.validation);
        setStale(false);
      } else if (response?.status === 409) {
        setStale(true);
      }
      // The draft and request key are kept, so a retry after a network failure returns the recorded outcome.
      setSubmitError(apiErrorMessage(error, 'The import did not finish. Your draft is kept; try again.'));
    } finally {
      setBusy(null);
    }
  };

  const focusRow = (rowId: string) => {
    const row = draft?.rows.find((candidate) => candidate.row_id === rowId);
    if (!row) return;
    setActiveGroup(row.year_level && row.semester ? { year: row.year_level, term: row.semester } : 'all');
    setStatusFilter('all');
    setStep((current) => (current === 'import' || current === 'upload' ? 'review' : current));
    window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(rowId)}"]`);
      element?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      element?.querySelector<HTMLElement>('input, select, button')?.focus();
    }, 50);
  };

  const downloadTemplate = () => {
    const example = ['1', 'First Semester', 'IT 101', 'Introduction to Computing', '2', '1', '3', 'none'];
    downloadFile(new Blob([`${TEMPLATE_HEADERS.join(',')}\r\n${example.join(',')}\r\n`], { type: 'text/csv;charset=utf-8' }), 'curriculum-import-template.csv');
  };

  const openRow = draft?.rows.find((row) => row.row_id === openRowId) ?? null;
  const counts = validation?.counts;
  const canImport = validated && !!validation?.valid && busy === null;
  const program = programs.find((candidate) => candidate.id === draft?.metadata.program_id) ?? null;
  const currentIndex = step === 'done' ? ORDER.length : ORDER.indexOf(step);
  const completed = new Set(ORDER.filter((_, index) => draft !== null && index < currentIndex));
  const unplaced = draft?.rows.filter((row) => !row.year_level || !row.semester).length ?? 0;
  const termTitle = activeGroup === 'all' ? 'All courses' : `${YEAR_LABELS[activeGroup.year]}, ${TERM_LABELS[activeGroup.term]}`;
  const selectedInView = visibleRows.filter((row) => selected.has(row.row_id));
  const goTo = (next: WorkStep) => {
    setStep(next);
    setSubmitError(null);
  };

  const validationStatus = !validation
    ? 'Not validated yet'
    : stale
      ? 'Changed since the last check'
      : validation.valid
        ? 'Ready to import'
        : [
          counts?.errors ? `${counts.errors} error${counts.errors === 1 ? '' : 's'}` : null,
          counts?.reviews_open ? `${counts.reviews_open} review${counts.reviews_open === 1 ? '' : 's'} without a reason` : null,
        ].filter(Boolean).join(', ');

  const actionBar = (left: ReactNode, right: ReactNode) => (
    <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-border bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-[13px]" role="status">{left}</div>
        <div className="flex flex-wrap items-center gap-2">{right}</div>
      </div>
      {submitError && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{submitError}</p>}
    </div>
  );

  const validateButton = (
    <button type="button" onClick={() => void runValidation()} disabled={busy !== null} className={secondaryButton}>
      {busy === 'validate' ? 'Validating…' : 'Validate'}
    </button>
  );

  const statusLine = (
    <span className={`flex items-center gap-1.5 ${validated && validation?.valid ? 'text-emerald-800' : 'text-muted'}`}>
      {validated && validation?.valid ? <CheckCircle2 size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
      {problems.length > 0 ? <span className="font-semibold text-red-700">{problems.length} problem{problems.length === 1 ? '' : 's'} to fix in the draft</span> : validationStatus}
    </span>
  );

  return (
    <div className="w-full space-y-4 font-sans">
      <header className="rounded-xl border border-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={curriculumBase} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted hover:bg-parchment hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Back to curriculum list"><ArrowLeft size={16} /></Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-primary">Import curriculum</h1>
              <p className="truncate text-[13px] text-muted">{file ? file.name : 'Creates a new deactivated curriculum from a reviewed document'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {settings && (
              <button type="button" onClick={() => setSettingsOpen(true)} className={quietButton}>
                <Settings2 size={15} aria-hidden="true" /> Import settings
              </button>
            )}
            {draft && step !== 'done' && <button type="button" onClick={() => void discardDraft()} className={quietButton}>Discard draft</button>}
          </div>
        </div>
        {step !== 'done' && (
          <div className="px-4 py-4 sm:px-6">
            <ImportStepper
              steps={STEPS}
              current={step as WorkStep}
              completed={completed}
              isReachable={(id) => (id === 'upload' ? !draft : !!draft)}
              onSelect={goTo}
            />
          </div>
        )}
      </header>

      {step === 'upload' && (
        <section aria-labelledby="upload-heading" className="rounded-xl border border-border bg-white px-4 py-5 sm:px-6">
          <h2 id="upload-heading" className="mb-4 text-lg font-semibold text-text">Upload the curriculum file</h2>
          <ImportUploader
            file={file}
            progress={progress}
            error={extractError}
            onFile={(selectedFile) => void handleFile(selectedFile)}
            onCancel={cancelExtraction}
            onDownloadTemplate={downloadTemplate}
          >
            {sheets && (
              <fieldset className="rounded-xl border border-border p-4">
                <legend className="px-1 text-[13px] font-bold text-text">Choose a sheet</legend>
                <p className="mb-2 text-xs text-muted">Several sheets in this workbook contain course tables.</p>
                <div className="flex flex-wrap gap-2">
                  {sheets.map((sheet) => (
                    <button key={sheet.label} type="button" onClick={() => file && handleReading(readTable(sheet), file)} className={quietButton}>{sheet.label}</button>
                  ))}
                </div>
              </fieldset>
            )}
            {pendingMapping && file && (
              <fieldset className="space-y-3 rounded-xl border border-accent/40 bg-accent/[0.07] p-4">
                <legend className="px-1 text-[13px] font-bold text-text">Match the columns</legend>
                <p className="text-[13px] text-text">
                  {pendingMapping.detection.missing.length > 0 && <>Not found: {pendingMapping.detection.missing.join(', ')}. </>}
                  {pendingMapping.detection.ambiguous.length > 0 && <>More than one column fits: {pendingMapping.detection.ambiguous.join(', ')}. </>}
                  Pick the column for each field. Fields left out stay blank and must be filled in during Preview.
                </p>
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {TEMPLATE_FIELDS.map(({ field, label, required }) => (
                    <label key={field} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="font-semibold text-text">{label}{required && <span className="text-red-700" aria-hidden="true"> *</span>}</span>
                      <select value={pendingMapping.mapping[field] ?? ''} onChange={(event) => setPendingMapping({ ...pendingMapping, mapping: { ...pendingMapping.mapping, [field]: event.target.value === '' ? undefined : Number(event.target.value) } })} className={`${inputClass} w-48`}>
                        <option value="">Not in file</option>
                        {pendingMapping.detection.headers.map((header, column) => <option key={column} value={column}>{header || `Column ${column + 1}`}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <button type="button" onClick={() => startDraft(applyMapping(pendingMapping.table, pendingMapping.detection, pendingMapping.mapping), file)} className={primaryButton}>Use these columns</button>
              </fieldset>
            )}
          </ImportUploader>
        </section>
      )}

      {draft && (step === 'review' || step === 'configure' || step === 'import') && (
        <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-4">
            <button type="button" onClick={() => setRailOpen((open) => !open)} aria-expanded={railOpen} aria-controls="import-term-rail" className={`${quietButton} w-full justify-between lg:hidden`}>
              <span>Terms: {termTitle}</span>
              <span className="text-muted">{railOpen ? 'Hide' : 'Show'}</span>
            </button>
            <div id="import-term-rail" className={`${railOpen ? 'mt-2 block' : 'hidden'} lg:mt-0 lg:block`}>
            <ImportTermRail
              totals={totals}
              rowCount={draft.rows.length}
              unplacedCount={unplaced}
              errorsByGroup={errorsByGroup}
              selection={activeGroup}
              onSelect={(selection) => {
                setActiveGroup(selection);
                setRailOpen(false);
                if (step === 'import') setStep('review');
              }}
            />
            </div>
          </div>

          <section aria-labelledby="step-heading" className="min-w-0 rounded-xl border border-border bg-white px-4 pt-5 sm:px-6">
            {step === 'review' && (
              <>
                <h2 id="step-heading" className="text-lg font-semibold text-text">Preview the extracted curriculum</h2>
                <p className="mt-1 text-[13px] text-muted">Correct anything the document got wrong. The original values stay on record next to your corrections.</p>

                <fieldset className="mt-5 rounded-xl border border-border p-4">
                  <legend className="px-1 text-[13px] font-bold text-text">Curriculum details</legend>
                  <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                    <label className="block text-[13px] sm:col-span-2 xl:col-span-2">
                      <span className="font-semibold text-text">Curriculum name <span className="text-red-700" aria-hidden="true">*</span></span>
                      <input value={draft.metadata.name} onChange={(event) => updateMetadata({ name: event.target.value })} className={`${inputClass} mt-1 ${draft.metadata.name.trim() ? '' : 'border-red-300 bg-red-50/60'}`} />
                    </label>
                    <div className="text-[13px]">
                      <span className="font-semibold text-text">Internal code</span>
                      <p aria-label="Internal code" className="mt-1 flex h-9 items-center rounded-lg border border-border bg-parchment px-3 font-semibold text-muted">
                        {validated ? validation!.metadata.code : 'Assigned automatically'}
                      </p>
                    </div>
                    <label className="block text-[13px] sm:col-span-2 xl:col-span-1">
                      <span className="font-semibold text-text">Program</span>
                      <select value={draft.metadata.program_id ?? ''} disabled={user?.role === 'program_head'} onChange={(event) => updateMetadata({ program_id: event.target.value ? Number(event.target.value) : null })} className={`${inputClass} mt-1`}>
                        <option value="">All programs in the department</option>
                        {programs.map((candidate) => <option key={candidate.id} value={candidate.id}>{programLabel(candidate)}</option>)}
                      </select>
                      {draft.detected.program_text && <span className="mt-1 block text-xs text-muted">From the document: {draft.detected.program_text}{!program ? '. No matching program is selected.' : ''}</span>}
                    </label>
                    <label className="block text-[13px]">
                      <span className="font-semibold text-text">Effective school year <span className="text-red-700" aria-hidden="true">*</span></span>
                      <input value={draft.metadata.effective_school_year} onChange={(event) => updateMetadata({ effective_school_year: event.target.value })} placeholder="2020-2021" className={`${inputClass} mt-1 tabular-nums ${draft.metadata.effective_school_year.trim() ? '' : 'border-red-300 bg-red-50/60'}`} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-[13px]"><span className="font-semibold text-text">CMO number</span><input value={draft.metadata.cmo_number} onChange={(event) => updateMetadata({ cmo_number: event.target.value })} className={`${inputClass} mt-1`} /></label>
                      <label className="block text-[13px]"><span className="font-semibold text-text">Series</span><input value={draft.metadata.cmo_series} inputMode="numeric" onChange={(event) => updateMetadata({ cmo_series: event.target.value })} placeholder="2015" className={`${inputClass} mt-1 tabular-nums`} /></label>
                    </div>
                  </div>
                  {draft.metadata.notes.length > 0 && (
                    <div className="mt-4 rounded-lg bg-parchment px-3 py-2 text-[13px] text-text">
                      <p className="font-semibold">Notes kept from the document</p>
                      <p className="text-xs text-muted">Recorded with the import, not added as courses.</p>
                      <ul className="mt-1 list-disc pl-5">{draft.metadata.notes.map((note) => <li key={note}>{note}</li>)}</ul>
                    </div>
                  )}
                  {draft.warnings.length > 0 && <ul className="mt-3 list-disc rounded-lg border border-accent/40 bg-accent/[0.07] py-2 pl-8 pr-3 text-[13px] text-text">{draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
                </fieldset>
              </>
            )}

            {step === 'configure' && (
              <>
                <h2 id="step-heading" className="text-lg font-semibold text-text">Configure categories and class time</h2>
                <p className="mt-1 text-[13px] text-muted">Department rules suggest Major or Minor. Override a row only when the rule is wrong for it; you will be asked why.</p>

                {settings && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-parchment px-4 py-3">
                    <dl className="flex flex-wrap gap-x-8 gap-y-1 text-[13px]">
                      <div><dt className="text-xs text-muted">Lecture</dt><dd className="font-bold tabular-nums text-text">{settings.lecture_minutes_per_unit} min per unit</dd></div>
                      <div><dt className="text-xs text-muted">Laboratory</dt><dd className="font-bold tabular-nums text-text">{settings.laboratory_minutes_per_unit} min per unit</dd></div>
                      <div><dt className="text-xs text-muted">Classification rules</dt><dd className="font-bold tabular-nums text-text">{settings.rules.filter((rule) => rule.enabled).length} active</dd></div>
                    </dl>
                    <button type="button" onClick={() => setSettingsOpen(true)} className={quietButton}>{settings.can_manage ? 'Edit settings' : 'View settings'}</button>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
                  {(['all', 'needs_category', 'invalid', 'override', 'rule', 'manual', 'unchecked'] as StatusFilter[]).map((filter) => {
                    const count = filter === 'all' ? termRows.length : statusCounts.get(filter) ?? 0;
                    if (filter !== 'all' && count === 0) return null;
                    const active = statusFilter === filter;
                    return (
                      <button key={filter} type="button" aria-pressed={active} onClick={() => setStatusFilter(filter)} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'border-primary bg-primary text-white' : 'border-border bg-white text-text hover:border-primary/50'}`}>
                        {filter === 'all' ? 'All' : CONFIGURE_STATUS_LABELS[filter]}
                        <span className={`tabular-nums ${active ? 'text-white/80' : 'text-muted'}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>

                <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${selectedInView.length ? 'border-primary/30 bg-primary/[0.04]' : 'border-dashed border-border text-muted'}`}>
                  {selectedInView.length === 0 ? (
                    <span>Select courses to set their category together.</span>
                  ) : (
                    <>
                      <span className="font-bold text-text">{selectedInView.length} selected</span>
                      <span className="text-muted">Set category:</span>
                      {(['major', 'minor'] as const).map((category) => (
                        <button key={category} type="button" onClick={() => setCategoryFor(new Set(selectedInView.map((row) => row.row_id)), category)} className="h-8 rounded-md border border-primary bg-white px-3 text-xs font-bold text-primary hover:bg-primary/5">{category === 'major' ? 'Major' : 'Minor'}</button>
                      ))}
                      <button type="button" onClick={() => setCategoryFor(new Set(selectedInView.map((row) => row.row_id)), null)} className="h-8 rounded-md border border-border bg-white px-3 text-xs font-bold text-text hover:bg-parchment">Use rule</button>
                      <button type="button" onClick={() => toggleSelected(selectedInView.map((row) => row.row_id), false)} className="ml-auto h-8 rounded-md px-2 text-xs font-bold text-muted hover:text-text">Clear selection</button>
                    </>
                  )}
                </div>
              </>
            )}

            {(step === 'review' || step === 'configure') && (
              <>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold text-text">{termTitle}</h3>
                    {step === 'review' && (
                      <button type="button" onClick={() => setTableEditing((value) => !value)} aria-pressed={tableEditing} className={tableEditing ? primaryButton : secondaryButton}>
                        {tableEditing ? <><Check size={15} aria-hidden="true" /> Done editing</> : <><Pencil size={14} aria-hidden="true" /> Edit table</>}
                      </button>
                    )}
                  </div>
                  {activeGroup !== 'all' && (() => {
                    const group = totals.find((candidate) => candidate.year_level === activeGroup.year && candidate.semester === activeGroup.term);
                    if (!group) return null;
                    const mismatch = group.reported && group.reported.tu !== group.calculated.tu;
                    return (
                      <p className="text-[13px] tabular-nums text-muted">
                        {group.row_count} courses, <span className="font-bold text-text">{group.calculated.tu} units</span>
                        {group.reported ? <span className={mismatch ? 'ml-1 font-bold text-[#7a5410]' : 'ml-1'}>(printed {group.reported.tu ?? '?'})</span> : <span className="ml-1">(no printed total)</span>}
                      </p>
                    );
                  })()}
                </div>
                <div className="-mx-4 sm:-mx-6">
                  <ImportDraftTable
                    mode={step}
                    editing={step === 'review' && tableEditing}
                    rows={visibleRows}
                    issuesByRow={visibleIssues}
                    resolved={resolved}
                    validated={validated}
                    settings={settings}
                    selected={selected}
                    onToggleSelected={toggleSelected}
                    onChange={updateRow}
                    onOpenRow={setOpenRowId}
                  />
                </div>
                {actionBar(
                  statusLine,
                  <>
                    {step === 'configure' && <button type="button" onClick={() => goTo('review')} className={quietButton}>Back</button>}
                    {validateButton}
                    <button type="button" onClick={() => goTo(step === 'review' ? 'configure' : 'import')} className={primaryButton}>
                      {step === 'review' ? 'Continue to Configure' : 'Continue to Import'}
                    </button>
                  </>,
                )}
              </>
            )}

            {step === 'import' && (
              <>
                <h2 id="step-heading" className="text-lg font-semibold text-text">Validate and import</h2>
                <p className="mt-1 text-[13px] text-muted">The server checks the whole draft. The import creates the curriculum only when nothing is left to fix or accept.</p>

                <dl className="mt-5 grid gap-x-8 gap-y-3 rounded-xl border border-border px-4 py-3 text-[13px] sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted">Internal code</dt>
                    <dd aria-label="Assigned internal code" className="font-bold text-text">{validated ? validation!.metadata.code : 'Assigned when validated'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Courses</dt>
                    <dd className="font-bold tabular-nums text-text">{draft.rows.length} in {totals.filter((group) => group.row_count > 0).length} terms</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Check result</dt>
                    <dd className={`font-bold ${validated && validation?.valid ? 'text-emerald-800' : validated ? 'text-red-700' : 'text-muted'}`}>{validationStatus}</dd>
                  </div>
                </dl>

                <div className="mt-6"><ImportCreditLedger totals={totals} rowCount={draft.rows.length} /></div>

                <div className="mt-6 border-t border-border pt-5">
                  {validation
                    ? <ImportIssuesPanel issues={validation.issues} acknowledgements={acknowledgements} stale={stale} onAcknowledge={acknowledge} onFocusRow={focusRow} />
                    : <p className="text-[13px] text-muted">Validate to run the server checks: existing courses, categories, totals, and class time.</p>}
                </div>

                {actionBar(
                  <span className="flex items-center gap-1.5 text-muted"><ShieldCheck size={15} aria-hidden="true" /> The curriculum is created deactivated. Activate it afterwards from the curriculum list.</span>,
                  <>
                    <button type="button" onClick={() => goTo('configure')} className={quietButton}>Back</button>
                    {validateButton}
                    <button type="button" onClick={() => void commit()} disabled={!canImport} className={primaryButton}>{busy === 'commit' ? 'Importing…' : 'Import curriculum'}</button>
                  </>,
                )}
              </>
            )}
          </section>
        </div>
      )}

      {step === 'done' && result && (
        <section aria-labelledby="done-heading" className="rounded-xl border border-border bg-white px-4 py-6 sm:px-6" aria-live="polite">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="mt-1 shrink-0 text-emerald-700" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="done-heading" className="text-lg font-semibold text-text">{result.replayed ? 'This import was already completed' : 'Curriculum imported'}</h2>
              <p className="mt-1 text-[13px] text-text">
                <span className="font-bold">{result.curriculum.name}</span> ({result.curriculum.code}) was created as <span className="font-bold">{result.curriculum.status}</span>
                {result.curriculum.cmo_number && <> under CMO {result.curriculum.cmo_number}{result.curriculum.cmo_series ? `, s. ${result.curriculum.cmo_series}` : ''}</>}, effective {result.curriculum.effective_school_year}. Activate it from the curriculum list when it is ready for sections.
              </p>
            </div>
          </div>
          <dl className="mt-5 grid gap-x-8 gap-y-3 rounded-xl border border-border px-4 py-3 text-[13px] sm:grid-cols-4">
            <div><dt className="text-xs text-muted">Courses created</dt><dd className="text-lg font-bold tabular-nums">{result.created_count}</dd></div>
            <div><dt className="text-xs text-muted">Existing courses used</dt><dd className="text-lg font-bold tabular-nums">{result.reused_count}</dd></div>
            <div><dt className="text-xs text-muted">Terms</dt><dd className="text-lg font-bold tabular-nums">{result.totals.populated_groups}</dd></div>
            <div><dt className="text-xs text-muted">Total units</dt><dd className="text-lg font-bold tabular-nums">{result.totals.calculated.tu}</dd></div>
          </dl>
          {Object.keys(result.acknowledged).length > 0 && (
            <details className="mt-4 text-[13px]">
              <summary className="cursor-pointer font-bold text-text">{Object.keys(result.acknowledged).length} accepted reviews and their reasons</summary>
              <ul className="mt-2 space-y-1.5">{Object.entries(result.acknowledged).map(([key, item]) => <li key={key} className="rounded-lg bg-parchment px-3 py-2"><span className="text-text">{item.message}</span><br /><span className="text-muted">Reason: {item.reason}</span></li>)}</ul>
            </details>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate(`${curriculumBase}/${result.curriculum.id}`)} className={primaryButton}>Open curriculum</button>
            <Link to={curriculumBase} className={quietButton}>Back to curriculum list</Link>
          </div>
        </section>
      )}

      {openRow && draft && (
        <ImportRowDetailModal row={openRow} issues={stale ? [] : issuesByRow.get(openRow.row_id) ?? []} bytes={bytes} onClose={() => setOpenRowId(null)} onChange={updateRow} />
      )}
      {settingsOpen && settings && (
        <ImportSettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(saved) => {
            setSettings(saved);
            setSettingsOpen(false);
            markChanged();
            invalidateCacheGroups('settings');
            toast.success('Settings saved', 'They apply to this and later imports. Existing curricula were not changed.');
          }}
        />
      )}
    </div>
  );
}
