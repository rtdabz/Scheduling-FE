import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import Badge from '../../../components/ui/Badge';
import { useModalScrollLock } from '../../../hooks/useModalScrollLock';
import { roleLabel } from '../../../lib/roles';
import {
  actorName, actorRoleLabel, categoryLabel, CATEGORIES, entryLabel, formatExact, humanize, initials, STATUSES, targetLabel,
  type ActivityEntry, type Department, type Semester,
} from './activityLogModel';

/** Metadata keys shown in dedicated sections, so "Additional details" does not repeat them. */
const HANDLED_KEYS = new Set([
  'message', 'reason', 'remarks', 'notes', 'note', 'comment', 'before', 'after', 'changes', 'label', 'target', 'type', 'id',
  'department_name', 'ip_address', 'user_agent', 'legacy_history', 'history_group_id',
]);
const DESCRIPTION_KEYS = ['message', 'reason', 'remarks', 'notes', 'note', 'comment'] as const;

const PROVENANCE: Record<string, string> = {
  recorded: 'Identity recorded when the event happened. Later account changes do not alter it.',
  recorded_subject: 'Identity taken from the account snapshot stored with this legacy self-service event.',
  unavailable: 'This event stored only the account ID. The name and role at the time were not recorded, so none are shown.',
};

const SOURCE_TABLES: Record<ActivityEntry['source'], string> = {
  scheduling: 'Scheduling audit log',
  authentication: 'Account audit log',
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isScalar = (value: unknown) => ['string', 'number', 'boolean'].includes(typeof value);

/** Render a recorded value without inventing one: empty values say so explicitly. */
const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'Empty';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value) && value.every(isScalar)) return value.length ? value.join(', ') : 'Empty';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-gray-100 px-5 py-4 first:border-t-0">
      <h3 className="mb-3 text-[13px] font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[11px] font-medium text-gray-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-gray-900">{children}</dd>
    </div>
  );
}

