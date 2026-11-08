import type { HTMLAttributes } from 'react';

type FilterBarProps = HTMLAttributes<HTMLDivElement> & {
  /** Viewport at which the bar switches from stacked to a single row. */
  breakpoint?: 'sm' | 'lg';
};

const LAYOUT = {
  sm: 'flex-col sm:flex-row items-stretch sm:items-center',
  lg: 'flex-col lg:flex-row items-stretch lg:items-center',
} as const;

/** Shared page toolbar surface for filters, search and view toggles. */
export default function FilterBar({ breakpoint = 'lg', className = '', children, ...rest }: FilterBarProps) {
  return (
    <div
      {...rest}
      className={`bg-white px-4 py-3 rounded-2xl border border-gray-300 shadow-md flex ${LAYOUT[breakpoint]} justify-between gap-3 font-sans ${className}`.trim()}
    >
      {children}
    </div>
  );
}
