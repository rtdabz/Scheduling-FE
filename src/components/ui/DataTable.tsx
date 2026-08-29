import {
  flexRender,
  type Table,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Skeleton from './Skeleton';

export interface DataTableProps<T> {
  table: Table<T>;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  totalLabel?: string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, index: number) => string;
  cellClassName?: (columnId: string) => string;
  loadingRows?: number;
  className?: string;
}

/** Shared accessible table surface for all data-heavy WICARS screens. */
export default function DataTable<T>({
  table,
  isLoading = false,
  emptyTitle = 'No records found.',
  emptyDescription = 'Try adjusting your filters or search criteria.',
  totalLabel = 'records',
  onRowClick,
  rowClassName,
  cellClassName,
  loadingRows = 6,
  className = '',
}: DataTableProps<T>) {
  const rows = table.getRowModel().rows;
  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = table.getState().pagination;
  const start = total === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <div className={`overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-gray-200">
                {headerGroup.headers.map(header => (
                  <th key={header.id} scope="col" className="whitespace-nowrap px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-gray-500">
                    {header.isPlaceholder ? null : (
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <button
                            type="button"
                            aria-label={`Sort by ${String(header.column.columnDef.header ?? header.id)}`}
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex rounded p-0.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                          >
                            {header.column.getIsSorted() === 'asc' ? <ArrowUp size={13} className="text-[#C9952A]" /> : header.column.getIsSorted() === 'desc' ? <ArrowDown size={13} className="text-[#C9952A]" /> : <ArrowUpDown size={13} />}
                          </button>
                        )}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? Array.from({ length: loadingRows }).map((_, index) => (
              <tr key={`table-skeleton-${index}`} className="h-14">
                {table.getVisibleLeafColumns().map(column => (
                  <td key={column.id} className="px-4 py-3"><Skeleton className="h-4 w-3/4" /></td>
                ))}
              </tr>
            )) : rows.length === 0 ? (
              <tr><td colSpan={table.getVisibleLeafColumns().length} className="px-6 py-16 text-center">
                <p className="text-sm font-bold text-gray-700">{emptyTitle}</p>
                <p className="mt-1 text-xs text-gray-400">{emptyDescription}</p>
              </td></tr>
            ) : rows.map((row, index) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} transition-colors hover:bg-[#5A1220]/5 ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row.original, index) ?? ''}`}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className={`px-4 py-3 align-middle text-xs font-semibold text-gray-700 ${cellClassName?.(cell.column.id) ?? ''}`}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row">
          <div className="flex items-center gap-3 text-xs font-semibold text-gray-500">
            <span>Showing {start}-{end} of {total} {totalLabel}</span>
            <label className="flex items-center gap-1.5">Rows
              <select aria-label="Rows per page" value={pageSize} onChange={event => table.setPageSize(Number(event.target.value))} className="rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-xs">
                {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="rounded-lg border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={15} /></button>
            <span className="px-2 text-xs font-bold text-gray-500">{pageIndex + 1} / {table.getPageCount() || 1}</span>
            <button type="button" aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="rounded-lg border border-gray-200 p-1.5 text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
