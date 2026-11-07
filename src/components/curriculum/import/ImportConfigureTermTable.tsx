import { Pencil } from 'lucide-react';
import { HIGHLIGHT_CLASSES } from '../../../lib/curriculumImport/sheetNavigation';
import { CONFIGURE_STATUS_LABELS, configureStatus, type ConfigureStatus } from '../../../lib/curriculumImport/configureStatus';
import type { CourseCategory, DraftRow, ImportIssue, ImportSettings, ResolvedRow } from '../../../lib/curriculumImport/types';

interface ImportConfigureTermTableProps {
  headingId: string;
  rows: DraftRow[];
  showPlacement: boolean;
  issuesByRow: Map<string, ImportIssue[]>;
  resolved: Map<string, ResolvedRow>;
  validated: boolean;
  settings: ImportSettings | null;
  selected: Set<string>;
  onToggleSelected: (rowIds: string[], selected: boolean) => void;
  onChange: (rowId: string, patch: Partial<DraftRow>) => void;
  onOpenRow: (rowId: string) => void;
}

const CATEGORY_LABELS: Record<CourseCategory, string> = { major: 'Major', minor: 'Minor' };

const control = 'h-8 w-full rounded-md border px-1.5 text-[12.5px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';
const neutral = 'border-border bg-white text-text hover:border-muted/50';
const bad = 'border-red-300 bg-red-50/60 text-text';
// The category the course will be saved with reads at a glance: Major in the theme colour, Minor plain.
const CATEGORY_TONE: Record<CourseCategory, string> = {
  major: 'border-primary/40 bg-primary/[0.06] font-semibold text-primary',
  minor: 'border-border bg-parchment/60 font-semibold text-text',
};
const STATUS_TONE: Record<ConfigureStatus, string> = {
  unchecked: 'text-muted',
  invalid: 'font-bold text-red-700',
  needs_category: 'font-bold text-[#7a5410]',
  override: 'font-semibold text-primary',
  manual: 'font-semibold text-primary',
  rule: 'text-emerald-800',
};

const hours = (minutes: number) => `${(minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })} h`;

/**
 * Where the category comes from: the department rule, the reviewer, or nothing yet. After an edit the check is out
 * of date, but the rule it found still says what an untouched course will be saved as.
 */
const statusText = (status: ConfigureStatus, row: DraftRow, rule: ResolvedRow['rule']) => {
  const ruleText = rule ? `By rule · ${rule.match_value}` : null;
  const overrideText = rule && row.category && rule.category !== row.category ? `Overrides ${CATEGORY_LABELS[rule.category]} rule` : null;
  if (status === 'rule') return ruleText ?? CONFIGURE_STATUS_LABELS.rule;
  if (status === 'override') return overrideText ?? CONFIGURE_STATUS_LABELS.override;
  if (status === 'unchecked') return row.category ? overrideText ?? 'Set manually' : ruleText ?? 'Rule after validation';
  return CONFIGURE_STATUS_LABELS[status];
};

