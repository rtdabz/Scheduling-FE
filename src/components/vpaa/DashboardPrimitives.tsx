import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

/**
 * The shared furniture of the VPAA dashboard.
 *
 * Extracted from the page so the panels below it stay readable, and so the type
 * scale lives in one place. The previous dashboard set body copy at 9-10px,
 * which is below the point where a table of numbers is comfortably legible;
 * everything here is 11px at the smallest and 12-13px for data a reader is
 * expected to actually compare.
 */

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export type PanelTone = 'brand' | 'alert' | 'warn';

const TONE_TEXT: Record<PanelTone, string> = {
  brand: 'text-primary',
  alert: 'text-rose-600',
  warn: 'text-amber-700',
};

export function Panel({
  title,
  subtitle,
  badge,
  tone = 'brand',
  children,
  action,
  onAction,
  className = '',
}: {
  title: string;
  subtitle?: string;
  badge?: number;
  tone?: PanelTone;
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className={`text-xs font-bold uppercase tracking-wide ${TONE_TEXT[tone]}`}>{title}</h2>
            {badge != null && badge > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums text-white">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-[11px] font-medium leading-tight text-slate-500">{subtitle}</p>}
        </div>
        {action && (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex shrink-0 items-center text-[11px] font-bold text-primary hover:underline"
          >
            {action}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Donut and its centre readout.
 *
 * An all-zero series is drawn as one neutral ring rather than nothing: recharts
 * renders no arcs when every value is 0, which reads as a broken chart.
 */
export function Donut({ slices, headline, caption }: { slices: Slice[]; headline: number | string; caption: string }) {
  const filled = slices.filter(slice => slice.value > 0);
  const rows: Slice[] = filled.length ? filled : [{ key: 'empty', label: 'No data', value: 1, color: '#e2e8f0' }];

  return (
    <div className="relative mx-auto h-32 w-32">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows.map(slice => ({ name: slice.label, value: slice.value }))}
            dataKey="value"
            innerRadius="67%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={1}
            stroke="#ffffff"
            strokeWidth={3}
          >
            {rows.map(slice => <Cell key={slice.key} fill={slice.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white text-center">
        <b className="text-2xl leading-none text-primary">{headline}</b>
        <span className="mt-1 px-1 text-[10px] font-semibold leading-tight text-slate-500">{caption}</span>
      </div>
    </div>
  );
}

/** One decimal — the precision the donut legends quote each share to. */
const share1 = (part: number, total: number) => (total > 0 ? ((part / total) * 100).toFixed(1) : '0.0');

export function DonutLegend({ slices, total }: { slices: Slice[]; total: number }) {
  return (
    <ul className="min-w-0 space-y-2">
      {slices.map(slice => (
        <li key={slice.key} className="flex items-start gap-2">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-bold leading-tight text-slate-700" title={slice.label}>{slice.label}</div>
            <div className="mt-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
              {slice.value.toLocaleString()} ({share1(slice.value, total)}%)
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FilterSelect({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 shadow-sm">
      <span className="shrink-0">{label}:</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-label={label}
        className="max-w-[92px] cursor-pointer truncate border-none bg-transparent p-0 pr-1 text-[11px] font-bold text-slate-700 outline-none"
      >
        {children}
      </select>
    </label>
  );
}

export function StatChip({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2 text-center">
      <Icon className="mx-auto h-4 w-4 text-primary/70" />
      <b className="mt-1 block text-sm leading-none tabular-nums text-primary">{value.toLocaleString()}</b>
      <span className="mt-1 block truncate text-[10px] font-semibold text-slate-500" title={label}>{label}</span>
    </div>
  );
}
