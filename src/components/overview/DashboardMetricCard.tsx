import type { LucideIcon } from 'lucide-react';
import { GRID_CARD_HOVER } from '../../lib/cardStyles';

export type DashboardMetricTone = 'brand' | 'info' | 'good' | 'warn' | 'alert' | 'accent';

const TONES: Record<DashboardMetricTone, string> = {
  brand: 'bg-primary/10 text-primary',
  info: 'bg-slate-100 text-slate-600',
  good: 'bg-emerald-50 text-emerald-600',
  warn: 'bg-amber-50 text-amber-700',
  alert: 'bg-rose-50 text-rose-600',
  accent: 'bg-violet-50 text-violet-600',
};

const VALUE_TONES: Record<DashboardMetricTone, string> = {
  brand: 'text-primary',
  info: 'text-primary',
  accent: 'text-primary',
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  alert: 'text-rose-700',
};

const CARD_BASE =
  'flex h-full min-h-[90px] min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left';

interface DashboardMetricCardProps {
  label: string;
  value: string | number;
  detail: string;
  icon?: LucideIcon;
  progress?: number;
  tone?: DashboardMetricTone;
  onClick?: () => void;
  className?: string;
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, progress));
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="18" cy="18" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      {clamped > 0 && (
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="#16a36a"
          strokeWidth="4"
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
}: DashboardMetricCardProps) {
  const content = (
    <>
      {progress !== undefined ? <ProgressRing progress={progress} /> : (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
          {Icon && <Icon className="h-4 w-4" />}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className={`text-lg font-bold leading-5 ${VALUE_TONES[tone]}`}>{value}</span>
        <span className="mt-1 break-words text-[11px] font-bold leading-tight">{label}</span>
        <span className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{detail}</span>
      </span>
    </>
  );

  if (onClick) {
    return <button type="button" onClick={onClick} className={`relative ${CARD_BASE} ${GRID_CARD_HOVER} ${className}`}>{content}</button>;
  }

  return <div className={`${CARD_BASE} ${className}`}>{content}</div>;
}