function CourseRow({ row, showPlacement, issues, resolvedRow, validated, settings, isSelected, onToggleSelected, onChange, onOpen }: {
  row: DraftRow;
  showPlacement: boolean;
  issues: ImportIssue[];
  resolvedRow: ResolvedRow | undefined;
  validated: boolean;
  settings: ImportSettings | null;
  isSelected: boolean;
  onToggleSelected: (rowIds: string[], selected: boolean) => void;
  onChange: (rowId: string, patch: Partial<DraftRow>) => void;
  onOpen: () => void;
}) {
  const id = row.row_id;
  const code = row.code.trim() || id;
  const rule = resolvedRow?.rule ?? null;
  const status = configureStatus(row, resolvedRow, issues, validated);
  const effective = row.category ?? rule?.category ?? null;
  const manual = row.category !== null;
  const catalog = resolvedRow?.catalog;
  const errorIssues = issues.filter((issue) => issue.severity === 'error');
  const errors = errorIssues.length;
  // The category line already explains a missing classification; other findings are spelled out under the course.
  const otherErrors = errorIssues.filter((issue) => issue.code !== 'unclassified');
  const lecture = (row.lecture_units ?? 0) * (settings?.lecture_minutes_per_unit ?? 0);
  const lab = (row.lab_units ?? 0) * (settings?.laboratory_minutes_per_unit ?? 0);

  return (
    <tr data-row-id={id} className={`${HIGHLIGHT_CLASSES} border-t border-border/70 align-top max-sm:grid max-sm:grid-cols-[2rem_minmax(0,1fr)_8.75rem] ${errors > 0 ? 'bg-red-50/60 [&>td:first-child]:[box-shadow:inset_3px_0_0_#ef4444]' : isSelected ? 'bg-primary/[0.04]' : 'hover:bg-parchment/40'}`}>
      <td className="py-2 pl-2.5 pr-0">
        <input type="checkbox" aria-label={`Select ${code}`} checked={isSelected} onChange={(event) => onToggleSelected([id], event.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
      </td>
      <td className="py-1.5 pl-1.5 pr-2 leading-snug">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${code}${errors ? `, ${errors} error${errors === 1 ? '' : 's'}` : ''}`}
          className="rounded text-left text-[13px] font-bold text-text underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {code}
        </button>
        <span className="block truncate text-xs text-muted" title={row.title}>{row.title}</span>
        {showPlacement && <span className="block text-[11px] font-semibold text-red-700">No valid year or term</span>}
        {otherErrors.map((issue) => <span key={issue.key} className="block text-[11px] font-semibold leading-snug text-red-700">{issue.message}</span>)}
        {/* A new course is the default; only reuse of a catalog course, or a conflict with one, is called out. */}
        {catalog && catalog.action !== 'create' && (
          <span className={`block text-[11px] font-semibold ${catalog.action === 'blocked' ? 'text-red-700' : 'text-primary'}`}>
            {catalog.action === 'reuse' ? 'Uses existing course' : 'Conflicts with existing'}
          </span>
        )}
      </td>
      <td className="py-1.5 pr-2">
        <select
          aria-label={`Category for ${code}`}
          value={row.category ?? ''}
          onChange={(event) => onChange(id, { category: (event.target.value || null) as DraftRow['category'] })}
          className={`${control} ${status === 'needs_category' || (validated && !effective) ? bad : effective ? CATEGORY_TONE[effective] : neutral}`}
        >
          <option value="">{rule ? `${CATEGORY_LABELS[rule.category]} (rule)` : validated ? 'Choose…' : 'Department rule'}</option>
          <option value="major">Major</option>
          <option value="minor">Minor</option>
        </select>
        <span className={`mt-0.5 flex items-center gap-1 truncate text-[11px] ${errors > 0 && status === 'needs_category' ? 'font-bold text-red-700' : STATUS_TONE[status]}`}>
          {manual && <Pencil size={10} aria-hidden="true" className="shrink-0" />}
          <span className="truncate">{statusText(status, row, rule)}</span>
        </span>
      </td>
      <td className="py-1.5 pr-2.5 text-right tabular-nums max-sm:col-start-2 max-sm:flex max-sm:items-baseline max-sm:gap-1.5 max-sm:pl-1.5 max-sm:pt-0 max-sm:text-left">
        {settings ? (
          <>
            <span className="block text-[13px] font-bold text-text">{hours(lecture + lab)}</span>
            <span className="block text-[11px] text-muted" title={`${hours(lecture)} lecture, ${hours(lab)} laboratory`}>
              <span aria-hidden="true">{lecture / 60}+{lab / 60}</span>
              <span className="sr-only">{hours(lecture)} lec, {hours(lab)} lab</span>
            </span>
          </>
        ) : <span className="text-[11px] text-muted">—</span>}
      </td>
    </tr>
  );
}

/**
 * Configure's term table: what each course is saved as. The category shows the department rule's answer until the
 * reviewer picks one, and a picked category is marked as set by hand; validation never replaces it.
 */
export default function ImportConfigureTermTable({ headingId, rows, showPlacement, issuesByRow, resolved, validated, settings, selected, onToggleSelected, onChange, onOpenRow }: ImportConfigureTermTableProps) {
  return (
    // Below the sm breakpoint each row wraps onto two lines (hours under the course), so a phone needs no sideways scrolling.
    <div className="sm:overflow-x-auto">
      <table className="w-full table-fixed text-[13px] max-sm:block sm:min-w-[24rem]" aria-labelledby={headingId}>
        <colgroup>
          <col className="w-8" />
          <col />
          <col className="w-[8.75rem]" />
          <col className="w-[5rem]" />
        </colgroup>
        <thead className="max-sm:sr-only">
          <tr className="text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
            <th scope="col" className="py-1.5 pl-2.5 pr-0"><span className="sr-only">Select</span></th>
            <th scope="col" className="py-1.5 pl-1.5 pr-2">Course</th>
            <th scope="col" className="py-1.5 pr-2">Category</th>
            <th scope="col" className="py-1.5 pr-2.5 text-right" title="Weekly class time from lecture and laboratory units">Hrs/wk</th>
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {rows.length === 0 ? (
            <tr className="border-t border-border/70 max-sm:block"><td colSpan={4} className="px-3 py-3 text-center text-muted max-sm:block">No courses in this term.</td></tr>
          ) : rows.map((row) => (
            <CourseRow
              key={row.row_id}
              row={row}
              showPlacement={showPlacement}
              issues={issuesByRow.get(row.row_id) ?? []}
              resolvedRow={resolved.get(row.row_id)}
              validated={validated}
              settings={settings}
              isSelected={selected.has(row.row_id)}
              onToggleSelected={onToggleSelected}
              onChange={onChange}
              onOpen={() => onOpenRow(row.row_id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
