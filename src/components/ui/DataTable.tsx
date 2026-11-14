import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import {
  flexRender,
  type Column,
  type RowData,
  type Table,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox } from 'lucide-react';
import Skeleton from './Skeleton';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'center' | 'right';
    headerClassName?: string;
    cellClassName?: string;
    stopRowClick?: boolean;
    /** Keep the cell on one line and cut long text with an ellipsis; the full value shows on hover. */
    truncate?: boolean;
    /** Limit the cell to this many lines; the full value shows on hover. */
    clamp?: 2 | 3;
    /** Hide the column below this breakpoint so narrow screens keep the essential columns. */
    hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
  }
}

export interface DataTableProps<T> {
  table: Table<T>;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyState?: ReactNode;
  totalLabel?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, index: number) => string;
  cellClassName?: (columnId: string) => string;
  loadingRows?: number;
  className?: string;
  scrollClassName?: string;
  scrollAriaLabel?: string;
  tableClassName?: string;
  tableId?: string;
  variant?: 'card' | 'embedded';
  density?: 'comfortable' | 'compact';
  showPagination?: boolean;
  pageSizeOptions?: number[];
  ariaLabel?: string;
  headerId?: string;
  getRowAttributes?: (row: T) => Record<`data-${string}`, string | undefined>;
}

const alignClass = (align?: 'left' | 'center' | 'right') =>
  align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

const justifyClass = (align?: 'left' | 'center' | 'right') =>
  align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

const HIDE_BELOW = {
  sm: 'max-sm:hidden',
  md: 'max-md:hidden',
  lg: 'max-lg:hidden',
  xl: 'max-xl:hidden',
} as const;

const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="tab"], [contenteditable="true"]';

const SKELETON_WIDTHS =['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-3/5'];

const plainText = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;

const headerLabel = <T,>(column: Column<T, unknown>) => {
  const header = column.columnDef.header;
  return typeof header === 'string' && header ? header : column.id;
};

