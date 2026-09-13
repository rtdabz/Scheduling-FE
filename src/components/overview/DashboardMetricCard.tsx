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

/**
 * The tones that mean "act on this" also colour the number, so the state is
 * legible from the figure itself rather than from the icon chip alone. The
 * neutral tones keep the brand colour: tinting every value would leave nothing
 * for the actionable ones to stand out against.
 */
const VALUE_TONES: Record<DashboardMetricTone, string> = {
  brand: 'text-primary',
  info: 'text-primary',
  accent: 'text-primary',
  good: 'text-emerald-700',
  warn: 'text-amber-700',
  alert: 'text-rose-700',
};

/**
 * Matches the `min-h-[90px]` the loading skeleton reserves for each tile, so
 * the row does not resize when the data lands, and gives the flex column the
 * slack that pins `detail` to the bottom on every card in the row.
 */
const CARD_BASE =
  'flex h-full min-h-[90px] min-w-0 gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-left';

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
        <span className={`text-lg font-bold leading-5 ${VALUE_TONES[tone]}`}>{value}</span>
        <span className="mt-1 break-words text-[11px] font-bold leading-tight">{label}</span>
        <span className="mt-auto break-words pt-0.5 text-[10px] leading-tight text-slate-500">{detail}</span>
      </span>
    </>
  );

  if (onClick) {
    // `shadow-sm`/`hover:shadow-md` are inert here: index.css zeroes box-shadow
    // globally for anything matching [class*="shadow"], so the hover state has
    // to come from the shared transform affordance instead. GRID_CARD_HOVER
    // owns the transition and the border colour, so neither is set separately.
    return <button type="button" onClick={onClick} className={`relative ${CARD_BASE} ${GRID_CARD_HOVER} ${className}`}>{content}</button>;
  }

  return <div className={`${CARD_BASE} ${className}`}>{content}</div>;
}
