import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { STAGE } from '../../lib/dashboardStage';
import { Meter, StatusTag, type StageSegment, type TagTone } from './Ledger';

export interface ContextAction {
  label: string;
  onClick: () => void;
  title?: string;
}

/** One compact line under the page title: the semester, where it stands, and the next action. */
export function DashboardContext({ term, status, statusTone, summary, action }: {
  term: string;
  status?: string;
  statusTone?: TagTone;
  summary?: ReactNode;
  action?: ContextAction;
}) {
  return (
    <section aria-label="Semester status" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-white px-5 py-3.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[14px] font-semibold text-text">{term}</span>
        {status && statusTone && <StatusTag tone={statusTone}>{status}</StatusTag>}
        {summary && <span className="min-w-0 text-[13px] text-muted">{summary}</span>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          title={action.title}
          className="focus-ring shrink-0 rounded-md bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-light"
        >
          {action.label}
        </button>
      )}
    </section>
  );
}

export type KpiTone = 'neutral' | 'good' | 'attention' | 'alert';

const KPI_ICON_TILE: Record<KpiTone, string> = {
  neutral: 'bg-primary/[0.07] text-primary',
  good: 'bg-stage-done/10 text-stage-done',
  attention: 'bg-accent/15 text-stage-warnText',
  alert: 'bg-stage-returned/10 text-stage-returned',
};

const KPI_STATUS_TEXT: Record<KpiTone, string> = {
  neutral: 'text-muted',
  good: 'text-stage-done',
  attention: 'text-stage-warnText',
  alert: 'text-stage-returned',
};

/**
 * A decision metric: the value, what it is out of, and its status in words.
 * The tone shows on the icon tile and the status line, never as a filled card.
 */
