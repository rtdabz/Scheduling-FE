import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Loader2, RotateCcw, ShieldAlert } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import StatusBadge from './ArchiveStatusBadge';
import api from '../../../lib/api';
import { apiErrorMessage } from '../../../lib/apiError';
import {
  ARCHIVE_TYPE_LABELS,
  formatArchiveDate,
  type ArchiveBlocker,
  type ArchiveDetail,
  type ArchiveRef,
  type RestoreFailure,
  type RestoreResult,
} from './archiveTypes';

type Step = 'details' | 'confirm' | 'result';

/** Render with a `key` per target so each opened record starts from a clean state. */
interface ArchiveRecordDialogProps {
  target: ArchiveRef;
  initialStep?: 'details' | 'confirm';
  onClose: () => void;
  onRestored: (result: RestoreResult) => void;
  /** The record changed elsewhere (for example, restored by another user). */
  onStale: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-500">{title}</h3>
      {children}
    </section>
  );
}

const failureFrom = (error: unknown): RestoreFailure => {
  const data = (error as { response?: { data?: RestoreFailure } } | null)?.response?.data;
  return {
    message: apiErrorMessage(error, 'The record could not be restored. Nothing was changed.'),
    code: data?.code,
    blockers: data?.blockers,
    violations: data?.violations,
  };
};

