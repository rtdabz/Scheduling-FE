import type { KeyboardEvent, ReactNode } from 'react';
import {
  flexRender,
  type Column,
  type RowData,
  type Table,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import Skeleton from './Skeleton';

declare module '@tanstack/react-table' {
  // Presentation hints read by DataTable; TanStack itself ignores them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'center' | 'right';
    headerClassName?: string;
    cellClassName?: string;
    /**
     * Clicks inside this cell do not reach onRowClick -- for checkboxes and
     * action buttons in a clickable row.
     */
    stopRowClick?: boolean;
  }
}

export interface DataTableProps<T> {
  table: Table<T>;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  /** Replaces the default empty title/description block entirely. */
  emptyState?: ReactNode;
  totalLabel?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, index: number) => string;
  cellClassName?: (columnId: string) => string;
  loadingRows?: number;
  /** Outer wrapper classes. */
  className?: string;
  /** Classes for the scrolling region, e.g. a max height for sticky headers. */
  scrollClassName?: string;
  /** Classes for the table element, e.g. a min width. */
  tableClassName?: string;
  /** `card` draws its own bordered surface; `embedded` sits inside one. */
  variant?: 'card' | 'embedded';
  density?: 'comfortable' | 'compact';
  /**
   * Show the pager. Defaults to whether the table was given a pagination
   * row model, so a table built without one never shows a pager.
   */
  showPagination?: boolean;
  pageSizeOptions?: number[];
  ariaLabel?: string;
  /** Id on the header row group, for guided tours that point at it. */
  headerId?: string;
  /** Extra data attributes per row, e.g. `data-tour` targets. */
  getRowAttributes?: (row: T) => Record<`data-${string}`, string | undefined>;
}

const alignClass = (align?: 'left' | 'center' | 'right') =>
  align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

const justifyClass = (align?: 'left' | 'center' | 'right') =>
  align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

const headerLabel = <T,>(column: Column<T, unknown>) => {
  const header = column.columnDef.header;
  return typeof header === 'string' && header ? header : column.id;
};

/** Shared accessible table surface for every interactive WICARS table. */
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
  tableClassName = '',
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

  const headPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  const cellPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  const surface = variant === 'card'
    ? 'overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'
    : 'bg-white';

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (!onRowClick || event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row);
    }
  };

  return (
    <div className={`${surface} ${className}`}>
      {/* A caller's own overflow replaces the default, so a table inside an
          already-scrolling panel keeps its header sticky to that panel. */}
      <div className={`${scrollClassName.includes('overflow-') ? '' : 'overflow-x-auto'} ${scrollClassName}`}>
        <table className={`w-full min-w-full border-collapse text-left ${tableClassName}`} aria-label={ariaLabel} aria-busy={isLoading || undefined}>
          <thead id={headerId} className="sticky top-0 z-10 bg-gray-50/95">
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
                      className={`whitespace-nowrap ${headPad} text-[10px] font-extrabold uppercase tracking-wider text-gray-500 ${alignClass(meta?.align)} ${meta?.headerClassName ?? ''}`}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={`Sort by ${headerLabel(header.column)}`}
                          className={`group -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wider transition hover:bg-gray-200/70 hover:text-gray-800 ${justifyClass(meta?.align)}`}
                        >
                          {content}
                          {sorted === 'asc'
                            ? <ArrowUp size={12} className="text-[#C9952A]" />
                            : sorted === 'desc'
                              ? <ArrowDown size={12} className="text-[#C9952A]" />
                              : <ArrowUpDown size={12} className="text-gray-300 group-hover:text-gray-500" />}
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
              <tr key={`table-skeleton-${index}`} className={density === 'compact' ? 'h-10' : 'h-14'}>
                {columns.map((column) => (
                  <td key={column.id} className={cellPad}><Skeleton className="h-4 w-3/4" /></td>
                ))}
              </tr>
            )) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={`px-6 text-center ${density === 'compact' ? 'py-6' : 'py-14'}`}>
                  {emptyState ?? (
                    <>
                      <p className="text-sm font-bold text-gray-700">{emptyTitle}</p>
                      {emptyDescription && <p className="mt-1 text-xs text-gray-400">{emptyDescription}</p>}
                    </>
                  )}
                </td>
              </tr>
            ) : rows.map((row, index) => (
              <tr
                key={row.id}
                {...getRowAttributes?.(row.original)}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={onRowClick ? (event) => handleRowKeyDown(event, row.original) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={`group ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} transition-colors hover:bg-[#5A1220]/[0.04] ${onRowClick ? 'cursor-pointer focus:outline-none focus-visible:bg-[#5A1220]/[0.06]' : ''} ${rowClassName?.(row.original, index) ?? ''}`}
              >
                {row.getVisibleCells().map((cell, cellIndex) => {
                  const meta = cell.column.columnDef.meta;
                  return (
                    <td
                      key={cell.id}
                      onClick={meta?.stopRowClick ? (event) => event.stopPropagation() : undefined}
                      onKeyDown={meta?.stopRowClick ? (event) => event.stopPropagation() : undefined}
                      className={`${cellPad} align-middle text-xs font-semibold text-gray-700 ${alignClass(meta?.align)} ${meta?.cellClassName ?? ''} ${cellClassName?.(cell.column.id) ?? ''} ${cellIndex === 0 ? 'relative' : ''}`}
                    >
                      {cellIndex === 0 && (
                        <div className="absolute left-0 top-0 bottom-0 w-[2.5px] bg-[#C9952A] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      )}
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {hasFooter && !isLoading && (
            <tfoot className="border-t border-gray-200 bg-gray-50/70">
              {table.getFooterGroups().map((footerGroup) => (
                <tr key={footerGroup.id}>
                  {footerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    return (
                      <td
                        key={header.id}
                        colSpan={header.colSpan}
                        className={`${cellPad} text-xs font-bold text-gray-700 ${alignClass(meta?.align)} ${meta?.cellClassName ?? ''}`}
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
        <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row">
          <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
            <span>Showing <span className="font-bold text-gray-700">{start}-{end}</span> of <span className="font-bold text-gray-700">{total}</span> {totalLabel}</span>
            <label className="flex items-center gap-1.5">Rows
              <select aria-label="Rows per page" value={pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))} className="rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-xs">
                {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1">
            <PagerButton label="First page" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}><ChevronsLeft size={15} /></PagerButton>
            <PagerButton label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><ChevronLeft size={15} /></PagerButton>
            <span className="px-2 text-xs font-bold tabular-nums text-gray-500">{pageIndex + 1} / {table.getPageCount() || 1}</span>
            <PagerButton label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><ChevronRight size={15} /></PagerButton>
            <PagerButton label="Last page" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}><ChevronsRight size={15} /></PagerButton>
          </div>
        </div>
      )}
    </div>
  );
}

function PagerButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
