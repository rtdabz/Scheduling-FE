import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardX } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import { conflictRuleLabel, ruleIssueLabel } from '../../lib/conflicts';
import { usePreApprovalCheck, type PreApprovalCheckState } from './usePreApprovalCheck';

interface PreApprovalCheckProps {
  departmentId: number;
  sectionIds: string[];
  onOpenConflicts?: (count: number) => void;
}

/** The findings of a pre-approval check, including its loading and failure states. */
export function PreApprovalCheckResults({ state, className = 'px-5 py-2.5' }: { state: PreApprovalCheckState; className?: string }) {
  if (state.status === 'idle') return null;

  if (state.status === 'failed') {
    return (
      <p role="status" className={`text-xs font-semibold text-amber-700 ${className}`}>
        The pre-approval check could not run. The server still refuses approval while a conflict is open.
      </p>
    );
  }

  if (state.status === 'loading') {
    return (
      <p role="status" className={`flex items-center gap-2 text-xs font-semibold text-gray-500 ${className}`}>
        <LoadingSpinner size={14} className="animate-spin" /> Checking this schedule for conflicts and rule issues…
      </p>
    );
  }

  const { result } = state;
  const clean = result.open.length === 0 && result.issues.length === 0;

  return (
    <section aria-label="Pre-approval check" className={`space-y-2 ${className}`}>
      {clean ? (
        <p className="flex items-center gap-2 text-xs font-bold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> No conflicts or scheduling issues found.
        </p>
      ) : (
        <>
          {result.open.length > 0 ? (
            <CheckGroup
              tone="red"
              icon={<AlertTriangle className="h-4 w-4" />}
              title={`${result.open.length} open conflict${result.open.length === 1 ? '' : 's'} — approval is blocked. Return it for revision.`}
              items={result.open.map((conflict) => ({ key: conflict.id, label: conflictRuleLabel(conflict.rule), text: conflict.message }))}
            />
          ) : (
            <p className="flex items-center gap-2 text-xs font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> No open conflicts.
            </p>
          )}
          {result.issues.length > 0 && (
            <CheckGroup
              tone="amber"
              icon={<ClipboardX className="h-4 w-4" />}
              title={`${result.issues.length} class${result.issues.length === 1 ? '' : 'es'} no longer meet${result.issues.length === 1 ? 's' : ''} a scheduling rule`}
              items={result.issues.map((issue) => ({
                key: issue.id,
                label: ruleIssueLabel(issue.rule),
                text: `${issue.schedule.course_code ?? 'Class'} (${issue.schedule.section_name ?? 'section'}): ${issue.message}`,
              }))}
            />
          )}
        </>
      )}
    </section>
  );
}

export default function PreApprovalCheck({ departmentId, sectionIds, onOpenConflicts }: PreApprovalCheckProps) {
  const state = usePreApprovalCheck({ departmentId, sectionIds });
  const openCount = state.status === 'ready' ? state.result.open.length : null;

  useEffect(() => {
    if (openCount !== null) onOpenConflicts?.(openCount);
  }, [openCount, onOpenConflicts]);

  return <PreApprovalCheckResults state={state} className="max-h-44 overflow-y-auto px-5 py-2.5" />;
}

function CheckGroup({ tone, icon, title, items }: {
  tone: 'red' | 'amber';
  icon: React.ReactNode;
  title: string;
  items: { key: string; label: string; text: string }[];
}) {
  const colors = tone === 'red'
    ? 'border-red-200 bg-red-50 text-red-800'
    : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className={`rounded-lg border px-3 py-2 ${colors}`}>
      <p className="flex items-center gap-2 text-xs font-black">{icon}{title}</p>
      <ul className="mt-1 space-y-0.5 pl-6">
        {items.map((item) => (
          <li key={item.key} className="text-[11px] font-semibold">
            <span className="font-black">{item.label}:</span> {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
