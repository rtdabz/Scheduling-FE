import { useEffect, useState } from 'react';
import { fetchConflicts, fetchRuleIssues, type RuleIssue, type ScheduleConflict } from '../../lib/conflicts';

export interface CheckResult {
  open: ScheduleConflict[];
  issues: RuleIssue[];
}

export type PreApprovalCheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; result: CheckResult };

type Settled = { key: string; failed: true } | { key: string; failed: false; result: CheckResult };

/**
 * Runs the conflict and rule-issue checks for one approval package. The caller owns the
 * result, so approval stays blocked whether or not the findings are on screen.
 */
export function usePreApprovalCheck({ departmentId, sectionIds, enabled = true }: {
  departmentId: number | null;
  sectionIds: string[];
  enabled?: boolean;
}): PreApprovalCheckState {
  const sectionKey = sectionIds.join(',');
  const key = `${departmentId ?? ''}:${sectionKey}`;
  const active = enabled && departmentId !== null;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!active || departmentId === null) return undefined;
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
        if (controller.signal.aborted) return;
        setSettled({
          key,
          failed: false,
          result: {
            open: conflicts.filter((conflict) => conflict.schedules.some(inPackage)),
            issues: issues.filter((issue) => inPackage(issue.schedule)),
          },
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setSettled({ key, failed: true });
      });

    return () => controller.abort();
  }, [active, departmentId, key, sectionKey]);

  if (!active) return { status: 'idle' };
  if (settled === null || settled.key !== key) return { status: 'loading' };
  return settled.failed ? { status: 'failed' } : { status: 'ready', result: settled.result };
}
