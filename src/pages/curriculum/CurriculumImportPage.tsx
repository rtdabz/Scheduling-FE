import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertOctagon, ArrowLeft, ArrowRight,Check, CheckCircle2, Clock3, FileText, List, ListChecks, Pencil, Settings2, ShieldCheck } from 'lucide-react';
import api from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiError';
import { invalidateCacheGroups } from '../../lib/cacheGroups';
import { programLabel } from '../../lib/programLabel';
import { getStoredUser } from '../../lib/storedUser';
import { useToast } from '../../context/ToastContext';
import { curriculumImportService } from '../../services/curriculum/curriculumImportService';
import ImportCreditLedger from '../../components/curriculum/import/ImportCreditLedger';
import ImportReviewModal from '../../components/curriculum/import/ImportReviewModal';
import ImportCurriculumSheet from '../../components/curriculum/import/ImportCurriculumSheet';
import ImportConfigureTermTable from '../../components/curriculum/import/ImportConfigureTermTable';
import ImportPreviewTermTable from '../../components/curriculum/import/ImportPreviewTermTable';
import ImportCurriculumDetailsModal,{ type MetadataField, type MetadataIssue } from '../../components/curriculum/import/ImportCurriculumDetailsModal';
import ImportDraftTable from '../../components/curriculum/import/ImportDraftTable';
import { CONFIGURE_STATUS_LABELS, configureStatus, type ConfigureStatus } from '../../lib/curriculumImport/configureStatus';
import ImportIssuesModal from '../../components/curriculum/import/ImportIssuesModal';
import type { IssueAction } from '../../components/curriculum/import/ImportIssuesPanel';
import ImportRowDetailModal from '../../components/curriculum/import/ImportRowDetailModal';
import ImportSettingsModal from '../../components/curriculum/import/ImportSettingsModal';
import ImportStepper, { type StepperStep } from '../../components/curriculum/import/ImportStepper';
import ImportTermRail, { type TermSelection } from '../../components/curriculum/import/ImportTermRail';
import ImportUploader from '../../components/curriculum/import/ImportUploader';
import { IMPORT_HEADER_GRADIENT } from '../../components/curriculum/import/importTheme';
import SourceNotes from '../../components/curriculum/SourceNotes';
import { noteScopeLabel } from '../../lib/curriculumImport/notes';
import { highlight, showTerm, termSectionId } from '../../lib/curriculumImport/sheetNavigation';
import {
  applyMapping, detectFormat, extractPdf, ImportFileError, readCsv, readDocx, readTable, readXlsx, sha256Hex,
  type TableReading, type TableSource,
} from '../../lib/curriculumImport/adapters';
import {
  buildDraft, groupKey, groupTotals, isPlaced, localProblems, proposedImportCode, toPayload,
  type GroupAttention,
} from '../../lib/curriculumImport/draft';
import { TERM_LABELS, YEAR_LABELS } from '../../lib/curriculumImport/normalize';
import { TEMPLATE_FIELDS, type ColumnMapping, type HeaderDetection } from '../../lib/curriculumImport/tabular';
import type { DraftRow, Extraction, ImportDraft, ImportResult, ImportSettings, PlacementTerm, SourceNote, UnreadRegion, ValidationResult } from '../../lib/curriculumImport/types';
import type { Program } from '../../types/curriculum';

type Step = 'upload' | 'review' | 'configure' | 'import' | 'done';
type WorkStep = Exclude<Step, 'done'>;

const STEPS: StepperStep<WorkStep>[] = [
  { id: 'upload', label: 'Upload & extract', hint: 'Choose the curriculum file' },
  { id: 'review', label: 'Preview', hint: 'Check courses, units, terms' },
  { id: 'configure', label: 'Configure', hint: 'Categories and class time' },
  { id: 'import', label: 'Import', hint: 'Review and confirm' },
];
const ORDER: WorkStep[] = STEPS.map((step) => step.id);

type StatusFilter = 'all' | ConfigureStatus;

const EXTRACTION_BUDGET_MS = 30_000;

// Findings about classification are fixed in Configure; the rest in Preview.
const CATEGORY_CODES = new Set(['unclassified', 'category_override', 'catalog_category_mismatch']);
const issueControl = (code: string, field: string | null): 'category' | null => (CATEGORY_CODES.has(code) || field === 'category' ? 'category' : null);
const CONTROL_LABELS = { category: 'Category for' } as const;

