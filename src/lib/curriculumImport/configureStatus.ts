import type { DraftRow, ImportIssue, ResolvedRow } from './types';

export type ConfigureStatus = 'unchecked' | 'invalid' | 'needs_category' | 'override' | 'manual' | 'rule';

export const CONFIGURE_STATUS_LABELS: Record<ConfigureStatus, string> = {
  unchecked: 'Not checked',
  invalid: 'Has errors',
  needs_category: 'Needs category',
  override: 'Override',
  manual: 'Set manually',
  rule: 'By rule',
};

/** How far a row's classification is settled, from the latest validation plus local edits. */
export const configureStatus = (row: DraftRow, resolved: ResolvedRow | undefined, issues: ImportIssue[] | undefined, validated: boolean): ConfigureStatus => {
  if (!validated) return 'unchecked';
  if ((issues ?? []).some((issue) => issue.severity === 'error' && issue.code !== 'unclassified')) return 'invalid';
  const rule = resolved?.rule ?? null;
  if (row.category === null) return rule ? 'rule' : 'needs_category';
  if (rule && rule.category !== row.category) return 'override';
  return rule ? 'rule' : 'manual';
};