export default function ArchiveRecordDialog({ target, initialStep = 'details', onClose, onRestored, onStale }: ArchiveRecordDialogProps) {
  // A stack lets the VPAA open an archived parent and come back without losing their place.
  const [stack, setStack] = useState<ArchiveRef[]>([target]);
  const current = stack[stack.length - 1];
  const currentKey = `${current.type}:${current.id}`;
  const [loaded, setLoaded] = useState<{ key: string; detail?: ArchiveDetail; error?: string; notArchived?: boolean } | null>(null);
  const shown = loaded?.key === currentKey ? loaded : null;
  const detail = shown?.detail ?? null;
  const loadError = shown?.error ?? '';
  const notArchived = shown?.notArchived ?? false;
  const [step, setStep] = useState<Step>(initialStep);
  const [restoring, setRestoring] = useState(false);
  const [failure, setFailure] = useState<RestoreFailure | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const request = useRef(0);

  const loadDetail = useCallback(async (ref: ArchiveRef) => {
    const id = ++request.current;
    const key = `${ref.type}:${ref.id}`;
    try {
      const response = await api.get<{ data: ArchiveDetail }>(`/archives/${ref.type}/${ref.id}`);
      if (id === request.current) setLoaded({ key, detail: response.data.data });
    } catch (error) {
      if (id !== request.current) return;
      if ((error as { response?: { data?: { code?: string } } } | null)?.response?.data?.code === 'not_archived') {
        setLoaded({ key, notArchived: true });
        onStale();
      } else {
        setLoaded({ key, error: apiErrorMessage(error, 'The record details could not be loaded.') });
      }
    }
  }, [onStale]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDetail(current), 0);
    return () => window.clearTimeout(timer);
  }, [current, loadDetail]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step, detail?.key]);

  const openRecord = (ref: ArchiveRef) => {
    setFailure(null);
    setStep('details');
    setStack((items) => [...items, ref]);
  };

  const goBack = () => {
    setFailure(null);
    setStep('details');
    setStack((items) => items.slice(0, -1));
  };

  const restore = async () => {
    if (!detail) return;
    setRestoring(true);
    setFailure(null);
    try {
      const response = await api.post<RestoreResult>(`/archives/${detail.type}/${detail.id}/restore`);
      setResult(response.data);
      setStep('result');
      onRestored(response.data);
    } catch (error) {
      setFailure(failureFrom(error));
      setStep('details');
      // Re-check the record so the panel shows the server's current blockers.
      void loadDetail({ type: detail.type, id: detail.id, label: detail.label });
    } finally {
      setRestoring(false);
    }
  };

  const blockers = detail?.restore.blockers ?? [];
  const willRestore = detail ? [
    { type: detail.type, id: detail.id, label: detail.label, relation: 'Selected record' },
    ...detail.linked.filter((item) => item.restores),
  ] : [];
  const title = step === 'result' ? 'Restore complete' : step === 'confirm' ? 'Confirm restore' : (detail?.label ?? current?.label ?? 'Archived record');

  const footer = step === 'result' ? (
    <button type="button" data-autofocus onClick={onClose} className="rounded-lg bg-[#5A1220] px-4 py-2 text-xs font-bold text-white hover:bg-[#47101a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] focus-visible:ring-offset-2">Done</button>
  ) : step === 'confirm' ? (
    <>
      <button type="button" onClick={() => setStep('details')} disabled={restoring} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220] disabled:opacity-50">Back to details</button>
      <button type="button" onClick={() => void restore()} disabled={restoring || !detail || blockers.length > 0} className="inline-flex items-center gap-1.5 rounded-lg bg-[#5A1220] px-4 py-2 text-xs font-bold text-white hover:bg-[#47101a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] focus-visible:ring-offset-2 disabled:opacity-50">
        {restoring ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={14} aria-hidden="true" />}
        {restoring ? 'Restoring…' : willRestore.length > 1 ? `Restore ${willRestore.length} records` : 'Restore record'}
      </button>
    </>
  ) : (
    <>
      <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]">Close</button>
      {detail && (
        <button type="button" onClick={() => { setFailure(null); setStep('confirm'); }} disabled={blockers.length > 0} aria-describedby={blockers.length > 0 ? 'archive-restore-blocked-note' : undefined} className="inline-flex items-center gap-1.5 rounded-lg bg-[#5A1220] px-4 py-2 text-xs font-bold text-white hover:bg-[#47101a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
          <RotateCcw size={14} aria-hidden="true" /> Review restore
        </button>
      )}
    </>
  );

  return (
    <Modal isOpen onClose={onClose} title={title} description={detail ? `${detail.type_label}${detail.subtitle ? ` · ${detail.subtitle}` : ''}` : undefined} size="lg" footer={footer} closeOnOverlayClick={!restoring} closeOnEscape={!restoring}>
      <div className="space-y-3 p-4 text-sm sm:p-5">
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">{title}</h2>
        {stack.length > 1 && step === 'details' && (
          <button type="button" onClick={goBack} className="inline-flex items-center gap-1 rounded text-xs font-bold text-[#5A1220] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]">
            <ArrowLeft size={14} aria-hidden="true" /> Back to {stack[stack.length - 2].label}
          </button>
        )}

        {notArchived && (
          <div role="status" className="flex gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-900">
            <Info size={16} className="shrink-0" aria-hidden="true" />
            This record is no longer archived. It may have been restored by another user; the archive list has been refreshed.
          </div>
        )}
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">
            <AlertTriangle size={16} aria-hidden="true" /> <span className="flex-1">{loadError}</span>
            <button type="button" onClick={() => void loadDetail(current)} className="rounded border border-red-300 bg-white px-2 py-1 font-bold">Try again</button>
          </div>
        )}
        {!detail && !loadError && !notArchived && (
          <p role="status" className="flex items-center gap-2 py-8 text-xs font-semibold text-gray-500"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Checking the record’s current restore conditions…</p>
        )}

        {failure && <FailurePanel failure={failure} onOpen={openRecord} />}

        {detail && step === 'details' && (
          <>
            <RestoreCheck detail={detail} onOpen={openRecord} />
            <Section title="What restoring does">
              <ul className="list-disc space-y-1 pl-5 text-gray-700">
                {detail.outcome.map((line) => <li key={line}>{line}</li>)}
              </ul>
              {detail.linked.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold text-gray-600">Linked records</p>
                  <ul className="mt-1 space-y-1">
                    {detail.linked.map((item) => (
                      <li key={`${item.type}:${item.id}`} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="font-semibold text-gray-900">{item.label}</span>
                        <span className="text-gray-500">{item.relation}</span>
                        {detail.type === 'buildings' && item.archived && (
                          <button type="button" onClick={() => openRecord(item)} className="rounded font-bold text-[#5A1220] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]">
                            Restore this room only
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail.archived_dependents && Object.keys(detail.archived_dependents).length > 0 && (
                <p className="mt-3 text-xs text-gray-600">
                  Still archived and not restored by this action: {Object.entries(detail.archived_dependents).map(([type, count]) => `${count} ${ARCHIVE_TYPE_LABELS[type as keyof typeof ARCHIVE_TYPE_LABELS]?.toLowerCase() ?? type}`).join(', ')}.
                </p>
              )}
            </Section>
            <div className="grid gap-3 md:grid-cols-2">
              <Section title="Record">
                <dl className="space-y-1.5 text-xs">
                  <div className="flex flex-wrap justify-between gap-2"><dt className="text-gray-500">Retained status</dt><dd>{detail.status ? <StatusBadge status={detail.status} /> : <span className="text-gray-500">Not tracked</span>}</dd></div>
                  {detail.identity.map((field) => (
                    <div key={field.label} className="flex flex-wrap justify-between gap-2"><dt className="text-gray-500">{field.label}</dt><dd className="break-all text-right font-semibold text-gray-900">{field.label === 'Last sign-in' && field.value !== 'Never recorded' ? formatArchiveDate(field.value) : field.value}</dd></div>
                  ))}
                  {detail.context.department && <div className="flex flex-wrap justify-between gap-2"><dt className="text-gray-500">Department</dt><dd className="text-right font-semibold text-gray-900">{detail.context.department.code} — {detail.context.department.name}{detail.context.department.archived ? ' (archived)' : ''}</dd></div>}
                  {detail.context.program && <div className="flex flex-wrap justify-between gap-2"><dt className="text-gray-500">Program</dt><dd className="text-right font-semibold text-gray-900">{detail.context.program.code}{detail.context.program.archived ? ' (archived)' : ''}</dd></div>}
                  {detail.context.term && <div className="flex flex-wrap justify-between gap-2"><dt className="text-gray-500">Term</dt><dd className="text-right font-semibold text-gray-900">{detail.context.term.label}{detail.context.term.active ? ' (active)' : ''}{detail.context.term.archived ? ' (archived)' : ''}</dd></div>}
                </dl>
              </Section>
              <Section title="Archive provenance">
                <dl className="space-y-1.5 text-xs">
                  <div className="flex flex-wrap justify-between gap-2"><dt className="text-gray-500">Archived</dt><dd className="font-semibold text-gray-900">{formatArchiveDate(detail.provenance.archived_at)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-2"><dt className="text-gray-500">Archived by</dt><dd className="text-right font-semibold text-gray-900">{detail.provenance.actor ? `${detail.provenance.actor.name} (@${detail.provenance.actor.username})` : 'Not recorded'}</dd></div>
                  <div className="flex flex-wrap justify-between gap-2"><dt className="text-gray-500">Reason</dt><dd className="font-semibold text-gray-900">{detail.provenance.reason ?? 'Not recorded'}</dd></div>
                </dl>
                <p className="mt-2 text-[11px] text-gray-500">
                  {detail.provenance.recorded
                    ? detail.provenance.note ?? 'Taken from the audit entry written when it was archived.'
                    : 'No audit entry was written when this record was archived, so who archived it is unknown.'}
                </p>
              </Section>
            </div>
          </>
        )}

        {detail && step === 'confirm' && (
          <>
            <p className="text-gray-800">You are about to restore {willRestore.length === 1 ? 'this record' : `these ${willRestore.length} records`}:</p>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {willRestore.map((item) => (
                <li key={`${item.type}:${item.id}`} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-xs">
                  <span className="font-semibold text-gray-900">{item.label}</span>
                  <span className="text-gray-500">{item.relation}</span>
                </li>
              ))}
            </ul>
            <Section title="Expected result">
              <ul className="list-disc space-y-1 pl-5 text-gray-700">
                {detail.outcome.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </Section>
            {detail.restore.state === 'validation' && (
              <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                <Info size={16} className="shrink-0" aria-hidden="true" />
                Current scheduling rules and timetable conflicts are checked when you confirm. If any check fails, nothing is restored and every violation is listed.
              </p>
            )}
          </>
        )}

        {step === 'result' && result && (
          <div role="status" className="space-y-3">
            <p className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
              {result.already_restored ? <Info size={18} className="shrink-0" aria-hidden="true" /> : <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" />}
              {result.message}
            </p>
            {result.restored.length > 0 && (
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                {result.restored.map((item) => (
                  <li key={`${item.type}:${item.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span><span className="font-semibold text-gray-900">{item.label}</span> <span className="text-gray-500">· {ARCHIVE_TYPE_LABELS[item.type]}</span></span>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function BlockerAction({ blocker, onOpen }: { blocker: ArchiveBlocker; onOpen: (ref: ArchiveRef) => void }) {
  if (!blocker.record) return null;
  if (blocker.record.archived) {
    return (
      <button type="button" onClick={() => onOpen(blocker.record as ArchiveRef)} className="mt-1 inline-flex rounded text-xs font-bold text-[#5A1220] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]">
        View archived {ARCHIVE_TYPE_LABELS[blocker.record.type]?.toLowerCase().replace(/s$/, '') ?? 'record'}: {blocker.record.label}
      </button>
    );
  }
  return blocker.record.type === 'users'
    ? <Link to="/users" className="mt-1 inline-flex rounded text-xs font-bold text-[#5A1220] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5A1220]">Open Users to review {blocker.record.label}</Link>
    : null;
}

function RestoreCheck({ detail, onOpen }: { detail: ArchiveDetail; onOpen: (ref: ArchiveRef) => void }) {
  const { blockers, state } = detail.restore;
  if (blockers.length > 0) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-4" aria-labelledby="archive-restore-blocked-note">
        <h3 id="archive-restore-blocked-note" className="flex items-center gap-1.5 text-xs font-extrabold text-red-800"><ShieldAlert size={15} aria-hidden="true" /> Cannot be restored yet — resolve {blockers.length === 1 ? 'this issue' : `these ${blockers.length} issues`} first</h3>
        <ul className="mt-2 space-y-2">
          {blockers.map((blocker) => (
            <li key={`${blocker.code}:${blocker.message}`} className="text-xs text-red-900">
              <p>{blocker.message}</p>
              <BlockerAction blocker={blocker} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return state === 'validation' ? (
    <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900"><Info size={16} className="shrink-0" aria-hidden="true" /> No known blockers. Scheduling rules and conflicts are checked when the restore is submitted.</p>
  ) : (
    <p className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900"><CheckCircle2 size={16} className="shrink-0" aria-hidden="true" /> No known blockers. Conditions are checked again when you confirm.</p>
  );
}

function FailurePanel({ failure, onOpen }: { failure: RestoreFailure; onOpen: (ref: ArchiveRef) => void }) {
  return (
    <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
      <p className="flex items-start gap-1.5 font-bold"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {failure.message}</p>
      {failure.blockers && failure.blockers.length > 0 && (
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          {failure.blockers.map((blocker) => <li key={`${blocker.code}:${blocker.message}`}>{blocker.message} <BlockerAction blocker={blocker} onOpen={onOpen} /></li>)}
        </ul>
      )}
      {failure.violations && failure.violations.length > 0 && (
        <>
          <p className="mt-2 font-semibold">{failure.violations.length} scheduling {failure.violations.length === 1 ? 'violation' : 'violations'}:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {failure.violations.map((violation, index) => <li key={`${violation.rule ?? 'rule'}:${index}`}>{violation.message}</li>)}
          </ul>
          <p className="mt-2">Move or remove the clashing classes in the scheduler, or restore the missing prerequisites, then try again. Nothing was restored.</p>
        </>
      )}
    </section>
  );
}