export default function DataTable<T>({
  table,
  isLoading = false,
  emptyTitle = 'No records found.',
  emptyDescription = 'Try adjusting your filters or search criteria.',
  emptyState,
  totalLabel = 'records',
  onRowClick,
  rowClassName,
  cellClassName,
  loadingRows = 6,
  className = '',
  scrollClassName = '',
  scrollAriaLabel,
  tableClassName = '',
  tableId,
  variant = 'card',
  density = 'comfortable',
  showPagination,
  pageSizeOptions = [10, 25, 50],
  ariaLabel,
  headerId,
  getRowAttributes,
}: DataTableProps<T>) {
  const rows = table.getRowModel().rows;
  const columns = table.getVisibleLeafColumns();
  const paginated = showPagination ?? Boolean(table.options.getPaginationRowModel);
  const total = table.getPrePaginationRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const start = total === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, total);
  const hasFooter = columns.some((column) => column.columnDef.footer !== undefined);
  const pageCount = table.getPageCount() || 1;
  const sizeOptions = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  const compact = density === 'compact';
  const headPad = compact ? 'px-3 py-2' : 'px-4 py-2.5';
  const cellPad = compact ? 'px-3 py-2' : 'px-4 py-3';
  const rowHeight = compact ? 'h-10' : 'h-[52px]';
  const surface = variant === 'card'
    ? 'overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'
    : 'bg-white';

  const handleRowClick = (event: MouseEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick) return;
    const target = event.target as Element | null;
    // React bubbles events from portaled modals through the row; only react to clicks inside the row itself.
    if (!target || !event.currentTarget.contains(target)) return;
    // Buttons, links and form controls in a row keep their own behaviour.
    const interactive = target.closest(INTERACTIVE_SELECTOR);
    if (interactive && interactive !== event.currentTarget && event.currentTarget.contains(interactive)) return;
    // Selecting text to copy should not navigate away.
    if (window.getSelection()?.toString()) return;
    onRowClick(row);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick || event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  };

  return (
    <div className={`${surface} ${className}`}>
      <div role={scrollAriaLabel ? 'region' : undefined} aria-label={scrollAriaLabel} tabIndex={scrollAriaLabel ? 0 : undefined} className={`${scrollClassName.includes('overflow-') ? '' : 'max-lg:overflow-x-auto'} ${scrollClassName}`}>
        <table id={tableId} className={`w-full min-w-full border-collapse text-left ${tableClassName}`} aria-label={ariaLabel} aria-busy={isLoading || undefined}>
          <thead id={headerId} className="sticky top-0 z-10 bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-gray-200">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  const sorted = header.column.getIsSorted();
                  const canSort = header.column.getCanSort();
                  const content = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      colSpan={header.colSpan}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : canSort ? 'none' : undefined}
                      style={header.column.columnDef.size !== undefined ? { width: header.getSize() } : undefined}
                      className={`${headPad} text-[11px] font-semibold uppercase tracking-wide text-gray-500 ${alignClass(meta?.align)} ${meta?.hideBelow ? HIDE_BELOW[meta.hideBelow] : ''} ${meta?.headerClassName ?? ''}`}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={`Sort by ${headerLabel(header.column)}`}
                          className={`group/sort -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 font-semibold uppercase tracking-wide transition-colors hover:!text-[#F5C842] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9952A]/60 ${sorted ? '!text-[#F5C842]' : ''} ${justifyClass(meta?.align)}`}
                        >
                          {content}
                          {sorted === 'asc'
                            ? <ArrowUp size={12} aria-hidden="true" className="shrink-0 text-[#C9952A]" />
                            : sorted === 'desc'
                              ? <ArrowDown size={12} aria-hidden="true" className="shrink-0 text-[#C9952A]" />
                              : <ArrowUpDown size={12} aria-hidden="true" className="shrink-0 text-white/50 group-hover/sort:text-[#F5C842]" />}
                        </button>
                      ) : content}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? Array.from({ length: loadingRows }).map((_, index) => (
              <tr key={`table-skeleton-${index}`} className={rowHeight}>
                {columns.map((column, columnIndex) => {
                  const meta = column.columnDef.meta;
                  return (
                    <td key={column.id} className={`${cellPad} ${meta?.hideBelow ? HIDE_BELOW[meta.hideBelow] : ''} ${meta?.cellClassName ?? ''}`}>
                      <Skeleton className={`h-3.5 ${SKELETON_WIDTHS[(index + columnIndex) % SKELETON_WIDTHS.length]}`} />
                    </td>
                  );
                })}
              </tr>
            )) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={`px-6 text-center ${compact ? 'py-8' : 'py-14'}`}>
                  {emptyState ?? (
                    <div className="mx-auto flex max-w-sm flex-col items-center">
                      {!compact && (
                        <span aria-hidden="true" className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                          <Inbox size={18} />
                        </span>
                      )}
                      <p className="text-sm font-semibold text-gray-800">{emptyTitle}</p>
                      {emptyDescription && <p className="mt-1 text-xs font-medium text-gray-500">{emptyDescription}</p>}
                    </div>
                  )}
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <tr
                key={row.id}
                {...getRowAttributes?.(row.original)}
                onClick={onRowClick ? (event) => handleRowClick(event, row.original) : undefined}
                onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row.original) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={`group ${rowHeight} transition-colors hover:bg-gray-50 ${onRowClick ? 'cursor-pointer focus:outline-none focus-visible:bg-[#5A1220]/[0.05]' : ''} ${rowClassName?.(row.original, index) ?? ''}`}
              >
                {row.getVisibleCells().map((cell, cellIndex) => {
                  const meta = cell.column.columnDef.meta;
                  const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                  const fullText = meta?.truncate || meta?.clamp ? plainText(cell.getValue()) : undefined;
                  const accent = cellIndex === 0 && Boolean(onRowClick);
                  return (
                    <td
                      key={cell.id}
                      onClick={meta?.stopRowClick ? (event) => event.stopPropagation() : undefined}
                      onKeyDown={meta?.stopRowClick ? (event) => event.stopPropagation() : undefined}
                      className={`break-words ${cellPad} align-middle [&_.rounded-full]:whitespace-nowrap text-xs font-medium text-gray-700 ${meta?.truncate ? 'max-w-[18rem]' : ''} ${alignClass(meta?.align)} ${meta?.hideBelow ? HIDE_BELOW[meta.hideBelow] : ''} ${meta?.cellClassName ?? ''} ${cellClassName?.(cell.column.id) ?? ''} ${accent ? 'relative' : ''}`}
                    >
                      {accent && (
                        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 top-0 w-0.5 bg-[#C9952A] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                      )}
                      {meta?.truncate
                        ? <div className="truncate" title={fullText}>{content}</div>
                        : meta?.clamp
                          ? <div className={meta.clamp === 3 ? 'line-clamp-3' : 'line-clamp-2'} title={fullText}>{content}</div>
                          : content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {hasFooter && !isLoading && (
            <tfoot className="border-t border-gray-200 bg-gray-50">
              {table.getFooterGroups().map((footerGroup) => (
                <tr key={footerGroup.id}>
                  {footerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    return (
                      <td
                        key={header.id}
                        colSpan={header.colSpan}
                        className={`${cellPad} text-xs font-semibold text-gray-800 ${alignClass(meta?.align)} ${meta?.hideBelow ? HIDE_BELOW[meta.hideBelow] : ''} ${meta?.cellClassName ?? ''}`}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.footer, header.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      {paginated && !isLoading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-gray-200 px-4 py-2.5 text-xs font-medium text-gray-500">
          <span className="tabular-nums">
            Showing <span className="font-semibold text-gray-800">{start}-{end}</span> of <span className="font-semibold text-gray-800">{total}</span> {totalLabel}
          </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <span className="max-sm:sr-only">Rows per page</span>
                <select
                  aria-label="Rows per page"
                  value={pageSize}
                  onChange={(event) => table.setPageSize(Number(event.target.value))}
                  className="h-8 cursor-pointer rounded-lg border border-gray-200 bg-white pl-2 pr-1 text-xs font-semibold text-gray-700 outline-none transition-colors hover:border-gray-300 focus:border-[#5A1220] focus:ring-1 focus:ring-[#5A1220]"
                >
                  {sizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <PagerButton label="First page" className="max-sm:hidden" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}><ChevronsLeft size={15} /></PagerButton>
                <PagerButton label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft size={15} /></PagerButton>
                <span className="min-w-[4.5rem] px-1 text-center font-semibold tabular-nums text-gray-700">Page {pageIndex + 1} of {pageCount}</span>
                <PagerButton label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight size={15} /></PagerButton>
                <PagerButton label="Last page" className="max-sm:hidden" onClick={() => table.setPageIndex(pageCount - 1)} disabled={!table.getCanNextPage()}><ChevronsRight size={15} /></PagerButton>
              </div>
            </div>
        </div>
      )}
    </div>
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
