import type { LucideIcon } from 'lucide-react';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';
import Skeleton from '../ui/Skeleton';

export type DashboardMetricTone = 'brand' | 'info' | 'good' | 'warn' | 'alert' | 'accent';

const TONES: Record<DashboardMetricTone, string> = {
  brand: 'bg-primary/10 text-primary',
  info: 'bg-stage-idle/60 text-muted',
  good: 'bg-stage-done/10 text-stage-done',
  warn: 'bg-accent/15 text-stage-warnText',
  alert: 'bg-stage-returned/10 text-stage-returned',
  accent: 'bg-accent/15 text-stage-warnText',
};

const VALUE_TONES: Record<DashboardMetricTone, string> = {
  brand: 'text-primary',
  info: 'text-primary',
  accent: 'text-primary',
  good: 'text-stage-done',
  warn: 'text-stage-warnText',
  alert: 'text-stage-returned',
};

const CARD_BASE =
  'flex h-full min-h-[90px] min-w-0 items-start gap-2 rounded-xl border border-border bg-white p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

interface DashboardMetricCardProps {
  label: string;
  value: string | number;
  detail: string;
  icon?: LucideIcon;
  progress?: number;
  tone?: DashboardMetricTone;
  onClick?: () => void;
  className?: string;
  loading?: boolean;
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <svg viewBox="0 0 36 36" className="h-8 w-8 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="18" cy="18" r={radius} fill="none" stroke="#E6DED5" strokeWidth="3.5" />
      {clamped > 0 && (
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="#3F7D58"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      )}
    </svg>
  );
}

export default function DashboardMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  progress,
  tone = 'brand',
  onClick,
  className = '',
  loading = false,
}: DashboardMetricCardProps) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col self-stretch text-left">
        <span className="relative break-words text-xs font-medium leading-tight text-muted">
          <span className={loading ? 'invisible' : undefined}>{label}</span>
          {loading && <span className="skeleton-shimmer absolute inset-x-0 top-1/2 h-2.5 w-4/5 -translate-y-1/2 animate-pulse rounded" />}
        </span>
        <span className={`relative mt-1.5 text-[26px] font-bold leading-7 tracking-tight tabular-nums ${VALUE_TONES[tone]}`}>
          <span className={loading ? 'invisible' : undefined}>{value}</span>
          {loading && <span className="skeleton-shimmer absolute inset-y-0 left-0 w-12 max-w-full animate-pulse rounded" />}
        </span>
        <span className="relative mt-auto break-words pt-1.5 text-[11px] leading-tight text-muted">
          <span className={loading ? 'invisible' : undefined}>{detail}</span>
          {loading && <span className="skeleton-shimmer absolute left-0 top-[calc(50%+3px)] h-2 w-3/5 -translate-y-1/2 animate-pulse rounded" />}
        </span>
      </span>
      {progress !== undefined ? <ProgressRing progress={loading ? 0 : progress} /> : loading ? <Skeleton className="h-8 w-8 shrink-0 rounded-lg" /> : (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
          {Icon && <Icon className="h-4 w-4" />}
        </span>
      )}
    </>
  );

  if (loading) {
    return <div aria-hidden="true" className={`${CARD_BASE} ${className}`}>{content}</div>;
  }

  if (onClick) {
    return <button type="button" onClick={onClick} className={`relative ${CARD_BASE} ${GRID_CARD_HOVER} ${className}`}>{content}</button>;
  }

  return <div className={`${CARD_BASE} ${className}`}>{content}</div>;
}
