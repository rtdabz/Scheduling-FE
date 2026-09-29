import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardX, ShieldAlert } from 'lucide-react';
import LoadingSpinner from '../ui/LoadingSpinner';
import {
  conflictRuleLabel,
  fetchConflicts,
  fetchResolvedConflicts,
  fetchRuleIssues,
  ruleIssueLabel,
  type ConflictResolution,
  type RuleIssue,
  type ScheduleConflict,
} from '../../lib/conflicts';

interface PreApprovalCheckProps {
  departmentId: number;
  /** The sections the package under review covers. */
  sectionIds: string[];
  /** The package's classes, to find the instructor clashes allowed on them. */
  scheduleIds: string[];
  /** Reports the open conflicts found, so the caller can hold its Approve button. */
  onOpenConflicts?: (count: number) => void;
}

interface CheckResult {
  open: ScheduleConflict[];
  allowed: ConflictResolution[];
  issues: RuleIssue[];
}

/**
 * What an approver should know before approving a package, checked now rather
 * than when it was sent: a package is conflict-free when submitted, but data
 * can change before the Dean or VPAA opens it.
 *
 * Nothing is derived here. It reads the same three lists the Schedule Builder
 * shows -- open conflicts, the history of clashes allowed to stand, and the
 * rule check -- narrowed to this package. Open conflicts are also refused by
 * the server on approval; this only says so before the click.
 */
export default function PreApprovalCheck({ departmentId, sectionIds, scheduleIds, onOpenConflicts }: PreApprovalCheckProps) {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [failed, setFailed] = useState(false);
  const sectionKey = sectionIds.join(',');
  const scheduleKey = scheduleIds.join(',');

  useEffect(() => {
    const controller = new AbortController();
    const sections = new Set(sectionKey.split(',').filter(Boolean));
    const schedules = new Set(scheduleKey.split(',').filter(Boolean));
    const inPackage = (schedule: { department_id: number | null; section_id: number | null }) => (
      Number(schedule.department_id) === departmentId && sections.has(String(schedule.section_id))
    );

    void Promise.all([
      fetchConflicts({ departmentId, signal: controller.signal }),
      fetchResolvedConflicts({ departmentId, signal: controller.signal }),
      fetchRuleIssues({ departmentId, signal: controller.signal }),
    ])
      .then(([conflicts, resolutions, issues]) => {
        const next: CheckResult = {
          open: conflicts.filter((conflict) => conflict.schedules.some(inPackage)),
          allowed: resolutions.filter((entry) => (
            entry.status === 'overridden'
            && entry.affected_schedule_ids.some((id) => schedules.has(String(id)))
          )),
          issues: issues.filter((issue) => inPackage(issue.schedule)),
        };
        setResult(next);
        onOpenConflicts?.(next.open.length);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });

    return () => controller.abort();
  }, [departmentId, sectionKey, scheduleKey, onOpenConflicts]);

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

  const clean = result.open.length === 0 && result.allowed.length === 0 && result.issues.length === 0;

  return (
    <section aria-label="Pre-approval check" className="max-h-44 space-y-2 overflow-y-auto px-5 py-2.5">
      {clean ? (
        <p className="flex items-center gap-2 text-xs font-bold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> No conflicts, allowed clashes or rule issues in this schedule.
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
          {result.allowed.length > 0 && (
            <CheckGroup
              tone="amber"
              icon={<ShieldAlert className="h-4 w-4" />}
              title={`${result.allowed.length} instructor clash${result.allowed.length === 1 ? '' : 'es'} allowed to stand by the department`}
              items={result.allowed.map((entry) => ({
                key: entry.key,
                label: entry.resolved_by ? `Allowed by ${entry.resolved_by}` : 'Allowed',
                text: `${entry.message || conflictRuleLabel(entry.rule)}${entry.reason ? ` Reason: “${entry.reason}”` : ''}`,
              }))}
            />
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