function ChangeTable({ before, after }: { before: Record<string, unknown>; after: Record<string, unknown> }) {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(key => !key.startsWith('_'));
  const changed = keys.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const rows = changed.length ? changed : keys;
  if (!rows.length) return <p className="text-xs text-gray-500">No field values were recorded.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-xs">
        <thead>
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">Field</th>
            <th scope="col" className="px-3 py-2 font-semibold">Previous</th>
            <th scope="col" className="px-3 py-2 font-semibold">New</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map(key => (
            <tr key={key}>
              <td className="px-3 py-2 font-semibold text-gray-700">{humanize(key)}</td>
              <td className="break-all px-3 py-2 text-gray-500">{formatValue(before[key])}</td>
              <td className="break-all px-3 py-2 font-medium text-gray-900">{formatValue(after[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!changed.length && <p className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500">No field differed between the recorded values.</p>}
    </div>
  );
}

const MAX_CHANGE_ITEMS = 10;

function ChangeList({ changes }: { changes: unknown[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">{changes.length} recorded change{changes.length === 1 ? '' : 's'}</p>
      <ul className="space-y-2">
        {changes.slice(0, MAX_CHANGE_ITEMS).map((change, index) => (
          <li key={index} className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
            {isPlainObject(change) && (isPlainObject(change.before) || isPlainObject(change.after)) ? (
              <>
                {typeof change.change === 'string' && <p className="mb-2 font-semibold capitalize text-gray-800">{change.change}</p>}
                <ChangeTable before={isPlainObject(change.before) ? change.before : {}} after={isPlainObject(change.after) ? change.after : {}} />
              </>
            ) : (
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-gray-700">{JSON.stringify(change, null, 2)}</pre>
            )}
          </li>
        ))}
      </ul>
      {changes.length > MAX_CHANGE_ITEMS && (
        <p className="text-xs text-gray-500">{changes.length - MAX_CHANGE_ITEMS} more in the raw audit record below.</p>
      )}
    </div>
  );
}

interface ActivityDetailDrawerProps {
  entry: ActivityEntry;
  departments: Map<number, Department>;
  semesters: Map<number, Semester>;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position?: string;
}

export default function ActivityDetailDrawer({ entry, departments, semesters, onClose, onPrevious, onNext, position }: ActivityDetailDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  useModalScrollLock(true);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => openerRef.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'Tab' && panelRef.current) {
        const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), summary, a[href], [tabindex="0"]'));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const metadata = entry.metadata ?? {};
  const status = STATUSES[entry.status] ?? STATUSES.completed;
  const descriptions = DESCRIPTION_KEYS
    .map(key => [key, metadata[key]] as const)
    .filter((pair): pair is readonly [typeof DESCRIPTION_KEYS[number], string] => typeof pair[1] === 'string' && pair[1].trim() !== '');
  const decision = isPlainObject(metadata.decision) ? metadata.decision : null;
  const decisionRemarks = decision && typeof decision.remarks === 'string' && decision.remarks.trim() ? decision.remarks : null;

  const before = isPlainObject(metadata.before) ? metadata.before : null;
  const after = isPlainObject(metadata.after) ? metadata.after : null;
  const changes = Array.isArray(metadata.changes) ? metadata.changes : null;
  const statusChange = decision && (typeof decision.before_status === 'string' || typeof decision.after_status === 'string')
    ? { before: decision.before_status, after: decision.after_status } : null;

  const additional = Object.entries(metadata).filter(([key, value]) =>
    !key.startsWith('_') && !HANDLED_KEYS.has(key) && key !== 'decision'
    && (isScalar(value) || (Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(isScalar))));

  const references = isPlainObject(metadata._references)
    ? Object.entries(metadata._references).filter(([, value]) => value !== null && value !== undefined && value !== '')
    : [];

  const recordedDepartment = typeof metadata.department_name === 'string' ? metadata.department_name : null;
  const liveDepartment = entry.department_id ? departments.get(entry.department_id) : undefined;
  const semester = entry.semester_id ? semesters.get(entry.semester_id) : undefined;
  const actorLabel = actorName(entry);
  const provenance = entry.actor?.provenance ?? (entry.actor_type === 'system' ? null : entry.actor ? 'unavailable' : null);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div aria-hidden="true" className="animate-overlayIn absolute inset-0 bg-[#1f060a]/35" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-drawerIn"
      >
        <header className="bg-[#4A0D16] px-5 pb-4 pt-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/70">Activity record</p>
              <h2 id={titleId} className="mt-0.5 font-jakarta text-lg font-bold leading-snug">{entryLabel(entry)}</h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-700">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${CATEGORIES[entry.category]?.dot ?? 'bg-gray-400'}`} />
              {categoryLabel(entry.category)}
            </span>
            <Badge tone={status.tone} dot className="bg-white">{status.label}</Badge>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {(descriptions.length > 0 || decisionRemarks) && (
            <Section title="Description">
              <div className="space-y-2">
                {descriptions.map(([key, text]) => (
                  <p key={key} className="text-sm leading-relaxed text-gray-800">
                    {descriptions.length > 1 && <span className="font-semibold text-gray-600">{humanize(key)}: </span>}
                    {text}
                  </p>
                ))}
                {decisionRemarks && <p className="text-sm leading-relaxed text-gray-800"><span className="font-semibold text-gray-600">Decision remarks: </span>{decisionRemarks}</p>}
              </div>
            </Section>
          )}

          <Section title="When">
            <p className="text-sm font-semibold text-gray-900">{formatExact(entry.occurred_at)}</p>
            <p className="mt-0.5 text-xs text-gray-500">Philippine time · stored as {entry.occurred_at}</p>
          </Section>

          <Section title="Who">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F5E9EA] text-sm font-bold text-[#701522]">
                {entry.actor?.name ? initials(entry.actor.name) : entry.actor_type === 'system' ? 'S' : '?'}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{actorLabel}</p>
                <p className="text-xs text-gray-600">
                  {actorRoleLabel(entry)}
                  {entry.actor?.username && <span className="text-gray-500"> · @{entry.actor.username}</span>}
                  {!entry.actor?.name && entry.actor?.id && <span className="text-gray-500"> · User #{entry.actor.id}</span>}
                </p>
                {provenance && PROVENANCE[provenance] && <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{PROVENANCE[provenance]}</p>}
                {entry.actor_type === 'system' && !entry.actor && <p className="mt-1.5 text-xs text-gray-500">Recorded by an automated system process.</p>}
              </div>
            </div>
          </Section>

          <Section title="Context">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Affected department">
                {recordedDepartment
                  ? recordedDepartment
                  : liveDepartment
                    ? <>{liveDepartment.department_name} <span className="text-xs font-normal text-gray-500">(current name)</span></>
                    : entry.department_id ? `Department #${entry.department_id}` : 'None recorded'}
              </Field>
              <Field label="Academic term">
                {semester ? `${semester.academic_year} ${semester.semester}` : entry.semester_id ? `Term #${entry.semester_id}` : 'Not applicable'}
              </Field>
              <Field label="Related record" wide>{targetLabel(entry)}</Field>
              {decision && entry.actor?.role && typeof decision.event === 'string' && (
                <Field label="Decision recorded as">{humanize(decision.event)} by {roleLabel(entry.actor.role)}</Field>
              )}
            </dl>
          </Section>

          {(before || after || changes || statusChange) && (
            <Section title="Changes">
              <div className="space-y-3">
                {statusChange && <ChangeTable before={{ status: statusChange.before }} after={{ status: statusChange.after }} />}
                {(before || after) && <ChangeTable before={before ?? {}} after={after ?? {}} />}
                {changes && <ChangeList changes={changes} />}
              </div>
            </Section>
          )}

          {additional.length > 0 && (
            <Section title="Additional details">
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {additional.map(([key, value]) => <Field key={key} label={humanize(key)}>{formatValue(value)}</Field>)}
              </dl>
            </Section>
          )}

          <Section title="Audit record">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Entry ID"><span className="font-mono text-xs">{entry.id}</span></Field>
              <Field label="Source">{SOURCE_TABLES[entry.source] ?? humanize(entry.source)}</Field>
              <Field label="Event key"><span className="font-mono text-xs">{entry.event}</span></Field>
              {typeof metadata.history_group_id === 'string' && <Field label="History group"><span className="break-all font-mono text-xs">{metadata.history_group_id}</span></Field>}
              {references.map(([key, value]) => <Field key={key} label={humanize(key)}><span className="font-mono text-xs">{formatValue(value)}</span></Field>)}
              {typeof metadata.ip_address === 'string' && <Field label="IP address"><span className="font-mono text-xs">{metadata.ip_address}</span></Field>}
              {typeof metadata.user_agent === 'string' && <Field label="Device" wide><span className="text-xs text-gray-700">{metadata.user_agent}</span></Field>}
              {metadata.legacy_history === true && <Field label="History snapshot" wide>Recorded before schedule history snapshots were kept</Field>}
            </dl>
            <details className="mt-4 rounded-lg border border-gray-200">
              <summary className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]">
                Raw audit metadata
              </summary>
              <pre className="mx-3 mb-3 max-h-72 overflow-auto rounded-md bg-[#2a070c] p-3 font-mono text-[11px] leading-5 text-[#F5E9EA]">{JSON.stringify(metadata, null, 2)}</pre>
            </details>
          </Section>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-gray-200 bg-[#F7F4F0] px-5 py-3">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onPrevious} disabled={!onPrevious} aria-label="Previous event" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#701522]/40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next event" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#701522]/40">
              <ChevronRight className="h-4 w-4" />
            </button>
            {position && <span className="ml-1 text-xs tabular-nums text-gray-500">{position}</span>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg bg-[#701522] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#4A0D16] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623]">
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
