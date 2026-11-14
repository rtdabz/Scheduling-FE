import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export type PanelTone = 'brand' | 'alert' | 'warn';

const TONE_TEXT: Record<PanelTone, string> = {
  brand: 'text-text',
  alert: 'text-stage-returned',
  warn: 'text-stage-warnText',
};

const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** White dashboard card: title, optional subtitle and count badge, optional header action. */
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
    <section className={`min-w-0 rounded-xl border border-border bg-white p-5 ${className}`}>
      <div className="mb-4 flex min-h-[28px] items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className={`font-jakarta text-[15px] font-semibold leading-5 tracking-tight ${TONE_TEXT[tone]}`}>{title}</h2>
            {badge != null && badge > 0 && (
              <span className="rounded-full bg-stage-returned px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-white">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-1 text-xs leading-snug text-muted">{subtitle}</p>}
        </div>
        {action && (
          <button
            type="button"
            onClick={onAction}
            className={`-mr-1.5 -mt-1 inline-flex h-7 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md pl-2 pr-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/[0.06] ${FOCUS_RING}`}
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

/** Ring chart with a headline in the centre. With no data it is an empty neutral ring. */
export function Donut({ slices, headline, caption, size = 'md' }: { slices: Slice[]; headline: number | string; caption: string; size?: 'sm' | 'md' }) {
  const filled = slices.filter(slice => slice.value > 0);
  const rows: Slice[] = filled.length ? filled : [{ key: 'empty', label: 'No data', value: 1, color: '#E6DED5' }];

  return (
    <div className={`relative mx-auto shrink-0 ${size === 'sm' ? 'h-28 w-28' : 'h-32 w-32'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows.map(slice => ({ name: slice.label, value: slice.value }))}
            dataKey="value"
            innerRadius="74%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="#ffffff"
            strokeWidth={rows.length > 1 ? 2 : 0}
          >
            {rows.map(slice => <Cell key={slice.key} fill={slice.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`font-bold leading-none tracking-tight tabular-nums text-primary ${size === 'sm' ? 'text-[22px]' : 'text-[26px]'}`}>{headline}</span>
        <span className={`mt-1.5 font-medium leading-tight text-muted ${size === 'sm' ? 'max-w-[62%] text-[10px]' : 'max-w-[72%] text-[11px]'}`}>{caption}</span>
      </div>
    </div>
  );
}

const shareOf = (part: number, total: number, decimals: number) => (total > 0 ? ((part / total) * 100) : 0).toFixed(decimals);

export function DonutLegend({ slices, total, decimals = 1 }: { slices: Slice[]; total: number; decimals?: number }) {
  return (
    <ul className="min-w-0 space-y-2.5">
      {slices.map(slice => (
        <li key={slice.key} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-text" title={slice.label}>{slice.label}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted">
            <span className="font-semibold text-text">{slice.value.toLocaleString()}</span> ({shareOf(slice.value, total, decimals)}%)
          </span>
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
    <label className="flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-xs font-medium text-muted transition-colors hover:border-primary/30 focus-within:border-primary/40">
      <span className="shrink-0">{label}:</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-label={label}
        className="max-w-[92px] cursor-pointer truncate border-none bg-transparent p-0 pr-1 text-xs font-semibold text-text outline-none"
      >
        {children}
      </select>
    </label>
  );
}

export function StatChip({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-parchment/70 px-3 py-2.5 text-center">
      <span className="block text-lg font-bold leading-none tabular-nums text-text">{value.toLocaleString()}</span>
      <span className="mt-1.5 flex items-center justify-center gap-1 text-[11px] font-medium text-muted" title={label}>
        <Icon className="h-3 w-3 shrink-0 text-primary/60" /><span className="truncate">{label}</span>
      </span>
    </div>
  );
}
