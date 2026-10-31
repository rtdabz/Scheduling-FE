import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ImportIssue } from '../../../lib/curriculumImport/types';

interface ImportIssuesPanelProps {
  issues: ImportIssue[];
  acknowledgements: Record<string, string>;
  stale: boolean;
  onAcknowledge: (key: string, reason: string) => void;
  onFocusRow: (rowId: string) => void;
}

const SECTIONS = [
  {
    severity: 'error' as const,
    title: 'Errors to fix',
    hint: 'Correct these in Preview or Configure. They cannot be accepted with a reason.',
    Icon: AlertOctagon,
    item: 'border-red-200 bg-red-50/60',
    icon: 'text-red-600',
  },
  {
    severity: 'review' as const,
    title: 'Reviews to accept',
    hint: 'Each needs a reason of at least 3 characters. Reasons are saved with the import.',
    Icon: AlertTriangle,
    item: 'border-accent/40 bg-accent/[0.07]',
    icon: 'text-accent',
  },
  {
    severity: 'warning' as const,
    title: 'For your information',
    hint: 'These do not block the import.',
    Icon: Info,
    item: 'border-border bg-parchment',
    icon: 'text-muted',
  },
];

export default function ImportIssuesPanel({ issues, acknowledgements, stale, onAcknowledge, onFocusRow }: ImportIssuesPanelProps) {
  return (
    <div className="space-y-6" aria-live="polite">
      {stale && (
        <p className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-[13px] text-[#7a5410]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          The draft changed after the last check. Validate again to refresh these results.
        </p>
      )}
      {SECTIONS.map(({ severity, title, hint, Icon, item, icon }) => {
        const items = issues.filter((issue) => issue.severity === severity);
        if (items.length === 0) return null;
        const accepted = severity === 'review' ? items.filter((issue) => (acknowledgements[issue.key] ?? '').trim().length >= 3).length : 0;
        return (
          <section key={severity} aria-labelledby={`issues-${severity}`}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`issues-${severity}`} className="flex items-center gap-2 font-sans text-sm font-bold text-text">
                <Icon size={16} className={icon} aria-hidden="true" />
                {title}
                <span className="font-normal text-muted tabular-nums">{items.length}</span>
              </h3>
              {severity === 'review' && <span className="text-xs text-muted tabular-nums">{accepted} of {items.length} have a reason</span>}
            </div>
            <p className="mb-2 text-xs text-muted">{hint}</p>
            <ul className="space-y-2">
              {items.map((issue) => {
                const reason = acknowledgements[issue.key] ?? '';
                const done = reason.trim().length >= 3;
                return (
                  <li key={issue.key} className={`rounded-lg border px-3 py-2.5 ${item}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13px] leading-snug text-text">{issue.message}</p>
                      {issue.row_id && (
                        <button type="button" onClick={() => onFocusRow(issue.row_id!)} className="shrink-0 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-bold text-primary hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                          Show course
                        </button>
                      )}
                    </div>
                    {severity === 'review' && (
                      <label className="mt-2 flex items-center gap-2">
                        <span className="sr-only">Reason for accepting: {issue.message}</span>
                        <input
                          type="text"
                          value={reason}
                          maxLength={500}
                          onChange={(event) => onAcknowledge(issue.key, event.target.value)}
                          placeholder="Reason, for example: confirmed with the registrar's signed copy"
                          className={`h-8 w-full rounded-md border bg-white px-2.5 text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-primary/20 ${done ? 'border-emerald-300' : 'border-accent/50'}`}
                        />
                        {done && <CheckCircle2 size={16} className="shrink-0 text-emerald-700" aria-label="Reason recorded" />}
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {issues.length === 0 && !stale && (
        <p className="flex items-center gap-2 text-[13px] text-emerald-800"><CheckCircle2 size={16} aria-hidden="true" /> No issues found.</p>
      )}
    </div>
  );
}
