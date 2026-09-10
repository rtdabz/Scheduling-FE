import type { LucideIcon } from 'lucide-react';

export type DashboardMetricTone = 'brand' | 'info' | 'good' | 'warn' | 'alert' | 'accent';

const TONES: Record<DashboardMetricTone, string> = {
  brand: 'bg-primary/10 text-primary',
  info: 'bg-slate-100 text-slate-600',
  good: 'bg-emerald-50 text-emerald-600',
  warn: 'bg-amber-50 text-amber-700',
  alert: 'bg-rose-50 text-rose-600',
  accent: 'bg-violet-50 text-violet-600',
};

interface DashboardMetricCardProps {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: DashboardMetricTone;
  onClick?: () => void;
  className?: string;
}

export default function DashboardMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'brand',
  onClick,
  className = '',
}: DashboardMetricCardProps) {
  const content = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="text-lg font-bold leading-5 text-primary">{value}</span>
        <span className="mt-1 break-words text-[11px] font-bold leading-tight">{label}</span>
        <span className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{detail}</span>
      </span>
    </>
  );

  if (onClick) {
    return <button type="button" onClick={onClick} className={`flex min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md ${className}`}>{content}</button>;
  }

  return <div className={`flex min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm ${className}`}>{content}</div>;
}