const inputClass = 'h-9 w-full rounded-lg border border-border bg-white px-3 text-[13px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-parchment disabled:text-muted';
const primaryButton = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-bold text-white hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-primary bg-white px-4 text-[13px] font-bold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
// Light-on-maroon controls for the gradient header.
const headerControl = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-white/30 bg-white/10 text-[13px] font-bold text-white hover:border-white/50 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#4e0a10] disabled:cursor-not-allowed disabled:opacity-50';
const headerButton = `${headerControl} px-4`;
// The step's main action in its heading: solid white on the maroon gradient.
const headerPrimary = 'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-4 text-[13px] font-bold text-primary hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#4e0a10] disabled:cursor-not-allowed disabled:opacity-60';
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
  // Preview and Configure show every term; Import's rail remembers the term it last opened.
  const [railSelection, setRailSelection] = useState<TermSelection>('all');
  // Closed initially; `focus` names the field to focus when opened from a metadata error.
  const [details, setDetails] = useState<{ open: boolean; focus: MetadataField | null }>({ open: false, focus: null });
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  // The details start unreviewed after each upload; the button says so until they are opened.
  const [detailsReviewed, setDetailsReviewed] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [railOpen, setRailOpen] = useState(false);
  const [tableEditing, setTableEditing] = useState(false);

  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [stale, setStale] = useState(true);
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
    setPendingMapping(null);
    setSheets(null);
    setRailSelection('all');
    setDetails({ open: false, focus: null });
    setDetailsReviewed(false);
    setIssuesOpen(false);
    setSelected(new Set());
    setStatusFilter('all');
    setStep('review');
  }, [programs, user?.program_id, user?.role]);

  const handleReading = useCallback((reading: TableReading | null, info: { name: string; size: number; sha256: string }) => {
    if (!reading) {
      setExtractError('No curriculum table was found. Use a table with Course Code, Lec, Lab, and TU columns.');
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

  // Note placement and transcriptions are draft content: they invalidate the last check like any edit.
  const updateNotes = (notes: SourceNote[]) => {
    setDraft((current) => (current ? { ...current, notes } : current));
    markChanged();
  };

  const updateUnread = (unread: UnreadRegion[]) => {
    setDraft((current) => (current ? { ...current, unread } : current));
    markChanged();
  };

  const updateMetadata = (patch: Partial<ImportDraft['metadata']>) => {
    setDraft((current) => (current ? { ...current, metadata: { ...current.metadata, ...patch } } : current));
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

  // Errors and notices per Preview tab, so findings on other terms stay visible from the tabs.
  const attention = useMemo(() => {
    const map = new Map<string, GroupAttention>();
    const bump = (key: string, field: keyof GroupAttention) => {
      const current = map.get(key) ?? { errors: 0, notices: 0 };
      map.set(key, { ...current, [field]: current[field] + 1 });
    };
    for (const row of draft?.rows ?? []) {
      const key = isPlaced(row) ? groupKey(row.year_level, row.semester) : 'unassigned';
      const issues = visibleIssues.get(row.row_id) ?? [];
      if (issues.some((issue) => issue.severity === 'error') || problems.some((problem) => problem.row_id === row.row_id)) bump(key, 'errors');
      if (issues.some((issue) => issue.severity === 'notice')) bump(key, 'notices');
    }
    return map;
  }, [draft, visibleIssues, problems]);

  const statusOf = useCallback(
    (row: DraftRow) => configureStatus(row, resolved.get(row.row_id), visibleIssues.get(row.row_id), validated),
    [resolved, visibleIssues, validated],
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<ConfigureStatus, number>();
    for (const row of draft?.rows ?? []) counts.set(statusOf(row), (counts.get(statusOf(row)) ?? 0) + 1);
    return counts;
  }, [draft, statusOf]);

  const visibleRows = useMemo(() => {
    const rows = draft?.rows ?? [];
    return step !== 'configure' || statusFilter === 'all' ? rows : rows.filter((row) => statusOf(row) === statusFilter);
  }, [draft, step, statusFilter, statusOf]);

  const runValidation = async (): Promise<ValidationResult | null> => {
    if (!draft) return null;
    if (problems.length > 0) {
      setSubmitError(`Fix ${problems.length} problem${problems.length === 1 ? '' : 's'} in the draft first. ${problems[0].message}`);
      return null;
    }
    setBusy('validate');
    setSubmitError(null);
    try {
      const next = await curriculumImportService.validate(toPayload(draft, {}));
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
      // The single confirmation names the reviewed outcome by its fingerprint; the server checks it again.
      const imported = await curriculumImportService.commit(toPayload(draft, {
        requestKey: requestKey.current.key,
        fingerprint: validation.fingerprint,
        expectedSettingsRevision: validation.settings_revision,
        confirmed: true,
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

  /** Shows the row (in `destination`, by default the current working step) and focuses the row or one of its controls. */
  const focusRow = (rowId: string, destination?: 'review' | 'configure', control: 'category' | null = null) => {
    const row = draft?.rows.find((candidate) => candidate.row_id === rowId);
    if (!row) return;
    changeView();
    setTableEditing(false);
    setStep((current) => destination ?? (current === 'import' || current === 'upload' ? 'review' : current));
    // After the step renders, and after a closing dialog has returned focus to its opener.
    window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(rowId)}"]`);
      element?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      const target = control ? element?.querySelector<HTMLElement>(`[aria-label^="${CONTROL_LABELS[control]}"]`) : null;
      (target ?? element?.querySelector<HTMLElement>('input, select, button'))?.focus();
      highlight(element);
    }, 50);
  };

  const openRow = draft?.rows.find((row) => row.row_id === openRowId) ?? null;
  const counts = validation?.counts;
  const canImport = validated && !!validation?.valid && busy === null;
  const program = programs.find((candidate) => candidate.id === draft?.metadata.program_id) ?? null;
  const currentIndex = step === 'done' ? ORDER.length : ORDER.indexOf(step);
  const completed = new Set(ORDER.filter((_, index) => draft !== null && index < currentIndex));
  const unplaced = draft?.rows.filter((row) => !isPlaced(row)).length ?? 0;
  const railTitle = railSelection === 'all' ? 'All courses' : `${YEAR_LABELS[railSelection.year]}, ${TERM_LABELS[railSelection.term]}`;
  const selectedInView = visibleRows.filter((row) => selected.has(row.row_id));
  const allInViewSelected = visibleRows.length > 0 && selectedInView.length === visibleRows.length;
  // Changing what is visible drops the status filter and any selection, so no hidden row is edited in bulk.
  const changeView = () => {
    setStatusFilter('all');
    setSelected(new Set());
  };
  const filterStatus = (filter: StatusFilter) => {
    setStatusFilter(filter);
    setSelected(new Set());
  };
  const goTo = (next: WorkStep) => {
    setSelected(new Set());
    setTableEditing(false);
    setStep(next);
    setSubmitError(null);
  };

  // Stable, because the edit table rebuilds (and remounts) its cells whenever its onChange changes, which would drop focus.
  const changeRow = updateRow;

  const courseCodes = new Map((draft?.rows ?? []).map((row) => [row.row_id, row.code.trim() || row.row_id]));
  const documentNotes = draft && draft.notes.length > 0 && (
    <SourceNotes
      className="mt-4"
      title="Notes from the curriculum document"
      notes={draft.notes.map((note) => ({ ...note, label: noteScopeLabel(note.scope, note.scope.level === 'course' ? courseCodes.get(note.scope.row_id) : null) }))}
    />
  );

  const proposedCode = draft ? proposedImportCode(draft.metadata) : null;
  const cmoPartial = !!draft && !draft.metadata.cmo_number.trim() !== !draft.metadata.cmo_series.trim();
  const codeText = validated ? validation!.metadata.code : proposedCode ?? 'Assigned automatically';
  const codeHint = validated
    ? 'Confirmed by the last check. The import assigns it again and adds a suffix if it was taken meanwhile.'
    : proposedCode
      ? 'Proposed from the CMO. Validate to confirm; a suffix such as -2 is added when the code is taken.'
      : cmoPartial
        ? 'Enter both the CMO number and the series, or clear both.'
        : 'No CMO is given, so the program and effective year name the code.';
  const metadataFields: MetadataField[] = ['name', 'program_id', 'effective_school_year', 'cmo_number', 'cmo_series'];
  const asMetadataField = (field: string | null | undefined): MetadataField | null => {
    const name = field?.startsWith('metadata.') ? field.slice('metadata.'.length) : null;
    return name && (metadataFields as string[]).includes(name) ? name as MetadataField : null;
  };
  // Local problems always count; server errors only while the last check is current.
  const metadataIssues: MetadataIssue[] = [
    ...problems.filter((problem) => problem.row_id === null).map((problem) => ({ field: asMetadataField(problem.field), message: problem.message })),
    ...(stale ? [] : validation?.issues ?? []).filter((issue) => issue.severity === 'error').map((issue) => ({ field: asMetadataField(issue.field), message: issue.message })),
  ].filter((issue): issue is MetadataIssue => issue.field !== null);
  const metadataNeedsFix = metadataIssues.length > 0;
  const openDetails = (focus: MetadataField | null = null) => {
    setDetails({ open: true, focus });
    setDetailsReviewed(true);
  };

  // Counts for the Validation results entry point. Local problems block sending, so they never coexist with
  // current server results; the key check still guards against counting one finding twice. Notices are facts
  // for the review, never pending tasks.
  const localKeys = new Set(problems.map((problem) => `${problem.row_id}:${problem.field}`));
  const freshIssues = validation && !stale ? validation.issues : [];
  const errorCount = problems.length + freshIssues.filter((issue) => issue.severity === 'error' && !localKeys.has(`${issue.row_id}:${issue.field}`)).length;
  const noticeCount = freshIssues.filter((issue) => issue.severity === 'notice').length;
  const lastCheck = validation && stale
    ? { errors: validation.issues.filter((issue) => issue.severity === 'error').length, notices: validation.issues.filter((issue) => issue.severity === 'notice').length }
    : null;
  const issueState = !validation ? 'unchecked' : stale ? 'stale' : errorCount > 0 ? 'blocked' : 'ready';
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const issuesStatus = {
    unchecked: problems.length > 0 ? 'Not validated. The draft problems below were found in your browser.' : 'Not validated yet.',
    stale: 'Changed since the last check. Server results below are from that check.',
    blocked: 'Results of the latest check of the whole draft. Errors block the import until corrected.',
    ready: 'Validated: nothing blocks the import. Notices are shown in the review.',
  }[issueState];
  const lastCheckText = lastCheck && lastCheck.errors + lastCheck.notices > 0
    ? `last check: ${[lastCheck.errors ? plural(lastCheck.errors, 'error') : null, lastCheck.notices ? plural(lastCheck.notices, 'notice') : null].filter(Boolean).join(', ')}`
    : null;

  const issueAction = (issue: { key: string; code: string; row_id: string | null; field: string | null }): IssueAction | null => {
    if (issue.row_id) {
      const control = issueControl(issue.code, issue.field);
      return { label: 'Show course', onClick: () => { setIssuesOpen(false); focusRow(issue.row_id!, control ? 'configure' : 'review', control); } };
    }
    const field = asMetadataField(issue.field);
    if (field) return { label: 'Open curriculum details', onClick: () => { setIssuesOpen(false); openDetails(field); } };
    const group = issue.key.match(/:(\d)-(\d)$/);
    if (group && isPlaced({ year_level: Number(group[1]), semester: Number(group[2]) as PlacementTerm })) {
      const year = Number(group[1]);
      const term = Number(group[2]) as PlacementTerm;
      return {
        label: 'Show term',
        onClick: () => {
          setIssuesOpen(false);
          changeView();
          setTableEditing(false);
          setStep((current) => (current === 'import' ? 'review' : current));
          window.setTimeout(() => showTerm(termSectionId(year, term)), 50);
        },
      };
    }
    return null;
  };

  const validationStatus = !validation
    ? 'Not validated yet'
    : stale
      ? 'Changed since the last check'
      : validation.valid
        ? 'Ready to import'
        : counts?.errors ? `${counts.errors} error${counts.errors === 1 ? '' : 's'} to correct` : 'Ready to review';

  const importBlocker = canImport || busy !== null ? null
    : problems.length > 0 ? `Import is blocked: ${plural(problems.length, 'draft problem')} to fix.`
      : !validation ? 'Import is blocked: validate the draft first.'
        : stale ? 'Import is blocked: the draft changed, validate again.'
          : `Import is blocked: ${plural(errorCount, 'error')} to correct.`;

  const issueBadges = (onDark: boolean) => (
    <>
      {errorCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${onDark ? 'bg-red-50 text-red-800' : 'bg-red-50 text-red-700 ring-1 ring-red-200'}`}>{plural(errorCount, 'error')}</span>}
      {noticeCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${onDark ? 'bg-[#C9952A] text-[#36060b]' : 'bg-accent/15 text-[#7a5410]'}`}>{plural(noticeCount, 'notice')}</span>}
      {issueState === 'unchecked' && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${onDark ? 'bg-white/15 text-white' : 'text-muted'}`}>{errorCount > 0 ? 'found in your browser, not validated' : 'Not validated'}</span>}
      {issueState === 'stale' && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${onDark ? 'bg-white/15 text-white' : 'text-muted'}`}>Changed since last check</span>}
      {issueState === 'ready' && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${onDark ? 'bg-emerald-50 text-emerald-800' : 'text-emerald-800'}`}>Ready to review</span>}
    </>
  );
  // The badges' text runs together for screen readers, so the buttons carry a spoken summary.
  const issuesLabel = `Validation results: ${[
    errorCount > 0 ? plural(errorCount, 'error') : null,
    noticeCount > 0 ? plural(noticeCount, 'notice') : null,
    issueState === 'unchecked' ? 'not validated' : null,
    issueState === 'stale' ? `changed since last check${lastCheckText ? ` (${lastCheckText})` : ''}` : null,
    issueState === 'ready' ? 'ready to review' : null,
  ].filter(Boolean).join(', ')}`;
  const issuesControl = draft && (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" onClick={() => setIssuesOpen(true)} aria-label={issuesLabel} className={secondaryButton}>
        <ListChecks size={15} aria-hidden="true" /> Validation results
      </button>
      <span className="flex flex-wrap items-center gap-1.5 text-[13px]" data-testid="issue-counts">{issueBadges(false)}</span>
    </div>
  );
  // Step 4's entry point sits in its gradient heading.
  const issuesHeaderButton = draft && (
    <button type="button" onClick={() => setIssuesOpen(true)} aria-label={issuesLabel} className={`${headerButton} h-auto min-h-9 shrink-0 flex-wrap py-1.5`}>
      <ListChecks size={15} aria-hidden="true" /> Validation results
      <span className="flex flex-wrap items-center gap-1" data-testid="issue-badges">{issueBadges(true)}</span>
    </button>
  );

  const stepHeaderClass = `-mx-4 -mt-5 rounded-t-[11px] px-4 py-3 sm:-mx-6 sm:px-6 ${IMPORT_HEADER_GRADIENT}`;
  const detailsBar = draft && (
    <div className="mt-4 rounded-xl border border-border bg-parchment/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" onClick={() => openDetails()} className={secondaryButton}>
            <FileText size={15} aria-hidden="true" /> Curriculum details
            {(metadataNeedsFix || !detailsReviewed) && (
              <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] font-black leading-none text-white ${metadataNeedsFix ? 'bg-red-600' : 'bg-[#C9952A]'}`}>
                <span aria-hidden="true">!</span>
                <span className="sr-only">{metadataNeedsFix ? ', needs correction' : ', not reviewed yet'}</span>
              </span>
            )}
          </button>
          {metadataNeedsFix && (
            <button type="button" onClick={() => openDetails(metadataIssues[0].field)} className="inline-flex h-7 items-center gap-1 rounded-full bg-red-50 px-2.5 text-xs font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <AlertOctagon size={13} aria-hidden="true" /> Needs correction
            </button>
          )}
        </div>
        {issuesControl}
        <dl className="flex min-w-0 basis-full flex-wrap gap-x-5 gap-y-1 text-[13px]">
          <div className="flex min-w-0 gap-1.5"><dt className="text-muted">Program</dt><dd className="truncate font-semibold text-text">{program ? programLabel(program) : 'All programs in the department'}</dd></div>
          <div className="flex gap-1.5"><dt className="text-muted">School year</dt><dd className="font-semibold tabular-nums text-text">{draft.metadata.effective_school_year.trim() || '—'}</dd></div>
          <div className="flex items-center gap-1.5"><dt className="text-muted">Code</dt><dd className="font-semibold text-text">{codeText}{!validated && proposedCode && <span className="ml-1.5 rounded bg-accent/15 px-1.5 text-[11px] font-bold text-[#7a5410]">Proposed</span>}</dd></div>
        </dl>
      </div>
      {metadataNeedsFix && (
        <ul className="mt-2 space-y-1 border-t border-border pt-2 text-[13px]">
          {metadataIssues.map((issue) => (
            <li key={`${issue.field}:${issue.message}`} className="flex flex-wrap items-center gap-x-3">
              <span className="text-red-800">{issue.message}</span>
              <button type="button" onClick={() => openDetails(issue.field)} className="text-xs font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Fix</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // Status for the actions in the heading, directly under them, so a check's outcome shows where it was started.
  const statusStrip = (content: ReactNode) => (
    <>
      <div className="-mx-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-parchment/40 px-4 py-2 text-[13px] sm:-mx-6 sm:px-6" role="status">{content}</div>
      {submitError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{submitError}</p>}
    </>
  );
  const stepActions = (actions: ReactNode) => <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>;

  const validateButton = (
    <button type="button" onClick={() => void runValidation()} disabled={busy !== null} className={headerButton}>
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
        <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 ${step === 'done' ? 'rounded-[11px]' : 'rounded-t-[11px]'} ${IMPORT_HEADER_GRADIENT}`}>
          <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
            <Link to={curriculumBase} className={`${headerControl} w-9 shrink-0`} aria-label="Back to curriculum list"><ArrowLeft size={16} /></Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold text-white">Import curriculum</h1>
              <p className="truncate text-[13px] text-amber-50/85" title={file?.name}>{file ? file.name : 'Creates a new deactivated curriculum from a reviewed document'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {settings && (
              <button type="button" onClick={() => setSettingsOpen(true)} className={headerButton}>
                <Settings2 size={15} aria-hidden="true" /> Import settings
              </button>
            )}
            {draft && step !== 'done' && <button type="button" onClick={() => void discardDraft()} className={headerButton}>Discard draft</button>}
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
        <div className={step === 'import' ? 'grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17.5rem_minmax(0,1fr)]' : ''}>
          {step === 'import' && (
          <div className="lg:sticky lg:top-4">
            <button type="button" onClick={() => setRailOpen((open) => !open)} aria-expanded={railOpen} aria-controls="import-term-rail" className={`${quietButton} w-full justify-between lg:hidden`}>
              <span>Terms: {railTitle}</span>
              <span className="text-muted">{railOpen ? 'Hide' : 'Show'}</span>
            </button>
            <div id="import-term-rail" className={`${railOpen ? 'mt-2 block' : 'hidden'} lg:mt-0 lg:block`}>
            <ImportTermRail
              totals={totals}
              rowCount={draft.rows.length}
              unplacedCount={unplaced}
              errorsByGroup={errorsByGroup}
              selection={railSelection}
              onSelect={(selection) => {
                setRailOpen(false);
                setRailSelection(selection);
                goTo('review');
                if (selection !== 'all') window.setTimeout(() => showTerm(termSectionId(selection.year, selection.term)), 50);
              }}
            />
            </div>
          </div>
          )}

          <section aria-labelledby="step-heading" className="min-w-0 rounded-xl border border-border bg-white px-4 pb-6 pt-5 sm:px-6">
            {step === 'review' && (
              <>
                {/* The sheet is long, so each step's actions sit in its heading rather than below every term. */}
                <div className={`${stepHeaderClass} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
                  <div className="min-w-0 flex-1 basis-72">
                    <h2 id="step-heading" className="text-lg font-semibold text-white">Preview the extracted curriculum</h2>
                    <p className="mt-0.5 text-[13px] text-amber-50/85">Check what was read from the document. Open a course to correct it, or use Edit table in Configure. The original values stay on record next to your corrections.</p>
                  </div>
                  {stepActions(
                    <button type="button" onClick={() => goTo('configure')} className={headerPrimary}>
                      Continue to Configure <ArrowRight size={15} aria-hidden="true" />
                    </button>,
                  )}
                </div>
                {statusStrip(statusLine)}

                {detailsBar}
                {(draft.warnings.length > 0 || draft.unread.length > 0) && (
                  <ul className="mt-3 list-disc rounded-lg border border-accent/40 bg-accent/[0.07] py-2 pl-8 pr-3 text-[13px] text-text">
                    {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                    {draft.unread.map((region, index) => (
                      <li key={`unread-${index}`}>
                        {region.page ? `Page ${region.page}: ` : ''}
                        {region.reason === 'image'
                          ? 'an image in the course area was not read. Check it, then answer it in Curriculum details.'
                          : `text was not recognised as a course or note: "${region.text ?? ''}". Check it, then answer it in Curriculum details.`}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {step === 'configure' && (
              <>
                <div className={`${stepHeaderClass} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
                  <div className="min-w-0 flex-1 basis-72">
                    <h2 id="step-heading" className="text-lg font-semibold text-white">Configure categories and class time</h2>
                    <p className="mt-0.5 text-[13px] text-amber-50/85">Department rules suggest Major or Minor. Override a row only when the rule is wrong for it; you will be asked why.</p>
                  </div>
                  {stepActions(
                    <>
                      <button type="button" onClick={() => goTo('review')} className={headerButton}>Back</button>
                      {validateButton}
                      <button type="button" onClick={() => goTo('import')} className={headerPrimary}>
                        Continue to Import <ArrowRight size={15} aria-hidden="true" />
                      </button>
                    </>,
                  )}
                </div>
                {statusStrip(statusLine)}
                {detailsBar}
              </>
            )}

            {(step === 'review' || step === 'configure') && (
              <>
                {documentNotes}
                {step === 'review' ? (
                  <ImportCurriculumSheet
                    className="mt-4"
                    rows={draft.rows}
                    totals={totals}
                    attention={attention}
                    renderTerm={(term) => (
                      <ImportPreviewTermTable headingId={term.headingId} rows={term.rows} group={term.group} showPlacement={term.unassigned} issuesByRow={visibleIssues} onOpenRow={setOpenRowId} />
                    )}
                  />
                ) : (
                  <>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
                        {(['all', 'needs_category', 'invalid', 'override', 'rule', 'manual', 'unchecked'] as StatusFilter[]).map((filter) => {
                          const count = filter === 'all' ? draft.rows.length : statusCounts.get(filter) ?? 0;
                          if (filter !== 'all' && count === 0 && statusFilter !== filter) return null;
                          const active = statusFilter === filter;
                          return (
                            <button key={filter} type="button" aria-pressed={active} onClick={() => filterStatus(filter)} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${active ? 'border-primary bg-primary text-white' : 'border-border bg-white text-text hover:border-primary/50'}`}>
                              {filter === 'all' ? 'All' : CONFIGURE_STATUS_LABELS[filter]}
                              <span className={`tabular-nums ${active ? 'text-white/80' : 'text-muted'}`}>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => { setTableEditing((value) => !value); setSelected(new Set()); }} aria-pressed={tableEditing} className={tableEditing ? primaryButton : secondaryButton}>
                        {tableEditing ? <><Check size={15} aria-hidden="true" /> Done editing</> : <><Pencil size={14} aria-hidden="true" /> Edit table</>}
                      </button>
                    </div>
                    <ImportCurriculumSheet
                      className="mt-3"
                      rows={draft.rows}
                      totals={totals}
                      attention={attention}
                      isVisible={statusFilter === 'all' ? undefined : (row) => statusOf(row) === statusFilter}
                      // Inline editing needs the full width, so each term takes its own line.
                      stacked={tableEditing}
                      stickyActions={!tableEditing && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                          <input
                            type="checkbox"
                            aria-label="Select all courses in this view"
                            checked={allInViewSelected}
                            ref={(element) => { if (element) element.indeterminate = selectedInView.length > 0 && !allInViewSelected; }}
                            onChange={(event) => toggleSelected(visibleRows.map((row) => row.row_id), event.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                          {selectedInView.length === 0 ? (
                            <span className="text-xs text-muted">Select courses to set their category together.</span>
                          ) : (
                            <>
                              <span className="font-bold text-text">{selectedInView.length} selected</span>
                              <span className="text-xs text-muted">Set category:</span>
                              {(['major', 'minor'] as const).map((category) => (
                                <button key={category} type="button" onClick={() => setCategoryFor(new Set(selectedInView.map((row) => row.row_id)), category)} className="h-7 rounded-md border border-primary bg-white px-2.5 text-xs font-bold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{category === 'major' ? 'Major' : 'Minor'}</button>
                              ))}
                              <button type="button" onClick={() => setCategoryFor(new Set(selectedInView.map((row) => row.row_id)), null)} className="h-7 rounded-md border border-border bg-white px-2.5 text-xs font-bold text-text hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Use rule</button>
                              <button type="button" onClick={() => toggleSelected(selectedInView.map((row) => row.row_id), false)} className="h-7 rounded-md px-2 text-xs font-bold text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Clear selection</button>
                            </>
                          )}
                        </div>
                      )}
                      renderTermActions={tableEditing ? undefined : (term) => {
                        const ids = term.rows.map((row) => row.row_id);
                        const count = ids.filter((id) => selected.has(id)).length;
                        return ids.length > 0 && (
                          <input
                            type="checkbox"
                            aria-label={`Select all courses in ${term.label}`}
                            checked={count === ids.length}
                            ref={(element) => { if (element) element.indeterminate = count > 0 && count < ids.length; }}
                            onChange={(event) => toggleSelected(ids, event.target.checked)}
                            className="h-4 w-4 accent-primary"
                          />
                        );
                      }}
                      renderTerm={(term) => (tableEditing ? (
                        <ImportDraftTable editing rows={term.rows} issuesByRow={visibleIssues} onChange={changeRow} onOpenRow={setOpenRowId} ariaLabel={`${term.label}, editable courses`} />
                      ) : (
                        <ImportConfigureTermTable
                          headingId={term.headingId}
                          rows={term.rows}
                          showPlacement={term.unassigned}
                          issuesByRow={visibleIssues}
                          resolved={resolved}
                          validated={validated}
                          settings={settings}
                          selected={selected}
                          onToggleSelected={toggleSelected}
                          onChange={changeRow}
                          onOpenRow={setOpenRowId}
                        />
                      ))}
                    />
                  </>
                )}
              </>
            )}

            {step === 'import' && (
              <>
                <div className={`${stepHeaderClass} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
                  <div className="min-w-0 flex-1 basis-72">
                    <h2 id="step-heading" className="text-lg font-semibold text-white">Review and import</h2>
                    <p className="mt-0.5 text-[13px] text-amber-50/85">An automatic summary of what will be created, from the server's check of the whole draft. Confirm it once to import.</p>
                  </div>
                  {stepActions(
                    <>
                      {issuesHeaderButton}
                      <button type="button" onClick={() => goTo('configure')} className={headerButton}>Back</button>
                      {validateButton}
                      <button type="button" onClick={() => void commit()} disabled={!canImport} aria-describedby={importBlocker ? 'import-blocker' : undefined} className={headerPrimary}>{busy === 'commit' ? 'Importing…' : 'Confirm and import'}</button>
                    </>,
                  )}
                </div>
                {statusStrip(
                  <>
                    <span className="flex items-center gap-1.5 text-muted"><ShieldCheck size={15} aria-hidden="true" /> The curriculum is created deactivated. Activate it afterwards from the curriculum list.</span>
                    {importBlocker && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
                        <span id="import-blocker">{importBlocker}</span>
                        <button type="button" onClick={() => setIssuesOpen(true)} className="whitespace-nowrap font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">View issues</button>
                      </span>
                    )}
                  </>,
                )}

                {validated && validation ? (
                  <div className="mt-5 rounded-xl border border-border bg-parchment/60 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-text">{draft.metadata.name}</p>
                        <p className="text-[13px] text-muted">
                          <span aria-label="Assigned internal code" className="font-semibold text-text">{validation.metadata.code}</span>
                          {' · '}{program ? programLabel(program) : 'All programs in the department'} · {draft.metadata.effective_school_year} · created deactivated
                        </p>
                      </div>
                      <button type="button" onClick={() => setReviewOpen(true)} className={primaryButton}>
                        <List size={15} aria-hidden="true" /> View all courses and summary
                      </button>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px] sm:grid-cols-6">
                      {[
                        { label: 'Courses', value: validation.rows.length, tone: 'text-text' },
                        { label: 'New', value: validation.rows.filter((row) => row.catalog.action === 'create').length, tone: 'text-emerald-800' },
                        { label: 'Reused', value: validation.rows.filter((row) => row.catalog.action === 'reuse').length, tone: 'text-primary' },
                        { label: 'Units', value: validation.totals.calculated.tu, tone: 'text-text' },
                        { label: 'Changes', value: validation.changes.filter((change) => !change.formatting).length, tone: 'text-text' },
                        { label: 'Notices', value: noticeCount, tone: noticeCount ? 'text-[#7a5410]' : 'text-text' },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-lg border border-border bg-white px-3 py-1.5">
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">{stat.label}</dt>
                          <dd className={`text-lg font-bold leading-tight tabular-nums ${stat.tone}`}>{stat.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : (
                  <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-4 text-[13px] text-muted" role="status">
                    {validation ? 'The draft changed after the last check. Validate again to bring the review up to date.' : 'Validate the whole draft to generate the review.'}
                    {' '}<span aria-label="Check result">{validationStatus}</span>
                  </p>
                )}

                <div className="mt-6"><ImportCreditLedger totals={totals} rowCount={draft.rows.length} /></div>
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
          {result.confirmation && (
            <p className="mt-3 text-[13px] text-muted">
              Confirmed by {result.confirmation.user_name ?? 'you'} on {new Date(result.confirmation.confirmed_at).toLocaleString()}
              {result.changes ? `, with ${result.changes.filter((change) => !change.formatting).length} recorded changes from the document` : ''}.
            </p>
          )}
          {result.acknowledged && Object.keys(result.acknowledged).length > 0 && (
            <details className="mt-4 text-[13px]">
              <summary className="cursor-pointer font-bold text-text">Reasons recorded with this earlier import ({Object.keys(result.acknowledged).length})</summary>
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
        <ImportRowDetailModal row={openRow} issues={stale ? [] : issuesByRow.get(openRow.row_id) ?? []} bytes={bytes} onClose={() => setOpenRowId(null)} onChange={changeRow} />
      )}
      {reviewOpen && draft && validated && validation && step === 'import' && (
        <ImportReviewModal draft={draft} validation={validation} programName={program ? programLabel(program) : 'All programs in the department'} onClose={() => setReviewOpen(false)} />
      )}
      {issuesOpen && draft && (
        <ImportIssuesModal
          status={issuesStatus}
          issues={validation?.issues ?? []}
          localIssues={problems.map((problem) => ({ key: `local:${problem.row_id}:${problem.field}`, message: problem.message, row_id: problem.row_id, field: problem.field }))}
          stale={stale}
          checked={!!validation}
          actionFor={issueAction}
          onClose={() => setIssuesOpen(false)}
        />
      )}
      {details.open && draft && (
        <ImportCurriculumDetailsModal
          metadata={draft.metadata}
          detected={draft.detected}
          programs={programs}
          programLocked={user?.role === 'program_head'}
          code={{ text: codeText, tag: validated ? 'Checked' : proposedCode ? 'Proposed' : null, hint: codeHint }}
          issues={metadataIssues}
          focusField={details.focus}
          onChange={updateMetadata}
          notes={draft.notes}
          courseCodes={courseCodes}
          onNotesChange={updateNotes}
          unread={draft.unread}
          onUnreadChange={updateUnread}
          onClose={() => setDetails({ open: false, focus: null })}
        />
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
