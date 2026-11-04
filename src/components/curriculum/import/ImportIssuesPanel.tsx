import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ImportIssue } from '../../../lib/curriculumImport/types';

/** A problem found in the browser before sending; the server has not checked it. */
export interface LocalIssue {
  key: string;
  message: string;
  row_id: string | null;
  field: string | null;
}

export interface IssueAction {
  label: string;
  onClick: () => void;
}

interface ImportIssuesPanelProps {
  issues: ImportIssue[];
  localIssues?: LocalIssue[];
  stale: boolean;
  /** Whether a server check has run; "No issues found" is only claimed after one. */
  checked: boolean;
  /** Where an issue leads: its course, the curriculum details, or its term. */
  actionFor: (issue: Pick<ImportIssue, 'key' | 'code' | 'row_id' | 'field'>) => IssueAction | null;
}

const actionButton = 'shrink-0 rounded-md border border-border bg-white px-2.5 py-1 text-xs font-bold text-primary hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

const SECTIONS = [
  {
    severity: 'error' as const,
    title: 'Errors to fix',
    hint: 'Correct these in Preview or Configure. The import stays blocked until they are fixed.',
    Icon: AlertOctagon,
    item: 'border-red-200 bg-red-50/60',
    icon: 'text-red-600',
  },
  {
    severity: 'notice' as const,
    title: 'Shown in the review',
    hint: 'Facts about what will be imported. They need no explanation; they appear in the final review and the import record.',
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

export default function ImportIssuesPanel({ issues, localIssues = [], stale, checked, actionFor }: ImportIssuesPanelProps) {
  const renderAction = (issue: Pick<ImportIssue, 'key' | 'code' | 'row_id' | 'field'>) => {
    const action = actionFor(issue);
    return action && <button type="button" onClick={action.onClick} className={actionButton}>{action.label}</button>;
  };

  return (
    <div className="space-y-6">
      {localIssues.length > 0 && (
        <section aria-labelledby="issues-local">
          <h3 id="issues-local" className="mb-2 flex items-center gap-2 font-sans text-sm font-bold text-text">
            <AlertOctagon size={16} className="text-red-600" aria-hidden="true" />
            Draft problems
            <span className="font-normal text-muted tabular-nums">{localIssues.length}</span>
          </h3>
          <p className="mb-2 text-xs text-muted">Found in your browser. Fix these before the server can check the draft; they are not server results.</p>
          <ul className="space-y-2">
            {localIssues.map((issue) => (
              <li key={issue.key} className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2.5">
                <p className="text-[13px] leading-snug text-text">{issue.message}</p>
                {renderAction({ key: issue.key, code: 'local', row_id: issue.row_id, field: issue.field })}
              </li>
            ))}
          </ul>
        </section>
      )}
      {stale && (
        <p className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-[13px] text-[#7a5410]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          The draft changed after the last check. The results below are from that check; validate again to refresh them.
        </p>
      )}
      {SECTIONS.map(({ severity, title, hint, Icon, item, icon }) => {
        const items = issues.filter((issue) => issue.severity === severity);
        if (items.length === 0) return null;
        return (
          <section key={severity} aria-labelledby={`issues-${severity}`}>
            <h3 id={`issues-${severity}`} className="mb-2 flex items-center gap-2 font-sans text-sm font-bold text-text">
              <Icon size={16} className={icon} aria-hidden="true" />
              {title}
              <span className="font-normal text-muted tabular-nums">{items.length}</span>
            </h3>
            <p className="mb-2 text-xs text-muted">{hint}</p>
            <ul className="space-y-2">
              {items.map((issue) => (
                <li key={issue.key} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 ${item}`}>
                  <p className="text-[13px] leading-snug text-text">{issue.message}</p>
                  {renderAction(issue)}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {checked && issues.length === 0 && !stale && localIssues.length === 0 && (
        <p className="flex items-center gap-2 text-[13px] text-emerald-800"><CheckCircle2 size={16} aria-hidden="true" /> No issues found.</p>
      )}
    </div>
  );
}
