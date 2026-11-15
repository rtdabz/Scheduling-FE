import type { HTMLAttributes } from 'react';

type FilterBarProps = HTMLAttributes<HTMLDivElement> & {
  /** Viewport at which the bar switches from stacked to a single row. */
  breakpoint?: 'sm' | 'lg';
};

const LAYOUT = {
  sm: 'flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center',
  lg: 'flex-col lg:flex-row lg:flex-wrap items-stretch lg:items-center',
} as const;

/**
 * Shared page toolbar surface for filters, search and view toggles. In row mode the groups wrap onto a
 * second line when they do not fit side by side, so controls never overlap on narrower desktops.
 */
export default function FilterBar({ breakpoint = 'lg', className = '', children, ...rest }: FilterBarProps) {
  return (
    <div
      {...rest}
      className={`bg-white px-4 py-3 rounded-2xl border border-gray-300 shadow-md flex ${LAYOUT[breakpoint]} justify-between gap-x-3 gap-y-2.5 font-sans ${className}`.trim()}
    >
      {children}
    </div>
  );
}