export function KpiCard({ label, value, of, status, tone = 'neutral', icon: Icon, meter, onClick, actionLabel }: {
  label: string;
  value: number | string;
  of?: string;
  status: string;
  tone?: KpiTone;
  icon: LucideIcon;
  meter?: { value: number; color?: string };
  onClick?: () => void;
  actionLabel?: string;
}) {
  const body = (
    <>
      <span aria-hidden="true" className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg sm:right-4 sm:top-4 sm:h-9 sm:w-9 ${KPI_ICON_TILE[tone]}`}>
        <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
      </span>
      <span className="block pr-10 text-[13px] font-medium text-muted sm:pr-12">{label}</span>
      <span className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 pr-10 sm:pr-12">
        <span className="text-[24px] font-semibold leading-none tabular-nums text-primary sm:text-[26px]">{value}</span>
        {of && <span className="text-[13px] tabular-nums text-muted">{of}</span>}
      </span>
      {meter && <span className="mt-3 block"><Meter value={meter.value} color={meter.color} label={`${label} progress`} /></span>}
      <span className={`mt-auto block pt-2.5 text-[12px] font-semibold leading-snug ${KPI_STATUS_TEXT[tone]}`}>
        {status}
        {onClick && actionLabel && <span className="sr-only">. {actionLabel}</span>}
      </span>
    </>
  );

  const base = 'relative flex h-full min-w-0 flex-col rounded-xl border border-border bg-white p-3.5 text-left sm:p-4';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={actionLabel} className={`focus-ring ${base} transition-colors hover:border-primary/30 hover:bg-parchment/40`}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

/** The KPI strip: two columns on phones, one row from large screens up. */
export function KpiStrip({ children, count }: { children: ReactNode; count: number }) {
  const columns = count >= 4 ? 'xl:grid-cols-4' : count === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2';
  return (
    <section id="dashboard-metrics" aria-label="Key figures" className={`grid grid-cols-2 gap-3 ${columns} ${count % 2 ? '[&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1' : ''}`}>
      {children}
    </section>
  );
}

/**
 * Status distribution as a donut with its legend. The legend carries every
 * number, so the ring itself has no labels.
 */
export function StatusDonut({ segments, total, centerLabel, label, compact = false }: {
  segments: StageSegment[];
  total: number;
  centerLabel: string;
  label: string;
  /** Ring above the legend, for a narrow column. */
  compact?: boolean;
}) {
  const filled = segments.filter(segment => segment.value > 0);
  const ring = filled.length ? filled : [{ key: 'empty', label: 'No data', value: 1, color: STAGE.idle }];
  const share = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return (
    <div className={compact ? 'grid items-center gap-4 sm:grid-cols-[132px_minmax(0,1fr)] xl:grid-cols-1' : 'grid items-center gap-5 sm:grid-cols-[148px_minmax(0,1fr)]'}>
      <div role="img" aria-label={`${label}: ${segments.map(s => `${s.value} ${s.label}`).join(', ')}`} className={`relative mx-auto ${compact ? 'h-[132px] w-[132px]' : 'h-[148px] w-[148px]'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={ring} dataKey="value" nameKey="label" innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} paddingAngle={filled.length > 1 ? 1.5 : 0} stroke="none" isAnimationActive={false}>
              {ring.map(segment => <Cell key={segment.key} fill={segment.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[26px] font-semibold leading-none tabular-nums text-primary">{total.toLocaleString()}</span>
          <span className="mt-1 text-[12px] text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-0 divide-y divide-border">
        {segments.map(segment => (
          <li key={segment.key} className="flex items-center gap-2.5 py-1.5 text-[13px]">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
            <span className={`min-w-0 flex-1 truncate ${segment.value ? 'text-text' : 'text-muted'}`}>{segment.label}</span>
            <b className="font-semibold tabular-nums text-text">{segment.value.toLocaleString()}</b>
            <span className="w-10 text-right text-[12px] tabular-nums text-muted">{share(segment.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One segment per check, so the bar reads as "which conditions pass", not a percentage. */
export function CheckSegments({ checks }: { checks: ReadonlyArray<readonly [string, boolean]> }) {
  return (
    <div className="flex gap-1" aria-hidden="true">
      {checks.map(([label, done]) => (
        <span key={label} title={label} className={`h-2 flex-1 rounded-full ${done ? 'bg-stage-done' : 'bg-accent/50'}`} />
      ))}
    </div>
  );
}

/** Quick actions: shortcuts to the modules that hold detail the dashboard no longer repeats. */
export function RelatedLinks({ links, note }: { links: Array<{ label: string; onClick: () => void }>; note?: ReactNode }) {
  if (!links.length && !note) return null;
  return (
    <nav aria-labelledby="quick-actions-title" className="rounded-xl border border-border bg-white px-5 py-4">
      <h2 id="quick-actions-title" className="font-sans text-[13px] font-semibold text-text">Quick Actions</h2>
      {note && <p className="mt-1.5 text-[13px] text-stage-warnText">{note}</p>}
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {links.map(link => (
            <button
              key={link.label}
              type="button"
              onClick={link.onClick}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors hover:border-primary/30 hover:bg-primary/[0.05]"
            >
              {link.label}
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 opacity-60" />
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}

/** A whole-group distribution beside its per-group breakdown, inside one panel. */
export function DistributionWithGroups({ distribution, groupsTitle, children }: {
  distribution: ReactNode;
  groupsTitle: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-6">
      <div className="min-w-0">{distribution}</div>
      <div className="min-w-0 border-t border-border pt-4 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
        <h3 className="mb-3 font-sans text-[13px] font-semibold text-text">{groupsTitle}</h3>
        {children}
      </div>
    </div>
  );
}

export interface StageRowItem {
  key: string;
  label: string;
  sublabel?: string;
  /** Right-aligned headline figure, e.g. "12 / 18 approved". */
  summary: string;
  segments: StageSegment[];
  title?: string;
}

/**
 * Groups compared side by side: one stacked bar per group, split by stage. Each
 * row names only its non-empty stages, and the coloured dot doubles as the legend.
 */
export function StageRows({ rows, label }: { rows: StageRowItem[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-border">
      {rows.map(row => {
        const total = row.segments.reduce((sum, segment) => sum + segment.value, 0);
        const filled = row.segments.filter(segment => segment.value > 0);
        return (
          <li key={row.key} className="py-2.5 first:pt-0 last:pb-0" title={row.title}>
            <div className="flex items-baseline gap-2">
              <b className="shrink-0 text-[13px] font-semibold text-text">{row.label}</b>
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{row.sublabel}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-muted">{row.summary}</span>
            </div>
            <div
              role="img"
              aria-label={`${row.label}: ${filled.map(s => `${s.value} ${s.label}`).join(', ') || 'no sections'}`}
              className="mt-1.5 flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-stage-idle"
            >
              {total > 0 && filled.map(segment => (
                <span key={segment.key} className="h-full" style={{ flexGrow: segment.value, flexBasis: 0, backgroundColor: segment.color }} />
              ))}
            </div>
            {filled.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
                {filled.map(segment => (
                  <span key={segment.key} className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />
                    <span>{segment.value.toLocaleString()} {segment.label}</span>
                  </span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A labelled horizontal bar row for comparisons (year levels, programs, departments, rooms). */
export function BarRow({ label, sublabel, value, valueLabel, color, title }: {
  label: string;
  sublabel?: string;
  value: number;
  valueLabel: string;
  color: string;
  title?: string;
}) {
  return (
    <li className="min-w-0" title={title}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">
          {label}
          {sublabel && <span className="ml-1.5 font-normal text-muted">{sublabel}</span>}
        </span>
        <span className="shrink-0 text-[12px] tabular-nums text-muted">{valueLabel}</span>
      </div>
      <Meter value={value} color={color} label={`${label}: ${valueLabel}`} />
    </li>
  );
}
