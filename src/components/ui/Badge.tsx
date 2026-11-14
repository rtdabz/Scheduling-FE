import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand' | 'accent';

const TONES: Record<BadgeTone, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/15',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  neutral: 'bg-gray-100 text-gray-600 ring-gray-500/15',
  brand: 'bg-[#5A1220]/[0.06] text-[#5A1220] ring-[#5A1220]/15',
  accent: 'bg-[#C9952A]/10 text-[#8A6212] ring-[#C9952A]/25',
};

const DOTS: Record<BadgeTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  neutral: 'bg-gray-400',
  brand: 'bg-[#5A1220]',
  accent: 'bg-[#C9952A]',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** `pill` for statuses, `tag` for categories and plain labels. */
  shape?: 'pill' | 'tag';
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

/** One badge for every table: statuses use `pill`, categories use `tag`. */
export default function Badge({ tone = 'neutral', shape = 'pill', dot = false, icon, className = '', children, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold leading-4 ring-1 ring-inset ${shape === 'pill' ? 'rounded-full' : 'rounded-md'} ${TONES[tone]} ${className}`}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOTS[tone]}`} />}
      {icon}
      {children}
    </span>
  );
}
