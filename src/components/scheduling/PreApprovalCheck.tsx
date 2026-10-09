import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardX } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import {
  conflictRuleLabel,
  fetchConflicts,
  fetchRuleIssues,
  ruleIssueLabel,
  type RuleIssue,
  type ScheduleConflict,
} from '../../lib/conflicts';

interface PreApprovalCheckProps {
  departmentId: number;
  sectionIds: string[];
  onOpenConflicts?: (count: number) => void;
}

interface CheckResult {
  open: ScheduleConflict[];
  issues: RuleIssue[];
}

export default function PreApprovalCheck({ departmentId, sectionIds, onOpenConflicts }: PreApprovalCheckProps) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [failed, setFailed] = useState(false);
  const sectionKey = sectionIds.join(',');

  useEffect(() => {
    const controller = new AbortController();
    const sections = new Set(sectionKey.split(',').filter(Boolean));
    const inPackage = (schedule: { department_id: number | null; section_id: number | null }) => (
      Number(schedule.department_id) === departmentId && sections.has(String(schedule.section_id))
    );

    void Promise.all([
      fetchConflicts({ departmentId, signal: controller.signal }),
      fetchRuleIssues({ departmentId, signal: controller.signal }),
    ])
      .then(([conflicts, issues]) => {
        const next: CheckResult = {
          open: conflicts.filter((conflict) => conflict.schedules.some(inPackage)),
          issues: issues.filter((issue) => inPackage(issue.schedule)),
        };
        setResult(next);
        onOpenConflicts?.(next.open.length);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => controller.abort();
  }, [departmentId, sectionKey, onOpenConflicts]);

  if (failed) {
    return (
      <p className="px-5 py-2 text-xs font-semibold text-amber-700">
        The pre-approval check could not run. The server still refuses approval while a conflict is open.
      </p>
    );
  }

  if (result === null) {
    return (
      <p className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-gray-500">
        <LoadingSpinner size={14} className="animate-spin" /> Checking this schedule for conflicts and rule issues…
      </p>
    );
  }

  const clean = result.open.length === 0 && result.issues.length === 0;

  return (
    <section aria-label="Pre-approval check" className="max-h-44 space-y-2 overflow-y-auto px-5 py-2.5">
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
