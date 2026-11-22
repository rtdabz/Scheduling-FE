import type { ReactNode } from 'react';
import type { Table } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PagerProps {
  /** Zero-based page index. */
  pageIndex: number;
  pageSize: number;
  total: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  totalLabel?: string;
  pageSizeOptions?: number[];
  /** `card` gives the pager its own bordered surface, for use under a grid of cards. */
  variant?: 'plain' | 'card';
  className?: string;
}

const CARD_SURFACE = 'rounded-2xl border border-gray-200 bg-white shadow-sm';

/** Shared "Showing x-y of n" footer with a page-size picker and first/previous/next/last controls. */
export default function Pager({
  pageIndex,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  totalLabel = 'records',
  pageSizeOptions = [10, 25, 50],
  variant = 'plain',
  className = '',
}: PagerProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, total);
  const canPrevious = pageIndex > 0;
  const canNext = pageIndex < pageCount - 1;
  const sizeOptions = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 text-xs font-medium text-gray-500 ${variant === 'card' ? CARD_SURFACE : ''} ${className}`}>
      <span className="tabular-nums">
        Showing <span className="font-semibold text-gray-800">{start}-{end}</span> of <span className="font-semibold text-gray-800">{total}</span> {totalLabel}
      </span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="max-sm:sr-only">Rows per page</span>
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 cursor-pointer rounded-lg border border-gray-200 bg-white pl-2 pr-1 text-xs font-semibold text-gray-700 outline-none transition-colors hover:border-gray-300 focus:border-[#5A1220] focus:ring-1 focus:ring-[#5A1220]"
          >
            {sizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <PagerButton label="First page" className="max-sm:hidden" onClick={() => onPageChange(0)} disabled={!canPrevious}><ChevronsLeft size={15} /></PagerButton>
          <PagerButton label="Previous page" onClick={() => onPageChange(pageIndex - 1)} disabled={!canPrevious}><ChevronLeft size={15} /></PagerButton>
          <span className="min-w-[4.5rem] px-1 text-center font-semibold tabular-nums text-gray-700">Page {pageIndex + 1} of {pageCount}</span>
          <PagerButton label="Next page" onClick={() => onPageChange(pageIndex + 1)} disabled={!canNext}><ChevronRight size={15} /></PagerButton>
          <PagerButton label="Last page" className="max-sm:hidden" onClick={() => onPageChange(pageCount - 1)} disabled={!canNext}><ChevronsRight size={15} /></PagerButton>
        </div>
      </div>
    </div>
  );
}

/** Pager bound to a TanStack table, for grid views that share the list view's paging state. */
export function TablePager<T>({ table, totalLabel, pageSizeOptions, variant, className }: {
  table: Table<T>;
  totalLabel?: string;
  pageSizeOptions?: number[];
  variant?: PagerProps['variant'];
  className?: string;
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getPrePaginationRowModel().rows.length;
  if (total === 0) return null;
  return (
    <Pager
      pageIndex={pageIndex}
      pageSize={pageSize}
      total={total}
      onPageChange={(index) => table.setPageIndex(index)}
      onPageSizeChange={(size) => table.setPageSize(size)}
      totalLabel={totalLabel}
      pageSizeOptions={pageSizeOptions}
      variant={variant}
      className={className}
    />
  );
}

function PagerButton({ label, onClick, disabled, children, className = '' }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-white ${className}`}
    >
      {children}
    </button>
  );
}
