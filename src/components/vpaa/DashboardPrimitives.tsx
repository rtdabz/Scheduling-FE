import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

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

export function Panel({
  title,
  subtitle,
  badge,
  tone = 'brand',
  children,
  action,
  onAction,
  headerExtra,
  className = '',
}: {
  title: string;
  subtitle?: string;
  badge?: number;
  tone?: PanelTone;
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  headerExtra?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-border bg-white p-5 ${className}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className={`font-sans text-[15px] font-semibold leading-snug ${TONE_TEXT[tone]}`}>{title}</h2>
            {badge != null && badge > 0 && (
              <span className="rounded-full bg-stage-returned px-2 py-0.5 text-[11px] font-bold leading-none tabular-nums text-white">
                {badge.toLocaleString()}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted">{subtitle}</p>}
        </div>
        {(action || headerExtra) && (
          <div className="flex shrink-0 items-center gap-3">
            {action && (
              <button
                type="button"
                onClick={onAction}
                className="focus-ring rounded text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
              >
                {action}
              </button>
            )}
            {headerExtra}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

/** Column headings for the grid-based tables inside panels. */
export function TableHead({ columns, children }: { columns: string; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-border pb-2 text-[12px] font-medium text-muted" style={{ gridTemplateColumns: columns }}>
      {children}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-[12px] text-muted focus-within:border-primary/40">
      <span className="shrink-0">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-label={label}
        className="max-w-[110px] cursor-pointer truncate border-none bg-transparent p-0 pr-1 text-[12px] font-semibold text-text outline-none"
      >
        {children}
      </select>
    </label>
  );
}

export function StatChip({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <div className="rounded-lg bg-parchment px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-[12px]" title={label}>{label}</span>
      </div>
      <b className="mt-1 block text-[18px] font-semibold leading-none tabular-nums text-primary">{value.toLocaleString()}</b>
    </div>
  );
}

export function IconButton({ label, onClick, children, title }: { label: string; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted transition-colors hover:border-primary/30 hover:text-primary"
    >
      {children}
    </button>
  );
}

export function LoadWarning({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-[13px] text-stage-warnText">
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onRetry} className="focus-ring rounded-md border border-accent/50 bg-white px-3 py-1.5 font-semibold transition-colors hover:bg-accent/10">
        Retry
      </button>
    </div>
  );
}
